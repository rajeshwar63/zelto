import type { ReactNode } from 'react'

interface OrderCardProps {
  itemSummary: string
  dueText: string
  connectionName: string
  lifecycleLabel: string
  settlementLabel: string
  lifecycleColor: string
  orderValue: number
  totalPaid: number
  relativeTime: string
  onClick: () => void
  leftBorderColor?: string
  dimmed?: boolean
  highlighted?: boolean
  trailingMeta?: ReactNode
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  })
}

export function OrderCard({
  itemSummary,
  dueText,
  connectionName,
  lifecycleLabel,
  settlementLabel,
  lifecycleColor,
  orderValue,
  totalPaid,
  relativeTime,
  onClick,
  leftBorderColor = 'transparent',
  dimmed = false,
  highlighted = false,
  trailingMeta,
}: OrderCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left"
      style={{
        backgroundColor: highlighted ? 'var(--brand-primary-bg)' : 'var(--bg-card)',
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        borderLeft: `3px solid ${leftBorderColor}`,
        minHeight: '44px',
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{itemSummary}</p>
        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{dueText}</p>
      </div>

      <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '4px' }} className="truncate">
        {connectionName}
      </p>

      <div className="flex items-center gap-2 mt-2" style={{ fontSize: '11px' }}>
        <span
          style={{
            fontWeight: 600,
            color: lifecycleColor,
            backgroundColor: `${lifecycleColor}26`,
            padding: '3px 10px',
            borderRadius: '999px',
          }}
        >
          {lifecycleLabel}
        </span>
        <span
          style={{
            fontWeight: 600,
            color: settlementLabel === 'Paid' ? 'var(--status-success)' : 'var(--status-dispatched)',
            backgroundColor: settlementLabel === 'Paid' ? 'var(--status-success-bg)' : 'var(--status-dispatched-bg)',
            padding: '3px 10px',
            borderRadius: '999px',
          }}
        >
          {settlementLabel}
        </span>
        {trailingMeta}
      </div>

      <div style={{ borderTop: '1px solid var(--border-section)', marginTop: '10px' }} />

      <div className="flex items-center justify-between mt-2">
        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Order <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(orderValue)}</span>
        </p>
        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Paid <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalPaid)}</span>
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border-section)', marginTop: '10px' }} />

      <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '8px' }}>
        {relativeTime}
      </p>
    </button>
  )
}
