import { useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { scoreToLevel, getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import { setPendingConnectionLabels } from '@/lib/pending-connection-labels'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BusinessEntity } from '@/lib/types'
import { CredibilityBadge } from '@/components/CredibilityBadge'

interface Props {
  currentBusinessId: string
  onBack: () => void
  onSuccess: () => void
}

export function AddConnectionScreen({ currentBusinessId, onBack, onSuccess }: Props) {
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
          <div className="rounded-lg border border-border p-4 space-y-3 mt-4">
            {/* Header: name + trust badge */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[15px] font-medium text-foreground">{foundBusiness.businessName}</p>
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{foundBusiness.zeltoId}</p>
              </div>

              {foundCredibility && (
                <CredibilityBadge level={foundCredibility.level} />
              )}
            </div>

            {/* Details (only show what exists) */}
            <div className="space-y-1">
              {foundBusiness.formattedAddress && (
                <p className="text-xs text-muted-foreground">{foundBusiness.formattedAddress}</p>
              )}
              {foundBusiness.phone && (
                <p className="text-xs text-muted-foreground">{foundBusiness.phone}</p>
              )}
              {foundBusiness.gstNumber && (
                <p className="text-xs text-muted-foreground">GST: {foundBusiness.gstNumber}</p>
              )}
              {foundBusiness.businessType && (
                <p className="text-xs text-muted-foreground">{foundBusiness.businessType}</p>
              )}
              {!foundBusiness.phone && !foundBusiness.gstNumber && !foundBusiness.formattedAddress && (
                <p className="text-xs text-muted-foreground italic">No details added</p>
              )}
            </div>

            {/* Activity stat block */}
            {foundActivity && foundCredibility && (
              <div style={{
                display: 'flex', gap: '16px',
                padding: '10px 12px',
                background: 'var(--color-background-secondary)',
                borderRadius: '8px'
              }}>
                <div>
                  <p style={{ fontSize: '18px', fontWeight: 500, margin: 0, lineHeight: 1.2 }}>
                    {foundActivity.connectionCount}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
                    connections
                  </p>
                </div>
                <div style={{ width: '0.5px', background: 'var(--color-border-tertiary)' }} />
                <div>
                  <p style={{ fontSize: '18px', fontWeight: 500, margin: 0, lineHeight: 1.2 }}>
                    {foundActivity.orderCount}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
                    orders placed
                  </p>
                </div>
                <div style={{ width: '0.5px', background: 'var(--color-border-tertiary)' }} />
                <div>
                  <p style={{ fontSize: '18px', fontWeight: 500, margin: 0, lineHeight: 1.2 }}>
                    {foundCredibility.score}/100
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
                    score
                  </p>
                </div>
              </div>
            )}

            {/* Warning note — only for new/unverified businesses */}
            {foundCredibility && foundCredibility.score < 20 && (
              <div style={{
                background: 'var(--color-background-warning)',
                borderLeft: '3px solid #EF9F27',
                borderRadius: '6px',
                padding: '8px 10px'
              }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-warning)', margin: 0 }}>
                  This business hasn't built a history on Zelto yet. Verify before connecting.
                </p>
              </div>
            )}

            {/* Optional branch/contact fields */}
            <div className="space-y-2 pt-2">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">
                  Branch / Location (optional)
                </label>
                <input
                  type="text"
                  value={branchLabel}
                  onChange={(e) => setBranchLabel(e.target.value)}
                  placeholder="e.g. Banjara Hills"
                  className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">
                  Contact Person (optional)
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Ravi"
                  className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Role selection + send button */}
            <div className="space-y-2 pt-2">
              <p className="text-sm text-muted-foreground">Select your role:</p>
              <div className="flex gap-2">
                <Button
                  variant={selectedRole === 'buyer' ? 'default' : 'outline'}
                  onClick={() => setSelectedRole('buyer')}
                  className="flex-1"
                >
                  I am the Buyer
                </Button>
                <Button
                  variant={selectedRole === 'supplier' ? 'default' : 'outline'}
                  onClick={() => setSelectedRole('supplier')}
                  className="flex-1"
                >
                  I am the Supplier
                </Button>
              </div>
            </div>

            <Button
              onClick={handleSendRequest}
              disabled={!selectedRole || sending}
              className="w-full"
            >
              {sending ? 'Sending...' : 'Send Request'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
