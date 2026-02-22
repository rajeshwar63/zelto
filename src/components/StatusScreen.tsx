import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { isToday, isYesterday, formatDistanceToNow, format } from 'date-fns'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'

interface Props {
  currentBusinessId: string
  onNavigateToConnection: (connectionId: string, orderId: string) => void
}

interface LifecycleEvent {
  orderId: string
  connectionId: string
  connectionName: string
  itemSummary: string
  event: string
  timestamp: number
}

function formatEventText(event: string): string {
  switch (event) {
    case 'Placed': return 'Order Placed'
    case 'Dispatched': return 'Dispatched'
    case 'Delivered': return 'Delivered'
    default: return event
  }
}

function getSectionLabel(timestamp: number): string {
  if (isToday(timestamp)) return 'Today'
  if (isYesterday(timestamp)) return 'Yesterday'
  return format(timestamp, 'MMM d, yyyy')
}

export function StatusScreen({ currentBusinessId, onNavigateToConnection }: Props) {
  const [events, setEvents] = useState<LifecycleEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadEvents() {
      const connections = await dataStore.getConnectionsByBusinessId(currentBusinessId)
      const allOrders = await dataStore.getAllOrders()
      const entities = await dataStore.getAllBusinessEntities()
      const entityMap = new Map(entities.map(e => [e.id, e]))

      const lifecycleEvents: LifecycleEvent[] = []

      allOrders.forEach(order => {
        const connection = connections.find(c => c.id === order.connectionId)
        if (!connection) return

        const otherId = connection.buyerBusinessId === currentBusinessId
          ? connection.supplierBusinessId
          : connection.buyerBusinessId
        const connectionName = entityMap.get(otherId)?.businessName || 'Unknown'

        if (order.createdAt) {
          lifecycleEvents.push({
            orderId: order.id,
            connectionId: connection.id,
            connectionName,
            itemSummary: order.itemSummary,
            event: 'Placed',
            timestamp: order.createdAt,
          })
        }

        if (order.dispatchedAt) {
          lifecycleEvents.push({
            orderId: order.id,
            connectionId: connection.id,
            connectionName,
            itemSummary: order.itemSummary,
            event: 'Dispatched',
            timestamp: order.dispatchedAt,
          })
        }

        if (order.deliveredAt) {
          lifecycleEvents.push({
            orderId: order.id,
            connectionId: connection.id,
            connectionName,
            itemSummary: order.itemSummary,
            event: 'Delivered',
            timestamp: order.deliveredAt,
          })
        }
      })

      lifecycleEvents.sort((a, b) => b.timestamp - a.timestamp)
      setEvents(lifecycleEvents)
      setLoading(false)
    }

    loadEvents()
  }, [currentBusinessId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 className="text-[17px] text-foreground font-normal">Status</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        </div>
      </div>
    )
  }

  let currentSection = ''

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Status</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {events.map((event, index) => {
          const sectionLabel = getSectionLabel(event.timestamp)
          const showSection = sectionLabel !== currentSection
          if (showSection) currentSection = sectionLabel
          const eventColor = getLifecycleStatusColor(event.event)

          return (
            <div key={`${event.orderId}-${event.event}-${index}`}>
              {showSection && (
                <div className="px-4 pt-4 pb-1">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                    {sectionLabel}
                  </p>
                </div>
              )}
              <button
                onClick={() => onNavigateToConnection(event.connectionId, event.orderId)}
                className="w-full px-4 py-2.5 text-left"
              >
                <p className="text-[14px] text-foreground leading-snug mb-0.5">
                  {event.itemSummary}
                </p>
                <p className="text-[12px] text-muted-foreground mb-0.5">
                  {event.connectionName}
                </p>
                <div className="flex items-center gap-1.5 text-[12px]">
                  <span style={{ color: eventColor }}>
                    {formatEventText(event.event)}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                  </span>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}