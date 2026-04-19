import { dataStore } from './data-store'
import type { OrderWithPaymentState, IssueReport, Order } from './types'

export type AttentionCategory =
  | 'Pending Payments'
  | 'Due Today'
  | 'Overdue'
  | 'Disputes'
  | 'Approval Needed'
  | 'Pending Retroactive Confirmations'

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
    isShadowOrder?: boolean
    shadowCounterpartyName?: string
    pendingConfirmationCount?: number
    pendingConfirmationSupplierCount?: number
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
  PENDING_RETROACTIVE_CONFIRMATIONS: 3,
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
        const isShadow = (order as any).counterpartyType === 'shadow'
        items.push({
          id: crypto.randomUUID(),
          category: 'Pending Payments',
          connectionId: order.connectionId ?? '',
          orderId: order.id,
          description: `Payment pending for order ${order.itemSummary}`,
          priorityScore: PRIORITY_SCORES.PENDING_PAYMENTS,
          frictionStartedAt: order.createdAt,
          metadata: {
            pendingAmount: order.pendingAmount,
            orderSummary: order.itemSummary,
            isShadowOrder: isShadow || undefined,
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
        const dueDayStart = new Date(order.calculatedDueDate)
        dueDayStart.setHours(0, 0, 0, 0)
        const isShadow = (order as any).counterpartyType === 'shadow'
        items.push({
          id: crypto.randomUUID(),
          category: 'Due Today',
          connectionId: order.connectionId ?? '',
          orderId: order.id,
          description: order.itemSummary,
          priorityScore: PRIORITY_SCORES.DUE_TODAY,
          frictionStartedAt: dueDayStart.getTime(),
          metadata: {
            pendingAmount: order.pendingAmount,
            orderSummary: order.itemSummary,
            isShadowOrder: isShadow || undefined,
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
    const orderIds = orders.map(o => o.id)
    const allIssues = await dataStore.getIssueReportsByOrderIds(orderIds)
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
        const isShadow = (order as any).counterpartyType === 'shadow'

        items.push({
          id: crypto.randomUUID(),
          category: 'Overdue',
          connectionId: order.connectionId ?? '',
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
            isShadowOrder: isShadow || undefined,
          },
        })
      }
    }

    return items
  }

  private async generateDisputeItems(orders: OrderWithPaymentState[]): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []
    const orderIds = orders.map(o => o.id)
    const allIssues = await dataStore.getIssueReportsByOrderIds(orderIds)
    const openIssues = allIssues.filter((issue) => issue.status === 'Open' || issue.status === 'Acknowledged')
    const orderMap = new Map(orders.map(o => [o.id, o]))

    for (const issue of openIssues) {
      const order = orderMap.get(issue.orderId)
      if (!order) continue

      const isShadow = (order as any).counterpartyType === 'shadow'
      items.push({
        id: crypto.randomUUID(),
        category: 'Disputes',
        connectionId: order.connectionId ?? '',
        orderId: issue.orderId,
        issueId: issue.id,
        description: `${issue.issueType} - ${order.itemSummary}`,
        priorityScore: PRIORITY_SCORES.DISPUTES,
        frictionStartedAt: issue.createdAt,
        metadata: {
          issueType: issue.issueType,
          orderSummary: order.itemSummary,
          isShadowOrder: isShadow || undefined,
        },
      })
    }

    return items
  }

  private async generateApprovalNeededItems(orders: OrderWithPaymentState[]): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []
    const now = Date.now()

    for (const order of orders) {
      // Shadow orders are supplier-driven: no buyer approval step
      if ((order as any).counterpartyType === 'shadow') continue

      if (!order.acceptedAt) {
        items.push({
          id: crypto.randomUUID(),
          category: 'Approval Needed',
          connectionId: order.connectionId!,
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
            connectionId: order.connectionId!,
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

  private async generateRetroactiveConfirmationItems(
    businessId: string
  ): Promise<AttentionItem[]> {
    const shadowMatches = await dataStore.findShadowMatchesForBusiness(businessId, {
      phone: '',
    }).catch(() => [])

    if (shadowMatches.length === 0) return []

    const pendingCount = shadowMatches.reduce((sum, m) => sum + m.orders.length, 0)
    const supplierCount = new Set(shadowMatches.map(m => m.supplier.id)).size

    if (pendingCount === 0) return []

    return [{
      id: crypto.randomUUID(),
      category: 'Pending Retroactive Confirmations',
      connectionId: '',
      description: `${pendingCount} trade${pendingCount > 1 ? 's' : ''} from ${supplierCount} supplier${supplierCount > 1 ? 's' : ''} waiting for your confirmation`,
      priorityScore: PRIORITY_SCORES.PENDING_RETROACTIVE_CONFIRMATIONS,
      frictionStartedAt: Date.now(),
      metadata: {
        pendingConfirmationCount: pendingCount,
        pendingConfirmationSupplierCount: supplierCount,
      },
    }]
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
    const connectionIds = new Set(connections.map((c) => c.id))

    const relevantOrders = await dataStore.getOrdersWithPaymentStateByBusinessId(businessId)

    const [pendingPayments, dueToday, overdue, disputes, approvalNeeded, retroactive] =
      await Promise.all([
        this.generatePendingPaymentItems(relevantOrders),
        this.generateDueTodayItems(relevantOrders),
        this.generateOverdueItems(relevantOrders),
        this.generateDisputeItems(relevantOrders),
        this.generateApprovalNeededItems(relevantOrders),
        this.generateRetroactiveConfirmationItems(businessId),
      ])

    const allItems = [
      ...pendingPayments,
      ...dueToday,
      ...overdue,
      ...disputes,
      ...approvalNeeded,
      ...retroactive,
    ].filter((item) => {
      // Shadow orders and retroactive items don't have a connectionId
      if ((item as any).metadata?.isShadowOrder) return true
      if (item.category === 'Pending Retroactive Confirmations') return true
      return item.connectionId ? connectionIds.has(item.connectionId) : false
    })

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
        this.generateDisputeItems(ordersWithPaymentState),
        this.generateApprovalNeededItems(ordersWithPaymentState),
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
      // Shadow orders are supplier-driven, no buyer approval step
      if ((order as any).counterpartyType === 'shadow') continue

      if (order.acceptedAt && !order.dispatchedAt) {
        const timeSinceAcceptance = now - order.acceptedAt
        if (timeSinceAcceptance > ACCEPTANCE_THRESHOLD_MS) {
          staleItems.push({
            id: crypto.randomUUID(),
            category: 'Approval Needed',
            connectionId: order.connectionId ?? '',
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
