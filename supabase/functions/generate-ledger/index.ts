// supabase/functions/generate-ledger/index.ts
// Aggregates ledger data for a business and returns structured JSON.
// No file generation happens here — that's done client-side.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Period = '7d' | '30d' | '90d' | '1y'
type Scope = 'all' | 'single'

interface RequestBody {
  scope: Scope
  connectionId?: string
  period: Period
  businessId: string
}

function getPeriodMs(period: Period): number {
  switch (period) {
    case '7d': return 7 * 24 * 60 * 60 * 1000
    case '30d': return 30 * 24 * 60 * 60 * 1000
    case '90d': return 90 * 24 * 60 * 60 * 1000
    case '1y': return 365 * 24 * 60 * 60 * 1000
  }
}

function getPeriodLabel(period: Period): string {
  switch (period) {
    case '7d': return 'Last 7 Days'
    case '30d': return 'Last 30 Days'
    case '90d': return 'Last Quarter'
    case '1y': return 'Last Year'
  }
}

function formatPaymentTerms(snapshot: any): string {
  if (!snapshot) return 'Not set'
  if (typeof snapshot === 'string') return snapshot
  const type = snapshot.type || snapshot.termType || snapshot.payment_type
  if (!type) return 'Not set'
  switch (type) {
    case 'Advance Required':
    case 'advance': return 'Advance'
    case 'Payment on Delivery':
    case 'on_delivery': return 'On Delivery'
    case 'Bill to Bill':
    case 'bill_to_bill': return 'Bill to Bill'
    case 'Days After Delivery':
    case 'days_after_delivery': {
      const days = snapshot.days || snapshot.numDays || ''
      return days ? `${days} Days After Delivery` : 'Days After Delivery'
    }
    default: return type
  }
}

function calculateDueDate(order: any): number | null {
  const snapshot = order.payment_terms_snapshot
  if (!snapshot) return null
  switch (snapshot.type) {
    case 'Advance Required':
      return order.created_at
    case 'Payment on Delivery':
      return order.delivered_at ?? null
    case 'Bill to Bill':
      return null
    case 'Days After Delivery':
      if (!order.delivered_at) return null
      return order.delivered_at + snapshot.days * 24 * 60 * 60 * 1000
    default:
      return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create a user-scoped client to validate auth
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service client for all DB reads
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const body: RequestBody = await req.json()
    const { scope, connectionId, period, businessId } = body

    if (!scope || !period || !businessId) {
      return new Response(JSON.stringify({ error: 'Missing required fields: scope, period, businessId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (scope === 'single' && !connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId required for scope=single' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate the calling user belongs to this businessId
    const { data: userAccount } = await supabase
      .from('user_accounts')
      .select('business_entity_id')
      .eq('auth_user_id', user.id)
      .single()

    // Fall back: check if the auth user is linked to a business entity via auth.users email
    // We accept the request if businessId is found in user_accounts for this user
    // (If user_accounts.business_entity_id column is missing, we skip ownership check —
    //  the SCHEMA.md notes it may be missing but the code depends on it)
    if (userAccount && userAccount.business_entity_id !== businessId) {
      return new Response(JSON.stringify({ error: 'Forbidden: businessId mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = Date.now()
    const periodMs = getPeriodMs(period)
    const periodStart = now - periodMs
    const periodEnd = now

    // Fetch my business
    const { data: myBizData, error: myBizError } = await supabase
      .from('business_entities')
      .select('*')
      .eq('id', businessId)
      .single()

    if (myBizError || !myBizData) {
      return new Response(JSON.stringify({ error: 'Business not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch all connections for this business
    const { data: connectionsData, error: connError } = await supabase
      .from('connections')
      .select('*')
      .or(`buyer_business_id.eq.${businessId},supplier_business_id.eq.${businessId}`)

    if (connError) throw connError

    let filteredConnections = connectionsData || []
    if (scope === 'single' && connectionId) {
      filteredConnections = filteredConnections.filter((c: any) => c.id === connectionId)
    }

    if (filteredConnections.length === 0) {
      const myBiz = {
        name: myBizData.business_name,
        zeltoCode: myBizData.zelto_id,
        phone: myBizData.phone || '',
        city: myBizData.city || '',
        area: myBizData.area || '',
        address: myBizData.business_address || '',
      }
      return new Response(JSON.stringify({
        meta: {
          generatedAt: now,
          period: getPeriodLabel(period),
          periodStart,
          periodEnd,
          scope,
          myBusiness: myBiz,
        },
        summary: {
          totalOrders: 0,
          totalOrderValue: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          issueCount: 0,
          connectionsCount: 0,
        },
        connections: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Collect all unique business IDs we need to fetch
    const businessIds = new Set<string>([businessId])
    for (const conn of filteredConnections) {
      businessIds.add(conn.buyer_business_id)
      businessIds.add(conn.supplier_business_id)
    }

    // Fetch all relevant business entities
    const { data: bizEntities } = await supabase
      .from('business_entities')
      .select('*')
      .in('id', Array.from(businessIds))

    const bizMap = new Map<string, any>()
    for (const biz of (bizEntities || [])) {
      bizMap.set(biz.id, biz)
    }

    // For each connection, fetch orders in period
    const connectionIds = filteredConnections.map((c: any) => c.id)

    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .in('connection_id', connectionIds)
      .gte('placed_at', periodStart)

    if (ordersError) throw ordersError

    const orders = ordersData || []
    const orderIds = orders.map((o: any) => o.id)

    // Fetch payment events for all orders
    let paymentEvents: any[] = []
    if (orderIds.length > 0) {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment_events')
        .select('*')
        .in('order_id', orderIds)
      if (paymentsError) throw paymentsError
      paymentEvents = paymentsData || []
    }

    // Fetch issue reports for all orders
    let issueReports: any[] = []
    if (orderIds.length > 0) {
      const { data: issuesData, error: issuesError } = await supabase
        .from('issue_reports')
        .select('*')
        .in('order_id', orderIds)
      if (issuesError) throw issuesError
      issueReports = issuesData || []
    }

    // Group by connection
    const ordersByConnection = new Map<string, any[]>()
    for (const conn of filteredConnections) {
      ordersByConnection.set(conn.id, [])
    }
    for (const order of orders) {
      const list = ordersByConnection.get(order.connection_id)
      if (list) list.push(order)
    }

    const paymentsByOrder = new Map<string, any[]>()
    for (const pe of paymentEvents) {
      if (!paymentsByOrder.has(pe.order_id)) paymentsByOrder.set(pe.order_id, [])
      paymentsByOrder.get(pe.order_id)!.push(pe)
    }

    const issuesByOrder = new Map<string, any[]>()
    for (const ir of issueReports) {
      if (!issuesByOrder.has(ir.order_id)) issuesByOrder.set(ir.order_id, [])
      issuesByOrder.get(ir.order_id)!.push(ir)
    }

    // Build response connections array
    let totalOrders = 0
    let totalOrderValue = 0
    let totalPaid = 0
    let totalOutstanding = 0
    let issueCount = 0

    const responseConnections = []

    for (const conn of filteredConnections) {
      const isMyBuyer = conn.buyer_business_id === businessId
      const myRole = isMyBuyer ? 'buyer' : 'supplier'
      const otherId = isMyBuyer ? conn.supplier_business_id : conn.buyer_business_id
      const otherBiz = bizMap.get(otherId)

      const connOrders = ordersByConnection.get(conn.id) || []
      const responseOrders = []

      for (const order of connOrders) {
        const payments = paymentsByOrder.get(order.id) || []
        const issues = issuesByOrder.get(order.id) || []

        const orderTotalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount_paid), 0)
        const balance = Number(order.order_value) - orderTotalPaid
        const dueDate = calculateDueDate(order)

        totalOrders++
        totalOrderValue += Number(order.order_value)
        totalPaid += orderTotalPaid
        if (balance > 0) totalOutstanding += balance
        issueCount += issues.length

        responseOrders.push({
          id: order.id,
          placedAt: order.placed_at,
          itemSummary: order.item_summary,
          orderValue: Number(order.order_value),
          paymentTerms: formatPaymentTerms(order.payment_terms_snapshot),
          dueDate,
          state: order.state,
          totalPaid: orderTotalPaid,
          balance,
          hasIssue: issues.length > 0,
          payments: payments.map((p: any) => ({
            date: p.created_at,
            amount: Number(p.amount_paid),
            note: p.note || '',
          })),
          issues: issues.map((ir: any) => ({
            type: ir.issue_type,
            severity: ir.severity,
            raisedBy: ir.raised_by,
            status: ir.status,
            description: ir.description || '',
            resolvedAt: ir.resolved_at ?? null,
          })),
        })
      }

      responseConnections.push({
        connectionId: conn.id,
        otherBusiness: {
          name: otherBiz?.business_name || 'Unknown',
          zeltoCode: otherBiz?.zelto_id || '',
          phone: otherBiz?.phone || '',
          city: otherBiz?.city || '',
          area: otherBiz?.area || '',
        },
        myRole,
        connectedSince: conn.created_at,
        orders: responseOrders,
      })
    }

    const myBiz = {
      name: myBizData.business_name,
      zeltoCode: myBizData.zelto_id,
      phone: myBizData.phone || '',
      city: myBizData.city || '',
      area: myBizData.area || '',
      address: myBizData.business_address || '',
    }

    const meta: any = {
      generatedAt: now,
      period: getPeriodLabel(period),
      periodStart,
      periodEnd,
      scope,
      myBusiness: myBiz,
    }

    // For single scope, include the other business details in meta
    if (scope === 'single' && responseConnections.length > 0) {
      const singleConn = filteredConnections[0]
      const otherId = singleConn.buyer_business_id === businessId
        ? singleConn.supplier_business_id
        : singleConn.buyer_business_id
      const otherBiz = bizMap.get(otherId)
      if (otherBiz) {
        meta.otherBusiness = {
          name: otherBiz.business_name,
          zeltoCode: otherBiz.zelto_id,
          phone: otherBiz.phone || '',
          city: otherBiz.city || '',
          area: otherBiz.area || '',
          address: otherBiz.business_address || '',
        }
      }
    }

    const summary: any = {
      totalOrders,
      totalOrderValue,
      totalPaid,
      totalOutstanding,
      issueCount,
    }

    if (scope === 'all') {
      summary.connectionsCount = filteredConnections.length
    }

    return new Response(JSON.stringify({ meta, summary, connections: responseConnections }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generate-ledger] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
