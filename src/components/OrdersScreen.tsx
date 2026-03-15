import { useEffect, useMemo, useState, useRef } from 'react'
import { dataStore } from '@/lib/data-store'
import { createOrder } from '@/lib/interactions'
import { useOrdersData } from '@/hooks/data/use-business-data'
import type { Connection, BusinessEntity } from '@/lib/types'
import { PencilSimple, MagnifyingGlass, X, PaperPlaneTilt } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { OrderCard } from '@/components/order/OrderCard'
import { toast } from 'sonner'
import { InlineRefreshSpinner, ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'
import { OrderSearchPanel, type OrderFilters, type StatusChip, CHIP_LABELS, formatDateShort } from '@/components/order/OrderSearchPanel'
import { startOfDay } from 'date-fns'

interface Props {
  currentBusinessId: string
  onSelectOrder: (orderId: string, connectionId: string) => void
  initialFilter?: string
  isActive?: boolean
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

const EMPTY_FILTERS: OrderFilters = {
  searchText: '',
  activeChips: new Set<StatusChip>(),
  fromDate: null,
  toDate: null,
}

export function OrdersScreen({ currentBusinessId, onSelectOrder, initialFilter, isActive = true }: Props) {
  const { data: orders = [], isInitialLoading, isRefreshing } = useOrdersData(currentBusinessId, isActive)
  const { initialLoading, refreshing } = useScreenLoadState({
    hasData: orders.length > 0,
    isInitialLoading,
    isRefreshing: isActive && isRefreshing,
  })

  const [orderFilters, setOrderFilters] = useState<OrderFilters>(EMPTY_FILTERS)
  const [panelVisible, setPanelVisible] = useState(false)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const lastScrollTop = useRef(0)

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
    if (!initialFilter) return
    const chipMap: Record<string, StatusChip> = {
      placed: 'placed',
      dispatched: 'dispatched',
      delivered: 'delivered',
      payment_pending: 'payment_pending',
      paid: 'paid',
    }
    const chip = chipMap[initialFilter]
    if (chip) {
      setOrderFilters(prev => ({ ...prev, activeChips: new Set([chip]) }))
      setPanelVisible(true)
    }
  }, [initialFilter])

  const handleListScroll = () => {
    const el = listScrollRef.current
    if (!el) return
    const st = el.scrollTop
    if (st < lastScrollTop.current && st <= 20) {
      setPanelVisible(true)
    } else if (st > lastScrollTop.current && st > 40) {
      setPanelVisible(false)
    }
    lastScrollTop.current = st
  }

  const filteredOrders = useMemo(() => {
    const { searchText, activeChips, fromDate, toDate } = orderFilters
    const hasFilters = searchText.trim() || activeChips.size > 0 || fromDate || toDate
    return orders.filter(order => {
      if (order.declinedAt) return !hasFilters

      if (searchText.trim()) {
        const q = searchText.toLowerCase()
        const matchText = order.itemSummary?.toLowerCase().includes(q)
        const matchConn = order.connectionName?.toLowerCase().includes(q)
        if (!matchText && !matchConn) return false
      }

      if (activeChips.size > 0) {
        const matchChip = [...activeChips].some(chip => {
          if (chip === 'placed')          return order.lifecycleState === 'Placed'
          if (chip === 'dispatched')      return order.lifecycleState === 'Dispatched'
          if (chip === 'delivered')       return order.lifecycleState === 'Delivered'
          if (chip === 'payment_pending') return order.settlementState !== 'Paid' && order.lifecycleState === 'Delivered'
          if (chip === 'paid')            return order.settlementState === 'Paid'
          return false
        })
        if (!matchChip) return false
      }

      if (fromDate) {
        if (startOfDay(new Date(order.createdAt)) < startOfDay(fromDate)) return false
      }
      if (toDate) {
        if (startOfDay(new Date(order.createdAt)) > startOfDay(toDate)) return false
      }

      return true
    })
  }, [orders, orderFilters])

  const sectionLabel = useMemo(() => {
    const { searchText, activeChips, fromDate, toDate } = orderFilters
    const parts: string[] = []

    if (activeChips.size > 0) {
      const chipUpperLabels: Record<StatusChip, string> = {
        placed: 'PLACED',
        dispatched: 'DISPATCHED',
        delivered: 'DELIVERED',
        payment_pending: 'PAYMENT PENDING',
        paid: 'PAID',
      }
      parts.push([...activeChips].map(c => chipUpperLabels[c]).join(' · '))
    }

    if (fromDate || toDate) {
      const fmt = (d: Date) =>
        d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
      if (fromDate && toDate) {
        parts.push(`${fmt(fromDate)} – ${fmt(toDate)}`)
      } else if (fromDate) {
        parts.push(`FROM ${fmt(fromDate)}`)
      }
    }

    let label = parts.length > 0 ? parts.join(' · ') : 'ALL ORDERS'
    if (searchText.trim()) {
      label += ` · "${searchText.trim()}"`
    }
    return label
  }, [orderFilters])

  const hasActiveFilters =
    orderFilters.activeChips.size > 0 || !!orderFilters.fromDate || !!orderFilters.toDate

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
        <OrderSearchPanel
          visible={panelVisible}
          filters={orderFilters}
          onFiltersChange={setOrderFilters}
          placeholder="Search orders…"
        />

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px 16px 8px' }}>
            {[...orderFilters.activeChips].map(chip => (
              <div
                key={chip}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  backgroundColor: '#E8EDFF',
                  borderRadius: '20px',
                  padding: '3px 6px 3px 10px',
                }}
              >
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#4A6CF7' }}>
                  {CHIP_LABELS[chip]}
                </span>
                <button
                  onClick={() => {
                    const newChips = new Set(orderFilters.activeChips)
                    newChips.delete(chip)
                    setOrderFilters(prev => ({ ...prev, activeChips: newChips }))
                  }}
                  style={{ display: 'flex', alignItems: 'center', color: '#4A6CF7', paddingLeft: '4px', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={10} weight="bold" />
                </button>
              </div>
            ))}
            {(orderFilters.fromDate || orderFilters.toDate) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  backgroundColor: '#E8EDFF',
                  borderRadius: '20px',
                  padding: '3px 6px 3px 10px',
                }}
              >
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#4A6CF7' }}>
                  {orderFilters.fromDate && orderFilters.toDate
                    ? `${formatDateShort(orderFilters.fromDate)} – ${formatDateShort(orderFilters.toDate)}`
                    : orderFilters.fromDate
                    ? `From ${formatDateShort(orderFilters.fromDate)}`
                    : `To ${formatDateShort(orderFilters.toDate!)}`}
                </span>
                <button
                  onClick={() => setOrderFilters(prev => ({ ...prev, fromDate: null, toDate: null }))}
                  style={{ display: 'flex', alignItems: 'center', color: '#4A6CF7', paddingLeft: '4px', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={10} weight="bold" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={listScrollRef}
        onScroll={handleListScroll}
        className="flex-1 overflow-y-auto px-4 pt-3 pb-24"
      >
        <div className="flex items-center justify-between mb-[10px]">
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {sectionLabel}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {orders.length > 0 && filteredOrders.length !== orders.length && (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {filteredOrders.length} of {orders.length} orders
              </p>
            )}
            <InlineRefreshSpinner refreshing={refreshing} />
          </div>
        </div>
        {filteredOrders.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {hasActiveFilters || orderFilters.searchText.trim()
                ? 'No orders match your filters'
                : 'No orders found'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {filteredOrders.map(order => (
              <OrderCard
                key={order.id}
                itemSummary={order.itemSummary}
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
                isBuyer={order.isBuyer}
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
