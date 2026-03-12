import { getDueDateColor } from '@/lib/semantic-colors'
import { formatInrCurrency } from '@/lib/utils'

interface Props {
  termsLabel: string
  dueDateLabel: string
  totalPaid: number
  pendingAmount: number
  settlementState: string
}

export function OrderPaymentSummary({ termsLabel, dueDateLabel, totalPaid, pendingAmount, settlementState }: Props) {
  const dueDateColor = getDueDateColor(dueDateLabel)

  return (
    <div className="px-4 mb-3">
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        PAYMENT
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px', border: '1px solid var(--border-light)' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Terms</p>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>{termsLabel}</p>
        </div>
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px', border: '1px solid var(--border-light)' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</p>
          <p style={{ fontSize: '13px', fontWeight: 600, color: dueDateColor, marginTop: '4px' }}>{dueDateLabel}</p>
        </div>
      </div>
      {totalPaid > 0 && settlementState !== 'Paid' && (
        <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '8px' }}>
          {formatInrCurrency(totalPaid)} paid · {formatInrCurrency(pendingAmount)} pending
        </p>
      )}
    </div>
  )
}
