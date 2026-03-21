// supabase/functions/generate-invoice/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function toWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  if (num === 0) return 'Zero'
  const convert = (n: number): string => {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '')
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '')
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '')
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '')
  }
  const rupees = Math.floor(num)
  const paise = Math.round((num - rupees) * 100)
  let result = convert(rupees)
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise'
  return result + ' Only'
}

// Convert mm to points (pdf-lib uses points)
const mm = (v: number) => v * 72 / 25.4
const PAGE_H = 841.89  // A4 height in points
// Convert y from top (mm, like jsPDF) to pdf-lib y from bottom (points)
const py = (yMm: number) => PAGE_H - mm(yMm)

// Wrap text to fit within maxWidthMm
function wrapText(text: string, font: any, size: number, maxWidthMm: number): string[] {
  const maxWidthPt = mm(maxWidthMm)
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(test, size) <= maxWidthPt) {
      current = test
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : [text]
}

async function buildInvoicePdf(data: {
  supplier: any, buyer: any, invoice: any, lineItems: any[], settings: any
}): Promise<Uint8Array> {
  const { supplier, buyer, invoice, lineItems, settings } = data
  const isInterState = invoice.is_inter_state

  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const page = pdfDoc.addPage([595.28, PAGE_H])

  // Embed Noto Sans TTF fonts for Unicode support (₹ symbol etc.)
  const [regularFontBytes, boldFontBytes] = await Promise.all([
    fetch('https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf').then(r => r.arrayBuffer()),
    fetch('https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf').then(r => r.arrayBuffer()),
  ])
  const fontNormal = await pdfDoc.embedFont(regularFontBytes, { subset: true })
  const fontBold = await pdfDoc.embedFont(boldFontBytes, { subset: true })

  const dark = rgb(26/255, 31/255, 46/255)
  const grey = rgb(100/255, 110/255, 130/255)
  const lightGrey = rgb(247/255, 248/255, 250/255)
  const white = rgb(1, 1, 1)
  const midGrey = rgb(220/255, 225/255, 235/255)
  const lightBg = rgb(240/255, 242/255, 248/255)

  const W = 210       // mm
  const margin = 14   // mm
  const contentW = W - margin * 2  // mm
  let y = margin      // mm, top-down (like jsPDF)

  // Draw text with optional right/center alignment
  const drawText = (
    text: string,
    xMm: number,
    yMm: number,
    options: { font?: any; size?: number; color?: any; align?: 'left' | 'right' | 'center' } = {}
  ) => {
    const { font = fontNormal, size = 8, color = dark, align = 'left' } = options
    const textWidth = font.widthOfTextAtSize(text, size)
    let x = mm(xMm)
    if (align === 'right') x = mm(xMm) - textWidth
    else if (align === 'center') x = mm(xMm) - textWidth / 2
    page.drawText(text, { x, y: py(yMm), size, font, color })
  }

  // Draw filled rectangle (y is top in mm, like jsPDF)
  const drawRect = (xMm: number, yMm: number, wMm: number, hMm: number, fillColor: any) => {
    page.drawRectangle({
      x: mm(xMm),
      y: py(yMm + hMm),  // pdf-lib y is bottom-left
      width: mm(wMm),
      height: mm(hMm),
      color: fillColor,
      borderWidth: 0,
    })
  }

  // Draw line (y in mm from top)
  const drawLine = (x1Mm: number, y1Mm: number, x2Mm: number, y2Mm: number, thicknessMm: number, color: any) => {
    page.drawLine({
      start: { x: mm(x1Mm), y: py(y1Mm) },
      end: { x: mm(x2Mm), y: py(y2Mm) },
      thickness: mm(thicknessMm),
      color,
    })
  }

  // Logo
  if (settings?.logo_url) {
    try {
      const resp = await fetch(settings.logo_url)
      if (resp.ok) {
        const imgBytes = new Uint8Array(await resp.arrayBuffer())
        const ext = (settings.logo_url.match(/\.(png|jpg|jpeg)/i)?.[1] || 'png').toLowerCase()
        const img = ext === 'png' ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)
        // drawImage y is bottom-left: top=y, height=14 → bottom=y+14
        page.drawImage(img, { x: mm(margin), y: py(y + 14), width: mm(28), height: mm(14) })
      }
    } catch (_) {}
  }

  // Supplier info
  const headerLeftX = settings?.logo_url ? margin + 32 : margin
  drawText(supplier.business_name, headerLeftX, y + 5, { font: fontBold, size: 14, color: dark })

  let infoY = y + 10
  if (supplier.gst_number) { drawText(`GSTIN: ${supplier.gst_number}`, headerLeftX, infoY, { size: 8, color: grey }); infoY += 4 }
  if (supplier.phone) { drawText(supplier.phone, headerLeftX, infoY, { size: 8, color: grey }); infoY += 4 }
  if (supplier.business_address) {
    const lines = wrapText(supplier.business_address, fontNormal, 8, 90)
    lines.forEach((line: string) => { drawText(line, headerLeftX, infoY, { size: 8, color: grey }); infoY += 4 })
  }

  // TAX INVOICE label (right-aligned)
  drawText('TAX INVOICE', W - margin, y + 5, { font: fontBold, size: 16, color: dark, align: 'right' })

  y = Math.max(infoY, y + 20) + 4

  // Divider
  drawLine(margin, y, W - margin, y, 0.5, dark)
  y += 5

  // Invoice meta
  drawText('INVOICE NO.',   margin,       y, { font: fontBold, size: 7, color: grey })
  drawText('INVOICE DATE',  margin + 50,  y, { font: fontBold, size: 7, color: grey })
  if (invoice.due_date) drawText('DUE DATE', margin + 100, y, { font: fontBold, size: 7, color: grey })

  y += 4
  drawText(invoice.invoice_number,          margin,       y, { font: fontBold, size: 10, color: dark })
  drawText(formatDate(invoice.invoice_date), margin + 50,  y, { font: fontBold, size: 10, color: dark })
  if (invoice.due_date) drawText(formatDate(invoice.due_date), margin + 100, y, { font: fontBold, size: 10, color: dark })
  y += 7

  drawLine(margin, y, W - margin, y, 0.3, midGrey)
  y += 5

  // Bill To / Ship To
  const colW = (contentW - 6) / 2
  const boxH = 30

  // Bill To
  drawRect(margin, y, colW, boxH, lightGrey)
  drawText('BILL TO', margin + 4, y + 5, { font: fontBold, size: 7, color: grey })
  drawText(buyer.business_name, margin + 4, y + 10, { font: fontBold, size: 10, color: dark })
  let byY = y + 15
  if (buyer.business_address) {
    const lines = wrapText(buyer.business_address, fontNormal, 7.5, colW - 8)
    lines.slice(0, 2).forEach((l: string) => { drawText(l, margin + 4, byY, { size: 7.5, color: grey }); byY += 3.5 })
  }
  if (buyer.phone) { drawText(`Mobile: ${buyer.phone}`, margin + 4, byY, { size: 7.5, color: grey }); byY += 3.5 }
  if (buyer.gst_number) drawText(`GSTIN: ${buyer.gst_number}`, margin + 4, byY, { size: 7.5, color: grey })

  // Ship To
  const shipX = margin + colW + 6
  drawRect(shipX, y, colW, boxH, lightGrey)
  drawText('SHIP TO', shipX + 4, y + 5, { font: fontBold, size: 7, color: grey })
  drawText(buyer.business_name, shipX + 4, y + 10, { font: fontBold, size: 10, color: dark })
  let syY = y + 15
  if (buyer.business_address) {
    const lines = wrapText(buyer.business_address, fontNormal, 7.5, colW - 8)
    lines.slice(0, 2).forEach((l: string) => { drawText(l, shipX + 4, syY, { size: 7.5, color: grey }); syY += 3.5 })
  }
  if (invoice.place_of_supply) drawText(`Place of Supply: ${invoice.place_of_supply}`, shipX + 4, syY, { size: 7.5, color: grey })

  y += boxH + 6

  // Line items table
  const cols = {
    no:    { x: margin,       w: 8 },
    item:  { x: margin + 8,   w: 72 },
    qty:   { x: margin + 80,  w: 18 },
    rate:  { x: margin + 98,  w: 26 },
    tax:   { x: margin + 124, w: 26 },
    total: { x: margin + 150, w: contentW - 150 },
  }

  // Table header
  drawRect(margin, y, contentW, 7, dark)
  drawText('NO',    cols.no.x + 1,              y + 4.5, { font: fontBold, size: 7, color: white })
  drawText('ITEMS', cols.item.x + 1,            y + 4.5, { font: fontBold, size: 7, color: white })
  drawText('QTY',   cols.qty.x + 1,             y + 4.5, { font: fontBold, size: 7, color: white })
  drawText('RATE',  cols.rate.x + cols.rate.w,  y + 4.5, { font: fontBold, size: 7, color: white, align: 'right' })
  drawText('TAX',   cols.tax.x + cols.tax.w,    y + 4.5, { font: fontBold, size: 7, color: white, align: 'right' })
  drawText('TOTAL', cols.total.x + cols.total.w,y + 4.5, { font: fontBold, size: 7, color: white, align: 'right' })
  y += 7

  let totalQty = 0
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i]
    totalQty += Number(item.quantity)
    const rowBg = i % 2 === 0 ? white : lightGrey
    const rowH = item.hsn_code ? 10 : 7

    drawRect(margin, y, contentW, rowH, rowBg)
    drawLine(margin, y + rowH, margin + contentW, y + rowH, 0.2, midGrey)

    drawText(String(i + 1), cols.no.x + 1, y + 5, { size: 8, color: grey })
    drawText(item.name, cols.item.x + 1, y + 5, { font: fontBold, size: 8, color: dark })
    if (item.hsn_code) {
      drawText(`HSN: ${item.hsn_code}`, cols.item.x + 1, y + 8.5, { size: 7, color: grey })
    }
    drawText(String(item.quantity), cols.qty.x + 1, y + 5, { size: 8, color: dark })
    drawText(Number(item.rate).toLocaleString('en-IN'),        cols.rate.x + cols.rate.w,   y + 5,   { size: 8, color: dark, align: 'right' })
    drawText(Number(item.tax_amount).toLocaleString('en-IN'),  cols.tax.x + cols.tax.w,     y + 5,   { size: 8, color: grey, align: 'right' })
    drawText(`(${item.tax_rate}%)`,                            cols.tax.x + cols.tax.w,     y + 8.5, { size: 6.5, color: grey, align: 'right' })
    drawText(Number(item.total_amount).toLocaleString('en-IN'),cols.total.x + cols.total.w, y + 5,   { font: fontBold, size: 8, color: dark, align: 'right' })

    y += rowH
  }

  // Subtotal row
  drawRect(margin, y, contentW, 7, lightBg)
  drawText('SUBTOTAL', cols.item.x + cols.item.w, y + 4.5, { font: fontBold, size: 8, color: grey, align: 'right' })
  drawText(String(totalQty), cols.qty.x + 1, y + 4.5, { font: fontBold, size: 8, color: dark })
  const taxTotal = Number(invoice.total_amount) - Number(invoice.taxable_amount)
  drawText(taxTotal.toLocaleString('en-IN'),                cols.tax.x + cols.tax.w,     y + 4.5, { font: fontBold, size: 8, color: dark, align: 'right' })
  drawText(Number(invoice.total_amount).toLocaleString('en-IN'), cols.total.x + cols.total.w, y + 4.5, { font: fontBold, size: 8, color: dark, align: 'right' })
  y += 10

  // Footer: Terms+Bank left | Tax summary right
  const footerY = y
  const leftColW = contentW * 0.52
  const rightColW = contentW * 0.44
  const rightColX = margin + contentW - rightColW

  let leftY = footerY
  if (settings?.terms_and_conditions) {
    drawText('TERMS & CONDITIONS', margin, leftY, { font: fontBold, size: 7, color: grey })
    leftY += 4
    const termLines = wrapText(settings.terms_and_conditions, fontNormal, 7.5, leftColW)
    termLines.forEach((line: string) => { drawText(line, margin, leftY, { size: 7.5, color: dark }); leftY += 3.5 })
    leftY += 3
  }

  if (settings?.bank_account_number || settings?.upi_id) {
    drawText('BANK DETAILS', margin, leftY, { font: fontBold, size: 7, color: grey })
    leftY += 4
    const bankLines: string[] = []
    if (settings.bank_account_name) bankLines.push(`Name: ${settings.bank_account_name}`)
    if (settings.bank_ifsc) bankLines.push(`IFSC: ${settings.bank_ifsc}`)
    if (settings.bank_account_number) bankLines.push(`Account No: ${settings.bank_account_number}`)
    if (settings.bank_name) bankLines.push(`Bank: ${settings.bank_name}`)
    if (settings.upi_id) bankLines.push(`UPI ID: ${settings.upi_id}`)
    bankLines.forEach(line => { drawText(line, margin, leftY, { size: 7.5, color: dark }); leftY += 3.5 })
  }

  // Tax summary (right column)
  let rightY = footerY
  const valueX = rightColX + rightColW

  const summaryRow = (label: string, value: string, bold = false) => {
    drawText(label, rightColX, rightY, { font: bold ? fontBold : fontNormal, size: bold ? 9 : 8, color: bold ? dark : grey })
    drawText(value, valueX, rightY, { font: bold ? fontBold : fontNormal, size: bold ? 9 : 8, color: dark, align: 'right' })
    rightY += bold ? 6 : 5
  }

  summaryRow('Taxable Amount', formatCurrency(Number(invoice.taxable_amount)))

  if (isInterState) {
    const igst = Number(invoice.total_igst)
    if (igst > 0) {
      const rate = lineItems[0]?.tax_rate || 0
      summaryRow(`IGST @${rate}%`, formatCurrency(igst))
    }
  } else {
    const cgst = Number(invoice.total_cgst)
    const sgst = Number(invoice.total_sgst)
    if (cgst > 0) {
      const rate = (lineItems[0]?.tax_rate || 0) / 2
      summaryRow(`CGST @${rate}%`, formatCurrency(cgst))
    }
    if (sgst > 0) {
      const rate = (lineItems[0]?.tax_rate || 0) / 2
      summaryRow(`SGST @${rate}%`, formatCurrency(sgst))
    }
  }

  drawLine(rightColX, rightY - 1, valueX, rightY - 1, 0.4, dark)
  rightY += 1
  summaryRow('Total Amount', formatCurrency(Number(invoice.total_amount)), true)
  summaryRow('Received Amount', formatCurrency(0))

  // Amount in words box
  rightY += 2
  drawRect(rightColX, rightY, rightColW, 14, lightGrey)
  drawText('TOTAL AMOUNT (IN WORDS)', rightColX + 3, rightY + 4, { font: fontBold, size: 6.5, color: grey })
  const words = toWords(Number(invoice.total_amount))
  const wordLines = wrapText(words, fontNormal, 7, rightColW - 6)
  wordLines.slice(0, 2).forEach((line: string, i: number) => {
    drawText(line, rightColX + 3, rightY + 8 + i * 3.5, { size: 7, color: dark })
  })

  // Signature section
  const sigY = Math.max(leftY, rightY + 18) + 6
  drawLine(margin, sigY, W - margin, sigY, 0.3, midGrey)

  const sigBoxX = W - margin - 40
  if (settings?.signature_url) {
    try {
      const resp = await fetch(settings.signature_url)
      if (resp.ok) {
        const imgBytes = new Uint8Array(await resp.arrayBuffer())
        const ext = (settings.signature_url.match(/\.(png|jpg|jpeg)/i)?.[1] || 'png').toLowerCase()
        const img = ext === 'png' ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)
        // top=sigY+3, height=12 → bottom=sigY+15
        page.drawImage(img, { x: mm(sigBoxX), y: py(sigY + 3 + 12), width: mm(30), height: mm(12) })
      }
    } catch (_) {}
  }

  drawLine(sigBoxX, sigY + 18, sigBoxX + 40, sigY + 18, 0.3, dark)
  drawText('Signature',           sigBoxX + 20, sigY + 22, { font: fontBold, size: 7.5, color: dark, align: 'center' })
  drawText(supplier.business_name, sigBoxX + 20, sigY + 26, { size: 7, color: grey, align: 'center' })

  // pdfDoc.save() returns Uint8Array directly — no .output() needed
  return pdfDoc.save()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { invoice_id, businessId } = await req.json()
    if (!invoice_id || !businessId) {
      return new Response(JSON.stringify({ error: 'invoice_id and businessId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: invoice, error: invError } = await supabase
      .from('invoices').select('*').eq('id', invoice_id).single()

    if (invError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (invoice.supplier_business_entity_id !== businessId) {
      return new Response(JSON.stringify({ error: 'Only the supplier can generate this invoice' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [lineItemsResult, supplierResult, buyerResult, settingsResult] = await Promise.all([
      supabase.from('invoice_line_items').select('*').eq('invoice_id', invoice_id).order('sort_order'),
      supabase.from('business_entities').select('*').eq('id', invoice.supplier_business_entity_id).single(),
      supabase.from('business_entities').select('*').eq('id', invoice.buyer_business_entity_id).single(),
      supabase.from('invoice_settings').select('*').eq('business_entity_id', invoice.supplier_business_entity_id).maybeSingle(),
    ])

    const lineItems = lineItemsResult.data || []
    const supplier = supplierResult.data
    const buyer = buyerResult.data
    const settings = settingsResult.data

    if (!supplier || !buyer) {
      return new Response(JSON.stringify({ error: 'Business entities not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const pdfBytes = await buildInvoicePdf({ supplier, buyer, invoice, lineItems, settings })

    const storagePath = `${invoice.supplier_business_entity_id}/${invoice_id}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(JSON.stringify({ error: 'Failed to upload PDF' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await supabase.from('invoices')
      .update({ pdf_url: storagePath, status: 'generated' })
      .eq('id', invoice_id)

    const { data: order } = await supabase
      .from('orders').select('connection_id').eq('id', invoice.order_id).single()

    if (order) {
      const dueDateStr = invoice.due_date ? ` · Due ${formatDate(invoice.due_date)}` : ''
      await supabase.from('notifications').insert([{
        recipient_business_id: invoice.buyer_business_entity_id,
        type: 'OrderPlaced',
        related_entity_id: invoice_id,
        connection_id: order.connection_id,
        message: `${supplier.business_name} sent you invoice ${invoice.invoice_number} for ${formatCurrency(Number(invoice.total_amount))}${dueDateStr}`,
        created_at: Date.now(),
      }])
    }

    const { data: signedData } = await supabase.storage
      .from('invoices').createSignedUrl(storagePath, 3600)

    return new Response(
      JSON.stringify({ pdf_url: signedData?.signedUrl || null, storage_path: storagePath }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Generate invoice error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
