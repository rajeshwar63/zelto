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
  const statusColor = getLifecycleStatusColor(lifecycleState)
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
        {/* Status Header Chip */}
        <div className="px-4 pt-4 pb-2">
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: statusColor,
              backgroundColor: `${statusColor}26`,
              padding: '8px 14px',
              borderRadius: 'var(--radius-chip)',
              display: 'inline-block',
            }}
          >
            {lifecycleState}
          </span>
        </div>

        {/* Order Summary Card */}
        <div className="px-4 mb-3">
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{order.itemSummary}</p>
            {order.orderValue > 0 && (
              <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px', letterSpacing: '-0.02em' }}>
                {order.orderValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
              </p>
            )}
            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '4px' }}>
              {otherBusiness?.businessName || 'Unknown'}
            </p>
          </div>
        </div>

        {/* Payment Summary - Metric Cards */}
        <div className="px-4 mb-3">
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            PAYMENT
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px', border: '1px solid var(--border-light)' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Terms</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                {formatPaymentTerms(order.paymentTermSnapshot)}
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px', border: '1px solid var(--border-light)' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: dueDateColor, marginTop: '4px' }}>
                {dueDateLabel}
              </p>
            </div>
          </div>
          {order.totalPaid > 0 && order.settlementState !== 'Paid' && (
            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '8px' }}>
              {order.totalPaid.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} paid · {order.pendingAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} pending
            </p>
          )}
        </div>

        {/* Timeline */}
        <div className="px-4 mb-3">
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            TIMELINE
          </p>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
            {timeline.map((event, index) => {
              const isLast = index === timeline.length - 1
              const eventColor = event.completed ? getLifecycleStatusColor(event.label) : 'var(--text-tertiary)'

              return (
                <div key={`${event.label}-${index}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="flex-shrink-0 mt-1"
                      style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: eventColor }}
                    />
                    {!isLast && (
                      <div style={{ width: '2px', flex: 1, minHeight: '24px', backgroundColor: eventColor, opacity: 0.3 }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: '16px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{event.label}</p>
                    {event.actor && (
                      <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>{event.actor}</p>
                    )}
                    {event.timestamp && (
                      <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>
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
        <div className="px-4 mb-3">
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            ATTACHMENTS
          </p>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
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
              <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>No attachments</p>
            )}
            <button
              onClick={() => setShowAttachmentSheet(true)}
              style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)', marginTop: '8px', minHeight: '44px', display: 'flex', alignItems: 'center' }}
            >
              + Add attachment
            </button>
          </div>
        </div>

        {/* Payment Details */}
        {payments.length > 0 && (
          <div className="px-4 mb-3">
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              PAYMENTS
            </p>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
              {payments.map(payment => (
                <div key={payment.id} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-section)' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {payment.amountPaid.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                    </p>
                    <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {formatDistanceToNow(payment.timestamp, { addSuffix: true })}
                    </p>
                  </div>
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
              ))}
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
              {issues.map(issue => (
                <div key={issue.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-section)' }}>
                  <div className="flex items-center justify-between">
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{issue.issueType}</p>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: issue.status === 'Resolved' ? 'var(--status-delivered)' : 'var(--status-overdue)',
                        backgroundColor: issue.status === 'Resolved' ? '#F0FFF6' : '#FFF0F0',
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
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pb-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            </>
          )}
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
