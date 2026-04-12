import { useMemo } from 'react'
import type { EnrichedOrder } from '@/hooks/data/use-business-data'
import type { IntelligenceSegment, SegmentType } from '@/lib/orders-intelligence'
import { computeIntelligenceSegments } from '@/lib/orders-intelligence'
import { formatInrCurrency } from '@/lib/utils'
import type { StatusChip } from '@/components/order/OrderSearchPanel'

// ─── Segment color mapping ────────────────────────────────────────

const SEGMENT_COLORS: Record<SegmentType, string> = {
  new: 'var(--status-new, #4A6CF7)',
  accepted: 'var(--brand-primary, #4A6CF7)',
  dispatched: 'var(--status-dispatched, #FF8C42)',
  delivered: 'var(--status-delivered, #22B573)',
  overdue: 'var(--status-overdue, #FF6B6B)',
  paid: 'var(--status-delivered, #22B573)',
}

const SEGMENT_VALUE_LABELS: Record<SegmentType, string> = {
  new: 'total value',
  accepted: 'committed to dispatch',
  dispatched: 'on the way',
  delivered: 'pending collection',
  overdue: 'stuck',
  paid: 'collected',
}

// ─── Intelligence Card ────────────────────────────────────────────

interface IntelligenceCardProps {
  segment: IntelligenceSegment
  onTap: (chip: string) => void
}

function IntelligenceCard({ segment, onTap }: IntelligenceCardProps) {
  const color = SEGMENT_COLORS[segment.type]
  const valueLabel = SEGMENT_VALUE_LABELS[segment.type]

  return (
    <button
      onClick={() => onTap(segment.statusChip)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'var(--bg-card)',
        borderRadius: 14,
        padding: 16,
        border: 'none',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
      }}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
        }}>
          {segment.label}
        </span>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-secondary)',
        }}>
          {segment.count} {segment.count === 1 ? 'order' : 'orders'}
        </span>
      </div>

      {/* Total value */}
      <div style={{
        fontSize: 20,
        fontWeight: 800,
        color: color,
        marginTop: 2,
      }}>
        {formatInrCurrency(segment.totalValue)}{' '}
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {valueLabel}
        </span>
      </div>

      {/* Divider */}
      {segment.insights.length > 0 && (
        <div style={{
          height: 1,
          background: 'var(--border-subtle, var(--border-light, #E8ECF2))',
          margin: '12px 0',
        }} />
      )}

      {/* Insights */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {segment.insights.map((insight, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 16, lineHeight: '1.5', flexShrink: 0 }}>
              {insight.icon}
            </span>
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}>
              {insight.text}
            </span>
          </div>
        ))}
      </div>
    </button>
  )
}

// ─── Main Tab Component ───────────────────────────────────────────

interface OrdersIntelligenceTabProps {
  orders: EnrichedOrder[]
  role: 'buying' | 'selling'
  onNavigateToTab: (chip: StatusChip) => void
}

export function OrdersIntelligenceTab({ orders, role, onNavigateToTab }: OrdersIntelligenceTabProps) {
  const segments = useMemo(
    () => computeIntelligenceSegments(orders, role),
    [orders, role]
  )

  const totalOrderCount = orders.filter(o => !o.declinedAt).length

  // Edge case: no orders at all
  if (totalOrderCount === 0) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 14,
          padding: 24,
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: 1.6,
          }}>
            No orders yet. Place your first order to start seeing intelligence.
          </p>
        </div>
      </div>
    )
  }

  // Edge case: all segments empty (e.g. only declined orders)
  if (segments.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 14,
          padding: 24,
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: 1.6,
          }}>
            No active orders in this view.
          </p>
        </div>
      </div>
    )
  }

  // Brand new account hint
  const showNewAccountHint = totalOrderCount < 5

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: 16,
    }}>
      {segments.map(segment => (
        <IntelligenceCard
          key={segment.type}
          segment={segment}
          onTap={(chip) => onNavigateToTab(chip as StatusChip)}
        />
      ))}

      {showNewAccountHint && (
        <p style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          margin: '4px 0 0',
          lineHeight: 1.5,
        }}>
          More insights will appear as your order history grows.
        </p>
      )}
    </div>
  )
}
