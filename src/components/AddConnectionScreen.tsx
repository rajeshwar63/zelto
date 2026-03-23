import { useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { scoreToLevel, getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import { setPendingConnectionLabels } from '@/lib/pending-connection-labels'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BusinessEntity } from '@/lib/types'
import { TrustBadge } from '@/components/TrustBadge'

interface Props {
  currentBusinessId: string
  onBack: () => void
  onSuccess: () => void
  onNavigateToTrustProfile?: (targetBusinessId: string) => void
}

export function AddConnectionScreen({ currentBusinessId, onBack, onSuccess, onNavigateToTrustProfile }: Props) {
  const [zeltoId, setZeltoId] = useState('')
  const [foundBusiness, setFoundBusiness] = useState<BusinessEntity | null>(null)
  const [foundCredibility, setFoundCredibility] = useState<CredibilityBreakdown | null>(null)
  const [foundActivity, setFoundActivity] = useState<{ connectionCount: number; orderCount: number } | null>(null)
  const [selectedRole, setSelectedRole] = useState<'buyer' | 'supplier' | null>(null)
  const [branchLabel, setBranchLabel] = useState('')
  const [contactName, setContactName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)

  const handleFindBusiness = async () => {
    setError(null)
    setFoundBusiness(null)
    setFoundCredibility(null)
    setFoundActivity(null)
    setSelectedRole(null)
    setBranchLabel('')
    setContactName('')
    setSearching(true)

    const trimmedId = zeltoId.trim()
    if (!trimmedId) {
      setError('Please enter a Zelto ID')
      setSearching(false)
      return
    }

    const entities = await dataStore.getAllBusinessEntities()
    const business = entities.find((e) => e.zeltoId.toUpperCase() === trimmedId.toUpperCase())

    if (!business) {
      setError('No business found with this Zelto ID.')
      setSearching(false)
      return
    }

    setFoundBusiness(business)

    const activity = await getBusinessActivityCounts(business.id)
    const cachedScore = business.credibilityScore ?? 0
    setFoundCredibility({
      score: cachedScore,
      level: scoreToLevel(cachedScore),
      completedItems: [],
      missingItems: [],
    })
    setFoundActivity(activity)

    setSearching(false)
  }

  const handleSendRequest = async () => {
    if (!foundBusiness || !selectedRole) return

    setError(null)
    setSending(true)

    if (foundBusiness.id === currentBusinessId) {
      setError('You cannot connect to yourself.')
      setSending(false)
      return
    }

    const existingConnections = await dataStore.getAllConnections()
    const connectionExists = existingConnections.some(
      (conn) =>
        (conn.buyerBusinessId === currentBusinessId &&
          conn.supplierBusinessId === foundBusiness.id) ||
        (conn.buyerBusinessId === foundBusiness.id &&
          conn.supplierBusinessId === currentBusinessId)
    )

    if (connectionExists) {
      setError('You are already connected with this business.')
      setSending(false)
      return
    }

    const pendingRequests = await dataStore.getAllConnectionRequests()
    const requestExists = pendingRequests.some(
      (req) =>
        req.status === 'Pending' &&
        ((req.requesterBusinessId === currentBusinessId &&
          req.receiverBusinessId === foundBusiness.id) ||
          (req.requesterBusinessId === foundBusiness.id &&
            req.receiverBusinessId === currentBusinessId))
    )

    if (requestExists) {
      setError('You are already connected with this business.')
      setSending(false)
      return
    }

    const requesterRole = selectedRole
    const receiverRole = selectedRole === 'buyer' ? 'supplier' : 'buyer'

    try {
      const newRequest = await dataStore.createConnectionRequest(
        currentBusinessId,
        foundBusiness.id,
        requesterRole,
        receiverRole
      )
      console.log('Connection request created successfully:', {
        requestId: newRequest.id,
        from: currentBusinessId,
        to: foundBusiness.id,
        requesterRole,
        receiverRole
      })
      setPendingConnectionLabels(
        newRequest.id,
        branchLabel.trim() || null,
        contactName.trim() || null
      )
      emitDataChange('connection-requests:changed', 'notifications:changed')
      setSending(false)
      onSuccess()
    } catch (err) {
      console.error('Failed to create connection request:', err)
      setError('Failed to send connection request. Please try again.')
      setSending(false)
    }
  }

  return (
    <div className="bg-background">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <button onClick={onBack} className="mr-3">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal">Add Connection</h1>
        </div>
      </div>

      <div className="px-4 pt-6">
        <Input
          type="text"
          placeholder="Enter Zelto ID"
          value={zeltoId}
          onChange={(e) => setZeltoId(e.target.value)}
          className="mb-3"
        />

        <Button
          onClick={handleFindBusiness}
          disabled={searching || !zeltoId.trim()}
          className="w-full mb-4"
        >
          {searching ? 'Searching...' : 'Find Business'}
        </Button>

        {error && <p className="text-sm text-[var(--status-overdue)] mb-4">{error}</p>}

        {foundBusiness && (
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden mt-4">
            {/* Header */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {/* Initials avatar */}
                  <div className="w-11 h-11 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-teal-700 text-sm font-semibold">
                      {foundBusiness.businessName.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-[16px] font-medium text-foreground leading-tight">{foundBusiness.businessName}</p>
                    <p className="text-[12px] text-muted-foreground tracking-wide mt-0.5">{foundBusiness.zeltoId}</p>
                  </div>
                </div>
                {foundCredibility && (
                  <TrustBadge level={foundCredibility.level} variant="dark" size="sm" />
                )}
              </div>

              {/* Metadata chips row */}
              {(foundBusiness.businessType || foundBusiness.gstNumber || foundBusiness.phone) ? (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {foundBusiness.businessType && (
                    <span className="text-[12px] text-muted-foreground bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                      {foundBusiness.businessType}
                    </span>
                  )}
                  {foundBusiness.gstNumber && (
                    <span className="text-[12px] text-muted-foreground bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                      GST: {foundBusiness.gstNumber}
                    </span>
                  )}
                  {foundBusiness.phone && (
                    <span className="text-[12px] text-muted-foreground bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                      {foundBusiness.phone}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic mt-2">No details added</p>
              )}
            </div>

            {/* Divider below header */}
            <div className="h-px bg-gray-100" />

            {/* Stats strip */}
            {foundActivity && foundCredibility && (
              <>
                <div className="flex">
                  <div className="flex-1 flex flex-col items-center py-3">
                    <p className="text-[20px] font-medium text-foreground leading-tight">{foundActivity.connectionCount}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">connections</p>
                  </div>
                  <div className="w-px bg-gray-100" />
                  <div className="flex-1 flex flex-col items-center py-3">
                    <p className="text-[20px] font-medium text-foreground leading-tight">{foundActivity.orderCount}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">orders placed</p>
                  </div>
                  <div className="w-px bg-gray-100" />
                  <div className="flex-1 flex flex-col items-center py-3">
                    <p className="text-[20px] font-medium leading-tight">
                      <span className="text-teal-600">{foundCredibility.score}</span>
                      <span className="text-[13px] text-muted-foreground">/100</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">trust score</p>
                  </div>
                </div>
                <div className="h-px bg-gray-100" />
              </>
            )}

            {/* Warning note — only for new/unverified businesses */}
            {foundCredibility && foundCredibility.score < 20 && (
              <div style={{
                background: 'var(--color-background-warning)',
                borderLeft: '3px solid #EF9F27',
                borderRadius: '6px',
                padding: '8px 10px',
                margin: '12px 16px 0'
              }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-warning)', margin: 0 }}>
                  This business hasn't built a history on Zelto yet. Verify before connecting.
                </p>
              </div>
            )}

            {/* Optional branch/contact fields */}
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[12px] text-muted-foreground mb-1.5 block">
                  Branch / Location <span className="opacity-60">(optional)</span>
                </label>
                <input
                  type="text"
                  value={branchLabel}
                  onChange={(e) => setBranchLabel(e.target.value)}
                  placeholder="e.g. Banjara Hills"
                  className="w-full text-[13px] bg-gray-50 border border-border rounded px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{ paddingTop: '9px', paddingBottom: '9px', paddingLeft: '12px', paddingRight: '12px' }}
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground mb-1.5 block">
                  Contact Person <span className="opacity-60">(optional)</span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Ravi"
                  className="w-full text-[13px] bg-gray-50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{ paddingTop: '9px', paddingBottom: '9px', paddingLeft: '12px', paddingRight: '12px' }}
                />
              </div>
            </div>

            {/* Role selector + send button */}
            <div className="px-4 pb-4 space-y-3">
              <div>
                <p className="text-[12px] text-muted-foreground mb-2">Your role in this relationship</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedRole('buyer')}
                    className={`flex-1 py-2 text-[13px] rounded transition-colors font-medium ${
                      selectedRole === 'buyer'
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-white text-muted-foreground border border-border'
                    }`}
                    style={selectedRole === 'buyer' ? { border: '1.5px solid #14b8a6' } : undefined}
                  >
                    I am the Buyer
                  </button>
                  <button
                    onClick={() => setSelectedRole('supplier')}
                    className={`flex-1 py-2 text-[13px] rounded transition-colors font-medium ${
                      selectedRole === 'supplier'
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-white text-muted-foreground border border-border'
                    }`}
                    style={selectedRole === 'supplier' ? { border: '1.5px solid #14b8a6' } : undefined}
                  >
                    I am the Supplier
                  </button>
                </div>
              </div>

              {onNavigateToTrustProfile && (
                <button
                  onClick={() => onNavigateToTrustProfile(foundBusiness.id)}
                  className="w-full py-3 rounded-lg text-[14px] font-medium"
                  style={{ border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--brand-primary)', marginBottom: '8px' }}
                >
                  View Trust Profile →
                </button>
              )}

              <button
                onClick={handleSendRequest}
                disabled={!selectedRole || sending}
                className="w-full py-3 rounded-lg bg-teal-600 text-white text-[14px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
