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
      return null

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

export function enrichConnectionOrdersWithPaymentState(
  orders: Order[],
  allPaymentEvents: PaymentEvent[]
): OrderWithPaymentState[] {
  const sortedOrders = [...orders].sort((a, b) => a.createdAt - b.createdAt)

  return sortedOrders.map((order, index) => {
    const payments = allPaymentEvents.filter((p) => p.orderId === order.id)

    if (order.paymentTermSnapshot.type === 'Bill to Bill') {
      const nextOrder = sortedOrders.slice(index + 1).find((o) => !o.declinedAt)
      const billToBillDueDate = nextOrder?.deliveredAt ?? null
      const totalPaid = calculateTotalPaid(order.id, payments)
      const pendingAmount = order.orderValue - totalPaid
      const settlementState = calculateSettlementState(
        order.orderValue,
        totalPaid,
        billToBillDueDate
      )
      return {
        ...order,
        totalPaid,
        pendingAmount,
        settlementState,
        calculatedDueDate: billToBillDueDate,
      }
    }

    return enrichOrderWithPaymentState(order, payments)
  })
}

export function normalizeBusinessName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Remove common business suffixes
  const suffixes = [
    'pvt ltd', 'private limited', 'limited', 'ltd', 'llp',
    'enterprises', 'enterprise', 'traders', 'trading', 'trader',
    'industries', 'industry', 'solutions', 'services', 'service',
    'agency', 'agencies', 'co', 'company', 'corp', 'corporation',
    'inc', 'associates', 'associate', 'brothers', 'bros',
    'sons', 'and sons', '& sons', 'foods', 'food',
    'store', 'stores', 'shop', 'mart', 'emporium',
    'suppliers', 'supplier', 'distributors', 'distributor',
    'wholesalers', 'wholesaler', 'dealers', 'dealer'
  ];
  for (const suffix of suffixes) {
    normalized = normalized.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '');
  }

  // Common transliteration variants in Indian business names
  const variants: Record<string, string> = {
    'shri': 'sri', 'shree': 'sri', 'sree': 'sri',
    'laxmi': 'lakshmi', 'luxmi': 'lakshmi', 'lakhsmi': 'lakshmi',
    'ganesh': 'ganesh', 'ganesha': 'ganesh',
    'vishnu': 'vishnu', 'visnu': 'vishnu',
    'krishna': 'krishna', 'krsna': 'krishna',
    'mahalakshmi': 'mahalakshmi', 'mahalaxmi': 'mahalakshmi',
    'venkatesh': 'venkatesh', 'venkateshwara': 'venkatesh',
    'subramanian': 'subramanian', 'subramaniam': 'subramanian',
    'and': '&', 'nd': '&',
  };
  for (const [from, to] of Object.entries(variants)) {
    normalized = normalized.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }

  // Remove special characters, collapse spaces
  normalized = normalized.replace(/[^a-z0-9&]/g, ' ').replace(/\s+/g, ' ').trim();

  return normalized;
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
