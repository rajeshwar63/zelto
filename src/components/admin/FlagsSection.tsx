import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dataStore } from '@/lib/data-store'
import { BusinessEntity, EntityFlag, FlagType, RoleContext } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

interface FlagsSectionProps {
  adminUsername: string
}

export function FlagsSection({ adminUsername }: FlagsSectionProps) {
  const [entities, setEntities] = useState<BusinessEntity[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [selectedRole, setSelectedRole] = useState<RoleContext>('buyer')
  const [selectedFlagType, setSelectedFlagType] = useState<FlagType>('Verified')
  const [note, setNote] = useState('')
  const [flagHistory, setFlagHistory] = useState<EntityFlag[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadEntities()
  }, [])

  useEffect(() => {
    if (selectedEntityId) {
      loadFlagHistory()
    } else {
      setFlagHistory([])
    }
  }, [selectedEntityId, selectedRole])

  const loadEntities = async () => {
    const data = await dataStore.getAllBusinessEntities()
    setEntities(data.sort((a, b) => a.businessName.localeCompare(b.businessName)))
  }

  const loadFlagHistory = async () => {
    if (!selectedEntityId) return
    const flags = await dataStore.getEntityFlagsByEntityId(selectedEntityId)
    const filtered = flags.filter((f) => f.roleContext === selectedRole)
    setFlagHistory(filtered.sort((a, b) => b.timestamp - a.timestamp))
  }

  const handleSave = async () => {
    if (!selectedEntityId) {
      toast.error('Please select an entity')
      return
    }

    if (!note.trim()) {
      toast.error('Note is required')
      return
    }

    setLoading(true)
    try {
      await dataStore.createEntityFlag(
        selectedEntityId,
        selectedRole,
        selectedFlagType,
        note.trim(),
        adminUsername
      )

      toast.success('Flag saved successfully')
      setNote('')
      await loadFlagHistory()
    } catch (error) {
      toast.error('Failed to save flag')
    } finally {
      setLoading(false)
    }
  }

  const canSave = selectedEntityId && note.trim().length > 0

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Flags</h2>
        <p className="text-sm text-gray-500 mt-1">Assign and manage entity flags</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Set Flag</h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="entity">Business Entity</Label>
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger id="entity">
                  <SelectValue placeholder="Select entity" />
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
              <Label htmlFor="role">Role Context</Label>
              <Select
                value={selectedRole}
                onValueChange={(value) => setSelectedRole(value as RoleContext)}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyer">Buyer</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flag-type">Flag Type</Label>
              <Select
                value={selectedFlagType}
                onValueChange={(value) => setSelectedFlagType(value as FlagType)}
              >
                <SelectTrigger id="flag-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Verified">Verified</SelectItem>
                  <SelectItem value="Watch">Watch</SelectItem>
                  <SelectItem value="Restricted">Restricted</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note (Required)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter reason for flag..."
                rows={4}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={!canSave || loading}
              className="w-full"
            >
              Save Flag
            </Button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">
            Flag History
            {selectedEntityId && (
              <span className="text-gray-500 font-normal">
                {' '}
                ({selectedRole})
              </span>
            )}
          </h3>

          {!selectedEntityId ? (
            <div className="text-sm text-gray-500">Select an entity to view history</div>
          ) : (
            <div className="space-y-4">
              {flagHistory.map((flag) => (
                <div key={flag.id} className="border-l-2 border-gray-300 pl-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {flag.flagType}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(flag.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-1">{flag.note}</div>
                  <div className="text-xs text-gray-500">By {flag.adminUsername}</div>
                </div>
              ))}
              {flagHistory.length === 0 && (
                <div className="text-sm text-gray-500">No flag history for this role</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
