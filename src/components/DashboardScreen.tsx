import { ArrowDown, ArrowUp, CaretRight, CheckCircle, ClockClockwise, CurrencyInr, Package, ShieldWarning, Truck } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { formatDistanceToNow, isToday } from 'date-fns'
import { useBusinessOverviewData } from '@/hooks/data/use-business-data'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'
import { formatInrCurrency } from '@/lib/utils'
import { CardAccent } from '@/components/ui/card'
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from '@/components/ui/carousel'

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
  const [tradePositionCarouselApi, setTradePositionCarouselApi] = useState<CarouselApi>()
  const [activeTradePositionSlide, setActiveTradePositionSlide] = useState(0)

  useEffect(() => {
    if (!tradePositionCarouselApi) {
      return
    }

    const handleSelect = () => {
      setActiveTradePositionSlide(tradePositionCarouselApi.selectedScrollSnap())
    }

    handleSelect()
    tradePositionCarouselApi.on('select', handleSelect)
    tradePositionCarouselApi.on('reInit', handleSelect)

    return () => {
      tradePositionCarouselApi.off('select', handleSelect)
      tradePositionCarouselApi.off('reInit', handleSelect)
    }
  }, [tradePositionCarouselApi])

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

  const trimmedUsername = (overview.username ?? '').trim()
  const firstName = trimmedUsername ? trimmedUsername.split(/\s+/)[0] : ''

  const data = {
    username: firstName,
    ordersToday: overview.ordersToday ?? 0,
    toReceive: overview.toReceive ?? 0,
    toPay: overview.toPay ?? 0,
    overdue: overview.overdue ?? 0,
    overdueOrdersCount: overview.overdueOrdersCount ?? 0,
    overdueAverageDelayDays: overview.overdueAverageDelayDays ?? 0,
    overdueChangeFromYesterday: overview.overdueChangeFromYesterday ?? 0,
    tradePosition: overview.tradePosition ?? {
      next7Days: { comingIn: 0, goingOut: 0, net: 0, comingInOrders: 0, goingOutOrders: 0 },
      next30Days: { comingIn: 0, goingOut: 0, net: 0, comingInOrders: 0, goingOutOrders: 0 },
      past7Days: { moneyPaid: 0, moneyReceived: 0, receivedOrders: 0, paidOrders: 0 },
      past30Days: { moneyPaid: 0, moneyReceived: 0, receivedOrders: 0, paidOrders: 0 },
    },
  }
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4" style={{ paddingTop: '20px', paddingBottom: '16px' }}>
          <h1 className="text-[20px] font-semibold" style={{ color: '#111' }}>Welcome back{data.username ? ` ${data.username}` : ''},</h1>
          <p className="text-[13px] font-normal mt-1" style={{ color: '#8A8A8A' }}>Your trade snapshot today</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6 pb-24" style={{ backgroundColor: 'var(--bg-screen)' }}>
        <div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-[16px] font-semibold text-foreground">Trade Position</h2>
            <div className="grid grid-cols-4 mt-2 rounded-lg overflow-hidden border border-border">
              {[['Next', '7 Days'], ['Next', '30 Days'], ['Past', '7 Days'], ['Past', '30 Days']].map(([prefix, days], index) => (
                <button
                  key={`${prefix}-${days}`}
                  type="button"
                  onClick={() => tradePositionCarouselApi?.scrollTo(index)}
                  className={`py-1.5 text-center transition-colors ${index > 0 ? 'border-l border-border' : ''} ${
                    activeTradePositionSlide === index
                      ? 'bg-[var(--status-delivered)] text-white'
                      : 'bg-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="block text-[9px] font-normal leading-tight">{prefix}</span>
                  <span className="block text-[11px] font-semibold leading-tight">{days}</span>
                </button>
              ))}
            </div>

            <Carousel setApi={setTradePositionCarouselApi} opts={{ align: 'start' }} className="mt-3">
              <CarouselContent className="-ml-0">
                {/* Next 7 Days */}
                <CarouselItem className="pl-0">
                  <div className="space-y-0 divide-y divide-border/60">
                    <div className="flex items-center gap-3 py-4">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--status-delivered)]/12 text-[var(--status-delivered)]">
                          <CurrencyInr size={17} weight="bold" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--status-delivered)] text-white">
                          <ArrowDown size={9} weight="bold" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-[20px] font-bold text-[var(--status-delivered)]">₹{data.tradePosition.next7Days.comingIn.toLocaleString('en-IN')}</span>
                          <span className="text-[15px] font-semibold text-foreground">Coming In</span>
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-0.5">from {data.tradePosition.next7Days.comingInOrders} orders</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 py-4">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                          <CurrencyInr size={17} weight="bold" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white">
                          <ArrowUp size={9} weight="bold" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-[20px] font-bold text-destructive">₹{data.tradePosition.next7Days.goingOut.toLocaleString('en-IN')}</span>
                          <span className="text-[15px] font-semibold text-foreground">Going Out</span>
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-0.5">for {data.tradePosition.next7Days.goingOutOrders} orders</p>
                      </div>
                    </div>
                  </div>
                  <p className="pt-2 text-center text-[11px] text-muted-foreground border-t border-border/60">Includes overdue amounts</p>
                </CarouselItem>

                {/* Next 30 Days */}
                <CarouselItem className="pl-0">
                  <div className="space-y-0 divide-y divide-border/60">
                    <div className="flex items-center gap-3 py-4">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--status-delivered)]/12 text-[var(--status-delivered)]">
                          <CurrencyInr size={17} weight="bold" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--status-delivered)] text-white">
                          <ArrowDown size={9} weight="bold" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-[20px] font-bold text-[var(--status-delivered)]">₹{data.tradePosition.next30Days.comingIn.toLocaleString('en-IN')}</span>
                          <span className="text-[15px] font-semibold text-foreground">Coming In</span>
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-0.5">from {data.tradePosition.next30Days.comingInOrders} orders</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 py-4">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                          <CurrencyInr size={17} weight="bold" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white">
                          <ArrowUp size={9} weight="bold" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-[20px] font-bold text-destructive">₹{data.tradePosition.next30Days.goingOut.toLocaleString('en-IN')}</span>
                          <span className="text-[15px] font-semibold text-foreground">Going Out</span>
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-0.5">for {data.tradePosition.next30Days.goingOutOrders} orders</p>
                      </div>
                    </div>
                  </div>
                  <p className="pt-2 text-center text-[11px] text-muted-foreground border-t border-border/60">Includes overdue amounts</p>
                </CarouselItem>

                {/* Past 7 Days */}
                <CarouselItem className="pl-0">
                  <div className="space-y-0 divide-y divide-border/60">
                    <div className="flex items-center gap-3 py-4">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--status-delivered)]/12 text-[var(--status-delivered)]">
                          <CurrencyInr size={17} weight="bold" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--status-delivered)] text-white">
                          <ArrowDown size={9} weight="bold" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-foreground">Money Received</p>
                        <p className="text-[22px] font-bold text-[var(--status-delivered)] leading-tight">₹{data.tradePosition.past7Days.moneyReceived.toLocaleString('en-IN')}</p>
                      </div>
                      <p className="text-[12px] text-muted-foreground flex-shrink-0">from {data.tradePosition.past7Days.receivedOrders} orders</p>
                    </div>

                    <div className="flex items-center gap-3 py-4">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                          <CurrencyInr size={17} weight="bold" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white">
                          <ArrowUp size={9} weight="bold" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-foreground">Money Paid</p>
                        <p className="text-[22px] font-bold text-foreground leading-tight">₹{data.tradePosition.past7Days.moneyPaid.toLocaleString('en-IN')}</p>
                      </div>
                      <p className="text-[12px] text-muted-foreground flex-shrink-0">to {data.tradePosition.past7Days.paidOrders} orders</p>
                    </div>
                  </div>
                </CarouselItem>

                {/* Past 30 Days */}
                <CarouselItem className="pl-0">
                  <div className="space-y-0 divide-y divide-border/60">
                    <div className="flex items-center gap-3 py-4">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--status-delivered)]/12 text-[var(--status-delivered)]">
                          <CurrencyInr size={17} weight="bold" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--status-delivered)] text-white">
                          <ArrowDown size={9} weight="bold" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-foreground">Money Received</p>
                        <p className="text-[22px] font-bold text-[var(--status-delivered)] leading-tight">₹{data.tradePosition.past30Days.moneyReceived.toLocaleString('en-IN')}</p>
                      </div>
                      <p className="text-[12px] text-muted-foreground flex-shrink-0">from {data.tradePosition.past30Days.receivedOrders} orders</p>
                    </div>

                    <div className="flex items-center gap-3 py-4">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                          <CurrencyInr size={17} weight="bold" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white">
                          <ArrowUp size={9} weight="bold" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-foreground">Money Paid</p>
                        <p className="text-[22px] font-bold text-foreground leading-tight">₹{data.tradePosition.past30Days.moneyPaid.toLocaleString('en-IN')}</p>
                      </div>
                      <p className="text-[12px] text-muted-foreground flex-shrink-0">to {data.tradePosition.past30Days.paidOrders} orders</p>
                    </div>
                  </div>
                </CarouselItem>
              </CarouselContent>
            </Carousel>
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
                const orderAmount = order.orderValue
                const paidAmount = order.totalPaid
                const dueAmount = Math.max(order.pendingAmount ?? (orderAmount - paidAmount), 0)
                const isOverdue = order.deliveredAt && order.calculatedDueDate && Date.now() > order.calculatedDueDate && order.settlementState !== 'Paid'
                const isDueToday = order.deliveredAt && order.calculatedDueDate && isToday(order.calculatedDueDate) && order.settlementState !== 'Paid'
                const isAwaitingAmount = orderAmount === 0 && order.lifecycleState === 'Placed'
                const dueStatus = isOverdue
                  ? { label: 'Overdue', color: 'var(--status-overdue)' }
                  : isDueToday
                    ? { label: 'Due today', color: 'var(--status-dispatched)' }
                    : null
                const topRightLabel = dueAmount > 0
                  ? { text: `${formatInrCurrency(dueAmount)} due`, color: 'var(--status-overdue)' }
                  : { text: 'Paid', color: 'var(--status-success)' }

                return (
                  <button
                    key={order.id}
                    onClick={() => onNavigateToConnection(order.connectionId, order.id)}
                    className="w-full text-left relative overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderRadius: 'var(--radius-card)',
                      padding: '14px 16px 14px 20px',
                      minHeight: '44px',
                    }}
                  >
                    <CardAccent color={statusColor} />
                    <div className="flex items-start justify-between">
                      <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flex: 1, marginRight: '12px' }}>
                        {order.itemSummary}
                      </p>
                      <div style={{ marginLeft: '12px', flexShrink: 0, textAlign: 'right' }}>
                        {isAwaitingAmount ? (
                          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-dispatched)' }}>Awaiting amount</p>
                        ) : orderAmount === 0 ? (
                          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Amount not recorded</p>
                        ) : (
                          <p style={{ fontSize: '15px', fontWeight: 700, color: topRightLabel.color }}>{topRightLabel.text}</p>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '4px' }} className="truncate">
                      {order.connectionName}
                    </p>
                    <div style={{ borderTop: '1px solid var(--border-section)', marginTop: '10px' }} />
                    {orderAmount > 0 && (
                      <div className="flex items-center justify-between mt-2" style={{ fontSize: '12px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Order <span style={{ color: 'var(--text-primary)' }}>{formatInrCurrency(orderAmount)}</span></span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Paid <span style={{ color: 'var(--text-primary)' }}>{formatInrCurrency(paidAmount)}</span></span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid var(--border-section)', marginTop: '10px' }} />
                    <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: statusColor,
                          backgroundColor: `${statusColor}26`,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-chip)',
                        }}
                      >
                        {order.lifecycleState}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>·</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500 }}>
                        {formatDistanceToNow(order.latestActivity, { addSuffix: true })}
                      </span>
                      {dueStatus && (
                        <>
                          <span style={{ color: 'var(--text-secondary)' }}>·</span>
                          <span style={{ color: dueStatus.color, fontSize: '11px', fontWeight: 600 }}>{dueStatus.label}</span>
                        </>
                      )}
                    </div>
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
