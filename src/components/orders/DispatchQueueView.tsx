import type { DispatchIntelItem } from '@/lib/intelligence-engine'

interface Props {
  items: DispatchIntelItem[]
  loading: boolean
  onSelectOrder: (orderId: string, connectionId: string) => void
}

function getUrgencyBorderColor(urgency: DispatchIntelItem['urgency']): string {
  switch (urgency) {
    case 'urgent': return '#ef4444'
    case 'high': return '#f59e0b'
    case 'normal': return 'var(--border-light)'
  }
}

function getUrgencyTagStyle(urgency: DispatchIntelItem['urgency']): { background: string; color: string } {
  switch (urgency) {
    case 'urgent': return { background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }
    case 'high': return { background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }
    case 'normal': return { background: 'rgba(107, 114, 128, 0.08)', color: '#6b7280' }
  }
}

function getUrgencyReasonColor(urgency: DispatchIntelItem['urgency']): string {
  switch (urgency) {
    case 'urgent': return '#dc2626'
    case 'high': return '#d97706'
    case 'normal': return '#16a34a'
  }
}

function getUrgencyDotColor(urgency: DispatchIntelItem['urgency']): string {
  switch (urgency) {
    case 'urgent': return '#ef4444'
    case 'high': return '#f59e0b'
    case 'normal': return '#22c55e'
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function DispatchCard({
  item,
  onSelect,
}: {
  item: DispatchIntelItem
  onSelect: () => void
}) {
  const borderColor = getUrgencyBorderColor(item.urgency)
  const tagStyle = getUrgencyTagStyle(item.urgency)
  const reasonColor = getUrgencyReasonColor(item.urgency)
  const dotColor = getUrgencyDotColor(item.urgency)
  const tagLabel = item.urgency === 'urgent' ? 'Urgent' : item.urgency === 'high' ? 'High' : 'Normal'

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'var(--bg-card)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-card)',
        padding: 0,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Priority tag */}
      <span
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 999,
          background: tagStyle.background,
          color: tagStyle.color,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {tagLabel}
      </span>

      {/* Order info */}
      <div style={{ padding: '12px 14px' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', paddingRight: 60 }}>
          {item.connectionName}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          {item.itemSummary}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#2563eb',
            fontWeight: 500,
          }}>
            Accepted
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {Math.round(item.hoursSinceAcceptance)}h ago
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {formatCurrency(item.orderValue)}
          </span>
        </div>
      </div>

      {/* Intelligence row */}
      <div style={{
        borderTop: '1px solid var(--border-light)',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
            <circle cx="12" cy="12" r="2" />
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
          </svg>
        </span>
        <span style={{ fontSize: 12, color: reasonColor, lineHeight: 1.4 }}>
          {item.reason}
        </span>
      </div>
    </button>
  )
}

export function DispatchQueueView({ items, loading, onSelectOrder }: Props) {
  if (loading) {
    return (
      <div className="px-4 pt-3 pb-24 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse" style={{ backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-card)', height: '100px' }} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          No orders ready to dispatch
        </p>
      </div>
    )
  }

  const urgentAndHigh = items.filter(i => i.urgency === 'urgent' || i.urgency === 'high')
  const normal = items.filter(i => i.urgency === 'normal')

  return (
    <div>
      {/* Summary banner */}
      <div style={{
        background: 'rgba(245, 158, 11, 0.06)',
        border: '1px solid #fcd34d',
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
      }}>
        <span style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: '#f59e0b',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" />
          </svg>
        </span>
        <span style={{ fontSize: 12, color: '#78350f', lineHeight: 1.4 }}>
          <strong>{items.length} order{items.length !== 1 ? 's' : ''} ready to dispatch.</strong>
          {' '}Timely dispatch improves your trust score and keeps buyers happy.
        </span>
      </div>

      {/* Urgent & High section */}
      {urgentAndHigh.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#dc2626',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 10px',
          }}>
            Dispatch now — trust score at risk
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {urgentAndHigh.map(item => (
              <DispatchCard
                key={item.orderId}
                item={item}
                onSelect={() => onSelectOrder(item.orderId, item.connectionId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Normal section */}
      {normal.length > 0 && (
        <div>
          <p style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 10px',
          }}>
            Can wait — no impact today
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {normal.map(item => (
              <DispatchCard
                key={item.orderId}
                item={item}
                onSelect={() => onSelectOrder(item.orderId, item.connectionId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
