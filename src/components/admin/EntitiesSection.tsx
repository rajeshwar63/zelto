import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { dataStore } from '@/lib/data-store'
import { BusinessEntity, Connection, EntityFlag } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft } from '@phosphor-icons/react'

export function EntitiesSection() {
  const [entities, setEntities] = useState<BusinessEntity[]>([])
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)

  useEffect(() => {
    loadEntities()
  }, [])

  const loadEntities = async () => {
    const data = await dataStore.getAllBusinessEntities()
    setEntities(data.sort((a, b) => b.createdAt - a.createdAt))
  }

  if (selectedEntity) {
    return (
      <EntityDetail
        entityId={selectedEntity}
        onBack={() => setSelectedEntity(null)}
      />
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Entities</h2>
        <p className="text-sm text-gray-500 mt-1">All business entities in the system</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Business Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Zelto ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Credibility</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Flag Status</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => (
              <EntityRow
                key={entity.id}
                entity={entity}
                onClick={() => setSelectedEntity(entity.id)}
              />
            ))}
            {entities.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  No entities found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EntityRow({
  entity,
  onClick,
}: {
  entity: BusinessEntity
  onClick: () => void
}) {
  const [buyerFlag, setBuyerFlag] = useState<EntityFlag | undefined>()
  const [supplierFlag, setSupplierFlag] = useState<EntityFlag | undefined>()

  useEffect(() => {
    loadFlags()
  }, [entity.id])

  const loadFlags = async () => {
    const bf = await dataStore.getCurrentFlagForEntity(entity.id, 'buyer')
    const sf = await dataStore.getCurrentFlagForEntity(entity.id, 'supplier')
    setBuyerFlag(bf)
    setSupplierFlag(sf)
  }

  const flagDisplay = () => {
    const flags = []
    if (buyerFlag) flags.push(`Buyer: ${buyerFlag.flagType}`)
    if (supplierFlag) flags.push(`Supplier: ${supplierFlag.flagType}`)
    return flags.length > 0 ? flags.join(', ') : '—'
  }

  return (
    <tr
      onClick={onClick}
      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
    >
      <td className="px-4 py-3 text-sm text-gray-900">{entity.businessName}</td>
      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{entity.zeltoId}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{entity.credibilityScore}/100</td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatDistanceToNow(entity.createdAt, { addSuffix: true })}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{flagDisplay()}</td>
    </tr>
  )
}

function EntityDetail({
  entityId,
  onBack,
}: {
  entityId: string
  onBack: () => void
}) {
  const [entity, setEntity] = useState<BusinessEntity | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [buyerFlags, setBuyerFlags] = useState<EntityFlag[]>([])
  const [supplierFlags, setSupplierFlags] = useState<EntityFlag[]>([])
  const [entities, setEntities] = useState<BusinessEntity[]>([])

  useEffect(() => {
    loadData()
  }, [entityId])

  const loadData = async () => {
    const [e, conns, allEntities] = await Promise.all([
      dataStore.getBusinessEntityById(entityId),
      dataStore.getConnectionsByBusinessId(entityId),
      dataStore.getAllBusinessEntities(),
    ])

    if (e) setEntity(e)
    setConnections(conns)
    setEntities(allEntities)

    const flags = await dataStore.getEntityFlagsByEntityId(entityId)
    setBuyerFlags(flags.filter((f) => f.roleContext === 'buyer').sort((a, b) => b.timestamp - a.timestamp))
    setSupplierFlags(flags.filter((f) => f.roleContext === 'supplier').sort((a, b) => b.timestamp - a.timestamp))
  }

  if (!entity) {
    return (
      <div className="text-sm text-gray-500">Loading...</div>
    )
  }

  const getEntityName = (id: string) => {
    return entities.find((e) => e.id === id)?.businessName || 'Unknown'
  }

  const currentBuyerFlag = buyerFlags[0]
  const currentSupplierFlag = supplierFlags[0]

  return (
    <div>
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-4"
        >
          <ArrowLeft className="mr-2" size={16} />
          Back to Entities
        </Button>

        <h2 className="text-xl font-semibold text-gray-900">{entity.businessName}</h2>
        <p className="text-sm text-gray-500 mt-1">Zelto ID: {entity.zeltoId}</p>
      </div>

      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Connections</h3>
          <div className="space-y-2">
            {connections.map((conn) => {
              const role = conn.buyerBusinessId === entityId ? 'buyer' : 'supplier'
              const otherEntityId = role === 'buyer' ? conn.supplierBusinessId : conn.buyerBusinessId
              return (
                <div
                  key={conn.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <div className="text-sm text-gray-900">{getEntityName(otherEntityId)}</div>
                    <div className="text-xs text-gray-500">Role: {role}</div>
                  </div>
                  <div className="text-xs text-gray-500">{conn.connectionState}</div>
                </div>
              )
            })}
            {connections.length === 0 && (
              <div className="text-sm text-gray-500">No connections</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Current Flags</h3>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">As Buyer</div>
              <div className="text-sm text-gray-900">
                {currentBuyerFlag ? currentBuyerFlag.flagType : 'No flag set'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">As Supplier</div>
              <div className="text-sm text-gray-900">
                {currentSupplierFlag ? currentSupplierFlag.flagType : 'No flag set'}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Flag History (Buyer)</h3>
          <div className="space-y-3">
            {buyerFlags.map((flag) => (
              <div key={flag.id} className="border-l-2 border-gray-300 pl-4">
                <div className="text-sm font-medium text-gray-900">{flag.flagType}</div>
                <div className="text-xs text-gray-500 mt-1">{flag.note}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatDistanceToNow(flag.timestamp, { addSuffix: true })} by {flag.adminUsername}
                </div>
              </div>
            ))}
            {buyerFlags.length === 0 && (
              <div className="text-sm text-gray-500">No flag history</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Flag History (Supplier)</h3>
          <div className="space-y-3">
            {supplierFlags.map((flag) => (
              <div key={flag.id} className="border-l-2 border-gray-300 pl-4">
                <div className="text-sm font-medium text-gray-900">{flag.flagType}</div>
                <div className="text-xs text-gray-500 mt-1">{flag.note}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatDistanceToNow(flag.timestamp, { addSuffix: true })} by {flag.adminUsername}
                </div>
              </div>
            ))}
            {supplierFlags.length === 0 && (
              <div className="text-sm text-gray-500">No flag history</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
