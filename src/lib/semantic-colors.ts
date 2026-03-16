export { getConnectionStateColor } from './connection-state-utils'

export function getLifecycleStatusColor(state: string): string {
  switch (state) {
    case 'Delivered': return '#22B573'    // --status-delivered
    case 'Dispatched': return '#FF8C42'   // --status-dispatched
    case 'Accepted': return '#4A6CF7'     // --status-new
    case 'Placed': return '#4A6CF7'       // --status-new
    case 'Declined': return '#8492A6'     // --text-secondary
    case 'Order Placed': return '#4A6CF7' // --status-new
    case 'Paid': return '#22B573'         // --status-success
    case 'Payment Recorded': return '#EC4899' // --status-payment
    default: return '#8492A6'             // --text-secondary
  }
}

export function getDueDateColor(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('overdue')) return '#FF6B6B'  // --status-overdue
  if (l.includes('due today')) return '#FFB020' // --status-issue (warning)
  if (l === 'paid') return '#22B573'           // --status-delivered
  if (l.includes('awaiting')) return '#8492A6'  // --text-secondary
  return '#8492A6'                              // --text-secondary
}

export function getAttentionHeadingColor(category: string): string {
  if (category === 'Overdue' || category === 'Disputes') return '#FF6B6B' // --status-overdue
  if (category === 'Due Today' || category === 'Approval Needed') return '#FFB020' // --status-issue
  return '#8492A6' // --text-secondary
}
