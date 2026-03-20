import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { recordPayment, addAttachment, deleteAttachment, acknowledgeIssue, resolveIssue, transitionOrderState, disputePayment } from '@/lib/interactions'
import { useDataListener } from '@/lib/data-events'
import { formatDistanceToNow, differenceInDays } from 'date-fns'
import type { Connection, OrderWithPaymentState, BusinessEntity, PaymentEvent, IssueReport, OrderAttachment, AttachmentType } from '@/lib/types'
import { CaretLeft, Receipt } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { formatInrCurrency } from '@/lib/utils'
import { AddAttachmentSheet } from '@/components/AddAttachmentSheet'
import { AttachmentViewer } from '@/components/AttachmentViewer'
import { IssueDetailSheet } from '@/components/IssueDetailSheet'
import { DispatchBottomSheet } from '@/components/DispatchBottomSheet'
import { DeliveryProofBottomSheet } from '@/components/DeliveryProofBottomSheet'
import { PaymentAttachmentBottomSheet } from '@/components/PaymentAttachmentBottomSheet'
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
  onNavigateToInvoiceCreate?: (orderId: string, connectionId: string) => void
  onNavigateToInvoiceView?: (invoiceId: string) => void
}

export function OrderDetailScreen({ orderId, connectionId, currentBusinessId, mode = 'issue', onBack, onReportIssue, initialIssueId, onNavigateToInvoiceCreate, onNavigateToInvoiceView }: Props) {
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
  const [paymentError, setPaymentError] = useState('')
  const [processingAction, setProcessingAction] = useState(false)
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [disputingPaymentId, setDisputingPaymentId] = useState<string | null>(null)

  // Bottom sheets
  const [showDispatchSheet, setShowDispatchSheet] = useState(false)
  const [showDeliveryProofSheet, setShowDeliveryProofSheet] = useState(false)
  const [pendingPaymentForAttachment, setPendingPaymentForAttachment] = useState<{ id: string; amount: number; timestamp: number } | null>(null)

  // Attachments (legacy)
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false)
  const [viewingAttachmentIndex, setViewingAttachmentIndex] = useState<number | null>(null)

  // Invoice
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null)

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

    const [otherBiz, myBiz, paymentEvents, issueReports, orderAttachments, invoiceData] = await Promise.all([
      dataStore.getBusinessEntityById(otherId),
      dataStore.getBusinessEntityById(currentBusinessId),
      dataStore.getPaymentEventsByOrderId(orderId),
      dataStore.getIssueReportsByOrderId(orderId),
      dataStore.getAttachmentsByOrderId(orderId),
      dataStore.getInvoiceByOrderId(orderId),
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
    setExistingInvoiceId(invoiceData?.id || null)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [orderId, connectionId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'issues:changed', 'attachments:changed', 'invoices:changed'],
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

  const handleAccept = async () => {
    if (processingAction) return
    setProcessingAction(true)
    try {
      await transitionOrderState(orderId, 'Accepted', currentBusinessId)
      toast.success('Order accepted')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept order')
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

  // Supplier taps "Mark dispatched": open sheet to collect invoice amount before recording dispatch
  const handleDispatch = () => {
    setShowDispatchSheet(true)
  }

  // Buyer taps "Mark delivered": immediate, no proof required
  const handleBuyerMarkDelivered = async () => {
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

  // Supplier taps "Mark as delivered": opens proof sheet, delivery only confirmed after proof upload
  const handleSupplierMarkDeliveredTap = () => {
    setShowDeliveryProofSheet(true)
  }

  const handleDeliveryProofConfirmed = async () => {
    setShowDeliveryProofSheet(false)
    if (processingAction) return
    setProcessingAction(true)
    try {
      await transitionOrderState(orderId, 'Delivered', currentBusinessId)
      toast.success('Delivery confirmed with proof')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm delivery')
    } finally {
      setProcessingAction(false)
    }
  }

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
      const payment = await recordPayment(orderId, amount, currentBusinessId)
      toast.success('Payment recorded')
      setShowPaymentInput(false)
      setPaymentAmount('')
      await loadData()
      // Open payment attachment sheet
      setPendingPaymentForAttachment({ id: payment.id, amount: payment.amountPaid, timestamp: payment.timestamp })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setIsRecordingPayment(false)
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
  const timeline = buildOrderTimeline(order, buyerName, supplierName, payments, attachments)

  // Partition attachments by type for inline display
  const dispatchAttachments = attachments.filter(a => a.type === 'dispatch_note')
  const deliveryAttachments = attachments.filter(a => a.type === 'delivery_proof')
  const paymentAttachments = attachments.filter(a => a.type === 'payment_proof')

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

        <OrderTimeline
          timeline={timeline}
          dispatchAttachments={dispatchAttachments}
          deliveryAttachments={deliveryAttachments}
          paymentAttachments={paymentAttachments}
        />

        <OrderAttachmentsSection
          attachments={attachments}
          currentBusinessId={currentBusinessId}
          buyerBusiness={isSupplier ? otherBusiness : myBusiness}
          supplierBusiness={isSupplier ? myBusiness : otherBusiness}
          onAddAttachment={() => setShowAttachmentSheet(true)}
          onViewAttachment={(index) => setViewingAttachmentIndex(index)}
          onDeleteAttachment={handleDeleteAttachment}
        />

        {/* Invoice Button */}
        {isConnectionMode && (
          <div className="px-4 mb-3">
            {isSupplier && !existingInvoiceId && onNavigateToInvoiceCreate && (
              <button
                onClick={() => onNavigateToInvoiceCreate(orderId, connectionId)}
                className="w-full flex items-center justify-center gap-2"
                style={{
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#4A6CF7',
                  backgroundColor: 'rgba(74,108,247,0.06)',
                  border: '1px solid rgba(74,108,247,0.2)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                <Receipt size={16} weight="bold" />
                Generate invoice
              </button>
            )}
            {existingInvoiceId && onNavigateToInvoiceView && (
              <button
                onClick={() => onNavigateToInvoiceView(existingInvoiceId)}
                className="w-full flex items-center justify-center gap-2"
                style={{
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#4A6CF7',
                  backgroundColor: 'rgba(74,108,247,0.06)',
                  border: '1px solid rgba(74,108,247,0.2)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                <Receipt size={16} weight="bold" />
                View invoice
              </button>
            )}
          </div>
        )}

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
                const proofForPayment = paymentAttachments.filter(a => a.paymentEventId === payment.id)
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
                  {proofForPayment.length > 0 && (
                    <div className="mt-1">
                      {proofForPayment.map(att => (
                        <a
                          key={att.id}
                          href={att.fileUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '11px', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 {att.fileName || 'Payment proof'} <span style={{ textDecoration: 'underline' }}>View</span>
                        </a>
                      ))}
                    </div>
                  )}
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

        {/* Actions — role-gated per spec */}
        <div className="px-4 pb-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* ── Status: Placed ── */}
          {lifecycleState === 'Placed' && isBuyer && (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-card)',
              padding: '16px',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Waiting for supplier to accept
              </p>
              {!showCancelConfirm ? (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}
                >
                  Cancel order
                </button>
              ) : (
                <div className="space-y-2 mt-3">
                  <p className="text-[13px] text-foreground text-center">Cancel this order?</p>
                  <div className="flex gap-2">
                    <button onClick={handleCancelOrder} disabled={processingAction} className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded text-white" style={{ backgroundColor: 'var(--status-overdue)' }}>Yes, cancel</button>
                    <button onClick={() => setShowCancelConfirm(false)} disabled={processingAction} className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded bg-muted text-foreground">Keep order</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {lifecycleState === 'Placed' && isSupplier && (
            <div className="space-y-3">
              <button
                onClick={handleAccept}
                disabled={processingAction}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--brand-primary)',
                  color: '#FFFFFF',
                  borderRadius: 'var(--radius-button)',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  minHeight: '44px',
                  border: 'none',
                }}
              >
                {processingAction ? 'Processing...' : 'Accept order'}
              </button>
              {!showDeclineConfirm ? (
                <button
                  onClick={() => setShowDeclineConfirm(true)}
                  style={{
                    width: '100%',
                    backgroundColor: '#FFF0F0',
                    color: '#EF4444',
                    borderRadius: 'var(--radius-button)',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    minHeight: '44px',
                    border: '1px solid #FECACA',
                  }}
                >
                  Decline order
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] text-foreground text-center">Decline this order?</p>
                  <div className="flex gap-2">
                    <button onClick={handleDecline} disabled={processingAction} className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded text-white" style={{ backgroundColor: 'var(--status-overdue)' }}>Yes, decline</button>
                    <button onClick={() => setShowDeclineConfirm(false)} disabled={processingAction} className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded bg-muted text-foreground">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Status: Accepted ── */}
          {lifecycleState === 'Accepted' && isSupplier && (
            <button
              onClick={handleDispatch}
              disabled={processingAction}
              style={{
                width: '100%',
                backgroundColor: 'var(--brand-primary)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-button)',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                minHeight: '44px',
                border: 'none',
              }}
            >
              {processingAction ? 'Processing...' : 'Mark dispatched'}
            </button>
          )}

          {/* ── Status: Dispatched ── */}
          {lifecycleState === 'Dispatched' && isBuyer && (
            <button
              onClick={handleBuyerMarkDelivered}
              disabled={processingAction}
              style={{
                width: '100%',
                backgroundColor: 'var(--brand-primary)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-button)',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                minHeight: '44px',
                border: 'none',
              }}
            >
              {processingAction ? 'Processing...' : 'Mark delivered'}
            </button>
          )}

          {lifecycleState === 'Dispatched' && isSupplier && (
            <button
              onClick={handleSupplierMarkDeliveredTap}
              disabled={processingAction}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-button)',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                minHeight: '44px',
                border: '1px solid var(--border-light)',
              }}
            >
              Mark as delivered
            </button>
          )}

          {/* ── Status: Delivered — Record payment (both parties, until fully paid) ── */}
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
                  Record payment
                </button>
              )}
              {paymentError && <p className="text-[12px] text-destructive">{paymentError}</p>}
            </>
          )}

          {/* Raise Issue — available after dispatch */}
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

          {(lifecycleState === 'Declined') && (
            <p className="text-[13px] text-muted-foreground text-center py-4">
              This order was declined
            </p>
          )}
        </div>
      </div>

      {/* Dispatch bottom sheet (optional attachment) */}
      <DispatchBottomSheet
        open={showDispatchSheet}
        orderId={orderId}
        currentBusinessId={currentBusinessId}
        onClose={() => setShowDispatchSheet(false)}
      />

      {/* Delivery proof bottom sheet (required for supplier) */}
      <DeliveryProofBottomSheet
        open={showDeliveryProofSheet}
        orderId={orderId}
        currentBusinessId={currentBusinessId}
        onClose={() => setShowDeliveryProofSheet(false)}
        onDeliveryConfirmed={handleDeliveryProofConfirmed}
      />

      {/* Payment attachment bottom sheet (optional) */}
      {pendingPaymentForAttachment && (
        <PaymentAttachmentBottomSheet
          open={!!pendingPaymentForAttachment}
          orderId={orderId}
          currentBusinessId={currentBusinessId}
          amountPaid={pendingPaymentForAttachment.amount}
          paymentTimestamp={pendingPaymentForAttachment.timestamp}
          onClose={() => setPendingPaymentForAttachment(null)}
        />
      )}

      {/* Legacy attachment sheet */}
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
