import { useEffect, useMemo, useRef, useState } from 'react'
import { useOrdersData } from '@/hooks/data/use-business-data'
import { PencilSimple, MagnifyingGlass, X, ClipboardText, Funnel } from '@phosphor-icons/react'
import { EmptyState } from '@/components/EmptyState'
import { AnimatedListItem } from '@/components/AnimatedListItem'
import { OrderCard } from '@/components/order/OrderCard'
import { OrdersIntelligenceTab } from './OrdersIntelligenceTab'
import { InlineRefreshSpinner, ScreenRefreshIndicator, useScreenLoadState } from '@/components/ScreenLoadState'
import {
  type OrderFilters,
  type StatusChip,
  type RoleFilter,
  CHIP_LABELS,
  CHIP_COLORS,
  CHIPS_BY_ROLE,
} from '@/components/order/OrderSearchPanel'
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
  order: { lifecycleState: string; settlementState: string; calculatedDueDate: number | null; hasOpenIssue?: boolean },
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
    case 'dispute':
      return order.hasOpenIssue === true
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
  const [popoverTab, setPopoverTab] = useState<RoleFilter | null>(null)
  const [showPinHint, setShowPinHint] = useState(false)
  const [activeTab, setActiveTab] = useState<'intelligence' | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [stripVisible, setStripVisible] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const scrollListRef = useRef<HTMLDivElement>(null)
  const lastScrollTop = useRef(0)

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
      setStripVisible(true)
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

    // Show strip when arriving via deep-link with pre-selected filters
    if (initialParams.chip || initialParams.dateToday) {
      setStripVisible(true)
    }
  }, [initialParams])

  // Auto-scroll strip to show pre-selected pill on deep link
  useEffect(() => {
    if (orderFilters.activeChips.size === 0 || !stripRef.current) return
    const chip = [...orderFilters.activeChips][0]
    const pillIndex = visibleChips.indexOf(chip)
    if (pillIndex < 0) return
    // +2 accounts for search element and "All" pill before status pills
    const children = stripRef.current.children
    const target = children[pillIndex + 2] as HTMLElement | undefined
    if (target) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }, 100)
    }
  }, [initialParams, initialFilter])

  // Show search + pills on scroll down, hide on scroll up
  const handleListScroll = () => {
    const el = scrollListRef.current
    if (!el) return
    const currentScrollTop = el.scrollTop
    if (currentScrollTop > lastScrollTop.current && currentScrollTop > 10) {
      setStripVisible(true)
    } else if (currentScrollTop < lastScrollTop.current) {
      setStripVisible(false)
    }
    lastScrollTop.current = currentScrollTop
  }

  const handleRoleChange = (newRole: RoleFilter) => {
    setRoleFilter(newRole)
    setActiveTab(null)
    // Reset filters when switching tabs to avoid confusion
    setOrderFilters(EMPTY_FILTERS)
    setSearchOpen(false)
    setStripVisible(false)
    lastScrollTop.current = 0
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

          {/* Compact pill toggle — All | Buying | Selling + Insights */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex',
              borderRadius: 999,
              border: '0.5px solid var(--border-light)',
              overflow: 'visible',
              position: 'relative',
              opacity: activeTab === 'intelligence' ? 0.4 : 1,
              transition: 'opacity 150ms',
            }}>
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
                        borderRadius: role === 'all' ? '999px 0 0 999px' : role === 'selling' ? '0 999px 999px 0' : '0',
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

            {/* Vertical divider */}
            <div style={{
              width: 1,
              height: 20,
              background: 'var(--color-border-tertiary)',
              flexShrink: 0,
            }} />

            {/* Insights pill */}
            <button
              onClick={() => { setActiveTab(activeTab === 'intelligence' ? null : 'intelligence'); setOrderFilters(EMPTY_FILTERS); setSearchOpen(false) }}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 18,
                border: activeTab === 'intelligence' ? 'none' : '0.5px solid #4A6CF7',
                background: activeTab === 'intelligence' ? '#4A6CF7' : 'transparent',
                color: activeTab === 'intelligence' ? '#FFFFFF' : '#4A6CF7',
                cursor: 'pointer',
                transition: 'all 150ms',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Insights
            </button>
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

        {/* Unified Search + Filter Strip (hidden on Intelligence tab, collapses on scroll down) */}
        {activeTab !== 'intelligence' && (
          <div style={{
            maxHeight: stripVisible ? 60 : 0,
            opacity: stripVisible ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-height 300ms ease, opacity 200ms ease',
          }}>
          <div
            ref={stripRef}
            className="orders-strip"
            style={{ padding: '0 16px' }}
          >
            {/* Search element — first item in strip */}
            <div
              style={{
                width: searchOpen ? 160 : 34,
                height: 34,
                borderRadius: 10,
                background: 'var(--bg-screen)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: searchOpen ? '0 8px 0 10px' : '0',
                justifyContent: searchOpen ? 'flex-start' : 'center',
                flexShrink: 0,
                transition: 'width 200ms ease-out',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
              onClick={() => {
                if (!searchOpen) {
                  setSearchOpen(true)
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }
              }}
            >
              <MagnifyingGlass size={16} weight="regular" color="var(--text-secondary)" style={{ flexShrink: 0 }} />
              {searchOpen && (
                <>
                  <input
                    ref={searchInputRef}
                    value={orderFilters.searchText}
                    onChange={e => setOrderFilters(prev => ({ ...prev, searchText: e.target.value }))}
                    placeholder="Search..."
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                      width: '100%',
                      minWidth: 0,
                    }}
                  />
                  <div
                    onClick={e => {
                      e.stopPropagation()
                      setOrderFilters(prev => ({ ...prev, searchText: '' }))
                      setSearchOpen(false)
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <X size={8} weight="bold" color="var(--text-secondary)" />
                  </div>
                </>
              )}
            </div>

            {/* "All" pill */}
            <button
              onClick={() => {
                setOrderFilters(prev => ({ ...prev, activeChips: new Set() }))
              }}
              style={{
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 20,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'background 150ms ease-out, color 150ms ease-out',
                border: 'none',
                background: !hasActiveFilters ? 'var(--brand-primary)' : 'var(--bg-screen)',
                color: !hasActiveFilters ? '#FFFFFF' : 'var(--text-secondary)',
                fontWeight: !hasActiveFilters ? 500 : 400,
              }}
            >
              All
            </button>

            {/* Status pills */}
            {visibleChips.map(chip => {
              const isChipActive = orderFilters.activeChips.has(chip)
              return (
                <button
                  key={chip}
                  onClick={() => toggleStatusFilter(chip)}
                  style={{
                    fontSize: 12,
                    padding: '6px 14px',
                    borderRadius: 20,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'background 150ms ease-out, color 150ms ease-out',
                    border: 'none',
                    background: isChipActive ? CHIP_COLORS[chip] : 'var(--bg-screen)',
                    color: isChipActive ? '#FFFFFF' : 'var(--text-secondary)',
                    fontWeight: isChipActive ? 500 : 400,
                  }}
                >
                  {CHIP_LABELS[chip]}
                </button>
              )
            })}
          </div>
          </div>
        )}

        {/* Divider */}
        <div style={{
          height: 0.5,
          background: 'var(--border-light)',
          margin: '0 16px',
        }} />

        {/* Count row */}
        {activeTab !== 'intelligence' && (
          <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--text-secondary)' }}>
            {(() => {
              const hasSearch = orderFilters.searchText.trim().length > 0
              const hasChips = hasActiveFilters
              if (!hasSearch && !hasChips) {
                return `${totalOrders} orders`
              }
              if (hasSearch && hasChips) {
                const chipLabels = activeStatusFilters.map(c => CHIP_LABELS[c]).join(' + ')
                return `${filteredOrders.length} match · ${chipLabels} + "${orderFilters.searchText.trim()}"`
              }
              if (hasSearch) {
                return `${filteredOrders.length} match "${orderFilters.searchText.trim()}"`
              }
              return `${totalOrders} orders · ${filteredOrders.length} match`
            })()}
          </div>
        )}
      </div>

      {/* Order List */}
      <div ref={scrollListRef} onScroll={handleListScroll} className={activeTab === 'intelligence' ? 'flex-1 overflow-y-auto pt-3 pb-24' : 'flex-1 overflow-y-auto px-4 pt-3 pb-24'}>
        {activeTab === 'intelligence' ? (
          <OrdersIntelligenceTab
            orders={orders}
            role={roleFilter === 'buying' ? 'buying' : 'selling'}
            onNavigateToTab={(chip) => {
              setActiveTab(null)
              setRoleFilter(roleFilter === 'buying' ? 'buying' : roleFilter === 'selling' ? 'selling' : 'all')
              setOrderFilters(prev => ({ ...prev, activeChips: new Set([chip]) }))
            }}
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
          hasActiveFilters || orderFilters.searchText.trim() ? (
            <EmptyState
              icon={Funnel}
              title="No orders match this filter"
              description="Try adjusting the filter or clearing it to see all orders."
              actionLabel="Clear filters"
              onAction={() => { setOrderFilters(EMPTY_FILTERS); setRoleFilter('all') }}
            />
          ) : (
            <EmptyState
              icon={ClipboardText}
              title={roleFilter === 'buying' ? 'No orders as buyer yet' : roleFilter === 'selling' ? 'No orders as supplier yet' : 'No orders to show'}
              description="Orders you create or receive from connections will appear here."
            />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {filteredOrders.map((order, index) => (
              <AnimatedListItem key={order.id} index={index}>
                <OrderCard
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
                  hasOpenDispute={order.hasOpenIssue}
                  disputeSummary={order.openIssueSummary}
                  onClick={() => onSelectOrder(order.id, order.connectionId)}
                />
              </AnimatedListItem>
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
