import type { CSSProperties } from 'react'
import type { PaymentTermType } from '@/lib/types'
import { formatInrCurrency } from '@/lib/utils'

export interface OrderCardProps {
  itemSummary: string
  connectionName: string
  branchLabel?: string | null
  contactName?: string | null
  orderValue: number
  pendingAmount: number
  settlementState: string
  lifecycleState: string
  calculatedDueDate: number | null
  deliveredAt: number | null
  latestActivity: number
  paymentTermSnapshot: PaymentTermType | null
  onClick: () => void
}

function formatPaymentTerm(term: PaymentTermType | null): string {
  if (!term) return '—'
  switch (term.type) {
    case 'Advance Required': return 'Advance Required'
    case 'Payment on Delivery': return 'Payment on Delivery'
    case 'Bill to Bill': return 'Bill to Bill'
    case 'Days After Delivery': return `Net ${term.days} days`
  }
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

export function OrderCard({
  itemSummary,
  connectionName,
  branchLabel,
  contactName,
  orderValue,
  pendingAmount,
  settlementState,
  lifecycleState,
  calculatedDueDate,
  deliveredAt,
  latestActivity,
  paymentTermSnapshot,
  onClick,
}: OrderCardProps) {
  const now = Date.now()
  const isPaid = settlementState === 'Paid'
  const isOverdue = !isPaid && deliveredAt != null && calculatedDueDate != null && now > calculatedDueDate
  const daysUntilDue = !isPaid && calculatedDueDate != null && !isOverdue
    ? Math.ceil((calculatedDueDate - now) / (24 * 60 * 60 * 1000))
    : null

  let paymentPillVariant: PillVariant | null = null
  let paymentPillLabel = ''
  if (!isPaid) {
    if (isOverdue) {
      paymentPillVariant = 'overdue'
      paymentPillLabel = 'Overdue'
    } else if (daysUntilDue !== null) {
      paymentPillVariant = 'dueSoon'
      paymentPillLabel = daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`
    }
  }

  let fulfilmentPillVariant: PillVariant
  let fulfilmentPillLabel: string
  switch (lifecycleState) {
    case 'Dispatched':
      fulfilmentPillVariant = 'dispatched'
      fulfilmentPillLabel = 'Dispatched'
      break
    case 'Delivered':
      fulfilmentPillVariant = 'delivered'
      fulfilmentPillLabel = 'Delivered'
      break
    default:
      fulfilmentPillVariant = 'placed'
      fulfilmentPillLabel = 'Placed'
  }

  const entityParts = [connectionName, branchLabel || null, contactName || null].filter(Boolean) as string[]

  let dueDateText: string | null = null
  let dueDateColor = 'var(--text-secondary)'
  if (!isPaid) {
    if (isOverdue) {
      const overdueDays = calculatedDueDate != null ? Math.ceil((now - calculatedDueDate) / (24 * 60 * 60 * 1000)) : 0
      dueDateText = `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
      dueDateColor = '#B87761'
    } else if (daysUntilDue !== null) {
      dueDateText = daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`
      dueDateColor = '#AA8454'
    }
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        border: '1px solid var(--border-light)',
        boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
        minHeight: '44px',
      }}
    >
      {/* Row 1: title | pending amount */}
      <div className="flex items-start justify-between gap-3">
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {itemSummary.length > 15 ? `${itemSummary.slice(0, 15)}…` : itemSummary}
        </p>
        {!isPaid && pendingAmount > 0 && (
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <p style={{ fontSize: '14px', fontWeight: 500, color: '#E66767' }}>
              ↑ {formatInrCurrency(pendingAmount)}
            </p>
            <p style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)', marginTop: '2px' }}>
              Order Value · {formatInrCurrency(orderValue)}
            </p>
          </div>
        )}
      </div>

      {/* Row 2: entity */}
      <div className="flex items-center justify-between gap-2" style={{ marginTop: '10px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }} className="truncate">
          {entityParts.join(' · ')}
        </p>
      </div>

      <div style={DIVIDER} />

      {/* Row 3: Lifecycle status (left) + paid/overdue pill (right) */}
      <div className="flex items-center justify-between gap-2">
        <Pill variant={fulfilmentPillVariant} label={fulfilmentPillLabel} />
        {isPaid
          ? <Pill variant="paid" label="Paid" />
          : paymentPillVariant && <Pill variant={paymentPillVariant} label={paymentPillLabel} />
        }
      </div>

      <div style={DIVIDER} />

      {/* Row 4: Payment terms (left) + due date (right) */}
      <div className="flex items-center justify-between gap-2">
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {formatPaymentTerm(paymentTermSnapshot)}
        </p>
        {dueDateText && (
          <p style={{ fontSize: '13px', fontWeight: 500, color: dueDateColor, flexShrink: 0 }}>
            {dueDateText}
          </p>
        )}
      </div>
    </button>
  )
}
