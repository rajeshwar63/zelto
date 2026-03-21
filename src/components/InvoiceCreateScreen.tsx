import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, X, Receipt } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { supabase, supabaseDirect } from '@/lib/supabase-client'
import { toast } from 'sonner'
import { formatInrCurrency } from '@/lib/utils'
import { ItemPickerSheet, type PickedItem } from './ItemPickerSheet'
import type { BusinessEntity, Connection, InvoiceSettings } from '@/lib/types'

interface LineItem {
  id: string
  itemMasterId?: string
  name: string
  hsnCode: string | null
  quantity: number
  unit: string
  rate: number
  taxRate: number
  taxableAmount: number
  taxAmount: number
  totalAmount: number
}

interface Props {
  orderId: string
  connectionId: string
  currentBusinessId: string
  onBack: () => void
  onInvoiceCreated: (invoiceId: string) => void
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

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

let lineItemCounter = 0

export function InvoiceCreateScreen({ orderId, connectionId, currentBusinessId, onBack, onInvoiceCreated }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [supplierBusiness, setSupplierBusiness] = useState<BusinessEntity | null>(null)
  const [buyerBusiness, setBuyerBusiness] = useState<BusinessEntity | null>(null)
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)

  const [invoiceNumber, setInvoiceNumber] = useState('Auto')
  const [invoiceDate] = useState(formatDate(new Date()))
  const [dueDate, setDueDate] = useState('')
  const [placeOfSupply, setPlaceOfSupply] = useState('')
  const [isInterState, setIsInterState] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [conn, settingsData] = await Promise.all([
          dataStore.getConnectionById(connectionId),
          dataStore.getInvoiceSettings(currentBusinessId),
        ])

        if (!conn) { onBack(); return }
        setConnection(conn)
        setSettings(settingsData)

        const supplierBizId = conn.supplierBusinessId
        const buyerBizId = conn.buyerBusinessId

        const [supplier, buyer] = await Promise.all([
          dataStore.getBusinessEntityById(supplierBizId),
          dataStore.getBusinessEntityById(buyerBizId),
        ])

        setSupplierBusiness(supplier || null)
        setBuyerBusiness(buyer || null)

        // Pre-fill due date
        const defaultDays = settingsData?.defaultDueDays ?? 7
        setDueDate(formatDate(addDays(new Date(), defaultDays)))

        // Determine place of supply and inter-state
        const buyerState = extractState(buyer?.businessAddress)
        const supplierState = extractState(supplier?.businessAddress)
        setPlaceOfSupply(buyerState || '')

        if (buyerState && supplierState) {
          setIsInterState(buyerState.toLowerCase() !== supplierState.toLowerCase())
        }

        // Preview invoice number
        const prefix = settingsData?.invoicePrefix || 'INV-'
        const num = settingsData?.nextInvoiceNumber || 1
        setInvoiceNumber(`${prefix}${num}`)

        setLoading(false)
      } catch (err) {
        console.error('Failed to load invoice data:', err)
        toast.error('Failed to load data')
        onBack()
      }
    }
    load()
  }, [orderId, connectionId, currentBusinessId])

  const handleAddItem = (picked: PickedItem) => {
    const taxableAmount = picked.quantity * picked.rate
    const taxAmount = (taxableAmount * picked.taxRate) / 100
    const totalAmount = taxableAmount + taxAmount

    lineItemCounter++
    setLineItems(prev => [...prev, {
      id: `temp-${lineItemCounter}`,
      itemMasterId: picked.itemMasterId,
      name: picked.name,
      hsnCode: picked.hsnCode,
      quantity: picked.quantity,
      unit: picked.unit,
      rate: picked.rate,
      taxRate: picked.taxRate,
      taxableAmount,
      taxAmount,
      totalAmount,
    }])
  }

  const handleRemoveItem = (id: string) => {
    setLineItems(prev => prev.filter(i => i.id !== id))
  }

  // Calculate totals
  const subtotal = lineItems.reduce((sum, i) => sum + i.taxableAmount, 0)
  const totalTax = lineItems.reduce((sum, i) => sum + i.taxAmount, 0)
  const totalCgst = isInterState ? 0 : totalTax / 2
  const totalSgst = isInterState ? 0 : totalTax / 2
  const totalIgst = isInterState ? totalTax : 0
  const totalAmount = subtotal + totalTax

  // Group tax by rate for display
  const taxBreakdown: Record<number, number> = {}
  for (const item of lineItems) {
    if (item.taxRate > 0) {
      taxBreakdown[item.taxRate] = (taxBreakdown[item.taxRate] || 0) + item.taxAmount
    }
  }

  const handleSave = async (status: 'draft' | 'generated') => {
    if (lineItems.length === 0) {
      toast.error('Add at least one item')
      return
    }

    setSaving(true)
    try {
      // Get actual invoice number from RPC (atomic)
      const actualInvoiceNumber = await dataStore.getNextInvoiceNumber(currentBusinessId)

      const invoice = await dataStore.createInvoice({
        orderId,
        supplierBusinessEntityId: supplierBusiness!.id,
        buyerBusinessEntityId: buyerBusiness!.id,
        invoiceNumber: actualInvoiceNumber,
        invoiceDate,
        dueDate: dueDate || undefined,
        placeOfSupply: placeOfSupply || undefined,
        subtotal,
        taxableAmount: subtotal,
        totalCgst,
        totalSgst,
        totalIgst,
        totalAmount,
        isInterState,
        status,
      })

      await dataStore.createInvoiceLineItems(lineItems.map((item, i) => ({
        invoiceId: invoice.id,
        itemMasterId: item.itemMasterId,
        name: item.name,
        hsnCode: item.hsnCode || undefined,
        quantity: item.quantity,
        unit: item.unit || undefined,
        rate: item.rate,
        taxRate: item.taxRate,
        taxableAmount: item.taxableAmount,
        taxAmount: item.taxAmount,
        totalAmount: item.totalAmount,
        sortOrder: i,
      })))

      if (status === 'generated') {
        // Call edge function to generate PDF
        try {
          const { error: fnError } = await supabaseDirect.functions.invoke('generate-invoice', {
            body: { invoice_id: invoice.id, businessId: currentBusinessId },
          })

          if (fnError) {
            console.error('PDF generation failed:', fnError)
            toast.error('Invoice saved but PDF generation failed')
          }
        } catch (pdfErr) {
          console.error('PDF generation error:', pdfErr)
          toast.error('Invoice saved but PDF generation failed')
        }
      }

      emitDataChange('invoices:changed')
      toast.success(status === 'draft' ? 'Draft saved' : 'Invoice generated')
      onInvoiceCreated(invoice.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setSaving(false)
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
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Create invoice</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <p style={{ fontSize: '14px', color: '#8492A6' }}>Loading...</p>
        </div>
      </div>
    )
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: '#8492A6',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '6px',
    paddingLeft: '2px',
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid rgba(0,0,0,0.08)',
    overflow: 'hidden',
    marginBottom: '16px',
  }

  const fieldRow = (label: string, value: string, badge?: string) => (
    <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
      <span style={{ fontSize: '12px', color: '#8492A6' }}>{label}</span>
      <div className="flex items-center gap-2">
        {badge && (
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#4A6CF7', backgroundColor: 'rgba(74,108,247,0.08)', padding: '1px 6px', borderRadius: '4px' }}>
            {badge}
          </span>
        )}
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{value}</span>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#F2F4F8' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#0F1320', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center px-4" style={{ height: '44px' }}>
          <button onClick={onBack} className="flex items-center justify-center" style={{ minWidth: '44px', minHeight: '44px', color: '#FFFFFF' }}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Create invoice</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pt-4">
        {/* Invoice details */}
        <p style={labelStyle}>INVOICE DETAILS</p>
        <div style={cardStyle}>
          {fieldRow('Invoice no.', invoiceNumber, 'Auto')}
          {fieldRow('Invoice date', invoiceDate)}
          <div className="flex items-center justify-between" style={{ padding: '6px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: '12px', color: '#8492A6' }}>Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#1A1F2E',
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                textAlign: 'right',
              }}
            />
          </div>
          {fieldRow('Place of supply', placeOfSupply || '—', placeOfSupply ? 'Auto' : undefined)}
        </div>

        {/* Bill To */}
        <p style={labelStyle}>BILL TO</p>
        <div style={{ ...cardStyle, padding: '12px 14px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1F2E' }}>{buyerBusiness?.businessName}</p>
          {buyerBusiness?.businessAddress && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>{buyerBusiness.businessAddress}</p>}
          {buyerBusiness?.gstNumber && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>GSTIN: {buyerBusiness.gstNumber}</p>}
        </div>

        {/* Items */}
        <p style={labelStyle}>ITEMS</p>
        {lineItems.length > 0 && (
          <div style={cardStyle}>
            {lineItems.map((item, i) => (
              <div key={item.id} style={{ padding: '10px 14px', borderBottom: i < lineItems.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                <div className="flex items-start justify-between">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{item.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.hsnCode && (
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#4A6CF7', backgroundColor: 'rgba(74,108,247,0.08)', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>
                          HSN {item.hsnCode}
                        </span>
                      )}
                      {item.taxRate > 0 && (
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#E67E00', backgroundColor: 'rgba(230,126,0,0.08)', padding: '1px 5px', borderRadius: '3px' }}>
                          GST {item.taxRate}%
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: '#8492A6', marginTop: '3px' }}>
                      {item.quantity} {item.unit} x {formatInrCurrency(item.rate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>
                      {formatInrCurrency(item.totalAmount)}
                    </span>
                    <button onClick={() => handleRemoveItem(item.id)} style={{ color: '#E53535', padding: '4px' }}>
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowPicker(true)}
          className="w-full flex items-center justify-center gap-2"
          style={{
            padding: '12px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#4A6CF7',
            backgroundColor: 'rgba(74,108,247,0.06)',
            border: '1px dashed rgba(74,108,247,0.3)',
            borderRadius: '12px',
            cursor: 'pointer',
            marginBottom: '16px',
          }}
        >
          <Plus size={16} weight="bold" />
          Add item
        </button>

        {/* Summary */}
        {lineItems.length > 0 && (
          <>
            <p style={labelStyle}>SUMMARY</p>
            <div style={{ ...cardStyle, padding: '0' }}>
              <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <span style={{ fontSize: '12px', color: '#8492A6' }}>Taxable amount</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{formatInrCurrency(subtotal)}</span>
              </div>

              {Object.entries(taxBreakdown).map(([rate, amount]) => {
                const rateNum = Number(rate)
                if (isInterState) {
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
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1A1F2E' }}>Total amount</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1A1F2E' }}>{formatInrCurrency(totalAmount)}</span>
              </div>
              <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: '11px', color: '#8492A6', fontStyle: 'italic' }}>{toWords(totalAmount)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-3 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <button
          onClick={() => handleSave('draft')}
          disabled={saving || lineItems.length === 0}
          style={{
            flex: 1,
            padding: '14px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#1A1F2E',
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid rgba(0,0,0,0.08)',
            cursor: 'pointer',
            opacity: saving || lineItems.length === 0 ? 0.5 : 1,
          }}
        >
          Save draft
        </button>
        <button
          onClick={() => handleSave('generated')}
          disabled={saving || lineItems.length === 0}
          style={{
            flex: 1.5,
            padding: '14px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#FFFFFF',
            backgroundColor: '#4A6CF7',
            borderRadius: '14px',
            border: 'none',
            cursor: 'pointer',
            opacity: saving || lineItems.length === 0 ? 0.5 : 1,
          }}
        >
          {saving ? 'Generating...' : 'Generate & share'}
        </button>
      </div>

      {/* Item picker sheet */}
      {showPicker && (
        <ItemPickerSheet
          currentBusinessId={currentBusinessId}
          onDismiss={() => setShowPicker(false)}
          onAddItem={handleAddItem}
        />
      )}
    </div>
  )
}

function extractState(address?: string): string {
  if (!address) return ''
  // Try to extract state from Indian address (last significant part before pincode)
  const statePatterns = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Chandigarh', 'Puducherry', 'Jammu and Kashmir', 'Ladakh',
  ]

  const upper = address.toLowerCase()
  for (const state of statePatterns) {
    if (upper.includes(state.toLowerCase())) return state
  }
  return ''
}
