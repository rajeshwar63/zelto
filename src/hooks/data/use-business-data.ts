import { isToday } from 'date-fns'
import { attentionEngine, type AttentionItem } from '@/lib/attention-engine'
import { getAuthSession } from '@/lib/auth'
import { getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import { computeTrustScore } from '@/lib/trust-score'
import { dataStore } from '@/lib/data-store'

async function fetchCredibility(businessId: string): Promise<CredibilityBreakdown> {
  const ts = await computeTrustScore(businessId)
  return { score: ts.total, level: ts.level, completedItems: [], missingItems: [] }
}
import type { BusinessEntity, Connection, ConnectionRequest, IssueSeverity, IssueStatus, OrderWithPaymentState, UserAccount } from '@/lib/types'
import { useCachedQuery } from './cache'

export interface EnrichedOrder extends OrderWithPaymentState {
  connectionName: string
  lifecycleState: string
  latestActivity: number
  branchLabel?: string | null
  contactName?: string | null
  isBuyer: boolean
  hasOpenIssue: boolean
  openIssueSummary?: string | null
}

interface AttentionCounts {
  accept: number
  dispatch: number
  confirmReceipt: number
  payNow: number
  awaitingDispatch: number
  awaitingPayment: number
  disputes: number
  pendingReceivedRequests: number
}

interface BusinessOverviewData {
  username: string
  toPay: number
  toReceive: number
  tradePosition: {
    next7Days: { comingIn: number; goingOut: number; net: number; comingInOrders: number; goingOutOrders: number }
    next30Days: { comingIn: number; goingOut: number; net: number; comingInOrders: number; goingOutOrders: number }
    past7Days: { moneyPaid: number; moneyReceived: number; receivedOrders: number; paidOrders: number }
    past30Days: { moneyPaid: number; moneyReceived: number; receivedOrders: number; paidOrders: number }
  }
  ordersToday: number
  overdue: number
  overdueOrdersCount: number
  overdueAverageDelayDays: number
  overdueChangeFromYesterday: number
  recentOrders: EnrichedOrder[]
  attentionCounts: AttentionCounts
  credibility: CredibilityBreakdown | null
}

interface AttentionItemWithConnection extends AttentionItem {
  connectionName: string
  orderValue?: number
  totalPaid?: number
  pendingAmount?: number
  lifecycleState?: string
  branchLabel?: string | null
  contactName?: string | null
  issueSeverity?: IssueSeverity
  issueStatus?: IssueStatus
  issueRaisedAt?: number
}

interface AttentionData {
  items: AttentionItemWithConnection[]
}

interface ProfileData {
  business: BusinessEntity | null
  userAccount: UserAccount | null
  unreadCount: number
  credibility: CredibilityBreakdown | null
  activityCounts: { connectionCount: number; orderCount: number } | null
}

function getLifecycleState(order: OrderWithPaymentState): string {
  if (order.declinedAt) return 'Declined'
  if (order.deliveredAt) return 'Delivered'
  if (order.dispatchedAt) return 'Dispatched'
  if (order.acceptedAt) return 'Accepted'
  return 'Placed'
}

function getLatestActivity(order: OrderWithPaymentState): number {
  return Math.max(order.deliveredAt || 0, order.dispatchedAt || 0, order.acceptedAt || 0, order.createdAt || 0)
}

export function useOrdersData(currentBusinessId: string, isActive = true) {
  return useCachedQuery<EnrichedOrder[]>({
    key: `orders:${currentBusinessId}`,
    isActive,
    events: ['orders:changed', 'payments:changed', 'issues:changed', 'connections:changed'],
    fetcher: async () => {
      const [allOrders, connections, entities] = await Promise.all([
        dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId),
        dataStore.getConnectionsByBusinessId(currentBusinessId),
        dataStore.getAllBusinessEntities(),
      ])

      const entityMap = new Map(entities.map(entity => [entity.id, entity]))
      const connMap = new Map(connections.map(connection => [connection.id, connection]))

      const orderIds = allOrders.map(order => order.id)
      const allIssues = orderIds.length > 0
        ? await dataStore.getIssueReportsByOrderIds(orderIds)
        : []
      const openIssueOrderIds = new Set(
        allIssues
          .filter(issue => issue.status === 'Open' || issue.status === 'Acknowledged')
          .map(issue => issue.orderId)
      )
      const openIssueSummaryMap = new Map<string, string>()
      allIssues
        .filter(issue => issue.status === 'Open' || issue.status === 'Acknowledged')
        .forEach(issue => {
          if (!openIssueSummaryMap.has(issue.orderId)) {
            openIssueSummaryMap.set(issue.orderId, issue.issueType)
          }
        })

      return allOrders
        .map(order => {
          const conn = connMap.get(order.connectionId)
          let connectionName = 'Unknown'
          if (conn) {
            const otherId = conn.buyerBusinessId === currentBusinessId ? conn.supplierBusinessId : conn.buyerBusinessId
            connectionName = entityMap.get(otherId)?.businessName || 'Unknown'
          }
          return {
            ...order,
            connectionName,
            lifecycleState: getLifecycleState(order),
            latestActivity: getLatestActivity(order),
            branchLabel: conn?.branchLabel,
            contactName: conn?.contactName,
            isBuyer: conn?.buyerBusinessId === currentBusinessId,
            hasOpenIssue: openIssueOrderIds.has(order.id),
            openIssueSummary: openIssueSummaryMap.get(order.id) ?? null,
          }
        })
        .sort((a, b) => b.latestActivity - a.latestActivity)
    },
  })
}

export function useBusinessOverviewData(currentBusinessId: string, isActive = true) {
  return useCachedQuery<BusinessOverviewData>({
    key: `business-overview:${currentBusinessId}`,
    isActive,
    events: ['orders:changed', 'payments:changed', 'connections:changed', 'issues:changed', 'connection-requests:changed'],
    fetcher: async () => {
      const [orders, connections, entities, attentionItems, session, credibility, allRequests] = await Promise.all([
        dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId),
        dataStore.getConnectionsByBusinessId(currentBusinessId),
        dataStore.getAllBusinessEntities(),
        attentionEngine.getAttentionItems(currentBusinessId),
        getAuthSession(),
        fetchCredibility(currentBusinessId),
        dataStore.getAllConnectionRequests(),
      ])
      const pendingReceivedRequests = allRequests.filter(
        r => r.receiverBusinessId === currentBusinessId && r.status === 'Pending'
      ).length

      const orderIds = orders.map(order => order.id)
      const [paymentEvents, allIssues] = await Promise.all([
        orderIds.length > 0
          ? dataStore.getPaymentEventsByOrderIds(orderIds)
          : Promise.resolve([]),
        orderIds.length > 0
          ? dataStore.getIssueReportsByOrderIds(orderIds)
          : Promise.resolve([]),
      ])

      const overviewOpenIssueOrderIds = new Set(
        allIssues
          .filter(issue => issue.status === 'Open' || issue.status === 'Acknowledged')
          .map(issue => issue.orderId)
      )
      const overviewOpenIssueSummaryMap = new Map<string, string>()
      allIssues
        .filter(issue => issue.status === 'Open' || issue.status === 'Acknowledged')
        .forEach(issue => {
          if (!overviewOpenIssueSummaryMap.has(issue.orderId)) {
            overviewOpenIssueSummaryMap.set(issue.orderId, issue.issueType)
          }
        })

      const userAccount = session?.email
        ? await dataStore.getUserAccountByEmail(session.email)
        : undefined
      const username = userAccount?.username?.trim() ?? ''

      const connMap = new Map<string, Connection>(connections.map(conn => [conn.id, conn]))
      const entityMap = new Map(entities.map(entity => [entity.id, entity]))

      let toPay = 0
      let toReceive = 0
      let ordersToday = 0
      let overdue = 0
      let overdueYesterday = 0
      let overdueOrdersCount = 0
      let totalOverdueDelayDays = 0
      let next7DaysComingIn = 0
      let next7DaysGoingOut = 0
      let next30DaysComingIn = 0
      let next30DaysGoingOut = 0
      let past7DaysMoneyPaid = 0
      let past7DaysMoneyReceived = 0
      let past30DaysMoneyPaid = 0
      let past30DaysMoneyReceived = 0
      let next7DaysComingInOrders = 0
      let next7DaysGoingOutOrders = 0
      let next30DaysComingInOrders = 0
      let next30DaysGoingOutOrders = 0
      const past7DaysReceivedOrderIds = new Set<string>()
      const past7DaysPaidOrderIds = new Set<string>()
      const past30DaysReceivedOrderIds = new Set<string>()
      const past30DaysPaidOrderIds = new Set<string>()

      const now = Date.now()
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)
      const todayStartMs = todayStart.getTime()
      const sevenDaysFromTodayEnd = todayStartMs + (7 * 24 * 60 * 60 * 1000) - 1
      const thirtyDaysFromTodayEnd = todayStartMs + (30 * 24 * 60 * 60 * 1000) - 1
      const sevenDaysAgoStart = todayStartMs - (7 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgoStart = todayStartMs - (30 * 24 * 60 * 60 * 1000)
      const yesterday = now - (24 * 60 * 60 * 1000)

      const orderConnectionMap = new Map(orders.map(order => [order.id, connMap.get(order.connectionId)]))

      for (const paymentEvent of paymentEvents) {
        const connection = orderConnectionMap.get(paymentEvent.orderId)
        if (!connection) continue

        const isSupplier = connection.supplierBusinessId === currentBusinessId
        const eventTimestamp = paymentEvent.timestamp

        if (eventTimestamp >= thirtyDaysAgoStart && eventTimestamp <= now) {
          if (isSupplier) {
            past30DaysMoneyReceived += paymentEvent.amountPaid
            past30DaysReceivedOrderIds.add(paymentEvent.orderId)
          } else {
            past30DaysMoneyPaid += paymentEvent.amountPaid
            past30DaysPaidOrderIds.add(paymentEvent.orderId)
          }
        }

        if (eventTimestamp >= sevenDaysAgoStart && eventTimestamp <= now) {
          if (isSupplier) {
            past7DaysMoneyReceived += paymentEvent.amountPaid
            past7DaysReceivedOrderIds.add(paymentEvent.orderId)
          } else {
            past7DaysMoneyPaid += paymentEvent.amountPaid
            past7DaysPaidOrderIds.add(paymentEvent.orderId)
          }
        }
      }

      for (const order of orders) {
        if (order.declinedAt) continue

        if (isToday(order.createdAt)) ordersToday += 1

        if (order.calculatedDueDate != null && order.calculatedDueDate < now && order.pendingAmount > 0 && order.settlementState !== 'Paid') {
          overdue += order.pendingAmount
          overdueOrdersCount += 1
          totalOverdueDelayDays += Math.max(0, Math.ceil((now - order.calculatedDueDate) / (24 * 60 * 60 * 1000)))
        }

        if (order.calculatedDueDate != null && order.calculatedDueDate < yesterday && order.pendingAmount > 0 && order.settlementState !== 'Paid') {
          overdueYesterday += order.pendingAmount
        }

        const connection = connMap.get(order.connectionId)
        const isSupplier = connection?.supplierBusinessId === currentBusinessId

        if (order.pendingAmount > 0) {
          if (isSupplier) toReceive += order.pendingAmount
          else toPay += order.pendingAmount
        }

        if (order.pendingAmount > 0 && order.calculatedDueDate != null) {
          const dueDate = order.calculatedDueDate

          if (dueDate <= thirtyDaysFromTodayEnd) {
            if (isSupplier) {
              next30DaysComingIn += order.pendingAmount
              next30DaysComingInOrders += 1
            } else {
              next30DaysGoingOut += order.pendingAmount
              next30DaysGoingOutOrders += 1
            }
          }

          if (dueDate <= sevenDaysFromTodayEnd) {
            if (isSupplier) {
              next7DaysComingIn += order.pendingAmount
              next7DaysComingInOrders += 1
            } else {
              next7DaysGoingOut += order.pendingAmount
              next7DaysGoingOutOrders += 1
            }
          }
        }

      }

      let countAccept = 0
      let countDispatch = 0
      let countConfirmReceipt = 0
      let countPayNow = 0
      let countAwaitingDispatch = 0
      let countAwaitingPayment = 0

      for (const order of orders) {
        if (order.declinedAt) continue

        const connection = connMap.get(order.connectionId)
        if (!connection) continue

        const isBuyer = connection.buyerBusinessId === currentBusinessId
        const isSupplier = connection.supplierBusinessId === currentBusinessId

        const lifecycle = getLifecycleState(order)

        if (isSupplier && lifecycle === 'Placed') countAccept += 1
        if (isSupplier && lifecycle === 'Accepted') countDispatch += 1
        if (isBuyer && lifecycle === 'Dispatched') countConfirmReceipt += 1
        if (isBuyer && lifecycle === 'Delivered' && order.settlementState !== 'Paid') countPayNow += 1
        if (isBuyer && (lifecycle === 'Placed' || lifecycle === 'Accepted')) countAwaitingDispatch += 1
        if (isSupplier && lifecycle === 'Delivered' && order.settlementState !== 'Paid') countAwaitingPayment += 1
      }

      const disputes = attentionItems.filter(item => item.category === 'Disputes').length

      const recentOrders = orders
        .filter(order => !order.declinedAt)
        .map(order => {
          const connection = connMap.get(order.connectionId)
          let connectionName = 'Unknown'
          if (connection) {
            const otherId = connection.buyerBusinessId === currentBusinessId
              ? connection.supplierBusinessId
              : connection.buyerBusinessId
            connectionName = entityMap.get(otherId)?.businessName || 'Unknown'
          }

          return {
            ...order,
            connectionName,
            lifecycleState: getLifecycleState(order),
            latestActivity: getLatestActivity(order),
            isBuyer: connection?.buyerBusinessId === currentBusinessId,
            branchLabel: connection?.branchLabel,
            contactName: connection?.contactName,
            hasOpenIssue: overviewOpenIssueOrderIds.has(order.id),
            openIssueSummary: overviewOpenIssueSummaryMap.get(order.id) ?? null,
          }
        })
        .sort((a, b) => b.latestActivity - a.latestActivity)
        .slice(0, 6)

      return {
        username,
        toPay,
        toReceive,
        tradePosition: {
          next7Days: {
            comingIn: next7DaysComingIn,
            goingOut: next7DaysGoingOut,
            net: next7DaysComingIn - next7DaysGoingOut,
            comingInOrders: next7DaysComingInOrders,
            goingOutOrders: next7DaysGoingOutOrders,
          },
          next30Days: {
            comingIn: next30DaysComingIn,
            goingOut: next30DaysGoingOut,
            net: next30DaysComingIn - next30DaysGoingOut,
            comingInOrders: next30DaysComingInOrders,
            goingOutOrders: next30DaysGoingOutOrders,
          },
          past7Days: {
            moneyPaid: past7DaysMoneyPaid,
            moneyReceived: past7DaysMoneyReceived,
            receivedOrders: past7DaysReceivedOrderIds.size,
            paidOrders: past7DaysPaidOrderIds.size,
          },
          past30Days: {
            moneyPaid: past30DaysMoneyPaid,
            moneyReceived: past30DaysMoneyReceived,
            receivedOrders: past30DaysReceivedOrderIds.size,
            paidOrders: past30DaysPaidOrderIds.size,
          },
        },
        ordersToday,
        overdue,
        overdueOrdersCount,
        overdueAverageDelayDays: overdueOrdersCount > 0 ? Math.round(totalOverdueDelayDays / overdueOrdersCount) : 0,
        overdueChangeFromYesterday: overdue - overdueYesterday,
        recentOrders,
        attentionCounts: {
          accept: countAccept,
          dispatch: countDispatch,
          confirmReceipt: countConfirmReceipt,
          payNow: countPayNow,
          awaitingDispatch: countAwaitingDispatch,
          awaitingPayment: countAwaitingPayment,
          disputes,
          pendingReceivedRequests,
        },
        credibility,
      }
    },
  })
}

export function useAttentionData(currentBusinessId: string, isActive = true) {
  return useCachedQuery<AttentionData>({
    key: `attention:${currentBusinessId}`,
    isActive,
    events: ['orders:changed', 'payments:changed', 'issues:changed', 'connections:changed'],
    fetcher: async () => {
      const [attentionItems, connections, entities, orders, allIssues] = await Promise.all([
        attentionEngine.getAttentionItems(currentBusinessId),
        dataStore.getConnectionsByBusinessId(currentBusinessId),
        dataStore.getAllBusinessEntities(),
        dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId),
        dataStore.getAllIssueReports(),
      ])

      const entityMap = new Map(entities.map(entity => [entity.id, entity]))
      const orderMap = new Map(orders.map(o => [o.id, o]))
      const issueMap = new Map(allIssues.map(i => [i.id, i]))
      const items = attentionItems
        .filter(item => item.category === 'Disputes')
        .map(item => {
          const connection = connections.find(conn => conn.id === item.connectionId)
          let connectionName = 'Unknown'
          if (connection) {
            const otherId = connection.buyerBusinessId === currentBusinessId ? connection.supplierBusinessId : connection.buyerBusinessId
            connectionName = entityMap.get(otherId)?.businessName || 'Unknown'
          }
          const order = item.orderId ? orderMap.get(item.orderId) : undefined

          const branchLabel = connection?.branchLabel ?? null
          const contactName = connection?.contactName ?? null

          const issue = item.issueId ? issueMap.get(item.issueId) : undefined
          const issueSeverity = issue?.severity
          const issueStatus = issue?.status
          const issueRaisedAt = issue?.createdAt

          return {
            ...item,
            connectionName,
            orderValue: order?.orderValue,
            totalPaid: order?.totalPaid,
            pendingAmount: order?.pendingAmount,
            lifecycleState: order ? getLifecycleState(order) : undefined,
            branchLabel,
            contactName,
            issueSeverity,
            issueStatus,
            issueRaisedAt,
          }
        })

      return {
        items,
      }
    },
  })
}

export function useConnectionRequestsData(currentBusinessId: string, isActive = true) {
  return useCachedQuery<ConnectionRequest[]>({
    key: `connection-requests:${currentBusinessId}`,
    isActive,
    events: ['connection-requests:changed'],
    fetcher: async () => {
      const allRequests = await dataStore.getAllConnectionRequests()
      return allRequests.filter(
        request => request.receiverBusinessId === currentBusinessId && request.status === 'Pending',
      )
    },
  })
}

export function useProfileData(currentBusinessId: string) {
  return useCachedQuery<ProfileData>({
    key: `profile:${currentBusinessId}`,
    events: ['notifications:changed', 'connections:changed', 'orders:changed', 'payments:changed'],
    fetcher: async () => {
      const session = await getAuthSession()
      if (!session) {
        return {
          business: null,
          userAccount: null,
          unreadCount: 0,
          credibility: null,
          activityCounts: null,
        }
      }

      const [business, userAccount, unreadCount, credibility, activityCounts] = await Promise.all([
        dataStore.getBusinessEntityById(currentBusinessId),
        dataStore.getUserAccountByEmail(session.email),
        dataStore.getUnreadNotificationCountByBusinessId(currentBusinessId),
        fetchCredibility(currentBusinessId),
        getBusinessActivityCounts(currentBusinessId),
      ])

      return {
        business: business || null,
        userAccount: userAccount || null,
        unreadCount,
        credibility,
        activityCounts,
      }
    },
  })
}
