import { useEffect, useState } from 'react'
import { intelligenceEngine } from '@/lib/intelligence-engine'
import type {
  CreditRiskSignal,
  SupplierRanking,
  ReorderAlert,
  PaymentCalendarItem,
} from '@/lib/intelligence-engine'
import type { Insight } from '@/lib/insight-engine'
import { MetricGrid } from '@/components/shared/MetricGrid'
import { formatInrCurrency } from '@/lib/utils'

interface Props {
  connectionId: string
  currentBusinessId: string
  isBuyer: boolean
  otherBusinessName: string
  otherBusinessId: string
  connectionInsights?: Insight[]
}

// ─── Warning icon SVG ───────────────────────────────────────────────

function WarningIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Section Header ─────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        marginBottom: 10,
      }}
    >
      {title}
    </p>
  )
}

// ─── Card wrapper ───────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 14,
        padding: '14px 14px 16px',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  )
}

// ─── Badge pill ─────────────────────────────────────────────────────

function BadgePill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        backgroundColor: color,
        borderRadius: 999,
        padding: '3px 10px',
      }}
    >
      {label}
    </span>
  )
}

function badgeColor(level: string | null): string {
  if (!level) return 'var(--text-secondary)'
  if (level === 'trusted') return '#1D9E75'
  if (level === 'verified') return '#4A6CF7'
  if (level === 'basic') return '#D4A017'
  return 'var(--text-secondary)'
}

function badgeLabel(level: string | null): string {
  if (!level) return 'Unknown'
  return level.charAt(0).toUpperCase() + level.slice(1)
}

// ─── Supplier View ──────────────────────────────────────────────────

function SupplierView({ connectionId, currentBusinessId }: { connectionId: string; currentBusinessId: string }) {
  const [creditRisk, setCreditRisk] = useState<CreditRiskSignal | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    intelligenceEngine
      .getCreditRiskSignals(currentBusinessId)
      .then((signals) => {
        if (cancelled) return
        const match = signals.find((s) => s.connectionId === connectionId) ?? null
        setCreditRisk(match)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, currentBusinessId])

  if (loading) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading intelligence...</p>
      </div>
    )
  }

  if (!creditRisk) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          No credit risk signals for this connection.
        </p>
      </div>
    )
  }

  const trendColor =
    creditRisk.trend === 'worsening'
      ? '#D4A017'
      : creditRisk.trend === 'improving'
        ? '#1D9E75'
        : 'var(--text-secondary)'

  const trendText =
    creditRisk.trend === 'worsening'
      ? 'Trend: worsening over 90 days'
      : creditRisk.trend === 'improving'
        ? 'Trend: improving'
        : creditRisk.trend === 'insufficient_data'
          ? 'Trend: insufficient data'
          : 'Trend: stable'

  return (
    <Card>
      <SectionHeader title="Credit Risk Signal" />
      <MetricGrid
        items={[
          {
            value:
              creditRisk.currentAvgPayDays !== null
                ? `${Math.round(creditRisk.currentAvgPayDays)}d`
                : '—',
            label: 'Current avg pay time',
            color: creditRisk.trend === 'worsening' ? '#D85A30' : 'var(--text-primary)',
          },
          {
            value:
              creditRisk.previousAvgPayDays !== null
                ? `${Math.round(creditRisk.previousAvgPayDays)}d`
                : '—',
            label: 'Previous avg (3mo ago)',
            color: '#1D9E75',
          },
          {
            value: formatInrCurrency(creditRisk.currentOverdue),
            label: 'Currently overdue',
            color: creditRisk.currentOverdue > 0 ? '#D85A30' : 'var(--text-primary)',
          },
          {
            value: creditRisk.totalOrders,
            label: 'Total orders',
          },
        ]}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 12,
          paddingTop: 10,
          borderTop: '0.5px solid rgba(0,0,0,0.08)',
        }}
      >
        <WarningIcon color={trendColor} />
        <span style={{ fontSize: 12, color: trendColor, fontWeight: 500 }}>
          {trendText}
        </span>
      </div>
    </Card>
  )
}

// ─── Buyer View ─────────────────────────────────────────────────────

function BuyerView({
  connectionId,
  currentBusinessId,
}: {
  connectionId: string
  currentBusinessId: string
}) {
  const [supplierRanking, setSupplierRanking] = useState<SupplierRanking | null>(null)
  const [reorderAlert, setReorderAlert] = useState<ReorderAlert | null>(null)
  const [paymentCalendar, setPaymentCalendar] = useState<PaymentCalendarItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all([
      intelligenceEngine.getSupplierRankings(currentBusinessId),
      intelligenceEngine.getReorderAlerts(currentBusinessId),
      intelligenceEngine.getPaymentCalendar(currentBusinessId),
    ])
      .then(([rankings, alerts, calendar]) => {
        if (cancelled) return
        setSupplierRanking(rankings.find((r) => r.connectionId === connectionId) ?? null)
        setReorderAlert(alerts.find((a) => a.connectionId === connectionId) ?? null)
        setPaymentCalendar(calendar.filter((c) => c.connectionId === connectionId))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [connectionId, currentBusinessId])

  if (loading) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading intelligence...</p>
      </div>
    )
  }

  const hasData = supplierRanking || reorderAlert || paymentCalendar.length > 0

  if (!hasData) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          No intelligence data available for this connection yet.
        </p>
      </div>
    )
  }

  // Pick the most relevant payment calendar item for the preview
  const relevantPayment = paymentCalendar.length > 0 ? paymentCalendar[0] : null

  return (
    <>
      {/* Card 1: Supplier Reliability */}
      {supplierRanking && (
        <Card>
          <SectionHeader title="Supplier Reliability" />
          <MetricGrid
            items={[
              {
                value:
                  supplierRanking.deliveryConsistency !== null
                    ? `${Math.round(supplierRanking.deliveryConsistency)}%`
                    : '—',
                label: 'Delivery %',
                color:
                  supplierRanking.deliveryConsistency !== null && supplierRanking.deliveryConsistency >= 80
                    ? '#1D9E75'
                    : supplierRanking.deliveryConsistency !== null && supplierRanking.deliveryConsistency < 50
                      ? '#D85A30'
                      : 'var(--text-primary)',
              },
              {
                value:
                  supplierRanking.avgAcceptanceHours !== null
                    ? `${Math.round(supplierRanking.avgAcceptanceHours)}h`
                    : '—',
                label: 'Acceptance hours',
              },
              {
                value: supplierRanking.issuesLast30Days,
                label: 'Issues (30d)',
                color: supplierRanking.issuesLast30Days > 0 ? '#D85A30' : 'var(--text-primary)',
              },
              {
                value: supplierRanking.totalOrders,
                label: 'Total orders',
              },
            ]}
          />
        </Card>
      )}

      {/* Card 2: Reorder Intelligence */}
      {reorderAlert && (
        <Card>
          <SectionHeader title="Reorder Intelligence" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              Usual cycle: every {Math.round(reorderAlert.medianCycleDays)} days
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: reorderAlert.isOverdue ? '#D4A017' : 'var(--text-primary)',
              }}
            >
              {Math.round(reorderAlert.daysSinceLastOrder)}d since last
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            Avg order value: {formatInrCurrency(reorderAlert.avgOrderValue)}
          </p>
        </Card>
      )}

      {/* Card 3: Payment Impact Preview */}
      {relevantPayment && relevantPayment.badgeIfOnTime && relevantPayment.badgeIfLate && (
        <Card>
          <SectionHeader title="Payment Impact Preview" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                Pay on time (by {new Date(relevantPayment.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
              </span>
              <BadgePill
                label={badgeLabel(relevantPayment.badgeIfOnTime)}
                color={badgeColor(relevantPayment.badgeIfOnTime)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                Pay late (after {new Date(relevantPayment.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
              </span>
              <BadgePill
                label={badgeLabel(relevantPayment.badgeIfLate)}
                color={badgeColor(relevantPayment.badgeIfLate)}
              />
            </div>
          </div>
        </Card>
      )}
    </>
  )
}

// ─── Main Component ─────────────────────────────────────────────────

export function ConnectionIntelligenceTab({
  connectionId,
  currentBusinessId,
  isBuyer,
  connectionInsights,
}: Props) {
  return (
    <div className="px-4 py-3">
      {connectionInsights && connectionInsights.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Connection insights</span>
          </div>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', overflow: 'hidden' }}>
            {connectionInsights.map((insight, idx) => {
              const borderColor = insight.sentiment === 'negative' ? '#D85A30'
                : insight.sentiment === 'positive' ? '#1D9E75'
                : '#888780'
              const bgColor = insight.sentiment === 'negative' ? 'rgba(216,90,48,0.03)'
                : insight.sentiment === 'positive' ? 'rgba(29,158,117,0.03)'
                : 'transparent'
              return (
                <div key={idx} style={{
                  padding: '10px 12px',
                  borderLeft: `3px solid ${borderColor}`,
                  borderBottom: idx < connectionInsights.length - 1 ? '0.5px solid var(--border-light)' : 'none',
                  backgroundColor: bgColor,
                  borderRadius: 0,
                }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                    {insight.text}
                  </p>
                  <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                    {insight.category ? (insight.category.charAt(0).toUpperCase() + insight.category.slice(1)) : 'General'}
                    {' · Current'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {isBuyer ? (
        <BuyerView connectionId={connectionId} currentBusinessId={currentBusinessId} />
      ) : (
        <SupplierView connectionId={connectionId} currentBusinessId={currentBusinessId} />
      )}
    </div>
  )
}
