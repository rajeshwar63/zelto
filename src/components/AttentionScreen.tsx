import { useEffect, useState, useRef } from 'react'
import { attentionEngine } from '@/lib/attention-engine'
import { dataStore } from '@/lib/data-store'
import { formatDistanceToNow } from 'date-fns'
import type { AttentionItem } from '@/lib/attention-engine'
import type { ConnectionRequest } from '@/lib/types'
import { ConnectionRequestItem } from '@/components/ConnectionRequestItem'
import { markOrderSeen, getUnreadState, updateTabLastSeen } from '@/lib/unread-tracker'
import { useDataListener } from '@/lib/data-events'

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
  const [loading, setLoading] = useState(true)

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
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [currentBusinessId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'issues:changed', 'connections:changed', 'connection-requests:changed'],
    () => { loadData() }
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (items.length === 0 && connectionRequests.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 className="text-[17px] text-foreground font-normal">Disputes</h1>
          </div>
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
        </div>
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
            <div className="bg-white border border-border rounded-xl overflow-hidden">
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
                  className={`w-full px-4 py-3 text-left border-b border-border/30 transition-colors ${
                    isNew
                      ? 'border-l-[3px] border-l-red-400 bg-red-50/50'
                      : 'border-l-[3px] border-l-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-[14px] text-foreground font-normal leading-snug flex-1 mr-3">
                      {item.metadata?.orderSummary || item.description}
                    </p>
                    <p className="text-[12px] text-muted-foreground flex-shrink-0">
                      {formatDistanceToNow(item.frictionStartedAt, { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">
                      {item.connectionName}
                    </p>
                    <p className="text-[12px] font-medium" style={{ color: '#D64545' }}>
                      {issueType}
                    </p>
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
