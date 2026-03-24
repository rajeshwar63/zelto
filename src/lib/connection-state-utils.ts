import type { ConnectionState } from './types'

export function getConnectionStateLabel(state: ConnectionState | null | undefined): string {
  switch (state) {
    case 'Active':          return 'Active — Protected'
    case 'Stable':          return 'Stable — Protected'
    case 'Friction Rising': return 'Friction Rising — Protection at Risk'
    case 'Under Stress':    return 'Under Stress — Protection Weakened'
    default:                return 'Stable — Protected'
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
