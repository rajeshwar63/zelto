import { getLifecycleStatusColor } from '@/lib/semantic-colors'
import { formatInrCurrency } from '@/lib/utils'

interface Props {
  lifecycleState: string
  itemSummary: string
  orderValue: number
  counterpartName: string
  counterpartSubtitle?: string | null
}

export function OrderStatusHeader({ lifecycleState, itemSummary, orderValue, counterpartName, counterpartSubtitle }: Props) {
  const statusColor = getLifecycleStatusColor(lifecycleState)

  return (
    <>
      <div className="px-4 pt-4 pb-2">
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: statusColor,
            backgroundColor: `${statusColor}26`,
            padding: '8px 14px',
            borderRadius: 'var(--radius-chip)',
            display: 'inline-block',
          }}
        >
          {lifecycleState}
        </span>
      </div>

      <div className="px-4 mb-3">
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{itemSummary}</p>
          {orderValue > 0 && (
            <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px', letterSpacing: '-0.02em' }}>
              {formatInrCurrency(orderValue)}
            </p>
          )}
          <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '4px' }}>{counterpartName}</p>
          {counterpartSubtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              📍 {counterpartSubtitle}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
