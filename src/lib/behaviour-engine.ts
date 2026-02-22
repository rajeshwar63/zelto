import { dataStore } from './data-store'
import {
  Connection,
  ConnectionState,
  IssueReport,
  IssueType,
  OrderWithPaymentState,
} from './types'

export type TimeWindow = 'short' | 'medium'

const WINDOW_DURATIONS = {
  short: 7 * 24 * 60 * 60 * 1000,
  medium: 30 * 24 * 60 * 60 * 1000,
}

export interface SettlementBehaviourSignals {
  on_time_payment_count: number
  late_payment_count: number
  partial_payment_count: number
  overdue_count: number
  unpaid_count: number
  orders_created_recently: number
}

export interface OperationalBehaviourSignals {
  avg_acceptance_delay: number | null
  avg_dispatch_delay: number | null
  delivery_consistency: number | null
  orders_awaiting_acceptance: number
  orders_awaiting_dispatch: number
}

export interface QualityBehaviourSignals {
  total_open_issues: number
  total_issues_30_days: number
  recurring_issue_types: IssueType[]
  buyer_raised_issue_count: number
  supplier_raised_issue_count: number
}

export interface AllBehaviourSignals {
  settlement: {
    medium: SettlementBehaviourSignals
    short: SettlementBehaviourSignals
  }
  operational: OperationalBehaviourSignals
  quality: QualityBehaviourSignals
}

export class BehaviourEngine {
  private getOrdersInWindow(
    orders: OrderWithPaymentState[],
    windowMs: number
  ): OrderWithPaymentState[] {
    const cutoffTime = Date.now() - windowMs
    return orders.filter((order) => order.createdAt >= cutoffTime)
  }

  private getIssuesInWindow(
    issues: IssueReport[],
    windowMs: number
  ): IssueReport[] {
    const cutoffTime = Date.now() - windowMs
    return issues.filter((issue) => issue.createdAt >= cutoffTime)
  }

  async computeSettlementSignals(
    connectionId: string,
    window: TimeWindow = 'medium'
  ): Promise<SettlementBehaviourSignals> {
    const allOrders = await dataStore.getOrdersWithPaymentStateByConnectionId(connectionId)
    const windowMs = WINDOW_DURATIONS[window]
    const ordersInWindow = this.getOrdersInWindow(allOrders, windowMs)
    const recentOrders = this.getOrdersInWindow(allOrders, WINDOW_DURATIONS.short)

    let on_time_payment_count = 0
    let late_payment_count = 0
    let partial_payment_count = 0
    let overdue_count = 0
    let unpaid_count = 0

    for (const order of ordersInWindow) {
      if (order.settlementState === 'Paid') {
        const allEvents = await dataStore.getPaymentEventsByOrderId(order.id)
        if (allEvents.length > 0 && order.calculatedDueDate !== null) {
          const lastPaymentTime = Math.max(...allEvents.map((e) => e.timestamp))
          if (lastPaymentTime <= order.calculatedDueDate) {
            on_time_payment_count++
          } else {
            late_payment_count++
          }
        }
      } else if (order.settlementState === 'Partial Payment') {
        partial_payment_count++
      } else if (order.settlementState === 'Pending') {
        overdue_count++
      } else if (order.settlementState === 'Awaiting Payment') {
        unpaid_count++
      }
    }

    return {
      on_time_payment_count,
      late_payment_count,
      partial_payment_count,
      overdue_count,
      unpaid_count,
      orders_created_recently: recentOrders.length,
    }
  }

  async computeOperationalSignals(
    connectionId: string
  ): Promise<OperationalBehaviourSignals> {
    const allOrders = await dataStore.getOrdersByConnectionId(connectionId)

    const acceptanceDelays: number[] = []
    const dispatchDelays: number[] = []
    let deliveredCount = 0
    let ordersWithExpectedDelivery = 0
    let orders_awaiting_acceptance = 0
    let orders_awaiting_dispatch = 0

    const now = Date.now()

    for (const order of allOrders) {
      if (order.acceptedAt && order.createdAt) {
        const delayHours = (order.acceptedAt - order.createdAt) / (1000 * 60 * 60)
        acceptanceDelays.push(delayHours)
      }

      if (order.dispatchedAt && order.acceptedAt) {
        const delayHours = (order.dispatchedAt - order.acceptedAt) / (1000 * 60 * 60)
        dispatchDelays.push(delayHours)
      }

      if (order.deliveredAt) {
        deliveredCount++
        ordersWithExpectedDelivery++
      } else if (order.dispatchedAt) {
        ordersWithExpectedDelivery++
      }

      if (!order.acceptedAt) {
        orders_awaiting_acceptance++
      } else if (!order.dispatchedAt && order.acceptedAt) {
        const hoursSinceAcceptance = (now - order.acceptedAt) / (1000 * 60 * 60)
        if (hoursSinceAcceptance > 24) {
          orders_awaiting_dispatch++
        }
      }
    }

    const avg_acceptance_delay =
      acceptanceDelays.length > 0
        ? acceptanceDelays.reduce((sum, d) => sum + d, 0) / acceptanceDelays.length
        : null

    const avg_dispatch_delay =
      dispatchDelays.length > 0
        ? dispatchDelays.reduce((sum, d) => sum + d, 0) / dispatchDelays.length
        : null

    const delivery_consistency =
      ordersWithExpectedDelivery > 0
        ? (deliveredCount / ordersWithExpectedDelivery) * 100
        : null

    return {
      avg_acceptance_delay,
      avg_dispatch_delay,
      delivery_consistency,
      orders_awaiting_acceptance,
      orders_awaiting_dispatch,
    }
  }

  async computeQualitySignals(
    connectionId: string
  ): Promise<QualityBehaviourSignals> {
    const allOrders = await dataStore.getOrdersByConnectionId(connectionId)
    const orderIds = allOrders.map((o) => o.id)

    const allIssues = await dataStore.getAllIssueReports()
    const connectionIssues = allIssues.filter((issue) =>
      orderIds.includes(issue.orderId)
    )

    const total_open_issues = connectionIssues.filter(
      (i) => i.status === 'Open'
    ).length

    const issuesIn30Days = this.getIssuesInWindow(
      connectionIssues,
      WINDOW_DURATIONS.medium
    )
    const total_issues_30_days = issuesIn30Days.length

    const issueTypeCounts = new Map<IssueType, number>()
    for (const issue of issuesIn30Days) {
      issueTypeCounts.set(
        issue.issueType,
        (issueTypeCounts.get(issue.issueType) || 0) + 1
      )
    }

    const recurring_issue_types: IssueType[] = []
    issueTypeCounts.forEach((count, type) => {
      if (count > 1) {
        recurring_issue_types.push(type)
      }
    })

    const buyer_raised_issue_count = issuesIn30Days.filter(
      (i) => i.raisedBy === 'buyer'
    ).length

    const supplier_raised_issue_count = issuesIn30Days.filter(
      (i) => i.raisedBy === 'supplier'
    ).length

    return {
      total_open_issues,
      total_issues_30_days,
      recurring_issue_types,
      buyer_raised_issue_count,
      supplier_raised_issue_count,
    }
  }

  async computeConnectionState(connectionId: string): Promise<ConnectionState> {
    const settlement = await this.computeSettlementSignals(connectionId, 'medium')
    const operational = await this.computeOperationalSignals(connectionId)
    const quality = await this.computeQualitySignals(connectionId)

    // Under Stress
    if (
      settlement.overdue_count >= 2 ||
      quality.total_open_issues >= 3 ||
      (settlement.overdue_count >= 1 && quality.total_open_issues >= 2)
    ) {
      return 'Under Stress'
    }

    // Friction Rising
    if (
      settlement.overdue_count === 1 ||
      settlement.partial_payment_count >= 2 ||
      quality.total_open_issues >= 1 ||
      (operational.avg_acceptance_delay !== null && operational.avg_acceptance_delay > 48) ||
      (operational.avg_dispatch_delay !== null && operational.avg_dispatch_delay > 72)
    ) {
      return 'Friction Rising'
    }

    // Active
    if (settlement.orders_created_recently >= 1) {
      return 'Active'
    }

    // Stable
    return 'Stable'
  }

  async computeAllSignals(connectionId: string): Promise<AllBehaviourSignals> {
    const [settlementMedium, settlementShort, operational, quality] = await Promise.all([
      this.computeSettlementSignals(connectionId, 'medium'),
      this.computeSettlementSignals(connectionId, 'short'),
      this.computeOperationalSignals(connectionId),
      this.computeQualitySignals(connectionId),
    ])

    return {
      settlement: {
        medium: settlementMedium,
        short: settlementShort,
      },
      operational,
      quality,
    }
  }

  async recalculateAllConnectionStates(): Promise<void> {
    const connections = await dataStore.getAllConnections()

    for (const connection of connections) {
      const newState = await this.computeConnectionState(connection.id)
      if (newState !== connection.connectionState) {
        await dataStore.updateConnectionState(connection.id, newState)
      }
    }
  }
}

export const behaviourEngine = new BehaviourEngine()