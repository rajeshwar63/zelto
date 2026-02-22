import { dataStore } from './data-store'
import type { OrderWithPaymentState, IssueReport, Order } from './types'

export type AttentionCategory =
  | 'Pending Payments'
  | 'Due Today'
  | 'Overdue'
  | 'Disputes'
  | 'Approval Needed'

export interface AttentionItem {
  id: string
  category: AttentionCategory
  connectionId: string
  orderId?: string
  issueId?: string
  description: string
  priorityScore: number
  frictionStartedAt: number
  metadata?: {
    issueType?: string
    pendingAmount?: number
    daysOverdue?: number
    stateInfo?: string
    orderSummary?: string
  }
}

export interface ActiveFrictionSummary {
  hasSettlementFriction: boolean
  hasOperationalFriction: boolean
  hasQualityFriction: boolean
}

const PRIORITY_SCORES = {
  OVERDUE_WITH_ISSUES: 1,
  OVERDUE: 2,
  DUE_TODAY: 3,
  DISPUTES: 4,
  PENDING_PAYMENTS: 5,
  APPROVAL_NEEDED: 6,
}

const ACCEPTANCE_THRESHOLD_MS = 48 * 60 * 60 * 1000

export class AttentionEngine {
  private isToday(timestamp: number): boolean {
    const targetDate = new Date(timestamp)
    const today = new Date()
    
    return (
      targetDate.getFullYear() === today.getFullYear() &&
      targetDate.getMonth() === today.getMonth() &&
      targetDate.getDate() === today.getDate()
    )
  }

  private getDaysOverdue(dueDate: number): number {
    const now = Date.now()
    const diffMs = now - dueDate
    return Math.floor(diffMs / (24 * 60 * 60 * 1000))
  }

  private async generatePendingPaymentItems(
    orders: OrderWithPaymentState[]
  ): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []
    const now = Date.now()

    for (const order of orders) {
      if (
        order.pendingAmount > 0 &&
        order.calculatedDueDate !== null &&
        order.calculatedDueDate > now
      ) {
        items.push({
          id: crypto.randomUUID(),
          category: 'Pending Payments',
          connectionId: order.connectionId,
          orderId: order.id,
          description: `Payment pending for order ${order.itemSummary}`,
          priorityScore: PRIORITY_SCORES.PENDING_PAYMENTS,
          frictionStartedAt: order.createdAt,
          metadata: {
            pendingAmount: order.pendingAmount,
            orderSummary: order.itemSummary,
          },
        })
      }
    }

    return items
  }

  private async generateDueTodayItems(
    orders: OrderWithPaymentState[]
  ): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []

    for (const order of orders) {
      if (
        order.pendingAmount > 0 &&
        order.calculatedDueDate !== null &&
        this.isToday(order.calculatedDueDate)
      ) {
        items.push({
          id: crypto.randomUUID(),
          category: 'Due Today',
          connectionId: order.connectionId,
          orderId: order.id,
          description: order.itemSummary,
          priorityScore: PRIORITY_SCORES.DUE_TODAY,
          frictionStartedAt: order.calculatedDueDate,
          metadata: {
            pendingAmount: order.pendingAmount,
            orderSummary: order.itemSummary,
          },
        })
      }
    }

    return items
  }

  private async generateOverdueItems(
    orders: OrderWithPaymentState[]
  ): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []
    const now = Date.now()
    const allIssues = await dataStore.getAllIssueReports()
    const openIssuesByOrderId = new Map<string, IssueReport[]>()

    allIssues
      .filter((issue) => issue.status === 'Open')
      .forEach((issue) => {
        const existing = openIssuesByOrderId.get(issue.orderId) || []
        openIssuesByOrderId.set(issue.orderId, [...existing, issue])
      })

    for (const order of orders) {
      if (
        order.pendingAmount > 0 &&
        order.calculatedDueDate !== null &&
        order.calculatedDueDate < now &&
        !this.isToday(order.calculatedDueDate)
      ) {
        const hasOpenIssues = openIssuesByOrderId.has(order.id)
        const daysOverdue = this.getDaysOverdue(order.calculatedDueDate)

        items.push({
          id: crypto.randomUUID(),
          category: 'Overdue',
          connectionId: order.connectionId,
          orderId: order.id,
          description: order.itemSummary,
          priorityScore: hasOpenIssues
            ? PRIORITY_SCORES.OVERDUE_WITH_ISSUES
            : PRIORITY_SCORES.OVERDUE,
          frictionStartedAt: order.calculatedDueDate,
          metadata: {
            pendingAmount: order.pendingAmount,
            daysOverdue,
            orderSummary: order.itemSummary,
          },
        })
      }
    }

    return items
  }

  private async generateDisputeItems(): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []
    const allIssues = await dataStore.getAllIssueReports()
    const openIssues = allIssues.filter((issue) => issue.status === 'Open')

    for (const issue of openIssues) {
      const order = await dataStore.getOrderById(issue.orderId)
      if (!order) continue

      items.push({
        id: crypto.randomUUID(),
        category: 'Disputes',
        connectionId: order.connectionId,
        orderId: issue.orderId,
        issueId: issue.id,
        description: `${issue.issueType} - ${order.itemSummary}`,
        priorityScore: PRIORITY_SCORES.DISPUTES,
        frictionStartedAt: issue.createdAt,
        metadata: {
          issueType: issue.issueType,
          orderSummary: order.itemSummary,
        },
      })
    }

    return items
  }

  private async generateApprovalNeededItems(): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []
    const allOrders = await dataStore.getAllOrders()
    const now = Date.now()

    for (const order of allOrders) {
      if (!order.acceptedAt) {
        items.push({
          id: crypto.randomUUID(),
          category: 'Approval Needed',
          connectionId: order.connectionId,
          orderId: order.id,
          description: order.itemSummary,
          priorityScore: PRIORITY_SCORES.APPROVAL_NEEDED,
          frictionStartedAt: order.createdAt,
          metadata: {
            stateInfo: 'Placed - Not Accepted',
            orderSummary: order.itemSummary,
          },
        })
      } else if (order.acceptedAt && !order.dispatchedAt) {
        const timeSinceAcceptance = now - order.acceptedAt
        if (timeSinceAcceptance > ACCEPTANCE_THRESHOLD_MS) {
          items.push({
            id: crypto.randomUUID(),
            category: 'Approval Needed',
            connectionId: order.connectionId,
            orderId: order.id,
            description: order.itemSummary,
            priorityScore: PRIORITY_SCORES.APPROVAL_NEEDED,
            frictionStartedAt: order.acceptedAt + ACCEPTANCE_THRESHOLD_MS,
            metadata: {
              stateInfo: 'Accepted - Not Dispatched',
              orderSummary: order.itemSummary,
            },
          })
        }
      }
    }

    return items
  }

  private sortItemsByPriority(items: AttentionItem[]): AttentionItem[] {
    return items.sort((a, b) => {
      if (a.priorityScore !== b.priorityScore) {
        return a.priorityScore - b.priorityScore
      }
      return a.frictionStartedAt - b.frictionStartedAt
    })
  }

  async getAttentionItems(businessId: string): Promise<AttentionItem[]> {
    const connections = await dataStore.getConnectionsByBusinessId(businessId)
    const connectionIds = connections.map((c) => c.id)

    const allOrdersWithPaymentState = await dataStore.getAllOrdersWithPaymentState()
    const relevantOrders = allOrdersWithPaymentState.filter((order) =>
      connectionIds.includes(order.connectionId)
    )

    const [pendingPayments, dueToday, overdue, disputes, approvalNeeded] =
      await Promise.all([
        this.generatePendingPaymentItems(relevantOrders),
        this.generateDueTodayItems(relevantOrders),
        this.generateOverdueItems(relevantOrders),
        this.generateDisputeItems(),
        this.generateApprovalNeededItems(),
      ])

    const allItems = [
      ...pendingPayments,
      ...dueToday,
      ...overdue,
      ...disputes,
      ...approvalNeeded,
    ].filter((item) => connectionIds.includes(item.connectionId))

    return this.sortItemsByPriority(allItems)
  }

  async getAttentionItemsByConnection(
    connectionId: string
  ): Promise<AttentionItem[]> {
    const connection = await dataStore.getConnectionById(connectionId)
    if (!connection) return []

    const ordersWithPaymentState =
      await dataStore.getOrdersWithPaymentStateByConnectionId(connectionId)

    const [pendingPayments, dueToday, overdue, disputes, approvalNeeded] =
      await Promise.all([
        this.generatePendingPaymentItems(ordersWithPaymentState),
        this.generateDueTodayItems(ordersWithPaymentState),
        this.generateOverdueItems(ordersWithPaymentState),
        this.generateDisputeItems(),
        this.generateApprovalNeededItems(),
      ])

    const allItems = [
      ...pendingPayments,
      ...dueToday,
      ...overdue,
      ...disputes,
      ...approvalNeeded,
    ].filter((item) => item.connectionId === connectionId)

    return this.sortItemsByPriority(allItems)
  }

  async getActiveFrictionSummary(
    connectionId: string
  ): Promise<ActiveFrictionSummary> {
    const items = await this.getAttentionItemsByConnection(connectionId)

    const hasSettlementFriction = items.some(
      (item) => item.category === 'Overdue' || item.category === 'Due Today'
    )

    const hasOperationalFriction = items.some(
      (item) => item.category === 'Approval Needed'
    )

    const hasQualityFriction = items.some((item) => item.category === 'Disputes')

    return {
      hasSettlementFriction,
      hasOperationalFriction,
      hasQualityFriction,
    }
  }

  async checkStaleAcceptedOrders(): Promise<AttentionItem[]> {
    const allOrders = await dataStore.getAllOrders()
    const now = Date.now()
    const staleItems: AttentionItem[] = []

    for (const order of allOrders) {
      if (order.acceptedAt && !order.dispatchedAt) {
        const timeSinceAcceptance = now - order.acceptedAt
        if (timeSinceAcceptance > ACCEPTANCE_THRESHOLD_MS) {
          staleItems.push({
            id: crypto.randomUUID(),
            category: 'Approval Needed',
            connectionId: order.connectionId,
            orderId: order.id,
            description: order.itemSummary,
            priorityScore: PRIORITY_SCORES.APPROVAL_NEEDED,
            frictionStartedAt: order.acceptedAt + ACCEPTANCE_THRESHOLD_MS,
            metadata: {
              stateInfo: 'Accepted - Not Dispatched',
              orderSummary: order.itemSummary,
            },
          })
        }
      }
    }

    return this.sortItemsByPriority(staleItems)
  }
}

export const attentionEngine = new AttentionEngine()
