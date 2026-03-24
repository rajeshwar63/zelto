import { useState } from 'react'
import type { OpeningBalance, BusinessEntity, Connection } from '@/lib/types'
import { formatInrCurrency } from '@/lib/utils'
import { respondToOpeningBalance, acceptCounterAmount, recordOpeningBalancePayment } from '@/lib/interactions'
import { toast } from 'sonner'
import { ClipboardText } from '@phosphor-icons/react'

interface Props {
  openingBalance: OpeningBalance | null
  connection: Connection
  currentBusinessId: string
  otherBusiness: BusinessEntity
  onCreateOpeningBalance: () => void
}

export function OpeningBalanceCard({
  openingBalance,
  connection,
  currentBusinessId,
  otherBusiness,
  onCreateOpeningBalance,
}: Props) {
  const [showPaymentInput, setShowPaymentInput] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showCounterInput, setShowCounterInput] = useState(false)
  const [counterValue, setCounterValue] = useState('')

  const isSupplier = connection.supplierBusinessId === currentBusinessId
  const isBuyer = connection.buyerBusinessId === currentBusinessId
  const isProposer = openingBalance?.proposedByBusinessId === currentBusinessId
  const isResponder = openingBalance !== null && !isProposer

  // No opening balance — show creation prompt
  if (!openingBalance) {
    return (
      <button
        onClick={onCreateOpeningBalance}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-light)',
          padding: '14px 16px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: 'var(--brand-primary-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <ClipboardText size={18} weight="regular" style={{ color: 'var(--brand-primary)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
            Record Opening Balance
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Declare any outstanding dues from before Zelto
          </p>
        </div>
        <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>→</span>
      </button>
    )
  }

  const ob = openingBalance
  const remaining = ob.agreedAmount !== null ? ob.agreedAmount - ob.totalPaid : null
  const progressPct = ob.agreedAmount !== null && ob.agreedAmount > 0
    ? Math.min(100, (ob.totalPaid / ob.agreedAmount) * 100)
    : 0

  const handleAgree = async () => {
    setSubmitting(true)
    try {
      await respondToOpeningBalance(ob.id, currentBusinessId, 'agree')
      toast.success('Opening balance agreed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to agree')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDispute = async () => {
    setSubmitting(true)
    try {
      await respondToOpeningBalance(ob.id, currentBusinessId, 'dispute')
      toast.success('Opening balance disputed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispute')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitCounter = async () => {
    const val = parseFloat(counterValue)
    if (!val || val <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setSubmitting(true)
    try {
      await respondToOpeningBalance(ob.id, currentBusinessId, 'counter', val)
      toast.success('Counter amount submitted')
      setShowCounterInput(false)
      setCounterValue('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit counter')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAcceptCounter = async () => {
    setSubmitting(true)
    try {
      await acceptCounterAmount(ob.id, currentBusinessId)
      toast.success('Counter amount accepted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRecordPayment = async () => {
    const val = parseFloat(paymentAmount)
    if (!val || val <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (remaining !== null && val > remaining) {
      toast.error('Amount exceeds remaining balance')
      return
    }
    setSubmitting(true)
    try {
      await recordOpeningBalancePayment(ob.id, val, currentBusinessId)
      toast.success('Payment recorded')
      setShowPaymentInput(false)
      setPaymentAmount('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      backgroundColor: 'var(--bg-card)',
      borderRadius: '14px',
      border: '1px solid var(--border-light)',
      padding: '14px 16px',
    }}>
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
        Opening Balance
      </p>

      {/* PROPOSED state */}
      {ob.status === 'proposed' && !ob.counterAmount && isResponder && (
        <>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {ob.proposedByBusinessId === connection.supplierBusinessId
              ? `${otherBusiness.businessName} says you owe`
              : `${otherBusiness.businessName} says they owe you`}
          </p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            {formatInrCurrency(ob.amount)}
          </p>
          {ob.lineItems.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Line items:</p>
              {ob.lineItems.map((item, idx) => (
                <div key={item.id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  <span>• {item.description}</span>
                  <span>{formatInrCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {ob.note && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', fontStyle: 'italic' }}>
              Note: {ob.note}
            </p>
          )}
          {showCounterInput ? (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="number"
                inputMode="decimal"
                value={counterValue}
                onChange={e => setCounterValue(e.target.value)}
                placeholder="Your amount"
                style={{
                  flex: 1, fontSize: '14px', padding: '8px 12px', borderRadius: '10px',
                  border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-screen)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handleSubmitCounter}
                disabled={submitting}
                style={{
                  fontSize: '13px', fontWeight: 600, padding: '8px 14px', borderRadius: '10px',
                  backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                Submit
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={handleAgree} disabled={submitting} style={actionBtnStyle('var(--status-delivered)')}>
                Agree
              </button>
              <button onClick={() => setShowCounterInput(true)} disabled={submitting} style={actionBtnStyle('var(--brand-primary)')}>
                Suggest Different Amount
              </button>
              <button onClick={handleDispute} disabled={submitting} style={actionBtnStyle('var(--status-overdue)')}>
                Dispute
              </button>
            </div>
          )}
        </>
      )}

      {/* PROPOSED state — proposer view (awaiting response) */}
      {ob.status === 'proposed' && !ob.counterAmount && isProposer && (
        <>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            {formatInrCurrency(ob.amount)} proposed by you · Awaiting response
          </p>
        </>
      )}

      {/* PROPOSED with counter — proposer view */}
      {ob.status === 'proposed' && ob.counterAmount !== null && isProposer && (
        <>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            {formatInrCurrency(ob.amount)} proposed · {otherBusiness.businessName} suggests {formatInrCurrency(ob.counterAmount)}
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button onClick={handleAcceptCounter} disabled={submitting} style={actionBtnStyle('var(--status-delivered)')}>
              Accept {formatInrCurrency(ob.counterAmount)}
            </button>
            <button onClick={onCreateOpeningBalance} disabled={submitting} style={actionBtnStyle('var(--brand-primary)')}>
              Revise
            </button>
          </div>
        </>
      )}

      {/* PROPOSED with counter — responder view */}
      {ob.status === 'proposed' && ob.counterAmount !== null && isResponder && (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          You suggested {formatInrCurrency(ob.counterAmount)} · Awaiting response
        </p>
      )}

      {/* AGREED state */}
      {ob.status === 'agreed' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatInrCurrency(ob.agreedAmount || 0)}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--status-delivered)' }}>
              Agreed ✓
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            <span>Paid: {formatInrCurrency(ob.totalPaid)}</span>
            <span>Remaining: {formatInrCurrency(remaining || 0)}</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', backgroundColor: 'var(--status-delivered)', borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
          {showPaymentInput ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: 'var(--text-secondary)' }}>₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  style={{
                    width: '100%', fontSize: '14px', padding: '8px 12px 8px 28px', borderRadius: '10px',
                    border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-screen)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <button
                onClick={handleRecordPayment}
                disabled={submitting}
                style={{
                  fontSize: '13px', fontWeight: 600, padding: '8px 16px', borderRadius: '10px',
                  backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                Record
              </button>
              <button
                onClick={() => { setShowPaymentInput(false); setPaymentAmount('') }}
                style={{
                  fontSize: '13px', padding: '8px 12px', borderRadius: '10px',
                  backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPaymentInput(true)}
              style={{
                width: '100%', fontSize: '13px', fontWeight: 600, padding: '10px', borderRadius: '10px',
                backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              Record Payment
            </button>
          )}
        </>
      )}

      {/* DISPUTED state */}
      {ob.status === 'disputed' && (
        <>
          <p style={{ fontSize: '13px', color: '#B8860B', marginBottom: '8px' }}>
            Opening balance disputed
          </p>
          {isProposer && (
            <button onClick={onCreateOpeningBalance} style={actionBtnStyle('var(--brand-primary)')}>
              Propose New Amount
            </button>
          )}
        </>
      )}

      {/* SETTLED state */}
      {ob.status === 'settled' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatInrCurrency(ob.agreedAmount || 0)}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--status-delivered)' }}>
              Settled ✓
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--status-delivered)', borderRadius: '3px' }} />
          </div>
        </>
      )}
    </div>
  )
}

function actionBtnStyle(bgColor: string): React.CSSProperties {
  return {
    fontSize: '13px',
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: '10px',
    backgroundColor: bgColor,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
  }
}
