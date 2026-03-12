import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { recordPayment, addAttachment, deleteAttachment, acknowledgeIssue, resolveIssue } from '@/lib/interactions'
import { useDataListener } from '@/lib/data-events'
import { formatDistanceToNow } from 'date-fns'
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

interface Props {
  orderId: string
  connectionId: string
  currentBusinessId: string
  onBack: () => void
  onReportIssue: (orderId: string, connectionId: string) => void
  initialIssueId?: string
}

export function OrderDetailScreen({ orderId, connectionId, currentBusinessId, onBack, onReportIssue, initialIssueId }: Props) {
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
              {payments.map(payment => (
                <div key={payment.id} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-section)' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatInrCurrency(payment.amountPaid)}
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

        <OrderActionsPanel
          order={order}
          showPaymentInput={showPaymentInput}
          paymentAmount={paymentAmount}
          isRecordingPayment={isRecordingPayment}
          onPaymentAmountChange={setPaymentAmount}
          onStartPayment={() => setShowPaymentInput(true)}
          onCancelPayment={() => { setShowPaymentInput(false); setPaymentAmount('') }}
          onRecordPayment={handleRecordPayment}
          onReportIssue={() => onReportIssue(orderId, connectionId)}
        />
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
