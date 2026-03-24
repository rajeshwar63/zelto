import { dataStore } from './data-store'
import { behaviourEngine } from './behaviour-engine'
import { emitDataChange } from './data-events'
import type {
  PaymentTermType,
  OrderLifecycleState,
  IssueType,
  IssueSeverity,
  AttachmentType,
  Connection,
  Order,
  OrderAttachment,
  PaymentEvent,
  IssueReport,
  IssueComment,
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

  let newConnection
  try {
    newConnection = await dataStore.createConnection(
      buyerBusinessId,
      supplierBusinessId,
      paymentTerms
    )
  } catch (err) {
    // Unique index violation = duplicate connection
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('idx_unique_connection_pair') || msg.includes('duplicate key')) {
      throw new Error('A connection between these two businesses already exists')
    }
    throw err
  }

  await recalculateConnectionState(newConnection.id)

  emitDataChange('connections:changed')
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

  emitDataChange('connections:changed')
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

  // Notify supplier that a new order was placed
  try {
    await dataStore.createNotification(
      connection.supplierBusinessId,
      'OrderPlaced',
      newOrder.id,
      connectionId,
      `New order: ${itemSummary}`
    )
  } catch (err) {
    console.error('Notification failed:', err)
  }

  await recalculateConnectionState(connectionId)

  emitDataChange('orders:changed', 'notifications:changed')
  return newOrder
}

export async function transitionOrderState(
  orderId: string,
  newState: OrderLifecycleState,
  requestingBusinessId: string,
  orderValue?: number
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
    const isAuthorized =
      requestingBusinessId === connection.supplierBusinessId ||
      requestingBusinessId === connection.buyerBusinessId
    if (!isAuthorized) {
      throw new Error('Only the supplier or buyer may decline an order')
    }
  } else if (newState === 'Accepted') {
    if (currentState !== 'Placed') {
      throw new Error('Can only accept an order in Placed state')
    }
    if (requestingBusinessId !== connection.supplierBusinessId) {
      throw new Error('Only the supplier may accept an order')
    }
  } else if (newState === 'Dispatched') {
    if (currentState !== 'Accepted' && currentState !== 'Placed') {
      throw new Error('Can only dispatch an order in Accepted or Placed state')
    }
    if (requestingBusinessId !== connection.supplierBusinessId) {
      throw new Error('Only the supplier may dispatch an order')
    }
    if (orderValue !== undefined && orderValue <= 0) {
      throw new Error('Order value must be greater than zero')
    }
    // When dispatching from Placed state, the accept step is implicit (combined accept + dispatch)
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

  const updatedOrder = await dataStore.updateOrderState(orderId, newState, {
    orderValue,
    setAcceptedAt: newState === 'Dispatched' && currentState === 'Placed',
  })

  if (newState === 'Accepted') {
    try {
      await dataStore.createNotification(
        connection.buyerBusinessId,
        'OrderAccepted',
        orderId,
        order.connectionId,
        `Your order has been accepted`
      )
    } catch (err) {
      console.error('Notification failed:', err)
    }
  }
  if (newState === 'Dispatched') {
    try {
      await dataStore.createNotification(
        connection.buyerBusinessId,
        'OrderDispatched',
        orderId,
        order.connectionId,
        `Your order has been dispatched`
      )
    } catch (err) {
      console.error('Notification failed:', err)
    }
  }
  if (newState === 'Declined') {
    try {
      await dataStore.createNotification(
        connection.buyerBusinessId,
        'OrderDeclined',
        orderId,
        order.connectionId,
        `Your order has been declined`
      )
    } catch (err) {
      console.error('Notification failed:', err)
    }
  }

  await recalculateConnectionState(order.connectionId)

  emitDataChange('orders:changed', 'notifications:changed')
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

  // Notify the OTHER party about the payment
  const otherPartyId = requestingBusinessId === connection.buyerBusinessId
    ? connection.supplierBusinessId
    : connection.buyerBusinessId
  try {
    await dataStore.createNotification(
      otherPartyId,
      'PaymentRecorded',
      orderId,
      order.connectionId,
      `Payment of ₹${amount.toLocaleString('en-IN')} recorded`
    )
  } catch (err) {
    console.error('Notification failed:', err)
  }

  await recalculateConnectionState(order.connectionId)

  emitDataChange('payments:changed', 'orders:changed', 'notifications:changed')
  return newPayment
}

export async function disputePayment(
  paymentEventId: string,
  requestingBusinessId: string
): Promise<PaymentEvent> {
  const paymentEvent = await dataStore.getPaymentEventById(paymentEventId)

  if (!paymentEvent) {
    throw new Error('Payment event does not exist')
  }

  const order = await dataStore.getOrderById(paymentEvent.orderId)

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
    throw new Error('Either party may dispute a payment')
  }

  const updatedPayment = await dataStore.updatePaymentEventDispute(paymentEventId, true)

  // Notify the OTHER party about the dispute
  const otherPartyId = requestingBusinessId === connection.buyerBusinessId
    ? connection.supplierBusinessId
    : connection.buyerBusinessId
  try {
    await dataStore.createNotification(
      otherPartyId,
      'PaymentDisputed',
      paymentEventId,
      order.connectionId,
      `A payment has been disputed`
    )
  } catch (err) {
    console.error('Notification failed:', err)
  }

  await recalculateConnectionState(order.connectionId)

  emitDataChange('payments:changed', 'notifications:changed')
  return updatedPayment
}

export async function createIssue(
  orderId: string,
  issueType: IssueType,
  severity: IssueSeverity,
  requestingBusinessId: string,
  description?: string
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
    raisedBy,
    description
  )

  // Notify the OTHER party about the issue
  const otherPartyId = requestingBusinessId === connection.buyerBusinessId
    ? connection.supplierBusinessId
    : connection.buyerBusinessId
  try {
    await dataStore.createNotification(
      otherPartyId,
      'IssueRaised',
      newIssue.id,
      order.connectionId,
      `New issue reported: ${issueType}`
    )
  } catch (err) {
    console.error('Notification failed:', err)
  }

  await recalculateConnectionState(order.connectionId)

  emitDataChange('issues:changed', 'notifications:changed')
  return newIssue
}

export async function acknowledgeIssue(
  issueId: string,
  requestingBusinessId: string
): Promise<IssueReport> {
  const targetIssue = await dataStore.getIssueReportById(issueId)

  if (!targetIssue) {
    throw new Error('Issue does not exist')
  }

  if (targetIssue.status !== 'Open') {
    throw new Error('Issue is not in Open status')
  }

  const order = await dataStore.getOrderById(targetIssue.orderId)

  if (!order) {
    throw new Error('Order not found')
  }

  const connection = await dataStore.getConnectionById(order.connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  // Determine if requesting business is buyer or supplier
  let requestingRole: RaisedBy
  if (requestingBusinessId === connection.buyerBusinessId) {
    requestingRole = 'buyer'
  } else if (requestingBusinessId === connection.supplierBusinessId) {
    requestingRole = 'supplier'
  } else {
    throw new Error('Requesting business is not part of this connection')
  }

  // Only the OTHER party can acknowledge (not the raiser)
  if (requestingRole === targetIssue.raisedBy) {
    throw new Error('Only the other party can acknowledge this issue')
  }

  const updatedIssue = await dataStore.updateIssueStatus(issueId, 'Acknowledged')

  // Notify the raiser that their issue was acknowledged
  const raiserBusinessId = targetIssue.raisedBy === 'buyer'
    ? connection.buyerBusinessId
    : connection.supplierBusinessId
  try {
    await dataStore.createNotification(
      raiserBusinessId,
      'IssueAcknowledged',
      issueId,
      order.connectionId,
      `Issue acknowledged: ${targetIssue.issueType}`
    )
  } catch (err) {
    console.error('Notification failed:', err)
  }

  await recalculateConnectionState(order.connectionId)

  emitDataChange('issues:changed', 'notifications:changed')
  return updatedIssue
}

export async function resolveIssue(
  issueId: string,
  requestingBusinessId: string
): Promise<IssueReport> {
  const targetIssue = await dataStore.getIssueReportById(issueId)

  if (!targetIssue) {
    throw new Error('Issue does not exist')
  }

  if (targetIssue.status === 'Resolved') {
    throw new Error('Issue is already resolved')
  }

  const order = await dataStore.getOrderById(targetIssue.orderId)

  if (!order) {
    throw new Error('Order not found')
  }

  const connection = await dataStore.getConnectionById(order.connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  // Determine resolvedBy role
  let resolvedBy: RaisedBy
  if (requestingBusinessId === connection.buyerBusinessId) {
    resolvedBy = 'buyer'
  } else if (requestingBusinessId === connection.supplierBusinessId) {
    resolvedBy = 'supplier'
  } else {
    throw new Error('Either party may resolve an issue')
  }

  const updatedIssue = await dataStore.updateIssueStatus(issueId, 'Resolved', resolvedBy)

  // Notify the OTHER party
  const otherPartyId = requestingBusinessId === connection.buyerBusinessId
    ? connection.supplierBusinessId
    : connection.buyerBusinessId
  try {
    await dataStore.createNotification(
      otherPartyId,
      'IssueResolved',
      issueId,
      order.connectionId,
      `Issue resolved: ${targetIssue.issueType}`
    )
  } catch (err) {
    console.error('Notification failed:', err)
  }

  // Payment dispute sync: unflag disputed payments when Billing Mismatch is resolved
  if (targetIssue.issueType === 'Billing Mismatch') {
    try {
      const disputedPayments = await dataStore.getDisputedPaymentsByOrderId(targetIssue.orderId)
      for (const payment of disputedPayments) {
        await dataStore.updatePaymentEventDispute(payment.id, false)
      }
    } catch (err) {
      console.error('Failed to unflag disputed payments:', err)
    }
  }

  await recalculateConnectionState(order.connectionId)

  emitDataChange('issues:changed', 'payments:changed', 'notifications:changed')
  return updatedIssue
}

export async function closeIssue(
  issueId: string,
  requestingBusinessId: string
): Promise<IssueReport> {
  const targetIssue = await dataStore.getIssueReportById(issueId)

  if (!targetIssue) {
    throw new Error('Issue does not exist')
  }

  if (targetIssue.status !== 'Resolved') {
    throw new Error('Issue must be resolved before it can be closed')
  }

  const order = await dataStore.getOrderById(targetIssue.orderId)
  if (!order) throw new Error('Order not found')

  const connection = await dataStore.getConnectionById(order.connectionId)
  if (!connection) throw new Error('Connection not found')

  // Only the original raiser can close a resolved issue
  const isBuyer = requestingBusinessId === connection.buyerBusinessId
  const isSupplier = requestingBusinessId === connection.supplierBusinessId
  if (!isBuyer && !isSupplier) {
    throw new Error('Requesting business is not part of this connection')
  }

  const requestingRole: RaisedBy = isBuyer ? 'buyer' : 'supplier'
  if (requestingRole !== targetIssue.raisedBy) {
    throw new Error('Only the issue creator can close a resolved issue')
  }

  const updatedIssue = await dataStore.updateIssueStatus(issueId, 'Closed')

  const otherPartyId = isBuyer
    ? connection.supplierBusinessId
    : connection.buyerBusinessId
  try {
    await dataStore.createNotification(
      otherPartyId,
      'IssueResolved',
      issueId,
      order.connectionId,
      `Issue closed: ${targetIssue.issueType}`
    )
  } catch (err) {
    console.error('Notification failed:', err)
  }

  await recalculateConnectionState(order.connectionId)

  emitDataChange('issues:changed', 'notifications:changed')
  return updatedIssue
}

export async function addIssueComment(
  issueId: string,
  message: string,
  requestingBusinessId: string
): Promise<IssueComment> {
  const targetIssue = await dataStore.getIssueReportById(issueId)

  if (!targetIssue) {
    throw new Error('Issue does not exist')
  }

  if (targetIssue.status === 'Closed') {
    throw new Error('Cannot comment on a closed issue')
  }

  const order = await dataStore.getOrderById(targetIssue.orderId)
  if (!order) throw new Error('Order not found')

  const connection = await dataStore.getConnectionById(order.connectionId)
  if (!connection) throw new Error('Connection not found')

  let authorRole: RaisedBy
  if (requestingBusinessId === connection.buyerBusinessId) {
    authorRole = 'buyer'
  } else if (requestingBusinessId === connection.supplierBusinessId) {
    authorRole = 'supplier'
  } else {
    throw new Error('Requesting business is not part of this connection')
  }

  const comment = await dataStore.createIssueComment(
    issueId,
    requestingBusinessId,
    authorRole,
    message
  )

  // If the other party responds and issue is Open, transition to in_progress/Acknowledged
  if (authorRole !== targetIssue.raisedBy && targetIssue.status === 'Open') {
    await dataStore.updateIssueStatus(issueId, 'Acknowledged')
  }

  // Notify the other party
  const otherPartyId = requestingBusinessId === connection.buyerBusinessId
    ? connection.supplierBusinessId
    : connection.buyerBusinessId
  try {
    await dataStore.createNotification(
      otherPartyId,
      'IssueAcknowledged',
      issueId,
      order.connectionId,
      `New response on issue: ${targetIssue.issueType}`
    )
  } catch (err) {
    console.error('Notification failed:', err)
  }

  await recalculateConnectionState(order.connectionId)

  emitDataChange('issues:changed', 'notifications:changed')
  return comment
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

  return updatedOrder
}

export async function addAttachment(
  orderId: string,
  type: AttachmentType,
  requestingBusinessId: string,
  options: {
    fileUrl?: string
    fileName?: string
    fileType?: string
    thumbnailUrl?: string
    noteText?: string
  }
): Promise<OrderAttachment> {
  const order = await dataStore.getOrderById(orderId)

  if (!order) {
    throw new Error('Order does not exist')
  }

  const connection = await dataStore.getConnectionById(order.connectionId)

  if (!connection) {
    throw new Error('Connection not found')
  }

  const isAuthorized =
    requestingBusinessId === connection.buyerBusinessId ||
    requestingBusinessId === connection.supplierBusinessId

  if (!isAuthorized) {
    throw new Error('Only the buyer or supplier may add attachments')
  }

  const newAttachment = await dataStore.createOrderAttachment(orderId, type, requestingBusinessId, options)
  emitDataChange('attachments:changed')
  return newAttachment
}

export async function deleteAttachment(
  attachmentId: string,
  requestingBusinessId: string
): Promise<void> {
  const attachment = await dataStore.getAttachmentById(attachmentId)

  if (!attachment) {
    throw new Error('Attachment not found')
  }

  if (attachment.uploadedBy !== requestingBusinessId) {
    throw new Error('Only the uploader may delete an attachment')
  }

  await dataStore.deleteOrderAttachment(attachmentId)
}
