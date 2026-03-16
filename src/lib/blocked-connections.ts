const KEY = (bId: string) => `zelto_blocked_businesses_${bId}`

export function getBlockedBusinessIds(businessId: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY(businessId))
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export function blockBusiness(businessId: string, targetId: string): void {
  const ids = getBlockedBusinessIds(businessId)
  ids.add(targetId)
  localStorage.setItem(KEY(businessId), JSON.stringify([...ids]))
}

export function unblockBusiness(businessId: string, targetId: string): void {
  const ids = getBlockedBusinessIds(businessId)
  ids.delete(targetId)
  localStorage.setItem(KEY(businessId), JSON.stringify([...ids]))
}
