import { useEffect, useRef, useState } from 'react'
import { CaretRight, ShieldWarning } from '@phosphor-icons/react'
import { formatDistanceToNow } from 'date-fns'
import { markOrderSeen, getUnreadState, updateTabLastSeen } from '@/lib/unread-tracker'
import { useAttentionData } from '@/hooks/data/use-business-data'
import { ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'

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

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (!item.orderId || !item.issueId) return
                    markOrderSeen(currentBusinessId, item.orderId)
                    setSeenOrders(prev => new Set(prev).add(item.orderId))
                    onNavigateToIssue(item.connectionId, item.orderId, item.issueId)
                  }}
                  className="w-full px-4 py-3 text-left transition-colors rounded-xl"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderLeft: `3px solid ${isNew ? 'var(--status-issue)' : 'var(--status-dispute)'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FFFBF0' }}>
                        <ShieldWarning size={15} weight="fill" color="var(--status-issue)" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] text-foreground font-semibold leading-snug truncate">
                          {item.metadata?.orderSummary || item.description}
                        </p>
                        <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                          {item.connectionName}
                        </p>
                      </div>
                    </div>
                    <CaretRight size={16} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 pl-10" style={{ fontSize: '12px' }}>
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
