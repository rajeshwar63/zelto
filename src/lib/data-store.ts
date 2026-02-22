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

const KV_KEYS = {
  BUSINESS_ENTITIES: 'zelto:business-entities',
  USER_ACCOUNTS: 'zelto:user-accounts',
  CONNECTIONS: 'zelto:connections',
  ORDERS: 'zelto:orders',
  PAYMENT_EVENTS: 'zelto:payment-events',
  ISSUE_REPORTS: 'zelto:issue-reports',
  ADMIN_ACCOUNTS: 'zelto:admin-accounts',
  ENTITY_FLAGS: 'zelto:entity-flags',
  FROZEN_ENTITIES: 'zelto:frozen-entities',
  CONNECTION_REQUESTS: 'zelto:connection-requests',
  ROLE_CHANGE_REQUESTS: 'zelto:role-change-requests',
}

export class ZeltoDataStore {
  async getAllBusinessEntities(): Promise<BusinessEntity[]> {
    const entities = await spark.kv.get<BusinessEntity[]>(KV_KEYS.BUSINESS_ENTITIES)
    return entities || []
  }

  async createBusinessEntity(
    businessName: string
  ): Promise<BusinessEntity> {
    const entities = await this.getAllBusinessEntities()
    const existingZeltoIds = entities.map((e) => e.zeltoId)
    
    const newEntity: BusinessEntity = {
      id: crypto.randomUUID(),
      zeltoId: generateZeltoId(existingZeltoIds),
      businessName,
      createdAt: Date.now(),
    }

    await spark.kv.set(KV_KEYS.BUSINESS_ENTITIES, [...entities, newEntity])
    return newEntity
  }

  async getBusinessEntityById(id: string): Promise<BusinessEntity | undefined> {
    const entities = await this.getAllBusinessEntities()
    return entities.find((e) => e.id === id)
  }

  async getAllUserAccounts(): Promise<UserAccount[]> {
    const accounts = await spark.kv.get<UserAccount[]>(KV_KEYS.USER_ACCOUNTS)
    return accounts || []
  }

  async createUserAccount(
    phoneNumber: string,
    businessEntityId: string
  ): Promise<UserAccount> {
    const entity = await this.getBusinessEntityById(businessEntityId)
    if (!entity) {
      throw new Error('Business entity does not exist')
    }

    const accounts = await this.getAllUserAccounts()
    const newAccount: UserAccount = {
      id: crypto.randomUUID(),
      phoneNumber,
      businessEntityId,
    }

    await spark.kv.set(KV_KEYS.USER_ACCOUNTS, [...accounts, newAccount])
    return newAccount
  }

  async getUserAccountsByBusinessId(businessEntityId: string): Promise<UserAccount[]> {
    const accounts = await this.getAllUserAccounts()
    return accounts.filter((a) => a.businessEntityId === businessEntityId)
  }

  async getAllConnections(): Promise<Connection[]> {
    const connections = await spark.kv.get<Connection[]>(KV_KEYS.CONNECTIONS)
    return connections || []
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

    const connections = await this.getAllConnections()
    const newConnection: Connection = {
      id: crypto.randomUUID(),
      buyerBusinessId,
      supplierBusinessId,
      paymentTerms,
      connectionState: 'Stable',
      behaviourHistory: [],
      createdAt: Date.now(),
    }

    await spark.kv.set(KV_KEYS.CONNECTIONS, [...connections, newConnection])
    return newConnection
  }

  async getConnectionById(id: string): Promise<Connection | undefined> {
    const connections = await this.getAllConnections()
    return connections.find((c) => c.id === id)
  }

  async getConnectionsByBusinessId(businessId: string): Promise<Connection[]> {
    const connections = await this.getAllConnections()
    return connections.filter(
      (c) => c.buyerBusinessId === businessId || c.supplierBusinessId === businessId
    )
  }

  async updateConnectionPaymentTerms(
    connectionId: string,
    newPaymentTerms: Connection['paymentTerms']
  ): Promise<Connection> {
    const connections = await this.getAllConnections()
    const index = connections.findIndex((c) => c.id === connectionId)

    if (index === -1) {
      throw new Error('Connection not found')
    }

    connections[index] = {
      ...connections[index],
      paymentTerms: newPaymentTerms,
    }

    await spark.kv.set(KV_KEYS.CONNECTIONS, connections)
    return connections[index]
  }

  async updateConnectionState(
    connectionId: string,
    newState: Connection['connectionState']
  ): Promise<Connection> {
    const connections = await this.getAllConnections()
    const index = connections.findIndex((c) => c.id === connectionId)

    if (index === -1) {
      throw new Error('Connection not found')
    }

    connections[index] = {
      ...connections[index],
      connectionState: newState,
    }

    await spark.kv.set(KV_KEYS.CONNECTIONS, connections)
    return connections[index]
  }

  async getAllOrders(): Promise<Order[]> {
    const orders = await spark.kv.get<Order[]>(KV_KEYS.ORDERS)
    return orders || []
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

    const orders = await this.getAllOrders()
    const newOrder: Order = {
      id: crypto.randomUUID(),
      connectionId,
      itemSummary,
      orderValue,
      createdAt: Date.now(),
      acceptedAt: null,
      dispatchedAt: null,
      deliveredAt: null,
      declinedAt: null,
      paymentTermSnapshot: snapshotPaymentTerms(connection.paymentTerms),
      billToBillInvoiceDate: null,
    }

    await spark.kv.set(KV_KEYS.ORDERS, [...orders, newOrder])
    return newOrder
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    const orders = await this.getAllOrders()
    return orders.find((o) => o.id === id)
  }

  async getOrdersByConnectionId(connectionId: string): Promise<Order[]> {
    const orders = await this.getAllOrders()
    return orders.filter((o) => o.connectionId === connectionId)
  }

  async updateOrderState(
    orderId: string,
    state: 'Accepted' | 'Dispatched' | 'Delivered' | 'Declined'
  ): Promise<Order> {
    const orders = await this.getAllOrders()
    const index = orders.findIndex((o) => o.id === orderId)

    if (index === -1) {
      throw new Error('Order not found')
    }

    const timestamp = Date.now()
    const updates: Partial<Order> = {}

    if (state === 'Accepted') {
      updates.acceptedAt = timestamp
    } else if (state === 'Dispatched') {
      updates.dispatchedAt = timestamp
    } else if (state === 'Delivered') {
      updates.deliveredAt = timestamp
    } else if (state === 'Declined') {
      updates.declinedAt = timestamp
    }

    orders[index] = { ...orders[index], ...updates }
    await spark.kv.set(KV_KEYS.ORDERS, orders)
    return orders[index]
  }

  async updateOrderBillToBillInvoiceDate(
    orderId: string,
    invoiceDate: number
  ): Promise<Order> {
    const orders = await this.getAllOrders()
    const index = orders.findIndex((o) => o.id === orderId)

    if (index === -1) {
      throw new Error('Order not found')
    }

    orders[index] = {
      ...orders[index],
      billToBillInvoiceDate: invoiceDate,
    }

    await spark.kv.set(KV_KEYS.ORDERS, orders)
    return orders[index]
  }

  async getAllPaymentEvents(): Promise<PaymentEvent[]> {
    const events = await spark.kv.get<PaymentEvent[]>(KV_KEYS.PAYMENT_EVENTS)
    return events || []
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

    const events = await this.getAllPaymentEvents()
    const newEvent: PaymentEvent = {
      id: crypto.randomUUID(),
      orderId,
      amountPaid,
      timestamp: Date.now(),
      recordedBy,
      disputed: false,
      disputedAt: null,
      acceptedAt: null,
    }

    await spark.kv.set(KV_KEYS.PAYMENT_EVENTS, [...events, newEvent])
    return newEvent
  }

  async getPaymentEventsByOrderId(orderId: string): Promise<PaymentEvent[]> {
    const events = await this.getAllPaymentEvents()
    return events.filter((e) => e.orderId === orderId)
  }

  async disputePaymentEvent(paymentId: string): Promise<PaymentEvent> {
    const events = await this.getAllPaymentEvents()
    const index = events.findIndex((e) => e.id === paymentId)
    
    if (index === -1) {
      throw new Error('Payment event not found')
    }

    events[index] = {
      ...events[index],
      disputed: true,
      disputedAt: Date.now(),
    }

    await spark.kv.set(KV_KEYS.PAYMENT_EVENTS, events)
    return events[index]
  }

  async acceptPaymentEvent(paymentId: string): Promise<PaymentEvent> {
    const events = await this.getAllPaymentEvents()
    const index = events.findIndex((e) => e.id === paymentId)
    
    if (index === -1) {
      throw new Error('Payment event not found')
    }

    events[index] = {
      ...events[index],
      acceptedAt: Date.now(),
    }

    await spark.kv.set(KV_KEYS.PAYMENT_EVENTS, events)
    return events[index]
  }

  async getOrderWithPaymentState(orderId: string): Promise<OrderWithPaymentState | undefined> {
    const order = await this.getOrderById(orderId)
    if (!order) return undefined

    const allPaymentEvents = await this.getAllPaymentEvents()
    return enrichOrderWithPaymentState(order, allPaymentEvents)
  }

  async getAllOrdersWithPaymentState(): Promise<OrderWithPaymentState[]> {
    const orders = await this.getAllOrders()
    const allPaymentEvents = await this.getAllPaymentEvents()

    return orders.map((order) =>
      enrichOrderWithPaymentState(order, allPaymentEvents)
    )
  }

  async getOrdersWithPaymentStateByConnectionId(
    connectionId: string
  ): Promise<OrderWithPaymentState[]> {
    const orders = await this.getOrdersByConnectionId(connectionId)
    const allPaymentEvents = await this.getAllPaymentEvents()

    return orders.map((order) =>
      enrichOrderWithPaymentState(order, allPaymentEvents)
    )
  }

  async getAllIssueReports(): Promise<IssueReport[]> {
    const issues = await spark.kv.get<IssueReport[]>(KV_KEYS.ISSUE_REPORTS)
    return issues || []
  }

  async createIssueReport(
    orderId: string,
    issueType: IssueReport['issueType'],
    severity: IssueReport['severity'],
    raisedBy: IssueReport['raisedBy']
  ): Promise<IssueReport> {
    const order = await this.getOrderById(orderId)
    if (!order) {
      throw new Error('Issue must be attached to an existing order')
    }

    const issues = await this.getAllIssueReports()
    const newIssue: IssueReport = {
      id: crypto.randomUUID(),
      orderId,
      issueType,
      severity,
      raisedBy,
      status: 'Open',
      createdAt: Date.now(),
    }

    await spark.kv.set(KV_KEYS.ISSUE_REPORTS, [...issues, newIssue])
    return newIssue
  }

  async updateIssueStatus(
    issueId: string,
    status: IssueReport['status']
  ): Promise<IssueReport> {
    const issues = await this.getAllIssueReports()
    const index = issues.findIndex((i) => i.id === issueId)

    if (index === -1) {
      throw new Error('Issue report not found')
    }

    issues[index] = { ...issues[index], status }
    await spark.kv.set(KV_KEYS.ISSUE_REPORTS, issues)
    return issues[index]
  }

  async getIssueReportsByOrderId(orderId: string): Promise<IssueReport[]> {
    const issues = await this.getAllIssueReports()
    return issues.filter((i) => i.orderId === orderId)
  }

  async clearAllData(): Promise<void> {
    await spark.kv.delete(KV_KEYS.BUSINESS_ENTITIES)
    await spark.kv.delete(KV_KEYS.USER_ACCOUNTS)
    await spark.kv.delete(KV_KEYS.CONNECTIONS)
    await spark.kv.delete(KV_KEYS.ORDERS)
    await spark.kv.delete(KV_KEYS.PAYMENT_EVENTS)
    await spark.kv.delete(KV_KEYS.ISSUE_REPORTS)
  }

  async getAllAdminAccounts(): Promise<AdminAccount[]> {
    const accounts = await spark.kv.get<AdminAccount[]>(KV_KEYS.ADMIN_ACCOUNTS)
    return accounts || []
  }

  async createAdminAccount(username: string, password: string): Promise<AdminAccount> {
    const accounts = await this.getAllAdminAccounts()
    const newAccount: AdminAccount = {
      id: crypto.randomUUID(),
      username,
      password,
    }
    await spark.kv.set(KV_KEYS.ADMIN_ACCOUNTS, [...accounts, newAccount])
    return newAccount
  }

  async getAdminAccountByUsername(username: string): Promise<AdminAccount | undefined> {
    const accounts = await this.getAllAdminAccounts()
    return accounts.find((a) => a.username === username)
  }

  async getAllEntityFlags(): Promise<EntityFlag[]> {
    const flags = await spark.kv.get<EntityFlag[]>(KV_KEYS.ENTITY_FLAGS)
    return flags || []
  }

  async createEntityFlag(
    entityId: string,
    roleContext: EntityFlag['roleContext'],
    flagType: EntityFlag['flagType'],
    note: string,
    adminUsername: string
  ): Promise<EntityFlag> {
    const flags = await this.getAllEntityFlags()
    const newFlag: EntityFlag = {
      id: crypto.randomUUID(),
      entityId,
      roleContext,
      flagType,
      note,
      timestamp: Date.now(),
      adminUsername,
    }
    await spark.kv.set(KV_KEYS.ENTITY_FLAGS, [...flags, newFlag])
    return newFlag
  }

  async getEntityFlagsByEntityId(entityId: string): Promise<EntityFlag[]> {
    const flags = await this.getAllEntityFlags()
    return flags.filter((f) => f.entityId === entityId)
  }

  async getCurrentFlagForEntity(
    entityId: string,
    roleContext: EntityFlag['roleContext']
  ): Promise<EntityFlag | undefined> {
    const flags = await this.getEntityFlagsByEntityId(entityId)
    const contextFlags = flags.filter((f) => f.roleContext === roleContext)
    if (contextFlags.length === 0) return undefined
    return contextFlags.sort((a, b) => b.timestamp - a.timestamp)[0]
  }

  async getAllFrozenEntities(): Promise<FrozenEntity[]> {
    const frozen = await spark.kv.get<FrozenEntity[]>(KV_KEYS.FROZEN_ENTITIES)
    return frozen || []
  }

  async freezeEntity(
    entityId: string,
    note: string,
    adminUsername: string
  ): Promise<FrozenEntity> {
    const frozen = await this.getAllFrozenEntities()
    const newFrozen: FrozenEntity = {
      id: crypto.randomUUID(),
      entityId,
      frozenAt: Date.now(),
      note,
      adminUsername,
    }
    await spark.kv.set(KV_KEYS.FROZEN_ENTITIES, [...frozen, newFrozen])
    
    await this.createEntityFlag(entityId, 'buyer', 'Suspended', note, adminUsername)
    await this.createEntityFlag(entityId, 'supplier', 'Suspended', note, adminUsername)
    
    return newFrozen
  }

  async getFrozenEntityByEntityId(entityId: string): Promise<FrozenEntity | undefined> {
    const frozen = await this.getAllFrozenEntities()
    return frozen.find((f) => f.entityId === entityId)
  }

  async updateBusinessEntity(
    businessEntityId: string,
    updates: Partial<Pick<BusinessEntity, 'gstNumber' | 'businessAddress' | 'businessType' | 'website'>>
  ): Promise<BusinessEntity> {
    const entities = await this.getAllBusinessEntities()
    const index = entities.findIndex((e) => e.id === businessEntityId)
    if (index === -1) {
      throw new Error('Business entity not found')
    }

    const updated = { ...entities[index], ...updates }
    entities[index] = updated
    await spark.kv.set(KV_KEYS.BUSINESS_ENTITIES, entities)
    return updated
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
    const entities = await this.getAllBusinessEntities()
    const index = entities.findIndex((e) => e.id === businessId)
    
    if (index === -1) {
      throw new Error('Business entity not found')
    }

    const updates: Partial<BusinessEntity> = {}
    if (details.gstNumber !== undefined) updates.gstNumber = details.gstNumber
    if (details.address !== undefined) updates.businessAddress = details.address
    if (details.businessType !== undefined) updates.businessType = details.businessType as BusinessEntity['businessType']
    if (details.website !== undefined) updates.website = details.website

    entities[index] = { ...entities[index], ...updates }
    await spark.kv.set(KV_KEYS.BUSINESS_ENTITIES, entities)
    return entities[index]
  }

  async getBusinessEntityByZeltoId(zeltoId: string): Promise<BusinessEntity | undefined> {
    const entities = await this.getAllBusinessEntities()
    return entities.find((e) => e.zeltoId === zeltoId)
  }

  async checkGSTExists(gstNumber: string, excludeEntityId?: string): Promise<boolean> {
    const entities = await this.getAllBusinessEntities()
    return entities.some((e) => e.gstNumber === gstNumber && e.id !== excludeEntityId)
  }

  async getUserAccountByPhoneNumber(phoneNumber: string): Promise<UserAccount | undefined> {
    const accounts = await this.getAllUserAccounts()
    return accounts.find((a) => a.phoneNumber === phoneNumber)
  }

  async getAllConnectionRequests(): Promise<ConnectionRequest[]> {
    const requests = await spark.kv.get<ConnectionRequest[]>(KV_KEYS.CONNECTION_REQUESTS)
    return requests || []
  }

  async createConnectionRequest(
    requesterBusinessId: string,
    receiverBusinessId: string,
    requesterRole: 'buyer' | 'supplier',
    receiverRole: 'buyer' | 'supplier'
  ): Promise<ConnectionRequest> {
    const requests = await this.getAllConnectionRequests()
    const newRequest: ConnectionRequest = {
      id: crypto.randomUUID(),
      requesterBusinessId,
      receiverBusinessId,
      requesterRole,
      receiverRole,
      status: 'Pending' as ConnectionRequestStatus,
      createdAt: Date.now(),
      resolvedAt: null,
    }
    await spark.kv.set(KV_KEYS.CONNECTION_REQUESTS, [...requests, newRequest])
    return newRequest
  }

  async getConnectionRequestsByBusinessId(businessId: string): Promise<ConnectionRequest[]> {
    const requests = await this.getAllConnectionRequests()
    return requests.filter((r) => r.receiverBusinessId === businessId || r.requesterBusinessId === businessId)
  }

  async updateConnectionRequestStatus(
    requestId: string,
    status: ConnectionRequestStatus
  ): Promise<ConnectionRequest> {
    const requests = await this.getAllConnectionRequests()
    const index = requests.findIndex((r) => r.id === requestId)
    if (index === -1) {
      throw new Error('Connection request not found')
    }
    requests[index] = { ...requests[index], status, resolvedAt: Date.now() }
    await spark.kv.set(KV_KEYS.CONNECTION_REQUESTS, requests)
    return requests[index]
  }
}

const CONNECTION_REQUESTS_KEY = 'zelto:connection-requests'
const ROLE_CHANGE_REQUESTS_KEY = 'zelto:role-change-requests'

export async function getAllConnectionRequests(): Promise<ConnectionRequest[]> {
  return await spark.kv.get<ConnectionRequest[]>(CONNECTION_REQUESTS_KEY) || []
}

export async function createConnectionRequest(
  requesterBusinessId: string,
  receiverBusinessId: string,
  requesterRole: 'buyer' | 'supplier',
  receiverRole: 'buyer' | 'supplier'
): Promise<ConnectionRequest> {
  const requests = await getAllConnectionRequests()
  const newRequest: ConnectionRequest = {
    id: crypto.randomUUID(),
    requesterBusinessId,
    receiverBusinessId,
    requesterRole,
    receiverRole,
    status: 'Pending',
    createdAt: Date.now(),
    resolvedAt: null,
  }
  await spark.kv.set(CONNECTION_REQUESTS_KEY, [...requests, newRequest])
  return newRequest
}

export async function getConnectionRequestsByBusiness(businessId: string): Promise<ConnectionRequest[]> {
  const requests = await getAllConnectionRequests()
  return requests.filter((r) => r.receiverBusinessId === businessId || r.requesterBusinessId === businessId)
}

export async function getPendingConnectionRequestsBetween(business1Id: string, business2Id: string): Promise<ConnectionRequest | undefined> {
  const requests = await getAllConnectionRequests()
  return requests.find((r) =>
    r.status === 'Pending' &&
    ((r.requesterBusinessId === business1Id && r.receiverBusinessId === business2Id) ||
     (r.requesterBusinessId === business2Id && r.receiverBusinessId === business1Id))
  )
}

export async function updateConnectionRequest(
  requestId: string,
  status: ConnectionRequestStatus,
  resolvedAt: number
): Promise<ConnectionRequest> {
  const requests = await getAllConnectionRequests()
  const index = requests.findIndex((r) => r.id === requestId)
  if (index === -1) {
    throw new Error('Connection request not found')
  }
  requests[index] = { ...requests[index], status, resolvedAt }
  await spark.kv.set(CONNECTION_REQUESTS_KEY, requests)
  return requests[index]
}

export async function getAllRoleChangeRequests(): Promise<RoleChangeRequest[]> {
  return await spark.kv.get<RoleChangeRequest[]>(ROLE_CHANGE_REQUESTS_KEY) || []
}

export async function createRoleChangeRequest(
  connectionId: string,
  requestedByBusinessId: string
): Promise<RoleChangeRequest> {
  const requests = await getAllRoleChangeRequests()
  const newRequest: RoleChangeRequest = {
    id: crypto.randomUUID(),
    connectionId,
    requestedByBusinessId,
    status: 'pending',
    createdAt: Date.now(),
    resolvedAt: null,
  }
  await spark.kv.set(ROLE_CHANGE_REQUESTS_KEY, [...requests, newRequest])
  return newRequest
}

export async function getRoleChangeRequestsByConnection(connectionId: string): Promise<RoleChangeRequest[]> {
  const requests = await getAllRoleChangeRequests()
  return requests.filter((r) => r.connectionId === connectionId)
}

export async function updateRoleChangeRequest(
  requestId: string,
  status: 'pending' | 'approved' | 'declined',
  resolvedAt: number
): Promise<RoleChangeRequest> {
  const requests = await getAllRoleChangeRequests()
  const index = requests.findIndex((r) => r.id === requestId)
  if (index === -1) {
    throw new Error('Role change request not found')
  }
  requests[index] = { ...requests[index], status, resolvedAt }
  await spark.kv.set(ROLE_CHANGE_REQUESTS_KEY, requests)
  return requests[index]
}

export const dataStore = new ZeltoDataStore()

