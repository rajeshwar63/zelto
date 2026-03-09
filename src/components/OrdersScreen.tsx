import { useEffect, useMemo, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { createOrder } from '@/lib/interactions'
import { useDataListener } from '@/lib/data-events'
import { formatDistanceToNow, isToday } from 'date-fns'
import type { Connection, OrderWithPaymentState, BusinessEntity } from '@/lib/types'
import { getLifecycleStatusColor, getDueDateColor } from '@/lib/semantic-colors'
import { Plus, PencilSimple, MagnifyingGlass, X, PaperPlaneTilt } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type OrderFilter = 'all' | 'today' | 'placed' | 'dispatched' | 'delivered' | 'payment_pending' | 'paid' | 'awaiting_dispatch'

interface EnrichedOrder extends OrderWithPaymentState {
  connectionName: string
  lifecycleState: string
  latestActivity: number
}

interface Props {
  currentBusinessId: string
  onSelectOrder: (orderId: string, connectionId: string) => void
  initialFilter?: string
}

function getLifecycleState(order: OrderWithPaymentState): string {
  if (order.declinedAt) return 'Declined'
  if (order.deliveredAt) return 'Delivered'
  if (order.dispatchedAt) return 'Dispatched'
  if (order.acceptedAt) return 'Accepted'
  return 'Placed'
}

function getLatestActivity(order: OrderWithPaymentState): number {
  return Math.max(
    order.deliveredAt || 0,
    order.dispatchedAt || 0,
    order.acceptedAt || 0,
    order.createdAt || 0,
  )
}

const FILTER_LABELS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'placed', label: 'Placed' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'payment_pending', label: 'Payment Pending' },
  { key: 'paid', label: 'Paid' },
]

function formatPaymentTerms(terms: Connection['paymentTerms']): string | null {
  if (!terms) return null
  switch (terms.type) {
    case 'Advance Required': return 'Advance Required'
    case 'Payment on Delivery': return 'Payment on Delivery'
    case 'Bill to Bill': return 'Bill to Bill'
    case 'Days After Delivery': return `${terms.days} days after delivery`
  }
}

export function OrdersScreen({ currentBusinessId, onSelectOrder, initialFilter }: Props) {
  const [orders, setOrders] = useState<EnrichedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<OrderFilter>((initialFilter as OrderFilter) || 'all')

  // Order creation modal state
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [eligibleConnections, setEligibleConnections] = useState<Connection[]>([])
  const [businesses, setBusinesses] = useState<Map<string, BusinessEntity>>(new Map())
  const [search, setSearch] = useState('')
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const loadOrders = async () => {
    const [allOrders, connections, entities] = await Promise.all([
      dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId),
      dataStore.getConnectionsByBusinessId(currentBusinessId),
      dataStore.getAllBusinessEntities(),
    ])

    const entityMap = new Map(entities.map(e => [e.id, e]))
    const connMap = new Map(connections.map(c => [c.id, c]))

    const enriched: EnrichedOrder[] = allOrders.map(order => {
      const conn = connMap.get(order.connectionId)
      let connectionName = 'Unknown'
      if (conn) {
        const otherId = conn.buyerBusinessId === currentBusinessId
          ? conn.supplierBusinessId
          : conn.buyerBusinessId
        connectionName = entityMap.get(otherId)?.businessName || 'Unknown'
      }
      return {
        ...order,
        connectionName,
        lifecycleState: getLifecycleState(order),
        latestActivity: getLatestActivity(order),
      }
    })

    enriched.sort((a, b) => b.latestActivity - a.latestActivity)
    setOrders(enriched)
    setLoading(false)
  }

  useEffect(() => {
    loadOrders()
  }, [currentBusinessId])

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter as OrderFilter)
    }
  }, [initialFilter])

  useDataListener(
    ['orders:changed', 'payments:changed'],
    () => { loadOrders() }
  )

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (order.declinedAt) return filter === 'all'
      switch (filter) {
        case 'all': return true
        case 'today': return isToday(order.createdAt)
        case 'placed': return order.lifecycleState === 'Placed'
        case 'awaiting_dispatch': return order.lifecycleState === 'Placed' || order.lifecycleState === 'Accepted'
        case 'dispatched': return order.lifecycleState === 'Dispatched'
        case 'delivered': return order.lifecycleState === 'Delivered' && order.settlementState !== 'Paid'
        case 'payment_pending': return order.deliveredAt && order.settlementState !== 'Paid'
        case 'paid': return order.settlementState === 'Paid'
        default: return true
      }
    })
  }, [orders, filter])

  const handleOpenOrderModal = async () => {
    const allConnections = await dataStore.getConnectionsByBusinessId(currentBusinessId)
    const eligible = allConnections.filter(
      c => c.buyerBusinessId === currentBusinessId && c.paymentTerms !== null
    )
    setEligibleConnections(eligible)

    const entities = await dataStore.getAllBusinessEntities()
    const businessMap = new Map(entities.map(e => [e.id, e]))
    setBusinesses(businessMap)
    setShowOrderModal(true)
  }

  const handleSendOrder = async () => {
    if (!selectedConnection || !message.trim()) return
    const connectionId = selectedConnection.id
    setIsSending(true)
    setSendError(null)
    try {
      await createOrder(connectionId, message.trim(), 0, currentBusinessId)
      toast.success('Order placed')
      setShowOrderModal(false)
      setSelectedConnection(null)
      setMessage('')
      setSearch('')
    } catch (error) {
      console.error('Failed to create order:', error)
      setSendError(error instanceof Error ? error.message : 'Failed to create order')
    } finally {
      setIsSending(false)
    }
  }

  const searchedConnections = useMemo(() => (
    search.trim()
      ? eligibleConnections.filter(conn => {
        const supplier = businesses.get(conn.supplierBusinessId)
        return supplier?.businessName.toLowerCase().includes(search.toLowerCase())
      })
      : eligibleConnections
  ), [businesses, eligibleConnections, search])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Orders</h1>
        </div>
        <div className="border-b border-border py-2 px-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {FILTER_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-[12px] whitespace-nowrap px-3 py-1.5 rounded-full transition-colors ${
                  filter === key
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredOrders.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">No orders found</p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const statusColor = getLifecycleStatusColor(order.lifecycleState)
            const isOverdue = order.deliveredAt && order.calculatedDueDate && Date.now() > order.calculatedDueDate && order.settlementState !== 'Paid'

            return (
              <button
                key={order.id}
                onClick={() => onSelectOrder(order.id, order.connectionId)}
                className="w-full text-left px-4 py-3 border-b border-border/50"
              >
                <div className="flex items-start justify-between">
                  <p className="text-[14px] text-foreground font-normal leading-snug flex-1 mr-3">
                    {order.itemSummary}
                  </p>
                  {order.orderValue > 0 && (
                    <p className="text-[15px] font-semibold text-foreground flex-shrink-0">
                      ₹{order.orderValue.toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[13px] text-muted-foreground">
                    {order.connectionName}
                  </p>
                  {isOverdue && (
                    <span style={{ color: '#D64545', fontSize: '12px', fontWeight: 500 }}>Overdue</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[12px]">
                  <span style={{ color: statusColor }}>{order.lifecycleState}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(order.latestActivity, { addSuffix: true })}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* FAB */}
      <button
        onClick={handleOpenOrderModal}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-20"
        style={{ backgroundColor: '#1A1A2E' }}
      >
        <PencilSimple size={24} weight="regular" color="#FFFFFF" />
      </button>

      {/* Order Creation Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl max-h-[90vh] flex flex-col">
            <div className="sticky top-0 bg-white border-b border-border px-4 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-medium">New Order</h2>
              <button onClick={() => {
                setShowOrderModal(false)
                setSelectedConnection(null)
                setMessage('')
                setSearch('')
              }}>
                <X size={24} weight="regular" />
              </button>
            </div>

            {!selectedConnection ? (
              <>
                <div className="px-4 py-3 border-b border-border">
                  <div className="relative">
                    <MagnifyingGlass size={20} weight="regular" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search suppliers..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {searchedConnections.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        {eligibleConnections.length === 0
                          ? 'No suppliers with payment terms set'
                          : 'No suppliers found'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {searchedConnections.map(conn => {
                        const supplier = businesses.get(conn.supplierBusinessId)
                        return (
                          <button
                            key={conn.id}
                            onClick={() => setSelectedConnection(conn)}
                            className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                          >
                            <p className="text-[15px] font-medium">{supplier?.businessName || 'Unknown'}</p>
                            <p className="text-[13px] text-muted-foreground mt-0.5">
                              {formatPaymentTerms(conn.paymentTerms)}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border">
                  <button onClick={() => setSelectedConnection(null)} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>←</span>
                    <span>Back to suppliers</span>
                  </button>
                  <p className="text-lg font-medium mt-2">
                    {businesses.get(selectedConnection.supplierBusinessId)?.businessName || 'Unknown'}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <Input
                    placeholder="Enter order details..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="px-4 py-4 border-t border-border">
                  {sendError && (
                    <p className="text-sm text-destructive mb-3">{sendError}</p>
                  )}
                  <Button
                    onClick={handleSendOrder}
                    disabled={!message.trim() || isSending}
                    className="w-full"
                  >
                    <PaperPlaneTilt size={20} weight="regular" className="mr-2" />
                    {isSending ? 'Sending...' : 'Send Order'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
