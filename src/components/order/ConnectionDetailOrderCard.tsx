import type { CSSProperties } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
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
  isNew: boolean
  isOld: boolean
  onClick: () => void
}

type PillVariant = 'overdue' | 'dueSoon' | 'paid' | 'placed' | 'dispatched' | 'delivered'

const PILL_STYLES: Record<PillVariant, { background: string; border: string; color: string }> = {
  overdue:    { background: '#E66767', border: '#CE6060', color: '#FFFFFF' },
  dueSoon:    { background: '#F8BB54', border: '#E4A051', color: '#FFFFFF' },
  paid:       { background: '#80E8A6', border: '#64D68E', color: '#5B876C' },
  placed:     { background: '#6692F1', border: '#6183E4', color: '#FFFFFF' },
  dispatched: { background: '#F08A55', border: '#D47A55', color: '#FFFFFF' },
  delivered:  { background: '#5CBF80', border: '#5BA677', color: '#FFFFFF' },
}

const PILL_BASE: CSSProperties = {
  borderRadius: '999px',
  height: '22px',
  lineHeight: '22px',
  padding: '0 10px',
  fontSize: '11px',
  fontWeight: 600,
  borderWidth: '1px',
  borderStyle: 'solid',
  whiteSpace: 'nowrap',
  display: 'inline-block',
}

function Pill({ variant, label }: { variant: PillVariant; label: string }) {
  const s = PILL_STYLES[variant]
  return (
    <span style={{ ...PILL_BASE, backgroundColor: s.background, borderColor: s.border, color: s.color }}>
      {label}
    </span>
  )
}

const DIVIDER: CSSProperties = {
  borderTop: '1px solid var(--border-light)',
  margin: '10px 0',
}

const META_LABEL: CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
}

const META_VALUE: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-primary)',
}

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
  isNew,
  isOld,
  onClick,
}: ConnectionDetailOrderCardProps) {
  const now = Date.now()
  const isPaid = settlementState === 'Paid'
  const isOverdue = !isPaid && deliveredAt != null && calculatedDueDate != null && now > calculatedDueDate
  const daysUntilDue = !isPaid && calculatedDueDate != null && !isOverdue
    ? Math.ceil((calculatedDueDate - now) / (24 * 60 * 60 * 1000))
    : null

  // Lifecycle pill
  let fulfilmentVariant: PillVariant
  let fulfilmentLabel: string
  switch (lifecycleState) {
    case 'Dispatched': fulfilmentVariant = 'dispatched'; fulfilmentLabel = 'Dispatched'; break
    case 'Delivered':  fulfilmentVariant = 'delivered';  fulfilmentLabel = 'Delivered';  break
    default:           fulfilmentVariant = 'placed';     fulfilmentLabel = 'Placed';     break
  }

  // Payment pill
  let paymentVariant: PillVariant | null = null
  let paymentLabel = ''
  if (!isPaid) {
    if (isOverdue) {
      paymentVariant = 'overdue'; paymentLabel = 'Overdue'
    } else if (daysUntilDue !== null) {
      paymentVariant = 'dueSoon'
      paymentLabel = daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`
    }
  }

  // Row 4 due/settled label
  let dueDateText: string | null = null
  let dueDateColor = 'var(--text-secondary)'
  if (isPaid) {
    dueDateText = 'Settled'
    dueDateColor = 'var(--status-delivered)'
  } else if (isOverdue && calculatedDueDate != null) {
    const overdueDays = Math.ceil((now - calculatedDueDate) / (24 * 60 * 60 * 1000))
    dueDateText = `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
    dueDateColor = '#B87761'
  } else if (daysUntilDue !== null) {
    dueDateText = daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`
    dueDateColor = '#AA8454'
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

      {/* Row 1: Item summary + amount */}
      <div className="flex items-start justify-between gap-3">
        <p style={{
          fontSize: isOld ? '14px' : '15px',
          fontWeight: 700,
          color: isOld ? 'var(--text-secondary)' : 'var(--text-primary)',
          flex: 1,
          lineHeight: 1.4,
        }}>
          {itemSummary}
        </p>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          {orderValue === 0 && lifecycleState === 'Placed' ? (
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--status-dispatched)' }}>Awaiting amount</p>
          ) : orderValue === 0 ? (
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Amount not recorded</p>
          ) : !isPaid && pendingAmount > 0 ? (
            <>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#E66767' }}>↑ {formatInrCurrency(pendingAmount)}</p>
              <p style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)', marginTop: '2px' }}>
                ₹{orderValue.toLocaleString('en-IN')} total
              </p>
            </>
          ) : (
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatInrCurrency(orderValue)}
            </p>
          )}
        </div>
      </div>

      <div style={DIVIDER} />

      {/* Row 2: Lifecycle pill + payment pill */}
      <div className="flex items-center justify-between gap-2">
        <Pill variant={fulfilmentVariant} label={fulfilmentLabel} />
        {isPaid
          ? <Pill variant="paid" label="Paid" />
          : paymentVariant && <Pill variant={paymentVariant} label={paymentLabel} />
        }
      </div>

      <div style={DIVIDER} />

      {/* Row 3: Order value · Order date · Delivered date */}
      <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
        <div>
          <p style={META_LABEL}>Order Value</p>
          <p style={META_VALUE}>
            {orderValue > 0 ? formatInrCurrency(orderValue) : '—'}
          </p>
        </div>
        <div style={{ width: '1px', height: '28px', backgroundColor: 'var(--border-light)', flexShrink: 0 }} />
        <div>
          <p style={META_LABEL}>Ordered</p>
          <p style={META_VALUE}>{format(createdAt, 'd MMM yyyy')}</p>
        </div>
        {deliveredAt && (
          <>
            <div style={{ width: '1px', height: '28px', backgroundColor: 'var(--border-light)', flexShrink: 0 }} />
            <div>
              <p style={META_LABEL}>Delivered</p>
              <p style={META_VALUE}>{format(deliveredAt, 'd MMM yyyy')}</p>
            </div>
          </>
        )}
      </div>

      <div style={DIVIDER} />

      {/* Row 4: Due/settled label + time ago */}
      <div className="flex items-center justify-between gap-2">
        {dueDateText && (
          <p style={{ fontSize: '13px', fontWeight: 500, color: dueDateColor }}>
            {dueDateText}
          </p>
        )}
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {formatDistanceToNow(latestActivity, { addSuffix: true })}
        </p>
      </div>
    </button>
  )
}
