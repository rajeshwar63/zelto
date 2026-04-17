// Ported pure functions from src/lib/business-logic.ts. Kept identical so
// server-side settlement calculations produce the same results as the client.

import type {
  Order,
  OrderWithPaymentState,
  PaymentEvent,
  SettlementState,
} from './intelligence-types.ts'

export function calculateDueDate(order: Order): number | null {
  const snapshot = order.paymentTermSnapshot
  switch (snapshot.type) {
    case 'Advance Required':
      return order.createdAt
    case 'Payment on Delivery':
      return order.deliveredAt
    case 'Bill to Bill':
      return null
    case 'Days After Delivery':
      if (!order.deliveredAt) return null
      return order.deliveredAt + snapshot.days * 24 * 60 * 60 * 1000
    default:
      return null
  }
}

export function calculateTotalPaid(
  orderId: string,
  allPaymentEvents: PaymentEvent[],
): number {
  return allPaymentEvents
    .filter((event) => event.orderId === orderId)
    .reduce((sum, event) => sum + event.amountPaid, 0)
}

export function calculateSettlementState(
  orderValue: number,
  totalPaid: number,
  dueDate: number | null,
): SettlementState {
  if (orderValue <= 0) {
    if (dueDate === null) return 'Awaiting Payment'
    return Date.now() < dueDate ? 'Awaiting Payment' : 'Pending'
  }

  if (totalPaid >= orderValue) return 'Paid'
  if (totalPaid > 0 && totalPaid < orderValue) return 'Partial Payment'

  if (totalPaid === 0) {
    if (dueDate === null) return 'Awaiting Payment'
    return Date.now() < dueDate ? 'Awaiting Payment' : 'Pending'
  }

  return 'Awaiting Payment'
}

export function enrichConnectionOrdersWithPaymentState(
  orders: Order[],
  allPaymentEvents: PaymentEvent[],
): OrderWithPaymentState[] {
  // Group orders by connection so Bill-to-Bill "next order" lookup is local.
  const byConnection = new Map<string, Order[]>()
  for (const order of orders) {
    if (!byConnection.has(order.connectionId)) byConnection.set(order.connectionId, [])
    byConnection.get(order.connectionId)!.push(order)
  }

  const result: OrderWithPaymentState[] = []

  for (const [, connectionOrders] of byConnection) {
    const sorted = [...connectionOrders].sort((a, b) => a.createdAt - b.createdAt)

    for (let i = 0; i < sorted.length; i++) {
      const order = sorted[i]
      const payments = allPaymentEvents.filter((p) => p.orderId === order.id)
      const totalPaid = calculateTotalPaid(order.id, payments)
      const pendingAmount = order.orderValue - totalPaid

      if (order.paymentTermSnapshot.type === 'Bill to Bill') {
        const nextOrder = sorted.slice(i + 1).find((o) => !o.declinedAt)
        const billToBillDueDate = nextOrder?.deliveredAt ?? null
        const settlementState = calculateSettlementState(
          order.orderValue,
          totalPaid,
          billToBillDueDate,
        )
        result.push({
          ...order,
          totalPaid,
          pendingAmount,
          settlementState,
          calculatedDueDate: billToBillDueDate,
        })
        continue
      }

      const calculatedDueDate = calculateDueDate(order)
      const settlementState = calculateSettlementState(
        order.orderValue,
        totalPaid,
        calculatedDueDate,
      )
      result.push({
        ...order,
        totalPaid,
        pendingAmount,
        settlementState,
        calculatedDueDate,
      })
    }
  }

  return result
}

export function scoreToLevel(score: number): 'none' | 'basic' | 'verified' | 'trusted' {
  if (score >= 70) return 'trusted'
  if (score >= 45) return 'verified'
  if (score >= 20) return 'basic'
  return 'none'
}
