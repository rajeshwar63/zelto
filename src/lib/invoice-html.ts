import type { Invoice, InvoiceLineItem, BusinessEntity, InvoiceSettings } from './types'

export function toWords(num: number): string {
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

export function buildInvoiceHtmlForPdf(
  invoice: Invoice,
  supplier: BusinessEntity,
  buyer: BusinessEntity,
  lineItems: InvoiceLineItem[],
  settings: InvoiceSettings | null
): string {
  const isInterState = invoice.isInterState

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const logoHtml = settings?.logoUrl
    ? `<img src="${settings.logoUrl}" style="max-height:60px;max-width:100px;object-fit:contain;display:block;margin-bottom:8px;" crossorigin="anonymous" />`
    : ''

  const signatureHtml = settings?.signatureUrl
    ? `<img src="${settings.signatureUrl}" style="max-height:50px;max-width:100px;object-fit:contain;display:block;margin-bottom:4px;" crossorigin="anonymous" />`
    : '<div style="height:50px;"></div>'

  const itemRows = lineItems.map((item, i) => {
    return `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:11px;color:#666;text-align:center;">${i + 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;">
          <div style="font-size:12px;font-weight:600;">${item.name}</div>
          ${item.hsnCode ? `<div style="font-size:10px;color:#888;">HSN: ${item.hsnCode}</div>` : ''}
          ${item.unit ? `<div style="font-size:10px;color:#888;">${item.unit}</div>` : ''}
        </td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${item.quantity}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">${item.rate.toLocaleString('en-IN')}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;font-size:11px;color:#555;">
          ${item.taxAmount.toLocaleString('en-IN')}<br/><span style="font-size:10px;color:#888;">(${item.taxRate}%)</span>
        </td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-weight:600;">${item.totalAmount.toLocaleString('en-IN')}</td>
      </tr>`
  }).join('')

  const taxByRate: Record<number, number> = {}
  for (const item of lineItems) {
    if (item.taxRate > 0) taxByRate[item.taxRate] = (taxByRate[item.taxRate] || 0) + item.taxAmount
  }

  const taxBreakdownRows = Object.entries(taxByRate).map(([rate, amt]) => {
    const r = Number(rate)
    if (isInterState) {
      return `<tr><td style="padding:3px 0;font-size:11px;color:#555;">IGST @${r}%</td><td style="text-align:right;font-size:11px;">${fmt(amt)}</td></tr>`
    } else {
      return `
        <tr><td style="padding:3px 0;font-size:11px;color:#555;">CGST @${r / 2}%</td><td style="text-align:right;font-size:11px;">${fmt(amt / 2)}</td></tr>
        <tr><td style="padding:3px 0;font-size:11px;color:#555;">SGST @${r / 2}%</td><td style="text-align:right;font-size:11px;">${fmt(amt / 2)}</td></tr>`
    }
  }).join('')

  const bankHtml = (settings?.bankAccountNumber || settings?.upiId) ? `
    <div style="margin-top:14px;">
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Bank Details</div>
      <table style="width:100%;border-collapse:collapse;">
        ${settings.bankAccountName ? `<tr><td style="font-size:11px;color:#888;padding:1px 0;width:60px;">Name</td><td style="font-size:11px;">${settings.bankAccountName}</td></tr>` : ''}
        ${settings.bankIfsc ? `<tr><td style="font-size:11px;color:#888;padding:1px 0;">IFSC</td><td style="font-size:11px;">${settings.bankIfsc}</td></tr>` : ''}
        ${settings.bankAccountNumber ? `<tr><td style="font-size:11px;color:#888;padding:1px 0;">Account No</td><td style="font-size:11px;">${settings.bankAccountNumber}</td></tr>` : ''}
        ${settings.bankName ? `<tr><td style="font-size:11px;color:#888;padding:1px 0;">Bank Name</td><td style="font-size:11px;">${settings.bankName}</td></tr>` : ''}
        ${settings.upiId ? `<tr><td style="font-size:11px;color:#888;padding:1px 0;">UPI ID</td><td style="font-size:11px;">${settings.upiId}</td></tr>` : ''}
      </table>
    </div>` : ''

  const termsHtml = settings?.termsAndConditions ? `
    <div style="margin-bottom:14px;">
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Terms & Conditions</div>
      <div style="font-size:11px;color:#555;white-space:pre-wrap;">${settings.termsAndConditions}</div>
    </div>` : ''

  const totalWords = toWords(invoice.totalAmount)

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1f2e;width:714px;background:#fff;">

      <!-- HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #1a1f2e;margin-bottom:16px;">
        <div>
          ${logoHtml}
          <div style="font-size:20px;font-weight:800;letter-spacing:-0.3px;">${supplier.businessName}</div>
          ${supplier.gstNumber ? `<div style="font-size:11px;color:#555;margin-top:2px;">GSTIN ${supplier.gstNumber}</div>` : ''}
          ${supplier.phone ? `<div style="font-size:11px;color:#555;margin-top:2px;">Phone: ${supplier.phone}</div>` : ''}
          ${supplier.businessAddress ? `<div style="font-size:11px;color:#555;margin-top:2px;max-width:320px;">${supplier.businessAddress}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:800;letter-spacing:1px;color:#1a1f2e;">TAX INVOICE</div>
        </div>
      </div>

      <!-- INVOICE META ROW -->
      <div style="display:flex;gap:40px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #eee;">
        <div>
          <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px;">Invoice No.</div>
          <div style="font-size:13px;font-weight:700;">${invoice.invoiceNumber}</div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px;">Invoice Date</div>
          <div style="font-size:13px;font-weight:700;">${fmtDate(invoice.invoiceDate)}</div>
        </div>
        ${invoice.dueDate ? `<div>
          <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px;">Due Date</div>
          <div style="font-size:13px;font-weight:700;">${fmtDate(invoice.dueDate)}</div>
        </div>` : ''}
      </div>

      <!-- BILL TO / SHIP TO -->
      <div style="display:flex;gap:20px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #eee;">
        <div style="flex:1;padding:12px;background:#f7f8fa;border-radius:8px;">
          <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px;">Bill To</div>
          <div style="font-size:13px;font-weight:700;">${buyer.businessName}</div>
          ${buyer.businessAddress ? `<div style="font-size:11px;color:#555;margin-top:3px;">${buyer.businessAddress}</div>` : ''}
          ${buyer.phone ? `<div style="font-size:11px;color:#555;margin-top:2px;">Mobile ${buyer.phone}</div>` : ''}
          ${buyer.gstNumber ? `<div style="font-size:11px;color:#555;margin-top:2px;">GSTIN ${buyer.gstNumber}</div>` : ''}
        </div>
        <div style="flex:1;padding:12px;background:#f7f8fa;border-radius:8px;">
          <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px;">Ship To</div>
          <div style="font-size:13px;font-weight:700;">${buyer.businessName}</div>
          ${buyer.businessAddress ? `<div style="font-size:11px;color:#555;margin-top:3px;">${buyer.businessAddress}</div>` : ''}
          ${invoice.placeOfSupply ? `<div style="font-size:11px;color:#555;margin-top:2px;">Place of Supply ${invoice.placeOfSupply}</div>` : ''}
        </div>
      </div>

      <!-- LINE ITEMS TABLE -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="background:#1a1f2e;color:#fff;">
            <th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;width:30px;">No</th>
            <th style="padding:8px 6px;text-align:left;font-size:10px;font-weight:700;">Items</th>
            <th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:700;width:60px;">Qty.</th>
            <th style="padding:8px 6px;text-align:right;font-size:10px;font-weight:700;width:70px;">Rate</th>
            <th style="padding:8px 6px;text-align:right;font-size:10px;font-weight:700;width:80px;">Tax</th>
            <th style="padding:8px 6px;text-align:right;font-size:10px;font-weight:700;width:80px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
        <tfoot>
          <tr style="background:#f7f8fa;">
            <td colspan="2" style="padding:8px 6px;font-size:11px;font-weight:700;text-align:right;color:#888;">SUBTOTAL</td>
            <td style="padding:8px 6px;text-align:center;font-size:11px;font-weight:700;">${lineItems.reduce((s, i) => s + i.quantity, 0)}</td>
            <td></td>
            <td style="padding:8px 6px;text-align:right;font-size:11px;font-weight:700;">${fmt(invoice.totalAmount - invoice.taxableAmount)}</td>
            <td style="padding:8px 6px;text-align:right;font-size:11px;font-weight:700;">${fmt(invoice.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- FOOTER: TERMS+BANK (left) | TAX SUMMARY (right) -->
      <div style="display:flex;gap:30px;margin-bottom:20px;">
        <div style="flex:1;">
          ${termsHtml}
          ${bankHtml}
        </div>
        <div style="width:260px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:5px 0;font-size:12px;color:#555;">Taxable Amount</td>
              <td style="padding:5px 0;text-align:right;font-size:12px;font-weight:600;">${fmt(invoice.taxableAmount)}</td>
            </tr>
            ${taxBreakdownRows}
            <tr style="border-top:2px solid #1a1f2e;">
              <td style="padding:8px 0;font-size:14px;font-weight:700;">Total Amount</td>
              <td style="padding:8px 0;text-align:right;font-size:14px;font-weight:700;">${fmt(invoice.totalAmount)}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:11px;color:#888;">Received Amount</td>
              <td style="padding:4px 0;text-align:right;font-size:11px;color:#888;">₹ 0</td>
            </tr>
          </table>
          <div style="margin-top:10px;padding:8px;background:#f7f8fa;border-radius:6px;">
            <div style="font-size:10px;font-weight:700;color:#888;margin-bottom:2px;">Total Amount (in words)</div>
            <div style="font-size:11px;font-style:italic;color:#1a1f2e;">${totalWords}</div>
          </div>
        </div>
      </div>

      <!-- SIGNATURE -->
      <div style="display:flex;justify-content:flex-end;border-top:1px solid #eee;padding-top:16px;">
        <div style="text-align:center;min-width:140px;">
          ${signatureHtml}
          <div style="font-size:11px;font-weight:700;border-top:1px solid #1a1f2e;padding-top:4px;margin-top:4px;">Signature</div>
          <div style="font-size:11px;color:#555;margin-top:2px;">${supplier.businessName}</div>
        </div>
      </div>

    </div>`
}
