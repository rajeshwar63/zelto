import { useEffect, useMemo, useRef, useState } from 'react'
import { useOrdersData } from '@/hooks/data/use-business-data'
import { PencilSimple, MagnifyingGlass, Faders } from '@phosphor-icons/react'
import { OrderCard } from '@/components/order/OrderCard'
import { intelligenceEngine } from '@/lib/intelligence-engine'
import type { DispatchIntelItem } from '@/lib/intelligence-engine'
import { DispatchQueueView } from './orders/DispatchQueueView'
import { InlineRefreshSpinner, ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'
import {
  type OrderFilters,
  type StatusChip,
  type RoleFilter,
  CHIP_LABELS,
  CHIPS_BY_ROLE,
} from '@/components/order/OrderSearchPanel'
import { getStatusChipBackground, getStatusChipColor } from '@/components/order/FilterSheet'
import { startOfDay } from 'date-fns'
import {
  type OrdersDefaultTab,
  clearOrdersDefaultTabLocal,
  getOrdersDefaultTab,
  hasPinHintBeenShown,
  markPinHintShown,
  saveOrdersDefaultTabToSupabase,
  setOrdersDefaultTabLocal,
  syncOrdersDefaultTabFromSupabase,
} from '@/lib/orders-tab-preference'

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

// Small inline SVG pin icon
function PinIcon({ color = 'var(--text-secondary)' }: { color?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill={color}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M16 3a1 1 0 0 1 .707 1.707L15.414 6l1.879 5.172A2 2 0 0 1 15.414 14H13v5.586l-1 1-1-1V14H8.586a2 2 0 0 1-1.879-2.828L8.586 6 7.293 4.707A1 1 0 0 1 8 3h8z" />
    </svg>
  )
}

export function OrdersScreen({ currentBusinessId, onSelectOrder, initialFilter, initialParams, isActive = true, onNavigateToPlaceOrder }: Props) {
  const { data: orders = [], isInitialLoading, isRefreshing } = useOrdersData(currentBusinessId, isActive)
  const { initialLoading, refreshing } = useScreenLoadState({
    hasData: orders.length > 0,
    isInitialLoading,
    isRefreshing: isActive && isRefreshing,
  })

  const [roleFilter, setRoleFilter] = useState<RoleFilter>(() => getOrdersDefaultTab())
  const [pinnedTab, setPinnedTab] = useState<OrdersDefaultTab>(() => getOrdersDefaultTab())
  const [orderFilters, setOrderFilters] = useState<OrderFilters>(EMPTY_FILTERS)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [popoverTab, setPopoverTab] = useState<RoleFilter | null>(null)
  const [showPinHint, setShowPinHint] = useState(false)
  const [dispatchItems, setDispatchItems] = useState<DispatchIntelItem[]>([])
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [showDispatchTab, setShowDispatchTab] = useState(false)
  const [activeTab, setActiveTab] = useState<'dispatch' | null>(null)

  // Long-press timer refs
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // On mount: background-sync preference from Supabase
  useEffect(() => {
    syncOrdersDefaultTabFromSupabase((remoteTab) => {
      setPinnedTab(remoteTab)
      // Only update active tab if no deep-link has overridden it
      setRoleFilter(prev => {
        // If no deep-link params were applied yet, use remoteTab
        return prev === getOrdersDefaultTab() ? remoteTab : prev
      })
    })
  }, [])

  // Show first-time hint once
  useEffect(() => {
    if (!hasPinHintBeenShown()) {
      setShowPinHint(true)
    }
  }, [])

  // Auto-dismiss hint after 5s
  useEffect(() => {
    if (!showPinHint) return
    const timer = setTimeout(() => {
      setShowPinHint(false)
      markPinHintShown()
    }, 5000)
    return () => clearTimeout(timer)
  }, [showPinHint])

  // Dismiss popover on outside click
  useEffect(() => {
    if (!popoverTab) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverTab(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverTab])

  // Check if dispatch tab should show (any order where user is supplier and state is Accepted)
  useEffect(() => {
    const hasAcceptedSupplierOrder = orders.some(o => !o.isBuyer && o.lifecycleState === 'Accepted')
    setShowDispatchTab(hasAcceptedSupplierOrder)
  }, [orders])

  // Load dispatch data when dispatch tab is active
  useEffect(() => {
    if (activeTab !== 'dispatch') return
    let cancelled = false
    setDispatchLoading(true)
    intelligenceEngine.getDispatchIntelligence(currentBusinessId).then(items => {
      if (!cancelled) {
        setDispatchItems(items)
        setDispatchLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setDispatchItems([])
        setDispatchLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [activeTab, currentBusinessId])

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

    if (initialParams.role) {
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
    setActiveTab(null)
    // Reset filters when switching tabs to avoid confusion
    setOrderFilters(EMPTY_FILTERS)
    setFilterPanelOpen(false)
  }

  // Long-press handlers
  const handlePressStart = (role: RoleFilter) => {
    pressTimerRef.current = setTimeout(() => {
      setPopoverTab(role)
    }, 500)
  }

  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  const handleSetDefault = (role: RoleFilter) => {
    const tab = role as OrdersDefaultTab
    setPinnedTab(tab)
    setOrdersDefaultTabLocal(tab)
    saveOrdersDefaultTabToSupabase(tab)
    setPopoverTab(null)
    // Dismiss hint if visible
    if (showPinHint) {
      setShowPinHint(false)
      markPinHintShown()
    }
  }

  const handleRemoveDefault = () => {
    setPinnedTab('all')
    clearOrdersDefaultTabLocal()
    saveOrdersDefaultTabToSupabase(null)
    setPopoverTab(null)
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
      if (roleFilter === 'all') return !o.declinedAt
      const matchesRole = roleFilter === 'buying' ? o.isBuyer : !o.isBuyer
      return matchesRole && !o.declinedAt
    }).length
  , [orders, roleFilter])

  const activeStatusFilters = useMemo(() => [...orderFilters.activeChips], [orderFilters.activeChips])

  const hasActiveFilters = orderFilters.activeChips.size > 0

  const visibleChips = CHIPS_BY_ROLE[roleFilter]

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

          {/* Compact pill toggle — All | Buying | Selling with long-press to pin */}
          <div style={{
            display: 'flex',
            borderRadius: 999,
            border: '0.5px solid var(--border-light)',
            overflow: 'visible',
            position: 'relative',
          }}>
            {showDispatchTab && (
              <button
                onClick={() => { setActiveTab('dispatch'); setOrderFilters(EMPTY_FILTERS); setFilterPanelOpen(false) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '5px 14px',
                  fontSize: 12,
                  fontWeight: activeTab === 'dispatch' ? 600 : 400,
                  border: 'none',
                  cursor: 'pointer',
                  background: activeTab === 'dispatch'
                    ? 'var(--text-primary)'
                    : 'transparent',
                  color: activeTab === 'dispatch'
                    ? 'var(--bg-card)'
                    : 'var(--text-secondary)',
                  transition: 'all 150ms',
                  borderRadius: '999px 0 0 999px',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Dispatch
              </button>
            )}
            {(['all', 'buying', 'selling'] as const).map(role => {
              const isPinned = pinnedTab === role
              const isActive = activeTab === null && roleFilter === role
              return (
                <div
                  key={role}
                  style={{ position: 'relative' }}
                >
                  <button
                    onClick={() => handleRoleChange(role)}
                    onMouseDown={() => handlePressStart(role)}
                    onMouseUp={handlePressEnd}
                    onMouseLeave={handlePressEnd}
                    onTouchStart={() => handlePressStart(role)}
                    onTouchEnd={handlePressEnd}
                    onContextMenu={(e) => { e.preventDefault(); setPopoverTab(role) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '5px 14px',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive
                        ? 'var(--text-primary)'
                        : 'transparent',
                      color: isActive
                        ? 'var(--bg-card)'
                        : 'var(--text-secondary)',
                      transition: 'all 150ms',
                      borderRadius: role === 'all' && !showDispatchTab ? '999px 0 0 999px' : role === 'selling' ? '0 999px 999px 0' : '0',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                  >
                    {isPinned && (
                      <PinIcon color={isActive ? 'var(--bg-card)' : 'var(--text-secondary)'} />
                    )}
                    {role === 'all' ? 'All' : role === 'buying' ? 'Buying' : 'Selling'}
                  </button>

                  {/* Popover for this tab */}
                  {popoverTab === role && (
                    <div
                      ref={popoverRef}
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        right: role === 'selling' ? 0 : undefined,
                        left: role === 'all' ? 0 : undefined,
                        transform: role === 'buying' ? 'translateX(-25%)' : undefined,
                        zIndex: 100,
                        background: 'var(--bg-card)',
                        borderRadius: 10,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                        border: '0.5px solid var(--border-light)',
                        padding: '0',
                        minWidth: 160,
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        onClick={() => isPinned ? handleRemoveDefault() : handleSetDefault(role)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '12px 16px',
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isPinned ? 'Remove as default' : 'Set as default'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* First-time pin hint */}
        {showPinHint && (
          <div style={{
            margin: '0 16px 8px',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(74, 108, 247, 0.06)',
            border: '0.5px solid rgba(74, 108, 247, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Tip: Long-press a tab to set it as your default view
            </p>
            <button
              onClick={() => { setShowPinHint(false); markPinHintShown() }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--text-secondary)',
                padding: '0 4px',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}

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

          {/* Filter button — toggles inline panel */}
          <button
            onClick={() => setFilterPanelOpen(prev => !prev)}
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
              position: 'relative',
            }}
          >
            <Faders size={16} />
            Filter
            {hasActiveFilters && !filterPanelOpen && (
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

        {/* Inline Filter Panel — expands below search bar */}
        <div style={{
          maxHeight: filterPanelOpen ? '200px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 200ms ease',
        }}>
          <div style={{
            padding: '8px 16px 12px',
            background: 'var(--bg-card)',
            borderBottom: '0.5px solid var(--border-light)',
          }}>
            {/* Header row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}>
              <p style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                margin: 0,
              }}>
                Status
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  style={{
                    fontSize: '13px',
                    color: 'var(--brand-primary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 500,
                    padding: 0,
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
            {/* Status chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {visibleChips.map(chip => {
                const isChipActive = orderFilters.activeChips.has(chip)
                return (
                  <button
                    key={chip}
                    onClick={() => toggleStatusFilter(chip)}
                    style={{
                      fontSize: '13px',
                      padding: '6px 14px',
                      borderRadius: 999,
                      border: isChipActive ? 'none' : '0.5px solid var(--border-light)',
                      background: isChipActive ? getStatusChipBackground(chip) : 'transparent',
                      color: isChipActive ? getStatusChipColor(chip) : 'var(--text-secondary)',
                      fontWeight: isChipActive ? 500 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {CHIP_LABELS[chip]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Row 3 — Active Filter Chips (conditional) */}
        {hasActiveFilters && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px 10px',
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
        {activeTab === 'dispatch' ? (
          <DispatchQueueView
            items={dispatchItems}
            loading={dispatchLoading}
            onSelectOrder={onSelectOrder}
          />
        ) : <>
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
                : roleFilter === 'all' && !hasActiveFilters && !orderFilters.searchText.trim()
                ? 'No orders yet.'
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
                isBuyer={order.isBuyer}
onClick={() => onSelectOrder(order.id, order.connectionId)}
              />
            ))}
          </div>
        )}
        </>}
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
