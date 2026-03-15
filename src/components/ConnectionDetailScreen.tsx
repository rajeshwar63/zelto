import { useEffect, useState, useRef, type TouchEvent } from 'react'
import { dataStore } from '@/lib/data-store'
import { insightEngine } from '@/lib/insight-engine'
import { createOrder } from '@/lib/interactions'
import { useDataListener } from '@/lib/data-events'
import type { Connection, OrderWithPaymentState, BusinessEntity } from '@/lib/types'
import { CaretLeft, DownloadSimple, Phone, PencilSimple, MapPin, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { getConnectionStateColor } from '@/lib/semantic-colors'
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion'
import { getArchivedOrderIds, archiveOrder as doArchiveOrder, unarchiveOrder as doUnarchiveOrder } from '@/lib/archive-store'
import { markOrderSeen } from '@/lib/unread-tracker'
import { buildConnectionSubtitle, formatInrCurrency } from '@/lib/utils'
import { OrderStatusHeader } from '@/components/order/OrderStatusHeader'
import { OrderPaymentSummary } from '@/components/order/OrderPaymentSummary'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { OrderAttachmentsSection } from '@/components/order/OrderAttachmentsSection'
import { buildOrderTimeline, formatPaymentTerms, getLifecycleState } from '@/components/order/order-detail-utils'
import { OrderCard } from '@/components/order/OrderCard'
import { LedgerDownloadSheet } from '@/components/LedgerDownloadSheet'

interface Insight {
  text: string
  category: 'settlement' | 'operational' | 'quality'
  sentiment: 'positive' | 'negative' | 'neutral'
}

interface Props {
  connectionId: string
  currentBusinessId: string
  onBack: () => void
  onNavigateToPaymentTermsSetup: (connectionId: string, businessName: string) => void
  onOpenOrderDetail: (orderId: string, connectionId: string) => void
}

type TimeFilter = '7d' | '30d' | '90d' | '1y'

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
  const [insights, setInsights] = useState<Insight[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30d')
  const [loading, setLoading] = useState(true)
  const [newOrderMessage, setNewOrderMessage] = useState('')
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({})
  const [showLedgerSheet, setShowLedgerSheet] = useState(false)
  const [showContactEdit, setShowContactEdit] = useState(false)
  const [editPhone, setEditPhone] = useState('')
  const [editBranch, setEditBranch] = useState('')
  const [editContact, setEditContact] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const loadHeaderData = async () => {
    try {
      const conn = await dataStore.getConnectionById(connectionId, currentBusinessId)
      if (!conn) return
      const otherId = conn.buyerBusinessId === currentBusinessId ? conn.supplierBusinessId : conn.buyerBusinessId
      const otherBiz = await dataStore.getBusinessEntityById(otherId)
      if (!conn.paymentTerms && conn.supplierBusinessId === currentBusinessId) {
        onNavigateToPaymentTermsSetup(connectionId, otherBiz?.businessName || 'Unknown')
        return
      }
      const viewerRole = conn.buyerBusinessId === currentBusinessId ? 'buyer' : 'supplier'
      let connectionInsights: Insight[] = []
      try {
        const rawInsights = await insightEngine.getInsightsForConnection(connectionId, viewerRole)
        // Temporary shim — remove when Phase A ships
        connectionInsights = (rawInsights as string[]).map(text => ({
          text,
          category: 'settlement' as const,
          sentiment: 'negative' as const,
        }))
      } catch {
        // Insights are non-critical, don't block data refresh
      }
      setConnection(conn)
      setOtherBusiness(otherBiz || null)
      setInsights(connectionInsights)
      setEditPhone(conn.contactPhone ?? '')
      setEditBranch(conn.branchLabel ?? '')
      setEditContact(conn.contactName ?? '')
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
    ['connections:changed'],
    () => { loadHeaderData() }
  )

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

  const handleSaveContact = async () => {
    setSavingContact(true)
    try {
      await dataStore.updateConnectionContact(
        connectionId,
        currentBusinessId,
        editPhone.trim() || null,
        editBranch.trim() || null,
        editContact.trim() || null
      )
      setShowContactEdit(false)
      toast.success('Saved')
      await loadHeaderData()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSavingContact(false)
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
const isSupplier = connection.supplierBusinessId === currentBusinessId
  const isBuyer = connection.buyerBusinessId === currentBusinessId
  const canPlaceOrder = isBuyer && connection.paymentTerms !== null

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-screen)' }}>
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center" style={{ color: 'var(--text-primary)', minWidth: '44px', minHeight: '44px' }}>
            <CaretLeft size={20} weight="regular" />
          </button>
          <div className="flex-1">
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>{otherBusiness.businessName}</h1>
          </div>
          <button
            onClick={() => setShowLedgerSheet(true)}
            className="flex items-center gap-1"
            style={{ color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', paddingLeft: '4px', paddingRight: '8px' }}
          >
            <DownloadSimple size={17} weight="bold" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Ledger</span>
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
      >
        {/* Unified Contact Row — single line */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <div className="flex items-center justify-center" style={{ width: '36px', height: '36px', backgroundColor: 'var(--brand-primary-bg)', borderRadius: '50%', flexShrink: 0 }}>
            <Phone size={18} weight="regular" style={{ color: 'var(--brand-primary)' }} />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            {buildConnectionSubtitle(connection.branchLabel, connection.contactName) && (
              <>
                <MapPin size={11} weight="regular" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {buildConnectionSubtitle(connection.branchLabel, connection.contactName)}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>·</span>
              </>
            )}
            <span style={{ fontSize: '14px', fontWeight: 600, color: connection.contactPhone ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {connection.contactPhone
                ? `+91 ${connection.contactPhone.replace(/(\d{5})(\d{5})/, '$1 $2')}`
                : 'Add contact number'}
            </span>
          </div>
          <button onClick={() => setShowContactEdit(true)} style={{ padding: '4px', minWidth: '32px', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PencilSimple size={16} weight="regular" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Relationship Summary Card */}
        <div className="px-4 py-3">
          {(() => {
            const isRisky = connection.connectionState !== 'Stable' && connection.connectionState !== 'Active'
            const stateColor = isRisky ? getConnectionStateColor(connection.connectionState) : 'var(--brand-primary)'
            return (
              <div style={{ display: 'flex', backgroundColor: 'var(--bg-card)', borderRadius: '14px', overflow: 'hidden', marginBottom: '12px' }}>
                {/* Left accent border */}
                <div style={{ width: 5, flexShrink: 0, backgroundColor: stateColor }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Row 1 — 3-col stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                    <div style={{ padding: '10px 12px', borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>{isSupplier ? 'To Receive' : 'To Pay'}</p>
                      <p style={{ fontSize: 17, fontWeight: 700, color: isSupplier ? 'var(--status-delivered)' : 'var(--status-overdue)' }}>
                        {formatInrCurrency(outstandingBalance)}
                      </p>
                    </div>
                    <div style={{ padding: '10px 12px', borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Total Value</p>
                      <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {formatInrCurrency(totalValue)}
                      </p>
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Orders</p>
                      <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {totalOrders}
                      </p>
                    </div>
                  </div>

                  {/* Row 2 — Risk badge + Payment Terms + Edit */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', fontSize: 12 }}>
                    {isRisky ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: stateColor, color: '#FFFFFF', borderRadius: 999, padding: '4px 10px', fontWeight: 700, fontSize: 10.5 }}>
                        <Warning size={11} weight="fill" />
                        {connection.connectionState}
                      </div>
                    ) : (
                      <div />
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>{formatPaymentTerms(connection.paymentTerms)}</span>
                      {isSupplier && (
                        <span
                          onClick={() => onNavigateToPaymentTermsSetup(connectionId, otherBusiness.businessName)}
                          style={{ color: 'var(--accent-blue)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 13 }}
                        >
                          <PencilSimple size={12} weight="regular" />
                          Edit
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 3 — Insights */}
                  {insights.length > 0 && (
                    <div style={{ padding: '12px 14px 14px', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Insights</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {insights.map((insight, idx) => {
                          const dotColor = insight.sentiment === 'negative' ? '#D85A30' : insight.sentiment === 'positive' ? '#1D9E75' : '#888780'
                          const textColor = insight.sentiment === 'negative' ? 'var(--text-primary)' : insight.sentiment === 'positive' ? '#0F6E56' : 'var(--text-secondary)'
                          return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                              <span style={{ color: dotColor, fontSize: 16, lineHeight: '20px', flexShrink: 0 }}>•</span>
                              <span style={{ fontSize: 13, color: textColor }}>{insight.text}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Orders section header with inline time filter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 6px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Orders ({filteredOrders.length})
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['7d', '30d', '90d', '1y'] as TimeFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setTimeFilter(f)}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 20,
                  border: timeFilter === f
                    ? '0.5px solid var(--accent-blue)'
                    : '0.5px solid var(--border-subtle)',
                  background: timeFilter === f
                    ? 'var(--accent-blue-subtle)'
                    : 'transparent',
                  color: timeFilter === f
                    ? 'var(--accent-blue)'
                    : 'var(--text-secondary)',
                  fontWeight: timeFilter === f ? 500 : 400,
                  cursor: 'pointer',
                }}
              >
                {f === '1y' ? '1yr' : f}
              </button>
            ))}
          </div>
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
              const latestActivity = Math.max(order.deliveredAt || 0, order.dispatchedAt || 0, order.acceptedAt || 0, order.createdAt)
              return (
                <SwipeableOrderRow
                  key={order.id}
                  actionLabel={showArchived ? 'Unarchive' : 'Archive'}
                  onAction={() => showArchived ? handleUnarchiveOrder(order.id) : handleArchiveOrder(order.id)}
                >
                  <OrderCard
                    itemSummary={order.itemSummary}
                    connectionName={otherBusiness.businessName}
                    branchLabel={connection.branchLabel}
                    contactName={connection.contactName}
                    orderValue={order.orderValue}
                    pendingAmount={order.pendingAmount}
                    settlementState={order.settlementState}
                    lifecycleState={lifecycleState}
                    calculatedDueDate={order.calculatedDueDate}
                    deliveredAt={order.deliveredAt}
                    latestActivity={latestActivity}
                    paymentTermSnapshot={order.paymentTermSnapshot}
                    isBuyer={isBuyer}
                    onClick={() => {
                      markOrderSeen(currentBusinessId, order.id)
                      onOpenOrderDetail(order.id, connection.id)
                    }}
                  />
                </SwipeableOrderRow>
              )
            })
          )}
        </div>
      </div>

      <LedgerDownloadSheet
        isOpen={showLedgerSheet}
        onClose={() => setShowLedgerSheet(false)}
        scope="single"
        connectionId={connectionId}
        connectionName={otherBusiness.businessName}
        currentBusinessId={currentBusinessId}
      />

      {showContactEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowContactEdit(false)}
        >
          <div
            className="w-full"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderTopLeftRadius: 'var(--radius-modal)',
              borderTopRightRadius: 'var(--radius-modal)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid var(--border-light)' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>Contact Details</h2>
              <button
                onClick={() => setShowContactEdit(false)}
                style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-4">
              <div className="mb-3">
                <label className="text-[11px] text-muted-foreground mb-1 block">Phone number</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="mb-3">
                <label className="text-[11px] text-muted-foreground mb-1 block">
                  Branch / location <span className="text-muted-foreground/50">optional</span>
                </label>
                <input
                  type="text"
                  value={editBranch}
                  onChange={e => setEditBranch(e.target.value)}
                  placeholder="e.g. Banjara Hills, Madhapur"
                  className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="mb-4">
                <label className="text-[11px] text-muted-foreground mb-1 block">
                  Contact person <span className="text-muted-foreground/50">optional</span>
                </label>
                <input
                  type="text"
                  value={editContact}
                  onChange={e => setEditContact(e.target.value)}
                  placeholder="e.g. Ravi"
                  className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowContactEdit(false)}
                  className="py-2.5 rounded-xl border border-border text-[13px] text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveContact}
                  disabled={savingContact}
                  className="py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-50"
                >
                  {savingContact ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

