import { useEffect, useState, useRef, useCallback } from 'react'
import { dataStore } from '@/lib/data-store'
import { insightEngine } from '@/lib/insight-engine'
import type { Insight } from '@/lib/insight-engine'
import { useDataListener } from '@/lib/data-events'
import type { Connection, OrderWithPaymentState, BusinessEntity, OpeningBalance } from '@/lib/types'
import { CaretLeft, DownloadSimple, Phone, PencilSimple, MapPin } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { getConnectionStateLabel, getConnectionStateColor } from '@/lib/connection-state-utils'
import { motion, AnimatePresence, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion'
import { getArchivedOrderIds, archiveOrder as doArchiveOrder, unarchiveOrder as doUnarchiveOrder } from '@/lib/archive-store'
import { markOrderSeen, isOrderNew } from '@/lib/unread-tracker'
import { buildConnectionSubtitle, formatInrCurrency } from '@/lib/utils'
import { OrderStatusHeader } from '@/components/order/OrderStatusHeader'
import { OrderPaymentSummary } from '@/components/order/OrderPaymentSummary'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { OrderAttachmentsSection } from '@/components/order/OrderAttachmentsSection'
import { buildOrderTimeline, formatPaymentTerms, getLifecycleState } from '@/components/order/order-detail-utils'
import { ConnectionDetailOrderCard } from '@/components/order/ConnectionDetailOrderCard'
import { LedgerDownloadSheet } from '@/components/LedgerDownloadSheet'
import { OrderSearchPanel, type OrderFilters, type StatusChip, type RoleFilter } from '@/components/order/OrderSearchPanel'
import { OpeningBalanceCard } from '@/components/OpeningBalanceCard'
import { OpeningBalanceCreateSheet } from '@/components/OpeningBalanceCreateSheet'
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
  const [showContactEdit, setShowContactEdit] = useState(false)
  const [editPhone, setEditPhone] = useState('')
  const [editBranch, setEditBranch] = useState('')
  const [editContact, setEditContact] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const [openingBalance, setOpeningBalance] = useState<OpeningBalance | null>(null)
  const [showCreateOBSheet, setShowCreateOBSheet] = useState(false)

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
      let ob: OpeningBalance | null = null
      try {
        ob = await dataStore.getOpeningBalanceByConnectionId(connectionId)
      } catch {
        // Non-critical
      }
      setConnection(conn)
      setOtherBusiness(otherBiz || null)
      setInsights(connectionInsights)
      setOpeningBalance(ob)
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
        setOpenIssueOrderIds(new Set(
          issues
            .filter(issue => issue.status === 'Open' || issue.status === 'Acknowledged')
            .map(issue => issue.orderId)
        ))
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
    ['connections:changed', 'opening-balances:changed'],
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

        {/* Trust Profile button */}
        {onNavigateToTrustProfile && otherBusiness && (
          <div style={{ paddingLeft: '16px', paddingRight: '16px', paddingBottom: '8px', paddingTop: '4px', borderBottom: '1px solid var(--border-light)' }}>
            <button
              onClick={() => onNavigateToTrustProfile(otherBusiness.id, connectionId)}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--brand-primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Trust Profile →
            </button>
          </div>
        )}

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
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Total Traded</p>
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
                        {getConnectionStateLabel(connection.connectionState)}
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

        {/* Opening Balance */}
        <div className="px-4 pb-3">
          <OpeningBalanceCard
            openingBalance={openingBalance}
            connection={connection}
            currentBusinessId={currentBusinessId}
            otherBusiness={otherBusiness}
            onCreateOpeningBalance={() => setShowCreateOBSheet(true)}
          />
        </div>

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

      <OpeningBalanceCreateSheet
        isOpen={showCreateOBSheet}
        onClose={() => { setShowCreateOBSheet(false); loadHeaderData() }}
        connection={connection}
        currentBusinessId={currentBusinessId}
        otherBusiness={otherBusiness}
        existingBalance={openingBalance?.status === 'disputed' ? openingBalance : null}
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
