import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { dataStore } from '@/lib/data-store'
import { behaviourEngine } from '@/lib/behaviour-engine'
import { useDataListener } from '@/lib/data-events'
import type { Connection, ConnectionState } from '@/lib/types'
import { getConnectionStateLabel, getConnectionStateColor } from '@/lib/connection-state-utils'
import { Users, UsersThree, PencilSimple, MagnifyingGlass, DownloadSimple, X } from '@phosphor-icons/react'
import { Phone, MapPin, User } from 'lucide-react'
import { LedgerDownloadSheet } from '@/components/LedgerDownloadSheet'

interface ConnectionWithState extends Connection {
  otherBusinessName: string
  otherBusinessType?: string
  computedState: ConnectionState
  outstandingBalance: number
  totalOrders: number
  totalTradedAmount: number
  lastActivityAt: number | null
}

interface Props {
  currentBusinessId: string
  onSelectConnection: (connectionId: string) => void
  onAddConnection: () => void
  onNavigateToIncomingRequests: () => void
  unreadConnectionIds?: Set<string>
  isActive?: boolean
  onNavigateToPlaceOrder: (prefilledConnectionId?: string | null) => void
}

function formatLastActivity(timestamp: number | null): string | null {
  if (!timestamp) return null
  const diffMs = Date.now() - timestamp
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1 day ago'
  return `${diffDays} days ago`
}

function formatPaymentTerms(terms: Connection['paymentTerms']): string | null {
  if (!terms) return null
  switch (terms.type) {
    case 'Advance Required':
      return 'Advance Required'
    case 'Payment on Delivery':
      return 'Payment on Delivery'
    case 'Bill to Bill':
      return 'Bill to Bill'
    case 'Days After Delivery':
      return `${terms.days} days after delivery`
  }
}

const cachedConnectionsByBusiness = new Map<string, ConnectionWithState[]>()
const MAX_CACHED_BUSINESSES = 5
const PREFETCH_CONNECTION_COUNT = 3

function isSamePaymentTerms(a: Connection['paymentTerms'], b: Connection['paymentTerms']) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.type === b.type && (a.type !== 'Days After Delivery' || a.days === b.days)
}

function isSameConnections(a: ConnectionWithState[], b: ConnectionWithState[]) {
  if (a.length !== b.length) return false
  return a.every((conn, index) => {
    const other = b[index]
    return (
      conn.id === other.id &&
      conn.otherBusinessName === other.otherBusinessName &&
      conn.otherBusinessType === other.otherBusinessType &&
      conn.computedState === other.computedState &&
      conn.outstandingBalance === other.outstandingBalance &&
      conn.totalOrders === other.totalOrders &&
      conn.totalTradedAmount === other.totalTradedAmount &&
      conn.lastActivityAt === other.lastActivityAt &&
      conn.contactPhone === other.contactPhone &&
      conn.branchLabel === other.branchLabel &&
      conn.contactName === other.contactName &&
      isSamePaymentTerms(conn.paymentTerms, other.paymentTerms)
    )
  })
}

export function ConnectionsScreen({ currentBusinessId, onSelectConnection, onAddConnection, onNavigateToIncomingRequests, unreadConnectionIds, isActive = true, onNavigateToPlaceOrder }: Props) {
  const [connections, setConnections] = useState<ConnectionWithState[]>(
    () => cachedConnectionsByBusiness.get(currentBusinessId) || []
  )
  const [isLoading, setIsLoading] = useState(() => !cachedConnectionsByBusiness.has(currentBusinessId))
  const [showLedgerSheet, setShowLedgerSheet] = useState(false)
  const [connectionSearch, setConnectionSearch] = useState('')
  const [panelVisible, setPanelVisible] = useState(false)
  const listContainerRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTop = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    console.debug('[ConnectionsScreen] mount', Date.now(), { currentBusinessId })
    requestAnimationFrame(() => console.debug('[ConnectionsScreen] paint', Date.now(), { currentBusinessId }))
  }, [currentBusinessId])

  const loadConnections = useCallback(async () => {
    console.debug('[ConnectionsScreen] fetch start', Date.now(), { currentBusinessId })
    const cachedConns = cachedConnectionsByBusiness.get(currentBusinessId)
    const rawConnections = await dataStore.getConnectionsByBusinessId(currentBusinessId)
    const entities = await dataStore.getAllBusinessEntities()
    const entityMap = new Map(entities.map((e) => [e.id, e]))

    const connectionsWithState = await Promise.all(
      rawConnections.map(async (conn) => {
        const otherId =
          conn.buyerBusinessId === currentBusinessId
            ? conn.supplierBusinessId
            : conn.buyerBusinessId
        const otherBusiness = entityMap.get(otherId)
        const computedState = await behaviourEngine.computeConnectionState(conn.id)
        const orders = await dataStore.getOrdersWithPaymentStateByConnectionId(conn.id)
        const nonDeclined = orders.filter(o => !o.declinedAt)
        const outstandingBalance = nonDeclined.reduce((sum, o) => sum + o.pendingAmount, 0)
        const totalTradedAmount = nonDeclined.reduce((sum, o) => sum + o.orderValue, 0)
        const lastActivityAt = nonDeclined.length > 0
          ? Math.max(...nonDeclined.map(o => o.createdAt))
          : null

        return {
          ...conn,
          otherBusinessName: otherBusiness?.businessName || 'Unknown',
          otherBusinessType: otherBusiness?.businessType,
          computedState,
          outstandingBalance,
          totalOrders: nonDeclined.length,
          totalTradedAmount,
          lastActivityAt,
        }
      })
    )

    console.debug('[ConnectionsScreen] fetch end', Date.now(), { currentBusinessId })

    connectionsWithState.sort((a, b) => {
      if (a.outstandingBalance !== b.outstandingBalance) return b.outstandingBalance - a.outstandingBalance
      const riskOrder: Record<ConnectionState, number> = { 'Under Stress': 3, 'Friction Rising': 2, 'Active': 1, 'Stable': 0 }
      const riskA = riskOrder[a.computedState] ?? 0
      const riskB = riskOrder[b.computedState] ?? 0
      if (riskA !== riskB) return riskB - riskA
      return b.createdAt - a.createdAt
    })

    if (!cachedConns || !isSameConnections(cachedConns, connectionsWithState)) {
      if (!cachedConnectionsByBusiness.has(currentBusinessId) && cachedConnectionsByBusiness.size >= MAX_CACHED_BUSINESSES) {
        const oldestBusinessId = cachedConnectionsByBusiness.keys().next().value
        if (oldestBusinessId) cachedConnectionsByBusiness.delete(oldestBusinessId)
      }
      cachedConnectionsByBusiness.set(currentBusinessId, connectionsWithState)
      setConnections(connectionsWithState)
      console.debug('[ConnectionsScreen] state update', Date.now(), { currentBusinessId })
    }

    setIsLoading(false)

    void Promise.all(
      connectionsWithState
        .slice(0, PREFETCH_CONNECTION_COUNT)
        .map(conn => dataStore.getOrdersWithPaymentStateByConnectionId(conn.id))
    ).catch(() => {})
  }, [currentBusinessId])

  useEffect(() => {
    const cachedConns = cachedConnectionsByBusiness.get(currentBusinessId)
    if (cachedConns) {
      setConnections(cachedConns)
    } else {
      setIsLoading(true)
    }

    if (isActive) {
      void loadConnections()
    }
  }, [currentBusinessId, isActive, loadConnections])

  useDataListener(
    ['connections:changed', 'orders:changed', 'payments:changed', 'issues:changed'],
    () => { void loadConnections() },
    isActive
  )

  const visibleConnections = useMemo(() => (
    connectionSearch.trim()
      ? connections.filter(conn => conn.otherBusinessName.toLowerCase().includes(connectionSearch.toLowerCase()))
      : connections
  ), [connections, connectionSearch])

  useEffect(() => {
    if (!panelVisible) {
      setConnectionSearch('')
    }
  }, [panelVisible])

  const handleListScroll = () => {
    const el = listContainerRef.current
    if (!el) return
    const st = el.scrollTop
    lastScrollTop.current = st
    if (st === 0 && !connectionSearch) {
      setPanelVisible(false)
    } else if (st > 0) {
      setPanelVisible(true)
    }
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-screen)', minHeight: '100%' }}>
      {/* ── Header — rendered always, single source of truth ── */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center justify-between px-4">
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Connections</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLedgerSheet(true)}
              className="flex items-center gap-1"
              style={{ color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', paddingLeft: '8px', paddingRight: '4px' }}
            >
              <DownloadSimple size={17} weight="bold" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Ledger</span>
            </button>
            <button
              onClick={onAddConnection}
              className="flex items-center gap-1"
              style={{ color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', paddingLeft: '4px', paddingRight: '8px' }}
            >
              <UsersThree size={17} weight="bold" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Add / Manage</span>
            </button>
          </div>
        </div>
        <AnimatePresence>
          {panelVisible && (
            <motion.div
              key="connection-search"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ padding: '10px 16px 12px', backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ position: 'relative' }}>
                  <MagnifyingGlass
                    size={18}
                    weight="regular"
                    style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }}
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={connectionSearch}
                    onChange={(e) => setConnectionSearch(e.target.value)}
                    placeholder="Search connections…"
                    style={{
                      width: '100%',
                      paddingLeft: '34px',
                      paddingRight: connectionSearch ? '34px' : '10px',
                      paddingTop: '8px',
                      paddingBottom: '8px',
                      fontSize: '14px',
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--bg-screen)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-input)',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  {connectionSearch && (
                    <button
                      onClick={() => {
                        setConnectionSearch('')
                        searchInputRef.current?.focus()
                      }}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', padding: '4px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <X size={14} weight="bold" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Body — conditional on state ── */}
      {isLoading ? (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse" style={{ backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-card)', height: '80px' }} />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 text-center" style={{ minHeight: 'calc(100vh - 44px)' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>No connections yet</p>
          <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Add your first buyer or supplier to get started
          </p>
          <button
            onClick={onAddConnection}
            style={{
              backgroundColor: 'var(--brand-primary)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-button)',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              minHeight: '44px',
            }}
          >
            Add Connection
          </button>
        </div>
      ) : (
      <div
        ref={listContainerRef}
        className="px-4 pt-3 pb-24 overflow-y-auto"
        onScroll={handleListScroll}
      >
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
          ALL CONNECTIONS
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {visibleConnections.length === 0 && (
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0' }}>
              No connections found
            </p>
          )}
          {visibleConnections.map((conn) => {
            const formattedTerms = formatPaymentTerms(conn.paymentTerms)
            const isSupplier = conn.supplierBusinessId === currentBusinessId
            const isUnread = unreadConnectionIds?.has(conn.id)

            const relationshipLabel = !formattedTerms
              ? (isSupplier ? 'Payment terms needed' : 'Awaiting payment terms')
              : getConnectionStateLabel(conn.connectionState)

            const statusColor = !formattedTerms
              ? (isSupplier ? 'var(--status-dispatched)' : 'var(--text-secondary)')
              : getConnectionStateColor(conn.connectionState)

            const amountDirectionColor = isSupplier ? '#16A34A' : '#DC2626'

            const lastActivity = formatLastActivity(conn.lastActivityAt)
            const subtitleParts = [conn.otherBusinessType].filter(Boolean)

            return (
              <div
                key={conn.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectConnection(conn.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectConnection(conn.id) }}
                className="w-full text-left cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-card)',
                  padding: '14px 16px',
                  border: isUnread ? '1px solid color-mix(in srgb, var(--status-new) 35%, white)' : '1px solid var(--border-light)',
                  boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
                  minHeight: '44px',
                }}
              >
                {/* Row 1: Business name + inline branch/contact + Outstanding balance */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
                    {isUnread && (
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-new)', flexShrink: 0 }} />
                    )}
                    <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{conn.otherBusinessName}</p>
                    {(conn.branchLabel || conn.contactName) && (
                      <div className="flex items-center gap-1 min-w-0" style={{ flexShrink: 1 }}>
                        {conn.branchLabel && (
                          <>
                            <MapPin size={12} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {conn.branchLabel.length > 8 ? conn.branchLabel.slice(0, 8) + '…' : conn.branchLabel}
                            </span>
                          </>
                        )}
                        {conn.branchLabel && conn.contactName && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flexShrink: 0 }}>•</span>
                        )}
                        {conn.contactName && (
                          <>
                            <User size={12} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {conn.contactName.length > 8 ? conn.contactName.slice(0, 8) + '…' : conn.contactName}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {conn.outstandingBalance > 0 && (
                    <div className="flex items-center gap-0.5" style={{ flexShrink: 0 }}>
                      <span
                        aria-hidden
                        style={{ fontSize: '15px', fontWeight: 700, color: amountDirectionColor, lineHeight: 1 }}
                      >
                        {isSupplier ? '↓' : '↑'}
                      </span>
                      <p style={{ fontSize: '15px', fontWeight: 700, color: amountDirectionColor }}>
                        {conn.outstandingBalance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Row 2: Business type · Payment terms */}
                {subtitleParts.length > 0 && (
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {subtitleParts.join(' · ')}
                  </p>
                )}

                {/* Divider */}
                <div style={{ height: '1px', backgroundColor: 'var(--border-light)', margin: '10px 0' }} />

                {/* Row 3: Orders · Traded amount + Call/WhatsApp buttons */}
                <div className="flex items-center justify-between">
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{conn.totalOrders}</span>
                    {' Order'}{conn.totalOrders !== 1 ? 's' : ''}
                    {conn.totalTradedAmount > 0 && (
                      <> · <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{conn.totalTradedAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</span>{' traded'}</>
                    )}
                  </p>
                  <div
                    className="flex items-center rounded-full overflow-hidden"
                    style={{ backgroundColor: '#F0F0F0', flexShrink: 0 }}
                    title={conn.contactPhone ? undefined : 'Add number in connection details'}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!conn.contactPhone) return
                        window.location.href = 'tel:' + conn.contactPhone
                      }}
                      className="flex items-center justify-center"
                      style={{ width: '44px', height: '22px', backgroundColor: conn.contactPhone ? '#2D2D2D' : '#AAAAAA', cursor: conn.contactPhone ? 'pointer' : 'default' }}
                      aria-label={conn.contactPhone ? 'Call' : 'Add number to call'}
                      aria-disabled={!conn.contactPhone}
                    >
                      <Phone size={13} color="#FFFFFF" />
                    </button>
                    <div style={{ width: '1px', height: '22px', backgroundColor: '#D0D0D0', flexShrink: 0 }} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!conn.contactPhone) return
                        const digits = conn.contactPhone.replace(/\D/g, '')
                        const number = digits.startsWith('91') ? digits : `91${digits}`
                        window.open(`https://wa.me/${number}`, '_blank')
                      }}
                      className="flex items-center justify-center"
                      style={{ width: '44px', height: '22px', backgroundColor: conn.contactPhone ? '#25D366' : '#AAAAAA', cursor: conn.contactPhone ? 'pointer' : 'default' }}
                      aria-label={conn.contactPhone ? 'WhatsApp' : 'Add number to WhatsApp'}
                      aria-disabled={!conn.contactPhone}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#FFFFFF" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: '1px', backgroundColor: 'var(--border-light)', margin: '10px 0' }} />

                {/* Row 4: Status badge + Last activity */}
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: statusColor,
                      backgroundColor: `${statusColor}26`,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-chip)',
                    }}
                  >
                    {relationshipLabel}
                  </span>
                  {lastActivity && (
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Last activity: <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{lastActivity}</span>
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* ── Shared sheets ── */}
      <LedgerDownloadSheet
        isOpen={showLedgerSheet}
        onClose={() => setShowLedgerSheet(false)}
        scope="all"
        currentBusinessId={currentBusinessId}
      />

      {/* ── FAB ── */}
      <button
        onClick={() => onNavigateToPlaceOrder(null)}
        className="fixed bottom-24 right-4 w-14 h-14 flex items-center justify-center z-20"
        style={{
          backgroundColor: 'var(--brand-primary)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 4px 16px rgba(74,108,247,0.4)',
        }}
      >
        <PencilSimple size={24} weight="regular" color="#FFFFFF" />
      </button>
    </div>
  )
}
