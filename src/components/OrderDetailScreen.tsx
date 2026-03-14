import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { recordPayment, addAttachment, deleteAttachment, acknowledgeIssue, resolveIssue, transitionOrderState, disputePayment } from '@/lib/interactions'
import { useDataListener } from '@/lib/data-events'
import { formatDistanceToNow, differenceInDays } from 'date-fns'
import type { Connection, OrderWithPaymentState, BusinessEntity, PaymentEvent, IssueReport, OrderAttachment, AttachmentType } from '@/lib/types'
import { CaretLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { formatInrCurrency } from '@/lib/utils'
import { AddAttachmentSheet } from '@/components/AddAttachmentSheet'
import { AttachmentViewer } from '@/components/AttachmentViewer'
import { IssueDetailSheet } from '@/components/IssueDetailSheet'
import { OrderStatusHeader } from '@/components/order/OrderStatusHeader'
import { OrderPaymentSummary } from '@/components/order/OrderPaymentSummary'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { OrderAttachmentsSection } from '@/components/order/OrderAttachmentsSection'
import { buildOrderTimeline, formatDueDate, formatPaymentTerms, getLifecycleState } from '@/components/order/order-detail-utils'
import { buildConnectionSubtitle } from '@/lib/utils'

interface Props {
  orderId: string
  connectionId: string
  currentBusinessId: string
  mode?: 'connection' | 'issue'
  onBack: () => void
  onReportIssue: (orderId: string, connectionId: string) => void
  initialIssueId?: string
}

function getLifecycleState(order: OrderWithPaymentState): string {
  if (order.declinedAt) return 'Declined'
  if (order.deliveredAt) return 'Delivered'
  if (order.dispatchedAt) return 'Dispatched'
  if (order.acceptedAt) return 'Accepted'
  return 'Placed'
}

function formatPaymentTerms(terms: Connection['paymentTerms']): string {
  if (!terms) return 'Not set'
  switch (terms.type) {
    case 'Advance Required': return 'Advance Required'
    case 'Payment on Delivery': return 'Payment on Delivery'
    case 'Bill to Bill': return 'Bill to Bill'
    case 'Days After Delivery': return `${terms.days} days after delivery`
  }
}

function formatDueDate(order: OrderWithPaymentState): string {
  if (order.settlementState === 'Paid') return 'Paid'
  if (!order.calculatedDueDate) {
    if (!order.deliveredAt) return 'Awaiting delivery'
    if (order.paymentTermSnapshot.type === 'Bill to Bill') return 'Linked to next delivery'
    return 'Due date pending'
  }
  const dueDate = new Date(order.calculatedDueDate)
  const now = new Date()
  const days = differenceInDays(dueDate, now)
  if (days === 0) return 'Due today'
  if (days > 0) return `Due in ${days} day${days > 1 ? 's' : ''}`
  const overdueDays = Math.abs(days)
  return `Overdue ${overdueDays} day${overdueDays > 1 ? 's' : ''}`
}

interface TimelineEvent {
  label: string
  actor: string
  timestamp: number | null
  completed: boolean
}

export function OrderDetailScreen({ orderId, connectionId, currentBusinessId, mode = 'issue', onBack, onReportIssue, initialIssueId }: Props) {
  const [order, setOrder] = useState<OrderWithPaymentState | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [otherBusiness, setOtherBusiness] = useState<BusinessEntity | null>(null)
  const [myBusiness, setMyBusiness] = useState<BusinessEntity | null>(null)
  const [payments, setPayments] = useState<PaymentEvent[]>([])
  const [issues, setIssues] = useState<IssueReport[]>([])
  const [attachments, setAttachments] = useState<OrderAttachment[]>([])
  const [loading, setLoading] = useState(true)

  // Payment recording
  const [showPaymentInput, setShowPaymentInput] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [isRecordingPayment, setIsRecordingPayment] = useState(false)
  const [dispatchAmount, setDispatchAmount] = useState('')
  const [dispatchError, setDispatchError] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [processingAction, setProcessingAction] = useState(false)
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [disputingPaymentId, setDisputingPaymentId] = useState<string | null>(null)

  // Attachments
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false)
  const [viewingAttachmentIndex, setViewingAttachmentIndex] = useState<number | null>(null)

  // Issue detail
  const [selectedIssue, setSelectedIssue] = useState<IssueReport | null>(null)

  const loadData = async () => {
    const [conn, orderData] = await Promise.all([
      dataStore.getConnectionById(connectionId),
      dataStore.getOrdersWithPaymentStateByConnectionId(connectionId),
    ])

    if (!conn) return
    setConnection(conn)

    const matchingOrder = orderData.find(o => o.id === orderId)
    if (!matchingOrder) return
    setOrder(matchingOrder)

    const otherId = conn.buyerBusinessId === currentBusinessId
      ? conn.supplierBusinessId
      : conn.buyerBusinessId

    const [otherBiz, myBiz, paymentEvents, issueReports, orderAttachments] = await Promise.all([
      dataStore.getBusinessEntityById(otherId),
      dataStore.getBusinessEntityById(currentBusinessId),
      dataStore.getPaymentEventsByOrderId(orderId),
      dataStore.getIssueReportsByOrderId(orderId),
      dataStore.getAttachmentsByOrderId(orderId),
    ])

    setOtherBusiness(otherBiz || null)
    setMyBusiness(myBiz || null)
    setPayments(paymentEvents)
    setIssues(issueReports)
    if (initialIssueId) {
      const targetIssue = issueReports.find(issue => issue.id === initialIssueId)
      if (targetIssue) setSelectedIssue(targetIssue)
    }
    setAttachments(orderAttachments)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [orderId, connectionId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'issues:changed', 'attachments:changed'],
    () => { loadData() }
  )

  useEffect(() => {
    const checkAndAcceptPayments = async () => {
      const paymentEvents = await dataStore.getPaymentEventsByOrderId(orderId)
      const now = Date.now()
      const fortyEightHours = 48 * 60 * 60 * 1000
      for (const payment of paymentEvents) {
        if (!payment.disputed && !payment.acceptedAt && payment.recordedBy !== currentBusinessId && now - payment.timestamp >= fortyEightHours) {
          await dataStore.acceptPaymentEvent(payment.id)
        }
      }
    }

    const interval = setInterval(checkAndAcceptPayments, 60000)
    checkAndAcceptPayments().catch(console.error)
    return () => clearInterval(interval)
  }, [orderId, currentBusinessId])

  const handleRecordPayment = async () => {
    if (processingAction || isRecordingPayment) return
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) {
      setPaymentError('Please enter a valid payment amount')
      return
    }

    setIsRecordingPayment(true)
    setPaymentError('')
    try {
      await recordPayment(orderId, amount, currentBusinessId)
      toast.success('Payment recorded')
      setShowPaymentInput(false)
      setPaymentAmount('')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setIsRecordingPayment(false)
    }
  }

  const handleDispatch = async () => {
    if (processingAction) return
    setProcessingAction(true)
    setDispatchError('')
    const amount = parseFloat(dispatchAmount)
    if (isNaN(amount) || amount <= 0) {
      setDispatchError('Please enter the order amount before dispatching.')
      setProcessingAction(false)
      return
    }
    try {
      await transitionOrderState(orderId, 'Dispatched', currentBusinessId, amount)
      toast.success('Order dispatched')
      setDispatchAmount('')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispatch order')
    } finally {
      setProcessingAction(false)
    }
  }

  const handleDecline = async () => {
    if (processingAction) return
    setProcessingAction(true)
    setShowDeclineConfirm(false)
    try {
      await transitionOrderState(orderId, 'Declined', currentBusinessId)
      toast.success('Order declined')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline order')
    } finally {
      setProcessingAction(false)
    }
  }

  const handleCancelOrder = async () => {
    if (processingAction) return
    setProcessingAction(true)
    setShowCancelConfirm(false)
    try {
      await transitionOrderState(orderId, 'Declined', currentBusinessId)
      toast.success('Order cancelled')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel order')
    } finally {
      setProcessingAction(false)
    }
  }

  const handleMarkDelivered = async () => {
    if (processingAction) return
    setProcessingAction(true)
    try {
      await transitionOrderState(orderId, 'Delivered', currentBusinessId)
      toast.success('Order marked as delivered')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as delivered')
    } finally {
      setProcessingAction(false)
    }
  }

  const handleConfirmDispute = async (paymentId: string) => {
    if (processingAction) return
    setProcessingAction(true)
    try {
      await disputePayment(paymentId, currentBusinessId)
      toast.success('Dispute raised. This has been added to your Attention tab.')
      setDisputingPaymentId(null)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispute payment')
    } finally {
      setProcessingAction(false)
    }
  }

  const handleAddAttachment = async (type: AttachmentType, options: { fileUrl?: string; fileName?: string; fileType?: string; thumbnailUrl?: string; noteText?: string }) => {
    try {
      await addAttachment(orderId, type, currentBusinessId, options)
    } catch (err) {
      toast.error('Failed to add attachment')
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await deleteAttachment(attachmentId, currentBusinessId)
      toast.success('Attachment removed')
    } catch (err) {
      toast.error('Failed to delete attachment')
    }
  }

  const handleAcknowledge = async (issueId: string) => {
    try {
      await acknowledgeIssue(issueId, currentBusinessId)
      toast.success('Issue acknowledged')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to acknowledge issue')
    }
  }

  const handleResolve = async (issueId: string) => {
    try {
      await resolveIssue(issueId, currentBusinessId)
      toast.success('Issue resolved')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve issue')
    }
  }

  if (loading || !order || !connection) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4 gap-3">
            <button onClick={onBack} style={{ color: 'var(--text-primary)', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
              <CaretLeft size={22} weight="regular" />
            </button>
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>Order</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  const lifecycleState = getLifecycleState(order)
  const dueDateLabel = formatDueDate(order)
  const isSupplier = connection.supplierBusinessId === currentBusinessId
  const isBuyer = connection.buyerBusinessId === currentBusinessId
  const isConnectionMode = mode === 'connection'
  const buyerName = isSupplier ? (otherBusiness?.businessName || 'Unknown') : (myBusiness?.businessName || 'You')
  const supplierName = isSupplier ? (myBusiness?.businessName || 'You') : (otherBusiness?.businessName || 'Unknown')
  const timeline = buildOrderTimeline(order, buyerName, supplierName, payments[payments.length - 1]?.timestamp)

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-screen)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-3">
          <button onClick={onBack} style={{ color: 'var(--text-primary)', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
            <CaretLeft size={22} weight="regular" />
          </button>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>Order</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <OrderStatusHeader
          lifecycleState={lifecycleState}
          itemSummary={order.itemSummary}
          orderValue={order.orderValue}
          counterpartName={otherBusiness?.businessName || 'Unknown'}
          counterpartSubtitle={buildConnectionSubtitle(connection.branchLabel, connection.contactName)}
        />

        <OrderPaymentSummary
          termsLabel={formatPaymentTerms(order.paymentTermSnapshot)}
          dueDateLabel={dueDateLabel}
          totalPaid={order.totalPaid}
          pendingAmount={order.pendingAmount}
          settlementState={order.settlementState}
        />

        <OrderTimeline timeline={timeline} />

        <OrderAttachmentsSection
          attachments={attachments}
          currentBusinessId={currentBusinessId}
          buyerBusiness={isSupplier ? otherBusiness : myBusiness}
          supplierBusiness={isSupplier ? myBusiness : otherBusiness}
          onAddAttachment={() => setShowAttachmentSheet(true)}
          onViewAttachment={(index) => setViewingAttachmentIndex(index)}
          onDeleteAttachment={handleDeleteAttachment}
        />

        {/* Payment Details */}
        {payments.length > 0 && (
          <div className="px-4 mb-3">
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              PAYMENTS
            </p>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
              {payments.map(payment => {
                const canDispute = isConnectionMode && payment.recordedBy !== currentBusinessId && !payment.disputed && !payment.acceptedAt
                const showDisputeConfirm = disputingPaymentId === payment.id
                return (
                <div key={payment.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-section)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatInrCurrency(payment.amountPaid)}
                    </p>
                    <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {formatDistanceToNow(payment.timestamp, { addSuffix: true })}
                    </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canDispute && (
                        <button
                          onClick={() => setDisputingPaymentId(payment.id)}
                          disabled={processingAction}
                          className="text-[11px] text-destructive hover:underline"
                        >
                          Dispute
                        </button>
                      )}
                      {payment.acceptedAt && <span className="text-[11px] text-muted-foreground">✓ Accepted</span>}
                      {payment.disputed && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--status-overdue)',
                            backgroundColor: '#FFF0F0',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-chip)',
                          }}
                        >
                          Disputed
                        </span>
                      )}
                    </div>
                  </div>
                  {showDisputeConfirm && (
                    <div className="mt-3">
                      <p className="text-[13px] text-foreground mb-3">Dispute this payment?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmDispute(payment.id)}
                          disabled={processingAction}
                          className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded text-white"
                          style={{ backgroundColor: 'var(--status-overdue)' }}
                        >
                          Yes, dispute
                        </button>
                        <button
                          onClick={() => setDisputingPaymentId(null)}
                          disabled={processingAction}
                          className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded bg-muted text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        )}

        {/* Issues */}
        {issues.length > 0 && (
          <div className="px-4 mb-3">
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              ISSUES
            </p>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
              {issues.map(issue => {
                const isRaiser =
                  (issue.raisedBy === 'buyer' && currentBusinessId === connection.buyerBusinessId) ||
                  (issue.raisedBy === 'supplier' && currentBusinessId === connection.supplierBusinessId)
                const isResponder = !isRaiser
                const showAcknowledge = isResponder && issue.status === 'Open'
                const showResolve = issue.status === 'Open' || issue.status === 'Acknowledged'

                const statusColor = issue.status === 'Resolved'
                  ? 'var(--status-delivered)'
                  : issue.status === 'Acknowledged'
                    ? 'var(--text-secondary)'
                    : 'var(--status-overdue)'
                const statusBg = issue.status === 'Resolved'
                  ? '#F0FFF6'
                  : issue.status === 'Acknowledged'
                    ? '#F0F0F0'
                    : '#FFF0F0'

                return (
                  <button
                    key={issue.id}
                    onClick={() => setSelectedIssue(issue)}
                    className="w-full text-left"
                    style={{ padding: '6px 0', borderBottom: '1px solid var(--border-section)' }}
                  >
                    <div className="flex items-center justify-between">
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{issue.issueType}</p>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: statusColor,
                          backgroundColor: statusBg,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-chip)',
                        }}
                      >
                        {issue.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {issue.severity} · {formatDistanceToNow(issue.createdAt, { addSuffix: true })}
                    </p>
                    {(showAcknowledge || showResolve) && (
                      <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                        {showAcknowledge && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAcknowledge(issue.id) }}
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-light)',
                              backgroundColor: 'var(--bg-card)',
                              borderRadius: 'var(--radius-button-sm)',
                              padding: '4px 12px',
                              minHeight: '32px',
                            }}
                          >
                            Acknowledge
                          </button>
                        )}
                        {showResolve && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleResolve(issue.id) }}
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#FFFFFF',
                              backgroundColor: '#22C55E',
                              border: 'none',
                              borderRadius: 'var(--radius-button-sm)',
                              padding: '4px 12px',
                              minHeight: '32px',
                            }}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pb-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {lifecycleState === 'Placed' && isSupplier && (
            <div className="space-y-3">
              <Input
                type="number"
                placeholder="Enter amount ₹"
                value={dispatchAmount}
                disabled={processingAction}
                onChange={e => { setDispatchAmount(e.target.value); setDispatchError('') }}
              />
              {dispatchError && <p className="text-[12px] text-destructive">{dispatchError}</p>}
              <Button
                onClick={handleDispatch}
                disabled={processingAction || !dispatchAmount || parseFloat(dispatchAmount) <= 0}
                className="w-full"
              >
                Dispatch
              </Button>
              {!showDeclineConfirm ? (
                <button onClick={() => setShowDeclineConfirm(true)} className="text-[12px] text-muted-foreground hover:text-foreground w-full text-center">
                  Can't fulfil this order
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] text-foreground text-center">Can't fulfil this order?</p>
                  <div className="flex gap-2">
                    <button onClick={handleDecline} disabled={processingAction} className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded text-white" style={{ backgroundColor: 'var(--status-overdue)' }}>Yes, decline</button>
                    <button onClick={() => setShowDeclineConfirm(false)} disabled={processingAction} className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded bg-muted text-foreground">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {lifecycleState === 'Placed' && isBuyer && (
            <div>
              {!showCancelConfirm ? (
                <button onClick={() => setShowCancelConfirm(true)} className="text-[12px] text-muted-foreground hover:text-foreground w-full text-center">Cancel order</button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] text-foreground text-center">Cancel this order?</p>
                  <div className="flex gap-2">
                    <button onClick={handleCancelOrder} disabled={processingAction} className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded text-white" style={{ backgroundColor: 'var(--status-overdue)' }}>Yes, cancel</button>
                    <button onClick={() => setShowCancelConfirm(false)} disabled={processingAction} className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded bg-muted text-foreground">Keep order</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {lifecycleState === 'Dispatched' && (
            <Button onClick={handleMarkDelivered} disabled={processingAction} className="w-full">
              Mark as Delivered
            </Button>
          )}

          {order.settlementState !== 'Paid' && order.deliveredAt && (
            <>
              {showPaymentInput ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={paymentAmount}
                    onChange={(e) => { setPaymentAmount(e.target.value); setPaymentError('') }}
                    className="flex-1"
                    style={{ borderRadius: 'var(--radius-input)' }}
                  />
                  <Button
                    onClick={handleRecordPayment}
                    disabled={isRecordingPayment || !paymentAmount}
                    size="sm"
                    style={{ backgroundColor: 'var(--brand-primary)', color: '#FFFFFF', borderRadius: 'var(--radius-button-sm)', fontWeight: 600 }}
                  >
                    {isRecordingPayment ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    onClick={() => { setShowPaymentInput(false); setPaymentAmount('') }}
                    variant="outline"
                    size="sm"
                    style={{ borderRadius: 'var(--radius-button-sm)', borderColor: 'var(--border-light)', color: 'var(--text-primary)', fontWeight: 600 }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPaymentInput(true)}
                  className="w-full"
                  style={{
                    backgroundColor: 'var(--brand-primary)',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-button)',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    minHeight: '44px',
                  }}
                >
                  Record Payment
                </button>
              )}
              {paymentError && <p className="text-[12px] text-destructive">{paymentError}</p>}
            </>
          )}
          {(lifecycleState === 'Dispatched' || lifecycleState === 'Delivered') && (
            <button
              onClick={() => onReportIssue(orderId, connectionId)}
              className="w-full"
              style={{
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-button)',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                minHeight: '44px',
              }}
            >
              Raise Issue
            </button>
          )}

          {(lifecycleState === 'Declined' || (lifecycleState === 'Placed' && order.declinedAt)) && (
            <p className="text-[13px] text-muted-foreground text-center py-4">
              This order was {lifecycleState === 'Declined' ? 'declined' : 'cancelled'}
            </p>
          )}
        </div>
      </div>

      {/* Attachment Sheet */}
      <AddAttachmentSheet
        open={showAttachmentSheet}
        orderId={orderId}
        currentBusinessId={currentBusinessId}
        onClose={() => setShowAttachmentSheet(false)}
        onAttachmentAdded={() => loadData()}
        onAddAttachment={handleAddAttachment}
      />

      {/* Attachment Viewer */}
      {viewingAttachmentIndex !== null && myBusiness && otherBusiness && (
        <AttachmentViewer
          attachments={attachments}
          initialIndex={viewingAttachmentIndex}
          buyerBusiness={isSupplier ? otherBusiness : myBusiness}
          supplierBusiness={isSupplier ? myBusiness : otherBusiness}
          onClose={() => setViewingAttachmentIndex(null)}
        />
      )}

      {/* Issue Detail Sheet */}
      {selectedIssue && myBusiness && otherBusiness && (
        <IssueDetailSheet
          issue={selectedIssue}
          order={order}
          buyerBusiness={isSupplier ? otherBusiness : myBusiness}
          supplierBusiness={isSupplier ? myBusiness : otherBusiness}
          currentBusinessId={currentBusinessId}
          isOpen={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onStatusChange={() => { setSelectedIssue(null); loadData() }}
        />
      )}
    </div>
  )
}


interface OrderActionsPanelProps {
  order: OrderWithPaymentState
  showPaymentInput: boolean
  paymentAmount: string
  isRecordingPayment: boolean
  onPaymentAmountChange: (amount: string) => void
  onStartPayment: () => void
  onCancelPayment: () => void
  onRecordPayment: () => void
  onReportIssue: () => void
}

function OrderActionsPanel({
  order,
  showPaymentInput,
  paymentAmount,
  isRecordingPayment,
  onPaymentAmountChange,
  onStartPayment,
  onCancelPayment,
  onRecordPayment,
  onReportIssue,
}: OrderActionsPanelProps) {
  return (
    <div className="px-4 pb-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {order.settlementState !== 'Paid' && order.deliveredAt && (
        <>
          {showPaymentInput ? (
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Amount"
                value={paymentAmount}
                onChange={(e) => onPaymentAmountChange(e.target.value)}
                className="flex-1"
                style={{ borderRadius: 'var(--radius-input)' }}
              />
              <Button
                onClick={onRecordPayment}
                disabled={isRecordingPayment || !paymentAmount}
                size="sm"
                style={{ backgroundColor: 'var(--brand-primary)', color: '#FFFFFF', borderRadius: 'var(--radius-button-sm)', fontWeight: 600 }}
              >
                {isRecordingPayment ? 'Saving...' : 'Save'}
              </Button>
              <Button
                onClick={onCancelPayment}
                variant="outline"
                size="sm"
                style={{ borderRadius: 'var(--radius-button-sm)', borderColor: 'var(--border-light)', color: 'var(--text-primary)', fontWeight: 600 }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              onClick={onStartPayment}
              className="w-full"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-button)',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                minHeight: '44px',
              }}
            >
              Record Payment
            </button>
          )}
        </>
      )}
      <button
        onClick={onReportIssue}
        className="w-full"
        style={{
          border: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-card)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--radius-button)',
          padding: '12px',
          fontSize: '14px',
          fontWeight: 600,
          minHeight: '44px',
        }}
      >
        Raise Issue
      </button>
    </div>
  )
}
