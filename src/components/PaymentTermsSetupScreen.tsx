import { useState, useEffect } from 'react'
import { updatePaymentTerms } from '@/lib/interactions'
import { dataStore } from '@/lib/data-store'
import { CaretLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import type { PaymentTermType } from '@/lib/types'

interface Props {
  connectionId: string
  businessName: string
  currentBusinessId: string
  currentPaymentTerms?: PaymentTermType | null
  onSave: () => void
  onBack?: () => void
}

export function PaymentTermsSetupScreen({
  connectionId,
  businessName,
  currentBusinessId,
  currentPaymentTerms: propPaymentTerms,
  onSave,
  onBack,
}: Props) {
  const [currentPaymentTerms, setCurrentPaymentTerms] = useState<PaymentTermType | null>(propPaymentTerms || null)
  const [loading, setLoading] = useState(!propPaymentTerms)
  
  useEffect(() => {
    if (!propPaymentTerms) {
      async function loadPaymentTerms() {
        const connection = await dataStore.getConnectionById(connectionId)
        if (connection && connection.paymentTerms) {
          setCurrentPaymentTerms(connection.paymentTerms)
        }
        setLoading(false)
      }
      loadPaymentTerms()
    }
  }, [connectionId, propPaymentTerms])
  
  const [paymentTermType, setPaymentTermType] = useState<
    'Advance Required' | 'Payment on Delivery' | 'Bill to Bill' | 'Days After Delivery'
  >(currentPaymentTerms?.type || 'Payment on Delivery')
  
  const [daysAfterDelivery, setDaysAfterDelivery] = useState(
    currentPaymentTerms?.type === 'Days After Delivery' ? String(currentPaymentTerms.days) : '30'
  )
  
  useEffect(() => {
    if (currentPaymentTerms) {
      setPaymentTermType(currentPaymentTerms.type)
      if (currentPaymentTerms.type === 'Days After Delivery') {
        setDaysAfterDelivery(String(currentPaymentTerms.days))
      }
    }
  }, [currentPaymentTerms])
  
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError(null)
    setSaving(true)

    try {
      let paymentTerms: PaymentTermType
      if (paymentTermType === 'Days After Delivery') {
        const days = parseInt(daysAfterDelivery, 10)
        if (isNaN(days) || days <= 0) {
          setError('Please enter a valid number of days')
          setSaving(false)
          return
        }
        paymentTerms = { type: 'Days After Delivery', days }
      } else {
        paymentTerms = { type: paymentTermType }
      }

      await updatePaymentTerms(connectionId, paymentTerms, currentBusinessId)
      setSaving(false)
      onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payment terms')
      setSaving(false)
    }
  }

  const isEditing = !!currentPaymentTerms
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="bg-background">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center text-foreground hover:text-muted-foreground"
              aria-label="Back"
            >
              <CaretLeft size={20} weight="regular" />
            </button>
          )}
          <h1 className="text-[17px] text-foreground font-normal">
            {isEditing ? `Edit payment terms` : `Set payment terms for ${businessName}`}
          </h1>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-6">
        <div>
          <Label className="text-sm font-medium mb-3 block">Payment Terms</Label>
          <RadioGroup value={paymentTermType} onValueChange={(val) => setPaymentTermType(val as typeof paymentTermType)}>
            <div className="flex items-center space-x-2 py-2">
              <RadioGroupItem value="Advance Required" id="advance" />
              <Label htmlFor="advance" className="font-normal cursor-pointer">
                Advance Required
              </Label>
            </div>
            <div className="flex items-center space-x-2 py-2">
              <RadioGroupItem value="Payment on Delivery" id="pod" />
              <Label htmlFor="pod" className="font-normal cursor-pointer">
                Payment on Delivery
              </Label>
            </div>
            <div className="flex items-center space-x-2 py-2">
              <RadioGroupItem value="Bill to Bill" id="b2b" />
              <Label htmlFor="b2b" className="font-normal cursor-pointer">
                Bill to Bill
              </Label>
            </div>
            <div className="flex items-center space-x-2 py-2">
              <RadioGroupItem value="Days After Delivery" id="dad" />
              <Label htmlFor="dad" className="font-normal cursor-pointer">
                Days After Delivery
              </Label>
            </div>
          </RadioGroup>
        </div>

        {paymentTermType === 'Days After Delivery' && (
          <div>
            <Label htmlFor="days" className="text-sm font-medium mb-2 block">
              Number of Days
            </Label>
            <Input
              id="days"
              type="number"
              value={daysAfterDelivery}
              onChange={(e) => setDaysAfterDelivery(e.target.value)}
              placeholder="30"
              min="1"
            />
          </div>
        )}

        {error && <p className="text-sm text-[#D64545]">{error}</p>}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
