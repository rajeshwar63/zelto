import { CaretRight, CheckCircle, ClockClockwise, Package, ShieldWarning, Truck } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useBusinessOverviewData } from '@/hooks/data/use-business-data'
import { getLifecycleStatusColor } from '@/lib/semantic-colors'
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

  const firstName = (overview.username ?? '').trim().split(/\s+/)[0] ?? ''

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
      next7Days: { comingIn: 0, goingOut: 0, net: 0 },
      next30Days: { comingIn: 0, goingOut: 0, net: 0 },
      past7Days: { moneyPaid: 0, moneyReceived: 0 },
      past30Days: { moneyPaid: 0, moneyReceived: 0 },
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

            <Carousel setApi={setTradePositionCarouselApi} opts={{ align: 'start' }}>
              <CarouselContent className="-ml-0">
                <CarouselItem className="pl-0">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-3">Next 7 Days</p>
                    <p className="text-[11px] text-muted-foreground mb-3">Includes overdue amount</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Coming In</p>
                        <p className="text-[14px] font-semibold text-[var(--status-delivered)]">₹{data.tradePosition.next7Days.comingIn.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Going Out</p>
                        <p className="text-[14px] font-semibold text-[var(--status-overdue)]">₹{data.tradePosition.next7Days.goingOut.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Net</p>
                        <p className={`text-[14px] font-semibold ${data.tradePosition.next7Days.net >= 0 ? 'text-[var(--status-delivered)]' : 'text-destructive'}`}>
                          {data.tradePosition.next7Days.net >= 0 ? '+' : '-'}₹{Math.abs(data.tradePosition.next7Days.net).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>
                </CarouselItem>

                <CarouselItem className="pl-0">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-3">Next 30 Days</p>
                    <p className="text-[11px] text-muted-foreground mb-3">Includes overdue amount</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Coming In</p>
                        <p className="text-[14px] font-semibold text-[var(--status-delivered)]">₹{data.tradePosition.next30Days.comingIn.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Going Out</p>
                        <p className="text-[14px] font-semibold text-[var(--status-overdue)]">₹{data.tradePosition.next30Days.goingOut.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Net</p>
                        <p className={`text-[14px] font-semibold ${data.tradePosition.next30Days.net >= 0 ? 'text-[var(--status-delivered)]' : 'text-destructive'}`}>
                          {data.tradePosition.next30Days.net >= 0 ? '+' : '-'}₹{Math.abs(data.tradePosition.next30Days.net).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>
                </CarouselItem>

                <CarouselItem className="pl-0">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-3">Past 7 Days</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Money Paid</p>
                        <p className="text-[14px] font-semibold text-[var(--status-overdue)]">₹{data.tradePosition.past7Days.moneyPaid.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Money Received</p>
                        <p className="text-[14px] font-semibold text-[var(--status-delivered)]">₹{data.tradePosition.past7Days.moneyReceived.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>
                </CarouselItem>

                <CarouselItem className="pl-0">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-3">Past 30 Days</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Money Paid</p>
                        <p className="text-[14px] font-semibold text-[var(--status-overdue)]">₹{data.tradePosition.past30Days.moneyPaid.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-muted-foreground">Money Received</p>
                        <p className="text-[14px] font-semibold text-[var(--status-delivered)]">₹{data.tradePosition.past30Days.moneyReceived.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              </CarouselContent>
            </Carousel>

            <div className="mt-4 flex items-center justify-center gap-2">
              {[0, 1, 2, 3].map(slideIndex => (
                <button
                  key={slideIndex}
                  type="button"
                  onClick={() => tradePositionCarouselApi?.scrollTo(slideIndex)}
                  className="h-2 w-2 rounded-full transition-colors"
                  style={{ backgroundColor: activeTradePositionSlide === slideIndex ? '#6B7280' : '#D1D5DB' }}
                  aria-label={`Go to ${slideIndex === 0 ? 'next 7 days' : slideIndex === 1 ? 'next 30 days' : slideIndex === 2 ? 'past 7 days' : 'past 30 days'} trade position`}
                />
              ))}
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
