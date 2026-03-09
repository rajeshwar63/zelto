import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { useDataListener } from '@/lib/data-events'
import type { OrderWithPaymentState } from '@/lib/types'
import { isToday } from 'date-fns'
import { CaretRight } from '@phosphor-icons/react'

interface Props {
  currentBusinessId: string
  onNavigateToOrders: (filter?: string) => void
  onNavigateToAttention: (filter?: string) => void
}

interface DashboardData {
  ordersToday: number
  ordersTodayValue: number
  dispatchPending: number
  paymentsExpected: number
  overdueAmount: number
  overdueConnections: number
}

export function DashboardScreen({ currentBusinessId, onNavigateToOrders, onNavigateToAttention }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    const [orders, connections, entities] = await Promise.all([
      dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId),
      dataStore.getConnectionsByBusinessId(currentBusinessId),
      dataStore.getAllBusinessEntities(),
    ])

    const biz = entities.find(e => e.id === currentBusinessId)
    if (biz) setBusinessName(biz.businessName)

    let ordersToday = 0
    let ordersTodayValue = 0
    let dispatchPending = 0
    let paymentsExpected = 0
    let overdueAmount = 0
    const overdueConnectionIds = new Set<string>()

    const now = Date.now()

    for (const order of orders) {
      if (order.declinedAt) continue

      // Orders today
      if (isToday(order.createdAt)) {
        ordersToday++
        ordersTodayValue += order.orderValue
      }

      // Dispatch pending (placed but not dispatched)
      if (!order.dispatchedAt && !order.declinedAt) {
        dispatchPending++
      }

      // Payment expected (delivered, not fully paid)
      if (order.deliveredAt && order.settlementState !== 'Paid') {
        paymentsExpected += order.pendingAmount

        // Overdue (has due date and past it)
        if (order.calculatedDueDate && now > order.calculatedDueDate) {
          overdueAmount += order.pendingAmount
          overdueConnectionIds.add(order.connectionId)
        }
      }
    }

    setData({
      ordersToday,
      ordersTodayValue,
      dispatchPending,
      paymentsExpected,
      overdueAmount,
      overdueConnections: overdueConnectionIds.size,
    })
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [currentBusinessId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'connections:changed'],
    () => { loadData() }
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Dashboard</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Orders Today */}
        <button
          onClick={() => onNavigateToOrders('today')}
          className="w-full bg-white border border-border rounded-xl px-4 py-4 text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">Orders Today</p>
            <CaretRight size={16} className="text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <p className="text-[28px] font-semibold text-foreground leading-tight">
              {data.ordersToday}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Order{data.ordersToday !== 1 ? 's' : ''}
            </p>
          </div>
          {data.ordersTodayValue > 0 && (
            <p className="text-[15px] font-medium text-foreground mt-0.5">
              ₹{data.ordersTodayValue.toLocaleString('en-IN')} total value
            </p>
          )}
        </button>

        {/* Dispatch Pending */}
        <button
          onClick={() => onNavigateToOrders('awaiting_dispatch')}
          className="w-full bg-white border border-border rounded-xl px-4 py-4 text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">Dispatch Pending</p>
            <CaretRight size={16} className="text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <p className="text-[28px] font-semibold leading-tight" style={{ color: data.dispatchPending > 0 ? '#E8A020' : undefined }}>
              {data.dispatchPending}
            </p>
            <p className="text-[13px] text-muted-foreground">
              order{data.dispatchPending !== 1 ? 's' : ''}
            </p>
          </div>
        </button>

        {/* Payments Expected */}
        <button
          onClick={() => onNavigateToOrders('payment_pending')}
          className="w-full bg-white border border-border rounded-xl px-4 py-4 text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">Payments Expected</p>
            <CaretRight size={16} className="text-muted-foreground" />
          </div>
          <p className="text-[28px] font-semibold text-foreground leading-tight mt-1.5">
            ₹{data.paymentsExpected.toLocaleString('en-IN')}
          </p>
        </button>

        {/* Overdue Payments */}
        {data.overdueAmount > 0 && (
          <button
            onClick={() => onNavigateToAttention('overdue')}
            className="w-full bg-white border rounded-xl px-4 py-4 text-left"
            style={{ borderColor: '#D64545' }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px]" style={{ color: '#D64545' }}>Overdue</p>
              <CaretRight size={16} style={{ color: '#D64545' }} />
            </div>
            <p className="text-[28px] font-semibold leading-tight mt-1.5" style={{ color: '#D64545' }}>
              ₹{data.overdueAmount.toLocaleString('en-IN')}
            </p>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {data.overdueConnections} connection{data.overdueConnections !== 1 ? 's' : ''}
            </p>
          </button>
        )}
      </div>
    </div>
  )
}
