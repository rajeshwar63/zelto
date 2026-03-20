// supabase/functions/generate-invoice/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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

// Wrap text to fit within maxWidth, return array of lines
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth)
}

// ─── PDF Builder ────────────────────────────────────────────────────────────

async function buildInvoicePdf(data: {
  supplier: any
  buyer: any
  invoice: any
  lineItems: any[]
  settings: any
}): Promise<Uint8Array> {
  const { supplier, buyer, invoice, lineItems, settings } = data
  const isInterState = invoice.is_inter_state

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210   // page width mm
  const margin = 14
  const contentW = W - margin * 2
  let y = margin

  // ── Colors ──
  const dark: [number, number, number] = [26, 31, 46]
  const grey: [number, number, number] = [100, 110, 130]
  const lightGrey: [number, number, number] = [247, 248, 250]
  const white: [number, number, number] = [255, 255, 255]

  // ── Logo (if available) ──
  if (settings?.logo_url) {
    try {
      const resp = await fetch(settings.logo_url)
      if (resp.ok) {
        const buf = await resp.arrayBuffer()
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        const ext = settings.logo_url.match(/\.(png|jpg|jpeg)/i)?.[1]?.toUpperCase() || 'PNG'
        doc.addImage(b64, ext === 'JPG' ? 'JPEG' : ext, margin, y, 28, 14, undefined, 'FAST')
      }
    } catch (_) { /* skip logo on fetch failure */ }
  }

  // ── Header: Supplier info (left) + TAX INVOICE (right) ──
  const headerLeftX = settings?.logo_url ? margin + 32 : margin
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...dark)
  doc.text(supplier.business_name, headerLeftX, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...grey)
  let infoY = y + 10
  if (supplier.gst_number) { doc.text(`GSTIN: ${supplier.gst_number}`, headerLeftX, infoY); infoY += 4 }
  if (supplier.phone) { doc.text(supplier.phone, headerLeftX, infoY); infoY += 4 }
  if (supplier.business_address) {
    const addrLines = wrapText(doc, supplier.business_address, 90)
    addrLines.forEach((line: string) => { doc.text(line, headerLeftX, infoY); infoY += 4 })
  }

  // TAX INVOICE — top right
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...dark)
  doc.text('TAX INVOICE', W - margin, y + 5, { align: 'right' })

  y = Math.max(infoY, y + 20) + 4

  // ── Divider ──
  doc.setDrawColor(...dark)
  doc.setLineWidth(0.5)
  doc.line(margin, y, W - margin, y)
  y += 5

  // ── Invoice meta row ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...grey)
  doc.text('INVOICE NO.', margin, y)
  doc.text('INVOICE DATE', margin + 50, y)
  if (invoice.due_date) doc.text('DUE DATE', margin + 100, y)

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...dark)
  doc.text(invoice.invoice_number, margin, y)
  doc.text(formatDate(invoice.invoice_date), margin + 50, y)
  if (invoice.due_date) doc.text(formatDate(invoice.due_date), margin + 100, y)

  y += 7

  // ── Thin divider ──
  doc.setDrawColor(220, 225, 235)
  doc.setLineWidth(0.3)
  doc.line(margin, y, W - margin, y)
  y += 5

  // ── Bill To / Ship To ──
  const colW = (contentW - 6) / 2
  const boxH = 28

  // Bill To box
  doc.setFillColor(...lightGrey)
  doc.roundedRect(margin, y, colW, boxH, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...grey)
  doc.text('BILL TO', margin + 4, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...dark)
  doc.text(buyer.business_name, margin + 4, y + 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...grey)
  let byY = y + 14
  if (buyer.business_address) {
    const lines = wrapText(doc, buyer.business_address, colW - 8)
    lines.slice(0, 2).forEach((l: string) => { doc.text(l, margin + 4, byY); byY += 3.5 })
  }
  if (buyer.phone) { doc.text(`Mobile: ${buyer.phone}`, margin + 4, byY); byY += 3.5 }
  if (buyer.gst_number) doc.text(`GSTIN: ${buyer.gst_number}`, margin + 4, byY)

  // Ship To box
  const shipX = margin + colW + 6
  doc.setFillColor(...lightGrey)
  doc.roundedRect(shipX, y, colW, boxH, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...grey)
  doc.text('SHIP TO', shipX + 4, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...dark)
  doc.text(buyer.business_name, shipX + 4, y + 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...grey)
  let syY = y + 14
  if (buyer.business_address) {
    const lines = wrapText(doc, buyer.business_address, colW - 8)
    lines.slice(0, 2).forEach((l: string) => { doc.text(l, shipX + 4, syY); syY += 3.5 })
  }
  if (invoice.place_of_supply) doc.text(`Place of Supply: ${invoice.place_of_supply}`, shipX + 4, syY)

  y += boxH + 6

  // ── Line items table ──
  const cols = {
    no:    { x: margin,         w: 8 },
    item:  { x: margin + 8,     w: 72 },
    qty:   { x: margin + 80,    w: 18 },
    rate:  { x: margin + 98,    w: 26 },
    tax:   { x: margin + 124,   w: 26 },
    total: { x: margin + 150,   w: contentW - 150 },
  }

  // Table header row
  doc.setFillColor(...dark)
  doc.rect(margin, y, contentW, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...white)
  doc.text('NO',    cols.no.x + 1,    y + 4.5)
  doc.text('ITEMS', cols.item.x + 1,  y + 4.5)
  doc.text('QTY',   cols.qty.x + 1,   y + 4.5)
  doc.text('RATE',  cols.rate.x + cols.rate.w, y + 4.5, { align: 'right' })
  doc.text('TAX',   cols.tax.x + cols.tax.w,  y + 4.5, { align: 'right' })
  doc.text('TOTAL', cols.total.x + cols.total.w, y + 4.5, { align: 'right' })
  y += 7

  // Line item rows
  let totalQty = 0
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i]
    totalQty += item.quantity

    const rowBg = i % 2 === 0 ? white : lightGrey
    const rowH = item.hsn_code ? 10 : 7

    doc.setFillColor(...rowBg)
    doc.rect(margin, y, contentW, rowH, 'F')
    doc.setDrawColor(230, 233, 240)
    doc.setLineWidth(0.2)
    doc.line(margin, y + rowH, margin + contentW, y + rowH)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...grey)
    doc.text(String(i + 1), cols.no.x + 1, y + 5)

    doc.setTextColor(...dark)
    doc.setFont('helvetica', 'bold')
    doc.text(item.name, cols.item.x + 1, y + 5)
    if (item.hsn_code) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...grey)
      doc.text(`HSN: ${item.hsn_code}`, cols.item.x + 1, y + 8.5)
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...dark)
    doc.text(String(item.quantity), cols.qty.x + 1, y + 5)

    const rateStr = item.rate.toLocaleString('en-IN')
    doc.text(rateStr, cols.rate.x + cols.rate.w, y + 5, { align: 'right' })

    const taxAmt = Number(item.tax_amount).toLocaleString('en-IN')
    doc.setTextColor(...grey)
    doc.text(`${taxAmt}`, cols.tax.x + cols.tax.w, y + 5, { align: 'right' })
    doc.setFontSize(6.5)
    doc.text(`(${item.tax_rate}%)`, cols.tax.x + cols.tax.w, y + 8.5, { align: 'right' })

    doc.setFontSize(8)
    doc.setTextColor(...dark)
    doc.setFont('helvetica', 'bold')
    const totalStr = Number(item.total_amount).toLocaleString('en-IN')
    doc.text(totalStr, cols.total.x + cols.total.w, y + 5, { align: 'right' })

    y += rowH
  }

  // Subtotal row
  doc.setFillColor(240, 242, 248)
  doc.rect(margin, y, contentW, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...grey)
  doc.text('SUBTOTAL', cols.item.x + cols.item.w, y + 4.5, { align: 'right' })
  doc.setTextColor(...dark)
  doc.text(String(totalQty), cols.qty.x + 1, y + 4.5)
  const taxTotal = Number(invoice.total_amount) - Number(invoice.taxable_amount)
  doc.text(taxTotal.toLocaleString('en-IN'), cols.tax.x + cols.tax.w, y + 4.5, { align: 'right' })
  doc.text(Number(invoice.total_amount).toLocaleString('en-IN'), cols.total.x + cols.total.w, y + 4.5, { align: 'right' })
  y += 10

  // ── Footer: Terms+Bank (left) | Tax Summary (right) ──
  const footerY = y
  const leftColW = contentW * 0.52
  const rightColW = contentW * 0.44
  const rightColX = margin + contentW - rightColW

  // Terms
  let leftY = footerY
  if (settings?.terms_and_conditions) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...grey)
    doc.text('TERMS & CONDITIONS', margin, leftY)
    leftY += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...dark)
    const termLines = wrapText(doc, settings.terms_and_conditions, leftColW)
    termLines.forEach((line: string) => { doc.text(line, margin, leftY); leftY += 3.5 })
    leftY += 3
  }

  // Bank details
  if (settings?.bank_account_number || settings?.upi_id) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...grey)
    doc.text('BANK DETAILS', margin, leftY)
    leftY += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...dark)
    const bankLines: string[] = []
    if (settings.bank_account_name) bankLines.push(`Name: ${settings.bank_account_name}`)
    if (settings.bank_ifsc) bankLines.push(`IFSC: ${settings.bank_ifsc}`)
    if (settings.bank_account_number) bankLines.push(`Account No: ${settings.bank_account_number}`)
    if (settings.bank_name) bankLines.push(`Bank: ${settings.bank_name}`)
    if (settings.upi_id) bankLines.push(`UPI ID: ${settings.upi_id}`)
    bankLines.forEach(line => { doc.text(line, margin, leftY); leftY += 3.5 })
  }

  // Tax summary (right column)
  let rightY = footerY
  const labelX = rightColX
  const valueX = rightColX + rightColW

  const summaryRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 9 : 8)
    const color = bold ? dark : grey
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(label, labelX, rightY)
    doc.setTextColor(...dark)
    doc.text(value, valueX, rightY, { align: 'right' })
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

  // Total line
  doc.setDrawColor(...dark)
  doc.setLineWidth(0.4)
  doc.line(labelX, rightY - 1, valueX, rightY - 1)
  rightY += 1
  summaryRow('Total Amount', formatCurrency(Number(invoice.total_amount)), true)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...grey)
  summaryRow('Received Amount', formatCurrency(0))

  // Amount in words
  rightY += 2
  doc.setFillColor(...lightGrey)
  doc.roundedRect(labelX, rightY, rightColW, 12, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...grey)
  doc.text('TOTAL AMOUNT (IN WORDS)', labelX + 3, rightY + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...dark)
  const words = toWords(Number(invoice.total_amount))
  const wordLines = wrapText(doc, words, rightColW - 6)
  wordLines.slice(0, 2).forEach((line: string, i: number) => {
    doc.text(line, labelX + 3, rightY + 8 + i * 3.5)
  })

  // ── Signature ──
  const sigY = Math.max(leftY, rightY + 18) + 6
  doc.setDrawColor(220, 225, 235)
  doc.setLineWidth(0.3)
  doc.line(margin, sigY, W - margin, sigY)

  const sigBoxX = W - margin - 40
  if (settings?.signature_url) {
    try {
      const resp = await fetch(settings.signature_url)
      if (resp.ok) {
        const buf = await resp.arrayBuffer()
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        const ext = settings.signature_url.match(/\.(png|jpg|jpeg)/i)?.[1]?.toUpperCase() || 'PNG'
        doc.addImage(b64, ext === 'JPG' ? 'JPEG' : ext, sigBoxX, sigY + 3, 30, 12, undefined, 'FAST')
      }
    } catch (_) { /* skip signature on fetch failure */ }
  }

  doc.setDrawColor(...dark)
  doc.setLineWidth(0.3)
  doc.line(sigBoxX, sigY + 18, sigBoxX + 40, sigY + 18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...dark)
  doc.text('Signature', sigBoxX + 20, sigY + 22, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...grey)
  doc.text(supplier.business_name, sigBoxX + 20, sigY + 26, { align: 'center' })

  // Return as Uint8Array
  return doc.output('arraybuffer') as unknown as Uint8Array
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await createClient(
      SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    ).auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { invoice_id } = await req.json()
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: invoice, error: invError } = await supabase
      .from('invoices').select('*').eq('id', invoice_id).single()

    if (invError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify caller is the supplier
    const { data: callerAccounts } = await supabase
      .from('user_accounts').select('business_entity_id').eq('auth_user_id', user.id)
    const callerIds = (callerAccounts || []).map((a: any) => a.business_entity_id)
    if (!callerIds.includes(invoice.supplier_business_entity_id)) {
      return new Response(JSON.stringify({ error: 'Only the supplier can generate this invoice' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch related data
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

    // Generate real PDF
    const pdfBytes = await buildInvoicePdf({ supplier, buyer, invoice, lineItems, settings })

    // Upload PDF to storage
    const storagePath = `${invoice.supplier_business_entity_id}/${invoice_id}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(JSON.stringify({ error: 'Failed to upload PDF' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Store storage PATH (not a signed URL) — client generates signed URL at view time
    await supabase.from('invoices')
      .update({ pdf_url: storagePath, status: 'generated' })
      .eq('id', invoice_id)

    // Notify buyer
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

    // Return a short-lived signed URL for immediate use
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
