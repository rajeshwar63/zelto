import { behaviourEngine } from './behaviour-engine'
import { attentionEngine } from './attention-engine'
import type {
  AllBehaviourSignals,
  SettlementBehaviourSignals,
  OperationalBehaviourSignals,
  QualityBehaviourSignals,
} from './behaviour-engine'
import type { ActiveFrictionSummary } from './attention-engine'

export type ViewerRole = 'buyer' | 'supplier'

export type InsightTemplate =
  | 'Payments usually on time'
  | 'Partial payments common'
  | 'Payments often completed in stages'
  | 'Delay increasing recently'
  | 'Stable payment rhythm'
  | 'Payments frequently overdue'
  | 'Dispatch timing consistent'
  | 'Acceptance slow recently'
  | 'Delivery timing reliable'
  | 'Dispatch delays observed'
  | 'Orders accepted quickly'
  | 'Issues reported recently'
  | 'Low issue frequency'
  | 'Recurring issues observed'
  | 'Issue rate increasing'
  | 'No issues reported recently'

const POSITIVE_SETTLEMENT_INSIGHTS: InsightTemplate[] = [
  'Payments usually on time',
  'Stable payment rhythm',
  'Payments often completed in stages',
]

const POSITIVE_OPERATIONAL_INSIGHTS: InsightTemplate[] = [
  'Orders accepted quickly',
  'Delivery timing reliable',
  'Dispatch timing consistent',
]

const POSITIVE_QUALITY_INSIGHTS: InsightTemplate[] = [
  'No issues reported recently',
  'Low issue frequency',
]

export class InsightEngine {
  private selectSettlementInsight(
    signals: SettlementBehaviourSignals
  ): InsightTemplate | null {
    if (signals.overdue_count >= 1) {
      return 'Payments frequently overdue'
    }

    if (signals.late_payment_count > signals.on_time_payment_count) {
      return 'Delay increasing recently'
    }

    if (
      signals.on_time_payment_count >= 3 &&
      signals.late_payment_count === 0
    ) {
      return 'Stable payment rhythm'
    }

    if (signals.partial_payment_count >= 2) {
      return 'Partial payments common'
    }

    if (
      signals.partial_payment_count >= 1 &&
      signals.on_time_payment_count > 0
    ) {
      return 'Payments often completed in stages'
    }

    if (
      signals.on_time_payment_count > signals.late_payment_count &&
      signals.overdue_count === 0
    ) {
      return 'Payments usually on time'
    }

    return null
  }

  private selectOperationalInsight(
    signals: OperationalBehaviourSignals,
    orderCount: number
  ): InsightTemplate | null {
    if (
      signals.avg_acceptance_delay !== null &&
      signals.avg_acceptance_delay > 48
    ) {
      return 'Acceptance slow recently'
    }

    if (
      signals.avg_dispatch_delay !== null &&
      signals.avg_dispatch_delay > 72
    ) {
      return 'Dispatch delays observed'
    }

    if (
      signals.avg_dispatch_delay !== null &&
      signals.avg_dispatch_delay < 24 &&
      orderCount >= 3
    ) {
      return 'Dispatch timing consistent'
    }

    if (
      signals.delivery_consistency !== null &&
      signals.delivery_consistency >= 90 &&
      orderCount >= 3
    ) {
      return 'Delivery timing reliable'
    }

    if (
      signals.avg_acceptance_delay !== null &&
      signals.avg_acceptance_delay < 4 &&
      orderCount >= 3
    ) {
      return 'Orders accepted quickly'
    }

    return null
  }

  private selectQualityInsight(
    signals: QualityBehaviourSignals
  ): InsightTemplate | null {
    if (signals.total_open_issues >= 1) {
      return 'Issues reported recently'
    }

    if (signals.recurring_issue_types.length >= 1) {
      return 'Recurring issues observed'
    }

    if (signals.total_issues_30_days > 3) {
      return 'Issue rate increasing'
    }

    if (signals.total_issues_30_days === 0) {
      return 'No issues reported recently'
    }

    if (
      (signals.total_issues_30_days === 1 || signals.total_issues_30_days === 2) &&
      signals.total_open_issues === 0
    ) {
      return 'Low issue frequency'
    }

    return null
  }

  private isPositiveInsight(insight: InsightTemplate): boolean {
    return (
      POSITIVE_SETTLEMENT_INSIGHTS.includes(insight) ||
      POSITIVE_OPERATIONAL_INSIGHTS.includes(insight) ||
      POSITIVE_QUALITY_INSIGHTS.includes(insight)
    )
  }

  private shouldSuppressInsight(
    insight: InsightTemplate,
    frictionSummary: ActiveFrictionSummary
  ): boolean {
    if (POSITIVE_SETTLEMENT_INSIGHTS.includes(insight)) {
      return frictionSummary.hasSettlementFriction
    }

    if (POSITIVE_OPERATIONAL_INSIGHTS.includes(insight)) {
      return frictionSummary.hasOperationalFriction
    }

    if (POSITIVE_QUALITY_INSIGHTS.includes(insight)) {
      return frictionSummary.hasQualityFriction
    }

    return false
  }

  private async selectInsightsInternal(
    connectionId: string,
    viewerRole: ViewerRole
  ): Promise<InsightTemplate[]> {
    const signals = await behaviourEngine.computeAllSignals(connectionId)
    const frictionSummary = await attentionEngine.getActiveFrictionSummary(
      connectionId
    )

    const settlementInsight = this.selectSettlementInsight(
      signals.settlement.medium
    )
    const operationalInsight = this.selectOperationalInsight(
      signals.operational,
      signals.settlement.medium.orders_created_recently +
        signals.settlement.short.orders_created_recently
    )
    const qualityInsight = this.selectQualityInsight(signals.quality)

    const candidateInsights: InsightTemplate[] = []

    if (settlementInsight) {
      candidateInsights.push(settlementInsight)
    }
    if (operationalInsight) {
      candidateInsights.push(operationalInsight)
    }
    if (qualityInsight) {
      candidateInsights.push(qualityInsight)
    }

    const ungatedInsights = candidateInsights.filter(
      (insight) => !this.shouldSuppressInsight(insight, frictionSummary)
    )

    if (ungatedInsights.length <= 2) {
      return ungatedInsights
    }

    if (viewerRole === 'buyer') {
      const settlement = ungatedInsights.find((i) =>
        POSITIVE_SETTLEMENT_INSIGHTS.includes(i) ||
        [
          'Delay increasing recently',
          'Payments frequently overdue',
          'Partial payments common',
        ].includes(i)
      )
      const nonSettlement = ungatedInsights.find(
        (i) =>
          !(
            POSITIVE_SETTLEMENT_INSIGHTS.includes(i) ||
            [
              'Delay increasing recently',
              'Payments frequently overdue',
              'Partial payments common',
            ].includes(i)
          )
      )

      if (settlement && nonSettlement) {
        return [settlement, nonSettlement]
      }
      return ungatedInsights.slice(0, 2)
    }

    if (viewerRole === 'supplier') {
      const operational = ungatedInsights.find(
        (i) =>
          POSITIVE_OPERATIONAL_INSIGHTS.includes(i) ||
          ['Acceptance slow recently', 'Dispatch delays observed'].includes(i)
      )
      const quality = ungatedInsights.find(
        (i) =>
          POSITIVE_QUALITY_INSIGHTS.includes(i) ||
          [
            'Issues reported recently',
            'Recurring issues observed',
            'Issue rate increasing',
          ].includes(i)
      )

      if (operational && quality) {
        return [operational, quality]
      }

      if (operational) {
        const other = ungatedInsights.find((i) => i !== operational)
        if (other) {
          return [operational, other]
        }
      }

      if (quality) {
        const other = ungatedInsights.find((i) => i !== quality)
        if (other) {
          return [quality, other]
        }
      }

      return ungatedInsights.slice(0, 2)
    }

    return ungatedInsights.slice(0, 2)
  }

  async getInsightsForConnection(
    connectionId: string,
    viewerRole: ViewerRole
  ): Promise<InsightTemplate[]> {
    return this.selectInsightsInternal(connectionId, viewerRole)
  }

  getAllInsightTemplates(): InsightTemplate[] {
    return [
      'Payments usually on time',
      'Partial payments common',
      'Payments often completed in stages',
      'Delay increasing recently',
      'Stable payment rhythm',
      'Payments frequently overdue',
      'Dispatch timing consistent',
      'Acceptance slow recently',
      'Delivery timing reliable',
      'Dispatch delays observed',
      'Orders accepted quickly',
      'Issues reported recently',
      'Low issue frequency',
      'Recurring issues observed',
      'Issue rate increasing',
      'No issues reported recently',
    ]
  }
}

export const insightEngine = new InsightEngine()
