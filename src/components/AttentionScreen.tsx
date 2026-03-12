import { useEffect, useRef, useState } from 'react'
import { ShieldWarning } from '@phosphor-icons/react'
import { formatDistanceToNow } from 'date-fns'
import { markOrderSeen, getUnreadState, updateTabLastSeen } from '@/lib/unread-tracker'
import { useAttentionData } from '@/hooks/data/use-business-data'
import { ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'
import { formatInrCurrency } from '@/lib/utils'
import { CardAccent } from '@/components/ui/card'

interface Props {
  currentBusinessId: string
  onNavigateToIssue: (connectionId: string, orderId: string, issueId: string) => void
  isActive?: boolean
}


export function AttentionScreen({ currentBusinessId, onNavigateToIssue, isActive = true }: Props) {
  const { data, isInitialLoading, isRefreshing } = useAttentionData(currentBusinessId, isActive)
  const items = data?.items ?? []

  const { initialLoading, refreshing } = useScreenLoadState({
    hasData: items.length > 0,
    isInitialLoading,
    isRefreshing: isActive && isRefreshing,
  })

  const lastSeenRef = useRef<number | null>(null)
  const [seenOrders, setSeenOrders] = useState<Set<string>>(new Set())
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now())
  const [showRefreshAffordance, setShowRefreshAffordance] = useState(false)

  useEffect(() => {
    if (!data) return
    setLastUpdatedAt(Date.now())
  }, [data])

  useEffect(() => {
    if (!refreshing) {
      setShowRefreshAffordance(false)
      return
    }

    const timer = window.setTimeout(() => {
      setShowRefreshAffordance(true)
    }, 700)

    return () => window.clearTimeout(timer)
  }, [refreshing])

  useEffect(() => {
    const state = getUnreadState(currentBusinessId)
    lastSeenRef.current = state.attentionLastSeen
    setSeenOrders(new Set())
    updateTabLastSeen(currentBusinessId, 'attention')
  }, [currentBusinessId])

  const isItemNew = (orderId: string, frictionStartedAt: number): boolean => {
    if (seenOrders.has(orderId)) return false
    const state = getUnreadState(currentBusinessId)
    if (state.orderSeen[orderId]) return false
    return frictionStartedAt > (lastSeenRef.current ?? 0)
  }

  const updatedLabel = Date.now() - lastUpdatedAt < 15_000
    ? 'Updated just now'
    : `Updated ${formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}`


  if (initialLoading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 className="text-[17px] text-foreground font-normal">Disputes</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl h-[84px] bg-muted/50" />
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 className="text-[17px] text-foreground font-normal">Disputes</h1>
          </div>
          <div className="px-4 pb-1 text-[11px] text-muted-foreground">{updatedLabel}</div>
          <ScreenRefreshIndicator refreshing={showRefreshAffordance} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-[15px] text-foreground mb-1">No disputes</p>
            <p className="text-[13px] text-muted-foreground">
              Issues and disputes with your connections will appear here.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const sortedItems = [...items].sort((a, b) => {
    const aNew = a.orderId != null && isItemNew(a.orderId, a.frictionStartedAt)
    const bNew = b.orderId != null && isItemNew(b.orderId, b.frictionStartedAt)
    if (aNew && !bNew) return -1
    if (!aNew && bNew) return 1
    return b.frictionStartedAt - a.frictionStartedAt
  })

  const newCount = items.filter(item =>
    item.orderId != null && isItemNew(item.orderId, item.frictionStartedAt)
  ).length

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Disputes</h1>
          {newCount > 0 && (
            <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">
              {newCount} new
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {updatedLabel}
          </span>
        </div>
        <ScreenRefreshIndicator refreshing={showRefreshAffordance} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {items.length > 0 && (
          <div>
            <div className="pt-3 pb-1.5">
              <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                Open Disputes
              </h2>
            </div>
            <div className="space-y-2">
              {sortedItems.map(item => {
              const issueType = item.metadata?.issueType || 'Issue'
              const isNew = item.orderId != null && isItemNew(item.orderId, item.frictionStartedAt)
              const orderAmount = item.orderValue ?? 0
              const paidAmount = item.totalPaid ?? 0
              const pendingAmt = item.pendingAmount ?? Math.max(orderAmount - paidAmount, 0)
              const lifecycleState = item.lifecycleState
              const lifecycleColor = lifecycleState ? getLifecycleStatusColor(lifecycleState) : 'var(--status-issue)'
              const leftBorderColor = isNew ? 'var(--status-issue)' : 'var(--status-dispute)'

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    const { orderId, issueId, connectionId } = item
                    if (!orderId || !issueId) return
                    markOrderSeen(currentBusinessId, orderId)
                    setSeenOrders(prev => new Set(prev).add(orderId))
                    onNavigateToIssue(connectionId, orderId, issueId)
                  }}
                  className="w-full text-left relative overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: 'var(--radius-card)',
                    padding: '14px 16px 14px 20px',
                    minHeight: '44px',
                  }}
                >
                  <CardAccent color={leftBorderColor} />
                  <div className="flex items-start justify-between">
                    <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flex: 1, marginRight: '12px' }}>
                      {item.metadata?.orderSummary || item.description}
                    </p>
                    <div style={{ marginLeft: '12px', flexShrink: 0, textAlign: 'right' }}>
                      {orderAmount === 0 ? (
                        <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Dispute</p>
                      ) : pendingAmt > 0 ? (
                        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--status-overdue)' }}>{formatInrCurrency(pendingAmt)} due</p>
                      ) : (
                        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--status-success)' }}>Paid</p>
                      )}
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '4px' }} className="truncate">
                    {item.connectionName}
                  </p>
                  <div style={{ borderTop: '1px solid var(--border-section)', marginTop: '10px' }} />
                  {orderAmount > 0 && (
                    <div className="flex items-center justify-between mt-2" style={{ fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Order <span style={{ color: 'var(--text-primary)' }}>{formatInrCurrency(orderAmount)}</span></span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Paid <span style={{ color: 'var(--text-primary)' }}>{formatInrCurrency(paidAmount)}</span></span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid var(--border-section)', marginTop: '10px' }} />
                  <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: '12px' }}>
                    {lifecycleState && (
                      <>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: lifecycleColor,
                            backgroundColor: `${lifecycleColor}26`,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-chip)',
                          }}
                        >
                          {lifecycleState}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>·</span>
                      </>
                    )}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--status-issue)',
                        backgroundColor: '#FFFBF0',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-chip)',
                      }}
                    >
                      {issueType}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>·</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500 }}>
                      {formatDistanceToNow(item.frictionStartedAt, { addSuffix: true })}
                    </span>
                    {isNew && (
                      <>
                        <span style={{ color: 'var(--text-secondary)' }}>·</span>
                        <span style={{ color: 'var(--status-overdue)', fontSize: '11px', fontWeight: 600 }}>New</span>
                      </>
                    )}
                  </div>
                </button>
              )
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
