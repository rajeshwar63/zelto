import { useState, useEffect } from 'react'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { useDataListener } from '@/lib/data-events'
import { calculateCredibility, getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import { consumePendingConnectionLabels } from '@/lib/pending-connection-labels'
import { getArchivedConnectionIds, unarchiveConnection } from '@/lib/connection-archive-store'
import { getBlockedBusinessIds, blockBusiness, unblockBusiness } from '@/lib/blocked-connections'
import { ArrowLeft, MagnifyingGlass, X, Phone, Receipt, Briefcase, MapPin, UsersThree, Package, Medal, UserPlus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { BusinessEntity, ConnectionRequest, Connection } from '@/lib/types'
import { TrustBadge } from '@/components/TrustBadge'
import { formatDistanceToNow } from 'date-fns'

type Tab = 'sent' | 'received' | 'archived'

interface Props {
  currentBusinessId: string
  onBack: () => void
  onSuccess: () => void
  initialTab?: Tab
  onNavigateToTrustProfile?: (targetBusinessId: string) => void
}

function formatPaymentTerms(terms: Connection['paymentTerms']): string | null {
  if (!terms) return null
  switch (terms.type) {
    case 'Advance Required': return 'Advance Required'
    case 'Payment on Delivery': return 'Payment on Delivery'
    case 'Bill to Bill': return 'Bill to Bill'
    case 'Days After Delivery': return `${terms.days} days after delivery`
  }
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'sent', label: 'Sent' },
  { id: 'received', label: 'Received' },
  { id: 'archived', label: 'Archived' },
]

export function ManageConnectionsScreen({ currentBusinessId, onBack, onSuccess, initialTab, onNavigateToTrustProfile }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'sent')
  const [requests, setRequests] = useState<ConnectionRequest[]>([])
  const [entities, setEntities] = useState<BusinessEntity[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Search panel state
  const [showSearch, setShowSearch] = useState(false)
  const [zeltoId, setZeltoId] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  // Search state for history tabs
  const [sentSearch, setSentSearch] = useState('')
  const [receivedSearch, setReceivedSearch] = useState('')
  const [archivedSearch, setArchivedSearch] = useState('')

  // Credibility data for received request senders
  const [receivedActivityMap, setReceivedActivityMap] = useState<Map<string, { connectionCount: number; orderCount: number }>>(new Map())
  const [receivedCredibilityMap, setReceivedCredibilityMap] = useState<Map<string, CredibilityBreakdown>>(new Map())

  // Action state
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  // Accept dialog state
  const [acceptingRequest, setAcceptingRequest] = useState<ConnectionRequest | null>(null)
  const [receiverRole, setReceiverRole] = useState<'buyer' | 'supplier'>('supplier')
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [acceptProcessing, setAcceptProcessing] = useState(false)

  const loadData = async () => {
    const [reqs, ents, conns] = await Promise.all([
      dataStore.getAllConnectionRequests(),
      dataStore.getAllBusinessEntities(),
      dataStore.getAllConnections(),
    ])
    setRequests(reqs)
    setEntities(ents)
    setConnections(conns)
    setArchivedIds(getArchivedConnectionIds(currentBusinessId))
    setBlockedIds(getBlockedBusinessIds(currentBusinessId))
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [currentBusinessId])

  useDataListener(['connection-requests:changed'], () => {
    void dataStore.getAllConnectionRequests().then(reqs => setRequests(reqs))
  })

  useEffect(() => {
    const pending = requests.filter(r => r.receiverBusinessId === currentBusinessId && r.status === 'Pending')
    if (pending.length === 0) return
    void Promise.all(
      pending.map(async r => {
        const [counts, cred] = await Promise.all([
          getBusinessActivityCounts(r.requesterBusinessId),
          calculateCredibility(r.requesterBusinessId),
        ])
        return { id: r.requesterBusinessId, counts, cred }
      })
    ).then(results => {
      setReceivedActivityMap(new Map(results.map(r => [r.id, r.counts])))
      setReceivedCredibilityMap(new Map(results.map(r => [r.id, r.cred])))
    })
  }, [requests, currentBusinessId])

  const entityMap = new Map<string, BusinessEntity>(entities.map(e => [e.id, e] as [string, BusinessEntity]))

  // ─── Add New ──────────────────────────────────────────────────────────────

  const handleFindBusiness = async () => {
    setAddError(null)
    setSearching(true)

    const trimmedId = zeltoId.trim()
    if (!trimmedId) {
      setAddError('Please enter a Zelto ID')
      setSearching(false)
      return
    }

    const allEntities = await dataStore.getAllBusinessEntities()
    const business = allEntities.find(e => e.zeltoId.toUpperCase() === trimmedId.toUpperCase())
    if (!business) {
      setAddError('No business found with this Zelto ID.')
      setSearching(false)
      return
    }

    if (business.id === currentBusinessId) {
      setAddError('This is your own business.')
      setSearching(false)
      return
    }

    setSearching(false)
    onNavigateToTrustProfile?.(business.id)
  }

  // ─── Sent tab ─────────────────────────────────────────────────────────────

  const sentRequests = requests
    .filter(r => r.requesterBusinessId === currentBusinessId)
    .sort((a, b) => b.createdAt - a.createdAt)

  const filteredSentRequests = sentSearch.trim()
    ? sentRequests.filter(r => {
        const b = entityMap.get(r.receiverBusinessId)
        return b?.businessName.toLowerCase().includes(sentSearch.toLowerCase())
      })
    : sentRequests

  const sentPending = filteredSentRequests.filter(r => r.status === 'Pending')
  const sentAccepted = filteredSentRequests.filter(r => r.status === 'Accepted')
  const sentDeclined = filteredSentRequests.filter(r => r.status === 'Declined')

  const handleCancelRequest = async (requestId: string) => {
    setActionInProgress(requestId)
    try {
      await dataStore.updateConnectionRequestStatus(requestId, 'Declined')
      emitDataChange('connection-requests:changed')
      const reqs = await dataStore.getAllConnectionRequests()
      setRequests(reqs)
    } catch (err) {
      console.error('Failed to cancel request:', err)
    } finally {
      setActionInProgress(null)
    }
  }

  // ─── Received tab ─────────────────────────────────────────────────────────

  const receivedRequests = requests
    .filter(r => r.receiverBusinessId === currentBusinessId)
    .sort((a, b) => b.createdAt - a.createdAt)

  const filteredReceivedRequests = receivedSearch.trim()
    ? receivedRequests.filter(r => {
        const b = entityMap.get(r.requesterBusinessId)
        return b?.businessName.toLowerCase().includes(receivedSearch.toLowerCase())
      })
    : receivedRequests

  const receivedPending = filteredReceivedRequests.filter(
    r => r.status === 'Pending' && !blockedIds.has(r.requesterBusinessId)
  )
  const receivedAccepted = filteredReceivedRequests.filter(r => r.status === 'Accepted')
  const receivedDeclined = filteredReceivedRequests.filter(
    r => (r.status === 'Declined' || r.status === 'Archived') && !blockedIds.has(r.requesterBusinessId)
  )
  const receivedBlocked = filteredReceivedRequests.filter(r => blockedIds.has(r.requesterBusinessId))

  const handleAcceptRequest = (request: ConnectionRequest) => {
    setAcceptingRequest(request)
    setReceiverRole(request.receiverRole)
    setAcceptError(null)
  }

  const handleAcceptConfirm = async () => {
    if (!acceptingRequest) return
    if (receiverRole === acceptingRequest.requesterRole) {
      setAcceptError('One party must be the buyer and one must be the supplier.')
      return
    }
    setAcceptError(null)
    setAcceptProcessing(true)

    try {
      const result = await dataStore.acceptConnectionRequest(acceptingRequest.id, receiverRole, currentBusinessId)
      const pendingLabels = consumePendingConnectionLabels(acceptingRequest.id)
      if (pendingLabels && result.connectionId) {
        await dataStore.updateConnectionContact(
          result.connectionId,
          currentBusinessId,
          null,
          pendingLabels.branchLabel,
          pendingLabels.contactName
        ).catch(() => {})
      }
      emitDataChange('connections:changed', 'connection-requests:changed', 'notifications:changed')
      setAcceptingRequest(null)
      setAcceptProcessing(false)
      const reqs = await dataStore.getAllConnectionRequests()
      setRequests(reqs)
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept request')
      setAcceptProcessing(false)
    }
  }

  const handleDeclineRequest = async (requestId: string) => {
    setActionInProgress(requestId)
    try {
      await dataStore.updateConnectionRequestStatus(requestId, 'Declined')
      emitDataChange('connection-requests:changed')
      const reqs = await dataStore.getAllConnectionRequests()
      setRequests(reqs)
    } catch (err) {
      console.error('Failed to decline request:', err)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleBlockRequest = async (request: ConnectionRequest) => {
    setActionInProgress(request.id)
    try {
      blockBusiness(currentBusinessId, request.requesterBusinessId)
      setBlockedIds(getBlockedBusinessIds(currentBusinessId))
      await dataStore.updateConnectionRequestStatus(request.id, 'Declined')
      emitDataChange('connection-requests:changed')
      const reqs = await dataStore.getAllConnectionRequests()
      setRequests(reqs)
    } catch (err) {
      console.error('Failed to block business:', err)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleUnblock = (targetBusinessId: string) => {
    unblockBusiness(currentBusinessId, targetBusinessId)
    setBlockedIds(getBlockedBusinessIds(currentBusinessId))
  }

  // ─── Archived tab ─────────────────────────────────────────────────────────

  const archivedConnections = connections.filter(c => archivedIds.has(c.id))

  const filteredArchivedConnections = archivedSearch.trim()
    ? archivedConnections.filter(c => {
        const otherId = c.buyerBusinessId === currentBusinessId ? c.supplierBusinessId : c.buyerBusinessId
        const b = entityMap.get(otherId)
        return b?.businessName.toLowerCase().includes(archivedSearch.toLowerCase())
      })
    : archivedConnections

  const handleRestoreConnection = (connectionId: string) => {
    unarchiveConnection(currentBusinessId, connectionId)
    setArchivedIds(getArchivedConnectionIds(currentBusinessId))
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderSearchBar = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid var(--border-light)' }}>
      <div style={{ position: 'relative' }}>
        <MagnifyingGlass
          size={18}
          weight="regular"
          style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            paddingLeft: '34px',
            paddingRight: value ? '34px' : '10px',
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
        {value && (
          <button
            onClick={() => onChange('')}
            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', padding: '4px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <X size={14} weight="bold" />
          </button>
        )}
      </div>
    </div>
  )

  const renderSectionHeader = (title: string) => (
    <div style={{ padding: '12px 16px 6px' }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
        {title}
      </p>
    </div>
  )

  const renderStatusBadge = (label: string, color: string, bg: string) => (
    <span style={{
      fontSize: '11px',
      fontWeight: 600,
      color,
      backgroundColor: bg,
      padding: '2px 8px',
      borderRadius: 'var(--radius-chip)',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {label}
    </span>
  )

  const renderSentRow = (request: ConnectionRequest) => {
    const otherBusiness = entityMap.get(request.receiverBusinessId)
    const isPending = request.status === 'Pending'
    const isAccepted = request.status === 'Accepted'
    const roleLabel = request.requesterRole === 'buyer' ? 'Sent as Buyer' : 'Sent as Supplier'

    let statusLabel = request.status
    let statusColor = '#D97706'
    let statusBg = '#FEF3C7'
    if (isAccepted) { statusColor = '#16A34A'; statusBg = '#DCFCE7'; statusLabel = 'Accepted' }
    else if (!isPending) { statusColor = '#DC2626'; statusBg = '#FEE2E2'; statusLabel = 'Declined' }

    return (
      <div key={request.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {otherBusiness?.businessName || 'Unknown Business'}
          </p>
          {renderStatusBadge(statusLabel, statusColor, statusBg)}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 2px' }}>{roleLabel}</p>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: `0 0 ${isPending ? '10px' : '0'}` }}>
          {formatDistanceToNow(request.createdAt, { addSuffix: true })}
        </p>
        {isPending && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCancelRequest(request.id)}
            disabled={actionInProgress === request.id}
          >
            {actionInProgress === request.id ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
      </div>
    )
  }

  const renderReceivedRow = (request: ConnectionRequest, isBlocked = false) => {
    const otherBusiness = entityMap.get(request.requesterBusinessId)
    const isPending = request.status === 'Pending' && !isBlocked
    const isAccepted = request.status === 'Accepted'
    const roleLabel = request.requesterRole === 'buyer' ? 'They are Buyer' : 'They are Supplier'

    let statusLabel = 'Pending'
    let statusColor = '#D97706'
    let statusBg = '#FEF3C7'
    if (isAccepted) { statusColor = '#16A34A'; statusBg = '#DCFCE7'; statusLabel = 'Accepted' }
    else if (isBlocked) { statusColor = '#6B7280'; statusBg = '#F3F4F6'; statusLabel = 'Blocked' }
    else if (!isPending) { statusColor = '#DC2626'; statusBg = '#FEE2E2'; statusLabel = 'Declined' }

    const showActions = isPending || isBlocked

    if (isPending) {
      const cred = receivedCredibilityMap.get(request.requesterBusinessId)
      const level = cred?.level ?? 'none'
      const activity = receivedActivityMap.get(request.requesterBusinessId)

      return (
        <div key={request.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-screen)' }}>
          <div style={{ borderRadius: 'var(--radius-card)', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
                  {otherBusiness?.businessName || 'Unknown Business'}
                </p>
                <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-tertiary)', marginTop: '3px', marginBottom: 0, letterSpacing: '0.04em' }}>
                  {otherBusiness?.zeltoId}
                </p>
              </div>
              <TrustBadge level={level} size="sm" />
            </div>

            {/* Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {otherBusiness?.formattedAddress && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                  <MapPin size={13} weight="regular" style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{otherBusiness.formattedAddress}</p>
                </div>
              )}
              {otherBusiness?.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Phone size={13} weight="regular" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>{otherBusiness.phone}</p>
                </div>
              )}
              {otherBusiness?.gstNumber && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Receipt size={13} weight="regular" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>GST: {otherBusiness.gstNumber}</p>
                </div>
              )}
              {otherBusiness?.businessType && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Briefcase size={13} weight="regular" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>{otherBusiness.businessType}</p>
                </div>
              )}
              {!otherBusiness?.phone && !otherBusiness?.gstNumber && !otherBusiness?.formattedAddress && (
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic', margin: 0 }}>No details added</p>
              )}
            </div>

            {/* Activity stat block */}
            {activity && (
              <div style={{ display: 'flex', background: 'var(--color-background-secondary)', borderRadius: '10px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 8px', gap: '3px' }}>
                  <UsersThree size={16} weight="duotone" style={{ color: '#4A6CF7' }} />
                  <p style={{ fontSize: '17px', fontWeight: 600, margin: 0, lineHeight: 1.1, color: 'var(--text-primary)' }}>{activity.connectionCount}</p>
                  <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', lineHeight: 1.3 }}>connections</p>
                </div>
                <div style={{ width: '1px', background: 'var(--border-light)', alignSelf: 'stretch' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 8px', gap: '3px' }}>
                  <Package size={16} weight="duotone" style={{ color: '#FF8C42' }} />
                  <p style={{ fontSize: '17px', fontWeight: 600, margin: 0, lineHeight: 1.1, color: 'var(--text-primary)' }}>{activity.orderCount}</p>
                  <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', lineHeight: 1.3 }}>orders placed</p>
                </div>
                <div style={{ width: '1px', background: 'var(--border-light)', alignSelf: 'stretch' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 8px', gap: '3px' }}>
                  <Medal size={16} weight="duotone" style={{ color: '#0D9488' }} />
                  <p style={{ fontSize: '17px', fontWeight: 600, margin: 0, lineHeight: 1.1, color: 'var(--text-primary)' }}>
                    {cred?.score ?? 0}<span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)' }}>/100</span>
                  </p>
                  <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', lineHeight: 1.3 }}>trust score</p>
                </div>
              </div>
            )}

            {/* Low-trust warning */}
            {(cred?.score ?? 0) < 20 && (
              <div style={{ background: 'var(--color-background-warning)', borderLeft: '3px solid #EF9F27', borderRadius: '6px', padding: '8px 10px' }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-warning)', margin: 0 }}>
                  This business hasn't built a history on Zelto yet. Verify before connecting.
                </p>
              </div>
            )}

            {/* Role + time */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{roleLabel}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>{formatDistanceToNow(request.createdAt, { addSuffix: true })}</p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                size="sm"
                onClick={() => handleAcceptRequest(request)}
                disabled={actionInProgress === request.id}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDeclineRequest(request.id)}
                disabled={actionInProgress === request.id}
              >
                Decline
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBlockRequest(request)}
                disabled={actionInProgress === request.id}
                className="text-destructive border-destructive/40 hover:bg-destructive/5"
              >
                Block
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div key={request.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {otherBusiness?.businessName || 'Unknown Business'}
          </p>
          {renderStatusBadge(statusLabel, statusColor, statusBg)}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 2px' }}>{roleLabel}</p>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: `0 0 ${showActions ? '10px' : '0'}` }}>
          {formatDistanceToNow(request.createdAt, { addSuffix: true })}
        </p>
        {isBlocked && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleUnblock(request.requesterBusinessId)}
          >
            Unblock
          </Button>
        )}
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ backgroundColor: 'var(--bg-screen)', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-header)', zIndex: 10, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ height: '44px', display: 'flex', alignItems: 'center', paddingLeft: '4px', paddingRight: '16px', justifyContent: 'space-between' }}>
          <button
            onClick={onBack}
            style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={20} color="var(--text-primary)" />
          </button>
          <h1 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>Manage Connections</h1>
          <button
            onClick={() => setShowSearch(prev => !prev)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', paddingRight: '0', background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label={showSearch ? 'Close search' : 'Add connection'}
          >
            {showSearch
              ? <X size={20} weight="bold" color="var(--brand-primary)" />
              : <>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Add</span>
                  <UserPlus size={20} weight="regular" />
                </>
            }
          </button>
        </div>

        {/* Inline search panel */}
        {showSearch && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-header)' }}>
            <input
              type="text"
              placeholder="Enter Zelto ID (e.g. ZELTO-XXXXXXXX)"
              value={zeltoId}
              onChange={e => setZeltoId(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') void handleFindBusiness() }}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-screen)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-input)',
                outline: 'none',
                fontFamily: 'inherit',
                marginBottom: '10px',
                boxSizing: 'border-box',
              }}
            />
            <Button
              onClick={handleFindBusiness}
              disabled={searching || !zeltoId.trim()}
              className="w-full"
            >
              {searching ? 'Searching…' : 'Find Business'}
            </Button>
            {addError && (
              <p style={{ fontSize: '13px', color: 'var(--status-overdue)', marginTop: '8px', marginBottom: 0 }}>{addError}</p>
            )}
          </div>
        )}

        {/* Segmented tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                paddingTop: '10px',
                paddingBottom: '10px',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? 600 : 500,
                color: activeTab === tab.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--brand-primary)' : 'transparent'}`,
                background: 'none',
                border: 'none',
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === tab.id ? 'var(--brand-primary)' : 'transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {tab.label}
                {tab.id === 'received' && receivedPending.length > 0 && !loading && (
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-overdue)', display: 'inline-block', flexShrink: 0 }} />
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ── Sent ── */}
        {activeTab === 'sent' && (
          <div>
            {renderSearchBar(sentSearch, setSentSearch, 'Search sent requests…')}
            {loading ? (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[1, 2, 3].map(i => <div key={i} className="animate-pulse" style={{ backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-card)', height: '80px' }} />)}
              </div>
            ) : filteredSentRequests.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {sentSearch ? 'No matching sent requests' : 'No sent requests yet'}
                </p>
              </div>
            ) : (
              <>
                {sentPending.length > 0 && (
                  <>{renderSectionHeader(`PENDING (${sentPending.length})`)}
                    {sentPending.map(r => renderSentRow(r))}</>
                )}
                {sentAccepted.length > 0 && (
                  <>{renderSectionHeader(`ACCEPTED (${sentAccepted.length})`)}
                    {sentAccepted.map(r => renderSentRow(r))}</>
                )}
                {sentDeclined.length > 0 && (
                  <>{renderSectionHeader(`DECLINED (${sentDeclined.length})`)}
                    {sentDeclined.map(r => renderSentRow(r))}</>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Received ── */}
        {activeTab === 'received' && (
          <div>
            {renderSearchBar(receivedSearch, setReceivedSearch, 'Search received requests…')}
            {loading ? (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[1, 2, 3].map(i => <div key={i} className="animate-pulse" style={{ backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-card)', height: '80px' }} />)}
              </div>
            ) : filteredReceivedRequests.length === 0 && receivedBlocked.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {receivedSearch ? 'No matching received requests' : 'No received requests yet'}
                </p>
              </div>
            ) : (
              <>
                {receivedPending.length > 0 && (
                  <>{renderSectionHeader(`PENDING (${receivedPending.length})`)}
                    {receivedPending.map(r => renderReceivedRow(r))}</>
                )}
                {receivedAccepted.length > 0 && (
                  <>{renderSectionHeader(`ACCEPTED (${receivedAccepted.length})`)}
                    {receivedAccepted.map(r => renderReceivedRow(r))}</>
                )}
                {receivedDeclined.length > 0 && (
                  <>{renderSectionHeader(`DECLINED (${receivedDeclined.length})`)}
                    {receivedDeclined.map(r => renderReceivedRow(r, false))}</>
                )}
                {receivedBlocked.length > 0 && (
                  <>{renderSectionHeader(`BLOCKED (${receivedBlocked.length})`)}
                    {receivedBlocked.map(r => renderReceivedRow(r, true))}</>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Archived ── */}
        {activeTab === 'archived' && (
          <div>
            {renderSearchBar(archivedSearch, setArchivedSearch, 'Search archived connections…')}
            {loading ? (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[1, 2, 3].map(i => <div key={i} className="animate-pulse" style={{ backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-card)', height: '80px' }} />)}
              </div>
            ) : filteredArchivedConnections.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {archivedSearch ? 'No matching archived connections' : 'No archived connections'}
                </p>
              </div>
            ) : (
              <div>
                {filteredArchivedConnections.map(conn => {
                  const otherId = conn.buyerBusinessId === currentBusinessId ? conn.supplierBusinessId : conn.buyerBusinessId
                  const otherBusiness = entityMap.get(otherId)
                  const isSupplier = conn.supplierBusinessId === currentBusinessId
                  const roleLabel = isSupplier ? 'Supplier' : 'Buyer'
                  const paymentTermsLabel = formatPaymentTerms(conn.paymentTerms)

                  return (
                    <div
                      key={conn.id}
                      style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}
                    >
                      <div>
                        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                          {otherBusiness?.businessName || 'Unknown Business'}
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', marginBottom: 0 }}>
                          {roleLabel}{paymentTermsLabel ? ` · ${paymentTermsLabel}` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestoreConnection(conn.id)}
                        style={{ flexShrink: 0 }}
                      >
                        Restore
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accept role dialog */}
      {acceptingRequest && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '20px', width: '100%', maxWidth: '400px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Confirm Your Role</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {entityMap.get(acceptingRequest.requesterBusinessId)?.businessName || 'This business'} wants to be the{' '}
              {acceptingRequest.requesterRole === 'buyer' ? 'Buyer' : 'Supplier'}.
            </p>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Your role:</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <Button
                variant={receiverRole === 'buyer' ? 'default' : 'outline'}
                onClick={() => setReceiverRole('buyer')}
                style={{ flex: 1 }}
              >
                I am the Buyer
              </Button>
              <Button
                variant={receiverRole === 'supplier' ? 'default' : 'outline'}
                onClick={() => setReceiverRole('supplier')}
                style={{ flex: 1 }}
              >
                I am the Supplier
              </Button>
            </div>
            {acceptError && <p style={{ fontSize: '13px', color: 'var(--status-overdue)', marginBottom: '12px' }}>{acceptError}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={handleAcceptConfirm} disabled={acceptProcessing} style={{ flex: 1 }}>
                {acceptProcessing ? 'Accepting…' : 'Confirm'}
              </Button>
              <Button variant="outline" onClick={() => setAcceptingRequest(null)} style={{ flex: 1 }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
