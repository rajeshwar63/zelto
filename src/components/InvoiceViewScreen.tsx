import { useState, useEffect } from 'react'
import { ArrowLeft, DownloadSimple, ShareNetwork, Receipt, CheckCircle, Info } from '@phosphor-icons/react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { dataStore } from '@/lib/data-store'
import { supabase } from '@/lib/supabase-client'
import { formatInrCurrency } from '@/lib/utils'
import { buildInvoiceHtmlForPdf } from '@/lib/invoice-html'
import type { Invoice, InvoiceLineItem, BusinessEntity, InvoiceSettings } from '@/lib/types'

interface Props {
  invoiceId: string
  currentBusinessId: string
  onBack: () => void
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function InvoiceViewScreen({ invoiceId, currentBusinessId, onBack }: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [supplierBusiness, setSupplierBusiness] = useState<BusinessEntity | null>(null)
  const [buyerBusiness, setBuyerBusiness] = useState<BusinessEntity | null>(null)
  const [loading, setLoading] = useState(true)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null)

  const isSupplier = invoice?.supplierBusinessEntityId === currentBusinessId

  const generateAndUploadPdf = async (
    inv: Invoice,
    supplier: BusinessEntity,
    buyer: BusinessEntity,
    items: InvoiceLineItem[],
    settings: InvoiceSettings | null
  ) => {
    setGeneratingPdf(true)
    try {
      const container = document.createElement('div')
      container.style.cssText = `
        position: fixed; left: -9999px; top: 0;
        width: 794px; background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #1a1f2e; padding: 40px;
      `
      container.innerHTML = buildInvoiceHtmlForPdf(inv, supplier, buyer, items, settings)
      document.body.appendChild(container)

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      })
      document.body.removeChild(container)

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * pageWidth) / canvas.width

      let yOffset = 0
      while (yOffset < imgHeight) {
        if (yOffset > 0) pdf.addPage()
        pdf.addImage(
          canvas.toDataURL('image/jpeg', 0.95),
          'JPEG',
          0,
          -yOffset,
          imgWidth,
          imgHeight
        )
        yOffset += pageHeight
      }

      const pdfBytes = pdf.output('arraybuffer')
      const storagePath = `${inv.supplierBusinessEntityId}/${inv.id}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(storagePath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadError) throw uploadError

      await supabase
        .from('invoices')
        .update({ pdf_url: storagePath })
        .eq('id', inv.id)

      const { data: signedData } = await supabase.storage
        .from('invoices')
        .createSignedUrl(storagePath, 3600)

      if (signedData?.signedUrl) {
        setPdfUrl(signedData.signedUrl)
      }

      toast.success('Invoice PDF ready')
    } catch (err) {
      console.error('PDF generation failed:', err)
      toast.error('Failed to generate PDF')
    } finally {
      setGeneratingPdf(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const inv = await dataStore.getInvoiceById(invoiceId)
        if (!inv) { onBack(); return }
        setInvoice(inv)

        const [items, supplier, buyer, settings] = await Promise.all([
          dataStore.getInvoiceLineItems(invoiceId),
          dataStore.getBusinessEntityById(inv.supplierBusinessEntityId),
          dataStore.getBusinessEntityById(inv.buyerBusinessEntityId),
          dataStore.getInvoiceSettings(inv.supplierBusinessEntityId),
        ])

        setLineItems(items)
        setSupplierBusiness(supplier || null)
        setBuyerBusiness(buyer || null)
        setInvoiceSettings(settings)

        if (inv.status === 'generated' && !inv.pdfUrl && supplier && buyer && inv.supplierBusinessEntityId === currentBusinessId) {
          generateAndUploadPdf(inv, supplier, buyer, items, settings)
        } else if (inv.pdfUrl) {
          const signedUrl = await dataStore.getSignedInvoiceUrl(inv.pdfUrl)
          if (signedUrl) {
            setPdfUrl(signedUrl)
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Failed to load invoice:', err)
        onBack()
      }
    }
    load()
  }, [invoiceId])

  const handleShare = async () => {
    if (!pdfUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice ${invoice?.invoiceNumber}`,
          text: `Invoice ${invoice?.invoiceNumber} from ${supplierBusiness?.businessName}`,
          url: pdfUrl,
        })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share error:', err)
        }
      }
    } else {
      await navigator.clipboard.writeText(pdfUrl)
    }
  }

  const handleDownload = () => {
    if (!pdfUrl) return
    window.open(pdfUrl, '_blank')
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: '#F2F4F8' }}>
        <div style={{ backgroundColor: '#0F1320', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center px-4" style={{ height: '44px' }}>
            <button onClick={onBack} className="flex items-center justify-center" style={{ minWidth: '44px', minHeight: '44px', color: '#FFFFFF' }}>
              <ArrowLeft size={20} />
            </button>
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Invoice</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <p style={{ fontSize: '14px', color: '#8492A6' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!invoice) return null

  // Group tax by rate for display
  const taxBreakdown: Record<number, number> = {}
  for (const item of lineItems) {
    if (item.taxRate > 0) {
      taxBreakdown[item.taxRate] = (taxBreakdown[item.taxRate] || 0) + item.taxAmount
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#F2F4F8' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#0F1320', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center px-4" style={{ height: '44px' }}>
          <button onClick={onBack} className="flex items-center justify-center" style={{ minWidth: '44px', minHeight: '44px', color: '#FFFFFF' }}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Invoice {invoice.invoiceNumber}</h1>
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        padding: '10px 16px',
        backgroundColor: isSupplier ? 'rgba(34,197,94,0.1)' : 'rgba(74,108,247,0.06)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        <div className="flex items-center gap-2">
          {isSupplier ? (
            <>
              <CheckCircle size={16} color="#22C55E" weight="fill" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#22C55E' }}>
                Invoice generated — buyer notified
              </span>
            </>
          ) : (
            <>
              <Info size={16} color="#4A6CF7" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#4A6CF7' }}>
                Invoice from {supplierBusiness?.businessName}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pt-4">
        {/* Invoice header card */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid rgba(0,0,0,0.08)',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F2E' }}>{supplierBusiness?.businessName}</p>
              {supplierBusiness?.gstNumber && <p style={{ fontSize: '12px', color: '#8492A6' }}>GSTIN: {supplierBusiness.gstNumber}</p>}
              {supplierBusiness?.businessAddress && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '1px' }}>{supplierBusiness.businessAddress}</p>}
            </div>
            <div style={{
              padding: '4px 10px',
              backgroundColor: 'rgba(74,108,247,0.08)',
              borderRadius: '6px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#4A6CF7' }}>TAX INVOICE</span>
            </div>
          </div>

          <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', margin: '12px 0' }} />

          <div className="flex gap-6">
            <div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase' }}>Invoice No.</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{invoice.invoiceNumber}</p>
            </div>
            <div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase' }}>Date</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{formatDate(invoice.invoiceDate)}</p>
            </div>
            {invoice.dueDate && (
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase' }}>Due Date</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{formatDate(invoice.dueDate)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Bill To */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid rgba(0,0,0,0.08)',
          padding: '14px',
          marginBottom: '16px',
        }}>
          <p style={{ fontSize: '10px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase', marginBottom: '4px' }}>Bill To</p>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1F2E' }}>{buyerBusiness?.businessName}</p>
          {buyerBusiness?.businessAddress && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>{buyerBusiness.businessAddress}</p>}
          {buyerBusiness?.gstNumber && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>GSTIN: {buyerBusiness.gstNumber}</p>}
          {invoice.placeOfSupply && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>Place of Supply: {invoice.placeOfSupply}</p>}
        </div>

        {/* Line items */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid rgba(0,0,0,0.08)',
          overflow: 'hidden',
          marginBottom: '16px',
        }}>
          {/* Header row */}
          <div className="flex items-center" style={{ padding: '8px 14px', backgroundColor: '#F7F8FA', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <span style={{ width: '24px', fontSize: '10px', fontWeight: 700, color: '#8492A6' }}>#</span>
            <span style={{ flex: 1, fontSize: '10px', fontWeight: 700, color: '#8492A6' }}>ITEM</span>
            <span style={{ width: '50px', fontSize: '10px', fontWeight: 700, color: '#8492A6', textAlign: 'center' }}>QTY</span>
            <span style={{ width: '70px', fontSize: '10px', fontWeight: 700, color: '#8492A6', textAlign: 'right' }}>RATE</span>
            <span style={{ width: '70px', fontSize: '10px', fontWeight: 700, color: '#8492A6', textAlign: 'right' }}>TOTAL</span>
          </div>

          {lineItems.map((item, i) => (
            <div key={item.id} className="flex items-start" style={{ padding: '10px 14px', borderBottom: i < lineItems.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
              <span style={{ width: '24px', fontSize: '12px', color: '#8492A6' }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{item.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.hsnCode && <span style={{ fontSize: '10px', color: '#4A6CF7', fontFamily: 'monospace' }}>HSN {item.hsnCode}</span>}
                  {item.taxRate > 0 && <span style={{ fontSize: '10px', color: '#E67E00' }}>GST {item.taxRate}%</span>}
                </div>
              </div>
              <span style={{ width: '50px', fontSize: '12px', textAlign: 'center', color: '#1A1F2E' }}>
                {item.quantity} {item.unit || ''}
              </span>
              <span style={{ width: '70px', fontSize: '12px', textAlign: 'right', color: '#1A1F2E' }}>
                {formatInrCurrency(item.rate)}
              </span>
              <span style={{ width: '70px', fontSize: '12px', fontWeight: 600, textAlign: 'right', color: '#1A1F2E' }}>
                {formatInrCurrency(item.totalAmount)}
              </span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid rgba(0,0,0,0.08)',
          overflow: 'hidden',
          marginBottom: '24px',
        }}>
          <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: '12px', color: '#8492A6' }}>Taxable amount</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{formatInrCurrency(invoice.taxableAmount)}</span>
          </div>

          {Object.entries(taxBreakdown).map(([rate, amount]) => {
            const rateNum = Number(rate)
            if (invoice.isInterState) {
              return (
                <div key={rate} className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <span style={{ fontSize: '12px', color: '#8492A6' }}>IGST @{rateNum}%</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{formatInrCurrency(amount)}</span>
                </div>
              )
            }
            return (
              <div key={rate}>
                <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <span style={{ fontSize: '12px', color: '#8492A6' }}>CGST @{rateNum / 2}%</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{formatInrCurrency(amount / 2)}</span>
                </div>
                <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <span style={{ fontSize: '12px', color: '#8492A6' }}>SGST @{rateNum / 2}%</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{formatInrCurrency(amount / 2)}</span>
                </div>
              </div>
            )
          })}

          <div className="flex items-center justify-between" style={{ padding: '12px 14px', backgroundColor: 'rgba(74,108,247,0.04)' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A1F2E' }}>Total amount</span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A1F2E' }}>{formatInrCurrency(invoice.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex gap-3 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <button
          onClick={handleShare}
          disabled={generatingPdf || !pdfUrl}
          className="flex items-center justify-center gap-2"
          style={{
            flex: 1,
            padding: '14px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#4A6CF7',
            backgroundColor: 'rgba(74,108,247,0.06)',
            borderRadius: '14px',
            border: '1px solid rgba(74,108,247,0.2)',
            cursor: generatingPdf || !pdfUrl ? 'not-allowed' : 'pointer',
            opacity: generatingPdf || !pdfUrl ? 0.5 : 1,
          }}
        >
          <ShareNetwork size={18} />
          Share
        </button>
        <button
          onClick={handleDownload}
          disabled={generatingPdf || !pdfUrl}
          className="flex items-center justify-center gap-2"
          style={{
            flex: 1,
            padding: '14px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#FFFFFF',
            backgroundColor: '#4A6CF7',
            borderRadius: '14px',
            border: 'none',
            cursor: generatingPdf || !pdfUrl ? 'not-allowed' : 'pointer',
            opacity: generatingPdf || !pdfUrl ? 0.5 : 1,
          }}
        >
          <DownloadSimple size={18} />
          {generatingPdf ? 'Generating...' : 'Download'}
        </button>
      </div>
    </div>
  )
}
