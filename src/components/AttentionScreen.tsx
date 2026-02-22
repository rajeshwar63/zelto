import { useEffect, useState } from 'react'
import { attentionEngine } from '@/lib/attention-engine'
import { dataStore } from '@/lib/data-store'
import { formatDistanceToNow } from 'date-fns'
import type { AttentionItem, AttentionCategory } from '@/lib/attention-engine'
import type { ConnectionRequest } from '@/lib/types'
import { getAttentionHeadingColor } from '@/lib/semantic-colors'
import { ConnectionRequestItem } from '@/components/ConnectionRequestItem'

interface Props {
  currentBusinessId: string
  onNavigateToConnections: () => void
  onNavigateToConnection: (connectionId: string, orderId?: string) => void
}

interface ItemWithConnection extends AttentionItem {
  connectionName: string
}

const CATEGORY_ORDER: AttentionCategory[] = [
  'Overdue',
  'Due Today',
  'Pending Payments',
  'Disputes',
  'Approval Needed',
]

const CATEGORY_LABELS: Record<AttentionCategory, string> = {
  'Overdue': 'Overdue',
  'Due Today': 'Due Today',
  'Pending Payments': 'Pending',
  'Disputes': 'Disputes',
  'Approval Needed': 'Approval',
}

export function AttentionScreen({ currentBusinessId, onNavigateToConnections, onNavigateToConnection }: Props) {
  const [items, setItems] = useState<ItemWithConnection[]>([])
  const [connectionRequests, setConnectionRequests] = useState<ConnectionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFilter, setSelectedFilter] = useState<AttentionCategory | 'All'>('All')

  const loadData = async () => {
    const attentionItems = await attentionEngine.getAttentionItems(currentBusinessId)
    const connections = await dataStore.getConnectionsByBusinessId(currentBusinessId)
    const entities = await dataStore.getAllBusinessEntities()
    const entityMap = new Map(entities.map(e => [e.id, e]))

    const itemsWithNames = attentionItems.map(item => {
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

    setItems(itemsWithNames)
    setConnectionRequests(pendingRequests)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [currentBusinessId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const itemsByCategory = new Map<AttentionCategory, ItemWithConnection[]>()
  CATEGORY_ORDER.forEach(category => {
    const categoryItems = items.filter(item => item.category === category)
    if (categoryItems.length > 0) itemsByCategory.set(category, categoryItems)
  })

  const availableCategories = Array.from(itemsByCategory.keys())

  if (itemsByCategory.size === 0 && connectionRequests.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 className="text-[17px] text-foreground font-normal">Attention</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
        </div>
      </div>
    )
  }

  const filteredItems = selectedFilter === 'All'
    ? items
    : items.filter(item => item.category === selectedFilter)

  const filteredItemsByCategory = new Map<AttentionCategory, ItemWithConnection[]>()
  CATEGORY_ORDER.forEach(category => {
    const categoryItems = filteredItems.filter(item => item.category === category)
    if (categoryItems.length > 0) filteredItemsByCategory.set(category, categoryItems)
  })

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Attention</h1>
        </div>
        {itemsByCategory.size > 0 && (
          <div className="border-b border-border py-2 px-4">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setSelectedFilter('All')}
                className={`text-sm whitespace-nowrap pb-1 ${
                  selectedFilter === 'All'
                    ? 'text-foreground border-b-2 border-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                All
              </button>
              {availableCategories.map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedFilter(category)}
                  className={`text-sm whitespace-nowrap pb-1 ${
                    selectedFilter === category
                      ? 'text-foreground border-b-2 border-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
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

        {CATEGORY_ORDER.map(category => {
          const categoryItems = filteredItemsByCategory.get(category)
          if (!categoryItems) return null
          const categoryColor = getAttentionHeadingColor(category)

          return (
            <div key={category}>
              <div className="px-4 pt-3 pb-1.5">
                <h2
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: categoryColor || 'hsl(var(--muted-foreground) / 0.6)' }}
                >
                  {category}
                </h2>
              </div>
              {categoryItems.map(item => {
                const amount = item.metadata?.pendingAmount
                const amountStr = amount ? `₹${amount.toLocaleString('en-IN')}` : ''
                const issueType = item.metadata?.issueType || 'Issue'

                const statusLabel = ({
                  'Overdue': `Overdue${amountStr ? ` · ${amountStr}` : ''}`,
                  'Due Today': `Due today${amountStr ? ` · ${amountStr}` : ''}`,
                  'Pending Payments': `Pending${amountStr ? ` · ${amountStr}` : ''}`,
                  'Disputes': `Dispute · ${issueType}`,
                  'Approval Needed': 'Awaiting Dispatch',
                } as Record<string, string>)[item.category] || item.description

                const statusColor = ({
                  'Overdue': '#D64545',
                  'Due Today': '#E8A020',
                  'Pending Payments': '#444444',
                  'Disputes': '#D64545',
                  'Approval Needed': '#E8A020',
                } as Record<string, string>)[item.category]

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigateToConnection(item.connectionId, item.orderId)}
                    className="w-full px-4 py-3 text-left"
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
                      <p className="text-[12px] font-medium" style={{ color: statusColor }}>
                        {statusLabel}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}