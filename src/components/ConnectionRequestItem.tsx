import { useState, useEffect } from 'react'
import { dataStore } from '@/lib/data-store'
import { createConnection } from '@/lib/interactions'
import { calculateCredibility, getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import type { BusinessEntity, ConnectionRequest, PaymentTermType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface Props {
  request: ConnectionRequest
  currentBusinessId: string
  onUpdate: () => void
  onNavigateToConnections: () => void
}

export function ConnectionRequestItem({ request, currentBusinessId, onUpdate, onNavigateToConnections }: Props) {
  const [requesterBusiness, setRequesterBusiness] = useState<BusinessEntity | null>(null)
  const [requesterCredibility, setRequesterCredibility] = useState<CredibilityBreakdown | null>(null)
  const [requesterActivity, setRequesterActivity] = useState<{ connectionCount: number; orderCount: number } | null>(null)
  const [showRoleConfirm, setShowRoleConfirm] = useState(false)
  const [receiverRole, setReceiverRole] = useState<'buyer' | 'supplier'>(request.receiverRole)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    const loadRequester = async () => {
      const business = await dataStore.getBusinessEntityById(request.requesterBusinessId)
      if (business) {
        setRequesterBusiness(business)
      }

      const [cred, activity] = await Promise.all([
        calculateCredibility(request.requesterBusinessId),
        getBusinessActivityCounts(request.requesterBusinessId),
      ])
      setRequesterCredibility(cred)
      setRequesterActivity(activity)
    }
    loadRequester()
  }, [request.requesterBusinessId])

  const handleAccept = () => {
    setError(null)
    setShowRoleConfirm(true)
  }

  const handleDecline = async () => {
    setProcessing(true)
    await dataStore.updateConnectionRequestStatus(request.id, 'Declined')
    setProcessing(false)
    onUpdate()
  }

  const handleRoleConfirm = async () => {
    if (receiverRole === request.requesterRole) {
      setError('One party must be the buyer and one must be the supplier.')
      return
    }

    setError(null)
    setProcessing(true)

    try {
      const buyerBusinessId = receiverRole === 'buyer' ? currentBusinessId : request.requesterBusinessId
      const supplierBusinessId = receiverRole === 'supplier' ? currentBusinessId : request.requesterBusinessId

      const paymentTerms: PaymentTermType | null = receiverRole === 'supplier' ? null : { type: 'Payment on Delivery' }

      const connection = await createConnection(buyerBusinessId, supplierBusinessId, paymentTerms)

      await dataStore.updateConnectionRequestStatus(request.id, 'Accepted')

      await dataStore.createNotification(
        request.requesterBusinessId,
        'ConnectionAccepted',
        connection.id,
        connection.id,
        `Your connection request has been accepted`
      )

      setShowRoleConfirm(false)
      setProcessing(false)

      onUpdate()
      onNavigateToConnections()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request')
      setProcessing(false)
    }
  }

  const roleDescription = request.requesterRole === 'supplier'
    ? 'They want to be your Supplier — you will be the Buyer.'
    : 'They want to be your Buyer — you will be the Supplier.'

  return (
    <>
      <div className="px-4 py-2">
        {/* Rich business card */}
        <div className="rounded-lg border border-border p-3 space-y-2 mb-3">
          {/* Business name + badge */}
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-foreground font-medium">
              {requesterBusiness?.businessName || 'Loading...'}
            </p>
            {requesterCredibility?.level === 'trusted' && <span className="text-green-500 text-[13px]">✓</span>}
            {requesterCredibility?.level === 'verified' && <span className="text-blue-500 text-[13px]">✓</span>}
          </div>

          {/* Zelto ID */}
          <p className="text-xs text-muted-foreground font-mono">
            {requesterBusiness?.zeltoId || 'Loading...'}
          </p>

          {/* Details */}
          {requesterBusiness && (
            <div className="space-y-0.5">
              {requesterBusiness.formattedAddress && (
                <p className="text-xs text-muted-foreground">{requesterBusiness.formattedAddress}</p>
              )}
              {requesterBusiness.phone && (
                <p className="text-xs text-muted-foreground">{requesterBusiness.phone}</p>
              )}
              {requesterBusiness.gstNumber && (
                <p className="text-xs text-muted-foreground">GST: {requesterBusiness.gstNumber}</p>
              )}
              {requesterBusiness.businessType && (
                <p className="text-xs text-muted-foreground">{requesterBusiness.businessType}</p>
              )}
              {!requesterBusiness.phone && !requesterBusiness.gstNumber && !requesterBusiness.formattedAddress && (
                <p className="text-xs text-muted-foreground italic">No details added</p>
              )}
            </div>
          )}

          {/* Activity counts */}
          {requesterActivity && (
            <p className="text-xs text-muted-foreground">
              {requesterActivity.connectionCount} connection{requesterActivity.connectionCount !== 1 ? 's' : ''} · {requesterActivity.orderCount} order{requesterActivity.orderCount !== 1 ? 's' : ''}
            </p>
          )}

          {/* Credibility bar */}
          {requesterCredibility && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${requesterCredibility.score}%`,
                    backgroundColor: requesterCredibility.level === 'trusted' ? '#22C55E'
                      : requesterCredibility.level === 'verified' ? '#3B82F6'
                      : requesterCredibility.level === 'basic' ? '#F59E0B'
                      : '#D1D5DB'
                  }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {requesterCredibility.level === 'trusted' ? 'Trusted'
                  : requesterCredibility.level === 'verified' ? 'Verified'
                  : requesterCredibility.level === 'basic' ? 'Basic'
                  : 'New'} ({requesterCredibility.score}/100)
              </span>
            </div>
          )}

          {/* Warning for low credibility */}
          {requesterCredibility && requesterCredibility.score < 20 && (
            <div className="p-2 rounded bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700">
                This business hasn't added details yet. Verify before connecting.
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          {roleDescription}
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          {formatDistanceToNow(request.createdAt, { addSuffix: true })}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={handleAccept}
            disabled={processing}
            size="sm"
            className="flex-1"
          >
            Accept
          </Button>
          <Button
            onClick={handleDecline}
            disabled={processing}
            size="sm"
            variant="outline"
            className="flex-1"
          >
            Decline
          </Button>
        </div>
      </div>

      <Dialog open={showRoleConfirm} onOpenChange={setShowRoleConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Connection Roles</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {requesterBusiness?.businessName} is requesting to be the {request.requesterRole === 'buyer' ? 'Buyer' : 'Supplier'}
            </p>
            <div>
              <Label>Your role in this connection</Label>
              <RadioGroup value={receiverRole} onValueChange={(val) => setReceiverRole(val as 'buyer' | 'supplier')} className="mt-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="buyer" id="buyer" />
                  <Label htmlFor="buyer" className="font-normal cursor-pointer">I am the Buyer</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="supplier" id="supplier" />
                  <Label htmlFor="supplier" className="font-normal cursor-pointer">I am the Supplier</Label>
                </div>
              </RadioGroup>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleRoleConfirm} disabled={processing} className="flex-1">
                {processing ? 'Creating Connection...' : 'Confirm'}
              </Button>
              <Button onClick={() => setShowRoleConfirm(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
