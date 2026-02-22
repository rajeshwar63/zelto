import { useState, useEffect } from 'react'
import { dataStore } from '@/lib/data-store'
import { createIssue } from '@/lib/interactions'
import { CaretLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { IssueType, IssueSeverity, OrderWithPaymentState } from '@/lib/types'
import { toast } from 'sonner'

interface Props {
  orderId: string
  currentBusinessId: string
  onBack: () => void
  onSuccess: () => void
}

const ISSUE_TYPES: IssueType[] = [
  'Damaged Product',
  'Quality Below Expectation',
  'Expired Product',
  'Packaging Issue',
  'Short Supply',
  'Wrong Items Delivered',
  'Billing Mismatch',
  'Price Discrepancy',
]

const SEVERITIES: IssueSeverity[] = ['Low', 'Medium', 'High']

export function ReportIssueScreen({ orderId, currentBusinessId, onBack, onSuccess }: Props) {
  const [order, setOrder] = useState<OrderWithPaymentState | null>(null)
  const [issueType, setIssueType] = useState<IssueType | null>(null)
  const [severity, setSeverity] = useState<IssueSeverity>('Medium')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function loadOrder() {
      const connections = await dataStore.getAllConnections()
      for (const conn of connections) {
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
    if (!issueType) return

    setIsSubmitting(true)
    try {
      await createIssue(orderId, issueType, severity, currentBusinessId)
      toast.success('Issue reported')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to report issue')
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
          <h1 className="text-[17px] text-foreground font-normal">Report Issue</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div>
          <p className="text-[13px] text-muted-foreground mb-1">Order</p>
          <p className="text-[15px] text-foreground">{order.itemSummary}</p>
        </div>

        <div>
          <label htmlFor="issue-type" className="block text-[13px] text-muted-foreground mb-2">
            Issue type
          </label>
          <Select
            value={issueType || ''}
            onValueChange={(value) => setIssueType(value as IssueType)}
          >
            <SelectTrigger id="issue-type">
              <SelectValue placeholder="Select issue type" />
            </SelectTrigger>
            <SelectContent>
              {ISSUE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-[13px] text-muted-foreground mb-2">Severity</label>
          <div className="flex gap-2">
            {SEVERITIES.map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverity(sev)}
                className={`flex-1 px-4 py-2 rounded-md text-[13px] font-medium transition-colors ${
                  severity === sev
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !issueType}
          className="w-full"
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </div>
    </div>
  )
}
