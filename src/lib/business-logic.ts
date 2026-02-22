import {
  Order,
  OrderWithPaymentState,
  PaymentEvent,
  PaymentTermType,
  SettlementState,
} from './types'

export function generateZeltoId(existingIds: string[]): string {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let zeltoId: string
  do {
    let suffix = ''
    for (let i = 0; i < 8; i++) {
      suffix += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    zeltoId = `ZELTO-${suffix}`
  } while (existingIds.includes(zeltoId))
  return zeltoId
}

export function calculateDueDate(
  order: Order,
  paymentEvents: PaymentEvent[]
): number | null {
  const { paymentTermSnapshot } = order

  switch (paymentTermSnapshot.type) {
    case 'Advance Required':
      return order.createdAt

    case 'Payment on Delivery':
      return order.deliveredAt

    case 'Bill to Bill':
      return order.billToBillInvoiceDate

    case 'Days After Delivery':
      if (!order.deliveredAt) return null
      const daysInMs = paymentTermSnapshot.days * 24 * 60 * 60 * 1000
      return order.deliveredAt + daysInMs

    default:
      return null
  }
}

export function calculateTotalPaid(
  orderId: string,
  allPaymentEvents: PaymentEvent[]
): number {
  return allPaymentEvents
    .filter((event) => event.orderId === orderId)
    .reduce((sum, event) => sum + event.amountPaid, 0)
}

export function calculateSettlementState(
  orderValue: number,
  totalPaid: number,
  dueDate: number | null
): SettlementState {
  if (totalPaid >= orderValue) {
    return 'Paid'
  }

  if (totalPaid > 0 && totalPaid < orderValue) {
    return 'Partial Payment'
  }

  if (totalPaid === 0) {
    if (dueDate === null) {
      return 'Awaiting Payment'
    }
    
    const now = Date.now()
    if (now < dueDate) {
      return 'Awaiting Payment'
    } else {
      return 'Pending'
    }
  }

  return 'Awaiting Payment'
}

export function enrichOrderWithPaymentState(
  order: Order,
  allPaymentEvents: PaymentEvent[]
): OrderWithPaymentState {
  const totalPaid = calculateTotalPaid(order.id, allPaymentEvents)
  const pendingAmount = order.orderValue - totalPaid
  const calculatedDueDate = calculateDueDate(order, allPaymentEvents)
  const settlementState = calculateSettlementState(
    order.orderValue,
    totalPaid,
    calculatedDueDate
  )

  return {
    ...order,
    totalPaid,
    pendingAmount,
    settlementState,
    calculatedDueDate,
  }
}

export function validateUniqueZeltoId(
  zeltoId: string,
  allZeltoIds: string[]
): boolean {
  return !allZeltoIds.includes(zeltoId)
}

export function snapshotPaymentTerms(
  connectionPaymentTerms: PaymentTermType
): PaymentTermType {
  return JSON.parse(JSON.stringify(connectionPaymentTerms))
}
