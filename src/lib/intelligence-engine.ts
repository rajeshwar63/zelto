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

  async getCashForecast(_businessId: string): Promise<CashForecast> {
    return { inflows: [], outflows: [], netThisWeek: 0, netNextWeek: 0 }
  }

  async getCreditRiskSignals(_businessId: string): Promise<CreditRiskSignal[]> {
    return []
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
