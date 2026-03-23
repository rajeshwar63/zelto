import { dataStore } from './data-store'
import { behaviourEngine } from './behaviour-engine'
import type { CredibilityBreakdown } from './credibility'

// ─── Types ───────────────────────────────────────────────────────────

export interface PillarScore {
  score: number
  max: number
  tags: Array<{ label: string; sentiment: 'positive' | 'warning' | 'neutral' }>
}

export interface TrustScoreBreakdown {
  total: number                    // 0-100
  level: 'none' | 'basic' | 'verified' | 'trusted'
  identity: PillarScore            // max 30
  activity: PillarScore            // max 20
  tradeRecord: PillarScore         // max 50
  tradeRecordInsufficient: boolean  // true if < 3 orders
  weakestPillar: 'identity' | 'activity' | 'tradeRecord'
  nudgeText: string
}

export interface BusinessInsight {
  text: string
  category: 'settlement' | 'operational' | 'quality'
  sentiment: 'positive' | 'warning' | 'neutral'
  timeframe: string
}

export interface AggregatedBehaviourSignals {
  total_on_time_payments: number
  total_late_payments: number
  total_overdue: number
  total_partial_payments: number
  on_time_rate: number | null
  short_window_late_count: number
  medium_window_late_count: number
  trend: 'improving' | 'worsening' | 'stable' | 'insufficient_data'
  weighted_avg_acceptance_delay: number | null
  weighted_avg_dispatch_delay: number | null
  avg_delivery_consistency: number | null
  total_open_issues: number
  total_issues_30_days: number
  has_recurring_issues: boolean
  connections_evaluated: number
  total_orders_evaluated: number
}

// ─── Score-to-level (updated thresholds) ─────────────────────────────

export function scoreToLevel(score: number): CredibilityBreakdown['level'] {
  if (score >= 70) return 'trusted'
  if (score >= 45) return 'verified'
  if (score >= 20) return 'basic'
  return 'none'
}

// ─── Aggregation ─────────────────────────────────────────────────────

export async function aggregateBusinessBehaviourSignals(
  businessId: string
): Promise<AggregatedBehaviourSignals> {
  const connections = await dataStore.getConnectionsByBusinessId(businessId)

  let total_on_time_payments = 0
  let total_late_payments = 0
  let total_overdue = 0
  let total_partial_payments = 0
  let short_window_late_count = 0
  let medium_window_late_count = 0

  let acceptance_delay_sum = 0
  let acceptance_delay_weight = 0
  let dispatch_delay_sum = 0
  let dispatch_delay_weight = 0
  let delivery_consistency_sum = 0
  let delivery_consistency_weight = 0

  let total_open_issues = 0
  let total_issues_30_days = 0
  let has_recurring_issues = false
  let total_orders_evaluated = 0

  await Promise.all(
    connections.map(async (conn) => {
      const [signals, orders] = await Promise.all([
        behaviourEngine.computeAllSignals(conn.id),
        dataStore.getOrdersByConnectionId(conn.id),
      ])
      const orderCount = orders.length
      total_orders_evaluated += orderCount

      // Settlement sums
      total_on_time_payments += signals.settlement.medium.on_time_payment_count
      total_late_payments += signals.settlement.medium.late_payment_count
      total_overdue += signals.settlement.medium.overdue_count
      total_partial_payments += signals.settlement.medium.partial_payment_count

      // Trend sums
      short_window_late_count += signals.settlement.short.late_payment_count
      medium_window_late_count += signals.settlement.medium.late_payment_count

      // Weighted operational
      if (signals.operational.avg_acceptance_delay != null) {
        acceptance_delay_sum += signals.operational.avg_acceptance_delay * orderCount
        acceptance_delay_weight += orderCount
      }
      if (signals.operational.avg_dispatch_delay != null) {
        dispatch_delay_sum += signals.operational.avg_dispatch_delay * orderCount
        dispatch_delay_weight += orderCount
      }
      if (signals.operational.delivery_consistency != null) {
        delivery_consistency_sum += signals.operational.delivery_consistency * orderCount
        delivery_consistency_weight += orderCount
      }

      // Quality sums
      total_open_issues += signals.quality.total_open_issues
      total_issues_30_days += signals.quality.total_issues_30_days
      if (signals.quality.recurring_issue_types.length > 0) {
        has_recurring_issues = true
      }
    })
  )

  // Derived values
  const completed_payments = total_on_time_payments + total_late_payments
  const on_time_rate =
    completed_payments > 0
      ? (total_on_time_payments / completed_payments) * 100
      : null

  const weighted_avg_acceptance_delay =
    acceptance_delay_weight > 0
      ? acceptance_delay_sum / acceptance_delay_weight
      : null

  const weighted_avg_dispatch_delay =
    dispatch_delay_weight > 0
      ? dispatch_delay_sum / dispatch_delay_weight
      : null

  const avg_delivery_consistency =
    delivery_consistency_weight > 0
      ? delivery_consistency_sum / delivery_consistency_weight
      : null

  // Trend
  let trend: AggregatedBehaviourSignals['trend']
  if (medium_window_late_count === 0 && short_window_late_count === 0) {
    trend = 'stable'
  } else if (short_window_late_count < medium_window_late_count * 0.3) {
    trend = 'improving'
  } else if (short_window_late_count > medium_window_late_count * 0.7) {
    trend = 'worsening'
  } else {
    trend = 'stable'
  }

  return {
    total_on_time_payments,
    total_late_payments,
    total_overdue,
    total_partial_payments,
    on_time_rate,
    short_window_late_count,
    medium_window_late_count,
    trend,
    weighted_avg_acceptance_delay,
    weighted_avg_dispatch_delay,
    avg_delivery_consistency,
    total_open_issues,
    total_issues_30_days,
    has_recurring_issues,
    connections_evaluated: connections.length,
    total_orders_evaluated,
  }
}

// ─── Pillar 1: Identity & Compliance (max 30) ────────────────────────

async function computeIdentityPillar(businessId: string): Promise<PillarScore> {
  const entity = await dataStore.getBusinessEntityById(businessId)
  const tags: PillarScore['tags'] = []
  if (!entity) return { score: 0, max: 30, tags: [{ label: 'Profile incomplete', sentiment: 'warning' }] }

  // Profile completeness (max 15)
  let profileScore = 0
  profileScore += 2 // business name always present
  if (entity.phone) profileScore += 2
  if (entity.gstNumber) profileScore += 3
  if (entity.businessAddress || entity.formattedAddress) profileScore += 2
  if (entity.latitude && entity.longitude) profileScore += 2
  if (entity.businessType) profileScore += 2
  if (entity.website) profileScore += 1
  if (entity.description && entity.description.trim().length > 0) profileScore += 1

  // Document health (max 15)
  const docs = await dataStore.getDocumentsByBusinessId(businessId)
  let docScore = 0
  const now = Date.now()

  const totalDocs = docs.length
  const expiredDocs = docs.filter(d => d.expiresAt && d.expiresAt < now)
  const expiringDocs = docs.filter(d => {
    if (!d.expiresAt) return false
    const diffDays = (d.expiresAt - now) / (1000 * 60 * 60 * 24)
    return d.expiresAt > now && diffDays <= 30
  })
  const validDocs = docs.filter(d => {
    if (!d.expiresAt) return true // no expiry = valid
    return d.expiresAt > now
  })

  if (totalDocs >= 1) docScore += 5
  if (totalDocs >= 3) docScore += 3
  if (expiredDocs.length === 0 && totalDocs > 0) docScore += 5
  if (expiringDocs.length === 0 && totalDocs > 0) docScore += 2

  const score = profileScore + docScore

  // Tags
  if (profileScore >= 13) tags.push({ label: 'Profile complete', sentiment: 'positive' })
  else if (profileScore >= 8) tags.push({ label: 'Profile mostly complete', sentiment: 'neutral' })
  else tags.push({ label: 'Profile incomplete', sentiment: 'warning' })

  if (totalDocs === 0) {
    tags.push({ label: 'No documents uploaded', sentiment: 'warning' })
  } else {
    const validCount = validDocs.length - expiringDocs.length
    if (validCount > 0) tags.push({ label: `${validCount} documents valid`, sentiment: 'positive' })
    if (expiringDocs.length > 0) tags.push({ label: `${expiringDocs.length} expiring soon`, sentiment: 'warning' })
    if (expiredDocs.length > 0) tags.push({ label: `${expiredDocs.length} expired`, sentiment: 'warning' })
  }

  return { score, max: 30, tags }
}

// ─── Pillar 2: Activity & Tenure (max 20) ────────────────────────────

async function computeActivityPillar(businessId: string): Promise<PillarScore> {
  const entity = await dataStore.getBusinessEntityById(businessId)
  const connections = await dataStore.getConnectionsByBusinessId(businessId)
  const tags: PillarScore['tags'] = []

  let score = 0
  const connCount = connections.length

  // Connections (max 7)
  if (connCount >= 1) score += 3
  if (connCount >= 3) score += 2
  if (connCount >= 5) score += 2

  // Orders (max 5)
  let totalOrders = 0
  let mostRecentOrderTime = 0
  for (const conn of connections) {
    const orders = await dataStore.getOrdersByConnectionId(conn.id)
    totalOrders += orders.length
    for (const o of orders) {
      if (o.createdAt > mostRecentOrderTime) mostRecentOrderTime = o.createdAt
    }
  }

  if (totalOrders >= 1) score += 2
  if (totalOrders >= 10) score += 3

  // Recency (max 5)
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  const activeIn7Days = mostRecentOrderTime >= sevenDaysAgo
  const activeIn30Days = mostRecentOrderTime >= thirtyDaysAgo

  if (activeIn7Days) {
    score += 5 // 3 + 2
  } else if (activeIn30Days) {
    score += 2
  }

  // Tenure (max 3)
  if (entity) {
    const ageMs = now - entity.createdAt
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    if (ageDays > 30) score += 1
    if (ageDays > 90) score += 1
    if (ageDays > 180) score += 1
  }

  // Tags
  tags.push({ label: `${connCount} connections`, sentiment: 'neutral' })
  tags.push({ label: `${totalOrders} orders`, sentiment: 'neutral' })

  if (activeIn7Days) {
    tags.push({ label: 'Active this week', sentiment: 'positive' })
  } else if (activeIn30Days) {
    tags.push({ label: 'Active this month', sentiment: 'neutral' })
  } else {
    tags.push({ label: 'Inactive', sentiment: 'warning' })
  }

  if (entity) {
    const memberDate = new Date(entity.createdAt)
    const month = memberDate.toLocaleDateString('en-IN', { month: 'short' })
    const year = memberDate.getFullYear()
    tags.push({ label: `Member since ${month} ${year}`, sentiment: 'neutral' })
  }

  return { score, max: 20, tags }
}

// ─── Pillar 3: Trade Record (max 50) ─────────────────────────────────

async function computeTradeRecordPillar(
  agg: AggregatedBehaviourSignals
): Promise<PillarScore & { insufficient: boolean }> {
  const tags: PillarScore['tags'] = []

  // Minimum data threshold
  if (agg.total_orders_evaluated < 3) {
    return {
      score: 0,
      max: 50,
      insufficient: true,
      tags: [{ label: 'Insufficient trade history', sentiment: 'neutral' }],
    }
  }

  let score = 0
  const completed_payments = agg.total_on_time_payments + agg.total_late_payments

  // Payment behaviour (max 20)
  if (agg.on_time_rate !== null) {
    if (agg.on_time_rate >= 90) score += 15
    else if (agg.on_time_rate >= 70) score += 10
    else if (agg.on_time_rate >= 50) score += 5
  }

  if (agg.total_overdue === 0) score += 5
  else if (agg.total_overdue === 1) score += 2

  // Operational reliability (max 15)
  if (agg.weighted_avg_acceptance_delay !== null) {
    if (agg.weighted_avg_acceptance_delay < 12) score += 8
    else if (agg.weighted_avg_acceptance_delay < 24) score += 5
    else if (agg.weighted_avg_acceptance_delay < 48) score += 2
  }

  if (agg.weighted_avg_dispatch_delay !== null) {
    if (agg.weighted_avg_dispatch_delay < 24) score += 4
    else if (agg.weighted_avg_dispatch_delay < 48) score += 2
  }

  if (agg.avg_delivery_consistency !== null) {
    if (agg.avg_delivery_consistency >= 90) score += 3
    else if (agg.avg_delivery_consistency >= 70) score += 1
  }

  // Quality (max 10)
  if (agg.total_open_issues === 0) score += 5
  else if (agg.total_open_issues === 1) score += 2

  if (agg.total_issues_30_days <= 1) score += 3
  if (!agg.has_recurring_issues) score += 2

  // Trend bonus (max 5)
  if (agg.trend === 'improving') score += 5
  else if (agg.trend === 'stable' && agg.on_time_rate !== null && agg.on_time_rate >= 70) score += 3
  else if (agg.trend === 'stable') score += 1

  // Tags
  if (agg.on_time_rate !== null) {
    if (agg.on_time_rate >= 80) tags.push({ label: 'Mostly on-time payments', sentiment: 'positive' })
    else if (agg.on_time_rate >= 50) tags.push({ label: 'Mixed payment timing', sentiment: 'warning' })
    else tags.push({ label: 'Frequent late payments', sentiment: 'warning' })
  }

  if (agg.total_overdue >= 1) {
    tags.push({ label: `${agg.total_overdue} payments overdue`, sentiment: 'warning' })
  } else if (completed_payments >= 3) {
    tags.push({ label: 'No overdue payments', sentiment: 'positive' })
  }

  if (agg.weighted_avg_acceptance_delay !== null) {
    if (agg.weighted_avg_acceptance_delay < 24) tags.push({ label: 'Fast order processing', sentiment: 'positive' })
    else if (agg.weighted_avg_acceptance_delay > 48) tags.push({ label: 'Slow order processing', sentiment: 'warning' })
  }

  if (agg.total_open_issues === 0 && agg.total_issues_30_days === 0) {
    tags.push({ label: 'No disputes recently', sentiment: 'positive' })
  } else if (agg.total_open_issues >= 1) {
    tags.push({ label: `${agg.total_open_issues} open disputes`, sentiment: 'warning' })
  }

  if (agg.trend === 'improving') tags.push({ label: 'Improving trend', sentiment: 'positive' })
  else if (agg.trend === 'worsening') tags.push({ label: 'Declining trend', sentiment: 'warning' })

  return { score, max: 50, insufficient: false, tags }
}

// ─── Main: computeTrustScore ─────────────────────────────────────────

export async function computeTrustScore(
  businessId: string
): Promise<TrustScoreBreakdown> {
  const [identity, activity, agg] = await Promise.all([
    computeIdentityPillar(businessId),
    computeActivityPillar(businessId),
    aggregateBusinessBehaviourSignals(businessId),
  ])

  const tradeResult = await computeTradeRecordPillar(agg)
  const tradeRecord: PillarScore = {
    score: tradeResult.score,
    max: tradeResult.max,
    tags: tradeResult.tags,
  }

  const total = Math.min(100, identity.score + activity.score + tradeRecord.score)
  const level = scoreToLevel(total)

  // Weakest pillar by percentage
  const pillarPcts: Array<{ key: TrustScoreBreakdown['weakestPillar']; pct: number }> = [
    { key: 'identity', pct: identity.score / identity.max },
    { key: 'activity', pct: activity.score / activity.max },
    { key: 'tradeRecord', pct: tradeResult.insufficient ? 0 : tradeRecord.score / tradeRecord.max },
  ]
  pillarPcts.sort((a, b) => a.pct - b.pct)
  const weakestPillar = pillarPcts[0].key

  // Nudge text
  let nudgeText: string
  if (tradeResult.insufficient && weakestPillar === 'tradeRecord') {
    nudgeText = 'Build trade history by completing more orders with your connections.'
  } else if (weakestPillar === 'identity') {
    nudgeText = 'Complete your profile and upload compliance documents to improve your score.'
  } else if (weakestPillar === 'activity') {
    nudgeText = 'Build more connections and stay active on the platform.'
  } else {
    nudgeText = 'Clear overdue payments and maintain on-time settlement to reach the next level.'
  }

  // Cache total score
  try {
    await dataStore.updateCredibilityScore(businessId, total)
  } catch (err) {
    console.error('Failed to update trust score:', err)
  }

  return {
    total,
    level,
    identity,
    activity,
    tradeRecord,
    tradeRecordInsufficient: tradeResult.insufficient,
    weakestPillar,
    nudgeText,
  }
}

// ─── Business Insights ───────────────────────────────────────────────

export async function generateBusinessInsights(
  businessId: string
): Promise<BusinessInsight[]> {
  const agg = await aggregateBusinessBehaviourSignals(businessId)

  // Insufficient data
  if (agg.total_orders_evaluated < 3) {
    return [
      {
        text: 'Not enough trade history to generate insights yet',
        category: 'settlement',
        sentiment: 'neutral',
        timeframe: '',
      },
    ]
  }

  const insights: BusinessInsight[] = []
  const completed_payments = agg.total_on_time_payments + agg.total_late_payments

  // Settlement insight (pick 1)
  if (agg.on_time_rate !== null) {
    if (agg.on_time_rate >= 80) {
      const onTimeConns = agg.connections_evaluated
      insights.push({
        text: `On-time payments with ${agg.total_on_time_payments} of ${completed_payments} payments`,
        category: 'settlement',
        sentiment: 'positive',
        timeframe: 'Last 30 days',
      })
    } else if (agg.on_time_rate >= 50) {
      insights.push({
        text: 'Mixed payment timing across connections',
        category: 'settlement',
        sentiment: 'warning',
        timeframe: 'Last 30 days',
      })
    } else {
      insights.push({
        text: 'Frequent late payments across connections',
        category: 'settlement',
        sentiment: 'warning',
        timeframe: 'Last 30 days',
      })
    }
  }

  // Overdue (always show if > 0, in addition to rate insight)
  if (agg.total_overdue >= 1) {
    insights.push({
      text: `${agg.total_overdue} payment${agg.total_overdue > 1 ? 's' : ''} overdue across connections`,
      category: 'settlement',
      sentiment: 'warning',
      timeframe: 'Current',
    })
  }

  // Operational insight (pick 1)
  if (agg.weighted_avg_acceptance_delay !== null) {
    const hrs = Math.round(agg.weighted_avg_acceptance_delay)
    if (agg.weighted_avg_acceptance_delay < 12) {
      insights.push({
        text: `Orders processed within ${hrs} hours on average`,
        category: 'operational',
        sentiment: 'positive',
        timeframe: 'Last 30 days',
      })
    } else if (agg.weighted_avg_acceptance_delay < 48) {
      insights.push({
        text: `Orders typically processed within ${hrs} hours`,
        category: 'operational',
        sentiment: 'positive',
        timeframe: 'Last 30 days',
      })
    } else {
      insights.push({
        text: `Order processing averaging ${hrs} hours`,
        category: 'operational',
        sentiment: 'warning',
        timeframe: 'Last 30 days',
      })
    }
  }

  // Quality insight (pick 1)
  if (agg.total_open_issues === 0 && agg.total_issues_30_days === 0) {
    insights.push({
      text: 'No disputes reported recently',
      category: 'quality',
      sentiment: 'positive',
      timeframe: 'Last 30 days',
    })
  } else if (agg.total_open_issues === 0 && agg.total_issues_30_days >= 1) {
    insights.push({
      text: `${agg.total_issues_30_days} dispute${agg.total_issues_30_days > 1 ? 's' : ''} raised, all resolved`,
      category: 'quality',
      sentiment: 'positive',
      timeframe: 'Last 30 days',
    })
  } else if (agg.total_open_issues >= 1) {
    insights.push({
      text: `${agg.total_open_issues} open dispute${agg.total_open_issues > 1 ? 's' : ''} across connections`,
      category: 'quality',
      sentiment: 'warning',
      timeframe: 'Current',
    })
  }

  return insights
}
