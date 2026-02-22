import { useState, useEffect } from 'react'
import { dataStore } from '@/lib/data-store'
import { createConnection } from '@/lib/interactions'
import type { ConnectionRequest, PaymentTermType } from '@/lib/types'
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
  const [requesterBusiness, setRequesterBusiness] = useState<string>('')
  const [requesterZeltoId, setRequesterZeltoId] = useState<string>('')
  const [showRoleConfirm, setShowRoleConfirm] = useState(false)
  const [receiverRole, setReceiverRole] = useState<'buyer' | 'supplier'>(request.receiverRole)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    const loadRequester = async () => {
      const business = await dataStore.getBusinessEntityById(request.requesterBusinessId)
      if (business) {
        setRequesterBusiness(business.businessName)
        setRequesterZeltoId(business.zeltoId)
      }
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
        <p className="text-sm text-foreground font-normal mb-0.5">
          {requesterBusiness || 'Loading...'}
        </p>
        <p className="text-xs text-muted-foreground mb-0.5">
          {requesterZeltoId || 'Loading...'}
        </p>
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
              {requesterBusiness} is requesting to be the {request.requesterRole === 'buyer' ? 'Buyer' : 'Supplier'}
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
