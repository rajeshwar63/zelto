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

  // Colors
  const gold = rgb(0.706, 0.608, 0.314)
  const dark = rgb(0.118, 0.118, 0.118)
  const medGrey = rgb(0.392, 0.392, 0.392)
  const ltGrey = rgb(0.6, 0.6, 0.6)
  const beige = rgb(0.941, 0.902, 0.765)
  const offWhite = rgb(0.961, 0.961, 0.941)
  const nearWhite = rgb(0.980, 0.973, 0.945)
  const white = rgb(1, 1, 1)

  const W = 210       // mm
  const margin = 14   // mm
  const contentW = W - margin * 2  // 182mm

  // Draw text helper
  const drawText = (
    text: string, xMm: number, yMm: number,
    options: { font?: any; size?: number; color?: any; align?: 'left' | 'right' | 'center' } = {}
  ) => {
    const { font = fontNormal, size = 8, color = dark, align = 'left' } = options
    const textWidth = font.widthOfTextAtSize(text, size)
    let x = mm(xMm)
    if (align === 'right') x = mm(xMm) - textWidth
    else if (align === 'center') x = mm(xMm) - textWidth / 2
    page.drawText(text, { x, y: py(yMm), size, font, color })
  }

  // Draw filled rectangle
  const drawRect = (xMm: number, yMm: number, wMm: number, hMm: number, fillColor: any) => {
    page.drawRectangle({
      x: mm(xMm), y: py(yMm + hMm), width: mm(wMm), height: mm(hMm),
      color: fillColor, borderWidth: 0,
    })
  }

  // Draw line
  const drawLine = (x1Mm: number, y1Mm: number, x2Mm: number, y2Mm: number, thicknessPt: number, color: any) => {
    page.drawLine({
      start: { x: mm(x1Mm), y: py(y1Mm) },
      end: { x: mm(x2Mm), y: py(y2Mm) },
      thickness: thicknessPt,
      color,
    })
  }

  // ============ SECTION 1 — HEADER (y: 10mm to 50mm) ============
  // Two gold lines at top
  drawLine(margin, 10, W - margin, 10, 2, gold)
  drawLine(margin, 11.5, W - margin, 11.5, 1, gold)

  // Logo
  let hasLogo = false
  if (settings?.logo_url) {
    try {
      const resp = await fetch(settings.logo_url)
      if (resp.ok) {
        const imgBytes = new Uint8Array(await resp.arrayBuffer())
        const ext = (settings.logo_url.match(/\.(png|jpg|jpeg)/i)?.[1] || 'png').toLowerCase()
        const img = ext === 'png' ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)
        page.drawImage(img, { x: mm(margin), y: py(13 + 22), width: mm(22), height: mm(22) })
        hasLogo = true
      }
    } catch (_) {}
  }

  const headerLeftX = hasLogo ? 40 : margin

  // Business name (uppercase, bold 18pt)
  drawText(supplier.business_name.toUpperCase(), headerLeftX, 14, { font: fontBold, size: 18, color: dark })

  // Tagline (first line of address or blank)
  let infoY = 20
  if (supplier.business_address) {
    const firstLine = supplier.business_address.split(',')[0]?.trim()
    if (firstLine) {
      drawText(firstLine, headerLeftX, infoY, { size: 8, color: medGrey })
      infoY += 5
    }
  }

  // GSTIN row
  if (supplier.gst_number) {
    drawText(`GSTIN  ${supplier.gst_number}`, headerLeftX, infoY, { size: 8, color: dark })
    infoY += 4.5
  }

  // Phone + email row
  const contactParts: string[] = []
  if (supplier.phone) contactParts.push(supplier.phone)
  if (supplier.email) contactParts.push(supplier.email)
  if (contactParts.length) {
    drawText(contactParts.join('    '), headerLeftX, infoY, { size: 8, color: medGrey })
    infoY += 4.5
  }

  // Full address
  if (supplier.business_address) {
    const lines = wrapText(supplier.business_address, fontNormal, 8, 120)
    lines.forEach((line: string) => { drawText(line, headerLeftX, infoY, { size: 8, color: medGrey }); infoY += 4 })
  }

  // TAX INVOICE label (right-aligned)
  drawText('TAX INVOICE', W - margin, 18, { font: fontBold, size: 13, color: dark, align: 'right' })

  // Two gold lines at bottom of header
  drawLine(margin, 50, W - margin, 50, 2, gold)
  drawLine(margin, 51.5, W - margin, 51.5, 1, gold)

  // ============ SECTION 2 — INVOICE META (y: 53mm to 63mm) ============
  drawRect(margin, 53, contentW, 10, offWhite)
  drawLine(margin, 53, W - margin, 53, 0.5, gold)
  drawLine(margin, 63, W - margin, 63, 0.5, gold)

  // Three columns
  drawText('INVOICE NO.', margin + 2, 56, { font: fontBold, size: 7, color: ltGrey })
  drawText(invoice.invoice_number, margin + 2, 59, { font: fontBold, size: 9, color: dark })

  drawText('INVOICE DATE', 70, 56, { font: fontBold, size: 7, color: ltGrey })
  drawText(formatDate(invoice.invoice_date), 70, 59, { font: fontBold, size: 9, color: dark })

  if (invoice.due_date) {
    drawText('DUE DATE', 126, 56, { font: fontBold, size: 7, color: ltGrey })
    drawText(formatDate(invoice.due_date), 126, 59, { font: fontBold, size: 9, color: dark })
  }

  // ============ SECTION 3 — BILL TO / SHIP TO (y: 65mm to ~100mm) ============
  drawLine(margin, 65, W - margin, 65, 0.5, gold)

  // Vertical divider
  drawLine(105, 65, 105, 100, 0.5, gold)

  // Bill To (left column)
  drawText('Bill To', margin + 2, 68, { font: fontBold, size: 8, color: gold })
  drawText(buyer.business_name, margin + 2, 73, { font: fontBold, size: 10, color: dark })
  let byY = 78
  if (buyer.business_address) {
    const lines = wrapText(buyer.business_address, fontNormal, 7.5, 85)
    lines.forEach((l: string) => { drawText(l, margin + 2, byY, { size: 7.5, color: medGrey }); byY += 4 })
  }
  if (buyer.phone) { drawText(`Mobile: ${buyer.phone}`, margin + 2, byY, { size: 7.5, color: medGrey }); byY += 4 }
  if (buyer.gst_number) { drawText(`GSTIN: ${buyer.gst_number}`, margin + 2, byY, { size: 7.5, color: medGrey }); byY += 4 }
  if (invoice.place_of_supply) { drawText(`Place of Supply: ${invoice.place_of_supply}`, margin + 2, byY, { size: 7.5, color: medGrey }); byY += 4 }

  // Ship To (right column)
  drawText('Ship To', 109, 68, { font: fontBold, size: 8, color: gold })
  drawText(buyer.business_name, 109, 73, { font: fontBold, size: 10, color: dark })
  let syY = 78
  if (buyer.business_address) {
    const lines = wrapText(buyer.business_address, fontNormal, 7.5, 85)
    lines.forEach((l: string) => { drawText(l, 109, syY, { size: 7.5, color: medGrey }); syY += 4 })
  }

  drawLine(margin, 100, W - margin, 100, 0.5, gold)

  // ============ SECTION 4 — LINE ITEMS TABLE (y: 102mm onwards) ============
  let y = 102

  const cols = {
    no:    { x: margin,      w: 8 },
    item:  { x: margin + 8,  w: 68 },
    hsn:   { x: margin + 76, w: 22 },
    qty:   { x: margin + 98, w: 20 },
    rate:  { x: margin + 118, w: 20 },
    tax:   { x: margin + 138, w: 22 },
    total: { x: margin + 160, w: 22 },
  }

  // Table header
  drawRect(margin, y, contentW, 7, beige)
  drawText('NO',    cols.no.x + 1,                        y + 4.5, { font: fontBold, size: 6, color: dark })
  drawText('ITEMS', cols.item.x + 1,                      y + 4.5, { font: fontBold, size: 6, color: dark })
  drawText('HSN',   cols.hsn.x + cols.hsn.w / 2,          y + 4.5, { font: fontBold, size: 6, color: dark, align: 'center' })
  drawText('QTY',   cols.qty.x + cols.qty.w / 2,          y + 4.5, { font: fontBold, size: 6, color: dark, align: 'center' })
  drawText('RATE',  cols.rate.x + cols.rate.w,             y + 4.5, { font: fontBold, size: 6, color: dark, align: 'right' })
  drawText('TAX',   cols.tax.x + cols.tax.w,               y + 4.5, { font: fontBold, size: 6, color: dark, align: 'right' })
  drawText('TOTAL', cols.total.x + cols.total.w,           y + 4.5, { font: fontBold, size: 6, color: dark, align: 'right' })
  y += 7

  let totalQty = 0
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i]
    totalQty += Number(item.quantity)
    const rowBg = i % 2 === 0 ? white : nearWhite
    const rowH = item.hsn_code ? 10 : 8

    drawRect(margin, y, contentW, rowH, rowBg)

    drawText(String(i + 1),   cols.no.x + 1,                       y + 5, { size: 8, color: medGrey })
    drawText(item.name,       cols.item.x + 1,                     y + 5, { size: 8, color: dark })
    if (item.hsn_code) {
      drawText(item.hsn_code, cols.hsn.x + cols.hsn.w / 2,        y + 5, { size: 7.5, color: medGrey, align: 'center' })
    }
    drawText(String(item.quantity), cols.qty.x + cols.qty.w / 2,   y + 5, { size: 8, color: dark, align: 'center' })
    drawText(Number(item.rate).toLocaleString('en-IN'),            cols.rate.x + cols.rate.w, y + 5, { size: 8, color: dark, align: 'right' })
    drawText(Number(item.tax_amount).toLocaleString('en-IN'),      cols.tax.x + cols.tax.w,  y + 5, { size: 8, color: medGrey, align: 'right' })
    drawText(`(${item.tax_rate}%)`,                                cols.tax.x + cols.tax.w,  y + 8.5, { size: 7, color: ltGrey, align: 'right' })
    drawText(Number(item.total_amount).toLocaleString('en-IN'),    cols.total.x + cols.total.w, y + 5, { font: fontBold, size: 8, color: dark, align: 'right' })

    y += rowH
  }

  // Subtotal row
  drawRect(margin, y, contentW, 7, beige)
  drawText('SUBTOTAL', cols.item.x + cols.item.w / 2, y + 4.5, { font: fontBold, size: 8, color: gold, align: 'center' })
  drawText(String(totalQty), cols.qty.x + cols.qty.w / 2, y + 4.5, { font: fontBold, size: 8, color: gold, align: 'center' })
  const taxTotal = Number(invoice.total_amount) - Number(invoice.taxable_amount)
  drawText(taxTotal.toLocaleString('en-IN'), cols.tax.x + cols.tax.w, y + 4.5, { font: fontBold, size: 8, color: gold, align: 'right' })
  drawText(Number(invoice.total_amount).toLocaleString('en-IN'), cols.total.x + cols.total.w, y + 4.5, { font: fontBold, size: 8, color: gold, align: 'right' })
  y += 10

  // ============ SECTION 5 — FOOTER (two columns) ============
  const footerY = y
  const rightColX = 115
  const valueX = W - margin

  // --- Left column (terms + bank) ---
  let leftY = footerY
  if (settings?.terms_and_conditions) {
    drawText('Terms & Conditions', margin, leftY, { font: fontBold, size: 8, color: dark })
    leftY += 4
    const termLines = wrapText(settings.terms_and_conditions, fontNormal, 7, 90)
    termLines.forEach((line: string) => { drawText(line, margin, leftY, { size: 7, color: medGrey }); leftY += 3.5 })
    leftY += 5
  }

  if (settings?.bank_account_number || settings?.upi_id) {
    drawText('Bank Details', margin, leftY, { font: fontBold, size: 8, color: dark })
    leftY += 4.5
    const bankField = (label: string, value: string) => {
      drawText(label, margin, leftY, { size: 7.5, color: medGrey })
      drawText(value, margin + 30, leftY, { size: 7.5, color: dark })
      leftY += 4
    }
    if (settings.bank_account_name) bankField('Name', settings.bank_account_name)
    if (settings.bank_ifsc) bankField('IFSC', settings.bank_ifsc)
    if (settings.bank_account_number) bankField('Account No', settings.bank_account_number)
    if (settings.bank_name) bankField('Bank', settings.bank_name)
    if (settings.upi_id) bankField('UPI ID', settings.upi_id)
  }

  // --- Right column (tax summary) ---
  let rightY = footerY

  const summaryRow = (label: string, value: string, bold = false) => {
    drawText(label, rightColX, rightY, { font: bold ? fontBold : fontNormal, size: bold ? 9 : 8, color: bold ? dark : medGrey })
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

  // Gold divider
  drawLine(rightColX, rightY - 1, valueX, rightY - 1, 1, gold)
  rightY += 2
  summaryRow('Total Amount', formatCurrency(Number(invoice.total_amount)), true)
  summaryRow('Received Amount', formatCurrency(0))

  // Amount in words box
  rightY += 2
  const wordsBoxW = valueX - rightColX
  drawRect(rightColX, rightY, wordsBoxW, 14, offWhite)
  drawText('TOTAL AMOUNT (IN WORDS)', rightColX + 3, rightY + 4, { font: fontBold, size: 7, color: ltGrey })
  const words = toWords(Number(invoice.total_amount))
  const wordLines = wrapText(words, fontNormal, 7.5, wordsBoxW - 6)
  wordLines.slice(0, 2).forEach((line: string, i: number) => {
    drawText(line, rightColX + 3, rightY + 8 + i * 3.5, { size: 7.5, color: dark })
  })

  // ============ SECTION 6 — SIGNATURE ============
  const sigY = Math.max(leftY, rightY + 18) + 6
  drawLine(margin, sigY, W - margin, sigY, 1, gold)

  const sigBoxX = W - margin - 40
  if (settings?.signature_url) {
    try {
      const resp = await fetch(settings.signature_url)
      if (resp.ok) {
        const imgBytes = new Uint8Array(await resp.arrayBuffer())
        const ext = (settings.signature_url.match(/\.(png|jpg|jpeg)/i)?.[1] || 'png').toLowerCase()
        const img = ext === 'png' ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)
        page.drawImage(img, { x: mm(sigBoxX), y: py(sigY + 3 + 14), width: mm(35), height: mm(14) })
      }
    } catch (_) {}
  }

  drawText('Signature', sigBoxX + 17.5, sigY + 20, { size: 7.5, color: medGrey, align: 'center' })
  drawText(supplier.business_name, sigBoxX + 17.5, sigY + 24, { size: 7.5, color: medGrey, align: 'center' })

  // Two gold lines at very bottom (mirror of top)
  const bottomY = 287 // ~297mm page height minus 10mm margin
  drawLine(margin, bottomY, W - margin, bottomY, 1, gold)
  drawLine(margin, bottomY + 1.5, W - margin, bottomY + 1.5, 2, gold)

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
