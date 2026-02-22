import { supabase } from './supabase-client'
import {
  AdminAccount,
  BusinessEntity,
  Connection,
  ConnectionRequest,
  ConnectionRequestStatus,
  EntityFlag,
  FrozenEntity,
  IssueReport,
  Order,
  OrderWithPaymentState,
  PaymentEvent,
  RoleChangeRequest,
  UserAccount,
} from './types'
import {
  enrichOrderWithPaymentState,
  generateZeltoId,
  snapshotPaymentTerms,
} from './business-logic'

// Helper to convert snake_case DB columns to camelCase TypeScript
function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase)
  }
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  const result: any = {}
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    result[camelKey] = toCamelCase(obj[key])
  }
  return result
}

// Helper to convert camelCase TypeScript to snake_case DB columns
function toSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase)
  }
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  const result: any = {}
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    result[snakeKey] = toSnakeCase(obj[key])
  }
  return result
}

export class ZeltoDataStore {
  // ============ BUSINESS ENTITIES ============
  
  async getAllBusinessEntities(): Promise<BusinessEntity[]> {
    const { data, error } = await supabase
      .from('business_entities')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createBusinessEntity(businessName: string): Promise<BusinessEntity> {
    const entities = await this.getAllBusinessEntities()
    const existingZeltoIds = entities.map((e) => e.zeltoId)
    
    const newEntity = {
      zelto_id: generateZeltoId(existingZeltoIds),
      business_name: businessName,
      created_at: Date.now(),
    }

    const { data, error } = await supabase
      .from('business_entities')
      .insert([newEntity])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getBusinessEntityById(id: string): Promise<BusinessEntity | undefined> {
    const { data, error } = await supabase
      .from('business_entities')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return undefined // Not found
      throw error
    }
    return toCamelCase(data)
  }

  async getBusinessEntityByZeltoId(zeltoId: string): Promise<BusinessEntity | undefined> {
    const { data, error } = await supabase
      .from('business_entities')
      .select('*')
      .eq('zelto_id', zeltoId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return undefined
      throw error
    }
    return toCamelCase(data)
  }

  async updateBusinessDetails(
    businessId: string,
    details: {
      gstNumber?: string
      address?: string
      businessType?: string
      website?: string
    }
  ): Promise<BusinessEntity> {
    const updates: any = {}
    if (details.gstNumber !== undefined) updates.gst_number = details.gstNumber
    if (details.address !== undefined) updates.business_address = details.address
    if (details.businessType !== undefined) updates.business_type = details.businessType
    if (details.website !== undefined) updates.website = details.website

    const { data, error } = await supabase
      .from('business_entities')
      .update(updates)
      .eq('id', businessId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async updateBusinessEntity(
    businessEntityId: string,
    updates: Partial<Pick<BusinessEntity, 'gstNumber' | 'businessAddress' | 'businessType' | 'website'>>
  ): Promise<BusinessEntity> {
    const dbUpdates = toSnakeCase(updates)
    const { data, error } = await supabase
      .from('business_entities')
      .update(dbUpdates)
      .eq('id', businessEntityId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async checkGSTExists(gstNumber: string, excludeEntityId?: string): Promise<boolean> {
    let query = supabase
      .from('business_entities')
      .select('id')
      .eq('gst_number', gstNumber)
    
    if (excludeEntityId) {
      query = query.neq('id', excludeEntityId)
    }

    const { data, error } = await query
    if (error) throw error
    return (data?.length || 0) > 0
  }

  // ============ USER ACCOUNTS ============

  async getAllUserAccounts(): Promise<UserAccount[]> {
    const { data, error } = await supabase
      .from('user_accounts')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createUserAccount(
    phoneNumber: string,
    businessEntityId: string
  ): Promise<UserAccount> {
    const entity = await this.getBusinessEntityById(businessEntityId)
    if (!entity) {
      throw new Error('Business entity does not exist')
    }

    const { data, error } = await supabase
      .from('user_accounts')
      .insert([{
        phone_number: phoneNumber,
        business_entity_id: businessEntityId
      }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getUserAccountsByBusinessId(businessEntityId: string): Promise<UserAccount[]> {
    const { data, error } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('business_entity_id', businessEntityId)
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async getUserAccountByPhoneNumber(phoneNumber: string): Promise<UserAccount | undefined> {
    const { data, error } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return undefined
      throw error
    }
    return toCamelCase(data)
  }
  // ============ CONNECTIONS ============

  async getAllConnections(): Promise<Connection[]> {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createConnection(
    buyerBusinessId: string,
    supplierBusinessId: string,
    paymentTerms: Connection['paymentTerms']
  ): Promise<Connection> {
    const buyer = await this.getBusinessEntityById(buyerBusinessId)
    const supplier = await this.getBusinessEntityById(supplierBusinessId)

    if (!buyer || !supplier) {
      throw new Error('Both businesses must exist')
    }

    const { data, error } = await supabase
      .from('connections')
      .insert([{
        buyer_business_id: buyerBusinessId,
        supplier_business_id: supplierBusinessId,
        payment_terms: paymentTerms,
        connection_state: 'Stable',
        behaviour_history: [],
        created_at: Date.now()
      }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getConnectionById(id: string): Promise<Connection | undefined> {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return undefined
      throw error
    }
    return toCamelCase(data)
  }

  async getConnectionsByBusinessId(businessId: string): Promise<Connection[]> {
    const { data, error} = await supabase
      .from('connections')
      .select('*')
      .or(`buyer_business_id.eq.${businessId},supplier_business_id.eq.${businessId}`)
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async updateConnectionPaymentTerms(
    connectionId: string,
    newPaymentTerms: Connection['paymentTerms']
  ): Promise<Connection> {
    const { data, error } = await supabase
      .from('connections')
      .update({ payment_terms: newPaymentTerms })
      .eq('id', connectionId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async updateConnectionState(
    connectionId: string,
    newState: Connection['connectionState']
  ): Promise<Connection> {
    const { data, error } = await supabase
      .from('connections')
      .update({ connection_state: newState })
      .eq('id', connectionId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  // ============ ORDERS ============

  async getAllOrders(): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createOrder(
    connectionId: string,
    itemSummary: string,
    orderValue: number
  ): Promise<Order> {
    const connection = await this.getConnectionById(connectionId)
    if (!connection) {
      throw new Error('Connection does not exist')
    }

    if (!connection.paymentTerms) {
      throw new Error('Payment terms must be set before creating orders')
    }

    const { data, error } = await supabase
      .from('orders')
      .insert([{
        connection_id: connectionId,
        item_summary: itemSummary,
        order_value: orderValue,
        created_at: Date.now(),
        payment_term_snapshot: snapshotPaymentTerms(connection.paymentTerms)
      }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return undefined
      throw error
    }
    return toCamelCase(data)
  }

  async getOrdersByConnectionId(connectionId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async updateOrderState(
    orderId: string,
    state: 'Accepted' | 'Dispatched' | 'Delivered' | 'Declined'
  ): Promise<Order> {
    const timestamp = Date.now()
    const updates: any = {}

    if (state === 'Accepted') updates.accepted_at = timestamp
    else if (state === 'Dispatched') updates.dispatched_at = timestamp
    else if (state === 'Delivered') updates.delivered_at = timestamp
    else if (state === 'Declined') updates.declined_at = timestamp

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async updateOrderBillToBillInvoiceDate(
    orderId: string,
    invoiceDate: number
  ): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({ bill_to_bill_invoice_date: invoiceDate })
      .eq('id', orderId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getOrderWithPaymentState(orderId: string): Promise<OrderWithPaymentState> {
    const order = await this.getOrderById(orderId)
    if (!order) {
      throw new Error('Order not found')
    }
    const payments = await this.getPaymentEventsByOrderId(orderId)
    return enrichOrderWithPaymentState(order, payments)
  }

  async getAllOrdersWithPaymentState(): Promise<OrderWithPaymentState[]> {
    const orders = await this.getAllOrders()
    const allPayments = await this.getAllPaymentEvents()
    
    return orders.map(order => {
      const payments = allPayments.filter(p => p.orderId === order.id)
      return enrichOrderWithPaymentState(order, payments)
    })
  }

  async getOrdersWithPaymentStateByConnectionId(
    connectionId: string
  ): Promise<OrderWithPaymentState[]> {
    const orders = await this.getOrdersByConnectionId(connectionId)
    const allPayments = await this.getAllPaymentEvents()
    
    return orders.map(order => {
      const payments = allPayments.filter(p => p.orderId === order.id)
      return enrichOrderWithPaymentState(order, payments)
    })
  }
  // ============ PAYMENT EVENTS ============

  async getAllPaymentEvents(): Promise<PaymentEvent[]> {
    const { data, error } = await supabase
      .from('payment_events')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createPaymentEvent(
    orderId: string,
    amountPaid: number,
    recordedBy: string
  ): Promise<PaymentEvent> {
    const order = await this.getOrderById(orderId)
    if (!order) {
      throw new Error('Order does not exist')
    }

    const { data, error } = await supabase
      .from('payment_events')
      .insert([{
        order_id: orderId,
        amount_paid: amountPaid,
        timestamp: Date.now(),
        recorded_by: recordedBy,
        disputed: false
      }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getPaymentEventsByOrderId(orderId: string): Promise<PaymentEvent[]> {
    const { data, error } = await supabase
      .from('payment_events')
      .select('*')
      .eq('order_id', orderId)
      .order('timestamp', { ascending: true })
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async updatePaymentEventDispute(
    paymentEventId: string,
    disputed: boolean
  ): Promise<PaymentEvent> {
    const updates: any = { disputed }
    if (disputed) {
      updates.disputed_at = Date.now()
    }

    const { data, error } = await supabase
      .from('payment_events')
      .update(updates)
      .eq('id', paymentEventId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async acceptPaymentEvent(paymentEventId: string): Promise<PaymentEvent> {
    const { data, error } = await supabase
      .from('payment_events')
      .update({ accepted_at: Date.now() })
      .eq('id', paymentEventId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  // ============ ISSUE REPORTS ============

  async getAllIssueReports(): Promise<IssueReport[]> {
    const { data, error } = await supabase
      .from('issue_reports')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createIssueReport(
    orderId: string,
    issueType: IssueReport['issueType'],
    severity: IssueReport['severity'],
    raisedBy: IssueReport['raisedBy']
  ): Promise<IssueReport> {
    const order = await this.getOrderById(orderId)
    if (!order) {
      throw new Error('Order does not exist')
    }

    const { data, error } = await supabase
      .from('issue_reports')
      .insert([{
        order_id: orderId,
        issue_type: issueType,
        severity,
        raised_by: raisedBy,
        status: 'Open',
        created_at: Date.now()
      }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async updateIssueStatus(
    issueId: string,
    status: IssueReport['status']
  ): Promise<IssueReport> {
    const { data, error } = await supabase
      .from('issue_reports')
      .update({ status })
      .eq('id', issueId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getIssueReportsByOrderId(orderId: string): Promise<IssueReport[]> {
    const { data, error } = await supabase
      .from('issue_reports')
      .select('*')
      .eq('order_id', orderId)
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  // ============ CONNECTION REQUESTS ============

  async getAllConnectionRequests(): Promise<ConnectionRequest[]> {
    const { data, error } = await supabase
      .from('connection_requests')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createConnectionRequest(
    requesterBusinessId: string,
    receiverBusinessId: string,
    requesterRole: 'buyer' | 'supplier',
    receiverRole: 'buyer' | 'supplier'
  ): Promise<ConnectionRequest> {
    const { data, error } = await supabase
      .from('connection_requests')
      .insert([{
        requester_business_id: requesterBusinessId,
        receiver_business_id: receiverBusinessId,
        requester_role: requesterRole,
        receiver_role: receiverRole,
        status: 'Pending',
        created_at: Date.now()
      }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getConnectionRequestsByBusinessId(businessId: string): Promise<ConnectionRequest[]> {
    const { data, error } = await supabase
      .from('connection_requests')
      .select('*')
      .or(`receiver_business_id.eq.${businessId},requester_business_id.eq.${businessId}`)
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async updateConnectionRequestStatus(
    requestId: string,
    status: ConnectionRequestStatus
  ): Promise<ConnectionRequest> {
    const updates: any = { status }
    if (status !== 'Pending') {
      updates.resolved_at = Date.now()
    }

    const { data, error } = await supabase
      .from('connection_requests')
      .update(updates)
      .eq('id', requestId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  // ============ ROLE CHANGE REQUESTS ============

  async getAllRoleChangeRequests(): Promise<RoleChangeRequest[]> {
    const { data, error } = await supabase
      .from('role_change_requests')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createRoleChangeRequest(
    connectionId: string,
    requestedByBusinessId: string
  ): Promise<RoleChangeRequest> {
    const { data, error } = await supabase
      .from('role_change_requests')
      .insert([{
        connection_id: connectionId,
        requested_by_business_id: requestedByBusinessId,
        status: 'pending',
        created_at: Date.now()
      }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getRoleChangeRequestsByConnectionId(connectionId: string): Promise<RoleChangeRequest[]> {
    const { data, error } = await supabase
      .from('role_change_requests')
      .select('*')
      .eq('connection_id', connectionId)
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async updateRoleChangeRequestStatus(
    requestId: string,
    status: 'approved' | 'declined'
  ): Promise<RoleChangeRequest> {
    const { data, error } = await supabase
      .from('role_change_requests')
      .update({ 
        status,
        resolved_at: Date.now()
      })
      .eq('id', requestId)
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }
  // ============ ADMIN ACCOUNTS ============

  async getAllAdminAccounts(): Promise<AdminAccount[]> {
    const { data, error } = await supabase
      .from('admin_accounts')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createAdminAccount(username: string, password: string): Promise<AdminAccount> {
    const { data, error } = await supabase
      .from('admin_accounts')
      .insert([{ username, password }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getAdminAccountByUsername(username: string): Promise<AdminAccount | undefined> {
    const { data, error } = await supabase
      .from('admin_accounts')
      .select('*')
      .eq('username', username)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return undefined
      throw error
    }
    return toCamelCase(data)
  }

  // ============ ENTITY FLAGS ============

  async getAllEntityFlags(): Promise<EntityFlag[]> {
    const { data, error } = await supabase
      .from('entity_flags')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async createEntityFlag(
    entityId: string,
    roleContext: EntityFlag['roleContext'],
    flagType: EntityFlag['flagType'],
    note: string,
    adminUsername: string
  ): Promise<EntityFlag> {
    const { data, error } = await supabase
      .from('entity_flags')
      .insert([{
        entity_id: entityId,
        role_context: roleContext,
        flag_type: flagType,
        note,
        timestamp: Date.now(),
        admin_username: adminUsername
      }])
      .select()
      .single()
    
    if (error) throw error
    return toCamelCase(data)
  }

  async getEntityFlagsByEntityId(entityId: string): Promise<EntityFlag[]> {
    const { data, error } = await supabase
      .from('entity_flags')
      .select('*')
      .eq('entity_id', entityId)
      .order('timestamp', { ascending: false })
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async getCurrentFlagForEntity(
    entityId: string,
    roleContext: EntityFlag['roleContext']
  ): Promise<EntityFlag | undefined> {
    const { data, error } = await supabase
      .from('entity_flags')
      .select('*')
      .eq('entity_id', entityId)
      .eq('role_context', roleContext)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return undefined
      throw error
    }
    return toCamelCase(data)
  }

  // ============ FROZEN ENTITIES ============

  async getAllFrozenEntities(): Promise<FrozenEntity[]> {
    const { data, error } = await supabase
      .from('frozen_entities')
      .select('*')
    
    if (error) throw error
    return toCamelCase(data || [])
  }

  async freezeEntity(
    entityId: string,
    note: string,
    adminUsername: string
  ): Promise<FrozenEntity> {
    const { data, error } = await supabase
      .from('frozen_entities')
      .insert([{
        entity_id: entityId,
        frozen_at: Date.now(),
        note,
        admin_username: adminUsername
      }])
      .select()
      .single()
    
    if (error) throw error

    // Also create suspended flags
    await this.createEntityFlag(entityId, 'buyer', 'Suspended', note, adminUsername)
    await this.createEntityFlag(entityId, 'supplier', 'Suspended', note, adminUsername)
    
    return toCamelCase(data)
  }

  async getFrozenEntityByEntityId(entityId: string): Promise<FrozenEntity | undefined> {
    const { data, error } = await supabase
      .from('frozen_entities')
      .select('*')
      .eq('entity_id', entityId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return undefined
      throw error
    }
    return toCamelCase(data)
  }

  // ============ UTILITY ============

  async clearAllData(): Promise<void> {
    // Delete in reverse order of dependencies
    await supabase.from('payment_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('issue_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('role_change_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('connection_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('connections').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('entity_flags').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('frozen_entities').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('user_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('business_entities').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('admin_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  }
}

export const dataStore = new ZeltoDataStore()
