import type { CSSProperties } from 'react'
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
  isBuyer: boolean
  // true = money going OUT (red ↑), false = money coming IN (green ↓)
  showRoleIndicator?: boolean
  onClick: () => void
}

// ─── Delivery pill colors (green ramp) ──────────────────────────────────────
// Placed = grey, Dispatched = orange, Delivered = dark green

function getDeliveryPillStyle(lifecycleState: string): CSSProperties {
  switch (lifecycleState) {
    case 'Dispatched': return { background: '#FF8C42' }
    case 'Delivered':  return { background: '#22B573' }
    default:           return { background: '#8492A6' }  // Placed or unknown
  }
}

function getDeliveryLabel(lifecycleState: string): string {
  switch (lifecycleState) {
    case 'Placed':     return 'Placed'
    case 'Dispatched': return 'Dispatched'
    case 'Delivered':  return 'Delivered'
    default:           return lifecycleState
  }
}

// ─── Payment pill colors ─────────────────────────────────────────────────────
// Due Soon = grey, Overdue = red, Paid = dark green

type PaymentPillState = 'paid' | 'overdue' | 'dueSoon'

function getPaymentPillStyle(state: PaymentPillState): CSSProperties {
  switch (state) {
    case 'paid':    return { background: '#1A9460' }
    case 'overdue': return { background: '#E05555' }
    default:        return { background: '#B0B8C4' }  // dueSoon
  }
}

function getPaymentPillLabel(state: PaymentPillState): string {
  switch (state) {
    case 'paid':    return 'Paid'
    case 'overdue': return 'Overdue'
    default:        return 'Due soon'
  }
}

function resolvePaymentPillState(
  settlementState: string,
  calculatedDueDate: number | null,
  deliveredAt: number | null
): PaymentPillState {
  if (settlementState === 'Paid') return 'paid'
  const now = Date.now()
  if (deliveredAt != null && calculatedDueDate != null && now > calculatedDueDate) return 'overdue'
  return 'dueSoon'
}

// ─── Shared pill base style ──────────────────────────────────────────────────

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

// ─── Due date text helpers ───────────────────────────────────────────────────

function getDueDateText(
  settlementState: string,
  calculatedDueDate: number | null,
  deliveredAt: number | null,
  latestActivity: number
): { label: string; color: string; suffix: string; suffixColor: string } | null {
  const now = Date.now()
  const isPaid = settlementState === 'Paid'

  if (isPaid) {
    const d = new Date(latestActivity)
    const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    return {
      label: 'Settled',
      color: '#22B573',
      suffix: `Paid ${dateStr}`,
      suffixColor: '#8492A6',
    }
  }

  if (calculatedDueDate == null) return null

  const msPerDay = 86400000
  const isOverdue = deliveredAt != null && now > calculatedDueDate
  const dueDate = new Date(calculatedDueDate)
  const dateStr = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  if (isOverdue) {
    const days = Math.ceil((now - calculatedDueDate) / msPerDay)
    return {
      label: `⚠ Overdue by ${days} day${days > 1 ? 's' : ''}`,
      color: '#E05555',
      suffix: `Due ${dateStr}`,
      suffixColor: '#8492A6',
    }
  }

  const days = Math.ceil((calculatedDueDate - now) / msPerDay)
  return {
    label: `Due in ${days} day${days > 1 ? 's' : ''}`,
    color: '#8492A6',
    suffix: `Due ${dateStr}`,
    suffixColor: '#8492A6',
  }
}

// ─── Divider ─────────────────────────────────────────────────────────────────

const DIVIDER: CSSProperties = {
  borderTop: '1px solid var(--border-light)',
  margin: '11px 0',
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  isBuyer,
  showRoleIndicator = false,
  onClick,
}: OrderCardProps) {
  // ── Amount display ──────────────────────────────────────────────────────────
  const isPaid = settlementState === 'Paid'
  const isSettled = isPaid || pendingAmount === 0
  const amountValue = isSettled ? orderValue : pendingAmount
  const amountColor = isSettled ? 'var(--text-secondary)' : isBuyer ? '#E05555' : '#22B573'
  const amountArrow = isSettled ? null : isBuyer ? '↑' : '↓'

  // ── Delivery pill ───────────────────────────────────────────────────────────
  const deliveryStyle = getDeliveryPillStyle(lifecycleState)
  const deliveryLabel = getDeliveryLabel(lifecycleState)

  // ── Payment pill ────────────────────────────────────────────────────────────
  const paymentState = resolvePaymentPillState(settlementState, calculatedDueDate, deliveredAt)
  const paymentStyle = getPaymentPillStyle(paymentState)
  const paymentLabel = getPaymentPillLabel(paymentState)

  // ── Bottom row ──────────────────────────────────────────────────────────────
  const dueInfo = getDueDateText(settlementState, calculatedDueDate, deliveredAt, latestActivity)

  return (
    <button
      onClick={onClick}
      className="w-full text-left"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        display: 'block',
      }}
    >
      {/* Row 1: Business name + amount */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, marginRight: '12px', minWidth: 0 }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {connectionName}
          </span>
          {(branchLabel || contactName) && (
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {branchLabel ? ` · ${branchLabel}` : ''}{contactName ? ` · ${contactName}` : ''}
            </span>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, lineHeight: 1.2 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: amountColor }}>
            {amountArrow ? `${amountArrow} ` : ''}{formatInrCurrency(amountValue)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
            {formatInrCurrency(orderValue)} total
          </div>
        </div>
      </div>

      {/* Role indicator for "All" view */}
      {showRoleIndicator && (
        <span style={{
          display: 'inline-block',
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          padding: '2px 8px',
          borderRadius: 999,
          marginTop: '4px',
          background: isBuyer ? 'rgba(224, 85, 85, 0.08)' : 'rgba(34, 181, 115, 0.08)',
          color: isBuyer ? '#E05555' : '#22B573',
        }}>
          {isBuyer ? 'Buying' : 'Selling'}
        </span>
      )}

      <div style={DIVIDER} />

      {/* Row 3: Order title + half-capsule status pills */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            flex: 1,
            marginRight: '10px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {itemSummary}
        </span>
        {/* Half-capsule joined pills */}
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <span
            style={{
              ...HALF_PILL_BASE,
              ...deliveryStyle,
              borderRadius: '11px 0 0 11px',
            }}
          >
            {deliveryLabel}
          </span>
          <span
            style={{
              ...HALF_PILL_BASE,
              ...paymentStyle,
              borderRadius: '0 11px 11px 0',
            }}
          >
            {paymentLabel}
          </span>
        </div>
      </div>

      <div style={DIVIDER} />

      {/* Row 4: Due label + due date */}
      {dueInfo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: dueInfo.color }}>
            {dueInfo.label}
          </span>
          <span style={{ fontSize: '13px', color: dueInfo.suffixColor }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {dueInfo.suffix.split(' ')[0]}
            </span>{' '}
            {dueInfo.suffix.split(' ').slice(1).join(' ')}
          </span>
        </div>
      )}
    </button>
  )
}
