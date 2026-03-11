import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { dataStore } from '@/lib/data-store'
import { behaviourEngine } from '@/lib/behaviour-engine'
import { createOrder } from '@/lib/interactions'
import { useDataListener } from '@/lib/data-events'
import type { Connection, BusinessEntity, ConnectionState } from '@/lib/types'
import { getConnectionStateColor } from '@/lib/semantic-colors'
import { Plus, Users, PencilSimple, MagnifyingGlass, X, PaperPlaneTilt } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ConnectionRequestItem } from '@/components/ConnectionRequestItem'
import { useConnectionRequestsData } from '@/hooks/data/use-business-data'

interface ConnectionWithState extends Connection {
  otherBusinessName: string
  computedState: ConnectionState
  outstandingBalance: number
  totalOrders: number
}

interface Props {
  currentBusinessId: string
  onSelectConnection: (connectionId: string) => void
  onAddConnection: () => void
  unreadConnectionIds?: Set<string>
  isActive?: boolean
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
      conn.computedState === other.computedState &&
      conn.outstandingBalance === other.outstandingBalance &&
      conn.totalOrders === other.totalOrders &&
      isSamePaymentTerms(conn.paymentTerms, other.paymentTerms)
    )
  })
}

export function ConnectionsScreen({ currentBusinessId, onSelectConnection, onAddConnection, unreadConnectionIds, isActive = true }: Props) {
  const [connections, setConnections] = useState<ConnectionWithState[]>(
    () => cachedConnectionsByBusiness.get(currentBusinessId) || []
  )
  const [isLoading, setIsLoading] = useState(() => !cachedConnectionsByBusiness.has(currentBusinessId))
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [eligibleConnections, setEligibleConnections] = useState<Connection[]>([])
  const [businesses, setBusinesses] = useState<Map<string, BusinessEntity>>(new Map())
  const [supplierSearch, setSupplierSearch] = useState('')
  const [connectionSearch, setConnectionSearch] = useState('')
  const [showConnectionSearch, setShowConnectionSearch] = useState(false)
  const listContainerRef = useRef<HTMLDivElement | null>(null)
  const pullStartYRef = useRef<number | null>(null)
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const { data: connectionRequests = [], refresh: refreshConnectionRequests } = useConnectionRequestsData(currentBusinessId, isActive)

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
        const outstandingBalance = orders.reduce((sum, o) => {
          if (o.declinedAt) return sum
          return sum + o.pendingAmount
        }, 0)

        return {
          ...conn,
          otherBusinessName: otherBusiness?.businessName || 'Unknown',
          computedState,
          outstandingBalance,
          totalOrders: orders.filter(o => !o.declinedAt).length,
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
    ['connections:changed', 'connection-requests:changed', 'orders:changed', 'payments:changed', 'issues:changed'],
    () => { void loadConnections() },
    isActive
  )

  const handleOpenOrderModal = async () => {
    const allConnections = await dataStore.getConnectionsByBusinessId(currentBusinessId)
    const eligible = allConnections.filter(
      c => c.buyerBusinessId === currentBusinessId && c.paymentTerms !== null
    )
    setEligibleConnections(eligible)

    const entities = await dataStore.getAllBusinessEntities()
    const businessMap = new Map(entities.map(e => [e.id, e]))
    setBusinesses(businessMap)

    setShowOrderModal(true)
  }

  const handleSendOrder = async () => {
    if (!selectedConnection || !message.trim()) return

    const connectionId = selectedConnection.id

    setIsSending(true)
    setSendError(null)
    try {
      await createOrder(connectionId, message.trim(), 0, currentBusinessId)
      toast.success('Order placed')
      setShowOrderModal(false)
      setSelectedConnection(null)
      setMessage('')
      setSupplierSearch('')
      onSelectConnection(connectionId)
    } catch (error) {
      console.error('Failed to create order:', error)
      setSendError(error instanceof Error ? error.message : 'Failed to create order')
    } finally {
      setIsSending(false)
    }
  }

  const filteredConnections = useMemo(() => (
    supplierSearch.trim()
      ? eligibleConnections.filter(conn => {
        const supplier = businesses.get(conn.supplierBusinessId)
        return supplier?.businessName.toLowerCase().includes(supplierSearch.toLowerCase())
      })
      : eligibleConnections
  ), [businesses, eligibleConnections, supplierSearch])


  const visibleConnections = useMemo(() => (
    connectionSearch.trim()
      ? connections.filter(conn => conn.otherBusinessName.toLowerCase().includes(connectionSearch.toLowerCase()))
      : connections
  ), [connections, connectionSearch])

  useEffect(() => {
    if (!showConnectionSearch) {
      setConnectionSearch('')
    }
  }, [showConnectionSearch])

  const handleListTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const container = listContainerRef.current
    if (!container || container.scrollTop > 0) return
    pullStartYRef.current = event.touches[0]?.clientY ?? null
  }

  const handleListTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (showConnectionSearch || pullStartYRef.current === null) return
    const currentY = event.touches[0]?.clientY
    if (currentY === undefined) return
    const pullDistance = currentY - pullStartYRef.current
    if (pullDistance > 50) {
      setShowConnectionSearch(true)
      pullStartYRef.current = null
    }
  }

  const handleListTouchEnd = () => {
    pullStartYRef.current = null
  }

  if (connections.length === 0 && connectionRequests.length === 0) {
    return (
      <div style={{ backgroundColor: 'var(--bg-screen)', minHeight: '100%' }}>
        <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center justify-between px-4">
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Connections</h1>
            <button onClick={onAddConnection} className="flex items-center" style={{ color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', justifyContent: 'center' }}>
              <Plus size={20} weight="regular" />
              <Users size={20} weight="regular" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center min-h-[calc(100vh-44px)] px-4">
          {isLoading
            ? (
              <div className="px-4 pt-4 space-y-2 w-full">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse" style={{ backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-card)', height: '80px' }} />
                ))}
              </div>
            )
            : (
              <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
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
            )
          }
        </div>
        <button
          onClick={handleOpenOrderModal}
          className="fixed bottom-20 right-4 w-14 h-14 flex items-center justify-center z-20"
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

  return (
    <div style={{ backgroundColor: 'var(--bg-screen)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center justify-between px-4">
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Connections</h1>
          <button onClick={onAddConnection} className="flex items-center" style={{ color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', justifyContent: 'center' }}>
            <Plus size={20} weight="regular" />
            <Users size={20} weight="regular" />
          </button>
        </div>
      </div>

      <div
        ref={listContainerRef}
        className="px-4 pt-3 pb-24 overflow-y-auto"
        onTouchStart={handleListTouchStart}
        onTouchMove={handleListTouchMove}
        onTouchEnd={handleListTouchEnd}
      >
        {connectionRequests.length > 0 && (
          <div className="mb-4">
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              PENDING REQUESTS
            </p>
            <div className="space-y-2">
              {connectionRequests.map(request => (
                <ConnectionRequestItem
                  key={request.id}
                  request={request}
                  currentBusinessId={currentBusinessId}
                  onUpdate={() => {
                    void refreshConnectionRequests(true)
                    void loadConnections()
                  }}
                  onNavigateToConnections={() => undefined}
                />
              ))}
            </div>
          </div>
        )}

        {showConnectionSearch && (
          <div className="mb-3">
            <div className="relative">
              <MagnifyingGlass size={18} weight="regular" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
              <Input
                placeholder="Search connections..."
                value={connectionSearch}
                onChange={(e) => setConnectionSearch(e.target.value)}
                className="pl-9 pr-10"
                style={{ borderRadius: 'var(--radius-input)' }}
              />
              <button
                onClick={() => setShowConnectionSearch(false)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ minWidth: '32px', minHeight: '32px', color: 'var(--text-secondary)' }}
              >
                <X size={16} weight="regular" />
              </button>
            </div>
          </div>
        )}

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

            const relationshipLabel = (() => {
              if (!formattedTerms) return isSupplier ? 'Payment terms needed' : 'Awaiting payment terms'
              switch (conn.computedState) {
                case 'Active': return 'Healthy'
                case 'Stable': return 'Stable'
                case 'Friction Rising': return 'Friction Rising'
                case 'Under Stress': return 'High Risk'
                default: return conn.computedState
              }
            })()

            const statusColor = !formattedTerms
              ? (isSupplier ? 'var(--status-dispatched)' : 'var(--text-secondary)')
              : getConnectionStateColor(conn.computedState)

            return (
              <button
                key={conn.id}
                onClick={() => onSelectConnection(conn.id)}
                className="w-full text-left"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-card)',
                  padding: '14px 16px',
                  border: isUnread ? '1px solid color-mix(in srgb, var(--status-new) 35%, white)' : '1px solid var(--border-light)',
                  boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
                  minHeight: '44px',
                }}
              >
                <div className="flex items-baseline justify-between">
                  <div className="flex items-center gap-2 flex-1 mr-3">
                    {isUnread && (
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-new)', flexShrink: 0 }} />
                    )}
                    <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{conn.otherBusinessName}</p>
                  </div>
                  {conn.outstandingBalance > 0 && (
                    <p style={{ fontSize: '15px', fontWeight: 700, color: isSupplier ? 'var(--status-delivered)' : 'var(--status-overdue)' }}>
                      {conn.outstandingBalance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {conn.totalOrders} Order{conn.totalOrders !== 1 ? 's' : ''}
                  </p>
                  {formattedTerms && (
                    <>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>·</span>
                      <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {formattedTerms}
                      </p>
                    </>
                  )}
                </div>
                <div className="mt-1">
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
                    {conn.computedState === 'Friction Rising' || conn.computedState === 'Under Stress' ? '⚠ ' : ''}{relationshipLabel}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <button
        onClick={handleOpenOrderModal}
        className="fixed bottom-20 right-4 w-14 h-14 flex items-center justify-center z-20"
        style={{
          backgroundColor: 'var(--brand-primary)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 4px 16px rgba(74,108,247,0.4)',
        }}
      >
        <PencilSimple size={24} weight="regular" color="#FFFFFF" />
      </button>

      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full max-h-[90vh] flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderTopLeftRadius: 'var(--radius-modal)', borderTopRightRadius: 'var(--radius-modal)' }}>
            <div className="sticky top-0 px-4 py-4 flex items-center justify-between" style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)', borderTopLeftRadius: 'var(--radius-modal)', borderTopRightRadius: 'var(--radius-modal)' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>New Order</h2>
              <button onClick={() => {
                setShowOrderModal(false)
                setSelectedConnection(null)
                setMessage('')
                setSupplierSearch('')
              }} style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={24} weight="regular" color="var(--text-primary)" />
              </button>
            </div>

            {!selectedConnection ? (
              <>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <div className="relative">
                    <MagnifyingGlass size={20} weight="regular" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
                    <Input
                      placeholder="Search suppliers..."
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      className="pl-10"
                      style={{ borderRadius: 'var(--radius-input)' }}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {filteredConnections.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {eligibleConnections.length === 0
                          ? 'No suppliers with payment terms set'
                          : 'No suppliers found'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      {filteredConnections.map((conn) => {
                        const supplier = businesses.get(conn.supplierBusinessId)
                        return (
                          <button
                            key={conn.id}
                            onClick={() => setSelectedConnection(conn)}
                            className="w-full text-left px-4 py-3"
                            style={{ borderBottom: '1px solid var(--border-section)', minHeight: '44px' }}
                          >
                            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{supplier?.businessName || 'Unknown'}</p>
                            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {formatPaymentTerms(conn.paymentTerms)}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <button onClick={() => setSelectedConnection(null)} className="flex items-center gap-2" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', minHeight: '44px' }}>
                    <span>←</span>
                    <span>Back to suppliers</span>
                  </button>
                  <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>
                    {businesses.get(selectedConnection.supplierBusinessId)?.businessName || 'Unknown'}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <Input
                    placeholder="Enter order details..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full"
                    style={{ borderRadius: 'var(--radius-input)' }}
                  />
                </div>

                <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border-light)' }}>
                  {sendError && (
                    <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--status-overdue)', marginBottom: '12px' }}>{sendError}</p>
                  )}
                  <Button
                    onClick={handleSendOrder}
                    disabled={!message.trim() || isSending}
                    className="w-full"
                    style={{ backgroundColor: 'var(--brand-primary)', borderRadius: 'var(--radius-button)', minHeight: '44px', color: '#FFFFFF', fontWeight: 600 }}
                  >
                    <PaperPlaneTilt size={20} weight="regular" className="mr-2" />
                    {isSending ? 'Sending...' : 'Send Order'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
