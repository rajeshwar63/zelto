import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { recordPayment, addAttachment, deleteAttachment } from '@/lib/interactions'
import { useDataListener } from '@/lib/data-events'
import { formatDistanceToNow, differenceInDays } from 'date-fns'
import type { Connection, OrderWithPaymentState, BusinessEntity, PaymentEvent, IssueReport, OrderAttachment, AttachmentType } from '@/lib/types'
import { CaretLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { getLifecycleStatusColor, getDueDateColor } from '@/lib/semantic-colors'
import { OrderAttachments } from '@/components/OrderAttachments'
import { AddAttachmentSheet } from '@/components/AddAttachmentSheet'
import { AttachmentViewer } from '@/components/AttachmentViewer'

interface Props {
  orderId: string
  connectionId: string
  currentBusinessId: string
  onBack: () => void
  onReportIssue: (orderId: string, connectionId: string) => void
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

export function OrderDetailScreen({ orderId, connectionId, currentBusinessId, onBack, onReportIssue }: Props) {
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

  // Attachments
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false)
  const [viewingAttachmentIndex, setViewingAttachmentIndex] = useState<number | null>(null)

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

  const handleRecordPayment = async () => {
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) return

    setIsRecordingPayment(true)
    try {
      await recordPayment(orderId, amount, currentBusinessId)
      toast.success('Payment recorded')
      setShowPaymentInput(false)
      setPaymentAmount('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setIsRecordingPayment(false)
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

  if (loading || !order || !connection) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const lifecycleState = getLifecycleState(order)
  const dueDateLabel = formatDueDate(order)
  const dueDateColor = getDueDateColor(dueDateLabel)
  const isSupplier = connection.supplierBusinessId === currentBusinessId
  const buyerName = isSupplier ? (otherBusiness?.businessName || 'Unknown') : (myBusiness?.businessName || 'You')
  const supplierName = isSupplier ? (myBusiness?.businessName || 'You') : (otherBusiness?.businessName || 'Unknown')

  // Build timeline
  const timeline: TimelineEvent[] = [
    {
      label: 'Order Placed',
      actor: buyerName,
      timestamp: order.createdAt,
      completed: true,
    },
  ]

  if (order.acceptedAt || order.dispatchedAt || order.deliveredAt) {
    timeline.push({
      label: 'Accepted',
      actor: supplierName,
      timestamp: order.acceptedAt,
      completed: !!order.acceptedAt,
    })
  }

  if (order.dispatchedAt || order.deliveredAt) {
    timeline.push({
      label: 'Dispatched',
      actor: supplierName,
      timestamp: order.dispatchedAt,
      completed: !!order.dispatchedAt,
    })
  }

  if (order.deliveredAt) {
    timeline.push({
      label: 'Delivered',
      actor: '',
      timestamp: order.deliveredAt,
      completed: true,
    })
  }

  if (payments.length > 0) {
    timeline.push({
      label: order.settlementState === 'Paid' ? 'Paid' : 'Payment Recorded',
      actor: '',
      timestamp: payments[payments.length - 1].timestamp,
      completed: true,
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-3">
          <button onClick={onBack} className="text-foreground">
            <CaretLeft size={22} weight="regular" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal">Order</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Order Summary */}
        <div className="px-4 py-4 border-b border-border">
          <p className="text-[17px] font-medium text-foreground">{order.itemSummary}</p>
          {order.orderValue > 0 && (
            <p className="text-[24px] font-semibold text-foreground mt-1">
              ₹{order.orderValue.toLocaleString('en-IN')}
            </p>
          )}
          <p className="text-[13px] text-muted-foreground mt-1">
            {otherBusiness?.businessName || 'Unknown'}
          </p>
        </div>

        {/* Payment Status */}
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Payment
          </h2>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">
              {formatPaymentTerms(order.paymentTermSnapshot)}
            </p>
            <p className="text-[13px] font-medium" style={{ color: dueDateColor }}>
              {dueDateLabel}
            </p>
          </div>
          {order.totalPaid > 0 && order.settlementState !== 'Paid' && (
            <p className="text-[12px] text-muted-foreground mt-1">
              ₹{order.totalPaid.toLocaleString('en-IN')} paid · ₹{order.pendingAmount.toLocaleString('en-IN')} pending
            </p>
          )}
        </div>

        {/* Timeline */}
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Timeline
          </h2>
          <div className="space-y-0">
            {timeline.map((event, index) => {
              const isLast = index === timeline.length - 1
              const stateColor = event.completed ? getLifecycleStatusColor(event.label) : '#CCCCCC'

              return (
                <div key={`${event.label}-${index}`} className="flex gap-3">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                      style={{ backgroundColor: stateColor }}
                    />
                    {!isLast && (
                      <div className="w-px flex-1 min-h-[24px] bg-border" />
                    )}
                  </div>
                  {/* Event content */}
                  <div className="pb-4">
                    <p className="text-[14px] text-foreground">{event.label}</p>
                    {event.actor && (
                      <p className="text-[12px] text-muted-foreground">{event.actor}</p>
                    )}
                    {event.timestamp && (
                      <p className="text-[12px] text-muted-foreground">
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Attachments */}
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Attachments
          </h2>
          {attachments.length > 0 && myBusiness && otherBusiness ? (
            <OrderAttachments
              attachments={attachments}
              currentBusinessId={currentBusinessId}
              buyerBusiness={isSupplier ? otherBusiness : myBusiness}
              supplierBusiness={isSupplier ? myBusiness : otherBusiness}
              onAddAttachment={() => setShowAttachmentSheet(true)}
              onViewAttachment={(index) => setViewingAttachmentIndex(index)}
              onDeleteAttachment={(attachment) => handleDeleteAttachment(attachment.id)}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">No attachments</p>
          )}
          <button
            onClick={() => setShowAttachmentSheet(true)}
            className="text-[13px] text-foreground mt-2"
          >
            + Add attachment
          </button>
        </div>

        {/* Payment Details */}
        {payments.length > 0 && (
          <div className="px-4 py-4 border-b border-border">
            <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Payments
            </h2>
            {payments.map(payment => (
              <div key={payment.id} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-[13px] text-foreground">
                    ₹{payment.amountPaid.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(payment.timestamp, { addSuffix: true })}
                  </p>
                </div>
                {payment.disputed && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ color: '#D64545', backgroundColor: '#FEE2E2' }}>
                    Disputed
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Issues */}
        {issues.length > 0 && (
          <div className="px-4 py-4 border-b border-border">
            <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Issues
            </h2>
            {issues.map(issue => (
              <div key={issue.id} className="py-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-foreground">{issue.issueType}</p>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      color: issue.status === 'Resolved' ? '#4CAF50' : '#D64545',
                      backgroundColor: issue.status === 'Resolved' ? '#E8F5E9' : '#FEE2E2',
                    }}
                  >
                    {issue.status}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {issue.severity} · {formatDistanceToNow(issue.createdAt, { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-4 space-y-3">
          {order.settlementState !== 'Paid' && order.deliveredAt && (
            <>
              {showPaymentInput ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleRecordPayment}
                    disabled={isRecordingPayment || !paymentAmount}
                    size="sm"
                  >
                    {isRecordingPayment ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    onClick={() => { setShowPaymentInput(false); setPaymentAmount('') }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowPaymentInput(true)}
                  variant="outline"
                  className="w-full"
                >
                  Record Payment
                </Button>
              )}
            </>
          )}
          <Button
            onClick={() => onReportIssue(orderId, connectionId)}
            variant="outline"
            className="w-full"
          >
            Raise Issue
          </Button>
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
    </div>
  )
}
