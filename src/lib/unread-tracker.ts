import type { AttentionItem } from './attention-engine'

interface UnreadState {
  attentionLastSeen: number
  connectionsLastSeen: number
  connectionLastSeen: Record<string, number>
}

const STORAGE_KEY_PREFIX = 'zelto_unread_'

export function getUnreadState(businessId: string): UnreadState {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${businessId}`)
    if (stored) return JSON.parse(stored) as UnreadState
  } catch {
    // ignore parse errors
  }
  return { attentionLastSeen: 0, connectionsLastSeen: 0, connectionLastSeen: {} }
}

function saveUnreadState(businessId: string, state: UnreadState): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${businessId}`, JSON.stringify(state))
  } catch {
    // ignore storage errors
  }
}

export function updateTabLastSeen(businessId: string, tab: 'attention' | 'connections'): void {
  const state = getUnreadState(businessId)
  if (tab === 'attention') {
    state.attentionLastSeen = Date.now()
  } else {
    state.connectionsLastSeen = Date.now()
  }
  saveUnreadState(businessId, state)
}

export function updateConnectionLastSeen(businessId: string, connectionId: string): void {
  const state = getUnreadState(businessId)
  state.connectionLastSeen[connectionId] = Date.now()
  saveUnreadState(businessId, state)
}

export function hasUnreadAttentionItems(businessId: string, items: AttentionItem[]): boolean {
  const state = getUnreadState(businessId)
  return items.some(item => item.frictionStartedAt > state.attentionLastSeen)
}

export function hasUnreadConnectionActivity(businessId: string, connectionId: string, items: AttentionItem[]): boolean {
  const state = getUnreadState(businessId)
  const lastSeen = state.connectionLastSeen[connectionId] ?? state.connectionsLastSeen
  return items.some(item => item.connectionId === connectionId && item.frictionStartedAt > lastSeen)
}

export function hasAnyUnreadConnections(businessId: string, items: AttentionItem[]): boolean {
  const state = getUnreadState(businessId)
  const itemsByConnection = new Map<string, AttentionItem[]>()
  for (const item of items) {
    const existing = itemsByConnection.get(item.connectionId)
    if (existing) {
      existing.push(item)
    } else {
      itemsByConnection.set(item.connectionId, [item])
    }
  }
  for (const [connId, connItems] of itemsByConnection) {
    const lastSeen = Math.max(state.connectionLastSeen[connId] ?? 0, state.connectionsLastSeen)
    if (connItems.some(item => item.frictionStartedAt > lastSeen)) return true
  }
  return false
}
