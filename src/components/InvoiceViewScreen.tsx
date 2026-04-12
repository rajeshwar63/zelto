import { useState, useEffect } from 'react'
import { ArrowLeft, DownloadSimple, ShareNetwork, Receipt, CheckCircle, Info, SpinnerGap } from '@phosphor-icons/react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { dataStore } from '@/lib/data-store'
import { supabaseDirect } from '@/lib/supabase-client'
import { toast } from 'sonner'
import { formatInrCurrency } from '@/lib/utils'
import type { Invoice, InvoiceLineItem, BusinessEntity } from '@/lib/types'

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
  const [downloading, setDownloading] = useState(false)
  const [sharing, setSharing] = useState(false)

  const isSupplier = invoice?.supplierBusinessEntityId === currentBusinessId

  useEffect(() => {
    const load = async () => {
      try {
        const inv = await dataStore.getInvoiceById(invoiceId)
        if (!inv) { onBack(); return }
        setInvoice(inv)

        const [items, supplier, buyer] = await Promise.all([
          dataStore.getInvoiceLineItems(invoiceId),
          dataStore.getBusinessEntityById(inv.supplierBusinessEntityId),
          dataStore.getBusinessEntityById(inv.buyerBusinessEntityId),
        ])

        setLineItems(items)
        setSupplierBusiness(supplier || null)
        setBuyerBusiness(buyer || null)

        if (inv.pdfUrl) {
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
    if (!pdfUrl || !invoice) return
    setSharing(true)

    const fileName = `invoice-${invoice.invoiceNumber || 'unknown'}.pdf`

    try {
      if (Capacitor.isNativePlatform()) {
        // NATIVE: fetch blob → write to temp file → share via native sheet
        const response = await fetch(pdfUrl)
        if (!response.ok) throw new Error('Failed to fetch PDF')
        const blob = await response.blob()

        // Convert blob to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => {
            const result = reader.result as string
            // Remove data:application/pdf;base64, prefix
            resolve(result.split(',')[1])
          }
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })

        // Write to temp cache directory
        const fileResult = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
        })

        // Share the actual file
        await Share.share({
          title: `Invoice ${invoice.invoiceNumber}`,
          text: `Invoice ${invoice.invoiceNumber} from ${supplierBusiness?.businessName || 'Supplier'} — ₹${invoice.totalAmount.toLocaleString('en-IN')}`,
          url: fileResult.uri,
          dialogTitle: 'Share invoice',
        })

      } else {
        // WEB: try sharing as file first, fall back to URL copy
        try {
          const response = await fetch(pdfUrl)
          if (!response.ok) throw new Error('fetch failed')
          const blob = await response.blob()
          const file = new File([blob], fileName, { type: 'application/pdf' })

          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `Invoice ${invoice.invoiceNumber}`,
              files: [file],
            })
          } else {
            // Fallback: copy signed URL to clipboard
            await navigator.clipboard.writeText(pdfUrl)
            toast.success('Invoice link copied to clipboard')
          }
        } catch (webErr) {
          if ((webErr as Error).name === 'AbortError') return // User cancelled
          // Final fallback
          await navigator.clipboard.writeText(pdfUrl)
          toast.success('Invoice link copied to clipboard')
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return // User cancelled share sheet
      console.error('Share error:', err)
      toast.error('Failed to share invoice')
    } finally {
      setSharing(false)
    }
  }

  const handleDownload = async () => {
    if (!pdfUrl) return
    setDownloading(true)
    try {
      const response = await fetch(pdfUrl)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `invoice-${invoice?.invoiceNumber || 'unknown'}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('Download failed:', err)
      toast.error('Failed to download PDF')
    } finally {
      setDownloading(false)
    }
  }

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true)
    try {
      // Refresh session to ensure a valid token
      const { data: { user }, error: userError } = await supabaseDirect.auth.getUser()
      if (!user || userError) {
        toast.error('Please log in again')
        return
      }

      const { error: fnError } = await supabaseDirect.functions.invoke('generate-invoice', {
        body: { invoice_id: invoiceId, businessId: currentBusinessId },
      })
      if (fnError) throw fnError

      // Refresh invoice to get new pdfUrl
      const inv = await dataStore.getInvoiceById(invoiceId)
      if (inv?.pdfUrl) {
        const signedUrl = await dataStore.getSignedInvoiceUrl(inv.pdfUrl)
        if (signedUrl) setPdfUrl(signedUrl)
        setInvoice(inv)
        toast.success('PDF generated')
      } else {
        toast.error('PDF generation completed but no URL returned')
      }
    } catch (err) {
      console.error('PDF generation failed:', err)
      toast.error('Failed to generate PDF')
    } finally {
      setGeneratingPdf(false)
    }
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
        {!pdfUrl && (
          <button
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
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
              cursor: generatingPdf ? 'not-allowed' : 'pointer',
              opacity: generatingPdf ? 0.7 : 1,
            }}
          >
            {generatingPdf ? (
              <>
                <SpinnerGap size={18} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Receipt size={18} />
                Generate PDF
              </>
            )}
          </button>
        )}
        <button
          onClick={handleShare}
          disabled={!pdfUrl || sharing}
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
            cursor: (!pdfUrl || sharing) ? 'not-allowed' : 'pointer',
            opacity: (!pdfUrl || sharing) ? 0.5 : 1,
          }}
        >
          {sharing ? <SpinnerGap size={18} className="animate-spin" /> : <ShareNetwork size={18} />}
          {sharing ? 'Sharing...' : 'Share'}
        </button>
        <button
          onClick={handleDownload}
          disabled={!pdfUrl || downloading}
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
            cursor: (!pdfUrl || downloading) ? 'not-allowed' : 'pointer',
            opacity: (!pdfUrl || downloading) ? 0.5 : 1,
          }}
        >
          {downloading ? <SpinnerGap size={18} className="animate-spin" /> : <DownloadSimple size={18} />}
          {downloading ? 'Downloading...' : 'Download'}
        </button>
      </div>
    </div>
  )
}
