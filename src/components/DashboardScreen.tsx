import { ArrowDown, ArrowUp, CaretRight, CurrencyInr, ShieldWarning } from '@phosphor-icons/react'
import { CredibilityBadge } from '@/components/CredibilityBadge'
import { useEffect, useState } from 'react'
import { useBusinessOverviewData } from '@/hooks/data/use-business-data'
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from '@/components/ui/carousel'
import { OrderCard } from '@/components/order/OrderCard'

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
        <div className="px-4 flex items-start justify-between" style={{ paddingTop: '20px', paddingBottom: '16px' }}>
          <div>
            <h1 className="text-[20px] font-semibold" style={{ color: '#111' }}>{data.username ? `Welcome back, ${data.username}` : 'Welcome back'}</h1>
            <p className="text-[13px] font-normal mt-1" style={{ color: '#8A8A8A' }}>Your trade snapshot today</p>
          </div>
          {overview.credibility && overview.credibility.level !== 'none' && (
            <CredibilityBadge level={overview.credibility.level} />
          )}
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
                  <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, backgroundColor: '#E8E7E3' }}>📝</div>
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
                  <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, backgroundColor: '#FAEEDA' }}>🚚</div>
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
                  <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, backgroundColor: '#EAF3DE' }}>📦</div>
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
                  <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, backgroundColor: '#FCEBEB' }}>₹⏳</div>
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
              {recentOrders.map(order => (
                <OrderCard
                  key={order.id}
                  itemSummary={order.itemSummary}
                  connectionName={order.connectionName}
                  branchLabel={order.branchLabel}
                  contactName={order.contactName}
                  orderValue={order.orderValue}
                  pendingAmount={order.pendingAmount}
                  settlementState={order.settlementState}
                  lifecycleState={order.lifecycleState}
                  calculatedDueDate={order.calculatedDueDate}
                  deliveredAt={order.deliveredAt}
                  latestActivity={order.latestActivity}
                  paymentTermSnapshot={order.paymentTermSnapshot}
                  isBuyer={order.isBuyer}
                  onClick={() => onNavigateToConnection(order.connectionId, order.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
