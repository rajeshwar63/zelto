import { useEffect, useState, useRef } from 'react'
import { dataStore } from '@/lib/data-store'
import { insightEngine } from '@/lib/insight-engine'
import type { Insight } from '@/lib/insight-engine'
import { useDataListener } from '@/lib/data-events'
import type { Connection, OrderWithPaymentState, BusinessEntity } from '@/lib/types'
import { CaretLeft, DownloadSimple, PencilSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { getConnectionStateLabel, getConnectionStateColor } from '@/lib/connection-state-utils'
import { motion, AnimatePresence, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion'
import { getArchivedOrderIds, archiveOrder as doArchiveOrder, unarchiveOrder as doUnarchiveOrder } from '@/lib/archive-store'
import { markOrderSeen, isOrderNew } from '@/lib/unread-tracker'
import { formatInrCurrency } from '@/lib/utils'
import { OrderStatusHeader } from '@/components/order/OrderStatusHeader'
import { OrderPaymentSummary } from '@/components/order/OrderPaymentSummary'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { OrderAttachmentsSection } from '@/components/order/OrderAttachmentsSection'
import { buildOrderTimeline, formatPaymentTerms, getLifecycleState } from '@/components/order/order-detail-utils'
import { ConnectionDetailOrderCard } from '@/components/order/ConnectionDetailOrderCard'
import { LedgerDownloadSheet } from '@/components/LedgerDownloadSheet'
import { OrderSearchPanel, type OrderFilters, type StatusChip, type RoleFilter } from '@/components/order/OrderSearchPanel'
import { ConnectionIntelligenceTab } from '@/components/connection/ConnectionIntelligenceTab'
import { startOfDay } from 'date-fns'


interface Props {
  connectionId: string
  currentBusinessId: string
  onBack: () => void
  onNavigateToPaymentTermsSetup: (connectionId: string, businessName: string) => void
  onOpenOrderDetail: (orderId: string, connectionId: string) => void
  onNavigateToPlaceOrder: (prefilledConnectionId?: string | null) => void
  onNavigateToTrustProfile?: (targetBusinessId: string, connectionId: string) => void
}

const EMPTY_FILTERS: OrderFilters = {
  searchText: '',
  activeChips: new Set<StatusChip>(),
  fromDate: null,
  toDate: null,
}

export function ConnectionDetailScreen({ connectionId, currentBusinessId, onBack, onNavigateToPaymentTermsSetup, onOpenOrderDetail, onNavigateToPlaceOrder, onNavigateToTrustProfile }: Props) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [otherBusiness, setOtherBusiness] = useState<BusinessEntity | null>(null)
  const [orders, setOrders] = useState<OrderWithPaymentState[]>([])
  const [openIssueOrderIds, setOpenIssueOrderIds] = useState<Set<string>>(new Set())
  const [openIssueSummaryMap, setOpenIssueSummaryMap] = useState<Map<string, string>>(new Map())
  const [insights, setInsights] = useState<Insight[]>([])
  const [orderFilters, setOrderFilters] = useState<OrderFilters>(EMPTY_FILTERS)
  const [panelVisible, setPanelVisible] = useState(false)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const lastScrollTop = useRef(0)
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({})
  const [showLedgerSheet, setShowLedgerSheet] = useState(false)
  const [activeConnectionTab, setActiveConnectionTab] = useState<'intelligence' | 'orders'>('orders')
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
        connectionInsights = await insightEngine.getInsightsForConnection(connectionId, viewerRole)
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
        const [counts, issues] = await Promise.all([
          dataStore.getAttachmentCountsByOrderIds(orderIds),
          dataStore.getIssueReportsByOrderIds(orderIds),
        ])
        setAttachmentCounts(counts)
        const openIssues = issues.filter(issue => issue.status === 'Open' || issue.status === 'Acknowledged')
        setOpenIssueOrderIds(new Set(openIssues.map(issue => issue.orderId)))
        const summaryMap = new Map<string, string>()
        openIssues.forEach(issue => {
          if (!summaryMap.has(issue.orderId)) {
            summaryMap.set(issue.orderId, issue.issueType)
          }
        })
        setOpenIssueSummaryMap(summaryMap)
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

  const handleListScroll = () => {
    const el = listScrollRef.current
    if (!el) return
    const st = el.scrollTop
    lastScrollTop.current = st
    if (st > 30) setPanelVisible(true)
    else if (st <= 8) setPanelVisible(false)
  }

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

  // Apply search/chip/date filters to orders
  const { searchText, activeChips, fromDate, toDate } = orderFilters
  const searchFiltered = orders.filter(order => {
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      if (!order.itemSummary?.toLowerCase().includes(q)) return false
    }

    if (activeChips.size > 0) {
      const lifecycle = getLifecycleState(order)
      const now = Date.now()
      const matchChip = [...activeChips].some(chip => {
        if (chip === 'new')        return lifecycle === 'Placed'
        if (chip === 'accepted')   return lifecycle === 'Accepted'
        if (chip === 'placed') {
          if (connectionRole === 'buying') return lifecycle === 'Placed' || lifecycle === 'Accepted'
          return lifecycle === 'Placed'
        }
        if (chip === 'dispatched') return lifecycle === 'Dispatched'
        if (chip === 'delivered')  return lifecycle === 'Delivered' && order.settlementState !== 'Paid'
        if (chip === 'paid')       return order.settlementState === 'Paid'
        if (chip === 'overdue') {
          return order.calculatedDueDate !== null
            && order.calculatedDueDate < now
            && order.settlementState !== 'Paid'
        }
        if (chip === 'dispute')    return openIssueOrderIds.has(order.id)
        return false
      })
      if (!matchChip) return false
    }

    if (fromDate) {
      if (startOfDay(new Date(order.createdAt)) < startOfDay(fromDate)) return false
    }
    if (toDate) {
      if (startOfDay(new Date(order.createdAt)) > startOfDay(toDate)) return false
    }

    return true
  })

  // Stats are based on all non-archived active orders (not affected by search filter)
  const allActiveOrders = orders.filter(o => !archivedIds.has(o.id))
  const activeOrders = searchFiltered.filter(o => !archivedIds.has(o.id))
  const archivedOrders = searchFiltered.filter(o => archivedIds.has(o.id))
  const filteredOrders = showArchived ? archivedOrders : activeOrders

  const totalOrders = allActiveOrders.length
  const totalValue = allActiveOrders.reduce((sum, order) => sum + order.orderValue, 0)
  const outstandingBalance = allActiveOrders.reduce((sum, order) => {
    if (order.settlementState !== 'Paid') return sum + (order.pendingAmount || 0)
    return sum
  }, 0)

  const isSupplier = connection.supplierBusinessId === currentBusinessId
  const isBuyer = connection.buyerBusinessId === currentBusinessId
  const connectionRole: RoleFilter = isBuyer ? 'buying' : 'selling'

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-screen)' }}>
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center" style={{ color: 'var(--text-primary)', minWidth: '44px', minHeight: '44px' }}>
            <CaretLeft size={20} weight="regular" />
          </button>
          <div className="flex-1 min-w-0" style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {otherBusiness.businessName}
            </h1>
            {(connection.branchLabel || connection.contactName) ? (
              <span
                onClick={() => setShowContactEdit(true)}
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                  maxWidth: '120px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {[connection.branchLabel, connection.contactName].filter(Boolean).join(' · ')}
              </span>
            ) : (
              <span
                onClick={() => setShowContactEdit(true)}
                style={{
                  fontSize: '11px',
                  color: 'var(--brand-primary)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  flexShrink: 0,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add info
              </span>
            )}
          </div>
          <button
            onClick={() => setShowLedgerSheet(true)}
            className="flex items-center gap-1"
            style={{ color: 'var(--brand-primary)', minHeight: '44px', paddingLeft: '4px', paddingRight: '0' }}
          >
            <DownloadSimple size={17} weight="bold" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Ledger</span>
          </button>
        </div>
        <AnimatePresence>
          {panelVisible && (
            <motion.div
              key="filter-panel"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <OrderSearchPanel
                filters={orderFilters}
                onFiltersChange={setOrderFilters}
                roleFilter={connectionRole}
                placeholder="Search orders in this connection…"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        ref={listScrollRef}
        onScroll={handleListScroll}
        className="flex-1 overflow-y-auto"
      >

        {/* Summary Card */}
        <div style={{ margin: '12px 12px 0' }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '14px',
            border: '1px solid var(--border-light)',
            overflow: 'hidden',
          }}>
            {/* Stats row — hero receivable + secondary metrics */}
            <div style={{ display: 'flex', padding: '14px 16px 12px' }}>
              <div style={{ flex: 1 }}>
                <p style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: isSupplier ? 'var(--status-delivered)' : 'var(--status-overdue)',
                  margin: 0,
                  lineHeight: 1,
                }}>
                  {formatInrCurrency(outstandingBalance)}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  {isSupplier ? 'receivable' : 'payable'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>
                    {formatInrCurrency(totalValue)}
                  </p>
                  <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: '3px 0 0' }}>traded</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-new)', margin: 0, lineHeight: 1 }}>
                    {totalOrders}
                  </p>
                  <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: '3px 0 0' }}>orders</p>
                </div>
              </div>
            </div>

            {/* Risk + Terms + Edit + Trust row */}
            {(() => {
              const showRisk = connection.connectionState
                && connection.connectionState !== 'Stable'
                && connection.connectionState !== 'Active'
              const stateColor = showRisk ? getConnectionStateColor(connection.connectionState) : null
              const stateLabel = showRisk ? getConnectionStateLabel(connection.connectionState) : null

              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 16px',
                  borderTop: '0.5px solid var(--border-light)',
                  backgroundColor: showRisk ? `${stateColor}08` : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                    {showRisk && (
                      <>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: stateColor!, flexShrink: 0 }} />
                        <span style={{ fontSize: '11px', fontWeight: 500, color: stateColor! }}>{stateLabel}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>·</span>
                      </>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {formatPaymentTerms(connection.paymentTerms)}
                    </span>
                    <span
                      onClick={() => onNavigateToPaymentTermsSetup(connectionId, otherBusiness.businessName)}
                      style={{ fontSize: '11px', color: 'var(--brand-primary)', fontWeight: 500, cursor: 'pointer' }}
                    >
                      Edit
                    </span>
                  </div>
                  {onNavigateToTrustProfile && (
                    <span
                      onClick={() => onNavigateToTrustProfile(
                        connection.buyerBusinessId === currentBusinessId
                          ? connection.supplierBusinessId
                          : connection.buyerBusinessId,
                        connectionId
                      )}
                      style={{ fontSize: '11px', color: 'var(--brand-primary)', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}
                    >
                      Trust →
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Segmented Tab Control */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-card)',
          borderRadius: '10px',
          padding: '3px',
          margin: '10px 12px 10px',
          border: '1px solid var(--border-light)',
        }}>
          {(['orders', 'intelligence'] as const).map((tab) => {
            const isActive = activeConnectionTab === tab
            const label = tab === 'orders' ? 'Orders' : 'Intelligence'
            const count = tab === 'orders' ? totalOrders : insights.length
            return (
              <button
                key={tab}
                onClick={() => setActiveConnectionTab(tab)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '8px 0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--brand-primary)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 150ms',
                }}
              >
                {label}
                {count > 0 && (
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    backgroundColor: isActive
                      ? 'rgba(255,255,255,0.25)'
                      : 'var(--text-secondary)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    lineHeight: '14px',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {activeConnectionTab === 'intelligence' && (
          <ConnectionIntelligenceTab
            connectionId={connectionId}
            currentBusinessId={currentBusinessId}
            isBuyer={isBuyer}
            otherBusinessName={otherBusiness.businessName}
            otherBusinessId={otherBusiness.id}
            connectionInsights={insights}
          />
        )}

        {activeConnectionTab === 'orders' && (
          <>
            {/* Orders section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 6px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Orders ({filteredOrders.length})
              </span>
              {filteredOrders.length !== allActiveOrders.length && !showArchived && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {filteredOrders.length} of {allActiveOrders.length}
                </span>
              )}
            </div>

            <div className="px-3 pb-4 space-y-3">
              {filteredOrders.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[13px] text-muted-foreground">
                    {showArchived
                      ? 'No archived orders'
                      : (searchText.trim() || activeChips.size > 0 || fromDate || toDate)
                      ? 'No orders match your filters'
                      : 'No orders in this connection'}
                  </p>
                </div>
              ) : (
                filteredOrders.map(order => {
                  const lifecycleState = getLifecycleState(order)
                  const latestActivity = Math.max(order.deliveredAt || 0, order.dispatchedAt || 0, order.acceptedAt || 0, order.createdAt)
                  const isNew = isOrderNew(currentBusinessId, order.id, latestActivity)
                  const isOld = order.settlementState === 'Paid'
                  return (
                    <SwipeableOrderRow
                      key={order.id}
                      actionLabel={showArchived ? 'Unarchive' : 'Archive'}
                      onAction={() => showArchived ? handleUnarchiveOrder(order.id) : handleArchiveOrder(order.id)}
                    >
                      <ConnectionDetailOrderCard
                        itemSummary={order.itemSummary}
                        orderValue={order.orderValue}
                        pendingAmount={order.pendingAmount}
                        settlementState={order.settlementState}
                        lifecycleState={lifecycleState}
                        createdAt={order.createdAt}
                        deliveredAt={order.deliveredAt}
                        calculatedDueDate={order.calculatedDueDate}
                        latestActivity={latestActivity}
                        isBuyer={isBuyer}
                        isNew={isNew}
                        isOld={isOld}
                        hasOpenDispute={openIssueOrderIds.has(order.id)}
                        disputeSummary={openIssueSummaryMap.get(order.id) ?? null}
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
          </>
        )}
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

      {isBuyer && (
        <button
          onClick={() => onNavigateToPlaceOrder(connectionId)}
          className="fixed bottom-24 right-4 w-14 h-14 flex items-center justify-center z-20"
          style={{
            backgroundColor: 'var(--brand-primary)',
            borderRadius: 'var(--radius-card)',
            boxShadow: '0 4px 16px rgba(74,108,247,0.4)',
          }}
        >
          <PencilSimple size={24} weight="regular" color="#FFFFFF" />
        </button>
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
