import { useMemo } from 'react'
import { CaretRight, CheckCircle, ClockClockwise, Package, ShieldWarning, Truck } from '@phosphor-icons/react'
import { useBusinessOverviewData } from '@/hooks/data/use-business-data'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'

interface Props {
  currentBusinessId: string
  onNavigateToOrders: (filter?: string) => void
  onNavigateToConnection: (connectionId: string, orderId?: string) => void
  onNavigateToProfile: () => void
  onNavigateToAttention: (filter?: string) => void
}

export function DashboardScreen({ currentBusinessId, onNavigateToOrders, onNavigateToConnection, onNavigateToAttention }: Props) {
  const { data: overview, isInitialLoading } = useBusinessOverviewData(currentBusinessId)
  const data = useMemo(() => overview && ({
    toPay: overview.toPay,
    toReceive: overview.toReceive,
    ordersToday: overview.ordersToday,
    overdue: overview.overdue,
  }), [overview])
  const recentOrders = overview?.recentOrders ?? []
  const attentionCounts = overview?.attentionCounts ?? {
    approvalNeeded: 0,
    dispatched: 0,
    delivered: 0,
    paymentPending: 0,
    disputes: 0,
  }

  if (isInitialLoading || !data) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal">Home</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6 pb-24" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div>
          <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
            Business Pulse
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border rounded-xl px-4 py-4" style={{ borderColor: '#F0F4FF' }}>
              <p className="text-[12px] text-muted-foreground">Orders Today</p>
              <p className="text-[20px] font-extrabold leading-tight mt-1" style={{ color: '#4A6CF7' }}>
                {data.ordersToday}
              </p>
            </div>

            <div className="bg-white border rounded-xl px-4 py-4" style={{ borderColor: '#FFF0F0' }}>
              <p className="text-[12px] text-muted-foreground">Over Due</p>
              <p className="text-[20px] font-extrabold leading-tight mt-1" style={{ color: '#FF6B6B' }}>
                ₹{data.overdue.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="bg-white border rounded-xl px-4 py-4" style={{ borderColor: '#FFF0F0' }}>
              <p className="text-[12px] text-muted-foreground">To Pay</p>
              <p className="text-[20px] font-extrabold leading-tight mt-1" style={{ color: '#FF6B6B' }}>
                ₹{data.toPay.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="bg-white border rounded-xl px-4 py-4" style={{ borderColor: '#F0FFF6' }}>
              <p className="text-[12px] text-muted-foreground">To Recieve</p>
              <p className="text-[20px] font-extrabold leading-tight mt-1" style={{ color: '#22B573' }}>
                ₹{data.toReceive.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
            Needs Attention
          </h2>
          <div className="space-y-3">
            {attentionCounts.approvalNeeded > 0 && (
              <button
                onClick={() => onNavigateToOrders('placed')}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderLeft: '3px solid var(--status-new)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand-primary-bg)' }}>
                    <ClockClockwise size={15} weight="bold" color="var(--status-new)" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Approval Needed</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: 'var(--status-new)' }}>{attentionCounts.approvalNeeded}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.dispatched > 0 && (
              <button
                onClick={() => onNavigateToOrders('dispatched')}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderLeft: '3px solid var(--status-dispatched)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF6F0' }}>
                    <Truck size={15} weight="fill" color="var(--status-dispatched)" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Dispatched</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: 'var(--status-dispatched)' }}>{attentionCounts.dispatched}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.delivered > 0 && (
              <button
                onClick={() => onNavigateToOrders('delivered')}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderLeft: '3px solid var(--status-delivered)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F0FFF6' }}>
                    <CheckCircle size={15} weight="fill" color="var(--status-delivered)" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Delivered</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: 'var(--status-delivered)' }}>{attentionCounts.delivered}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.paymentPending > 0 && (
              <button
                onClick={() => onNavigateToOrders('payment_pending')}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderLeft: '3px solid var(--status-payment)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF0F8' }}>
                    <Package size={15} weight="fill" color="var(--status-payment)" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Payment Pending</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: 'var(--status-payment)' }}>{attentionCounts.paymentPending}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.disputes > 0 && (
              <button
                onClick={() => onNavigateToAttention('disputes')}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderLeft: '3px solid var(--status-issue)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFFBF0' }}>
                    <ShieldWarning size={15} weight="fill" color="var(--status-issue)" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Issues / Disputes</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: 'var(--status-issue)' }}>{attentionCounts.disputes}</span>
                  <CaretRight size={16} className="text-muted-foreground" />
                </div>
              </button>
            )}

            {attentionCounts.approvalNeeded === 0 &&
              attentionCounts.dispatched === 0 &&
              attentionCounts.delivered === 0 &&
              attentionCounts.paymentPending === 0 &&
              attentionCounts.disputes === 0 && (
                <div className="bg-white border border-border rounded-xl px-4 py-6 text-center">
                  <p className="text-[13px] text-muted-foreground">All caught up — nothing needs attention right now.</p>
                </div>
              )}
          </div>
        </div>

        {recentOrders.length > 0 && (
          <div>
            <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">Recent Activity</h2>
            <div className="space-y-2">
              {recentOrders.map(order => {
                const statusColor = getLifecycleStatusColor(order.lifecycleState)

                return (
                  <button
                    key={order.id}
                    onClick={() => onNavigateToConnection(order.connectionId, order.id)}
                    className="w-full text-left bg-white border border-border rounded-xl px-4 py-3"
                    style={{ borderLeft: `3px solid ${statusColor}` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[15px] font-semibold text-foreground truncate">{order.itemSummary}</p>
                      <p className="text-[15px] font-semibold text-foreground">₹{order.orderValue.toLocaleString('en-IN')}</p>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-1">{order.connectionName} · {order.lifecycleState}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
