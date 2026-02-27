import { useEffect, useMemo, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { behaviourEngine } from '@/lib/behaviour-engine'
import { createOrder } from '@/lib/interactions'
import type { Connection, BusinessEntity, ConnectionState } from '@/lib/types'
import { getConnectionStateColor } from '@/lib/semantic-colors'
import { Plus, Users, PencilSimple, MagnifyingGlass, X, PaperPlaneTilt } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ConnectionWithState extends Connection {
  otherBusinessName: string
  computedState: ConnectionState
}

interface Props {
  currentBusinessId: string
  onSelectConnection: (connectionId: string) => void
  onAddConnection: () => void
  unreadConnectionIds?: Set<string>
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
      isSamePaymentTerms(conn.paymentTerms, other.paymentTerms)
    )
  })
}

export function ConnectionsScreen({ currentBusinessId, onSelectConnection, onAddConnection, unreadConnectionIds }: Props) {
  const [connections, setConnections] = useState<ConnectionWithState[]>(
    () => cachedConnectionsByBusiness.get(currentBusinessId) || []
  )
  const [isLoading, setIsLoading] = useState(() => !cachedConnectionsByBusiness.has(currentBusinessId))
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [eligibleConnections, setEligibleConnections] = useState<Connection[]>([])
  const [businesses, setBusinesses] = useState<Map<string, BusinessEntity>>(new Map())
  const [search, setSearch] = useState('')
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    console.debug('[ConnectionsScreen] mount', Date.now(), { currentBusinessId })
    requestAnimationFrame(() => console.debug('[ConnectionsScreen] paint', Date.now(), { currentBusinessId }))
  }, [currentBusinessId])

  useEffect(() => {
    const cachedConnections = cachedConnectionsByBusiness.get(currentBusinessId)
    if (cachedConnections) {
      setConnections(cachedConnections)
    } else {
      setIsLoading(true)
    }

    let cancelled = false

    async function loadConnections() {
      console.debug('[ConnectionsScreen] fetch start', Date.now(), { currentBusinessId })
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

          return {
            ...conn,
            otherBusinessName: otherBusiness?.businessName || 'Unknown',
            computedState,
          }
        })
      )

      console.debug('[ConnectionsScreen] fetch end', Date.now(), { currentBusinessId })
      if (cancelled) return

      if (!cachedConnections || !isSameConnections(cachedConnections, connectionsWithState)) {
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
    }

    void loadConnections()

    return () => {
      cancelled = true
    }
  }, [currentBusinessId])

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

    // Save connectionId before any state mutations
    const connectionId = selectedConnection.id

    setIsSending(true)
    setSendError(null)
    try {
      await createOrder(connectionId, message.trim(), 0, currentBusinessId)
      toast.success('Order placed')
      setShowOrderModal(false)
      setSelectedConnection(null)
      setMessage('')
      setSearch('')
      // Navigate to the connection so the user sees the new order immediately
      onSelectConnection(connectionId)
    } catch (error) {
      console.error('Failed to create order:', error)
      setSendError(error instanceof Error ? error.message : 'Failed to create order')
    } finally {
      setIsSending(false)
    }
  }

  const filteredConnections = useMemo(() => (
    search.trim()
      ? eligibleConnections.filter(conn => {
        const supplier = businesses.get(conn.supplierBusinessId)
        return supplier?.businessName.toLowerCase().includes(search.toLowerCase())
      })
      : eligibleConnections
  ), [businesses, eligibleConnections, search])

  if (connections.length === 0) {
    return (
      <>
        <div className="sticky top-0 bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center justify-between px-4">
            <h1 className="text-[17px] text-foreground font-normal">Connections</h1>
            <button onClick={onAddConnection} className="text-foreground flex items-center">
              <Plus size={20} weight="regular" />
              <Users size={20} weight="regular" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center min-h-[calc(100vh-44px)] px-4">
          {isLoading
            ? <p className="text-sm text-muted-foreground text-center">Loading...</p>
            : <p className="text-sm text-muted-foreground text-center">Add your first buyer or supplier to get started</p>
          }
        </div>
        <button
          onClick={handleOpenOrderModal}
          className="fixed bottom-20 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-20"
          style={{ backgroundColor: '#1A1A2E' }}
        >
          <PencilSimple size={24} weight="regular" color="#FFFFFF" />
        </button>
      </>
    )
  }

  return (
    <div className="bg-background relative">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center justify-between px-4">
          <h1 className="text-[17px] text-foreground font-normal">Connections</h1>
          <button onClick={onAddConnection} className="text-foreground flex items-center">
            <Plus size={20} weight="regular" />
            <Users size={20} weight="regular" />
          </button>
        </div>
      </div>
      {connections.map((conn) => {
        const formattedTerms = formatPaymentTerms(conn.paymentTerms)
        const isSupplier = conn.supplierBusinessId === currentBusinessId
        
        const statusLabel = !formattedTerms 
          ? (isSupplier ? 'Payment terms needed' : 'Awaiting payment terms')
          : conn.computedState
        
        const statusColor = !formattedTerms
          ? (isSupplier ? '#E8A020' : '#888888')
          : getConnectionStateColor(conn.computedState)
        
        return (
          <button
            key={conn.id}
            onClick={() => onSelectConnection(conn.id)}
            className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${
              unreadConnectionIds?.has(conn.id)
                ? 'border-l-[3px] border-l-blue-400 bg-blue-50/60'
                : 'border-l-[3px] border-l-transparent'
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div className="flex items-center gap-1.5">
                <p className="text-[15px] text-foreground font-normal">{conn.otherBusinessName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {formattedTerms && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    {formattedTerms}
                  </p>
                  <span className="text-[13px] text-muted-foreground">·</span>
                </>
              )}
              <p className="text-[13px]" style={{ color: statusColor }}>
                {statusLabel}
              </p>
            </div>
          </button>
        )
      })}
      <button
        onClick={handleOpenOrderModal}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-20"
        style={{ backgroundColor: '#1A1A2E' }}
      >
        <PencilSimple size={24} weight="regular" color="#FFFFFF" />
      </button>

      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl max-h-[90vh] flex flex-col">
            <div className="sticky top-0 bg-white border-b border-border px-4 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-medium">New Order</h2>
              <button onClick={() => {
                setShowOrderModal(false)
                setSelectedConnection(null)
                setMessage('')
                setSearch('')
              }}>
                <X size={24} weight="regular" />
              </button>
            </div>

            {!selectedConnection ? (
              <>
                <div className="px-4 py-3 border-b border-border">
                  <div className="relative">
                    <MagnifyingGlass size={20} weight="regular" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search suppliers..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {filteredConnections.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        {eligibleConnections.length === 0
                          ? 'No suppliers with payment terms set'
                          : 'No suppliers found'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredConnections.map((conn) => {
                        const supplier = businesses.get(conn.supplierBusinessId)
                        return (
                          <button
                            key={conn.id}
                            onClick={() => setSelectedConnection(conn)}
                            className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                          >
                            <p className="text-[15px] font-medium">{supplier?.businessName || 'Unknown'}</p>
                            <p className="text-[13px] text-muted-foreground mt-0.5">
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
                <div className="px-4 py-3 border-b border-border">
                  <button onClick={() => setSelectedConnection(null)} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>←</span>
                    <span>Back to suppliers</span>
                  </button>
                  <p className="text-lg font-medium mt-2">
                    {businesses.get(selectedConnection.supplierBusinessId)?.businessName || 'Unknown'}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <Input
                    placeholder="Enter order details..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="px-4 py-4 border-t border-border">
                  {sendError && (
                    <p className="text-sm text-destructive mb-3">{sendError}</p>
                  )}
                  <Button
                    onClick={handleSendOrder}
                    disabled={!message.trim() || isSending}
                    className="w-full"
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
