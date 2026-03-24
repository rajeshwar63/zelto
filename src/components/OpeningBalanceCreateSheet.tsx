import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { proposeOpeningBalance } from '@/lib/interactions'
import { dataStore } from '@/lib/data-store'
import type { Connection, BusinessEntity, OpeningBalance, OpeningBalanceLineItem } from '@/lib/types'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  connection: Connection
  currentBusinessId: string
  otherBusiness: BusinessEntity
  existingBalance?: OpeningBalance | null
}

export function OpeningBalanceCreateSheet({
  isOpen,
  onClose,
  connection,
  currentBusinessId,
  otherBusiness,
  existingBalance,
}: Props) {
  const [amount, setAmount] = useState(existingBalance?.amount?.toString() || '')
  const [note, setNote] = useState(existingBalance?.note || '')
  const [lineItems, setLineItems] = useState<Array<{ id: string; description: string; amount: string }>>(
    existingBalance?.lineItems?.length
      ? existingBalance.lineItems.map(li => ({ id: li.id, description: li.description, amount: li.amount.toString() }))
      : []
  )
  const [submitting, setSubmitting] = useState(false)

  const isSupplier = connection.supplierBusinessId === currentBusinessId

  const addLineItem = () => {
    if (lineItems.length >= 10) {
      toast.error('Maximum 10 line items allowed')
      return
    }
    setLineItems([...lineItems, { id: uuidv4(), description: '', amount: '' }])
  }

  const removeLineItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx))
  }

  const updateLineItem = (idx: number, field: 'description' | 'amount', value: string) => {
    const updated = [...lineItems]
    updated[idx] = { ...updated[idx], [field]: value }
    setLineItems(updated)
  }

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (numAmount > 10000000) {
      toast.error('Amount cannot exceed ₹1,00,00,000')
      return
    }

    const parsedLineItems: OpeningBalanceLineItem[] = lineItems
      .filter(li => li.description.trim() && li.amount.trim())
      .map(li => ({
        id: li.id,
        description: li.description.trim(),
        amount: parseFloat(li.amount) || 0,
      }))

    if (parsedLineItems.length > 0) {
      const lineItemSum = parsedLineItems.reduce((sum, li) => sum + li.amount, 0)
      if (Math.abs(lineItemSum - numAmount) > 0.01) {
        toast.error(`Line items sum (₹${lineItemSum.toLocaleString('en-IN')}) doesn't match total (₹${numAmount.toLocaleString('en-IN')})`)
        return
      }
    }

    setSubmitting(true)
    try {
      if (existingBalance && existingBalance.status === 'disputed') {
        // Re-proposing on disputed balance
        await dataStore.updateOpeningBalanceForReproposal(
          existingBalance.id,
          numAmount,
          currentBusinessId,
          parsedLineItems,
          note.trim() || null
        )
        toast.success('Opening balance re-submitted for confirmation')
      } else {
        await proposeOpeningBalance(
          connection.id,
          currentBusinessId,
          numAmount,
          parsedLineItems,
          note.trim() || null
        )
        toast.success('Opening balance submitted for confirmation')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderTopLeftRadius: 'var(--radius-modal)',
          borderTopRightRadius: 'var(--radius-modal)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>Opening Balance</h2>
          <button
            onClick={onClose}
            style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4">
          {/* Direction label */}
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {isSupplier
              ? `How much does ${otherBusiness.businessName} owe you?`
              : `How much do you owe ${otherBusiness.businessName}?`}
          </p>

          {/* Amount input */}
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>₹</span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              style={{
                width: '100%', fontSize: '22px', fontWeight: 700, padding: '12px 14px 12px 36px',
                borderRadius: '12px', border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-screen)', color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Line items */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Add line items <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional)</span>
            </p>
            {lineItems.map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={item.description}
                  onChange={e => updateLineItem(idx, 'description', e.target.value)}
                  placeholder="Description"
                  maxLength={100}
                  style={{
                    flex: 2, fontSize: '13px', padding: '8px 12px', borderRadius: '10px',
                    border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-screen)',
                    color: 'var(--text-primary)',
                  }}
                />
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--text-secondary)' }}>₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={e => updateLineItem(idx, 'amount', e.target.value)}
                    placeholder="0"
                    style={{
                      width: '100%', fontSize: '13px', padding: '8px 10px 8px 26px', borderRadius: '10px',
                      border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-screen)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <button
                  onClick={() => removeLineItem(idx)}
                  style={{ fontSize: '18px', color: 'var(--text-secondary)', padding: '4px 8px', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  ×
                </button>
              </div>
            ))}
            {lineItems.length < 10 && (
              <button
                onClick={addLineItem}
                style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                }}
              >
                + Add another
              </button>
            )}
          </div>

          {/* Note */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Note <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional)</span>
            </p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note..."
              style={{
                width: '100%', fontSize: '13px', padding: '10px 12px', borderRadius: '10px',
                border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-screen)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !amount}
            style={{
              width: '100%', fontSize: '15px', fontWeight: 600, padding: '14px',
              borderRadius: '12px', backgroundColor: 'var(--brand-primary)', color: '#fff',
              border: 'none', cursor: 'pointer', opacity: submitting || !amount ? 0.5 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit for confirmation'}
          </button>
        </div>
      </div>
    </div>
  )
}
