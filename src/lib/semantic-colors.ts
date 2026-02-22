export function getConnectionStateColor(state: string): string {
  switch (state) {
    case 'Stable': return '#4CAF50'
    case 'Active': return '#4A90D9'
    case 'Friction Rising': return '#E8A020'
    case 'Under Stress': return '#D64545'
    default: return '#444444'
  }
}

export function getLifecycleStatusColor(state: string): string {
  switch (state) {
    case 'Delivered': return '#4CAF50'
    case 'Dispatched': return '#4A90D9'
    case 'Accepted': return '#4A90D9'
    case 'Placed': return '#888888'
    case 'Declined': return '#999999'
    default: return '#444444'
  }
}

export function getDueDateColor(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('overdue')) return '#D64545'
  if (l.includes('due today')) return '#E8A020'
  if (l === 'paid') return '#4CAF50'
  if (l.includes('awaiting')) return '#888888'
  return '#444444'
}

export function getAttentionHeadingColor(category: string): string {
  if (category === 'Overdue' || category === 'Disputes') return '#D64545'
  if (category === 'Due Today' || category === 'Approval Needed') return '#E8A020'
  return '#444444'
}