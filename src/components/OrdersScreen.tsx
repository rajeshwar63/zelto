import { useEffect, useMemo, useState } from 'react'
import { useOrdersData } from '@/hooks/data/use-business-data'
import { PencilSimple, MagnifyingGlass, Faders } from '@phosphor-icons/react'
import { OrderCard } from '@/components/order/OrderCard'
import { InlineRefreshSpinner, ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'
import {
  type OrderFilters,
  type StatusChip,
  type RoleFilter,
  CHIP_LABELS,
  CHIPS_BY_ROLE,
} from '@/components/order/OrderSearchPanel'
import { FilterSheet, getStatusChipBackground, getStatusChipColor } from '@/components/order/FilterSheet'
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

export function OrdersScreen({ currentBusinessId, onSelectOrder, initialFilter, initialParams, isActive = true, onNavigateToPlaceOrder }: Props) {
  const { data: orders = [], isInitialLoading, isRefreshing } = useOrdersData(currentBusinessId, isActive)
  const { initialLoading, refreshing } = useScreenLoadState({
    hasData: orders.length > 0,
    isInitialLoading,
    isRefreshing: isActive && isRefreshing,
  })

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('buying')
  const [orderFilters, setOrderFilters] = useState<OrderFilters>(EMPTY_FILTERS)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  // Handle legacy initialFilter (old string-based filter)
  useEffect(() => {
    if (!initialFilter) return
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
    }
  }, [initialFilter])

  // Handle new deep-link params
  useEffect(() => {
    if (!initialParams) return

    if (initialParams.role && initialParams.role !== 'all') {
      setRoleFilter(initialParams.role)
    }

    if (initialParams.chip) {
      setOrderFilters(prev => ({
        ...prev,
        activeChips: new Set([initialParams.chip!]),
      }))
    }

    if (initialParams.dateToday) {
      const today = new Date()
      setOrderFilters(prev => ({
        ...prev,
        fromDate: startOfDay(today),
        toDate: startOfDay(today),
      }))
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

  const toggleStatusFilter = (chip: StatusChip) => {
    setOrderFilters(prev => {
      const next = new Set(prev.activeChips)
      if (next.has(chip)) next.delete(chip)
      else next.add(chip)
      return { ...prev, activeChips: next }
    })
  }

  const removeStatusFilter = (chip: StatusChip) => {
    setOrderFilters(prev => {
      const next = new Set(prev.activeChips)
      next.delete(chip)
      return { ...prev, activeChips: next }
    })
  }

  const clearAllFilters = () => {
    setOrderFilters(prev => ({ ...prev, activeChips: new Set() }))
  }

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

  const totalOrders = useMemo(() =>
    orders.filter(o => {
      const matchesRole = roleFilter === 'buying' ? o.isBuyer : !o.isBuyer
      return matchesRole && !o.declinedAt
    }).length
  , [orders, roleFilter])

  const activeStatusFilters = useMemo(() => [...orderFilters.activeChips], [orderFilters.activeChips])

  const hasActiveFilters = orderFilters.activeChips.size > 0

  if (initialLoading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Orders</h1>
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
        <ScreenRefreshIndicator refreshing={refreshing} />

        {/* Row 1 — Title + Role Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px 8px',
        }}>
          <h1 style={{
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}>
            Orders
          </h1>

          {/* Compact pill toggle */}
          <div style={{
            display: 'flex',
            borderRadius: 999,
            border: '0.5px solid var(--border-light)',
            overflow: 'hidden',
          }}>
            {(['buying', 'selling'] as const).map(role => (
              <button
                key={role}
                onClick={() => handleRoleChange(role)}
                style={{
                  padding: '5px 14px',
                  fontSize: 12,
                  fontWeight: roleFilter === role ? 600 : 400,
                  border: 'none',
                  cursor: 'pointer',
                  background: roleFilter === role
                    ? 'var(--text-primary)'
                    : 'transparent',
                  color: roleFilter === role
                    ? 'var(--bg-card)'
                    : 'var(--text-secondary)',
                  transition: 'all 150ms',
                }}
              >
                {role === 'buying' ? 'Buying' : 'Selling'}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2 — Search Bar + Filter Button */}
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '0 16px 8px',
        }}>
          {/* Search input */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '0.5px solid var(--border-light)',
            borderRadius: 'var(--radius-input)',
            padding: '8px 12px',
          }}>
            <MagnifyingGlass size={16} color="var(--text-secondary)" />
            <input
              type="text"
              placeholder="Search orders..."
              value={orderFilters.searchText}
              onChange={e => setOrderFilters(prev => ({ ...prev, searchText: e.target.value }))}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Filter button */}
          <button
            onClick={() => setFilterSheetOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              border: '0.5px solid var(--border-light)',
              borderRadius: 'var(--radius-input)',
              padding: '8px 10px',
              background: hasActiveFilters
                ? 'rgba(74, 108, 247, 0.08)'
                : 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              color: hasActiveFilters
                ? 'var(--brand-primary)'
                : 'var(--text-secondary)',
              transition: 'all 150ms',
            }}
          >
            <Faders size={16} />
            Filter
            {hasActiveFilters && (
              <span style={{
                background: 'var(--brand-primary)',
                color: 'white',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {activeStatusFilters.length}
              </span>
            )}
          </button>
        </div>

        {/* Row 3 — Active Filter Chips (conditional) */}
        {hasActiveFilters && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px 10px',
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {activeStatusFilters.map(chip => (
                <span
                  key={chip}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: getStatusChipBackground(chip),
                    color: getStatusChipColor(chip),
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  onClick={() => removeStatusFilter(chip)}
                >
                  {CHIP_LABELS[chip]}
                  <span style={{ fontSize: 10, opacity: 0.7 }}>✕</span>
                </span>
              ))}
            </div>
            <span style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              marginLeft: 8,
            }}>
              {totalOrders} orders · {filteredOrders.length} match
            </span>
          </div>
        )}

        {/* Divider */}
        <div style={{
          height: 0.5,
          background: 'var(--border-light)',
          margin: '0 16px',
        }} />
      </div>

      {/* Order List */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        {!hasActiveFilters && (
          <div className="flex items-center justify-between mb-[10px]">
            <div />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <InlineRefreshSpinner refreshing={refreshing} />
            </div>
          </div>
        )}
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

      {/* Filter Bottom Sheet */}
      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        activeChips={orderFilters.activeChips}
        onToggleChip={toggleStatusFilter}
        onClearAll={clearAllFilters}
        roleFilter={roleFilter}
      />
    </div>
  )
}
