import { useState, useEffect } from 'react'
import { dataStore } from '@/lib/data-store'
import { recordPayment } from '@/lib/interactions'
import { CaretLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OrderWithPaymentState } from '@/lib/types'
import { toast } from 'sonner'

interface Props {
  orderId: string
  currentBusinessId: string
  onBack: () => void
  onSuccess: () => void
}

export function RecordPaymentScreen({ orderId, currentBusinessId, onBack, onSuccess }: Props) {
  const [order, setOrder] = useState<OrderWithPaymentState | null>(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function loadOrder() {
      const connection = await dataStore.getAllConnections()
      for (const conn of connection) {
        const orders = await dataStore.getOrdersWithPaymentStateByConnectionId(conn.id)
        const found = orders.find((o) => o.id === orderId)
        if (found) {
          setOrder(found)
          break
        }
      }
    }
    loadOrder()
  }, [orderId])

  const handleSubmit = async () => {
    if (!order) return
    
    setError(null)
    const amountNum = parseFloat(amount)

    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be greater than zero')
      return
    }

    if (amountNum > order.pendingAmount) {
      setError(`Amount exceeds remaining balance of ₹${order.pendingAmount.toLocaleString('en-IN')}`)
      return
    }

    setIsSubmitting(true)
    try {
      await recordPayment(orderId, amountNum, currentBusinessId)
      toast.success('Payment recorded')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button
            onClick={onBack}
            className="flex items-center text-foreground hover:text-muted-foreground"
            aria-label="Back"
          >
            <CaretLeft size={20} weight="regular" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal">Record Payment</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div>
          <p className="text-[13px] text-muted-foreground mb-1">Order</p>
          <p className="text-[15px] text-foreground">{order.itemSummary}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[13px] text-muted-foreground mb-1">Order value</p>
            <p className="text-[15px] text-foreground font-medium">
              ₹{order.orderValue.toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-[13px] text-muted-foreground mb-1">Already paid</p>
            <p className="text-[15px] text-foreground font-medium">
              ₹{order.totalPaid.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div>
          <p className="text-[13px] text-muted-foreground mb-1">Remaining balance</p>
          <p className="text-[17px] text-foreground font-semibold">
            ₹{order.pendingAmount.toLocaleString('en-IN')}
          </p>
        </div>

        <div>
          <label htmlFor="payment-amount" className="block text-[13px] text-muted-foreground mb-2">
            Payment amount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-foreground">
              ₹
            </span>
            <Input
              id="payment-amount"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-7"
            />
          </div>
          {error && (
            <p className="text-[12px] text-destructive mt-2">{error}</p>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !amount}
          className="w-full"
        >
          {isSubmitting ? 'Recording...' : 'Record Payment'}
        </Button>
      </div>
    </div>
  )
}
