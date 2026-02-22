import { dataStore } from './data-store'
import { behaviourEngine } from './behaviour-engine'
import type {
  PaymentTermType,
  OrderLifecycleState,
  IssueType,
  IssueSeverity,
  Connection,
  Order,
  PaymentEvent,
  IssueReport,
  RaisedBy,
} from './types'

async function recalculateConnectionState(connectionId: string): Promise<void> {
  const newState = await behaviourEngine.computeConnectionState(connectionId)
  await dataStore.updateConnectionState(connectionId, newState)
}

export async function createConnection(
  buyerBusinessId: string,
  supplierBusinessId: string,
  paymentTerms: PaymentTermType | null
): Promise<Connection> {
  const buyer = await dataStore.getBusinessEntityById(buyerBusinessId)
  const supplier = await dataStore.getBusinessEntityById(supplierBusinessId)

  if (!buyer || !supplier) {
    throw new Error('Both businesses must exist')
  }

  const allConnections = await dataStore.getAllConnections()
  const existingConnection = allConnections.find(
    (conn) =>
      (conn.buyerBusinessId === buyerBusinessId &&
        conn.supplierBusinessId === supplierBusinessId) ||
      (conn.buyerBusinessId === supplierBusinessId &&
        conn.supplierBusinessId === buyerBusinessId)
  )

  if (existingConnection) {
    throw new Error(
      'A connection between these two businesses already exists'
    )
  }

  const newConnection = await dataStore.createConnection(
    buyerBusinessId,
    supplierBusinessId,
    paymentTerms
  )

  await recalculateConnectionState(newConnection.id)

  return newConnection
}

export async function updatePaymentTerms(
  connectionId: string,
  newPaymentTerms: PaymentTermType,
  requestingBusinessId: string
): Promise<Connection> {
  const connection = await dataStore.getConnectionById(connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  if (requestingBusinessId !== connection.supplierBusinessId) {
    throw new Error('Only the supplier can update payment terms')
  }

  const updatedConnection = await dataStore.updateConnectionPaymentTerms(
    connectionId,
    newPaymentTerms
  )

  await recalculateConnectionState(connectionId)

  return updatedConnection
}

export async function createOrder(
  connectionId: string,
  itemSummary: string,
  orderValue: number,
  requestingBusinessId: string
): Promise<Order> {
  const connection = await dataStore.getConnectionById(connectionId)

  if (!connection) {
    throw new Error('Connection does not exist')
  }

  const isAuthorized =
    requestingBusinessId === connection.buyerBusinessId ||
    requestingBusinessId === connection.supplierBusinessId

  if (!isAuthorized) {
    throw new Error('Only the buyer or supplier in this connection may create an order')
  }

  const newOrder = await dataStore.createOrder(
    connectionId,
    itemSummary,
    orderValue
  )

  await recalculateConnectionState(connectionId)

  // Notify supplier that a new order was placed
  await dataStore.createNotification(
    connection.supplierBusinessId,
    'OrderPlaced',
    newOrder.id,
    connectionId,
    `New order received: ${itemSummary}`
  )

  return newOrder
}

export async function transitionOrderState(
  orderId: string,
  newState: OrderLifecycleState,
  requestingBusinessId: string
): Promise<Order> {
  const order = await dataStore.getOrderById(orderId)

  if (!order) {
    throw new Error('Order not found')
  }

  const connection = await dataStore.getConnectionById(order.connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  const currentState = getCurrentOrderState(order)

  if (newState === 'Declined') {
    if (currentState !== 'Placed') {
      throw new Error('Can only decline an order in Placed state')
    }
    if (requestingBusinessId !== connection.supplierBusinessId) {
      throw new Error('Only the supplier may decline an order')
    }
  } else if (newState === 'Accepted') {
    if (currentState !== 'Placed') {
      throw new Error('Can only accept an order in Placed state')
    }
    if (requestingBusinessId !== connection.supplierBusinessId) {
      throw new Error('Only the supplier may accept an order')
    }
  } else if (newState === 'Dispatched') {
    if (currentState !== 'Accepted') {
      throw new Error('Can only dispatch an order in Accepted state')
    }
    if (requestingBusinessId !== connection.supplierBusinessId) {
      throw new Error('Only the supplier may dispatch an order')
    }
  } else if (newState === 'Delivered') {
    if (currentState !== 'Dispatched') {
      throw new Error('Can only deliver an order in Dispatched state')
    }
    const isAuthorized =
      requestingBusinessId === connection.buyerBusinessId ||
      requestingBusinessId === connection.supplierBusinessId
    if (!isAuthorized) {
      throw new Error('Either party may mark an order as delivered')
    }
  } else {
    throw new Error('Invalid state transition')
  }

  const updatedOrder = await dataStore.updateOrderState(orderId, newState)

  await recalculateConnectionState(order.connectionId)

  if (newState === 'Dispatched') {
    await dataStore.createNotification(
      connection.buyerBusinessId,
      'OrderDispatched',
      orderId,
      order.connectionId,
      `Your order has been dispatched`
    )
  }
  if (newState === 'Declined') {
    await dataStore.createNotification(
      connection.buyerBusinessId,
      'OrderDeclined',
      orderId,
      order.connectionId,
      `Your order was declined`
    )
  }

  return updatedOrder
}

function getCurrentOrderState(order: Order): OrderLifecycleState {
  if (order.declinedAt) return 'Declined'
  if (order.deliveredAt) return 'Delivered'
  if (order.dispatchedAt) return 'Dispatched'
  if (order.acceptedAt) return 'Accepted'
  return 'Placed'
}

export async function recordPayment(
  orderId: string,
  amount: number,
  requestingBusinessId: string
): Promise<PaymentEvent> {
  const order = await dataStore.getOrderById(orderId)

  if (!order) {
    throw new Error('Order does not exist')
  }

  if (amount <= 0) {
    throw new Error('Payment amount must be greater than zero')
  }

  const connection = await dataStore.getConnectionById(order.connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  const isAuthorized =
    requestingBusinessId === connection.buyerBusinessId ||
    requestingBusinessId === connection.supplierBusinessId

  if (!isAuthorized) {
    throw new Error('Either party may record a payment')
  }

  const existingPayments = await dataStore.getPaymentEventsByOrderId(orderId)
  const totalPaid = existingPayments.reduce(
    (sum, payment) => sum + payment.amountPaid,
    0
  )

  if (totalPaid + amount > order.orderValue) {
    throw new Error('Payment amount exceeds remaining balance')
  }

  const newPayment = await dataStore.createPaymentEvent(orderId, amount, requestingBusinessId)

  await recalculateConnectionState(order.connectionId)

  // Notify the OTHER party about the payment
  const otherPartyId = requestingBusinessId === connection.buyerBusinessId
    ? connection.supplierBusinessId
    : connection.buyerBusinessId
  await dataStore.createNotification(
    otherPartyId,
    'PaymentRecorded',
    orderId,
    order.connectionId,
    `Payment of ₹${amount.toLocaleString('en-IN')} recorded`
  )

  return newPayment
}

export async function createIssue(
  orderId: string,
  issueType: IssueType,
  severity: IssueSeverity,
  requestingBusinessId: string
): Promise<IssueReport> {
  const order = await dataStore.getOrderById(orderId)

  if (!order) {
    throw new Error('Order does not exist')
  }

  const connection = await dataStore.getConnectionById(order.connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  let raisedBy: RaisedBy
  if (requestingBusinessId === connection.buyerBusinessId) {
    raisedBy = 'buyer'
  } else if (requestingBusinessId === connection.supplierBusinessId) {
    raisedBy = 'supplier'
  } else {
    throw new Error('Requesting business is not part of this connection')
  }

  const newIssue = await dataStore.createIssueReport(
    orderId,
    issueType,
    severity,
    raisedBy
  )

  await recalculateConnectionState(order.connectionId)

  // Notify the OTHER party about the issue
  const otherPartyId = requestingBusinessId === connection.buyerBusinessId
    ? connection.supplierBusinessId
    : connection.buyerBusinessId
  await dataStore.createNotification(
    otherPartyId,
    'IssueRaised',
    newIssue.id,
    order.connectionId,
    `Issue raised: ${issueType}`
  )

  return newIssue
}

export async function resolveIssue(
  issueId: string,
  requestingBusinessId: string
): Promise<IssueReport> {
  const issue = await dataStore.getIssueReportsByOrderId('')
  const allIssues = await dataStore.getAllIssueReports()
  const targetIssue = allIssues.find((i) => i.id === issueId)

  if (!targetIssue) {
    throw new Error('Issue does not exist')
  }

  const order = await dataStore.getOrderById(targetIssue.orderId)

  if (!order) {
    throw new Error('Order not found')
  }

  const connection = await dataStore.getConnectionById(order.connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  const isAuthorized =
    requestingBusinessId === connection.buyerBusinessId ||
    requestingBusinessId === connection.supplierBusinessId

  if (!isAuthorized) {
    throw new Error('Either party may resolve an issue')
  }

  const updatedIssue = await dataStore.updateIssueStatus(issueId, 'Resolved')

  await recalculateConnectionState(order.connectionId)

  return updatedIssue
}

export async function setInvoiceDate(
  orderId: string,
  invoiceDate: number,
  requestingBusinessId: string
): Promise<Order> {
  const order = await dataStore.getOrderById(orderId)

  if (!order) {
    throw new Error('Order does not exist')
  }

  if (order.paymentTermSnapshot.type !== 'Bill to Bill') {
    throw new Error('This order does not use Bill to Bill payment terms')
  }

  const connection = await dataStore.getConnectionById(order.connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  if (requestingBusinessId !== connection.supplierBusinessId) {
    throw new Error('Only the supplier may set the invoice date')
  }

  const updatedOrder = await dataStore.updateOrderBillToBillInvoiceDate(
    orderId,
    invoiceDate
  )

  await recalculateConnectionState(order.connectionId)

  return updatedOrder
}
