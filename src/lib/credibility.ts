import { dataStore } from './data-store'
import { supabase } from './supabase-client'

export interface CredibilityBreakdown {
  score: number          // 0-100
  level: 'none' | 'basic' | 'verified' | 'trusted'
  completedItems: string[]
  missingItems: string[]
}

/**
 * @deprecated Use `computeTrustScore()` from `trust-score.ts` instead.
 * Kept for backward compatibility during migration.
 *
 * Calculate credibility score for a business entity (legacy scoring).
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

  if (entity.description && entity.description.trim().length > 0) {
    score += 5
    completedItems.push('Business description')
  } else {
    missingItems.push('Business description')
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

  // Cap score at 100
  score = Math.min(score, 100)

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
 * Pure helper: derive credibility level from a numeric score.
 * Updated thresholds for Trust Score V2.
 */
export function scoreToLevel(score: number): CredibilityBreakdown['level'] {
  if (score >= 70) return 'trusted'
  if (score >= 45) return 'verified'
  if (score >= 20) return 'basic'
  return 'none'
}

/**
 * Get activity counts for display on business profile card.
 * Uses a security-definer RPC so RLS doesn't block reads for third-party businesses.
 */
export async function getBusinessActivityCounts(businessId: string): Promise<{
  connectionCount: number
  orderCount: number
}> {
  const { data, error } = await supabase
    .rpc('get_business_activity_counts', { p_business_id: businessId })

  if (error) {
    console.error('getBusinessActivityCounts RPC error:', error)
    return { connectionCount: 0, orderCount: 0 }
  }

  return {
    connectionCount: data?.connection_count ?? 0,
    orderCount: data?.order_count ?? 0,
  }
}
