import type { CSSProperties } from 'react'
import { format } from 'date-fns'
import { formatInrCurrency } from '@/lib/utils'
import { CardAccent } from '@/components/ui/card'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'

export interface ConnectionDetailOrderCardProps {
  itemSummary: string
  orderValue: number
  pendingAmount: number
  settlementState: string
  lifecycleState: string
  createdAt: number
  deliveredAt: number | null
  calculatedDueDate: number | null
  latestActivity: number
  isBuyer: boolean
  isNew: boolean
  isOld: boolean
  onClick: () => void
}

// ─── Half-pill helpers (mirrors OrderCard style) ─────────────────────────────

const HALF_PILL_BASE: CSSProperties = {
  height: '22px',
  lineHeight: '22px',
  padding: '0 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#FFFFFF',
  display: 'inline-block',
  whiteSpace: 'nowrap',
}

function getDeliveryPillStyle(lifecycleState: string): CSSProperties {
  switch (lifecycleState) {
    case 'Dispatched': return { background: '#FF8C42' }
    case 'Delivered':  return { background: '#22B573' }
    default:           return { background: '#8492A6' }
  }
}

function getDeliveryLabel(lifecycleState: string): string {
  switch (lifecycleState) {
    case 'Dispatched': return 'Dispatched'
    case 'Delivered':  return 'Delivered'
    default:           return 'Placed'
  }
}

function getPaymentPillStyle(isPaid: boolean, isOverdue: boolean): CSSProperties {
  if (isPaid)    return { background: '#1A9460' }
  if (isOverdue) return { background: '#E05555' }
  return { background: '#B0B8C4' }
}

function getPaymentPillLabel(isPaid: boolean, isOverdue: boolean): string {
  if (isPaid)    return 'Paid'
  if (isOverdue) return 'Overdue'
  return 'Due soon'
}

// ─── Divider ─────────────────────────────────────────────────────────────────

const DIVIDER: CSSProperties = {
  borderTop: '1px solid var(--border-light)',
  margin: '11px 0',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConnectionDetailOrderCard({
  itemSummary,
  orderValue,
  pendingAmount,
  settlementState,
  lifecycleState,
  createdAt,
  deliveredAt,
  calculatedDueDate,
  latestActivity,
  isBuyer,
  isNew,
  isOld,
  onClick,
}: ConnectionDetailOrderCardProps) {
  const now = Date.now()
  const isPaid = settlementState === 'Paid'
  const isSettled = isPaid || pendingAmount === 0
  const isOverdue = !isPaid && deliveredAt != null && calculatedDueDate != null && now > calculatedDueDate

  // ── Amount display ──────────────────────────────────────────────────────────
  const amountValue = isSettled ? orderValue : pendingAmount
  const amountColor = isSettled ? 'var(--text-secondary)' : isBuyer ? '#E05555' : '#22B573'
  const amountArrow = isSettled ? null : isBuyer ? '↑' : '↓'

  // ── Pills ───────────────────────────────────────────────────────────────────
  const deliveryStyle = getDeliveryPillStyle(lifecycleState)
  const deliveryLabel = getDeliveryLabel(lifecycleState)
  const paymentStyle = getPaymentPillStyle(isPaid, isOverdue)
  const paymentLabel = getPaymentPillLabel(isPaid, isOverdue)

  // ── Date row ────────────────────────────────────────────────────────────────
  const orderedLabel = `Ordered ${format(createdAt, 'd MMM')}`
  const deliveredLabel = deliveredAt ? ` · Delivered ${format(deliveredAt, 'd MMM')}` : ''

  // ── Bottom row ──────────────────────────────────────────────────────────────
  let statusLabel: string | null = null
  let statusColor = 'var(--text-secondary)'
  let dateLabel: string | null = null

  if (isPaid) {
    statusLabel = 'Settled'
    statusColor = '#22B573'
    dateLabel = `Paid ${format(latestActivity, 'd MMM')}`
  } else if (isOverdue && calculatedDueDate != null) {
    const days = Math.ceil((now - calculatedDueDate) / 86400000)
    statusLabel = `⚠ Overdue by ${days} day${days === 1 ? '' : 's'}`
    statusColor = '#E05555'
    dateLabel = `Due ${format(calculatedDueDate, 'd MMM')}`
  } else if (calculatedDueDate != null) {
    const days = Math.ceil((calculatedDueDate - now) / 86400000)
    statusLabel = days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`
    statusColor = 'var(--text-secondary)'
    dateLabel = `Due ${format(calculatedDueDate, 'd MMM')}`
  }

  const lifecycleColor = getLifecycleStatusColor(lifecycleState)

  return (
    <button
      onClick={onClick}
      className="w-full text-left"
      style={{
        backgroundColor: isNew ? 'var(--brand-primary-bg)' : 'var(--bg-card)',
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px 14px 20px',
        border: '1px solid var(--border-light)',
        boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
        opacity: lifecycleState === 'Declined' ? 0.4 : 1,
        minHeight: '44px',
      }}
    >
      <CardAccent color={lifecycleColor} />

      {/* Row 1: Order title + amount */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <p style={{
          fontSize: isOld ? '14px' : '15px',
          fontWeight: 700,
          color: isOld ? 'var(--text-secondary)' : 'var(--text-primary)',
          flex: 1,
          lineHeight: 1.4,
        }}>
          {itemSummary}
        </p>
        <div style={{ flexShrink: 0, textAlign: 'right', lineHeight: 1.2 }}>
          {orderValue === 0 && lifecycleState === 'Placed' ? (
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--status-dispatched)' }}>Awaiting amount</p>
          ) : orderValue === 0 ? (
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Amount not recorded</p>
          ) : (
            <>
              <div style={{ fontSize: '15px', fontWeight: 700, color: amountColor }}>
                {amountArrow ? `${amountArrow} ` : ''}{formatInrCurrency(amountValue)}
              </div>
              {!isSettled && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                  {formatInrCurrency(orderValue)} total
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={DIVIDER} />

      {/* Row 2: Dates (left) + joined half-pills (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {orderedLabel}{deliveredLabel}
        </p>
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <span style={{ ...HALF_PILL_BASE, ...deliveryStyle, borderRadius: '11px 0 0 11px' }}>
            {deliveryLabel}
          </span>
          <span style={{ ...HALF_PILL_BASE, ...paymentStyle, borderRadius: '0 11px 11px 0' }}>
            {paymentLabel}
          </span>
        </div>
      </div>

      <div style={DIVIDER} />

      {/* Row 3: Overdue/settled label (left) + due/settled date (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        {statusLabel && (
          <p style={{ fontSize: '13px', fontWeight: 600, color: statusColor }}>
            {statusLabel}
          </p>
        )}
        {dateLabel && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {dateLabel.split(' ')[0]}
            </span>
            {' '}{dateLabel.split(' ').slice(1).join(' ')}
          </p>
        )}
      </div>
    </button>
  )
}
