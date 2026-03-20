import { useState, useEffect } from 'react'
import { ArrowLeft, Trash } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { toast } from 'sonner'
import type { ItemMaster } from '@/lib/types'

const GST_RATES = [
  { label: '0% — Exempt', value: 0 },
  { label: '5%', value: 5 },
  { label: '12%', value: 12 },
  { label: '18%', value: 18 },
  { label: '28%', value: 28 },
  { label: '40% — Beverages', value: 40 },
]

interface Props {
  currentBusinessId: string
  itemId?: string
  onBack: () => void
}

export function ItemCreateScreen({ currentBusinessId, itemId, onBack }: Props) {
  const isEdit = !!itemId
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [hsnCode, setHsnCode] = useState('')
  const [taxRate, setTaxRate] = useState<number | null>(null)
  const [salePrice, setSalePrice] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')

  useEffect(() => {
    if (!itemId) return
    dataStore.getItemById(itemId).then(item => {
      if (!item) { onBack(); return }
      setName(item.name)
      setHsnCode(item.hsnCode || '')
      setTaxRate(item.taxRate)
      setSalePrice(item.salePrice != null ? String(item.salePrice) : '')
      setPurchasePrice(item.purchasePrice != null ? String(item.purchasePrice) : '')
      setLoading(false)
    }).catch(() => { onBack() })
  }, [itemId])

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Item name is required')
      return
    }

    setSaving(true)
    try {
      const data = {
        name: trimmedName,
        hsnCode: hsnCode.trim() || null,
        taxRate,
        salePrice: salePrice ? parseFloat(salePrice) : null,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      }

      if (isEdit && itemId) {
        await dataStore.updateItem(itemId, data)
        toast.success('Item updated')
      } else {
        await dataStore.createItem(currentBusinessId, { ...data, hsnCode: data.hsnCode || undefined, taxRate: data.taxRate ?? undefined, salePrice: data.salePrice ?? undefined, purchasePrice: data.purchasePrice ?? undefined })
        toast.success('Item saved')
      }
      emitDataChange('items:changed')
      onBack()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!itemId) return
    setSaving(true)
    try {
      await dataStore.deactivateItem(itemId)
      toast.success('Item deleted')
      emitDataChange('items:changed')
      onBack()
    } catch (err) {
      toast.error('Failed to delete item')
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
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Loading...</h1>
          </div>
        </div>
      </div>
    )
  }

  const inputContainerStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid rgba(0,0,0,0.08)',
    overflow: 'hidden',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 14px',
    fontSize: '14px',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: '#1A1F2E',
    fontFamily: 'inherit',
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

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#F2F4F8' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#0F1320', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center px-4" style={{ height: '44px' }}>
          <button onClick={onBack} className="flex items-center justify-center" style={{ minWidth: '44px', minHeight: '44px', color: '#FFFFFF' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>
              {isEdit ? 'Edit item' : 'New item'}
            </h1>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Item master</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto px-4 pt-4">
        {/* Item details */}
        <p style={labelStyle}>ITEM DETAILS</p>
        <div style={{ ...inputContainerStyle, marginBottom: '16px' }}>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Item name *"
              style={inputStyle}
            />
          </div>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <input
              type="text"
              value={hsnCode}
              onChange={e => setHsnCode(e.target.value)}
              placeholder="HSN code"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <select
              value={taxRate ?? ''}
              onChange={e => setTaxRate(e.target.value === '' ? null : Number(e.target.value))}
              style={{ ...inputStyle, color: taxRate == null ? '#8492A6' : '#1A1F2E', appearance: 'none', cursor: 'pointer' }}
            >
              <option value="">Tax rate (GST)</option>
              {GST_RATES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Pricing */}
        <p style={labelStyle}>PRICING</p>
        <div style={{ ...inputContainerStyle, marginBottom: '8px' }}>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <input
              type="number"
              inputMode="decimal"
              value={salePrice}
              onChange={e => setSalePrice(e.target.value)}
              placeholder="Sale price"
              style={inputStyle}
            />
          </div>
          <div>
            <input
              type="number"
              inputMode="decimal"
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)}
              placeholder="Purchase price (cost)"
              style={inputStyle}
            />
          </div>
        </div>
        <p style={{ fontSize: '11px', color: '#8492A6', paddingLeft: '2px', marginBottom: '24px' }}>
          Purchase price is only visible to you — it never appears on invoices.
        </p>

        {/* Delete button (edit mode only) */}
        {isEdit && (
          <button
            onClick={handleDelete}
            disabled={saving}
            className="flex items-center justify-center gap-2 w-full"
            style={{
              color: '#E53535',
              fontSize: '14px',
              fontWeight: 600,
              padding: '12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Trash size={16} />
            Delete item
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-3 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <button
          onClick={onBack}
          disabled={saving}
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
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            flex: 1,
            padding: '14px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#FFFFFF',
            backgroundColor: '#4A6CF7',
            borderRadius: '14px',
            border: 'none',
            cursor: 'pointer',
            opacity: saving || !name.trim() ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save item'}
        </button>
      </div>
    </div>
  )
}
