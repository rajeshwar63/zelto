import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrdersData } from '@/hooks/data/use-business-data'
import { PencilSimple, X } from '@phosphor-icons/react'
import { OrderCard } from '@/components/order/OrderCard'
import { InlineRefreshSpinner, ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'
import { OrderSearchPanel, type OrderFilters, type StatusChip, CHIP_LABELS, formatDateShort } from '@/components/order/OrderSearchPanel'
import { startOfDay } from 'date-fns'

interface Props {
  currentBusinessId: string
  onSelectOrder: (orderId: string, connectionId: string) => void
  initialFilter?: string
  isActive?: boolean
  onNavigateToPlaceOrder: () => void
}

const EMPTY_FILTERS: OrderFilters = {
  searchText: '',
  activeChips: new Set<StatusChip>(),
  fromDate: null,
  toDate: null,
}

export function OrdersScreen({ currentBusinessId, onSelectOrder, initialFilter, isActive = true, onNavigateToPlaceOrder }: Props) {
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

  useEffect(() => {
    if (!initialFilter) return
    const chipMap: Record<string, StatusChip> = {
      accept:     'accept',
      dispatch:   'dispatch',
      in_transit: 'in_transit',
      pay:        'pay',
      disputed:   'disputed',
      paid:       'paid',
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
    lastScrollTop.current = st
    if (st > 30) setPanelVisible(true)
    else if (st <= 8) setPanelVisible(false)
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
          if (chip === 'accept')     return order.lifecycleState === 'Placed'
          if (chip === 'dispatch')   return order.lifecycleState === 'Accepted'
          if (chip === 'in_transit') return order.lifecycleState === 'Dispatched'
          if (chip === 'pay')        return order.lifecycleState === 'Delivered' && order.settlementState !== 'Paid'
          if (chip === 'disputed')   return order.hasOpenIssue === true
          if (chip === 'paid')       return order.settlementState === 'Paid'
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

  const chipUpperLabels: Record<StatusChip, string> = {
    accept:     'ACCEPT',
    dispatch:   'DISPATCH',
    in_transit: 'IN TRANSIT',
    pay:        'PAY',
    disputed:   'DISPUTED',
    paid:       'PAID',
  }

  const CHIP_SECTION_LABELS: Record<StatusChip, string> = {
    accept:     'Accept or decline',
    dispatch:   'Ready to dispatch',
    in_transit: 'In transit',
    pay:        'Payment due',
    disputed:   'Has open issue',
    paid:       'Settled',
  }

  const sectionLabel = useMemo(() => {
    const { searchText, activeChips, fromDate, toDate } = orderFilters
    const parts: string[] = []

    if (activeChips.size > 0) {
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
        <AnimatePresence>
          {panelVisible && (
            <motion.div
              key="filter-panel"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <OrderSearchPanel
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        ref={listScrollRef}
        onScroll={handleListScroll}
        className="flex-1 overflow-y-auto px-4 pt-3 pb-24"
      >
        <div className="flex items-center justify-between mb-[10px]">
          <div>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {sectionLabel}
            </p>
            {orderFilters.activeChips.size === 1 && (() => {
              const activeChip = [...orderFilters.activeChips][0]
              return (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {filteredOrders.length} orders — {CHIP_SECTION_LABELS[activeChip]}
                </p>
              )
            })()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {orders.length > 0 && filteredOrders.length !== orders.length && orderFilters.activeChips.size !== 1 && (
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
        onClick={onNavigateToPlaceOrder}
        className="fixed bottom-24 right-4 w-14 h-14 flex items-center justify-center z-20"
        style={{
          backgroundColor: 'var(--brand-primary)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 4px 16px rgba(74,108,247,0.4)',
        }}
      >
        <PencilSimple size={24} weight="regular" color="#FFFFFF" />
      </button>
    </div>
  )
}
