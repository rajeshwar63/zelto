import type { CSSProperties } from 'react'
import type { IssueType, IssueSeverity, IssueStatus } from '@/lib/types'

export interface IssueCardProps {
  issueType: IssueType | string
  severity: IssueSeverity
  status: IssueStatus
  orderSummary: string
  connectionName: string
  branchLabel?: string | null
  contactName?: string | null
  raisedAt: number          // Unix timestamp (createdAt of the issue)
  onClick: () => void
}

// ─── Severity — left half-capsule ─────────────────────────────────────────── //
// High = red, Medium = orange, Low = green

function getSeverityStyle(severity: IssueSeverity): CSSProperties {
  switch (severity) {
    case 'High':   return { background: '#E05555' }
    case 'Medium': return { background: '#FF8C42' }
    case 'Low':    return { background: '#22B573' }
  }
}

// ─── Status — right half-capsule ──────────────────────────────────────────── //
// Open = darker red, Acknowledged = grey, Resolved = dark green

function getStatusStyle(status: IssueStatus): CSSProperties {
  switch (status) {
    case 'Open':         return { background: '#B03030' }
    case 'Acknowledged': return { background: '#8492A6' }
    case 'Resolved':     return { background: '#1A9460' }
    default:             return { background: '#8492A6' }
  }
}

// ─── Shared half-pill base ───────────────────────────────────────────────────

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

const DIVIDER: CSSProperties = {
  borderTop: '1px solid var(--border-light)',
  margin: '11px 0',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function IssueCard({
  issueType,
  severity,
  status,
  orderSummary,
  connectionName,
  branchLabel,
  contactName,
  raisedAt,
  onClick,
}: IssueCardProps) {
  const raisedDate = new Date(raisedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })

  return (
    <button
      onClick={onClick}
      className="w-full text-left"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        display: 'block',
      }}
    >
      {/* Row 1: Business name + location + contact */}
      <div>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {connectionName}
        </span>
        {(branchLabel || contactName) && (
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {branchLabel ? ` · ${branchLabel}` : ''}
            {contactName ? ` · ${contactName}` : ''}
          </span>
        )}
      </div>

      {/* Row 2: Order summary (sub-label) */}
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' }}>
        {orderSummary}
      </div>

      <div style={DIVIDER} />

      {/* Row 3: Issue type (left) + Severity | Status half-capsules (right) */}
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
          {issueType}
        </span>
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <span
            style={{
              ...HALF_PILL_BASE,
              ...getSeverityStyle(severity),
              borderRadius: '11px 0 0 11px',
            }}
          >
            {severity}
          </span>
          <span
            style={{
              ...HALF_PILL_BASE,
              ...getStatusStyle(status),
              borderRadius: '0 11px 11px 0',
            }}
          >
            {status}
          </span>
        </div>
      </div>

      <div style={DIVIDER} />

      {/* Row 4: Raised date */}
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
        Raised{' '}
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{raisedDate}</span>
      </div>
    </button>
  )
}
