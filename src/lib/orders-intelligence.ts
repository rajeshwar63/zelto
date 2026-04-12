import type { EnrichedOrder } from '@/hooks/data/use-business-data'
import { formatInrCurrency } from './utils'

// ─── Types ──────────────────────────────────────────────────────────

export type SegmentType = 'new' | 'accepted' | 'dispatched' | 'delivered' | 'overdue' | 'paid'

export interface InsightLine {
  icon: string
  text: string
  priority: number // lower = higher priority
}

export interface IntelligenceSegment {
  type: SegmentType
  label: string
  count: number
  totalValue: number
  insights: InsightLine[]
  statusChip: string // maps to StatusChip for navigation
}

type Role = 'buying' | 'selling'

// ─── Helpers ────────────────────────────────────────────────────────

function extractItemName(itemSummary: string): string {
  return itemSummary.split(' - ')[0].trim()
}

function roundHours(ms: number): number {
  return Math.round(ms / 3600000)
}

// ─── Segment Builders ───────────────────────────────────────────────

function buildNewOrdersInsights(orders: EnrichedOrder[], role: Role, totalOrderCount: number): InsightLine[] {
  const insights: InsightLine[] = []
  const now = Date.now()

  if (role === 'selling') {
    // Concentration: >50% orders from 1 buyer
    if (orders.length > 1) {
      const buyerCounts = new Map<string, number>()
      orders.forEach(o => buyerCounts.set(o.connectionName, (buyerCounts.get(o.connectionName) || 0) + 1))
      const topBuyer = [...buyerCounts.entries()].sort((a, b) => b[1] - a[1])[0]
      const pct = Math.round((topBuyer[1] / orders.length) * 100)
      if (pct > 50) {
        insights.push({
          icon: '📊',
          text: `${topBuyer[1]} of ${orders.length} are from ${topBuyer[0]} — ${pct}% of your new order volume is from 1 buyer`,
          priority: 2,
        })
      }
    }

    // Stale orders: placed >48h ago
    const staleOrders = orders.filter(o => now - o.createdAt > 48 * 3600000)
    if (staleOrders.length > 0) {
      const hours = roundHours(now - Math.min(...staleOrders.map(o => o.createdAt)))
      insights.push({
        icon: '⏱',
        text: `${staleOrders.length} ${staleOrders.length === 1 ? 'order' : 'orders'} placed ${hours}h+ ago with no response — acceptance delay affects how buyers evaluate your reliability`,
        priority: 1,
      })
    } else {
      const allFresh = orders.every(o => now - o.createdAt < 24 * 3600000)
      if (allFresh && orders.length > 0 && totalOrderCount >= 5) {
        insights.push({
          icon: '✅',
          text: 'All orders received within 24h. You\'re responding fast.',
          priority: 4,
        })
      }
    }

    // Top items
    if (orders.length >= 2) {
      const itemCounts = new Map<string, number>()
      orders.forEach(o => {
        const item = extractItemName(o.itemSummary)
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1)
      })
      const topItems = [...itemCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
      if (topItems.length > 0 && topItems[0][1] > 1) {
        const itemStr = topItems.map(([name, count]) => `${name} (${count})`).join(', ')
        insights.push({
          icon: '📦',
          text: `Top items this week: ${itemStr}. Check stock levels.`,
          priority: 3,
        })
      }
    }
  } else {
    // Buying view
    const staleOrders = orders.filter(o => now - o.createdAt > 48 * 3600000)
    if (staleOrders.length > 0) {
      insights.push({
        icon: '⏱',
        text: `${staleOrders.length} ${staleOrders.length === 1 ? 'order' : 'orders'} still awaiting supplier acceptance after 48h`,
        priority: 1,
      })
    }

    // Multiple suppliers
    const supplierCounts = new Map<string, number>()
    orders.forEach(o => supplierCounts.set(o.connectionName, (supplierCounts.get(o.connectionName) || 0) + 1))
    if (supplierCounts.size > 1) {
      const topSupplier = [...supplierCounts.entries()].sort((a, b) => b[1] - a[1])[0]
      insights.push({
        icon: '📊',
        text: `Orders spread across ${supplierCounts.size} suppliers — ${topSupplier[0]} has ${topSupplier[1]} pending`,
        priority: 3,
      })
    }

    if (staleOrders.length === 0 && orders.length > 0 && totalOrderCount >= 5) {
      insights.push({
        icon: '✅',
        text: 'All recent orders accepted promptly — your suppliers are responsive',
        priority: 4,
      })
    }
  }

  return insights
}

function buildAcceptedInsights(orders: EnrichedOrder[], role: Role, totalOrderCount: number): InsightLine[] {
  const insights: InsightLine[] = []
  const now = Date.now()
  const totalValue = orders.reduce((sum, o) => sum + o.orderValue, 0)

  if (role === 'selling') {
    // Time thresholds
    const approaching48h = orders.filter(o => {
      const hours = (now - o.acceptedAt!) / 3600000
      return hours > 24 && hours <= 48
    })
    const past48h = orders.filter(o => (now - o.acceptedAt!) / 3600000 > 48)

    if (past48h.length > 0) {
      insights.push({
        icon: '⏱',
        text: `${past48h.length} past 48h dispatch window — buyers see slow response times on your profile`,
        priority: 1,
      })
    } else if (approaching48h.length > 0) {
      insights.push({
        icon: '⏱',
        text: `${approaching48h.length} approaching 48h threshold — dispatch soon to maintain your response time average`,
        priority: 1,
      })
    }

    // Bundling opportunity: 2+ orders same item
    const itemGroups = new Map<string, EnrichedOrder[]>()
    orders.forEach(o => {
      const item = extractItemName(o.itemSummary)
      if (!itemGroups.has(item)) itemGroups.set(item, [])
      itemGroups.get(item)!.push(o)
    })
    const bundleable = [...itemGroups.entries()].filter(([_, g]) => g.length >= 2)
    if (bundleable.length > 0) {
      const top = bundleable.sort((a, b) => b[1].length - a[1].length)[0]
      insights.push({
        icon: '🚚',
        text: `${top[1].length} orders share the same item (${top[0]}) — consider bundling dispatch`,
        priority: 3,
      })
    }

    // Average time in state
    if (orders.length > 0 && totalOrderCount >= 5) {
      const avgHours = Math.round(
        orders.reduce((sum, o) => sum + (now - o.acceptedAt!), 0) / orders.length / 3600000
      )
      insights.push({
        icon: '📊',
        text: `Average time in accepted: ${avgHours}h`,
        priority: 3,
      })
    }

    // Pipeline value
    insights.push({
      icon: '💰',
      text: `Once dispatched, ${formatInrCurrency(totalValue)} moves to in-transit pipeline`,
      priority: 4,
    })
  } else {
    // Buying view
    const supplierHeld = new Map<string, { count: number; maxHours: number }>()
    orders.forEach(o => {
      const hours = (now - o.acceptedAt!) / 3600000
      const existing = supplierHeld.get(o.connectionName) || { count: 0, maxHours: 0 }
      existing.count += 1
      existing.maxHours = Math.max(existing.maxHours, hours)
      supplierHeld.set(o.connectionName, existing)
    })

    const slowSuppliers = [...supplierHeld.entries()].filter(([_, v]) => v.maxHours > 48)
    if (slowSuppliers.length > 0) {
      const top = slowSuppliers.sort((a, b) => b[1].maxHours - a[1].maxHours)[0]
      insights.push({
        icon: '⏱',
        text: `${top[0]} has held ${top[1].count} ${top[1].count === 1 ? 'order' : 'orders'} for ${Math.round(top[1].maxHours)}h without dispatch`,
        priority: 1,
      })
    } else if (totalOrderCount >= 5) {
      insights.push({
        icon: '✅',
        text: 'All accepted orders within normal dispatch window',
        priority: 4,
      })
    }
  }

  return insights
}

function buildDispatchedInsights(orders: EnrichedOrder[], role: Role, totalOrderCount: number): InsightLine[] {
  const insights: InsightLine[] = []
  const now = Date.now()
  const totalValue = orders.reduce((sum, o) => sum + o.orderValue, 0)

  if (role === 'buying') {
    // Days in transit
    const longTransit = orders.filter(o => (now - o.dispatchedAt!) / 86400000 > 5)
    if (longTransit.length > 0) {
      const avgDays = Math.round(longTransit.reduce((sum, o) => sum + (now - o.dispatchedAt!), 0) / longTransit.length / 86400000)
      insights.push({
        icon: '📍',
        text: `${longTransit.length} ${longTransit.length === 1 ? 'order' : 'orders'} in transit for ${avgDays}+ days`,
        priority: 2,
      })
    } else if (totalOrderCount >= 5) {
      insights.push({
        icon: '✅',
        text: 'All shipments within normal delivery window',
        priority: 4,
      })
    }

    // Cash impact
    insights.push({
      icon: '💰',
      text: `Once delivered, ${formatInrCurrency(totalValue)} becomes collectible`,
      priority: 3,
    })
  } else {
    // Selling view
    const buyerCounts = new Map<string, number>()
    orders.forEach(o => buyerCounts.set(o.connectionName, (buyerCounts.get(o.connectionName) || 0) + 1))

    insights.push({
      icon: '🚚',
      text: `${formatInrCurrency(totalValue)} in transit to ${buyerCounts.size} ${buyerCounts.size === 1 ? 'buyer' : 'buyers'}`,
      priority: 3,
    })
  }

  return insights
}

function buildDeliveredInsights(orders: EnrichedOrder[], role: Role, totalOrderCount: number): InsightLine[] {
  const insights: InsightLine[] = []
  const now = Date.now()
  const totalPending = orders.reduce((sum, o) => sum + o.pendingAmount, 0)

  if (role === 'selling') {
    // Within terms vs past terms
    const withinTerms = orders.filter(o =>
      o.calculatedDueDate === null || o.calculatedDueDate >= now
    )
    const pastTerms = orders.filter(o =>
      o.calculatedDueDate !== null && o.calculatedDueDate < now
    )

    if (withinTerms.length > 0) {
      const dueThisWeek = orders.filter(o =>
        o.calculatedDueDate !== null && o.calculatedDueDate >= now && o.calculatedDueDate <= now + 7 * 86400000
      )
      const dueAmount = dueThisWeek.reduce((sum, o) => sum + o.pendingAmount, 0)
      if (dueThisWeek.length > 0) {
        insights.push({
          icon: '💰',
          text: `${withinTerms.length} of ${orders.length} within payment terms. ${formatInrCurrency(dueAmount)} due this week`,
          priority: 3,
        })
      } else {
        insights.push({
          icon: '💰',
          text: `${withinTerms.length} of ${orders.length} within payment terms`,
          priority: 3,
        })
      }
    }

    if (pastTerms.length > 0) {
      // Count unique buyers past terms
      const pastTermBuyers = new Set(pastTerms.map(o => o.connectionName))
      insights.push({
        icon: '⚠️',
        text: `${pastTermBuyers.size} ${pastTermBuyers.size === 1 ? 'buyer has' : 'buyers have'} crossed payment term window — follow up today`,
        priority: 1,
      })
    }

    // Concentration
    if (orders.length > 1) {
      const buyerPending = new Map<string, { amount: number; count: number }>()
      orders.forEach(o => {
        const existing = buyerPending.get(o.connectionName) || { amount: 0, count: 0 }
        existing.amount += o.pendingAmount
        existing.count += 1
        buyerPending.set(o.connectionName, existing)
      })
      const largestPending = [...buyerPending.entries()].sort((a, b) => b[1].amount - a[1].amount)[0]
      if (largestPending && largestPending[1].count > 1) {
        insights.push({
          icon: '🔗',
          text: `Largest pending: ${largestPending[0]} ${formatInrCurrency(largestPending[1].amount)} across ${largestPending[1].count} orders`,
          priority: 2,
        })
      }
    }
  } else {
    // Buying view
    const dueThisWeek = orders.filter(o =>
      o.calculatedDueDate !== null && o.calculatedDueDate >= now && o.calculatedDueDate <= now + 7 * 86400000
    )
    const pastDue = orders.filter(o =>
      o.calculatedDueDate !== null && o.calculatedDueDate < now
    )

    if (pastDue.length > 0) {
      insights.push({
        icon: '⚠️',
        text: `${pastDue.length} ${pastDue.length === 1 ? 'payment' : 'payments'} overdue — your payment reliability score is affected`,
        priority: 1,
      })
    }

    if (dueThisWeek.length > 0) {
      const dueAmount = dueThisWeek.reduce((sum, o) => sum + o.pendingAmount, 0)
      insights.push({
        icon: '💰',
        text: `${dueThisWeek.length} ${dueThisWeek.length === 1 ? 'payment' : 'payments'} due this week totalling ${formatInrCurrency(dueAmount)}`,
        priority: 2,
      })
    }

    if (pastDue.length === 0 && dueThisWeek.length === 0 && totalOrderCount >= 5) {
      insights.push({
        icon: '✅',
        text: 'All recent deliveries paid within terms',
        priority: 4,
      })
    }
  }

  return insights
}

function buildOverdueInsights(orders: EnrichedOrder[], role: Role, hasOpenIssues: boolean): InsightLine[] {
  const insights: InsightLine[] = []
  const now = Date.now()
  const totalOverdue = orders.reduce((sum, o) => sum + o.pendingAmount, 0)

  // Concentration
  if (orders.length > 1) {
    const overdueByCo = new Map<string, number>()
    orders.forEach(o => {
      overdueByCo.set(o.connectionName, (overdueByCo.get(o.connectionName) || 0) + o.pendingAmount)
    })
    const topOverdue = [...overdueByCo.entries()].sort((a, b) => b[1] - a[1])[0]
    const pct = Math.round((topOverdue[1] / totalOverdue) * 100)
    if (pct > 50) {
      insights.push({
        icon: '📊',
        text: `${topOverdue[0]} owes ${pct}% of total overdue — concentration risk is high`,
        priority: 1,
      })
    }
  }

  // Average delay
  const avgDelayDays = Math.round(
    orders.reduce((sum, o) => sum + (now - (o.calculatedDueDate || now)), 0) / orders.length / 86400000
  )
  insights.push({
    icon: '📈',
    text: `Average delay: ${avgDelayDays} ${avgDelayDays === 1 ? 'day' : 'days'}`,
    priority: 2,
  })

  // Disputes blocking
  const overdueWithIssues = orders.filter(o => o.hasOpenIssue)
  if (overdueWithIssues.length > 0) {
    insights.push({
      icon: '⚖️',
      text: `${overdueWithIssues.length} of ${orders.length} have open disputes — payment likely blocked until resolved`,
      priority: 1,
    })
  }

  return insights
}

function buildPaidInsights(orders: EnrichedOrder[], role: Role, totalOrderCount: number): InsightLine[] {
  const insights: InsightLine[] = []
  const totalCollected = orders.reduce((sum, o) => sum + o.orderValue, 0)

  if (role === 'selling') {
    // Most reliable buyer
    if (orders.length >= 2) {
      const buyerOrders = new Map<string, EnrichedOrder[]>()
      orders.forEach(o => {
        if (!buyerOrders.has(o.connectionName)) buyerOrders.set(o.connectionName, [])
        buyerOrders.get(o.connectionName)!.push(o)
      })
      const bestBuyer = [...buyerOrders.entries()]
        .filter(([_, os]) => os.length >= 2)
        .sort((a, b) => b[1].length - a[1].length)[0]
      if (bestBuyer) {
        insights.push({
          icon: '⭐',
          text: `Most reliable: ${bestBuyer[0]} — paid all ${bestBuyer[1].length} orders`,
          priority: 4,
        })
      }
    }

    insights.push({
      icon: '📈',
      text: `${formatInrCurrency(totalCollected)} collected this month`,
      priority: 3,
    })
  } else {
    // Buying view
    const supplierCount = new Set(orders.map(o => o.connectionName)).size
    insights.push({
      icon: '💰',
      text: `${formatInrCurrency(totalCollected)} settled this month across ${supplierCount} ${supplierCount === 1 ? 'supplier' : 'suppliers'}`,
      priority: 3,
    })
  }

  return insights
}

// ─── Main Computation ───────────────────────────────────────────────

function selectTopInsights(insights: InsightLine[], max: number): InsightLine[] {
  // Sort by priority (lower number = higher priority)
  const sorted = [...insights].sort((a, b) => a.priority - b.priority)

  // If there's a critical risk (priority 1), suppress positive insights (priority 4)
  const hasCritical = sorted.some(i => i.priority === 1)
  const filtered = hasCritical
    ? sorted.filter(i => i.priority < 4)
    : sorted

  return (filtered.length > 0 ? filtered : sorted).slice(0, max)
}

export function computeIntelligenceSegments(
  orders: EnrichedOrder[],
  role: Role,
): IntelligenceSegment[] {
  const now = Date.now()
  const segments: IntelligenceSegment[] = []
  const totalOrderCount = orders.length

  // Filter by role
  const roleOrders = role === 'buying'
    ? orders.filter(o => o.isBuyer)
    : orders.filter(o => !o.isBuyer)

  // Exclude declined
  const activeOrders = roleOrders.filter(o => !o.declinedAt)

  // ── Segment: New Orders ──
  const newOrders = activeOrders.filter(o => o.lifecycleState === 'Placed')
  if (newOrders.length > 0) {
    const insights = buildNewOrdersInsights(newOrders, role, totalOrderCount)
    segments.push({
      type: 'new',
      label: 'NEW ORDERS',
      count: newOrders.length,
      totalValue: newOrders.reduce((sum, o) => sum + o.orderValue, 0),
      insights: selectTopInsights(insights, 3),
      statusChip: 'new',
    })
  }

  // ── Segment: Accepted ──
  const acceptedOrders = activeOrders.filter(o => o.lifecycleState === 'Accepted')
  if (acceptedOrders.length > 0) {
    const insights = buildAcceptedInsights(acceptedOrders, role, totalOrderCount)
    segments.push({
      type: 'accepted',
      label: 'ACCEPTED',
      count: acceptedOrders.length,
      totalValue: acceptedOrders.reduce((sum, o) => sum + o.orderValue, 0),
      insights: selectTopInsights(insights, 3),
      statusChip: 'accepted',
    })
  }

  // ── Segment: Dispatched (In Transit) ──
  const dispatchedOrders = activeOrders.filter(o => o.lifecycleState === 'Dispatched')
  if (dispatchedOrders.length > 0) {
    const insights = buildDispatchedInsights(dispatchedOrders, role, totalOrderCount)
    segments.push({
      type: 'dispatched',
      label: 'IN TRANSIT',
      count: dispatchedOrders.length,
      totalValue: dispatchedOrders.reduce((sum, o) => sum + o.orderValue, 0),
      insights: selectTopInsights(insights, 3),
      statusChip: 'dispatched',
    })
  }

  // ── Segment: Delivered (awaiting payment) ──
  const deliveredUnpaid = activeOrders.filter(o =>
    o.lifecycleState === 'Delivered' && o.settlementState !== 'Paid' && o.pendingAmount > 0
  )
  if (deliveredUnpaid.length > 0) {
    const insights = buildDeliveredInsights(deliveredUnpaid, role, totalOrderCount)
    segments.push({
      type: 'delivered',
      label: 'DELIVERED — AWAITING PAYMENT',
      count: deliveredUnpaid.length,
      totalValue: deliveredUnpaid.reduce((sum, o) => sum + o.pendingAmount, 0),
      insights: selectTopInsights(insights, 3),
      statusChip: 'delivered',
    })
  }

  // ── Segment: Overdue ──
  const overdueOrders = activeOrders.filter(o =>
    o.pendingAmount > 0 &&
    o.calculatedDueDate !== null &&
    o.calculatedDueDate < now &&
    o.settlementState !== 'Paid'
  )
  if (overdueOrders.length > 0) {
    const hasOpenIssues = overdueOrders.some(o => o.hasOpenIssue)
    const insights = buildOverdueInsights(overdueOrders, role, hasOpenIssues)
    segments.push({
      type: 'overdue',
      label: 'OVERDUE',
      count: overdueOrders.length,
      totalValue: overdueOrders.reduce((sum, o) => sum + o.pendingAmount, 0),
      insights: selectTopInsights(insights, 3),
      statusChip: 'overdue',
    })
  }

  // ── Segment: Paid (this month) ──
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const paidThisMonth = activeOrders.filter(o => {
    if (o.settlementState !== 'Paid') return false
    // Use latestActivity as proxy for payment time
    return o.latestActivity >= monthStart.getTime()
  })
  if (paidThisMonth.length > 0) {
    const insights = buildPaidInsights(paidThisMonth, role, totalOrderCount)
    segments.push({
      type: 'paid',
      label: 'PAID THIS MONTH',
      count: paidThisMonth.length,
      totalValue: paidThisMonth.reduce((sum, o) => sum + o.orderValue, 0),
      insights: selectTopInsights(insights, 3),
      statusChip: 'paid',
    })
  }

  return segments
}
