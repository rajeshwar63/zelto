import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { useDataListener } from '@/lib/data-events'
import type { Connection } from '@/lib/types'
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
  deliveryPending: number
  toReceive: number
  toPay: number
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

    const connectionMap = new Map<string, Connection>(connections.map(c => [c.id, c]))

    let ordersToday = 0
    let ordersTodayValue = 0
    let dispatchPending = 0
    let deliveryPending = 0
    let toReceive = 0
    let toPay = 0

    for (const order of orders) {
      if (order.declinedAt) continue

      const conn = connectionMap.get(order.connectionId)
      const isSupplierForOrder = conn?.supplierBusinessId === currentBusinessId

      // Orders today
      if (isToday(order.createdAt)) {
        ordersToday++
        ordersTodayValue += order.orderValue
      }

      // Dispatch pending: user is supplier, order not yet dispatched
      if (isSupplierForOrder && !order.dispatchedAt && !order.declinedAt) {
        dispatchPending++
      }

      // Delivery pending: user is buyer, order dispatched but not delivered
      if (!isSupplierForOrder && order.dispatchedAt && !order.deliveredAt && !order.declinedAt) {
        deliveryPending++
      }

      // To Receive: user is supplier, pending amount > 0
      if (isSupplierForOrder && order.pendingAmount > 0) {
        toReceive += order.pendingAmount
      }

      // To Pay: user is buyer, pending amount > 0
      if (!isSupplierForOrder && order.pendingAmount > 0) {
        toPay += order.pendingAmount
      }
    }

    setData({
      ordersToday,
      ordersTodayValue,
      dispatchPending,
      deliveryPending,
      toReceive,
      toPay,
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

        {/* Delivery Pending */}
        <button
          onClick={() => onNavigateToOrders()}
          className="w-full bg-white border border-border rounded-xl px-4 py-4 text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">Delivery Pending</p>
            <CaretRight size={16} className="text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <p className="text-[28px] font-semibold leading-tight" style={{ color: data.deliveryPending > 0 ? '#E8A020' : undefined }}>
              {data.deliveryPending}
            </p>
            <p className="text-[13px] text-muted-foreground">
              order{data.deliveryPending !== 1 ? 's' : ''}
            </p>
          </div>
        </button>

        {/* To Receive */}
        <button
          onClick={() => onNavigateToOrders('payment_pending')}
          className="w-full bg-white border border-border rounded-xl px-4 py-4 text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">To Receive</p>
            <CaretRight size={16} className="text-muted-foreground" />
          </div>
          <p className="text-[28px] font-semibold text-foreground leading-tight mt-1.5">
            ₹{data.toReceive.toLocaleString('en-IN')}
          </p>
        </button>

        {/* To Pay */}
        <button
          onClick={() => onNavigateToOrders('payment_pending')}
          className="w-full bg-white border border-border rounded-xl px-4 py-4 text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">To Pay</p>
            <CaretRight size={16} className="text-muted-foreground" />
          </div>
          <p className="text-[28px] font-semibold text-foreground leading-tight mt-1.5">
            ₹{data.toPay.toLocaleString('en-IN')}
          </p>
        </button>
      </div>
    </div>
  )
}
