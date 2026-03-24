import { useState } from 'react'
import { respondToOpeningBalance } from '@/lib/interactions'
import type { OpeningBalance, BusinessEntity, Connection } from '@/lib/types'
import { formatInrCurrency } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  openingBalance: OpeningBalance
  connection: Connection
  currentBusinessId: string
  otherBusiness: BusinessEntity
}

export function OpeningBalanceResponseSheet({
  isOpen,
  onClose,
  openingBalance,
  connection,
  currentBusinessId,
  otherBusiness,
}: Props) {
  const [action, setAction] = useState<'agree' | 'counter' | 'dispute' | null>(null)
  const [counterAmount, setCounterAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const ob = openingBalance
  const isProposedBySupplier = ob.proposedByBusinessId === connection.supplierBusinessId

  const handleSubmit = async () => {
    if (!action) return

    if (action === 'counter') {
      const val = parseFloat(counterAmount)
      if (!val || val <= 0) {
        toast.error('Enter a valid counter amount')
        return
      }
    }

    setSubmitting(true)
    try {
      await respondToOpeningBalance(
        ob.id,
        currentBusinessId,
        action,
        action === 'counter' ? parseFloat(counterAmount) : undefined
      )
      toast.success(
        action === 'agree' ? 'Opening balance agreed'
        : action === 'counter' ? 'Counter amount submitted'
        : 'Opening balance disputed'
      )
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to respond')
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
        className="w-full max-h-[80vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderTopLeftRadius: 'var(--radius-modal)',
          borderTopRightRadius: 'var(--radius-modal)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={e => e.stopPropagation()}
      >
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
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {isProposedBySupplier
              ? `${otherBusiness.businessName} says you owe`
              : `${otherBusiness.businessName} says they owe you`}
          </p>
          <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
            {formatInrCurrency(ob.amount)}
          </p>

          {ob.lineItems.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '10px', backgroundColor: 'var(--bg-screen)' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Line items</p>
              {ob.lineItems.map((item, idx) => (
                <div key={item.id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-primary)', padding: '4px 0' }}>
                  <span>{item.description}</span>
                  <span>{formatInrCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {ob.note && (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', fontStyle: 'italic' }}>
              "{ob.note}"
            </p>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => { setAction('agree'); handleSubmit() }}
              disabled={submitting}
              style={{
                width: '100%', fontSize: '15px', fontWeight: 600, padding: '14px',
                borderRadius: '12px', backgroundColor: 'var(--status-delivered)', color: '#fff',
                border: 'none', cursor: 'pointer', opacity: submitting ? 0.5 : 1,
              }}
            >
              Agree
            </button>

            {action === 'counter' ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', color: 'var(--text-secondary)' }}>₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={counterAmount}
                    onChange={e => setCounterAmount(e.target.value)}
                    placeholder="Your amount"
                    autoFocus
                    style={{
                      width: '100%', fontSize: '15px', padding: '12px 14px 12px 30px',
                      borderRadius: '12px', border: '1px solid var(--border-light)',
                      backgroundColor: 'var(--bg-screen)', color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !counterAmount}
                  style={{
                    fontSize: '15px', fontWeight: 600, padding: '12px 20px',
                    borderRadius: '12px', backgroundColor: 'var(--brand-primary)', color: '#fff',
                    border: 'none', cursor: 'pointer', opacity: submitting || !counterAmount ? 0.5 : 1,
                  }}
                >
                  Submit
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAction('counter')}
                disabled={submitting}
                style={{
                  width: '100%', fontSize: '15px', fontWeight: 600, padding: '14px',
                  borderRadius: '12px', backgroundColor: 'transparent', color: 'var(--brand-primary)',
                  border: '1px solid var(--brand-primary)', cursor: 'pointer',
                }}
              >
                Suggest Different Amount
              </button>
            )}

            <button
              onClick={() => { setAction('dispute'); handleSubmit() }}
              disabled={submitting}
              style={{
                width: '100%', fontSize: '14px', fontWeight: 500, padding: '12px',
                borderRadius: '12px', backgroundColor: 'transparent', color: 'var(--status-overdue)',
                border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Dispute
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
