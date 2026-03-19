import { useEffect, useState } from 'react'
import { CaretRight, Warning, Clock, FileX } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import type { ComplianceAlert } from '@/lib/types'

interface Props {
  currentBusinessId: string
  onNavigateToSupplierDocs: (targetBusinessId: string, connectionId: string) => void
}

function IssueChip({ issueType }: { issueType: ComplianceAlert['issueType'] }) {
  if (issueType === 'expired') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
        style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}
      >
        <FileX size={10} weight="bold" />
        Expired
      </span>
    )
  }
  if (issueType === 'expiring') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
        style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}
      >
        <Clock size={10} weight="bold" />
        Expiring
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
    >
      Missing
    </span>
  )
}

function expiryLabel(alert: ComplianceAlert): string {
  if (alert.issueType === 'expired' && alert.daysRemaining !== null) {
    const days = Math.abs(alert.daysRemaining)
    return `Expired ${days === 0 ? 'today' : `${days}d ago`}`
  }
  if (alert.issueType === 'expiring' && alert.daysRemaining !== null) {
    return alert.daysRemaining === 0 ? 'Expires today' : `Expires in ${alert.daysRemaining}d`
  }
  return ''
}

export function ComplianceCard({ currentBusinessId, onNavigateToSupplierDocs }: Props) {
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    dataStore.getComplianceAlerts(currentBusinessId).then(data => {
      setAlerts(data)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [currentBusinessId])

  // Hidden entirely when no issues or still loading
  if (!loaded || alerts.length === 0) return null

  const visibleAlerts = alerts.slice(0, 3)

  return (
    <div>
      <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
        Supplier Compliance
      </h2>
      <div
        className="rounded-2xl border bg-card overflow-hidden"
        style={{ borderColor: '#F59E0B' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ backgroundColor: '#FFFBEB', borderBottom: '1px solid #FEF3C7' }}
        >
          <Warning size={14} weight="fill" color="#D97706" />
          <p className="text-[12px] font-semibold" style={{ color: '#92400E' }}>
            {alerts.length} supplier doc {alerts.length === 1 ? 'issue' : 'issues'} need attention
          </p>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/60">
          {visibleAlerts.map((alert, idx) => (
            <button
              key={`${alert.connectionId}-${alert.issueType}-${idx}`}
              onClick={() => onNavigateToSupplierDocs(alert.otherBusinessId, alert.connectionId)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-semibold text-foreground truncate">
                    {alert.otherBusinessName}
                  </span>
                  <IssueChip issueType={alert.issueType} />
                </div>
                <p className="text-[12px] text-muted-foreground truncate">
                  {alert.documentDisplayName}
                  {expiryLabel(alert) ? ` · ${expiryLabel(alert)}` : ''}
                </p>
              </div>
              <CaretRight size={14} className="text-muted-foreground flex-shrink-0 ml-2" />
            </button>
          ))}
        </div>

        {alerts.length > 3 && (
          <div
            className="px-4 py-2 text-center"
            style={{ backgroundColor: '#FFFBEB', borderTop: '1px solid #FEF3C7' }}
          >
            <p className="text-[11px]" style={{ color: '#92400E' }}>
              +{alerts.length - 3} more — open each supplier to review
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
