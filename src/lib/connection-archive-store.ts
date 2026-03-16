const KEY = (bId: string) => `zelto_archived_connections_${bId}`

export function getArchivedConnectionIds(businessId: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY(businessId))
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

export function archiveConnection(businessId: string, connectionId: string): void {
  const ids = getArchivedConnectionIds(businessId)
  ids.add(connectionId)
  localStorage.setItem(KEY(businessId), JSON.stringify([...ids]))
}

export function unarchiveConnection(businessId: string, connectionId: string): void {
  const ids = getArchivedConnectionIds(businessId)
  ids.delete(connectionId)
  localStorage.setItem(KEY(businessId), JSON.stringify([...ids]))
}
