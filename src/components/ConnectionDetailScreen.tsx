import { useEffect, useState, useRef, type TouchEvent } from 'react'
import { dataStore } from '@/lib/data-store'
import { insightEngine } from '@/lib/insight-engine'
import { createOrder } from '@/lib/interactions'
import { useDataListener } from '@/lib/data-events'
import { formatDistanceToNow, differenceInDays, format } from 'date-fns'
import type { Connection, OrderWithPaymentState, BusinessEntity } from '@/lib/types'
import { CaretLeft, CaretDown, CaretRight, Paperclip } from '@phosphor-icons/react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardAccent } from '@/components/ui/card'
import { toast } from 'sonner'
import { getConnectionStateColor, getDueDateColor, getLifecycleStatusColor } from '@/lib/semantic-colors'
import { motion, useMotionValue, useTransform, animate, PanInfo, AnimatePresence } from 'framer-motion'
import { getArchivedOrderIds, archiveOrder as doArchiveOrder, unarchiveOrder as doUnarchiveOrder } from '@/lib/archive-store'
import { markOrderSeen, isOrderNew } from '@/lib/unread-tracker'
import { formatInrCurrency } from '@/lib/utils'
import { OrderStatusHeader } from '@/components/order/OrderStatusHeader'
import { OrderPaymentSummary } from '@/components/order/OrderPaymentSummary'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { OrderAttachmentsSection } from '@/components/order/OrderAttachmentsSection'
import { buildOrderTimeline, formatDueDate, formatPaymentTerms, getLifecycleState } from '@/components/order/order-detail-utils'

interface Props {
  connectionId: string
  currentBusinessId: string
  onBack: () => void
  onNavigateToPaymentTermsSetup: (connectionId: string, businessName: string) => void
  onOpenOrderDetail: (orderId: string, connectionId: string) => void
}

type TimeFilter = '7d' | '30d' | '90d' | '1y'

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

export function ConnectionDetailScreen({ connectionId, currentBusinessId, onBack, onNavigateToPaymentTermsSetup, onOpenOrderDetail }: Props) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [otherBusiness, setOtherBusiness] = useState<BusinessEntity | null>(null)
  const [orders, setOrders] = useState<OrderWithPaymentState[]>([])
  const [insights, setInsights] = useState<string[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30d')
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [newOrderMessage, setNewOrderMessage] = useState('')
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({})
  const [pullRevealHeight, setPullRevealHeight] = useState(0)
  const pullStartY = useRef<number | null>(null)
  const lastTouchY = useRef<number | null>(null)
  const lastScrollTop = useRef(0)
  const isPullingReveal = useRef(false)

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

      const orderIds = allOrders.map(o => o.id)
      if (orderIds.length > 0) {
        const counts = await dataStore.getAttachmentCountsByOrderIds(orderIds)
        setAttachmentCounts(counts)
      }
    } catch (err) {
      console.error('Failed to load orders:', err)
    }
  }

  const refreshArchivedIds = () => {
    setArchivedIds(getArchivedOrderIds(currentBusinessId))
  }

  useEffect(() => { loadHeaderData(); loadOrders(); refreshArchivedIds() }, [connectionId, currentBusinessId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'issues:changed', 'attachments:changed'],
    () => { loadOrders() }
  )

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
  const pullRevealMax = 200
  const pullRevealThreshold = 18
  const showPullReveal = pullRevealHeight > pullRevealThreshold

  const handleListTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touchY = event.touches[0]?.clientY ?? null
    pullStartY.current = event.currentTarget.scrollTop === 0 ? touchY : null
    lastTouchY.current = touchY
    isPullingReveal.current = false
  }

  const handleListTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const touchY = event.touches[0]?.clientY
    if (touchY === undefined) return
    if (pullRevealHeight > 0 && lastTouchY.current !== null && touchY < lastTouchY.current) {
      setPullRevealHeight(0)
      pullStartY.current = null
      isPullingReveal.current = false
      lastTouchY.current = touchY
      return
    }
    lastTouchY.current = touchY
    if (pullStartY.current === null) return
    if (event.currentTarget.scrollTop > 0) return
    const deltaY = touchY - pullStartY.current
    if (deltaY <= 0) {
      setPullRevealHeight(0)
      return
    }
    isPullingReveal.current = true
    setPullRevealHeight(Math.min(deltaY, pullRevealMax))
  }

  const handleListTouchEnd = () => {
    pullStartY.current = null
    lastTouchY.current = null
    if (!isPullingReveal.current && pullRevealHeight === 0) return
    if (isPullingReveal.current) {
      setPullRevealHeight(pullRevealHeight > pullRevealThreshold ? pullRevealMax : 0)
    }
    isPullingReveal.current = false
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-screen)' }}>
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center" style={{ color: 'var(--text-primary)', minWidth: '44px', minHeight: '44px' }}>
            <CaretLeft size={20} weight="regular" />
          </button>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{otherBusiness.businessName}</h1>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        onScroll={event => {
          const currentScrollTop = event.currentTarget.scrollTop
          if (pullRevealHeight > 0 && currentScrollTop > lastScrollTop.current) {
            setPullRevealHeight(0)
          }
          lastScrollTop.current = currentScrollTop
        }}
        onWheel={event => {
          if (pullRevealHeight > 0 && event.deltaY > 0) {
            setPullRevealHeight(0)
          }
        }}
        onTouchStart={handleListTouchStart}
        onTouchMove={handleListTouchMove}
        onTouchEnd={handleListTouchEnd}
        onTouchCancel={handleListTouchEnd}
      >
        {/* Relationship Summary Card */}
        <div className="px-4 py-3">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{isSupplier ? 'To Receive' : 'To Pay'}</p>
              <p style={{ fontSize: '20px', fontWeight: 800, color: isSupplier ? 'var(--status-delivered)' : 'var(--status-overdue)', letterSpacing: '-0.02em', marginTop: '4px' }}>
                {outstandingBalance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Orders</p>
              <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--status-new)', letterSpacing: '-0.02em', marginTop: '4px' }}>{totalOrders}</p>
            </div>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Value</p>
              <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: '4px' }}>
                {totalValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '14px 16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Payment Terms</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>{formatPaymentTerms(connection.paymentTerms)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            {(() => {
              const stateColor = getConnectionStateColor(connection.connectionState)
              const stateLabel = connection.connectionState === 'Active' ? 'Healthy' : connection.connectionState === 'Under Stress' ? '⚠ High Risk' : connection.connectionState === 'Friction Rising' ? '⚠ Friction Rising' : connection.connectionState
              return (
                <span style={{ fontSize: '11px', fontWeight: 600, color: stateColor, backgroundColor: `${stateColor}26`, padding: '2px 8px', borderRadius: 'var(--radius-chip)' }}>
                  {stateLabel}
                </span>
              )
            })()}
            {isSupplier && (
              <button
                onClick={() => onNavigateToPaymentTermsSetup(connectionId, otherBusiness.businessName)}
                style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-primary)', minHeight: '44px', display: 'flex', alignItems: 'center' }}
              >
                Edit terms
              </button>
            )}
          </div>
        </div>

        <div
          className="overflow-hidden transition-all duration-200 ease-out"
          style={{
            maxHeight: showPullReveal ? `${pullRevealHeight}px` : '0px',
            opacity: showPullReveal ? 1 : 0,
          }}
        >
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
        </div>

        <div className="px-3 pb-4 space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                {showArchived ? 'No archived orders' : 'No orders in this period'}
              </p>
            </div>
          ) : (
            filteredOrders.map(order => {
              const lifecycleState = getLifecycleState(order)
              const orderAmount = order.orderValue
              const paidAmount = order.totalPaid
              const dueAmount = Math.max(order.pendingAmount ?? (orderAmount - paidAmount), 0)
              const topRightLabel = dueAmount > 0
                ? { text: `${formatInrCurrency(dueAmount)} due`, color: 'var(--status-overdue)' }
                : { text: 'Paid', color: 'var(--status-success)' }
              const paymentStatusLabel = lifecycleState === 'Delivered' && order.settlementState === 'Partial Payment'
                ? 'Partial Payment'
                : null
              const settlementLabel = paymentStatusLabel || order.settlementState
              const settlementColor = settlementLabel === 'Paid'
                ? 'var(--status-success)'
                : settlementLabel === 'Partial Payment'
                  ? 'var(--status-dispatched)'
                  : 'var(--status-overdue)'
              const settlementBg = settlementLabel === 'Paid'
                ? 'var(--status-success-bg)'
                : settlementLabel === 'Partial Payment'
                  ? 'var(--status-dispatched-bg)'
                  : 'var(--status-overdue-bg)'
              const dueLabel = formatDueDate(order)
              const isNew = isOrderNew(currentBusinessId, order.id, order.createdAt)
              const isOld = order.createdAt < oldOrderThreshold
              const lifecycleColor = getLifecycleStatusColor(lifecycleState)
              return (
                <SwipeableOrderRow
                  key={order.id}
                  actionLabel={showArchived ? 'Unarchive' : 'Archive'}
                  onAction={() => showArchived ? handleUnarchiveOrder(order.id) : handleArchiveOrder(order.id)}
                >
                  <button
                    onClick={() => {
                      markOrderSeen(currentBusinessId, order.id)
                      onOpenOrderDetail(order.id, connection.id)
                    }}
                    className="w-full text-left transition-colors relative overflow-hidden rounded-[14px]"
                    style={{
                      padding: '14px 16px 14px 20px',
                      opacity: lifecycleState === 'Declined' ? 0.4 : 1,
                      backgroundColor: isNew ? 'var(--brand-primary-bg)' : 'var(--bg-card)',
                      minHeight: '44px',
                    }}
                  >
                    <CardAccent color={lifecycleColor} />
                    <div className="flex items-start justify-between mb-1">
                      <p style={{ fontSize: isOld ? '14px' : '15px', fontWeight: 700, color: isOld ? 'var(--text-secondary)' : 'var(--text-primary)', lineHeight: 1.4, flex: 1, marginRight: '12px' }}>
                        {order.itemSummary}
                      </p>
                      <div style={{ marginLeft: '12px', flexShrink: 0, textAlign: 'right' }}>
                        {orderAmount === 0 && lifecycleState === 'Placed' ? (
                          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-dispatched)' }}>Awaiting amount</p>
                        ) : orderAmount === 0 ? (
                          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Amount not recorded</p>
                        ) : (
                          <p style={{ fontSize: isOld ? '13px' : '15px', fontWeight: 700, color: topRightLabel.color }}>
                            {topRightLabel.text}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2" style={{ fontSize: '11px' }}>
                      <span style={{ fontWeight: 600, color: lifecycleColor, backgroundColor: `${lifecycleColor}26`, padding: '3px 10px', borderRadius: '999px' }}>
                        {lifecycleState}
                      </span>
                      <span style={{ fontWeight: 600, color: settlementColor, backgroundColor: settlementBg, padding: '3px 10px', borderRadius: '999px' }}>
                        {settlementLabel}
                      </span>
                      {(attachmentCounts[order.id] || 0) > 0 && (
                        <Paperclip size={12} style={{ color: 'var(--text-secondary)' }} />
                      )}
                    </div>
                    <div style={{ borderTop: '1px solid var(--border-section)', marginTop: '10px' }} />
                    {orderAmount > 0 && (
                      <div className="flex items-center justify-between mt-2" style={{ fontSize: '12px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Order <span style={{ color: 'var(--text-primary)' }}>{formatInrCurrency(orderAmount)}</span></span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Paid <span style={{ color: 'var(--text-primary)' }}>{formatInrCurrency(paidAmount)}</span></span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid var(--border-section)', marginTop: '10px' }} />
                    <div className="flex items-center justify-between mt-2" style={{ fontSize: '12px' }}>
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{formatTimestamp(order.createdAt, isOld)}</span>
                      </div>
                      <p style={{ color: getDueDateColor(dueLabel), fontWeight: 500 }}>{dueLabel}</p>
                    </div>
                  </button>
                </SwipeableOrderRow>
              )
            })
          )}
        </div>
      </div>

      {canPlaceOrder && (
        <div style={{ borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)', padding: '8px 12px' }}>
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
                fontWeight: 500,
                lineHeight: '20px',
                minHeight: '40px',
                maxHeight: '72px',
                backgroundColor: 'var(--bg-screen)',
                color: 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-input)',
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
                backgroundColor: 'var(--brand-primary)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: creatingOrder ? 'not-allowed' : 'pointer',
                opacity: !newOrderMessage.trim() ? 0.5 : 1,
                flexShrink: 0,
                marginBottom: '2px',
                minHeight: '44px',
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
    <div ref={containerRef} className="relative overflow-hidden" style={{ borderRadius: '14px' }}>
      <motion.div style={{ opacity: actionOpacity }} className="absolute right-0 top-0 bottom-0 flex items-center">
        <button
          onClick={handleAction}
          className="h-full px-5 flex items-center text-[13px] font-medium text-white"
          style={{ backgroundColor: actionLabel === 'Archive' ? 'var(--text-secondary)' : 'var(--status-delivered)' }}
        >
          {actionLabel}
        </button>
      </motion.div>
      <motion.div
        style={{ x, backgroundColor: 'var(--bg-card)', borderRadius: '14px' }}
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
      className="whitespace-nowrap transition-colors"
      style={{
        padding: '6px 12px',
        fontSize: '13px',
        fontWeight: active ? 600 : 500,
        color: active ? '#FFFFFF' : 'var(--text-secondary)',
        backgroundColor: active ? 'var(--brand-primary)' : 'var(--brand-primary-bg)',
        borderRadius: 'var(--radius-chip)',
        minHeight: '44px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {label}
    </button>
  )
}
