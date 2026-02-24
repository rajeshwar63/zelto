const STORAGE_PREFIX = 'zelto_archived_'

function getStorageKey(businessId: string): string {
  return `${STORAGE_PREFIX}${businessId}`
}

export function getArchivedOrderIds(businessId: string): Set<string> {
  try {
    const raw = localStorage.getItem(getStorageKey(businessId))
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

export function archiveOrder(businessId: string, orderId: string): void {
  const ids = getArchivedOrderIds(businessId)
  ids.add(orderId)
  localStorage.setItem(getStorageKey(businessId), JSON.stringify([...ids]))
}

export function unarchiveOrder(businessId: string, orderId: string): void {
  const ids = getArchivedOrderIds(businessId)
  ids.delete(orderId)
  localStorage.setItem(getStorageKey(businessId), JSON.stringify([...ids]))
}

export function isOrderArchived(businessId: string, orderId: string): boolean {
  return getArchivedOrderIds(businessId).has(orderId)
}
