import { isToday } from 'date-fns'
import { attentionEngine, type AttentionItem } from '@/lib/attention-engine'
import { getAuthSession } from '@/lib/auth'
import { calculateCredibility, getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import { dataStore } from '@/lib/data-store'
import type { BusinessEntity, Connection, ConnectionRequest, OrderWithPaymentState, UserAccount } from '@/lib/types'
import { useCachedQuery } from './cache'

export interface EnrichedOrder extends OrderWithPaymentState {
  connectionName: string
  lifecycleState: string
  latestActivity: number
}

interface AttentionCounts {
  approvalNeeded: number
  dispatched: number
  delivered: number
  paymentPending: number
  disputes: number
}

interface BusinessOverviewData {
  username: string
  toPay: number
  toReceive: number
  tradePosition: {
    next7Days: { comingIn: number; goingOut: number; net: number }
    next30Days: { comingIn: number; goingOut: number; net: number }
  }
  ordersToday: number
  overdue: number
  overdueOrdersCount: number
  overdueAverageDelayDays: number
  overdueChangeFromYesterday: number
  recentOrders: EnrichedOrder[]
  attentionCounts: AttentionCounts
}

interface AttentionItemWithConnection extends AttentionItem {
  connectionName: string
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
    events: ['orders:changed', 'payments:changed', 'connections:changed', 'issues:changed'],
    fetcher: async () => {
      const [orders, connections, entities, attentionItems, session] = await Promise.all([
        dataStore.getOrdersWithPaymentStateByBusinessId(currentBusinessId),
        dataStore.getConnectionsByBusinessId(currentBusinessId),
        dataStore.getAllBusinessEntities(),
        attentionEngine.getAttentionItems(currentBusinessId),
        getAuthSession(),
      ])

      const username = session?.userAccount?.username || 'there'

      const connMap = new Map<string, Connection>(connections.map(conn => [conn.id, conn]))
      const entityMap = new Map(entities.map(entity => [entity.id, entity]))

      let toPay = 0
      let toReceive = 0
      let ordersToday = 0
      let overdue = 0
      let overdueYesterday = 0
      let overdueOrdersCount = 0
      let totalOverdueDelayDays = 0
      let dispatched = 0
      let delivered = 0
      let paymentPending = 0

      let next7DaysComingIn = 0
      let next7DaysGoingOut = 0
      let next30DaysComingIn = 0
      let next30DaysGoingOut = 0

      const now = Date.now()
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)
      const todayStartMs = todayStart.getTime()
      const sevenDaysFromTodayEnd = todayStartMs + (7 * 24 * 60 * 60 * 1000) - 1
      const thirtyDaysFromTodayEnd = todayStartMs + (30 * 24 * 60 * 60 * 1000) - 1
      const yesterday = now - (24 * 60 * 60 * 1000)

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
          if (dueDate >= todayStartMs && dueDate <= thirtyDaysFromTodayEnd) {
            if (isSupplier) next30DaysComingIn += order.pendingAmount
            else next30DaysGoingOut += order.pendingAmount

            if (dueDate <= sevenDaysFromTodayEnd) {
              if (isSupplier) next7DaysComingIn += order.pendingAmount
              else next7DaysGoingOut += order.pendingAmount
            }
          }
        }

        if (order.dispatchedAt && !order.deliveredAt) dispatched += 1
        if (order.deliveredAt && order.settlementState !== 'Paid') delivered += 1
        if (order.deliveredAt && order.pendingAmount > 0 && order.settlementState !== 'Paid') paymentPending += 1
      }

      const approvalNeeded = attentionItems.filter(item => item.category === 'Approval Needed').length
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
          },
          next30Days: {
            comingIn: next30DaysComingIn,
            goingOut: next30DaysGoingOut,
            net: next30DaysComingIn - next30DaysGoingOut,
          },
        },
        ordersToday,
        overdue,
        overdueOrdersCount,
        overdueAverageDelayDays: overdueOrdersCount > 0 ? Math.round(totalOverdueDelayDays / overdueOrdersCount) : 0,
        overdueChangeFromYesterday: overdue - overdueYesterday,
        recentOrders,
        attentionCounts: {
          approvalNeeded,
          dispatched,
          delivered,
          paymentPending,
          disputes,
        },
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
      const [attentionItems, connections, entities] = await Promise.all([
        attentionEngine.getAttentionItems(currentBusinessId),
        dataStore.getConnectionsByBusinessId(currentBusinessId),
        dataStore.getAllBusinessEntities(),
      ])

      const entityMap = new Map(entities.map(entity => [entity.id, entity]))
      const items = attentionItems
        .filter(item => item.category === 'Disputes')
        .map(item => {
          const connection = connections.find(conn => conn.id === item.connectionId)
          let connectionName = 'Unknown'
          if (connection) {
            const otherId = connection.buyerBusinessId === currentBusinessId ? connection.supplierBusinessId : connection.buyerBusinessId
            connectionName = entityMap.get(otherId)?.businessName || 'Unknown'
          }
          return {
            ...item,
            connectionName,
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
        calculateCredibility(currentBusinessId),
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
