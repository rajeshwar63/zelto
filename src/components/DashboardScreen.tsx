import { CaretRight, CheckCircle, ClockClockwise, Info, Package, ShieldWarning, Truck } from '@phosphor-icons/react'
import { useBusinessOverviewData } from '@/hooks/data/use-business-data'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'

interface Props {
  currentBusinessId: string
  onNavigateToOrders: (filter?: string) => void
  onNavigateToConnection: (connectionId: string, orderId?: string) => void
  onNavigateToProfile: () => void
  onNavigateToConnections: (filter?: string) => void
  onNavigateToAttention: (filter?: string) => void
  isActive?: boolean
}

export function DashboardScreen({ currentBusinessId, onNavigateToOrders, onNavigateToConnection, onNavigateToConnections, onNavigateToAttention, isActive = true }: Props) {
  const { data: overview, isInitialLoading } = useBusinessOverviewData(currentBusinessId, isActive)
  const recentOrders = overview?.recentOrders ?? []
  const attentionCounts = overview?.attentionCounts ?? {
    approvalNeeded: 0,
    dispatched: 0,
    delivered: 0,
    paymentPending: 0,
    disputes: 0,
  }

  if (isInitialLoading || !overview) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>
  }

  const data = {
    username: overview.username ?? '',
    ordersToday: overview.ordersToday ?? 0,
    toReceive: overview.toReceive ?? 0,
    toPay: overview.toPay ?? 0,
    overdue: overview.overdue ?? 0,
    overdueOrdersCount: overview.overdueOrdersCount ?? 0,
    overdueAverageDelayDays: overview.overdueAverageDelayDays ?? 0,
    overdueChangeFromYesterday: overview.overdueChangeFromYesterday ?? 0,
    tradePosition: overview.tradePosition ?? {
      next7Days: { comingIn: 0, goingOut: 0, net: 0 },
      next30Days: { comingIn: 0, goingOut: 0, net: 0 },
    },
  }
  const netPosition = data.toReceive - data.toPay
  const netPositionColorClass = netPosition > 0
    ? 'text-[var(--status-delivered)]'
    : netPosition < 0
      ? 'text-destructive'
      : 'text-muted-foreground'

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4" style={{ paddingTop: '20px', paddingBottom: '16px' }}>
          <h1 className="text-[20px] font-semibold" style={{ color: '#111' }}>Welcome back, {data.username}</h1>
          <p className="text-[13px] font-normal mt-1" style={{ color: '#8A8A8A' }}>Your trade snapshot today</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6 pb-24" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-[16px] font-semibold text-foreground mb-4">Trade Position</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-3">Next 7 Days</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">Coming In</p>
                    <p className="text-[14px] font-semibold text-[var(--status-delivered)]">₹{data.tradePosition.next7Days.comingIn.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">Going Out</p>
                    <p className="text-[14px] font-semibold text-foreground">₹{data.tradePosition.next7Days.goingOut.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">Net</p>
                    <p className={`text-[14px] font-semibold ${data.tradePosition.next7Days.net >= 0 ? 'text-[var(--status-delivered)]' : 'text-destructive'}`}>
                      {data.tradePosition.next7Days.net >= 0 ? '+' : '-'}₹{Math.abs(data.tradePosition.next7Days.net).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-3">Next 30 Days</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">Coming In</p>
                    <p className="text-[14px] font-semibold text-[var(--status-delivered)]">₹{data.tradePosition.next30Days.comingIn.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">Going Out</p>
                    <p className="text-[14px] font-semibold text-foreground">₹{data.tradePosition.next30Days.goingOut.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">Net</p>
                    <p className={`text-[14px] font-semibold ${data.tradePosition.next30Days.net >= 0 ? 'text-[var(--status-delivered)]' : 'text-destructive'}`}>
                      {data.tradePosition.next30Days.net >= 0 ? '+' : '-'}₹{Math.abs(data.tradePosition.next30Days.net).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-[10px] mt-[10px]">
            <button
              onClick={() => onNavigateToOrders('today')}
              className="text-left rounded-xl border border-border bg-card px-4 py-3 min-h-[80px]"
            >
              <p className="text-[12px] font-medium text-muted-foreground">📦 Orders Today</p>
              <p className="text-[24px] font-bold leading-tight mt-1 text-foreground">{data.ordersToday}</p>
            </button>

            <button
              onClick={() => onNavigateToConnections('receivables')}
              className="text-left rounded-xl border border-border bg-card px-4 py-3 min-h-[80px]"
            >
              <p className="text-[12px] font-medium text-muted-foreground">💰 To Receive</p>
              <p className="text-[24px] font-bold leading-tight mt-1 text-[var(--status-delivered)]">₹{data.toReceive.toLocaleString('en-IN')}</p>
            </button>

            <button
              onClick={() => onNavigateToOrders('payment_pending')}
              className="text-left rounded-xl border border-border bg-card px-4 py-3 min-h-[80px]"
            >
              <p className="text-[12px] font-medium text-muted-foreground">💳 To Pay</p>
              <p className="text-[24px] font-bold leading-tight mt-1 text-foreground">₹{data.toPay.toLocaleString('en-IN')}</p>
            </button>

            <button
              onClick={() => onNavigateToOrders('overdue')}
              className="text-left rounded-xl border border-border bg-card px-4 py-3 min-h-[80px]"
            >
              <p className="text-[12px] font-medium text-muted-foreground" style={{ color: '#E53935' }}>⚠️ Overdue</p>
              <p className="text-[24px] font-bold leading-tight mt-1" style={{ color: '#E53935' }}>₹{data.overdue.toLocaleString('en-IN')}</p>
              {data.overdueOrdersCount > 0 && (
                <p className="text-[11px] mt-1" style={{ color: '#777' }}>
                  {data.overdueOrdersCount} orders · {data.overdueAverageDelayDays}d avg
                </p>
              )}
            </button>
          </div>

          <div className="mt-[10px]">
            <button
              onClick={() => onNavigateToConnections(netPosition >= 0 ? 'receivables' : 'payables')}
              className="w-full text-left rounded-xl border border-border bg-card px-4 py-3"
            >
              <p className="text-[12px] font-medium text-muted-foreground">Net Position</p>
              <p className={`text-[30px] font-bold leading-tight mt-1 ${netPositionColorClass}`}>
                {netPosition > 0 ? '+' : netPosition < 0 ? '-' : ''}₹{Math.abs(netPosition).toLocaleString('en-IN')}
              </p>
            </button>
          </div>

          <div className="flex items-center gap-2 mt-[14px]" style={{ padding: '12px', backgroundColor: '#F6F8FF', borderRadius: '12px' }}>
            <Info size={14} color="#64748B" weight="fill" />
            <p className="text-[12px]" style={{ color: '#4A5568' }}>
              Insight: Your overdue {data.overdueChangeFromYesterday >= 0 ? 'increased' : 'decreased'} by ₹{Math.abs(data.overdueChangeFromYesterday).toLocaleString('en-IN')} since yesterday.
            </p>
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
