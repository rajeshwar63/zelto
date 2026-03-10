import { useEffect, useState } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { useDataListener } from '@/lib/data-events'
import { attentionEngine } from '@/lib/attention-engine'
import type { Connection } from '@/lib/types'
import { isToday } from 'date-fns'

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
  ordersTodayValue: number
  dispatchPending: number
  deliveryPending: number
}

interface AttentionCounts {
  overdue: number
  dueToday: number
  approvalNeeded: number
  delivered: number
  paymentPending: number
  disputes: number
}

export function DashboardScreen({ currentBusinessId, onNavigateToOrders, onNavigateToAttention }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [attentionCounts, setAttentionCounts] = useState<AttentionCounts>({
    overdue: 0,
    dueToday: 0,
    approvalNeeded: 0,
    delivered: 0,
    paymentPending: 0,
    disputes: 0,
  })

  const loadData = async () => {
    const [orders, connections] = await Promise.all([
      dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId),
      dataStore.getConnectionsByBusinessId(currentBusinessId),
    ])

    const connMap = new Map<string, Connection>(connections.map(conn => [conn.id, conn]))

    let toPay = 0
    let toReceive = 0
    let ordersToday = 0
    let ordersTodayValue = 0
    let dispatchPending = 0
    let deliveryPending = 0

    for (const order of orders) {
      if (order.declinedAt) continue

      if (isToday(order.createdAt)) {
        ordersToday += 1
        ordersTodayValue += order.orderValue
      }

      if (!order.dispatchedAt && !order.deliveredAt) {
        dispatchPending += 1
      } else if (order.dispatchedAt && !order.deliveredAt) {
        deliveryPending += 1
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

    setData({
      toPay,
      toReceive,
      ordersToday,
      ordersTodayValue,
      dispatchPending,
      deliveryPending,
    })
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

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
        <div>
          <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
            Business Pulse
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-border rounded-xl px-4 py-4">
              <p className="text-[12px] text-muted-foreground">Orders Today</p>
              <p className="text-[24px] font-semibold text-foreground leading-tight mt-1">
                {data.ordersToday}
              </p>
              {data.ordersTodayValue > 0 && (
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  ₹{data.ordersTodayValue.toLocaleString('en-IN')}
                </p>
              )}
            </div>

            <div className="bg-white border border-border rounded-xl px-4 py-4">
              <p className="text-[12px] text-muted-foreground">Dispatch Pending</p>
              <p className="text-[24px] font-semibold leading-tight mt-1" style={{ color: data.dispatchPending > 0 ? '#E8A020' : undefined }}>
                {data.dispatchPending}
              </p>
            </div>

            <div className="bg-white border border-border rounded-xl px-4 py-4">
              <p className="text-[12px] text-muted-foreground">Delivery Pending</p>
              <p className="text-[24px] font-semibold leading-tight mt-1" style={{ color: data.deliveryPending > 0 ? '#E8A020' : undefined }}>
                {data.deliveryPending}
              </p>
            </div>

            {data.toReceive > 0 && (
              <div className="bg-white border border-border rounded-xl px-4 py-4">
                <p className="text-[12px] text-muted-foreground">To Receive</p>
                <p className="text-[20px] font-semibold text-foreground leading-tight mt-1">
                  ₹{data.toReceive.toLocaleString('en-IN')}
                </p>
              </div>
            )}

            {data.toPay > 0 && (
              <div className="bg-white border border-border rounded-xl px-4 py-4">
                <p className="text-[12px] text-muted-foreground">To Pay</p>
                <p className="text-[20px] font-semibold text-foreground leading-tight mt-1">
                  ₹{data.toPay.toLocaleString('en-IN')}
                </p>
              </div>
            )}
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
      </div>
    </div>
  )
}
