import { dataStore } from './data-store'
import { behaviourEngine } from './behaviour-engine'
import { computeTrustScore } from './trust-score'
import type { OrderWithPaymentState } from './types'

// ─── Types ──────────────────────────────────────────────────────────

export interface CollectionItem {
  connectionId: string
  businessName: string
  zeltoId: string
  overdueAmount: number
  daysOverdue: number
  priorityScore: number
  patternSignal: 'worsening' | 'stable' | 'improving' | 'first_late'
  patternDetail: string
  totalOutstanding: number
  buyerTrustScore: number | null
}

export interface CashForecastBucket {
  label: string
  amount: number
  orderCount: number
  detail: string
}

export interface CashForecast {
  inflows: CashForecastBucket[]
  outflows: CashForecastBucket[]
  netThisWeek: number
  netNextWeek: number
}

export interface CreditRiskSignal {
  connectionId: string
  businessName: string
  currentAvgPayDays: number | null
  previousAvgPayDays: number | null
  trend: 'worsening' | 'stable' | 'improving' | 'insufficient_data'
  currentOverdue: number
  totalOrders: number
}

export interface DispatchIntelItem {
  orderId: string
  connectionId: string
  connectionName: string
  orderValue: number
  itemSummary: string
  hoursSinceAcceptance: number
  urgency: 'urgent' | 'high' | 'normal'
  reason: string
  qualityWarning: boolean
  qualityDetail: string | null
  trustScoreImpact: string | null
}

export interface PaymentCalendarItem {
  orderId: string
  connectionId: string
  supplierName: string
  amount: number
  dueDate: number
  daysUntilDue: number
  trustScoreIfOnTime: number | null
  trustScoreIfLate: number | null
  badgeIfOnTime: string | null
  badgeIfLate: string | null
}

export interface SupplierRanking {
  connectionId: string
  supplierName: string
  deliveryConsistency: number | null
  avgAcceptanceHours: number | null
  avgDispatchHours: number | null
  issuesLast30Days: number
  totalOrders: number
  overallScore: number
}

export interface ReorderAlert {
  connectionId: string
  supplierName: string
  medianCycleDays: number
  daysSinceLastOrder: number
  isOverdue: boolean
  avgOrderValue: number
  lastOrderDate: number
}

export interface ConcentrationRisk {
  type: 'receivable' | 'payable'
  topConnectionId: string
  topBusinessName: string
  percentage: number
  totalValue: number
  topValue: number
}

export interface CoachAction {
  action: string
  estimatedPoints: number
  pillar: 'identity' | 'activity' | 'tradeRecord'
  subCategory: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface TrustScoreCoach {
  currentScore: number
  currentBadge: string
  nextBadgeThreshold: number
  pointsToNextBadge: number
  actions: CoachAction[]
  percentile: number | null
}

export interface BenchmarkMetric {
  label: string
  yourValue: number
  networkAvg: number
  unit: string
  sentiment: 'better' | 'worse' | 'same'
}

export interface BusinessBenchmark {
  metrics: BenchmarkMetric[]
  gaps: Array<{ metric: string; yourValue: number; avgValue: number; suggestion: string }>
}

// ─── Intelligence Engine ────────────────────────────────────────────

export class IntelligenceEngine {
  async getCollectionPriority(businessId: string): Promise<CollectionItem[]> {
    // Get all connections where this business is the supplier
    const allConnections = await dataStore.getAllConnections()
    const supplierConnections = allConnections.filter(
      (c) => c.supplierBusinessId === businessId
    )

    const results = await Promise.all(
      supplierConnections.map(async (connection) => {
        // Get buyer entity for name
        const buyer = await dataStore.getBusinessEntityById(connection.buyerBusinessId)
        if (!buyer) return null

        // Get orders with payment state for this connection
        const orders = await dataStore.getOrdersWithPaymentStateByConnectionId(connection.id)

        // Filter to overdue (Pending) or partial payment orders
        const overdueOrders = orders.filter(
          (o) => o.settlementState === 'Pending' || o.settlementState === 'Partial Payment'
        )

        if (overdueOrders.length === 0) return null

        // Get behaviour signals
        const signals = await behaviourEngine.computeAllSignals(connection.id)

        // Calculate overdueAmount = sum of pendingAmount for overdue orders
        const overdueAmount = overdueOrders.reduce((sum, o) => sum + o.pendingAmount, 0)

        // Calculate totalOutstanding
        const totalOutstanding = orders
          .filter((o) => o.settlementState !== 'Paid')
          .reduce((sum, o) => sum + o.pendingAmount, 0)

        // Calculate daysOverdue = max of days past due across overdue orders
        const now = Date.now()
        const daysOverdue = Math.max(
          ...overdueOrders.map((o) => {
            if (o.calculatedDueDate === null) return 0
            const diff = now - o.calculatedDueDate
            return diff > 0 ? diff / (1000 * 60 * 60 * 24) : 0
          })
        )

        // Determine patternSignal
        const shortLate = signals.settlement.short.late_payment_count
        const mediumLate = signals.settlement.medium.late_payment_count
        const mediumOnTime = signals.settlement.medium.on_time_payment_count

        let patternSignal: CollectionItem['patternSignal']
        if (shortLate > mediumLate / 2) {
          patternSignal = 'worsening'
        } else if (shortLate === 0 && mediumLate > 0) {
          patternSignal = 'improving'
        } else if (mediumLate === 1 && mediumOnTime >= 3) {
          patternSignal = 'first_late'
        } else {
          patternSignal = 'stable'
        }

        // Build patternDetail
        let patternDetail: string
        if (patternSignal === 'worsening') {
          patternDetail = `${shortLate} late in 7d, ${mediumLate} in 30d`
        } else if (patternSignal === 'improving') {
          patternDetail = `No recent late payments, was ${mediumLate} in 30d`
        } else if (patternSignal === 'first_late') {
          patternDetail = 'Usually on time'
        } else {
          patternDetail = `${mediumOnTime} on-time, ${mediumLate} late in 30d`
        }

        // Calculate priorityScore
        const riskMultiplier: Record<CollectionItem['patternSignal'], number> = {
          worsening: 2.0,
          first_late: 1.5,
          stable: 1.0,
          improving: 0.7,
        }
        const priorityScore = (overdueAmount / 10000) * daysOverdue * riskMultiplier[patternSignal]

        // Get buyer trust score
        let buyerTrustScore: number | null = null
        try {
          const trustBreakdown = await computeTrustScore(connection.buyerBusinessId)
          buyerTrustScore = trustBreakdown.total
        } catch {
          buyerTrustScore = null
        }

        return {
          connectionId: connection.id,
          businessName: buyer.businessName,
          zeltoId: buyer.zeltoId,
          overdueAmount,
          daysOverdue: Math.round(daysOverdue),
          priorityScore,
          patternSignal,
          patternDetail,
          totalOutstanding,
          buyerTrustScore,
        } satisfies CollectionItem
      })
    )

    // Filter out nulls, sort by priorityScore DESC, return top 10
    return results
      .filter((item): item is CollectionItem => item !== null)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 10)
  }

  // ─── Stub methods ───────────────────────────────────────────────

  async getCashForecast(businessId: string): Promise<CashForecast> {
    const allConnections = await dataStore.getAllConnections()

    const supplierConnections = allConnections.filter(
      (c) => c.supplierBusinessId === businessId
    )
    const buyerConnections = allConnections.filter(
      (c) => c.buyerBusinessId === businessId
    )

    const now = Date.now()

    // Inflow accumulators
    const inflowThisWeek = { amount: 0, count: 0 }
    const inflowNextWeek = { amount: 0, count: 0 }
    const inflowUncertain = { amount: 0, count: 0 }

    // INFLOWS (business is supplier)
    for (const connection of supplierConnections) {
      const orders = await dataStore.getOrdersWithPaymentStateByConnectionId(connection.id)
      const orderIds = orders.map((o) => o.id)
      const allPayments = await dataStore.getPaymentEventsByOrderIds(orderIds)

      // Get completed (Paid + Delivered) orders for historical patterns
      const paidDeliveredOrders = orders.filter(
        (o) => o.settlementState === 'Paid' && o.deliveredAt
      )

      // Calculate average payment lag from history
      const paymentLags: number[] = []
      for (const paidOrder of paidDeliveredOrders) {
        const payments = allPayments.filter((p) => p.orderId === paidOrder.id)
        if (payments.length > 0 && paidOrder.deliveredAt) {
          const lastPaymentTime = Math.max(...payments.map((p) => p.timestamp))
          const lagDays = (lastPaymentTime - paidOrder.deliveredAt) / 86400000
          paymentLags.push(lagDays)
        }
      }

      let avgPaymentLagDays: number | null = null
      if (paymentLags.length > 0) {
        avgPaymentLagDays =
          paymentLags.reduce((sum, l) => sum + l, 0) / paymentLags.length
      }

      // Fallback to payment terms days
      if (
        avgPaymentLagDays === null &&
        connection.paymentTerms?.type === 'Days After Delivery'
      ) {
        avgPaymentLagDays = connection.paymentTerms.days
      }

      // Calculate average delivery days from history
      const deliveryDurations: number[] = []
      for (const order of orders) {
        if (order.deliveredAt && order.dispatchedAt) {
          deliveryDurations.push(
            (order.deliveredAt - order.dispatchedAt) / 86400000
          )
        }
      }
      const avgDeliveryDays =
        deliveryDurations.length > 0
          ? deliveryDurations.reduce((sum, d) => sum + d, 0) /
            deliveryDurations.length
          : 3

      const hasEnoughHistory = paymentLags.length >= 2

      // Process open orders (not Paid, not Declined)
      const openOrders = orders.filter(
        (o) => o.settlementState !== 'Paid' && !o.declinedAt
      )

      for (const order of openOrders) {
        let expectedPayDate: number | null = null

        if (order.deliveredAt) {
          // Delivered order
          const lagDays = avgPaymentLagDays ?? 30
          expectedPayDate = order.deliveredAt + lagDays * 86400000
        } else if (order.dispatchedAt || order.acceptedAt) {
          // Dispatched or Accepted
          const lagDays = avgPaymentLagDays ?? 30
          expectedPayDate =
            now + avgDeliveryDays * 86400000 + lagDays * 86400000
        } else {
          // Placed: skip (too uncertain)
          continue
        }

        const daysFromNow = (expectedPayDate - now) / 86400000

        if (!hasEnoughHistory || daysFromNow > 14) {
          inflowUncertain.amount += order.pendingAmount
          inflowUncertain.count++
        } else if (daysFromNow <= 7) {
          inflowThisWeek.amount += order.pendingAmount
          inflowThisWeek.count++
        } else {
          inflowNextWeek.amount += order.pendingAmount
          inflowNextWeek.count++
        }
      }
    }

    // Outflow accumulators
    const outflowThisWeek = { amount: 0, count: 0 }
    const outflowNextWeek = { amount: 0, count: 0 }

    // OUTFLOWS (business is buyer)
    for (const connection of buyerConnections) {
      const orders = await dataStore.getOrdersWithPaymentStateByConnectionId(
        connection.id
      )
      const openOrders = orders.filter(
        (o) => o.settlementState !== 'Paid' && !o.declinedAt
      )

      for (const order of openOrders) {
        if (order.calculatedDueDate === null) continue

        const daysFromNow = (order.calculatedDueDate - now) / 86400000

        if (daysFromNow <= 0) {
          // Overdue → include in thisWeek
          outflowThisWeek.amount += order.pendingAmount
          outflowThisWeek.count++
        } else if (daysFromNow <= 7) {
          outflowThisWeek.amount += order.pendingAmount
          outflowThisWeek.count++
        } else if (daysFromNow <= 14) {
          outflowNextWeek.amount += order.pendingAmount
          outflowNextWeek.count++
        }
      }
    }

    // Build inflow buckets
    const inflows: CashForecastBucket[] = []
    if (inflowThisWeek.count > 0) {
      inflows.push({
        label: 'This Week',
        amount: inflowThisWeek.amount,
        orderCount: inflowThisWeek.count,
        detail: `${inflowThisWeek.count} order${inflowThisWeek.count > 1 ? 's' : ''} expected this week`,
      })
    }
    if (inflowNextWeek.count > 0) {
      inflows.push({
        label: 'Next Week',
        amount: inflowNextWeek.amount,
        orderCount: inflowNextWeek.count,
        detail: `${inflowNextWeek.count} order${inflowNextWeek.count > 1 ? 's' : ''} expected next week`,
      })
    }
    if (inflowUncertain.count > 0) {
      inflows.push({
        label: 'Uncertain',
        amount: inflowUncertain.amount,
        orderCount: inflowUncertain.count,
        detail: `${inflowUncertain.count} order${inflowUncertain.count > 1 ? 's' : ''} with uncertain timing`,
      })
    }

    // Build outflow buckets
    const outflows: CashForecastBucket[] = []
    if (outflowThisWeek.count > 0) {
      outflows.push({
        label: 'This Week',
        amount: outflowThisWeek.amount,
        orderCount: outflowThisWeek.count,
        detail: `${outflowThisWeek.count} payment${outflowThisWeek.count > 1 ? 's' : ''} due this week`,
      })
    }
    if (outflowNextWeek.count > 0) {
      outflows.push({
        label: 'Next Week',
        amount: outflowNextWeek.amount,
        orderCount: outflowNextWeek.count,
        detail: `${outflowNextWeek.count} payment${outflowNextWeek.count > 1 ? 's' : ''} due next week`,
      })
    }

    return {
      inflows,
      outflows,
      netThisWeek: inflowThisWeek.amount - outflowThisWeek.amount,
      netNextWeek: inflowNextWeek.amount - outflowNextWeek.amount,
    }
  }

  async getCreditRiskSignals(businessId: string): Promise<CreditRiskSignal[]> {
    // Get all connections where business is supplier
    const allConnections = await dataStore.getAllConnections()
    const supplierConnections = allConnections.filter(
      (c) => c.supplierBusinessId === businessId
    )

    const now = Date.now()
    const THIRTY_DAYS_MS = 30 * 86400000
    const NINETY_DAYS_MS = 90 * 86400000

    const signals: CreditRiskSignal[] = []

    for (const connection of supplierConnections) {
      // Get all orders with payment state
      const orders = await dataStore.getOrdersWithPaymentStateByConnectionId(
        connection.id
      )
      const orderIds = orders.map((o) => o.id)
      const allPayments = await dataStore.getPaymentEventsByOrderIds(orderIds)

      // Filter to delivered + paid orders only (for calculating actual payment timing)
      const deliveredPaidOrders = orders
        .filter((o) => o.settlementState === 'Paid' && o.deliveredAt)
        .sort((a, b) => (a.deliveredAt ?? 0) - (b.deliveredAt ?? 0))

      // Split into "recent" (delivered in last 30 days) and "previous" (31-90 days ago)
      const recentOrders = deliveredPaidOrders.filter(
        (o) => o.deliveredAt! >= now - THIRTY_DAYS_MS
      )
      const previousOrders = deliveredPaidOrders.filter(
        (o) =>
          o.deliveredAt! >= now - NINETY_DAYS_MS &&
          o.deliveredAt! < now - THIRTY_DAYS_MS
      )

      // Calculate average payment days for a group of orders
      const calcAvgPayDays = (
        groupOrders: OrderWithPaymentState[]
      ): number | null => {
        const payDaysList: number[] = []
        for (const order of groupOrders) {
          const payments = allPayments.filter((p) => p.orderId === order.id)
          if (payments.length > 0 && order.deliveredAt) {
            const lastPaymentTime = Math.max(
              ...payments.map((p) => p.timestamp)
            )
            const payDays = (lastPaymentTime - order.deliveredAt) / 86400000
            payDaysList.push(payDays)
          }
        }
        if (payDaysList.length === 0) return null
        return payDaysList.reduce((sum, d) => sum + d, 0) / payDaysList.length
      }

      const currentAvgPayDays = calcAvgPayDays(recentOrders)
      const previousAvgPayDays = calcAvgPayDays(previousOrders)

      // Determine trend
      let trend: CreditRiskSignal['trend']
      if (recentOrders.length < 2 || previousOrders.length < 2) {
        trend = 'insufficient_data'
      } else if (
        currentAvgPayDays !== null &&
        previousAvgPayDays !== null &&
        currentAvgPayDays > previousAvgPayDays * 1.3
      ) {
        trend = 'worsening'
      } else if (
        currentAvgPayDays !== null &&
        previousAvgPayDays !== null &&
        currentAvgPayDays < previousAvgPayDays * 0.8
      ) {
        trend = 'improving'
      } else {
        trend = 'stable'
      }

      // Calculate currentOverdue from orders with settlementState 'Pending'
      const currentOverdue = orders
        .filter((o) => o.settlementState === 'Pending')
        .reduce((sum, o) => sum + o.pendingAmount, 0)

      // Only return connections where trend === 'worsening' OR currentOverdue > 0
      if (trend !== 'worsening' && currentOverdue <= 0) continue

      // Get buyer business name for display
      const buyer = await dataStore.getBusinessEntityById(
        connection.buyerBusinessId
      )
      const businessName = buyer?.businessName ?? 'Unknown'

      signals.push({
        connectionId: connection.id,
        businessName,
        currentAvgPayDays,
        previousAvgPayDays,
        trend,
        currentOverdue,
        totalOrders: orders.length,
      })
    }

    // Sort: worsening first, then by currentOverdue DESC
    return signals.sort((a, b) => {
      if (a.trend === 'worsening' && b.trend !== 'worsening') return -1
      if (a.trend !== 'worsening' && b.trend === 'worsening') return 1
      return b.currentOverdue - a.currentOverdue
    })
  }

  async getDispatchIntelligence(_businessId: string): Promise<DispatchIntelItem[]> {
    return []
  }

  async getPaymentCalendar(_businessId: string): Promise<PaymentCalendarItem[]> {
    return []
  }

  async getSupplierRankings(_businessId: string): Promise<SupplierRanking[]> {
    return []
  }

  async getReorderAlerts(_businessId: string): Promise<ReorderAlert[]> {
    return []
  }

  async getConcentrationRisk(_businessId: string): Promise<ConcentrationRisk[]> {
    return []
  }

  async getTrustScoreCoach(_businessId: string): Promise<TrustScoreCoach> {
    return {
      currentScore: 0,
      currentBadge: 'none',
      nextBadgeThreshold: 20,
      pointsToNextBadge: 20,
      actions: [],
      percentile: null,
    }
  }

  async getBusinessBenchmark(_businessId: string): Promise<BusinessBenchmark> {
    return { metrics: [], gaps: [] }
  }
}

export const intelligenceEngine = new IntelligenceEngine()
