import { differenceInDays } from 'date-fns'
import type { Connection, OrderWithPaymentState, OrderAttachment, PaymentEvent } from '@/lib/types'

export interface OrderTimelineEvent {
  label: string
  actor: string
  timestamp: number | null
  completed: boolean
  attachmentIndicator?: string | null  // filename to show as attachment indicator
}

export function getLifecycleState(order: OrderWithPaymentState): string {
  if (order.declinedAt) return 'Declined'
  if (order.deliveredAt) return 'Delivered'
  if (order.dispatchedAt) return 'Dispatched'
  if (order.acceptedAt) return 'Accepted'
  return 'Placed'
}

export function formatPaymentTerms(terms: Connection['paymentTerms']): string {
  if (!terms) return 'Not set'

  switch (terms.type) {
    case 'Advance Required':
      return 'Advance Required'
    case 'Payment on Delivery':
      return 'Payment on Delivery'
    case 'Bill to Bill':
      return 'Bill to Bill'
    case 'Days After Delivery':
      return `${terms.days} days after delivery`
  }
}

export function formatDueDate(order: OrderWithPaymentState): string {
  if (order.settlementState === 'Paid') return 'Paid'

  if (!order.calculatedDueDate) {
    if (!order.deliveredAt) return 'Awaiting delivery'
    if (order.paymentTermSnapshot.type === 'Bill to Bill') return 'Linked to next delivery'
    return 'Due date pending'
  }

  const dueDate = new Date(order.calculatedDueDate)
  const now = new Date()
  const days = differenceInDays(dueDate, now)

  if (days === 0) return 'Due today'
  if (days > 0) return `Due in ${days} day${days > 1 ? 's' : ''}`

  const overdueDays = Math.abs(days)
  return `Overdue ${overdueDays} day${overdueDays > 1 ? 's' : ''}`
}

export function buildOrderTimeline(
  order: OrderWithPaymentState,
  buyerName: string,
  supplierName: string,
  payments: PaymentEvent[],
  attachments: OrderAttachment[],
): OrderTimelineEvent[] {
  const dispatchAttachment = attachments.find(a => a.type === 'dispatch_note')
  const deliveryAttachment = attachments.find(a => a.type === 'delivery_proof')

  // Determine who delivered (from delivery_proof attachment — if exists, supplier delivered)
  const deliveredBySupplier = !!deliveryAttachment
  const deliveredLabel = deliveredBySupplier ? 'Delivered · Proof attached' : 'Delivered'

  const timeline: OrderTimelineEvent[] = [
    {
      label: 'Order placed',
      actor: buyerName,
      timestamp: order.createdAt,
      completed: true,
    },
  ]

  if (order.acceptedAt || order.dispatchedAt || order.deliveredAt) {
    timeline.push({
      label: 'Accepted',
      actor: supplierName,
      timestamp: order.acceptedAt,
      completed: !!order.acceptedAt,
    })
  }

  if (order.dispatchedAt || order.deliveredAt) {
    timeline.push({
      label: 'Dispatched',
      actor: supplierName,
      timestamp: order.dispatchedAt,
      completed: !!order.dispatchedAt,
      attachmentIndicator: dispatchAttachment?.fileName ?? null,
    })
  }

  if (order.deliveredAt) {
    timeline.push({
      label: deliveredLabel,
      actor: deliveredBySupplier ? supplierName : buyerName,
      timestamp: order.deliveredAt,
      completed: true,
      attachmentIndicator: deliveryAttachment?.fileName ?? null,
    })
  }

  // Payment entries
  if (payments.length > 0) {
    const paymentAttachments = attachments.filter(a => a.type === 'payment_proof')
    payments.forEach(payment => {
      const proof = paymentAttachments.find(a => a.paymentEventId === payment.id)
      const label = proof ? 'Payment recorded · Proof attached' : 'Payment recorded'
      timeline.push({
        label,
        actor: '',
        timestamp: payment.timestamp,
        completed: true,
        attachmentIndicator: proof?.fileName ?? null,
      })
    })
  }

  return timeline
}
