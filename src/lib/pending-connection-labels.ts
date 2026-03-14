// Temporary in-memory store for branch/contact labels entered during the Add Connection flow.
// When a connection request is created, the requester may enter optional labels.
// These are held here until the request is accepted and the connection row is available.

const pendingLabels = new Map<string, { branchLabel: string | null; contactName: string | null }>()

export function setPendingConnectionLabels(
  requestId: string,
  branchLabel: string | null,
  contactName: string | null
): void {
  if (branchLabel || contactName) {
    pendingLabels.set(requestId, { branchLabel, contactName })
  }
}

export function consumePendingConnectionLabels(
  requestId: string
): { branchLabel: string | null; contactName: string | null } | null {
  const labels = pendingLabels.get(requestId)
  if (labels) {
    pendingLabels.delete(requestId)
    return labels
  }
  return null
}
