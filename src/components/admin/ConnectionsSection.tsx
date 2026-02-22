import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { BusinessEntity, Connection, OrderWithPaymentState, IssueReport, PaymentTermType } from '@/lib/types'

function formatPaymentTerms(terms: PaymentTermType): string {
  switch (terms.type) {
    case 'Advance Required':
      return 'Advance Required'
    case 'Payment on Delivery':
      return 'Payment on Delivery'
    case 'Bill to Bill':
      return 'Bill to Bill'
    case 'Days After Delivery':
      return `${terms.days} Days After Delivery`
    default:
      return 'Unknown'
  }
}

export function ConnectionsSection() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [entities, setEntities] = useState<BusinessEntity[]>([])
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [conns, ents] = await Promise.all([
      dataStore.getAllConnections(),
      dataStore.getAllBusinessEntities(),
    ])
    setConnections(conns)
    setEntities(ents)
  }

  const getEntityName = (id: string) => {
    return entities.find((e) => e.id === id)?.businessName || 'Unknown'
  }

  if (selectedConnection) {
    return (
      <ConnectionDetail
        connectionId={selectedConnection}
        onBack={() => setSelectedConnection(null)}
      />
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Connections</h2>
        <p className="text-sm text-gray-500 mt-1">All connections in the system</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Buyer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Supplier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Payment Terms</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">State</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((conn) => (
              <tr
                key={conn.id}
                onClick={() => setSelectedConnection(conn.id)}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-3 text-sm text-gray-900">
                  {getEntityName(conn.buyerBusinessId)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {getEntityName(conn.supplierBusinessId)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {formatPaymentTerms(conn.paymentTerms)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{conn.connectionState}</td>
              </tr>
            ))}
            {connections.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                  No connections found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ConnectionDetail({
  connectionId,
  onBack,
}: {
  connectionId: string
  onBack: () => void
}) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [buyer, setBuyer] = useState<BusinessEntity | null>(null)
  const [supplier, setSupplier] = useState<BusinessEntity | null>(null)
  const [orders, setOrders] = useState<OrderWithPaymentState[]>([])
  const [issues, setIssues] = useState<IssueReport[]>([])

  useEffect(() => {
    loadData()
  }, [connectionId])

  const loadData = async () => {
    const conn = await dataStore.getConnectionById(connectionId)
    if (!conn) return

    setConnection(conn)

    const [buyerEntity, supplierEntity, ordersData, allIssues] = await Promise.all([
      dataStore.getBusinessEntityById(conn.buyerBusinessId),
      dataStore.getBusinessEntityById(conn.supplierBusinessId),
      dataStore.getOrdersWithPaymentStateByConnectionId(connectionId),
      dataStore.getAllIssueReports(),
    ])

    setBuyer(buyerEntity || null)
    setSupplier(supplierEntity || null)
    setOrders(ordersData)

    const orderIds = ordersData.map((o) => o.id)
    setIssues(allIssues.filter((i) => orderIds.includes(i.orderId)))
  }

  if (!connection || !buyer || !supplier) {
    return <div className="text-sm text-gray-500">Loading...</div>
  }

  const openIssues = issues.filter((i) => i.status === 'Open').length
  const overdueOrders = orders.filter((o) => {
    if (!o.calculatedDueDate) return false
    return Date.now() > o.calculatedDueDate && o.settlementState !== 'Paid'
  }).length

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={onBack}
          className="text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          ← Back to Connections
        </button>

        <h2 className="text-xl font-semibold text-gray-900">Connection Detail</h2>
        <p className="text-sm text-gray-500 mt-1">
          {buyer.businessName} ← → {supplier.businessName}
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Overview</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Payment Terms</div>
              <div className="text-sm text-gray-900 mt-1">
                {formatPaymentTerms(connection.paymentTerms)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">State</div>
              <div className="text-sm text-gray-900 mt-1">{connection.connectionState}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Open Issues</div>
              <div className="text-sm text-gray-900 mt-1">{openIssues}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Overdue Orders</div>
              <div className="text-sm text-gray-900 mt-1">{overdueOrders}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Orders</h3>
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <div className="text-sm text-gray-900">{order.itemSummary}</div>
                  <div className="text-xs text-gray-500">₹{order.orderValue.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-600">{order.settlementState}</div>
                  <div className="text-xs text-gray-500">
                    {order.pendingAmount > 0 && `₹${order.pendingAmount.toLocaleString()} pending`}
                  </div>
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="text-sm text-gray-500">No orders</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
