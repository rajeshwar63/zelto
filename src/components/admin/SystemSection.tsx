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
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
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

    setTotalEntities(entities.length)
    setTotalConnections(connections.length)
    setTotalOrders(orders.length)
    setTotalOpenIssues(issues.filter((i: any) => i.status === 'open').length)
    setTotalOverdueOrders(
      ordersWithPayment.filter((o: any) => o.paymentState === 'Overdue').length
    )
    setEntities(entities)
  }

  const handleFreezeAccount = async () => {
    if (!selectedEntityId || !freezeNote.trim()) return
    setFreezing(true)
    try {
      await dataStore.freezeEntity(selectedEntityId, adminUsername, freezeNote)
      toast.success('Account frozen successfully')
      setShowFreezeDialog(false)
      setSelectedEntityId('')
      setFreezeNote('')
      loadData()
    } catch (err) {
      toast.error('Failed to freeze account')
    } finally {
      setFreezing(false)
    }
  }

  const handleResetAllData = async () => {
    if (resetConfirmText !== 'RESET') return
    setResetting(true)
    try {
      await dataStore.clearAllData()
      // Also clear local auth session
      localStorage.removeItem('zelto:local-auth-session')
      toast.success('All data has been reset successfully')
      setShowResetDialog(false)
      setResetConfirmText('')
      // Reload stats
      setTotalEntities(0)
      setTotalConnections(0)
      setTotalOrders(0)
      setTotalOpenIssues(0)
      setTotalOverdueOrders(0)
      setEntities([])
    } catch (err) {
      toast.error('Failed to reset data')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">System Overview</h3>
        <div className="space-y-1">
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

      {/* Critical Operations */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Critical Operations</h3>
        <div className="space-y-6">
          {/* Freeze Account */}
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

          <div className="border-t border-gray-100" />

          {/* Reset All Data */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Reset All Data</p>
              <p className="text-sm text-gray-600">
                Permanently delete all businesses, users, connections, orders, and activity. Use this to start fresh for testing. This cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setShowResetDialog(true)}
            >
              Reset All Data
            </Button>
          </div>
        </div>
      </div>

      {/* Freeze Dialog */}
      <Dialog open={showFreezeDialog} onOpenChange={setShowFreezeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Freeze Account</DialogTitle>
            <DialogDescription>
              This will set the selected entity to Suspended status for both buyer and supplier roles. This action requires a mandatory note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select Entity</Label>
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a business entity..." />
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
              <Label>Reason / Note</Label>
              <Textarea
                value={freezeNote}
                onChange={(e) => setFreezeNote(e.target.value)}
                placeholder="Enter reason for freezing this account..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFreezeDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFreezeAccount}
              disabled={!selectedEntityId || !freezeNote.trim() || freezing}
            >
              {freezing ? 'Freezing...' : 'Freeze Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset All Data Dialog */}
      <Dialog open={showResetDialog} onOpenChange={(open) => {
        setShowResetDialog(open)
        if (!open) setResetConfirmText('')
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Data</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>all</strong> data — businesses, users, connections, orders, payments, issues, and notifications. Auth sessions will also be cleared. This action <strong>cannot be undone</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              Type <span className="font-mono font-semibold text-red-600">RESET</span> to confirm.
            </p>
            <Input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="Type RESET to confirm"
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetAllData}
              disabled={resetConfirmText !== 'RESET' || resetting}
            >
              {resetting ? 'Resetting...' : 'Reset All Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
