import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrdersData } from '@/hooks/data/use-business-data'
import { PencilSimple, X } from '@phosphor-icons/react'
import { OrderCard } from '@/components/order/OrderCard'
import { InlineRefreshSpinner, ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'
import {
  OrderSearchPanel,
  type OrderFilters,
  type StatusChip,
  type RoleFilter,
  CHIP_LABELS,
  CHIP_COLORS,
  CHIPS_BY_ROLE,
  formatDateShort,
} from '@/components/order/OrderSearchPanel'
import { startOfDay } from 'date-fns'

interface OrdersTabParams {
  role?: RoleFilter
  chip?: StatusChip
  dateToday?: boolean
}

interface Props {
  currentBusinessId: string
  onSelectOrder: (orderId: string, connectionId: string) => void
  initialFilter?: string
  initialParams?: OrdersTabParams
  isActive?: boolean
  onNavigateToPlaceOrder: () => void
}

const EMPTY_FILTERS: OrderFilters = {
  searchText: '',
  activeChips: new Set<StatusChip>(),
  fromDate: null,
  toDate: null,
}

function matchesChip(
  order: { lifecycleState: string; settlementState: string; calculatedDueDate: number | null },
  chip: StatusChip,
  role: RoleFilter
): boolean {
  const lifecycle = order.lifecycleState
  const now = Date.now()
  const isOverdue = order.calculatedDueDate !== null
    && order.calculatedDueDate < now
    && order.settlementState !== 'Paid'

  switch (chip) {
    case 'new':
      return lifecycle === 'Placed'
    case 'accepted':
      return lifecycle === 'Accepted'
    case 'placed':
      if (role === 'buying') {
        return lifecycle === 'Placed' || lifecycle === 'Accepted'
      }
      return lifecycle === 'Placed'
    case 'dispatched':
      return lifecycle === 'Dispatched'
    case 'delivered':
      return lifecycle === 'Delivered' && order.settlementState !== 'Paid'
    case 'paid':
      return order.settlementState === 'Paid'
    case 'overdue':
      return isOverdue
  }
}

const ROLE_LABELS: Record<RoleFilter, string> = {
  all: 'All',
  buying: 'Buying',
  selling: 'Selling',
}

export function OrdersScreen({ currentBusinessId, onSelectOrder, initialFilter, initialParams, isActive = true, onNavigateToPlaceOrder }: Props) {
  const { data: orders = [], isInitialLoading, isRefreshing } = useOrdersData(currentBusinessId, isActive)
  const { initialLoading, refreshing } = useScreenLoadState({
    hasData: orders.length > 0,
    isInitialLoading,
    isRefreshing: isActive && isRefreshing,
  })

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [orderFilters, setOrderFilters] = useState<OrderFilters>(EMPTY_FILTERS)
  const [panelVisible, setPanelVisible] = useState(false)
  const [deepLinkActive, setDeepLinkActive] = useState(false)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const lastScrollTop = useRef(0)

  // Handle legacy initialFilter (old string-based filter)
  useEffect(() => {
    if (!initialFilter) return
    // Map old chip names to new navigation params
    const legacyMap: Record<string, { role: RoleFilter; chip: StatusChip }> = {
      accept:     { role: 'selling', chip: 'new' },
      dispatch:   { role: 'selling', chip: 'accepted' },
      in_transit: { role: 'buying', chip: 'dispatched' },
      pay:        { role: 'buying', chip: 'overdue' },
    }
    const mapped = legacyMap[initialFilter]
    if (mapped) {
      setRoleFilter(mapped.role)
      setOrderFilters(prev => ({ ...prev, activeChips: new Set([mapped.chip]) }))
      setPanelVisible(true)
      setDeepLinkActive(true)
    }
  }, [initialFilter])

  // Handle new deep-link params
  useEffect(() => {
    if (!initialParams) return

    if (initialParams.role) {
      setRoleFilter(initialParams.role)
    }

    if (initialParams.chip) {
      setOrderFilters(prev => ({
        ...prev,
        activeChips: new Set([initialParams.chip!]),
      }))
      setPanelVisible(true)
      setDeepLinkActive(true)
    }

    if (initialParams.dateToday) {
      const today = new Date()
      setOrderFilters(prev => ({
        ...prev,
        fromDate: startOfDay(today),
        toDate: startOfDay(today),
      }))
      setPanelVisible(true)
      setDeepLinkActive(true)
    }
  }, [initialParams])

  const handleRoleChange = (newRole: RoleFilter) => {
    setRoleFilter(newRole)
    const validChips = new Set(CHIPS_BY_ROLE[newRole])
    setOrderFilters(prev => {
      const reconciledChips = new Set(
        [...prev.activeChips].filter(chip => validChips.has(chip))
      )
      return { ...prev, activeChips: reconciledChips }
    })
  }

  const clearDeepLink = () => {
    setDeepLinkActive(false)
    setRoleFilter('all')
    setOrderFilters(EMPTY_FILTERS)
  }

  const handleListScroll = () => {
    const el = listScrollRef.current
    if (!el) return
    const st = el.scrollTop
    lastScrollTop.current = st
    if (st > 30) setPanelVisible(true)
    else if (st <= 8) setPanelVisible(false)
  }

  // Order counts for role toggle badges
  const allCount = useMemo(() => orders.filter(o => !o.declinedAt).length, [orders])
  const buyingCount = useMemo(() => orders.filter(o => !o.declinedAt && o.isBuyer).length, [orders])
  const sellingCount = useMemo(() => orders.filter(o => !o.declinedAt && !o.isBuyer).length, [orders])

  const filteredOrders = useMemo(() => {
    const { searchText, activeChips, fromDate, toDate } = orderFilters

    // Step 1: Role filter
    let result = orders
    if (roleFilter === 'buying') {
      result = result.filter(o => o.isBuyer)
    } else if (roleFilter === 'selling') {
      result = result.filter(o => !o.isBuyer)
    }

    // Step 2: Exclude declined (unless actively searching)
    const hasFilters = searchText.trim() || activeChips.size > 0 || fromDate || toDate
    if (!hasFilters) {
      result = result.filter(o => !o.declinedAt)
    }

    // Step 3: Search text
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      result = result.filter(o =>
        o.itemSummary?.toLowerCase().includes(q) ||
        o.connectionName?.toLowerCase().includes(q)
      )
    }

    // Step 4: Chip filter
    if (activeChips.size > 0) {
      result = result.filter(o =>
        [...activeChips].some(chip => matchesChip(o, chip, roleFilter))
      )
    }

    // Step 5: Date range
    if (fromDate) {
      result = result.filter(o =>
        startOfDay(new Date(o.createdAt)) >= startOfDay(fromDate)
      )
    }
    if (toDate) {
      result = result.filter(o =>
        startOfDay(new Date(o.createdAt)) <= startOfDay(toDate)
      )
    }

    return result
  }, [orders, roleFilter, orderFilters])

  const sectionLabel = useMemo(() => {
    const { searchText, activeChips, fromDate, toDate } = orderFilters
    const parts: string[] = []

    if (roleFilter !== 'all') {
      parts.push(ROLE_LABELS[roleFilter].toUpperCase())
    }

    if (activeChips.size > 0) {
      parts.push([...activeChips].map(c => CHIP_LABELS[c].toUpperCase()).join(' · '))
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
  }, [orderFilters, roleFilter])

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

  const roleCounts: Record<RoleFilter, number> = {
    all: allCount,
    buying: buyingCount,
    selling: sellingCount,
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Orders</h1>
        </div>
        <ScreenRefreshIndicator refreshing={refreshing} />

        {/* Role Toggle */}
        <div style={{ padding: '0 16px', marginBottom: '8px' }}>
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-screen)',
            borderRadius: '10px',
            padding: '3px',
          }}>
            {(['all', 'buying', 'selling'] as RoleFilter[]).map(role => {
              const isActiveRole = roleFilter === role
              const count = roleCounts[role]
              return (
                <button
                  key={role}
                  onClick={() => handleRoleChange(role)}
                  style={{
                    flex: 1,
                    borderRadius: '8px',
                    padding: '6px 0',
                    fontSize: '13px',
                    fontWeight: 600,
                    textAlign: 'center',
                    backgroundColor: isActiveRole ? 'var(--bg-card)' : 'transparent',
                    color: isActiveRole ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: isActiveRole ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                  }}
                >
                  {ROLE_LABELS[role]}{count > 0 ? ` (${count})` : ''}
                </button>
              )
            })}
          </div>
        </div>

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
                roleFilter={roleFilter}
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
        {/* Deep-link filter banner */}
        {deepLinkActive && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              marginBottom: '10px',
              borderRadius: '10px',
              backgroundColor: orderFilters.activeChips.size === 1
                ? `color-mix(in srgb, ${CHIP_COLORS[[...orderFilters.activeChips][0]]} 8%, transparent)`
                : 'var(--bg-card)',
              border: '1px solid var(--border-light)',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Showing: {roleFilter !== 'all' ? `${ROLE_LABELS[roleFilter]}` : ''}{roleFilter !== 'all' && orderFilters.activeChips.size > 0 ? ' · ' : ''}{[...orderFilters.activeChips].map(c => CHIP_LABELS[c]).join(', ')}
              {orderFilters.fromDate && orderFilters.toDate ? ` · ${formatDateShort(orderFilters.fromDate)} – ${formatDateShort(orderFilters.toDate)}` : ''}
            </span>
            <button
              onClick={clearDeepLink}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'var(--border-light)',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X size={12} weight="bold" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-[10px]">
          <div>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {sectionLabel}
            </p>
            {orderFilters.activeChips.size === 1 && (() => {
              const activeChip = [...orderFilters.activeChips][0]
              return (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
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
              {orderFilters.activeChips.has('overdue')
                ? 'No overdue orders.'
                : roleFilter === 'buying' && !hasActiveFilters && !orderFilters.searchText.trim()
                ? 'No orders as buyer yet.'
                : roleFilter === 'selling' && !hasActiveFilters && !orderFilters.searchText.trim()
                ? 'No orders as supplier yet.'
                : hasActiveFilters || orderFilters.searchText.trim()
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
