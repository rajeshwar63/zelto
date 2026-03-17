import { useState, useEffect } from 'react'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { consumePendingConnectionLabels } from '@/lib/pending-connection-labels'
import { calculateCredibility, getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import { CredibilityBadge } from '@/components/CredibilityBadge'
import type { BusinessEntity, ConnectionRequest } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'

interface Props {
  request: ConnectionRequest
  currentBusinessId: string
  onUpdate: () => void
  onNavigateToConnections: () => void
  onNavigateToTrustProfile?: (targetBusinessId: string, requestId: string) => void
}

export function ConnectionRequestItem({ request, currentBusinessId, onUpdate, onNavigateToConnections, onNavigateToTrustProfile }: Props) {
  const [requesterBusiness, setRequesterBusiness] = useState<BusinessEntity | null>(null)
  const [requesterCredibility, setRequesterCredibility] = useState<CredibilityBreakdown | null>(null)
  const [requesterActivity, setRequesterActivity] = useState<{ connectionCount: number; orderCount: number } | null>(null)
  const [showRoleConfirm, setShowRoleConfirm] = useState(false)
  const [receiverRole, setReceiverRole] = useState<'buyer' | 'supplier'>(request.receiverRole)
  const [error, setError] = useState<string | null>(null)
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null)
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
    setOutcomeMessage(null)
    setShowRoleConfirm(true)
  }

  const handleDecline = async () => {
    setProcessing(true)
    await dataStore.updateConnectionRequestStatus(request.id, 'Declined')
    emitDataChange('connection-requests:changed', 'notifications:changed')
    setProcessing(false)
    onUpdate()
  }

  const handleRoleConfirm = async () => {
    if (receiverRole === request.requesterRole) {
      setError('One party must be the buyer and one must be the supplier.')
      return
    }

    setError(null)
    setOutcomeMessage(null)
    setProcessing(true)

    try {
      const result = await dataStore.acceptConnectionRequest(request.id, receiverRole, currentBusinessId)

      // Apply any pending branch/contact labels the requester entered during the Add Connection flow
      const pendingLabels = consumePendingConnectionLabels(request.id)
      if (pendingLabels && result.connectionId) {
        await dataStore.updateConnectionContact(
          result.connectionId,
          currentBusinessId,
          null,
          pendingLabels.branchLabel,
          pendingLabels.contactName
        ).catch(() => {/* non-critical */})
      }

      if (result.alreadyExisted) {
        setOutcomeMessage('This request was already accepted previously.')
      } else if (result.notificationStatus === 'failed') {
        setOutcomeMessage('Connection accepted, but requester notification could not be sent.')
      } else {
        setOutcomeMessage('Connection accepted successfully.')
      }

      setShowRoleConfirm(false)
      toast.success('Connection accepted.')
      setProcessing(false)

      emitDataChange('connections:changed', 'connection-requests:changed', 'notifications:changed')
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
        {/* Rich business card — tap body to open Trust Profile */}
        <div
          className="rounded-lg border border-border p-3 space-y-2 mb-3"
          onClick={() => {
            if (onNavigateToTrustProfile && requesterBusiness) {
              onNavigateToTrustProfile(requesterBusiness.id, request.id)
            }
          }}
          style={{ cursor: onNavigateToTrustProfile && requesterBusiness ? 'pointer' : 'default' }}
        >
          {/* Header: name + trust badge */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[15px] font-medium text-foreground">
                {requesterBusiness?.businessName || 'Loading...'}
              </p>
              <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {requesterBusiness?.zeltoId || ''}
              </p>
            </div>

            {requesterCredibility && (
              <CredibilityBadge level={requesterCredibility.level} />
            )}
          </div>

          {/* Business details */}
          {requesterBusiness && (
            <div className="space-y-0.5">
              {requesterBusiness.phone && (
                <p className="text-xs text-muted-foreground">{requesterBusiness.phone}</p>
              )}
              {requesterBusiness.gstNumber && (
                <p className="text-xs text-muted-foreground">GST: {requesterBusiness.gstNumber}</p>
              )}
              {requesterBusiness.businessType && (
                <p className="text-xs text-muted-foreground">{requesterBusiness.businessType}</p>
              )}
            </div>
          )}

          {/* Activity stat block */}
          {requesterActivity && requesterCredibility && (
            <div style={{
              display: 'flex', gap: '16px',
              padding: '10px 12px',
              background: 'var(--color-background-secondary)',
              borderRadius: '8px'
            }}>
              <div>
                <p style={{ fontSize: '18px', fontWeight: 500, margin: 0, lineHeight: 1.2 }}>
                  {requesterActivity.connectionCount}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
                  connections
                </p>
              </div>
              <div style={{ width: '0.5px', background: 'var(--color-border-tertiary)' }} />
              <div>
                <p style={{ fontSize: '18px', fontWeight: 500, margin: 0, lineHeight: 1.2 }}>
                  {requesterActivity.orderCount}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
                  orders placed
                </p>
              </div>
              <div style={{ width: '0.5px', background: 'var(--color-border-tertiary)' }} />
              <div>
                <p style={{ fontSize: '18px', fontWeight: 500, margin: 0, lineHeight: 1.2 }}>
                  {requesterCredibility.score}/100
                </p>
                <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
                  score
                </p>
              </div>
            </div>
          )}

          {/* Warning note — only for new/unverified businesses */}
          {requesterCredibility && requesterCredibility.score < 20 && (
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
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          {roleDescription}
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          {formatDistanceToNow(request.createdAt, { addSuffix: true })}
        </p>
        {outcomeMessage && (
          <p className="text-xs text-muted-foreground mb-2">{outcomeMessage}</p>
        )}
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
            <DialogDescription>
              Select your role in this connection. One party must be the Buyer and the other the Supplier.
            </DialogDescription>
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
            {outcomeMessage && (
          <p className="text-xs text-muted-foreground mb-2">{outcomeMessage}</p>
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
