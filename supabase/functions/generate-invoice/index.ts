// supabase/functions/generate-invoice/index.ts
// Generates a PDF invoice using HTML template, uploads to Storage,
// triggers push notification to buyer.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
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
  let result = 'Rupees ' + convert(rupees)
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise'
  result += ' Only'
  return result
}

function buildInvoiceHtml(data: {
  supplier: any
  buyer: any
  invoice: any
  lineItems: any[]
  settings: any
}): string {
  const { supplier, buyer, invoice, lineItems, settings } = data
  const isInterState = invoice.is_inter_state

  // Build line items HTML
  const itemsHtml = lineItems.map((item: any, idx: number) => {
    const taxLabel = isInterState
      ? `IGST @${item.tax_rate}%`
      : `CGST @${item.tax_rate / 2}% + SGST @${item.tax_rate / 2}%`

    return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${idx + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">
          <div style="font-size:13px;font-weight:600;color:#1a1f2e;">${item.name}</div>
          ${item.hsn_code ? `<div style="font-size:10px;color:#888;font-family:monospace;">HSN ${item.hsn_code}</div>` : ''}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">
          ${item.quantity} ${item.unit || ''}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">
          ${formatCurrency(item.rate)}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">
          ${formatCurrency(item.tax_amount)}<br/>
          <span style="font-size:10px;color:#888;">(${item.tax_rate}%)</span>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-size:13px;font-weight:600;">
          ${formatCurrency(item.total_amount)}
        </td>
      </tr>
    `
  }).join('')

  // Tax breakdown
  const taxByRate: Record<number, number> = {}
  for (const item of lineItems) {
    const rate = parseFloat(item.tax_rate) || 0
    if (rate > 0) {
      taxByRate[rate] = (taxByRate[rate] || 0) + parseFloat(item.tax_amount)
    }
  }

  let taxBreakdownHtml = ''
  for (const [rate, amount] of Object.entries(taxByRate)) {
    const rateNum = Number(rate)
    if (isInterState) {
      taxBreakdownHtml += `
        <tr>
          <td style="padding:6px 0;font-size:12px;color:#666;">IGST @${rateNum}%</td>
          <td style="padding:6px 0;text-align:right;font-size:13px;font-weight:600;">${formatCurrency(amount)}</td>
        </tr>`
    } else {
      taxBreakdownHtml += `
        <tr>
          <td style="padding:6px 0;font-size:12px;color:#666;">CGST @${rateNum / 2}%</td>
          <td style="padding:6px 0;text-align:right;font-size:13px;font-weight:600;">${formatCurrency(amount / 2)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:12px;color:#666;">SGST @${rateNum / 2}%</td>
          <td style="padding:6px 0;text-align:right;font-size:13px;font-weight:600;">${formatCurrency(amount / 2)}</td>
        </tr>`
    }
  }

  const logoHtml = settings?.logo_url
    ? `<img src="${settings.logo_url}" style="max-height:50px;max-width:120px;object-fit:contain;" />`
    : ''

  const signatureHtml = settings?.signature_url
    ? `<div style="text-align:right;margin-top:20px;">
        <img src="${settings.signature_url}" style="max-height:50px;max-width:120px;object-fit:contain;" /><br/>
        <span style="font-size:11px;color:#666;">${supplier.business_name}</span>
      </div>`
    : ''

  const bankHtml = (settings?.bank_account_name || settings?.bank_account_number)
    ? `<div style="margin-top:16px;">
        <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px;">Bank Details</div>
        ${settings.bank_account_name ? `<div style="font-size:12px;"><span style="color:#888;">Name:</span> ${settings.bank_account_name}</div>` : ''}
        ${settings.bank_ifsc ? `<div style="font-size:12px;"><span style="color:#888;">IFSC:</span> ${settings.bank_ifsc}</div>` : ''}
        ${settings.bank_account_number ? `<div style="font-size:12px;"><span style="color:#888;">Acct:</span> ${settings.bank_account_number}</div>` : ''}
        ${settings.bank_name ? `<div style="font-size:12px;"><span style="color:#888;">Bank:</span> ${settings.bank_name}</div>` : ''}
        ${settings.upi_id ? `<div style="font-size:12px;"><span style="color:#888;">UPI:</span> ${settings.upi_id}</div>` : ''}
      </div>`
    : ''

  const termsHtml = settings?.terms_and_conditions
    ? `<div style="margin-top:16px;">
        <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px;">Terms & Conditions</div>
        <div style="font-size:11px;color:#666;white-space:pre-wrap;">${settings.terms_and_conditions}</div>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1f2e; padding: 30px; max-width: 800px; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:2px solid #4A6CF7;padding-bottom:16px;">
    <div>
      ${logoHtml}
      <div style="font-size:18px;font-weight:700;margin-top:8px;">${supplier.business_name}</div>
      ${supplier.gst_number ? `<div style="font-size:12px;color:#666;">GSTIN: ${supplier.gst_number}</div>` : ''}
      ${supplier.phone ? `<div style="font-size:12px;color:#666;">${supplier.phone}</div>` : ''}
      ${supplier.business_address ? `<div style="font-size:12px;color:#666;">${supplier.business_address}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <div style="font-size:20px;font-weight:700;color:#4A6CF7;">TAX INVOICE</div>
    </div>
  </div>

  <!-- Invoice info -->
  <div style="display:flex;gap:24px;margin-bottom:20px;padding:12px;background:#f7f8fa;border-radius:8px;">
    <div>
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Invoice No.</div>
      <div style="font-size:13px;font-weight:600;">${invoice.invoice_number}</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Invoice Date</div>
      <div style="font-size:13px;font-weight:600;">${formatDate(invoice.invoice_date)}</div>
    </div>
    ${invoice.due_date ? `<div>
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Due Date</div>
      <div style="font-size:13px;font-weight:600;">${formatDate(invoice.due_date)}</div>
    </div>` : ''}
  </div>

  <!-- Bill To / Ship To -->
  <div style="display:flex;gap:24px;margin-bottom:20px;">
    <div style="flex:1;">
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:4px;">Bill To</div>
      <div style="font-size:14px;font-weight:600;">${buyer.business_name}</div>
      ${buyer.business_address ? `<div style="font-size:12px;color:#666;">${buyer.business_address}</div>` : ''}
      ${buyer.gst_number ? `<div style="font-size:12px;color:#666;">GSTIN: ${buyer.gst_number}</div>` : ''}
    </div>
    <div style="flex:1;">
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:4px;">Ship To</div>
      <div style="font-size:14px;font-weight:600;">${buyer.business_name}</div>
      ${buyer.business_address ? `<div style="font-size:12px;color:#666;">${buyer.business_address}</div>` : ''}
      ${invoice.place_of_supply ? `<div style="font-size:12px;color:#666;">Place of Supply: ${invoice.place_of_supply}</div>` : ''}
    </div>
  </div>

  <!-- Line items table -->
  <table style="margin-bottom:20px;">
    <thead>
      <tr style="background:#f7f8fa;">
        <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#888;border-bottom:2px solid #eee;">#</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#888;border-bottom:2px solid #eee;">Item</th>
        <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:700;color:#888;border-bottom:2px solid #eee;">Qty</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;color:#888;border-bottom:2px solid #eee;">Rate</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;color:#888;border-bottom:2px solid #eee;">Tax</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;color:#888;border-bottom:2px solid #eee;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <!-- Footer: Terms + Bank | Summary -->
  <div style="display:flex;gap:40px;">
    <div style="flex:1;">
      ${termsHtml}
      ${bankHtml}
    </div>
    <div style="flex:1;">
      <table>
        <tr>
          <td style="padding:6px 0;font-size:12px;color:#666;">Taxable Amount</td>
          <td style="padding:6px 0;text-align:right;font-size:13px;font-weight:600;">${formatCurrency(parseFloat(invoice.taxable_amount))}</td>
        </tr>
        ${taxBreakdownHtml}
        <tr style="border-top:2px solid #1a1f2e;">
          <td style="padding:10px 0;font-size:15px;font-weight:700;">Total Amount</td>
          <td style="padding:10px 0;text-align:right;font-size:15px;font-weight:700;">${formatCurrency(parseFloat(invoice.total_amount))}</td>
        </tr>
      </table>
      <div style="font-size:11px;color:#666;font-style:italic;margin-top:4px;">${toWords(parseFloat(invoice.total_amount))}</div>
      ${signatureHtml}
    </div>
  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verify the JWT and get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { invoice_id } = await req.json()
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify caller is the supplier
    const { data: callerAccounts } = await supabase
      .from('user_accounts')
      .select('business_entity_id')
      .eq('auth_user_id', user.id)

    const callerBusinessIds = (callerAccounts || []).map((a: any) => a.business_entity_id)
    if (!callerBusinessIds.includes(invoice.supplier_business_entity_id)) {
      return new Response(JSON.stringify({ error: 'Only the supplier can generate this invoice' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate HTML
    const html = buildInvoiceHtml({ supplier, buyer, invoice, lineItems, settings })

    // Store the HTML as a file (PDF generation requires headless Chrome which
    // is not available in Deno edge functions; store HTML and generate PDF client-side)
    const htmlBytes = new TextEncoder().encode(html)
    const storagePath = `${invoice.supplier_business_entity_id}/${invoice_id}.html`

    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(storagePath, htmlBytes, {
        contentType: 'text/html',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(JSON.stringify({ error: 'Failed to upload invoice' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate signed URL
    const { data: signedUrlData } = await supabase.storage
      .from('invoices')
      .createSignedUrl(storagePath, 3600)

    const pdfUrl = signedUrlData?.signedUrl || null

    // Update invoice record
    await supabase
      .from('invoices')
      .update({ pdf_url: pdfUrl, status: 'generated' })
      .eq('id', invoice_id)

    // Create notification for buyer
    const { data: order } = await supabase
      .from('orders')
      .select('connection_id')
      .eq('id', invoice.order_id)
      .single()

    if (order) {
      const dueDateStr = invoice.due_date ? ` · Due ${formatDate(invoice.due_date)}` : ''
      await supabase.from('notifications').insert([{
        recipient_business_id: invoice.buyer_business_entity_id,
        type: 'OrderPlaced',
        related_entity_id: invoice_id,
        connection_id: order.connection_id,
        message: `${supplier.business_name} sent you invoice ${invoice.invoice_number} for ${formatCurrency(parseFloat(invoice.total_amount))}${dueDateStr}`,
        created_at: Date.now(),
      }])
    }

    return new Response(
      JSON.stringify({ pdf_url: pdfUrl, html_url: pdfUrl }),
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
