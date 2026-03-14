import { useEffect, useMemo, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { createOrder } from '@/lib/interactions'
import { useOrdersData } from '@/hooks/data/use-business-data'
import { isToday } from 'date-fns'
import type { Connection, BusinessEntity } from '@/lib/types'
import { PencilSimple, MagnifyingGlass, X, PaperPlaneTilt } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { OrderCard } from '@/components/order/OrderCard'
import { toast } from 'sonner'
import { InlineRefreshSpinner, ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'

type OrderFilter = 'all' | 'today' | 'placed' | 'dispatched' | 'delivered' | 'payment_pending' | 'paid' | 'awaiting_dispatch' | 'overdue' | 'due_today'

interface Props {
  currentBusinessId: string
  onSelectOrder: (orderId: string, connectionId: string) => void
  initialFilter?: string
  isActive?: boolean
}

const FILTER_LABELS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'placed', label: 'Placed' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'payment_pending', label: 'Payment Pending' },
  { key: 'paid', label: 'Paid' },
]

function getFilterColor(key: OrderFilter): string {
  switch (key) {
    case 'placed': return 'var(--status-new)'
    case 'dispatched': return 'var(--status-dispatched)'
    case 'delivered': return 'var(--status-delivered)'
    case 'payment_pending': return 'var(--status-overdue)'
    case 'paid': return 'var(--status-success)'
    default: return 'var(--brand-primary)'
  }
}

function getFilterBg(key: OrderFilter): string {
  switch (key) {
    case 'placed': return '#F0F4FF'
    case 'dispatched': return '#FFF6F0'
    case 'delivered': return '#F0FFF6'
    case 'payment_pending': return '#FFF0F0'
    case 'paid': return '#F0FFF6'
    default: return 'var(--brand-primary-bg)'
  }
}

function formatPaymentTerms(terms: Connection['paymentTerms']): string | null {
  if (!terms) return null
  switch (terms.type) {
    case 'Advance Required': return 'Advance Required'
    case 'Payment on Delivery': return 'Payment on Delivery'
    case 'Bill to Bill': return 'Bill to Bill'
    case 'Days After Delivery': return `${terms.days} days after delivery`
  }
}

export function OrdersScreen({ currentBusinessId, onSelectOrder, initialFilter, isActive = true }: Props) {
  const { data: orders = [], isInitialLoading, isRefreshing } = useOrdersData(currentBusinessId, isActive)
  const { initialLoading, refreshing } = useScreenLoadState({
    hasData: orders.length > 0,
    isInitialLoading,
    isRefreshing: isActive && isRefreshing,
  })
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

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter as OrderFilter)
    }
  }, [initialFilter])

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
        case 'overdue': return order.deliveredAt != null && order.calculatedDueDate != null && Date.now() > order.calculatedDueDate && order.settlementState !== 'Paid'
        case 'due_today': return order.deliveredAt != null && order.calculatedDueDate != null && isToday(order.calculatedDueDate) && order.settlementState !== 'Paid'
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

  if (initialLoading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Orders</h1>
          </div>
        </div>
        <div className="flex-1 px-4 pt-4 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse" style={{ backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-card)', height: '80px' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Orders</h1>
        </div>
        <ScreenRefreshIndicator refreshing={refreshing} />
        <div style={{ borderBottom: '1px solid var(--border-light)', padding: '8px 16px' }}>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {FILTER_LABELS.map(({ key, label }) => {
              const isActive = filter === key
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className="whitespace-nowrap transition-colors"
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-chip)',
                    backgroundColor: isActive ? 'var(--brand-primary)' : getFilterBg(key),
                    color: isActive ? '#FFFFFF' : getFilterColor(key),
                    minHeight: '44px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        <div className="flex items-center justify-between mb-[10px]">
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {filter === 'all' ? 'ALL ORDERS' : (FILTER_LABELS.find(f => f.key === filter)?.label.toUpperCase() || 'ORDERS')}
          </p>
          <InlineRefreshSpinner refreshing={refreshing} />
        </div>
        {filteredOrders.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>No orders found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {filteredOrders.map(order => (
              <OrderCard
                key={order.id}
                itemSummary={order.item_summary}
                connectionName={order.connectionName}
                branchLabel={order.branchLabel}
                contactName={order.contactName}
                orderValue={order.orderValue}
                pendingAmount={order.pendingAmount ?? Math.max(order.orderValue - order.totalPaid, 0)}
                settlementState={order.settlementState}
                lifecycleState={order.lifecycleState}
                calculatedDueDate={order.calculatedDueDate}
                deliveredAt={order.deliveredAt}
                latestActivity={order.latestActivity}
                paymentTermSnapshot={order.paymentTermSnapshot}
                onClick={() => onSelectOrder(order.id, order.connectionId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={handleOpenOrderModal}
        className="fixed bottom-24 right-4 w-14 h-14 flex items-center justify-center z-20"
        style={{
          backgroundColor: 'var(--brand-primary)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 4px 16px rgba(74,108,247,0.4)',
        }}
      >
        <PencilSimple size={24} weight="regular" color="#FFFFFF" />
      </button>

      {/* Order Creation Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full max-h-[90vh] flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderTopLeftRadius: 'var(--radius-modal)', borderTopRightRadius: 'var(--radius-modal)' }}>
            <div className="sticky top-0 px-4 py-4 flex items-center justify-between" style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)', borderTopLeftRadius: 'var(--radius-modal)', borderTopRightRadius: 'var(--radius-modal)' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>New Order</h2>
              <button onClick={() => {
                setShowOrderModal(false)
                setSelectedConnection(null)
                setMessage('')
                setSearch('')
              }} style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={24} weight="regular" color="var(--text-primary)" />
              </button>
            </div>

            {!selectedConnection ? (
              <>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <div className="relative">
                    <MagnifyingGlass size={20} weight="regular" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
                    <Input
                      placeholder="Search suppliers..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                      style={{ borderRadius: 'var(--radius-input)' }}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {searchedConnections.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {eligibleConnections.length === 0
                          ? 'No suppliers with payment terms set'
                          : 'No suppliers found'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      {searchedConnections.map(conn => {
                        const supplier = businesses.get(conn.supplierBusinessId)
                        return (
                          <button
                            key={conn.id}
                            onClick={() => setSelectedConnection(conn)}
                            className="w-full text-left px-4 py-3"
                            style={{ borderBottom: '1px solid var(--border-section)', minHeight: '44px' }}
                          >
                            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{supplier?.businessName || 'Unknown'}</p>
                            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
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
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <button onClick={() => setSelectedConnection(null)} className="flex items-center gap-2" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', minHeight: '44px' }}>
                    <span>←</span>
                    <span>Back to suppliers</span>
                  </button>
                  <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>
                    {businesses.get(selectedConnection.supplierBusinessId)?.businessName || 'Unknown'}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <Input
                    placeholder="Enter order details..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full"
                    style={{ borderRadius: 'var(--radius-input)' }}
                  />
                </div>
                <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border-light)' }}>
                  {sendError && (
                    <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--status-overdue)', marginBottom: '12px' }}>{sendError}</p>
                  )}
                  <Button
                    onClick={handleSendOrder}
                    disabled={!message.trim() || isSending}
                    className="w-full"
                    style={{ backgroundColor: 'var(--brand-primary)', borderRadius: 'var(--radius-button)', minHeight: '44px', color: '#FFFFFF', fontWeight: 600 }}
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
