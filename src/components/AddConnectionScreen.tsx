import { useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { calculateCredibility, getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BusinessEntity } from '@/lib/types'

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
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)

  const handleFindBusiness = async () => {
    setError(null)
    setFoundBusiness(null)
    setFoundCredibility(null)
    setFoundActivity(null)
    setSelectedRole(null)
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

    const [cred, activity] = await Promise.all([
      calculateCredibility(business.id),
      getBusinessActivityCounts(business.id),
    ])
    setFoundCredibility(cred)
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

        {error && <p className="text-sm text-[#D64545] mb-4">{error}</p>}

        {foundBusiness && (
          <div className="rounded-lg border border-border p-4 space-y-3 mt-4">
            {/* Business name + verified badge */}
            <div className="flex items-center gap-1.5">
              <p className="text-base font-medium text-foreground">{foundBusiness.businessName}</p>
              {foundCredibility?.level === 'trusted' && <span className="text-green-500">✓</span>}
              {foundCredibility?.level === 'verified' && <span className="text-blue-500">✓</span>}
            </div>

            {/* Zelto ID */}
            <p className="text-xs text-muted-foreground font-mono">{foundBusiness.zeltoId}</p>

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

            {/* Activity counts */}
            {foundActivity && (
              <p className="text-xs text-muted-foreground">
                {foundActivity.connectionCount} connection{foundActivity.connectionCount !== 1 ? 's' : ''} · {foundActivity.orderCount} order{foundActivity.orderCount !== 1 ? 's' : ''}
              </p>
            )}

            {/* Credibility bar */}
            {foundCredibility && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${foundCredibility.score}%`,
                      backgroundColor: foundCredibility.level === 'trusted' ? '#22C55E'
                        : foundCredibility.level === 'verified' ? '#3B82F6'
                        : foundCredibility.level === 'basic' ? '#F59E0B'
                        : '#D1D5DB'
                    }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {foundCredibility.level === 'trusted' ? 'Trusted'
                    : foundCredibility.level === 'verified' ? 'Verified'
                    : foundCredibility.level === 'basic' ? 'Basic'
                    : 'New'} ({foundCredibility.score}/100)
                </span>
              </div>
            )}

            {/* Warning for low credibility */}
            {foundCredibility && foundCredibility.score < 20 && (
              <div className="p-2 rounded bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700">
                  This business hasn't added details yet. Verify before connecting.
                </p>
              </div>
            )}

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
