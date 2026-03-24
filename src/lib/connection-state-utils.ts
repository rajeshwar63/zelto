import type { ConnectionState } from './types'

export function getConnectionStateLabel(state: ConnectionState | null | undefined): string {
  switch (state) {
    case 'Active':          return 'Healthy'
    case 'Stable':          return 'Stable'
    case 'Friction Rising': return 'Needs Attention'
    case 'Under Stress':    return 'At Risk'
    default:                return 'Stable'
  }
}

export function getConnectionStateColor(state: ConnectionState | null | undefined): string {
  switch (state) {
    case 'Active':          return '#16A34A'
    case 'Stable':          return '#6B7280'
    case 'Friction Rising': return '#D97706'
    case 'Under Stress':    return '#DC2626'
    default:                return '#6B7280'
  }
}
