import { useEffect, useState, useRef } from 'react'
import { dataStore } from '@/lib/data-store'
import { insightEngine } from '@/lib/insight-engine'
import { transitionOrderState, recordPayment, createIssue, createOrder } from '@/lib/interactions'
import { formatDistanceToNow, differenceInDays, format } from 'date-fns'
import type { Connection, OrderWithPaymentState, BusinessEntity, PaymentEvent } from '@/lib/types'
import { CaretLeft, CaretDown, CaretRight } from '@phosphor-icons/react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { getConnectionStateColor, getDueDateColor, getLifecycleStatusColor } from '@/lib/semantic-colors'
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion'
import { getArchivedOrderIds, archiveOrder as doArchiveOrder, unarchiveOrder as doUnarchiveOrder } from '@/lib/archive-store'

interface Props {
  connectionId: string
  currentBusinessId: string
  selectedOrderId?: string
  onBack: () => void
  onNavigateToPaymentTermsSetup: (connectionId: string, businessName: string) => void
}

type TimeFilter = '7d' | '30d' | '90d' | '1y'

function formatPaymentTerms(terms: Connection['paymentTerms']): string {
  if (!terms) return 'Not set'
  switch (terms.type) {
    case 'Advance Required': return 'Advance Required'
    case 'Payment on Delivery': return 'Payment on Delivery'
    case 'Bill to Bill': return 'Bill to Bill'
    case 'Days After Delivery': return `${terms.days} days after delivery`
  }
}

function getLifecycleState(order: OrderWithPaymentState): string {
  if (order.declinedAt) return 'Declined'
  if (order.deliveredAt) return 'Delivered'
  if (order.dispatchedAt) return 'Dispatched'
  if (order.acceptedAt) return 'Accepted'
  return 'Placed'
}

function formatDueDate(order: OrderWithPaymentState): string {
  if (order.settlementState === 'Paid') return 'Paid'
  if (!order.calculatedDueDate) {
    if (!order.deliveredAt) return 'Awaiting delivery'
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

function formatTimestamp(timestamp: number, isOld: boolean): string {
  if (isOld) return format(timestamp, 'MMM d, yyyy')
  return formatDistanceToNow(timestamp, { addSuffix: true })
}

const filterDurations: Record<TimeFilter, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
}

export function ConnectionDetailScreen({ connectionId, currentBusinessId, selectedOrderId, onBack, onNavigateToPaymentTermsSetup }: Props) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [otherBusiness, setOtherBusiness] = useState<BusinessEntity | null>(null)
  const [orders, setOrders] = useState<OrderWithPaymentState[]>([])
  const [insights, setInsights] = useState<string[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30d')
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(selectedOrderId || null)
  const [newOrderMessage, setNewOrderMessage] = useState('')
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())

  const loadHeaderData = async () => {
    try {
      const conn = await dataStore.getConnectionById(connectionId)
      if (!conn) return
      const otherId = conn.buyerBusinessId === currentBusinessId ? conn.supplierBusinessId : conn.buyerBusinessId
      const otherBiz = await dataStore.getBusinessEntityById(otherId)
      if (!conn.paymentTerms && conn.supplierBusinessId === currentBusinessId) {
        onNavigateToPaymentTermsSetup(connectionId, otherBiz?.businessName || 'Unknown')
        return
      }
      const viewerRole = conn.buyerBusinessId === currentBusinessId ? 'buyer' : 'supplier'
      let connectionInsights: string[] = []
      try {
        connectionInsights = await insightEngine.getInsightsForConnection(connectionId, viewerRole)
      } catch {
        // Insights are non-critical, don't block data refresh
      }
      setConnection(conn)
      setOtherBusiness(otherBiz || null)
      setInsights(connectionInsights)
      setLoading(false)
    } catch (err) {
      console.error('Failed to load connection data:', err)
      setLoading(false)
    }
  }

  const loadOrders = async () => {
    try {
      const allOrders = await dataStore.getOrdersWithPaymentStateByConnectionId(connectionId)
      setOrders(allOrders.sort((a, b) => b.createdAt - a.createdAt))
    } catch (err) {
      console.error('Failed to load orders:', err)
    }
  }

  const refreshArchivedIds = () => {
    setArchivedIds(getArchivedOrderIds(currentBusinessId))
  }

  useEffect(() => { loadHeaderData(); loadOrders(); refreshArchivedIds() }, [connectionId, currentBusinessId])

  const handleArchiveOrder = (orderId: string) => {
    doArchiveOrder(currentBusinessId, orderId)
    refreshArchivedIds()
    toast.success('Order archived')
  }

  const handleUnarchiveOrder = (orderId: string) => {
    doUnarchiveOrder(currentBusinessId, orderId)
    refreshArchivedIds()
    toast.success('Order restored')
  }

  const handleSendOrder = async () => {
    if (!newOrderMessage.trim()) return
    if (creatingOrder) return

    const orderText = newOrderMessage.trim()
    setNewOrderMessage('')
    setCreatingOrder(true)

    try {
      await createOrder(connectionId, orderText, 0, currentBusinessId)
      toast.success('Order placed')
      await loadOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
      setNewOrderMessage(orderText)
    } finally {
      setCreatingOrder(false)
    }
  }

  if (loading || !connection || !otherBusiness) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const timeFilteredOrders = orders.filter(order => order.createdAt >= Date.now() - filterDurations[timeFilter])
  const activeOrders = timeFilteredOrders.filter(o => !archivedIds.has(o.id))
  const archivedOrders = timeFilteredOrders.filter(o => archivedIds.has(o.id))
  const filteredOrders = showArchived ? archivedOrders : activeOrders
  const totalOrders = activeOrders.length
  const totalValue = activeOrders.reduce((sum, order) => sum + order.orderValue, 0)
  const outstandingBalance = activeOrders.reduce((sum, order) => {
    if (order.settlementState !== 'Paid') return sum + (order.pendingAmount || 0)
    return sum
  }, 0)
  const oldOrderThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000
  const isSupplier = connection.supplierBusinessId === currentBusinessId
  const isBuyer = connection.buyerBusinessId === currentBusinessId
  const canPlaceOrder = isBuyer && connection.paymentTerms !== null

  const viewingOrder = viewingOrderId ? orders.find(o => o.id === viewingOrderId) : null
  if (viewingOrder) {
    return (
      <OrderDetailView
        order={viewingOrder}
        connection={connection}
        currentBusinessId={currentBusinessId}
        onBack={() => setViewingOrderId(null)}
        onRefreshOrders={loadOrders}
      />
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center text-foreground hover:text-muted-foreground">
            <CaretLeft size={20} weight="regular" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal flex-1">{otherBusiness.businessName}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2">
          <div className="flex items-center gap-2">
            <p className="text-[13px] text-muted-foreground">{formatPaymentTerms(connection.paymentTerms)}</p>
            <span className="text-[13px] text-muted-foreground">·</span>
            <p className="text-[13px]" style={{ color: getConnectionStateColor(connection.connectionState) }}>
              {connection.connectionState}
            </p>
          </div>
          {isSupplier && (
            <button
              onClick={() => onNavigateToPaymentTermsSetup(connectionId, otherBusiness.businessName)}
              className="text-[12px] text-muted-foreground hover:text-foreground mt-1"
            >
              Edit payment terms
            </button>
          )}
        </div>

        <div className="px-4 py-2 text-[13px] text-muted-foreground">
          <span>{totalOrders} order{totalOrders !== 1 ? 's' : ''}</span>
          <span className="mx-1.5">·</span>
          <span>₹{totalValue.toLocaleString('en-IN')} total</span>
          {outstandingBalance > 0 && (
            <>
              <span className="mx-1.5">·</span>
              <span style={{ color: '#E8A020' }}>₹{outstandingBalance.toLocaleString('en-IN')} outstanding</span>
            </>
          )}
        </div>

        <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {(['7d', '30d', '90d', '1y'] as TimeFilter[]).map(f => (
            <FilterButton
              key={f}
              label={f === '7d' ? 'Last 7 days' : f === '30d' ? 'Last 30 days' : f === '90d' ? '90 days' : '1 year'}
              active={timeFilter === f && !showArchived}
              onClick={() => { setTimeFilter(f); setShowArchived(false) }}
            />
          ))}
          {archivedOrders.length > 0 && (
            <FilterButton
              label={`Archived (${archivedOrders.length})`}
              active={showArchived}
              onClick={() => setShowArchived(!showArchived)}
            />
          )}
        </div>

        {insights.length > 0 && (
          <div className="px-4 py-3">
            <Collapsible open={insightsOpen} onOpenChange={setInsightsOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-2">
                <span>Insights</span>
                {insightsOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-1.5">
                  {insights.map((insight, idx) => (
                    <p key={idx} className="text-[12px] text-muted-foreground leading-relaxed">{insight}</p>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <div className="pb-4">
          {filteredOrders.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                {showArchived ? 'No archived orders' : 'No orders in this period'}
              </p>
            </div>
          ) : (
            filteredOrders.map(order => {
              const isOld = order.createdAt < oldOrderThreshold
              const lifecycleState = getLifecycleState(order)
              const dueLabel = formatDueDate(order)
              return (
                <SwipeableOrderRow
                  key={order.id}
                  actionLabel={showArchived ? 'Unarchive' : 'Archive'}
                  onAction={() => showArchived ? handleUnarchiveOrder(order.id) : handleArchiveOrder(order.id)}
                >
                  <button
                    onClick={() => setViewingOrderId(order.id)}
                    className={`px-4 py-3 w-full text-left ${lifecycleState === 'Declined' ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <p className={`text-[14px] leading-snug ${isOld ? 'text-muted-foreground/80 text-[13px]' : 'text-foreground'}`}>
                        {order.itemSummary}
                      </p>
                      <div className="ml-3 flex-shrink-0 text-right">
                        {order.settlementState === 'Paid' ? (
                          <div>
                            <p className="text-[14px] font-medium" style={{ color: '#4CAF50' }}>₹{order.orderValue.toLocaleString('en-IN')}</p>
                            <p className="text-[11px]" style={{ color: '#4CAF50' }}>Paid</p>
                          </div>
                        ) : order.settlementState === 'Partial Payment' ? (
                          <div>
                            <p className="text-[14px] font-medium" style={{ color: '#E8A020' }}>₹{order.pendingAmount.toLocaleString('en-IN')} remaining</p>
                            <p className="text-[11px] text-muted-foreground">of ₹{order.orderValue.toLocaleString('en-IN')}</p>
                          </div>
                        ) : (
                          <p className={`text-[14px] font-medium ${isOld ? 'text-muted-foreground/80 text-[13px]' : 'text-foreground'}`}>
                            ₹{order.orderValue.toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">{formatTimestamp(order.createdAt, isOld)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span style={{ color: getLifecycleStatusColor(lifecycleState) }}>{lifecycleState}</span>
                      </div>
                      <p style={{ color: getDueDateColor(dueLabel) }}>{dueLabel}</p>
                    </div>
                  </button>
                </SwipeableOrderRow>
              )
            })
          )}
        </div>
      </div>

      {canPlaceOrder && (
        <div style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#ffffff', padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <textarea
              value={newOrderMessage}
              onChange={e => {
                setNewOrderMessage(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 72) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && newOrderMessage.trim() && !creatingOrder) {
                  e.preventDefault()
                  handleSendOrder()
                }
              }}
              placeholder="Type your order..."
              disabled={creatingOrder}
              rows={1}
              style={{
                flex: 1,
                padding: '10px 14px',
                fontSize: '15px',
                lineHeight: '20px',
                minHeight: '40px',
                maxHeight: '72px',
                backgroundColor: '#F5F5F5',
                border: 'none',
                borderRadius: '20px',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                overflowY: 'auto'
              }}
            />
            <button
              onClick={handleSendOrder}
              disabled={creatingOrder || !newOrderMessage.trim()}
              style={{
                padding: '10px 18px',
                backgroundColor: '#1A1A2E',
                color: '#ffffff',
                border: 'none',
                borderRadius: '20px',
                fontSize: '15px',
                fontWeight: '500',
                cursor: creatingOrder ? 'not-allowed' : 'pointer',
                opacity: !newOrderMessage.trim() ? 0.5 : 1,
                flexShrink: 0,
                marginBottom: '2px'
              }}
            >
              {creatingOrder ? 'Sending...' : 'Order'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const SWIPE_THRESHOLD = 80

function SwipeableOrderRow({
  children,
  actionLabel,
  onAction,
}: {
  children: React.ReactNode
  actionLabel: string
  onAction: () => void
}) {
  const x = useMotionValue(0)
  const actionOpacity = useTransform(x, [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD / 2, 0], [1, 0.6, 0])
  const containerRef = useRef<HTMLDivElement>(null)
  const didSwipe = useRef(false)

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) {
      // Snap open
      animate(x, -SWIPE_THRESHOLD, { type: 'spring', stiffness: 300, damping: 30 })
      didSwipe.current = true
    } else {
      // Snap closed
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 })
      didSwipe.current = false
    }
  }

  const handleAction = () => {
    animate(x, -300, { type: 'spring', stiffness: 300, damping: 30 })
    setTimeout(onAction, 200)
  }

  // Close swipe when tapping elsewhere
  useEffect(() => {
    const handleTouchOutside = (e: PointerEvent) => {
      if (didSwipe.current && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 })
        didSwipe.current = false
      }
    }
    document.addEventListener('pointerdown', handleTouchOutside)
    return () => document.removeEventListener('pointerdown', handleTouchOutside)
  }, [x])

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      <motion.div style={{ opacity: actionOpacity }} className="absolute right-0 top-0 bottom-0 flex items-center">
        <button
          onClick={handleAction}
          className="h-full px-5 flex items-center text-[13px] font-medium text-white"
          style={{ backgroundColor: actionLabel === 'Archive' ? '#8B8B8B' : '#4CAF50' }}
        >
          {actionLabel}
        </button>
      </motion.div>
      <motion.div
        style={{ x, backgroundColor: '#ffffff' }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -SWIPE_THRESHOLD, right: 0 }}
        dragElastic={{ left: 0.2, right: 0 }}
        onDragEnd={handleDragEnd}
      >
        {children}
      </motion.div>
    </div>
  )
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-[12px] whitespace-nowrap transition-colors relative ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
      {active && <span className="absolute bottom-0 left-0 right-0 h-[1px] bg-foreground" />}
    </button>
  )
}

interface OrderDetailViewProps {
  order: OrderWithPaymentState
  connection: Connection
  currentBusinessId: string
  onBack: () => void
  onRefreshOrders: () => Promise<void>
}

function OrderDetailView({ order: orderProp, connection, currentBusinessId, onBack, onRefreshOrders }: OrderDetailViewProps) {
  const order = orderProp

  const [buyerBusiness, setBuyerBusiness] = useState<BusinessEntity | null>(null)
  const [supplierBusiness, setSupplierBusiness] = useState<BusinessEntity | null>(null)
  const [paymentEvents, setPaymentEvents] = useState<PaymentEvent[]>([])
  const [dispatchAmount, setDispatchAmount] = useState('')
  const [dispatchError, setDispatchError] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [disputingPaymentId, setDisputingPaymentId] = useState<string | null>(null)
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const buyer = await dataStore.getBusinessEntityById(connection.buyerBusinessId)
      const supplier = await dataStore.getBusinessEntityById(connection.supplierBusinessId)
      const payments = await dataStore.getPaymentEventsByOrderId(order.id)
      setBuyerBusiness(buyer || null)
      setSupplierBusiness(supplier || null)
      setPaymentEvents(payments)
    }
    loadData()
  }, [order.id, connection])

  useEffect(() => {
    const checkAndAcceptPayments = async () => {
      const payments = await dataStore.getPaymentEventsByOrderId(order.id)
      const now = Date.now()
      const fortyEightHours = 48 * 60 * 60 * 1000
      for (const payment of payments) {
        if (!payment.disputed && !payment.acceptedAt && payment.recordedBy !== currentBusinessId) {
          if (now - payment.timestamp >= fortyEightHours) {
            await dataStore.acceptPaymentEvent(payment.id)
          }
        }
      }
      const updatedPayments = await dataStore.getPaymentEventsByOrderId(order.id)
      setPaymentEvents(updatedPayments)
    }
    const interval = setInterval(checkAndAcceptPayments, 60000)
    checkAndAcceptPayments()
    return () => clearInterval(interval)
  }, [order.id, currentBusinessId])

  const lifecycleState = getLifecycleState(order)
  const dueLabel = formatDueDate(order)
  const dueDateColor = getDueDateColor(dueLabel)
  const isSupplier = connection.supplierBusinessId === currentBusinessId
  const isBuyer = connection.buyerBusinessId === currentBusinessId

  const refreshPayments = async () => {
    try {
      const payments = await dataStore.getPaymentEventsByOrderId(order.id)
      setPaymentEvents(payments)
    } catch (err) {
      console.error('Failed to refresh payments', err)
    }
  }

  const handleDispatch = async () => {
    if (processing) return
    setProcessing(true)
    setDispatchError('')
    const amount = parseFloat(dispatchAmount)
    if (isNaN(amount) || amount <= 0) {
      setDispatchError('Please enter the order amount before dispatching.')
      setProcessing(false)
      return
    }
    setDispatchAmount('')
    try {
      await transitionOrderState(order.id, 'Dispatched', currentBusinessId, amount)
      toast.success('Order dispatched')
      await onRefreshOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispatch order')
    } finally {
      setProcessing(false)
    }
  }

  const handleDecline = async () => {
    if (processing) return
    setProcessing(true)
    setShowDeclineConfirm(false)
    try {
      await transitionOrderState(order.id, 'Declined', currentBusinessId)
      toast.success('Order declined')
      await onRefreshOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline order')
    } finally {
      setProcessing(false)
    }
  }

  const handleCancel = async () => {
    if (processing) return
    setProcessing(true)
    setShowCancelConfirm(false)
    try {
      await transitionOrderState(order.id, 'Declined', currentBusinessId)
      toast.success('Order cancelled')
      await onRefreshOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel order')
    } finally {
      setProcessing(false)
    }
  }

  const handleMarkDelivered = async () => {
    if (processing) return
    setProcessing(true)
    try {
      await transitionOrderState(order.id, 'Delivered', currentBusinessId)
      toast.success('Order marked as delivered')
      await onRefreshOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as delivered')
    } finally {
      setProcessing(false)
    }
  }

  const handleRecordPayment = async () => {
    if (processing) return
    setProcessing(true)
    setPaymentError('')
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Amount must be greater than zero')
      setProcessing(false)
      return
    }
    if (amount > order.pendingAmount) {
      setPaymentError(`Amount exceeds remaining balance of ₹${order.pendingAmount.toLocaleString('en-IN')}`)
      setProcessing(false)
      return
    }
    setPaymentAmount('')
    try {
      await recordPayment(order.id, amount, currentBusinessId)
      toast.success('Payment recorded')
      await onRefreshOrders()
      await refreshPayments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirmDispute = async (paymentId: string) => {
    if (processing) return
    setProcessing(true)
    try {
      await dataStore.updatePaymentEventDispute(paymentId, true)
      await createIssue(order.id, 'Billing Mismatch', 'Medium', currentBusinessId)

      // Notify the OTHER party about the dispute
      const paymentEvent = paymentEvents.find(p => p.id === paymentId)
      if (paymentEvent) {
        const otherPartyId = currentBusinessId === connection.buyerBusinessId
          ? connection.supplierBusinessId
          : connection.buyerBusinessId
        await dataStore.createNotification(
          otherPartyId,
          'PaymentDisputed',
          paymentEvent.id,
          order.connectionId,
          `A payment has been disputed`
        )
      }

      setDisputingPaymentId(null)
      toast.success('Dispute raised. This has been added to your Attention tab.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispute payment')
      setProcessing(false)
      return
    }
    try { await refreshPayments() } catch {} finally { setProcessing(false) }
  }

  if (!buyerBusiness || !supplierBusiness) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-4">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center text-foreground hover:text-muted-foreground">
            <CaretLeft size={20} weight="regular" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal">Order Details</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        <div>
          <p className="text-[15px] text-foreground mb-3">{order.itemSummary}</p>
          {order.orderValue === 0 && lifecycleState === 'Placed' ? (
            <p className="text-[13px] text-muted-foreground mb-2">Awaiting supplier confirmation</p>
          ) : order.orderValue === 0 ? (
            <p className="text-[13px] text-muted-foreground mb-2">Amount not recorded</p>
          ) : (
            <p className="text-[18px] font-medium text-foreground mb-2">₹{order.orderValue.toLocaleString('en-IN')}</p>
          )}
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">
              {order.paymentTermSnapshot.type === 'Days After Delivery'
                ? `${order.paymentTermSnapshot.days} days after delivery`
                : order.paymentTermSnapshot.type}
            </span>
            <span className="text-muted-foreground">·</span>
            <span style={{ color: dueDateColor }}>{dueLabel}</span>
          </div>
        </div>

        <div>
          <h2 className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-3">Timeline</h2>
          <div className="space-y-4">
            <TimelineItem label={`Placed by ${buyerBusiness.businessName}`} timestamp={order.createdAt} />

            {order.dispatchedAt && (
              <TimelineItem
                label={`Dispatched by ${supplierBusiness.businessName} · ₹${order.orderValue.toLocaleString('en-IN')}`}
                timestamp={order.dispatchedAt}
              />
            )}

            {order.deliveredAt && (
              <TimelineItem
                label={`Delivered · confirmed by ${isSupplier ? supplierBusiness.businessName : buyerBusiness.businessName}`}
                timestamp={order.deliveredAt}
              />
            )}

            {paymentEvents.map(payment => {
              const recordedByBusiness = payment.recordedBy === connection.buyerBusinessId ? buyerBusiness : supplierBusiness
              const canDispute = payment.recordedBy !== currentBusinessId && !payment.disputed && !payment.acceptedAt
              const isShowingConfirmation = disputingPaymentId === payment.id
              return (
                <div key={payment.id} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-2 h-2 rounded-full bg-foreground" />
                    <div className="w-[1px] h-full bg-border mt-1" />
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] text-foreground">
                        ₹{payment.amountPaid.toLocaleString('en-IN')} recorded by {recordedByBusiness?.businessName}
                      </p>
                      {canDispute && (
                        <button
                          onClick={() => setDisputingPaymentId(payment.id)}
                          disabled={processing}
                          className="text-[11px] text-destructive hover:underline"
                        >
                          Dispute
                        </button>
                      )}
                      {payment.acceptedAt && <span className="text-[11px] text-muted-foreground">✓ Accepted</span>}
                      {payment.disputed && <span className="text-[11px] text-destructive">⚠ Disputed</span>}
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(payment.timestamp, { addSuffix: true })}
                    </p>
                    {isShowingConfirmation && (
                      <div className="mt-3">
                        <p className="text-[13px] text-foreground mb-3">Dispute this payment?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirmDispute(payment.id)}
                            disabled={processing}
                            className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded text-white"
                            style={{ backgroundColor: '#D64545' }}
                          >
                            Yes, dispute
                          </button>
                          <button
                            onClick={() => setDisputingPaymentId(null)}
                            disabled={processing}
                            className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded bg-muted text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {lifecycleState === 'Delivered' && order.pendingAmount === 0 && (
              <div className="flex gap-3">
                <div className="pt-1"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#4CAF50' }} /></div>
                <p className="text-[13px] font-medium" style={{ color: '#4CAF50' }}>Paid</p>
              </div>
            )}

            {lifecycleState === 'Delivered' && order.pendingAmount > 0 && order.calculatedDueDate && new Date(order.calculatedDueDate) < new Date() && (
              <div className="flex gap-3">
                <div className="pt-1"><div className="w-2 h-2 rounded-full bg-destructive" /></div>
                <p className="text-[13px] font-medium text-destructive">
                  Overdue · ₹{order.pendingAmount.toLocaleString('en-IN')} remaining
                </p>
              </div>
            )}

            {lifecycleState === 'Delivered' && order.pendingAmount > 0 && order.totalPaid > 0 && (!order.calculatedDueDate || new Date(order.calculatedDueDate) >= new Date()) && (
              <div className="flex gap-3">
                <div className="pt-1"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E8A020' }} /></div>
                <p className="text-[13px] font-medium" style={{ color: '#E8A020' }}>
                  Partial Payment · ₹{order.pendingAmount.toLocaleString('en-IN')} remaining
                </p>
              </div>
            )}
          </div>
        </div>

        {lifecycleState === 'Placed' && isSupplier && (
          <div className="space-y-3">
            <Input
              type="number"
              placeholder="Enter amount ₹"
              value={dispatchAmount}
              onChange={e => { setDispatchAmount(e.target.value); setDispatchError('') }}
            />
            {dispatchError && <p className="text-[12px] text-destructive">{dispatchError}</p>}
            <Button
              onClick={handleDispatch}
              disabled={processing || !dispatchAmount || parseFloat(dispatchAmount) <= 0}
              className="w-full"
            >
              Dispatch
            </Button>
            {!showDeclineConfirm ? (
              <button
                onClick={() => setShowDeclineConfirm(true)}
                className="text-[12px] text-muted-foreground hover:text-foreground w-full text-center"
              >
                Can't fulfil this order
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[13px] text-foreground text-center">Can't fulfil this order?</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDecline}
                    disabled={processing}
                    className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded text-white"
                    style={{ backgroundColor: '#D64545' }}
                  >
                    Yes, decline
                  </button>
                  <button
                    onClick={() => setShowDeclineConfirm(false)}
                    disabled={processing}
                    className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded bg-muted text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {lifecycleState === 'Placed' && isBuyer && (
          <div>
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-[12px] text-muted-foreground hover:text-foreground w-full text-center"
              >
                Cancel order
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[13px] text-foreground text-center">Cancel this order?</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={processing}
                    className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded text-white"
                    style={{ backgroundColor: '#D64545' }}
                  >
                    Yes, cancel
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    disabled={processing}
                    className="flex-1 px-3 py-1.5 text-[13px] font-medium rounded bg-muted text-foreground"
                  >
                    Keep order
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {lifecycleState === 'Dispatched' && (
          <Button onClick={handleMarkDelivered} disabled={processing} className="w-full">
            Mark as Delivered
          </Button>
        )}

        {lifecycleState === 'Delivered' && order.pendingAmount > 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Remaining balance: ₹{order.pendingAmount.toLocaleString('en-IN')}
            </p>
            <Input
              type="number"
              placeholder="Enter amount ₹"
              value={paymentAmount}
              onChange={e => { setPaymentAmount(e.target.value); setPaymentError('') }}
              disabled={processing}
            />
            {paymentError && <p className="text-[12px] text-destructive">{paymentError}</p>}
            <Button onClick={handleRecordPayment} disabled={processing} className="w-full">
              Record Payment
            </Button>
          </div>
        )}

        {(lifecycleState === 'Declined' || (lifecycleState === 'Placed' && order.declinedAt)) && (
          <p className="text-[13px] text-muted-foreground text-center py-4">
            This order was {lifecycleState === 'Declined' ? 'declined' : 'cancelled'}
          </p>
        )}
      </div>
    </div>
  )
}

function TimelineItem({ label, timestamp }: { label: string; timestamp: number }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <div className="w-2 h-2 rounded-full bg-foreground" />
        <div className="w-[1px] h-full bg-border mt-1" />
      </div>
      <div className="flex-1 pb-2">
        <p className="text-[13px] text-foreground">{label}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {formatDistanceToNow(timestamp, { addSuffix: true })}
        </p>
      </div>
    </div>
  )
}
