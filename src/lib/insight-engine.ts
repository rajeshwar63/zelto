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

export type InsightText = string

export interface Insight {
  text: InsightText
  category: 'settlement' | 'operational' | 'quality'
  sentiment: 'positive' | 'negative' | 'neutral'
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`
}

function roundHours(hours: number | null): string {
  if (hours === null) return 'unknown'
  if (hours < 1) return 'under 1 hour'
  return `${Math.round(hours)} hours`
}

export class InsightEngine {
  private selectSettlementInsight(
    signals: SettlementBehaviourSignals,
    shortSignals: SettlementBehaviourSignals
  ): Insight | null {
    if (signals.overdue_count >= 1) {
      let text = `${signals.overdue_count} ${plural(signals.overdue_count, 'payment')} overdue.`
      if (shortSignals.late_payment_count > signals.late_payment_count / 2) {
        text += ' Pattern is worsening.'
      } else if (shortSignals.late_payment_count === 0 && signals.overdue_count >= 1) {
        text += ' Showing signs of improvement.'
      }
      return { text, category: 'settlement', sentiment: 'negative' }
    }

    const total = signals.on_time_payment_count + signals.late_payment_count

    if (signals.late_payment_count > signals.on_time_payment_count) {
      return {
        text: `${signals.late_payment_count} of ${total} payments were late. Delays are increasing.`,
        category: 'settlement',
        sentiment: 'negative',
      }
    }

    if (signals.on_time_payment_count >= 3 && signals.late_payment_count === 0) {
      return {
        text: `All ${signals.on_time_payment_count} recent payments on time. Reliable payment history.`,
        category: 'settlement',
        sentiment: 'positive',
      }
    }

    if (signals.partial_payment_count >= 2) {
      return {
        text: `Payments usually split across multiple transactions — ${signals.partial_payment_count} partial payments recorded.`,
        category: 'settlement',
        sentiment: 'neutral',
      }
    }

    if (signals.partial_payment_count >= 1 && signals.on_time_payment_count > 0) {
      return {
        text: `Mix of partial and full payments. ${signals.on_time_payment_count} paid in full, ${signals.partial_payment_count} in stages.`,
        category: 'settlement',
        sentiment: 'neutral',
      }
    }

    if (signals.on_time_payment_count > signals.late_payment_count && signals.overdue_count === 0) {
      return {
        text: `Payments mostly on time — ${signals.on_time_payment_count} on time vs ${signals.late_payment_count} late.`,
        category: 'settlement',
        sentiment: 'positive',
      }
    }

    return null
  }

  private selectOperationalInsight(
    signals: OperationalBehaviourSignals,
    orderCount: number
  ): Insight | null {
    if (signals.avg_acceptance_delay !== null && signals.avg_acceptance_delay > 48) {
      return {
        text: `Orders are taking ${roundHours(signals.avg_acceptance_delay)} on average to be accepted — slower than expected.`,
        category: 'operational',
        sentiment: 'negative',
      }
    }

    if (signals.avg_dispatch_delay !== null && signals.avg_dispatch_delay > 72) {
      return {
        text: `Average dispatch time is ${roundHours(signals.avg_dispatch_delay)} after acceptance.`,
        category: 'operational',
        sentiment: 'negative',
      }
    }

    if (signals.avg_dispatch_delay !== null && signals.avg_dispatch_delay < 24 && orderCount >= 3) {
      return {
        text: `Dispatching within ${roundHours(signals.avg_dispatch_delay)} on average. Consistently fast.`,
        category: 'operational',
        sentiment: 'positive',
      }
    }

    if (signals.delivery_consistency !== null && signals.delivery_consistency >= 90 && orderCount >= 3) {
      return {
        text: `${signals.delivery_consistency}% of orders delivered on time. Strong delivery record.`,
        category: 'operational',
        sentiment: 'positive',
      }
    }

    if (signals.avg_acceptance_delay !== null && signals.avg_acceptance_delay < 4 && orderCount >= 3) {
      return {
        text: `Orders accepted within ${roundHours(signals.avg_acceptance_delay)} on average. Very responsive.`,
        category: 'operational',
        sentiment: 'positive',
      }
    }

    return null
  }

  private selectQualityInsight(signals: QualityBehaviourSignals): Insight | null {
    if (signals.total_open_issues >= 1) {
      let text = `${signals.total_open_issues} open ${plural(signals.total_open_issues, 'issue')} on this connection.`
      if (signals.recurring_issue_types.length >= 1) {
        text += ` Most common: ${signals.recurring_issue_types[0]}.`
      }
      return { text, category: 'quality', sentiment: 'negative' }
    }

    if (signals.recurring_issue_types.length >= 1) {
      return {
        text: `${signals.recurring_issue_types[0]} issues are recurring — reported multiple times in the last 30 days.`,
        category: 'quality',
        sentiment: 'negative',
      }
    }

    if (signals.total_issues_30_days > 3) {
      return {
        text: `${signals.total_issues_30_days} issues raised in the last 30 days — frequency is high.`,
        category: 'quality',
        sentiment: 'negative',
      }
    }

    if (signals.total_issues_30_days === 0) {
      return {
        text: 'No issues reported in the last 30 days. Clean record.',
        category: 'quality',
        sentiment: 'positive',
      }
    }

    if (signals.total_issues_30_days <= 2 && signals.total_open_issues === 0) {
      return {
        text: `${signals.total_issues_30_days} minor ${plural(signals.total_issues_30_days, 'issue')} last month, all resolved.`,
        category: 'quality',
        sentiment: 'neutral',
      }
    }

    return null
  }

  private shouldSuppressInsight(
    insight: Insight,
    frictionSummary: ActiveFrictionSummary
  ): boolean {
    if (insight.sentiment !== 'positive') return false

    if (insight.category === 'settlement') return frictionSummary.hasSettlementFriction
    if (insight.category === 'operational') return frictionSummary.hasOperationalFriction
    if (insight.category === 'quality') return frictionSummary.hasQualityFriction

    return false
  }

  private async selectInsightsInternal(
    connectionId: string,
    viewerRole: ViewerRole
  ): Promise<Insight[]> {
    const signals = await behaviourEngine.computeAllSignals(connectionId)
    const frictionSummary = await attentionEngine.getActiveFrictionSummary(connectionId)

    const settlementInsight = this.selectSettlementInsight(
      signals.settlement.medium,
      signals.settlement.short
    )
    const operationalInsight = this.selectOperationalInsight(
      signals.operational,
      signals.settlement.medium.orders_created_recently +
        signals.settlement.short.orders_created_recently
    )
    const qualityInsight = this.selectQualityInsight(signals.quality)

    const candidateInsights: Insight[] = []

    if (settlementInsight) candidateInsights.push(settlementInsight)
    if (operationalInsight) candidateInsights.push(operationalInsight)
    if (qualityInsight) candidateInsights.push(qualityInsight)

    const ungatedInsights = candidateInsights.filter(
      (insight) => !this.shouldSuppressInsight(insight, frictionSummary)
    )

    if (ungatedInsights.length <= 2) {
      return ungatedInsights
    }

    if (viewerRole === 'buyer') {
      const settlement = ungatedInsights.find((i) => i.category === 'settlement')
      const nonSettlement = ungatedInsights.find((i) => i.category !== 'settlement')

      if (settlement && nonSettlement) {
        return [settlement, nonSettlement]
      }
      return ungatedInsights.slice(0, 2)
    }

    if (viewerRole === 'supplier') {
      const operational = ungatedInsights.find((i) => i.category === 'operational')
      const quality = ungatedInsights.find((i) => i.category === 'quality')

      if (operational && quality) {
        return [operational, quality]
      }

      if (operational) {
        const other = ungatedInsights.find((i) => i !== operational)
        if (other) return [operational, other]
      }

      if (quality) {
        const other = ungatedInsights.find((i) => i !== quality)
        if (other) return [quality, other]
      }

      return ungatedInsights.slice(0, 2)
    }

    return ungatedInsights.slice(0, 2)
  }

  async getInsightsForConnection(
    connectionId: string,
    viewerRole: ViewerRole
  ): Promise<Insight[]> {
    return this.selectInsightsInternal(connectionId, viewerRole)
  }

  getAllInsightTemplates(): Insight[] {
    // Templates are no longer static — dynamic insights are computed per connection.
    return []
  }
}

export const insightEngine = new InsightEngine()
