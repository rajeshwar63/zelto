import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dataStore } from '@/lib/data-store'
import { BusinessEntity } from '@/lib/types'
import { toast } from 'sonner'

interface SystemSectionProps {
  adminUsername: string
}

export function SystemSection({ adminUsername }: SystemSectionProps) {
  const [totalEntities, setTotalEntities] = useState(0)
  const [totalConnections, setTotalConnections] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [totalOpenIssues, setTotalOpenIssues] = useState(0)
  const [totalOverdueOrders, setTotalOverdueOrders] = useState(0)
  const [showFreezeDialog, setShowFreezeDialog] = useState(false)
  const [entities, setEntities] = useState<BusinessEntity[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [freezeNote, setFreezeNote] = useState('')
  const [freezing, setFreezing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [entities, connections, orders, issues, ordersWithPayment] = await Promise.all([
      dataStore.getAllBusinessEntities(),
      dataStore.getAllConnections(),
      dataStore.getAllOrders(),
      dataStore.getAllIssueReports(),
      dataStore.getAllOrdersWithPaymentState(),
    ])

    setEntities(entities.sort((a, b) => a.businessName.localeCompare(b.businessName)))
    setTotalEntities(entities.length)
    setTotalConnections(connections.length)
    setTotalOrders(orders.length)
    setTotalOpenIssues(issues.filter((i) => i.status === 'Open').length)

    const overdueCount = ordersWithPayment.filter((o) => {
      if (!o.calculatedDueDate) return false
      return Date.now() > o.calculatedDueDate && o.settlementState !== 'Paid'
    }).length
    setTotalOverdueOrders(overdueCount)
  }

  const handleFreeze = async () => {
    if (!selectedEntityId) {
      toast.error('Please select an entity')
      return
    }

    if (!freezeNote.trim()) {
      toast.error('Note is required')
      return
    }

    setFreezing(true)
    try {
      await dataStore.freezeEntity(selectedEntityId, freezeNote.trim(), adminUsername)
      toast.success('Account frozen successfully')
      setShowFreezeDialog(false)
      setSelectedEntityId('')
      setFreezeNote('')
    } catch (error) {
      toast.error('Failed to freeze account')
    } finally {
      setFreezing(false)
    }
  }

  const canFreeze = selectedEntityId && freezeNote.trim().length > 0

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">System</h2>
        <p className="text-sm text-gray-500 mt-1">System overview and operations</p>
      </div>

      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">System Statistics</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Entities</span>
              <span className="text-sm font-medium text-gray-900">{totalEntities}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Connections</span>
              <span className="text-sm font-medium text-gray-900">{totalConnections}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Orders</span>
              <span className="text-sm font-medium text-gray-900">{totalOrders}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Open Issues</span>
              <span className="text-sm font-medium text-gray-900">{totalOpenIssues}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Total Overdue Orders</span>
              <span className="text-sm font-medium text-gray-900">{totalOverdueOrders}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Critical Operations</h3>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Freeze an account to suspend it across both buyer and supplier roles simultaneously.
            </p>
            <Button
              variant="destructive"
              onClick={() => setShowFreezeDialog(true)}
            >
              Freeze Account
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showFreezeDialog} onOpenChange={setShowFreezeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Freeze Account</DialogTitle>
            <DialogDescription>
              This will set the selected entity to Suspended status for both buyer and supplier roles. This action requires a mandatory note.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="freeze-entity">Business Entity</Label>
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger id="freeze-entity">
                  <SelectValue placeholder="Select entity to freeze" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.businessName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="freeze-note">Reason (Required)</Label>
              <Textarea
                id="freeze-note"
                value={freezeNote}
                onChange={(e) => setFreezeNote(e.target.value)}
                placeholder="Enter reason for freezing this account..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFreezeDialog(false)
                setSelectedEntityId('')
                setFreezeNote('')
              }}
              disabled={freezing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFreeze}
              disabled={!canFreeze || freezing}
            >
              {freezing ? 'Freezing...' : 'Freeze Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
