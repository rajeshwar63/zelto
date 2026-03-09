import { useEffect, useState, useCallback, useRef } from 'react'
import { dataStore } from '@/lib/data-store'
import { useDataListener } from '@/lib/data-events'
import type { Connection, OrderWithPaymentState, BusinessEntity } from '@/lib/types'
import { isToday, formatDistanceToNow } from 'date-fns'
import {
  CaretRight,
  Package,
  Warning,
  ArrowDown,
  ArrowUp,
  CalendarBlank,
  Truck,
  CheckCircle,
  Lightning,
  Scales,
  CreditCard,
} from '@phosphor-icons/react'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'
import { markOrderSeen, getUnreadState } from '@/lib/unread-tracker'

interface Props {
  currentBusinessId: string
  onNavigateToOrders: (filter?: string) => void
  onNavigateToConnection: (connectionId: string, orderId?: string) => void
  onNavigateToProfile: () => void
}

// --- Business Pulse ---
interface PulseData {
  toPay: number
  toReceive: number
  ordersToday: number
  overdue: number
}

// --- Needs Attention ---
interface AttentionCounts {
  newOrders: number
  dispatched: number
  delivered: number
  issues: number
  disputes: number
  paymentVerification: number
}

// --- Recent Activity ---
interface EnrichedOrder extends OrderWithPaymentState {
  connectionName: string
  lifecycleState: string
  latestActivity: number
  isBuyer: boolean
}

// Color constants per spec
const COLORS = {
  toPay: '#FF6B6B',
  toReceive: '#22B573',
  ordersToday: '#4A6CF7',
  overdue: '#FF8C42',
  dispatched: '#FF8C42',
  delivered: '#22B573',
  issues: '#FFB020',
  disputes: '#8B5CF6',
  paymentVerification: '#EC4899',
  newOrders: '#4A6CF7',
}

function formatIndianCurrency(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN')
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

export function DashboardScreen({ currentBusinessId, onNavigateToOrders, onNavigateToConnection, onNavigateToProfile }: Props) {
  const [businessName, setBusinessName] = useState('')
  const [pulse, setPulse] = useState<PulseData | null>(null)
  const [attention, setAttention] = useState<AttentionCounts | null>(null)
  const [recentOrders, setRecentOrders] = useState<EnrichedOrder[]>([])
  const [loadingPulse, setLoadingPulse] = useState(true)
  const [loadingAttention, setLoadingAttention] = useState(true)
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [errorPulse, setErrorPulse] = useState(false)
  const [errorAttention, setErrorAttention] = useState(false)
  const [errorRecent, setErrorRecent] = useState(false)
  const [recentPage, setRecentPage] = useState(0)
  const [hasMoreRecent, setHasMoreRecent] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const lastFetchRef = useRef(0)

  const PAGE_SIZE = 10

  // Cache connections/entities for reuse across sections
  const cacheRef = useRef<{
    connections: Connection[]
    connMap: Map<string, Connection>
    entityMap: Map<string, BusinessEntity>
  } | null>(null)

  const loadCache = async () => {
    const [connections, entities] = await Promise.all([
      dataStore.getConnectionsByBusinessId(currentBusinessId),
      dataStore.getAllBusinessEntities(),
    ])
    const connMap = new Map(connections.map(c => [c.id, c]))
    const entityMap = new Map(entities.map(e => [e.id, e]))
    const biz = entityMap.get(currentBusinessId)
    if (biz) setBusinessName(biz.businessName)
    cacheRef.current = { connections, connMap, entityMap }
    return { connections, connMap, entityMap }
  }

  const fetchBusinessPulse = async () => {
    setLoadingPulse(true)
    setErrorPulse(false)
    try {
      const { connMap } = cacheRef.current || await loadCache()
      const orders = await dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId)

      let toPay = 0
      let toReceive = 0
      let ordersToday = 0
      let overdue = 0
      const now = Date.now()

      for (const order of orders) {
        if (order.declinedAt) continue
        const conn = connMap.get(order.connectionId)
        const isSupplier = conn?.supplierBusinessId === currentBusinessId

        // To Pay / To Receive (pending or partial payment)
        if (order.pendingAmount > 0) {
          if (isSupplier) {
            toReceive += order.pendingAmount
          } else {
            toPay += order.pendingAmount
          }
        }

        // Orders Today
        if (isToday(order.createdAt)) {
          ordersToday++
        }

        // Overdue
        if (
          order.pendingAmount > 0 &&
          order.calculatedDueDate !== null &&
          order.calculatedDueDate < now &&
          order.settlementState !== 'Paid'
        ) {
          overdue += order.pendingAmount
        }
      }

      setPulse({ toPay, toReceive, ordersToday, overdue })
    } catch {
      setErrorPulse(true)
    } finally {
      setLoadingPulse(false)
    }
  }

  const fetchNeedsAttention = async () => {
    setLoadingAttention(true)
    setErrorAttention(false)
    try {
      const { connMap } = cacheRef.current || await loadCache()
      const orders = await dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId)
      const orderIds = orders.map(o => o.id)
      const issues = orderIds.length > 0 ? await dataStore.getIssueReportsByOrderIds(orderIds) : []

      let newOrders = 0
      let dispatched = 0
      let delivered = 0
      let issuesCount = 0
      let disputes = 0
      let paymentVerification = 0

      // Count open issues and disputes
      const openIssues = issues.filter(i => i.status === 'Open')
      const orderMap = new Map(orders.map(o => [o.id, o]))

      for (const issue of openIssues) {
        const order = orderMap.get(issue.orderId)
        if (!order) continue
        const conn = connMap.get(order.connectionId)
        if (!conn) continue
        // Disputes = payment events that are disputed
        // Issues = issue reports
        issuesCount++
      }

      // Count disputed payments
      if (orderIds.length > 0) {
        const payments = await dataStore.getPaymentEventsByOrderIds(orderIds)
        for (const payment of payments) {
          if (payment.disputed && !payment.acceptedAt) {
            disputes++
          }
        }
      }

      for (const order of orders) {
        if (order.declinedAt) continue
        const conn = connMap.get(order.connectionId)
        if (!conn) continue
        const isSupplier = conn.supplierBusinessId === currentBusinessId

        // New Orders: user is seller, order is placed (not yet accepted)
        if (isSupplier && !order.acceptedAt && !order.declinedAt) {
          newOrders++
        }

        // Dispatched: user is buyer, order dispatched but not delivered
        if (!isSupplier && order.dispatchedAt && !order.deliveredAt) {
          dispatched++
        }

        // Delivered: order delivered but not fully paid
        if (order.deliveredAt && order.settlementState !== 'Paid') {
          delivered++
        }

        // Payment verification: other party marked as paid, user hasn't confirmed
        // Using disputed payments where user is the counterparty
      }

      setAttention({ newOrders, dispatched, delivered, issues: issuesCount, disputes, paymentVerification })
    } catch {
      setErrorAttention(true)
    } finally {
      setLoadingAttention(false)
    }
  }

  const fetchRecentActivity = async (page: number, append: boolean = false) => {
    if (!append) {
      setLoadingRecent(true)
      setErrorRecent(false)
    }
    try {
      const { connMap, entityMap } = cacheRef.current || await loadCache()
      const allOrders = await dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId)

      const enriched: EnrichedOrder[] = allOrders.map(order => {
        const conn = connMap.get(order.connectionId)
        let connectionName = 'Unknown'
        let isBuyer = true
        if (conn) {
          const isSupplier = conn.supplierBusinessId === currentBusinessId
          isBuyer = !isSupplier
          const otherId = isSupplier ? conn.buyerBusinessId : conn.supplierBusinessId
          connectionName = entityMap.get(otherId)?.businessName || 'Unknown'
        }
        return {
          ...order,
          connectionName,
          lifecycleState: getLifecycleState(order),
          latestActivity: getLatestActivity(order),
          isBuyer,
        }
      })

      enriched.sort((a, b) => b.latestActivity - a.latestActivity)

      const start = page * PAGE_SIZE
      const pageItems = enriched.slice(0, start + PAGE_SIZE)

      setRecentOrders(pageItems)
      setHasMoreRecent(enriched.length > start + PAGE_SIZE)
    } catch {
      if (!append) setErrorRecent(true)
    } finally {
      setLoadingRecent(false)
    }
  }

  const loadAll = useCallback(async () => {
    lastFetchRef.current = Date.now()
    await loadCache()
    await Promise.all([
      fetchBusinessPulse(),
      fetchNeedsAttention(),
      fetchRecentActivity(0),
    ])
    setRecentPage(0)
  }, [currentBusinessId])

  useEffect(() => {
    loadAll()
  }, [currentBusinessId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'connections:changed', 'issues:changed'],
    () => {
      // Refetch attention counts on any data change
      cacheRef.current = null
      loadAll()
    }
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    cacheRef.current = null
    await loadAll()
    setRefreshing(false)
  }

  const handleLoadMore = () => {
    const nextPage = recentPage + 1
    setRecentPage(nextPage)
    fetchRecentActivity(nextPage, true)
  }

  // Check if order is "new/unread" for visual indicator
  const unreadState = getUnreadState(currentBusinessId)
  const isOrderUnread = (orderId: string, createdAt: number): boolean => {
    if (unreadState.orderSeen[orderId]) return false
    return createdAt > (unreadState.attentionLastSeen || 0)
  }

  const totalAttentionCount = attention
    ? attention.newOrders + attention.dispatched + attention.delivered + attention.issues + attention.disputes + attention.paymentVerification
    : 0

  return (
    <div className="flex flex-col h-full bg-[#F2F4F8]">
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[13px] text-muted-foreground">Welcome back</p>
            <p className="text-[22px] font-bold text-foreground leading-tight">{businessName}</p>
          </div>
          <button
            onClick={onNavigateToProfile}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-semibold"
            style={{ backgroundColor: '#4A6CF7' }}
          >
            {getInitials(businessName)}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Pull to refresh indicator */}
        {refreshing && (
          <div className="flex justify-center py-3">
            <p className="text-xs text-muted-foreground">Refreshing...</p>
          </div>
        )}

        {/* Section 1: Business Pulse */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[13px] uppercase tracking-[0.08em] text-[#8492A6] mb-3 font-medium">
            Business Pulse
          </p>
          {loadingPulse ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-[14px] h-[90px] animate-pulse" />
              ))}
            </div>
          ) : errorPulse ? (
            <div className="bg-white rounded-[14px] p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">Failed to load</p>
              <button onClick={fetchBusinessPulse} className="text-sm font-medium" style={{ color: COLORS.ordersToday }}>
                Retry
              </button>
            </div>
          ) : pulse ? (
            <div className="grid grid-cols-2 gap-3">
              {/* To Pay */}
              <button
                onClick={() => onNavigateToOrders('payment_pending')}
                className="bg-white rounded-[14px] px-4 py-3 text-left relative overflow-hidden"
                style={{ borderLeft: `3px solid ${COLORS.toPay}` }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-[#8492A6] font-medium">To Pay</p>
                  <ArrowUp size={16} color={COLORS.toPay} weight="bold" />
                </div>
                <p className="text-[20px] font-bold text-foreground mt-1 leading-tight">
                  {formatIndianCurrency(pulse.toPay)}
                </p>
              </button>

              {/* To Receive */}
              <button
                onClick={() => onNavigateToOrders('payment_pending')}
                className="bg-white rounded-[14px] px-4 py-3 text-left relative overflow-hidden"
                style={{ borderLeft: `3px solid ${COLORS.toReceive}` }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-[#8492A6] font-medium">To Receive</p>
                  <ArrowDown size={16} color={COLORS.toReceive} weight="bold" />
                </div>
                <p className="text-[20px] font-bold text-foreground mt-1 leading-tight">
                  {formatIndianCurrency(pulse.toReceive)}
                </p>
              </button>

              {/* Orders Today */}
              <button
                onClick={() => onNavigateToOrders('today')}
                className="bg-white rounded-[14px] px-4 py-3 text-left relative overflow-hidden"
                style={{ borderLeft: `3px solid ${COLORS.ordersToday}` }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-[#8492A6] font-medium">Orders Today</p>
                  <CalendarBlank size={16} color={COLORS.ordersToday} weight="bold" />
                </div>
                <p className="text-[20px] font-bold text-foreground mt-1 leading-tight">
                  {pulse.ordersToday}
                </p>
              </button>

              {/* Overdue */}
              <button
                onClick={() => onNavigateToOrders('payment_pending')}
                className="bg-white rounded-[14px] px-4 py-3 text-left relative overflow-hidden"
                style={{ borderLeft: `3px solid ${COLORS.overdue}` }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-[#8492A6] font-medium">Overdue</p>
                  <Warning size={16} color={COLORS.overdue} weight="bold" />
                </div>
                <p className="text-[20px] font-bold text-foreground mt-1 leading-tight">
                  {formatIndianCurrency(pulse.overdue)}
                </p>
              </button>
            </div>
          ) : null}
        </div>

        {/* Section 2: Needs Attention */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] uppercase tracking-[0.08em] text-[#8492A6] font-medium">
              Needs Attention
            </p>
            {totalAttentionCount > 0 && (
              <span
                className="text-[12px] font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: COLORS.toPay }}
              >
                {totalAttentionCount} item{totalAttentionCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {loadingAttention ? (
            <div className="bg-white rounded-[14px] animate-pulse h-[280px]" />
          ) : errorAttention ? (
            <div className="bg-white rounded-[14px] p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">Failed to load</p>
              <button onClick={fetchNeedsAttention} className="text-sm font-medium" style={{ color: COLORS.ordersToday }}>
                Retry
              </button>
            </div>
          ) : attention ? (
            <div className="bg-white rounded-[14px] overflow-hidden">
              <AttentionRow
                icon={<Package size={18} weight="fill" />}
                label="New Orders / Approval"
                count={attention.newOrders}
                color={COLORS.newOrders}
                onTap={() => onNavigateToOrders('placed')}
              />
              <AttentionRow
                icon={<Truck size={18} weight="fill" />}
                label="Dispatched"
                count={attention.dispatched}
                color={COLORS.dispatched}
                onTap={() => onNavigateToOrders('dispatched')}
              />
              <AttentionRow
                icon={<CheckCircle size={18} weight="fill" />}
                label="Delivered"
                count={attention.delivered}
                color={COLORS.delivered}
                onTap={() => onNavigateToOrders('delivered')}
              />
              <AttentionRow
                icon={<Lightning size={18} weight="fill" />}
                label="Issues Raised"
                count={attention.issues}
                color={COLORS.issues}
                onTap={() => onNavigateToOrders('all')}
              />
              <AttentionRow
                icon={<Scales size={18} weight="fill" />}
                label="Disputes"
                count={attention.disputes}
                color={COLORS.disputes}
                onTap={() => onNavigateToOrders('all')}
              />
              <AttentionRow
                icon={<CreditCard size={18} weight="fill" />}
                label="Payment Verification"
                count={attention.paymentVerification}
                color={COLORS.paymentVerification}
                onTap={() => onNavigateToOrders('payment_pending')}
                isLast
              />
            </div>
          ) : null}
        </div>

        {/* Section 3: Recent Activity */}
        <div className="px-4 pt-4 pb-6">
          <p className="text-[13px] uppercase tracking-[0.08em] text-[#8492A6] mb-3 font-medium">
            Recent Activity
          </p>
          {loadingRecent ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-[14px] h-[80px] animate-pulse" />
              ))}
            </div>
          ) : errorRecent ? (
            <div className="bg-white rounded-[14px] p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">Failed to load</p>
              <button onClick={() => fetchRecentActivity(0)} className="text-sm font-medium" style={{ color: COLORS.ordersToday }}>
                Retry
              </button>
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="bg-white rounded-[14px] p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No orders yet. Create your first order to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map(order => {
                const statusColor = getLifecycleStatusColor(order.lifecycleState)
                const unread = isOrderUnread(order.id, order.createdAt)
                const borderColor = ({
                  'Placed': COLORS.ordersToday,
                  'Accepted': COLORS.ordersToday,
                  'Dispatched': COLORS.dispatched,
                  'Delivered': COLORS.delivered,
                  'Declined': '#999',
                } as Record<string, string>)[order.lifecycleState] || '#ddd'
                const isOverdue = order.deliveredAt && order.calculatedDueDate && Date.now() > order.calculatedDueDate && order.settlementState !== 'Paid'

                return (
                  <button
                    key={order.id}
                    onClick={() => {
                      markOrderSeen(currentBusinessId, order.id)
                      onNavigateToConnection(order.connectionId, order.id)
                    }}
                    className="w-full bg-white rounded-[14px] px-4 py-3 text-left"
                    style={{ borderLeft: `3px solid ${borderColor}` }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-1 mr-3">
                        {unread && (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.ordersToday }} />
                        )}
                        <p className="text-[14px] text-foreground font-medium leading-snug">
                          {order.connectionName}
                        </p>
                      </div>
                      {order.orderValue > 0 && (
                        <p className="text-[15px] font-semibold text-foreground flex-shrink-0">
                          {formatIndianCurrency(order.orderValue)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[12px]">
                      <span style={{ color: statusColor }}>{order.lifecycleState}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(order.latestActivity, { addSuffix: true })}
                      </span>
                      {isOverdue && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span style={{ color: COLORS.toPay, fontWeight: 500 }}>Overdue</span>
                        </>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground mt-0.5 truncate">
                      {order.itemSummary}
                    </p>
                  </button>
                )
              })}

              {hasMoreRecent && (
                <button
                  onClick={handleLoadMore}
                  className="w-full py-3 text-center text-[13px] font-medium"
                  style={{ color: COLORS.ordersToday }}
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Attention Row Sub-component ---
function AttentionRow({
  icon,
  label,
  count,
  color,
  onTap,
  isLast = false,
}: {
  icon: React.ReactNode
  label: string
  count: number
  color: string
  onTap: () => void
  isLast?: boolean
}) {
  const isZero = count === 0
  return (
    <button
      onClick={onTap}
      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
        !isLast ? 'border-b border-border/50' : ''
      }`}
      style={{ opacity: isZero ? 0.4 : 1 }}
    >
      <div className="flex items-center gap-3">
        <span style={{ color }}>{icon}</span>
        <p className="text-[14px] text-foreground">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        {count > 0 && (
          <span
            className="text-[12px] font-semibold px-2 py-0.5 rounded-full text-white min-w-[24px] text-center"
            style={{ backgroundColor: color }}
          >
            {count}
          </span>
        )}
        {count === 0 && (
          <span className="text-[12px] text-muted-foreground">(0)</span>
        )}
        <CaretRight size={14} className="text-muted-foreground" />
      </div>
    </button>
  )
}
