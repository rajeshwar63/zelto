import { useMemo } from 'react'
import type { EnrichedOrder } from '@/hooks/data/use-business-data'
import type { IntelligenceSegment, SegmentType, InsightIconName } from '@/lib/orders-intelligence'
import { computeIntelligenceSegments } from '@/lib/orders-intelligence'
import { formatInrCurrency } from '@/lib/utils'
import type { StatusChip } from '@/components/order/OrderSearchPanel'
import { CheckCircle, Package, Truck, WarningCircle, Scales, ChartBar, Clock, CurrencyCircleDollar, MapPin, LinkSimple, TrendUp, Star } from '@phosphor-icons/react'
import { EmptyState } from '@/components/EmptyState'

const INSIGHT_ICON_MAP: Record<InsightIconName, typeof CheckCircle> = {
  check: CheckCircle,
  package: Package,
  truck: Truck,
  warning: WarningCircle,
  scales: Scales,
  chart: ChartBar,
  clock: Clock,
  money: CurrencyCircleDollar,
  pin: MapPin,
  link: LinkSimple,
  trend: TrendUp,
  star: Star,
}

const INSIGHT_ICON_COLOR: Record<InsightIconName, string> = {
  check: 'var(--status-delivered, #22B573)',
  package: 'var(--status-new, #4A6CF7)',
  truck: 'var(--status-dispatched, #FF8C42)',
  warning: 'var(--status-overdue, #FF6B6B)',
  scales: 'var(--status-dispute, #8B5CF6)',
  chart: 'var(--brand-primary, #4A6CF7)',
  clock: 'var(--status-dispatched, #FF8C42)',
  money: 'var(--status-delivered, #22B573)',
  pin: 'var(--text-secondary, #8492A6)',
  link: 'var(--brand-primary, #4A6CF7)',
  trend: 'var(--brand-primary, #4A6CF7)',
  star: '#FFD700',
}

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
            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: '2px' }}>
              {(() => { const Icon = INSIGHT_ICON_MAP[insight.icon]; return <Icon size={16} weight="duotone" color={INSIGHT_ICON_COLOR[insight.icon]} /> })()}
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
        <EmptyState
          icon={Package}
          title="No intelligence yet"
          description="Place your first order to start seeing intelligence and insights."
        />
      </div>
    )
  }

  // Edge case: all segments empty (e.g. only declined orders)
  if (segments.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState
          icon={Package}
          title="No active orders"
          description="No active orders in this view."
        />
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
