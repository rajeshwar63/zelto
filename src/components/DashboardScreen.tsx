import { useEffect, useState } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { useDataListener } from '@/lib/data-events'
import { attentionEngine } from '@/lib/attention-engine'
import type { Connection, OrderWithPaymentState } from '@/lib/types'
import { isToday } from 'date-fns'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'

interface Props {
  currentBusinessId: string
  onNavigateToOrders: (filter?: string) => void
  onNavigateToConnection: (connectionId: string, orderId?: string) => void
  onNavigateToProfile: () => void
  onNavigateToAttention: (filter?: string) => void
}

interface DashboardData {
  toPay: number
  toReceive: number
  ordersToday: number
  overdue: number
}

interface RecentOrder extends OrderWithPaymentState {
  connectionName: string
  lifecycleState: string
  latestActivity: number
}

interface AttentionCounts {
  overdue: number
  dueToday: number
  approvalNeeded: number
  delivered: number
  paymentPending: number
  disputes: number
}

export function DashboardScreen({ currentBusinessId, onNavigateToOrders, onNavigateToConnection, onNavigateToAttention }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [attentionCounts, setAttentionCounts] = useState<AttentionCounts>({
    overdue: 0,
    dueToday: 0,
    approvalNeeded: 0,
    delivered: 0,
    paymentPending: 0,
    disputes: 0,
  })

  const loadData = async () => {
    const [orders, connections, entities] = await Promise.all([
      dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId),
      dataStore.getConnectionsByBusinessId(currentBusinessId),
      dataStore.getAllBusinessEntities(),
    ])

    const connMap = new Map<string, Connection>(connections.map(conn => [conn.id, conn]))
    const entityMap = new Map(entities.map(entity => [entity.id, entity]))

    let toPay = 0
    let toReceive = 0
    let ordersToday = 0
    let overdue = 0

    for (const order of orders) {
      if (order.declinedAt) continue

      if (isToday(order.createdAt)) {
        ordersToday += 1
      }

      if (
        order.calculatedDueDate != null &&
        order.calculatedDueDate < Date.now() &&
        order.pendingAmount > 0 &&
        order.settlementState !== 'Paid'
      ) {
        overdue += order.pendingAmount
      }

      const connection = connMap.get(order.connectionId)
      const isSupplier = connection?.supplierBusinessId === currentBusinessId
      if (order.pendingAmount > 0) {
        if (isSupplier) toReceive += order.pendingAmount
        else toPay += order.pendingAmount
      }
    }

    let deliveredCount = 0
    let paymentPendingCount = 0

    for (const order of orders) {
      if (order.declinedAt) continue
      if (order.deliveredAt && order.settlementState !== 'Paid') {
        deliveredCount++
      }
      if (order.deliveredAt && order.pendingAmount > 0 && order.settlementState !== 'Paid') {
        paymentPendingCount++
      }
    }

    const attentionItems = await attentionEngine.getAttentionItems(currentBusinessId)
    const overdueCount = attentionItems.filter(i => i.category === 'Overdue').length
    const dueTodayCount = attentionItems.filter(i => i.category === 'Due Today').length
    const approvalNeededCount = attentionItems.filter(i => i.category === 'Approval Needed').length
    const disputeCount = attentionItems.filter(i => i.category === 'Disputes').length

    setAttentionCounts({
      overdue: overdueCount,
      dueToday: dueTodayCount,
      approvalNeeded: approvalNeededCount,
      delivered: deliveredCount,
      paymentPending: paymentPendingCount,
      disputes: disputeCount,
    })

    const getLifecycleState = (order: OrderWithPaymentState): string => {
      if (order.declinedAt) return 'Declined'
      if (order.deliveredAt) return 'Delivered'
      if (order.dispatchedAt) return 'Dispatched'
      if (order.acceptedAt) return 'Accepted'
      return 'Placed'
    }

    const getLatestActivity = (order: OrderWithPaymentState): number => (
      Math.max(order.deliveredAt || 0, order.dispatchedAt || 0, order.acceptedAt || 0, order.createdAt || 0)
    )

    const enrichedOrders: RecentOrder[] = orders
      .filter(order => !order.declinedAt)
      .map(order => {
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
      .sort((a, b) => b.latestActivity - a.latestActivity)
      .slice(0, 6)

    setRecentOrders(enrichedOrders)

    setData({ toPay, toReceive, ordersToday, overdue })
  }

  useEffect(() => {
    loadData()
  }, [currentBusinessId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'connections:changed', 'issues:changed'],
    () => {
      loadData()
    }
  )

  if (!data) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Home</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6 pb-24" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div>
          <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
            Business Pulse
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border rounded-xl px-4 py-4" style={{ borderColor: '#F0F4FF' }}>
              <p className="text-[12px] text-muted-foreground">Orders Today</p>
              <p className="text-[20px] font-extrabold leading-tight mt-1" style={{ color: '#4A6CF7' }}>
                {data.ordersToday}
              </p>
            </div>

            <div className="bg-white border rounded-xl px-4 py-4" style={{ borderColor: '#FFF0F0' }}>
              <p className="text-[12px] text-muted-foreground">Over Due</p>
              <p className="text-[20px] font-extrabold leading-tight mt-1" style={{ color: '#FF6B6B' }}>
                ₹{data.overdue.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="bg-white border rounded-xl px-4 py-4" style={{ borderColor: '#FFF0F0' }}>
              <p className="text-[12px] text-muted-foreground">To Pay</p>
              <p className="text-[20px] font-extrabold leading-tight mt-1" style={{ color: '#FF6B6B' }}>
                ₹{data.toPay.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="bg-white border rounded-xl px-4 py-4" style={{ borderColor: '#F0FFF6' }}>
              <p className="text-[12px] text-muted-foreground">To Recieve</p>
              <p className="text-[20px] font-extrabold leading-tight mt-1" style={{ color: '#22B573' }}>
                ₹{data.toReceive.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
            Needs Attention
          </h2>
          <div className="space-y-2">
            {attentionCounts.overdue > 0 && (
              <button
                onClick={() => onNavigateToOrders('overdue')}
                className="w-full flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D64545' }} />
                  <p className="text-[14px] text-foreground">Overdue</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold" style={{ color: '#D64545' }}>{attentionCounts.overdue}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.dueToday > 0 && (
              <button
                onClick={() => onNavigateToOrders('due_today')}
                className="w-full flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E8A020' }} />
                  <p className="text-[14px] text-foreground">Due Today</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold" style={{ color: '#E8A020' }}>{attentionCounts.dueToday}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.approvalNeeded > 0 && (
              <button
                onClick={() => onNavigateToOrders('placed')}
                className="w-full flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E8A020' }} />
                  <p className="text-[14px] text-foreground">Approval Needed</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold" style={{ color: '#E8A020' }}>{attentionCounts.approvalNeeded}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.delivered > 0 && (
              <button
                onClick={() => onNavigateToOrders('delivered')}
                className="w-full flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#4CAF50' }} />
                  <p className="text-[14px] text-foreground">Delivered</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-foreground">{attentionCounts.delivered}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.paymentPending > 0 && (
              <button
                onClick={() => onNavigateToOrders('payment_pending')}
                className="w-full flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E8A020' }} />
                  <p className="text-[14px] text-foreground">Payment Pending</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold" style={{ color: '#E8A020' }}>{attentionCounts.paymentPending}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.disputes > 0 && (
              <button
                onClick={() => onNavigateToAttention('disputes')}
                className="w-full flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D64545' }} />
                  <p className="text-[14px] text-foreground">Issues / Disputes</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold" style={{ color: '#D64545' }}>{attentionCounts.disputes}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.overdue === 0 &&
              attentionCounts.dueToday === 0 &&
              attentionCounts.approvalNeeded === 0 &&
              attentionCounts.delivered === 0 &&
              attentionCounts.paymentPending === 0 &&
              attentionCounts.disputes === 0 && (
                <div className="bg-white border border-border rounded-xl px-4 py-6 text-center">
                  <p className="text-[13px] text-muted-foreground">All caught up — nothing needs attention right now.</p>
                </div>
              )}
          </div>
        </div>

        {recentOrders.length > 0 && (
          <div>
            <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">Recent Activity</h2>
            <div className="space-y-2">
              {recentOrders.map(order => {
                const statusColor = getLifecycleStatusColor(order.lifecycleState)

                return (
                  <button
                    key={order.id}
                    onClick={() => onNavigateToConnection(order.connectionId, order.id)}
                    className="w-full text-left bg-white border border-border rounded-xl px-4 py-3"
                    style={{ borderLeft: `3px solid ${statusColor}` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[15px] font-semibold text-foreground truncate">{order.connectionName}</p>
                      <p className="text-[15px] font-semibold text-foreground">₹{order.orderValue.toLocaleString('en-IN')}</p>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-1">{order.lifecycleState} · {order.itemSummary}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
