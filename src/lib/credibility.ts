import { dataStore } from './data-store'

export interface CredibilityBreakdown {
  score: number          // 0-100
  level: 'none' | 'basic' | 'verified' | 'trusted'
  completedItems: string[]
  missingItems: string[]
}

/**
 * Calculate credibility score for a business entity.
 *
 * Profile completeness (max 60 points):
 *   - Business name: 10 (always present)
 *   - Phone number: 10
 *   - GST number: 10
 *   - Business address OR Google Maps location: 10
 *   - Google Maps location (with lat/lng): 10 bonus on top of address
 *   - Business type: 5
 *   - Website: 5
 *
 * Activity signals (max 40 points):
 *   - Has at least 1 connection: 10
 *   - Has at least 3 connections: 10 (additional)
 *   - Has at least 1 order: 10
 *   - Has at least 10 orders: 10 (additional)
 */
export async function calculateCredibility(businessId: string): Promise<CredibilityBreakdown> {
  const entity = await dataStore.getBusinessEntityById(businessId)
  if (!entity) return { score: 0, level: 'none', completedItems: [], missingItems: [] }

  let score = 0
  const completedItems: string[] = []
  const missingItems: string[] = []

  // Profile completeness
  // Business name (always present)
  score += 10
  completedItems.push('Business name')

  if (entity.phone) {
    score += 10
    completedItems.push('Phone number')
  } else {
    missingItems.push('Phone number')
  }

  if (entity.gstNumber) {
    score += 10
    completedItems.push('GST number')
  } else {
    missingItems.push('GST number')
  }

  if (entity.businessAddress || entity.formattedAddress) {
    score += 10
    completedItems.push('Business address')
  } else {
    missingItems.push('Business address')
  }

  if (entity.latitude && entity.longitude) {
    score += 10
    completedItems.push('Map location verified')
  } else {
    missingItems.push('Map location')
  }

  if (entity.businessType) {
    score += 5
    completedItems.push('Business type')
  } else {
    missingItems.push('Business type')
  }

  if (entity.website) {
    score += 5
    completedItems.push('Website')
  } else {
    missingItems.push('Website')
  }

  // Activity signals
  const connections = await dataStore.getConnectionsByBusinessId(businessId)
  const activeConnections = connections.length

  if (activeConnections >= 1) {
    score += 10
    completedItems.push('Active connections')
  } else {
    missingItems.push('Active connections')
  }

  if (activeConnections >= 3) {
    score += 10
    completedItems.push('3+ connections')
  }

  // Count orders for this business (across all connections)
  let totalOrders = 0
  for (const conn of connections) {
    const orders = await dataStore.getOrdersByConnectionId(conn.id)
    totalOrders += orders.length
  }

  if (totalOrders >= 1) {
    score += 10
    completedItems.push('Order history')
  } else {
    missingItems.push('Order history')
  }

  if (totalOrders >= 10) {
    score += 10
    completedItems.push('10+ orders')
  }

  // Determine level
  let level: CredibilityBreakdown['level']
  if (score >= 70) level = 'trusted'
  else if (score >= 40) level = 'verified'
  else if (score >= 15) level = 'basic'
  else level = 'none'

  // Update cached score in DB
  try {
    await dataStore.updateCredibilityScore(businessId, score)
  } catch (err) {
    console.error('Failed to update credibility score:', err)
  }

  return { score, level, completedItems, missingItems }
}

/**
 * Get activity counts for display on business profile card.
 */
export async function getBusinessActivityCounts(businessId: string): Promise<{
  connectionCount: number
  orderCount: number
}> {
  const connections = await dataStore.getConnectionsByBusinessId(businessId)
  let orderCount = 0
  for (const conn of connections) {
    const orders = await dataStore.getOrdersByConnectionId(conn.id)
    orderCount += orders.length
  }
  return { connectionCount: connections.length, orderCount }
}
