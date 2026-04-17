// supabase/functions/get-trade-intelligence/index.ts
// Returns all four Trade Intelligence sections in a single call, using at
// most 5 database round-trips regardless of how many connections the
// business has. Replaces the client-side intelligence-engine fan-out that
// was firing 200+ queries per dashboard load.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  enrichConnectionOrdersWithPaymentState,
  scoreToLevel,
} from '../_shared/business-logic.ts'
import type {
  CashForecast,
  CashForecastBucket,
  CollectionItem,
  ConcentrationRisk,
  Connection,
  Order,
  OrderWithPaymentState,
  PaymentCalendarItem,
  PaymentEvent,
  TradeIntelligenceResponse,
} from '../_shared/intelligence-types.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || SUPABASE_SERVICE_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' }

// JSONB columns whose inner keys must not be snake→camel transformed.
const JSONB_KEYS = new Set(['payment_terms', 'payment_term_snapshot'])

function toCamel<T = any>(value: unknown, parentKey?: string): T {
  if (Array.isArray(value)) {
    return value.map((item) => toCamel(item, parentKey)) as unknown as T
  }
  if (value === null || typeof value !== 'object') {
    return value as T
  }
  if (parentKey && JSONB_KEYS.has(parentKey)) {
    return value as T
  }
  const result: Record<string, unknown> = {}
  for (const key in value as Record<string, unknown>) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    result[camelKey] = toCamel((value as Record<string, unknown>)[key], key)
  }
  return result as T
}

interface RequestBody {
  businessId: string
}

function empty(): TradeIntelligenceResponse {
  return {
    cashForecast: { inflows: [], outflows: [], netThisWeek: 0, netNextWeek: 0 },
    collectionItems: [],
    concentrationRisk: null,
    paymentCalendar: [],
  }
}

function computePatternSignal(
  orders: OrderWithPaymentState[],
  paymentsByOrder: Map<string, PaymentEvent[]>,
): { signal: CollectionItem['patternSignal']; detail: string } {
  const now = Date.now()
  const SHORT_MS = 7 * 86400000
  const MEDIUM_MS = 30 * 86400000

  // Only orders created in the respective windows contribute to signals —
  // this mirrors behaviourEngine.computeSettlementSignals in the client.
  const ordersShort = orders.filter((o) => o.createdAt >= now - SHORT_MS)
  const ordersMedium = orders.filter((o) => o.createdAt >= now - MEDIUM_MS)

  const countPayments = (scoped: OrderWithPaymentState[]) => {
    let onTime = 0
    let late = 0
    for (const order of scoped) {
      if (order.settlementState !== 'Paid') continue
      if (order.calculatedDueDate === null) continue
      const events = paymentsByOrder.get(order.id) ?? []
      if (events.length === 0) continue
      const lastPaymentTime = Math.max(...events.map((e) => e.timestamp))
      if (lastPaymentTime <= order.calculatedDueDate) onTime++
      else late++
    }
    return { onTime, late }
  }

  const short = countPayments(ordersShort)
  const medium = countPayments(ordersMedium)

  let signal: CollectionItem['patternSignal']
  if (short.late > medium.late / 2) {
    signal = 'worsening'
  } else if (short.late === 0 && medium.late > 0) {
    signal = 'improving'
  } else if (medium.late === 1 && medium.onTime >= 3) {
    signal = 'first_late'
  } else {
    signal = 'stable'
  }

  let detail: string
  if (signal === 'worsening') {
    detail = `${short.late} late in 7d, ${medium.late} in 30d`
  } else if (signal === 'improving') {
    detail = `No recent late payments, was ${medium.late} in 30d`
  } else if (signal === 'first_late') {
    detail = 'Usually on time'
  } else {
    detail = `${medium.onTime} on-time, ${medium.late} late in 30d`
  }

  return { signal, detail }
}

function computeCashForecast(
  businessId: string,
  connections: Connection[],
  ordersByConnection: Map<string, OrderWithPaymentState[]>,
  paymentsByOrder: Map<string, PaymentEvent[]>,
): CashForecast {
  const now = Date.now()
  const inflowThisWeek = { amount: 0, count: 0 }
  const inflowNextWeek = { amount: 0, count: 0 }
  const outflowThisWeek = { amount: 0, count: 0 }
  const outflowNextWeek = { amount: 0, count: 0 }

  const supplierConnections = connections.filter((c) => c.supplierBusinessId === businessId)
  const buyerConnections = connections.filter((c) => c.buyerBusinessId === businessId)

  // INFLOWS: business is the supplier; predict when buyers will pay us.
  for (const connection of supplierConnections) {
    const orders = ordersByConnection.get(connection.id) ?? []

    const paidDeliveredOrders = orders.filter(
      (o) => o.settlementState === 'Paid' && o.deliveredAt,
    )

    const paymentLags: number[] = []
    for (const paidOrder of paidDeliveredOrders) {
      const events = paymentsByOrder.get(paidOrder.id) ?? []
      if (events.length > 0 && paidOrder.deliveredAt) {
        const lastPaymentTime = Math.max(...events.map((e) => e.timestamp))
        paymentLags.push((lastPaymentTime - paidOrder.deliveredAt) / 86400000)
      }
    }

    let avgPaymentLagDays: number | null = null
    if (paymentLags.length > 0) {
      avgPaymentLagDays = paymentLags.reduce((s, l) => s + l, 0) / paymentLags.length
    }
    if (
      avgPaymentLagDays === null &&
      connection.paymentTerms?.type === 'Days After Delivery'
    ) {
      avgPaymentLagDays = connection.paymentTerms.days
    }

    const deliveryDurations: number[] = []
    for (const order of orders) {
      if (order.deliveredAt && order.dispatchedAt) {
        deliveryDurations.push((order.deliveredAt - order.dispatchedAt) / 86400000)
      }
    }
    const avgDeliveryDays =
      deliveryDurations.length > 0
        ? deliveryDurations.reduce((s, d) => s + d, 0) / deliveryDurations.length
        : 3

    const hasEnoughHistory = paymentLags.length >= 2

    const openOrders = orders.filter(
      (o) => o.settlementState !== 'Paid' && !o.declinedAt,
    )

    for (const order of openOrders) {
      let expectedPayDate: number | null = null
      if (order.deliveredAt) {
        const lagDays = avgPaymentLagDays ?? 30
        expectedPayDate = order.deliveredAt + lagDays * 86400000
      } else if (order.dispatchedAt || order.acceptedAt) {
        const lagDays = avgPaymentLagDays ?? 30
        expectedPayDate = now + avgDeliveryDays * 86400000 + lagDays * 86400000
      } else {
        continue
      }

      const daysFromNow = (expectedPayDate - now) / 86400000
      if (!hasEnoughHistory || daysFromNow > 14) continue
      if (daysFromNow <= 7) {
        inflowThisWeek.amount += order.pendingAmount
        inflowThisWeek.count++
      } else {
        inflowNextWeek.amount += order.pendingAmount
        inflowNextWeek.count++
      }
    }
  }

  // OUTFLOWS: business is the buyer; payments we owe based on due dates.
  for (const connection of buyerConnections) {
    const orders = ordersByConnection.get(connection.id) ?? []
    const openOrders = orders.filter(
      (o) => o.settlementState !== 'Paid' && !o.declinedAt,
    )

    for (const order of openOrders) {
      if (order.calculatedDueDate === null) continue
      const daysFromNow = (order.calculatedDueDate - now) / 86400000

      if (daysFromNow <= 0 || daysFromNow <= 7) {
        outflowThisWeek.amount += order.pendingAmount
        outflowThisWeek.count++
      } else if (daysFromNow <= 14) {
        outflowNextWeek.amount += order.pendingAmount
        outflowNextWeek.count++
      }
    }
  }

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

function computeCollectionPriority(
  businessId: string,
  connections: Connection[],
  ordersByConnection: Map<string, OrderWithPaymentState[]>,
  paymentsByOrder: Map<string, PaymentEvent[]>,
  businessById: Map<string, { businessName: string; zeltoId: string; credibilityScore: number | null }>,
): CollectionItem[] {
  const supplierConnections = connections.filter((c) => c.supplierBusinessId === businessId)
  const items: CollectionItem[] = []
  const now = Date.now()

  for (const connection of supplierConnections) {
    const buyer = businessById.get(connection.buyerBusinessId)
    if (!buyer) continue

    const orders = ordersByConnection.get(connection.id) ?? []
    const overdueOrders = orders.filter(
      (o) => o.settlementState === 'Pending' || o.settlementState === 'Partial Payment',
    )
    if (overdueOrders.length === 0) continue

    const overdueAmount = overdueOrders.reduce((sum, o) => sum + o.pendingAmount, 0)
    const totalOutstanding = orders
      .filter((o) => o.settlementState !== 'Paid')
      .reduce((sum, o) => sum + o.pendingAmount, 0)

    const daysOverdue = Math.max(
      ...overdueOrders.map((o) => {
        if (o.calculatedDueDate === null) return 0
        const diff = now - o.calculatedDueDate
        return diff > 0 ? diff / 86400000 : 0
      }),
    )

    const { signal, detail } = computePatternSignal(orders, paymentsByOrder)

    const riskMultiplier: Record<CollectionItem['patternSignal'], number> = {
      worsening: 2.0,
      first_late: 1.5,
      stable: 1.0,
      improving: 0.7,
    }
    const priorityScore = (overdueAmount / 10000) * daysOverdue * riskMultiplier[signal]

    items.push({
      connectionId: connection.id,
      businessName: buyer.businessName,
      zeltoId: buyer.zeltoId,
      overdueAmount,
      daysOverdue: Math.round(daysOverdue),
      priorityScore,
      patternSignal: signal,
      patternDetail: detail,
      totalOutstanding,
      buyerTrustScore: buyer.credibilityScore,
    })
  }

  return items
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 10)
}

function computeConcentrationRisk(
  businessId: string,
  connections: Connection[],
  ordersByConnection: Map<string, OrderWithPaymentState[]>,
  businessById: Map<string, { businessName: string }>,
): ConcentrationRisk | null {
  const sumUnpaid = (orders: OrderWithPaymentState[]) =>
    orders
      .filter((o) => o.settlementState !== 'Paid')
      .reduce((sum, o) => sum + o.pendingAmount, 0)

  const buildTop = (
    subset: Connection[],
    type: 'receivable' | 'payable',
  ): ConcentrationRisk | null => {
    if (subset.length === 0) return null
    const rows = subset.map((conn) => {
      const orders = ordersByConnection.get(conn.id) ?? []
      const unpaid = sumUnpaid(orders)
      const otherBusinessId =
        type === 'receivable' ? conn.buyerBusinessId : conn.supplierBusinessId
      return { connectionId: conn.id, otherBusinessId, unpaid }
    })
    const total = rows.reduce((sum, r) => sum + r.unpaid, 0)
    if (total <= 0) return null
    const top = rows.reduce((max, r) => (r.unpaid > max.unpaid ? r : max))
    const percentage = Math.round((top.unpaid / total) * 100)
    if (percentage <= 50) return null
    const otherBiz = businessById.get(top.otherBusinessId)
    return {
      type,
      topConnectionId: top.connectionId,
      topBusinessName: otherBiz?.businessName ?? 'Unknown',
      percentage,
      totalValue: total,
      topValue: top.unpaid,
    }
  }

  const receivable = buildTop(
    connections.filter((c) => c.supplierBusinessId === businessId),
    'receivable',
  )
  if (receivable) return receivable

  const payable = buildTop(
    connections.filter((c) => c.buyerBusinessId === businessId),
    'payable',
  )
  return payable
}

function computePaymentCalendar(
  businessId: string,
  connections: Connection[],
  ordersByConnection: Map<string, OrderWithPaymentState[]>,
  businessById: Map<string, { businessName: string }>,
  selfCredibilityScore: number | null,
): PaymentCalendarItem[] {
  const buyerConnections = connections.filter((c) => c.buyerBusinessId === businessId)
  const items: PaymentCalendarItem[] = []
  const now = Date.now()

  const trustScoreIfOnTime = selfCredibilityScore
  const trustScoreIfLate =
    selfCredibilityScore !== null ? Math.max(0, selfCredibilityScore - 3) : null
  const badgeIfOnTime =
    trustScoreIfOnTime !== null ? scoreToLevel(trustScoreIfOnTime) : null
  const badgeIfLate =
    trustScoreIfLate !== null ? scoreToLevel(trustScoreIfLate) : null

  for (const connection of buyerConnections) {
    const orders = ordersByConnection.get(connection.id) ?? []
    const unpaid = orders.filter(
      (o) =>
        o.settlementState === 'Awaiting Payment' ||
        o.settlementState === 'Pending' ||
        o.settlementState === 'Partial Payment',
    )
    if (unpaid.length === 0) continue

    const supplier = businessById.get(connection.supplierBusinessId)
    const supplierName = supplier?.businessName ?? 'Unknown'

    for (const order of unpaid) {
      if (order.calculatedDueDate === null) continue
      items.push({
        orderId: order.id,
        connectionId: connection.id,
        supplierName,
        amount: order.pendingAmount,
        dueDate: order.calculatedDueDate,
        daysUntilDue: Math.round((order.calculatedDueDate - now) / 86400000),
        trustScoreIfOnTime,
        trustScoreIfLate,
        badgeIfOnTime,
        badgeIfLate,
      })
    }
  }

  return items.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: JSON_HEADERS,
      })
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: JSON_HEADERS,
      })
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null
    const businessId = body?.businessId
    if (!businessId) {
      return new Response(JSON.stringify({ error: 'businessId is required' }), {
        status: 400,
        headers: JSON_HEADERS,
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Query 1: verify the caller belongs to the requested business.
    const { data: userRow, error: userRowError } = await supabase
      .from('user_accounts')
      .select('business_entity_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userRowError || !userRow || userRow.business_entity_id !== businessId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: JSON_HEADERS,
      })
    }

    // Query 2: connections involving this business (either side).
    const { data: connectionsData, error: connError } = await supabase
      .from('connections')
      .select('*')
      .or(`buyer_business_id.eq.${businessId},supplier_business_id.eq.${businessId}`)
    if (connError) throw connError

    const connections = toCamel<Connection[]>(connectionsData ?? [])
    if (connections.length === 0) {
      return new Response(JSON.stringify(empty()), { status: 200, headers: JSON_HEADERS })
    }
    const connectionIds = connections.map((c) => c.id)

    // Query 3: orders across all connections.
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .in('connection_id', connectionIds)
    if (ordersError) throw ordersError

    const orders = toCamel<Order[]>(ordersData ?? [])
    const orderIds = orders.map((o) => o.id)

    // Query 4: payment events for those orders (only if orders exist).
    let payments: PaymentEvent[] = []
    if (orderIds.length > 0) {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment_events')
        .select('*')
        .in('order_id', orderIds)
      if (paymentsError) throw paymentsError
      payments = toCamel<PaymentEvent[]>(paymentsData ?? [])
    }

    // Query 5: counterparty + self business entities for names + cached score.
    const relevantBusinessIds = new Set<string>([businessId])
    for (const conn of connections) {
      relevantBusinessIds.add(
        conn.buyerBusinessId === businessId ? conn.supplierBusinessId : conn.buyerBusinessId,
      )
    }
    const { data: businessesData, error: bizError } = await supabase
      .from('business_entities')
      .select('id, business_name, zelto_id, credibility_score')
      .in('id', Array.from(relevantBusinessIds))
    if (bizError) throw bizError

    const businessById = new Map<
      string,
      { businessName: string; zeltoId: string; credibilityScore: number | null }
    >()
    for (const row of (businessesData ?? []) as Array<Record<string, unknown>>) {
      businessById.set(row.id as string, {
        businessName: (row.business_name as string) ?? 'Unknown',
        zeltoId: (row.zelto_id as string) ?? '',
        credibilityScore:
          row.credibility_score === null || row.credibility_score === undefined
            ? null
            : Number(row.credibility_score),
      })
    }

    // All aggregation below is pure in-memory — no further DB calls.
    const enriched = enrichConnectionOrdersWithPaymentState(orders, payments)
    const ordersByConnection = new Map<string, OrderWithPaymentState[]>()
    for (const order of enriched) {
      if (!ordersByConnection.has(order.connectionId)) {
        ordersByConnection.set(order.connectionId, [])
      }
      ordersByConnection.get(order.connectionId)!.push(order)
    }

    const paymentsByOrder = new Map<string, PaymentEvent[]>()
    for (const pe of payments) {
      if (!paymentsByOrder.has(pe.orderId)) paymentsByOrder.set(pe.orderId, [])
      paymentsByOrder.get(pe.orderId)!.push(pe)
    }

    const selfCredibility = businessById.get(businessId)?.credibilityScore ?? null

    const response: TradeIntelligenceResponse = {
      cashForecast: computeCashForecast(businessId, connections, ordersByConnection, paymentsByOrder),
      collectionItems: computeCollectionPriority(
        businessId,
        connections,
        ordersByConnection,
        paymentsByOrder,
        businessById,
      ),
      concentrationRisk: computeConcentrationRisk(
        businessId,
        connections,
        ordersByConnection,
        businessById,
      ),
      paymentCalendar: computePaymentCalendar(
        businessId,
        connections,
        ordersByConnection,
        businessById,
        selfCredibility,
      ),
    }

    return new Response(JSON.stringify(response), { status: 200, headers: JSON_HEADERS })
  } catch (err) {
    console.error('[get-trade-intelligence] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
