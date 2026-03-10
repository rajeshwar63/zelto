import { useEffect, useState, useRef } from 'react'
import { CaretRight, ShieldWarning } from '@phosphor-icons/react'
import { attentionEngine } from '@/lib/attention-engine'
import { dataStore } from '@/lib/data-store'
import { formatDistanceToNow } from 'date-fns'
import type { AttentionItem } from '@/lib/attention-engine'
import type { ConnectionRequest } from '@/lib/types'
import { ConnectionRequestItem } from '@/components/ConnectionRequestItem'
import { markOrderSeen, getUnreadState, updateTabLastSeen } from '@/lib/unread-tracker'
import { useDataListener } from '@/lib/data-events'
import { InlineRefreshSpinner, ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'

interface Props {
  currentBusinessId: string
  onNavigateToConnections: () => void
  onNavigateToIssue: (connectionId: string, orderId: string, issueId: string) => void
}

interface ItemWithConnection extends AttentionItem {
  connectionName: string
}

export function AttentionScreen({ currentBusinessId, onNavigateToConnections, onNavigateToIssue }: Props) {
  const [items, setItems] = useState<ItemWithConnection[]>([])
  const [connectionRequests, setConnectionRequests] = useState<ConnectionRequest[]>([])
  const { initialLoading, refreshing, runWithLoadState } = useScreenLoadState({ resetKey: currentBusinessId })

  const lastSeenRef = useRef<number | null>(null)
  if (lastSeenRef.current === null) {
    const state = getUnreadState(currentBusinessId)
    lastSeenRef.current = state.attentionLastSeen
    updateTabLastSeen(currentBusinessId, 'attention')
  }

  const [seenOrders, setSeenOrders] = useState<Set<string>>(new Set())

  const isItemNew = (orderId: string, frictionStartedAt: number): boolean => {
    if (seenOrders.has(orderId)) return false
    const state = getUnreadState(currentBusinessId)
    if (state.orderSeen[orderId]) return false
    return frictionStartedAt > (lastSeenRef.current ?? 0)
  }

  const loadData = async () => {
    await runWithLoadState(async () => {
      const attentionItems = await attentionEngine.getAttentionItems(currentBusinessId)
      const connections = await dataStore.getConnectionsByBusinessId(currentBusinessId)
      const entities = await dataStore.getAllBusinessEntities()
      const entityMap = new Map(entities.map(e => [e.id, e]))

      const disputeItems = attentionItems
        .filter(item => item.category === 'Disputes')
        .map(item => {
          const connection = connections.find(c => c.id === item.connectionId)
          let connectionName = 'Unknown'
          if (connection) {
            const otherId = connection.buyerBusinessId === currentBusinessId
              ? connection.supplierBusinessId
              : connection.buyerBusinessId
            connectionName = entityMap.get(otherId)?.businessName || 'Unknown'
          }
          return { ...item, connectionName }
        })

      const allRequests = await dataStore.getAllConnectionRequests()
      const pendingRequests = allRequests.filter(
        r => r.receiverBusinessId === currentBusinessId && r.status === 'Pending'
      )

      setItems(disputeItems)
      setConnectionRequests(pendingRequests)
    })
  }

  useEffect(() => {
    loadData()
  }, [currentBusinessId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'issues:changed', 'connections:changed', 'connection-requests:changed'],
    () => { loadData() }
  )

  if (initialLoading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 className="text-[17px] text-foreground font-normal">Disputes</h1>
          </div>
        </div>
        <div className="flex-1 px-4 pt-3 space-y-2">
          {[1, 2, 3].map(item => (
            <div key={item} className="animate-pulse h-[72px] rounded-xl bg-muted/40" />
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0 && connectionRequests.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Disputes</h1>
          <InlineRefreshSpinner refreshing={refreshing} />
        </div>
        <ScreenRefreshIndicator refreshing={refreshing} />
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
          <InlineRefreshSpinner refreshing={refreshing} />
        </div>
        <ScreenRefreshIndicator refreshing={refreshing} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {connectionRequests.length > 0 && (
          <div>
            <div className="px-4 pt-3 pb-1.5">
              <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                Connection Requests
              </h2>
            </div>
            {connectionRequests.map(request => (
              <ConnectionRequestItem
                key={request.id}
                request={request}
                currentBusinessId={currentBusinessId}
                onUpdate={loadData}
                onNavigateToConnections={onNavigateToConnections}
              />
            ))}
          </div>
        )}

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
