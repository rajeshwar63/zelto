import { ArrowDown, ArrowUp, CaretRight, CurrencyInr, Hourglass, NotePencil, Package, ShieldWarning, Truck, UsersThree } from '@phosphor-icons/react'
import { CredibilityBadge } from '@/components/CredibilityBadge'
import { BadgeInfoSheet } from '@/components/BadgeInfoSheet'
import { ComplianceCard } from '@/components/ComplianceCard'
import { useState } from 'react'
import { useBusinessOverviewData } from '@/hooks/data/use-business-data'
import { OrderCard } from '@/components/order/OrderCard'

function formatINR(amount: number): string {
  return amount.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'INR',
  })
}

interface OrdersTabParams {
  role?: 'all' | 'buying' | 'selling'
  chip?: 'new' | 'accepted' | 'placed' | 'dispatched' | 'delivered' | 'paid' | 'overdue'
  dateToday?: boolean
}

interface Props {
  currentBusinessId: string
  onNavigateToOrders: (filter?: string, ordersParams?: OrdersTabParams) => void
  onNavigateToConnection: (connectionId: string, orderId?: string) => void
  onNavigateToProfile: () => void
  onNavigateToConnections: (filter?: string) => void
  onNavigateToAttention: (filter?: string) => void
  onNavigateToManageConnections?: () => void
  onNavigateToSupplierDocs?: (targetBusinessId: string, connectionId: string) => void
  isActive?: boolean
}

export function DashboardScreen({ currentBusinessId, onNavigateToOrders, onNavigateToConnection, onNavigateToProfile, onNavigateToConnections, onNavigateToAttention, onNavigateToManageConnections, onNavigateToSupplierDocs, isActive = true }: Props) {
  const [showBadgeInfo, setShowBadgeInfo] = useState(false)

  const { data: overview, isInitialLoading } = useBusinessOverviewData(currentBusinessId, isActive)
  const recentOrders = overview?.recentOrders ?? []
  const attentionCounts = overview?.attentionCounts ?? {
    accept: 0,
    dispatch: 0,
    confirmReceipt: 0,
    payNow: 0,
    awaitingDispatch: 0,
    awaitingPayment: 0,
    disputes: 0,
    pendingReceivedRequests: 0,
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
  }

  const toReceiveOrders = (overview.tradePosition?.next30Days?.comingInOrders ?? 0)
  const toPayOrders = (overview.tradePosition?.next30Days?.goingOutOrders ?? 0)
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 flex items-start justify-between" style={{ paddingTop: '20px', paddingBottom: '16px' }}>
          <div>
            <h1 className="text-[20px] font-semibold" style={{ color: '#111' }}>{data.username ? `Welcome back, ${data.username}` : 'Welcome back'}</h1>
            <p className="text-[13px] font-normal mt-1" style={{ color: '#8A8A8A' }}>Your trade snapshot today</p>
          </div>
          {overview.credibility && overview.credibility.level !== 'none' && (
            <div className="flex items-center gap-1">
              <CredibilityBadge level={overview.credibility.level} />
              <button
                onClick={() => setShowBadgeInfo(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: 'transparent',
                  border: '1.5px solid #AAAAAA',
                  color: '#AAAAAA',
                  fontSize: '10px',
                  fontWeight: '700',
                  lineHeight: 1,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label="What does my badge mean?"
              >
                i
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6 pb-24" style={{ backgroundColor: 'var(--bg-screen)' }}>
        {/* Trade Position — To Receive / To Pay */}
        <div className="grid grid-cols-2 gap-[10px]">
          {/* To Receive */}
          <div
            className="rounded-[14px] p-[14px] relative overflow-hidden cursor-pointer"
            style={{
              backgroundColor: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color, #E8ECF0)',
            }}
            onClick={() => onNavigateToOrders('selling', { role: 'selling' })}
          >
            {/* Decorative circle */}
            <div
              className="absolute"
              style={{
                top: -8,
                right: -8,
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: 'transparent',
              }}
            />

            {/* Icon + label row */}
            <div className="flex items-center gap-[6px] mb-[10px]">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  backgroundColor: 'var(--surface-secondary, #F5F7FA)',
                }}
              >
                <ArrowDown size={14} weight="bold" color="#22B573" />
              </div>
              <span
                className="text-[12px] font-semibold"
                style={{ color: 'var(--text-secondary, #8492A6)' }}
              >
                To receive
              </span>
            </div>

            {/* Amount */}
            <p
              className="text-[24px] font-extrabold m-0"
              style={{
                color: 'var(--status-delivered, #22B573)',
                letterSpacing: '-0.03em',
              }}
            >
              {formatINR(data.toReceive)}
            </p>

            {/* Order count */}
            <p
              className="text-[11px] font-medium mt-1 m-0"
              style={{ color: 'var(--text-secondary, #8492A6)' }}
            >
              from {toReceiveOrders} {toReceiveOrders === 1 ? 'order' : 'orders'}
            </p>
          </div>

          {/* To Pay */}
          <div
            className="rounded-[14px] p-[14px] relative overflow-hidden cursor-pointer"
            style={{
              backgroundColor: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color, #E8ECF0)',
            }}
            onClick={() => onNavigateToOrders('buying', { role: 'buying' })}
          >
            {/* Decorative circle */}
            <div
              className="absolute"
              style={{
                top: -8,
                right: -8,
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: 'transparent',
              }}
            />

            {/* Icon + label row */}
            <div className="flex items-center gap-[6px] mb-[10px]">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  backgroundColor: 'var(--surface-secondary, #F5F7FA)',
                }}
              >
                <ArrowUp size={14} weight="bold" color="#FF6B6B" />
              </div>
              <span
                className="text-[12px] font-semibold"
                style={{ color: 'var(--text-secondary, #8492A6)' }}
              >
                To pay
              </span>
            </div>

            {/* Amount */}
            <p
              className="text-[24px] font-extrabold m-0"
              style={{
                color: 'var(--status-overdue, #FF6B6B)',
                letterSpacing: '-0.03em',
              }}
            >
              {formatINR(data.toPay)}
            </p>

            {/* Order count */}
            <p
              className="text-[11px] font-medium mt-1 m-0"
              style={{ color: data.toPay === 0 ? 'var(--text-tertiary, #B0B8C4)' : 'var(--text-secondary, #8492A6)' }}
            >
              {toPayOrders === 0 ? '0 orders' : `from ${toPayOrders} ${toPayOrders === 1 ? 'order' : 'orders'}`}
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
            Needs Attention
          </h2>
          <div className="space-y-3">
            {attentionCounts.awaitingPayment > 0 && (
              <button
                onClick={() => onNavigateToOrders(undefined, { role: 'selling', chip: 'delivered' })}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderRight: '3px solid #22B573' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#E8F8F1' }}>
                    <CurrencyInr size={15} weight="regular" color="#22B573" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Collect payment</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: '#22B573' }}>{attentionCounts.awaitingPayment}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.accept > 0 && (
              <button
                onClick={() => onNavigateToOrders(undefined, { role: 'selling', chip: 'new' })}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderLeft: '3px solid #D97706' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF3E0' }}>
                    <NotePencil size={15} weight="regular" color="#D97706" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Accept incoming orders</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: '#D97706' }}>{attentionCounts.accept}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.dispatch > 0 && (
              <button
                onClick={() => onNavigateToOrders(undefined, { role: 'selling', chip: 'accepted' })}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderLeft: '3px solid #4A6CF7' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
                    <Truck size={15} weight="regular" color="#4A6CF7" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Dispatch now</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: '#4A6CF7' }}>{attentionCounts.dispatch}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.confirmReceipt > 0 && (
              <button
                onClick={() => onNavigateToOrders(undefined, { role: 'buying', chip: 'dispatched' })}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderLeft: '3px solid #0F6E56' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#E1F5EE' }}>
                    <Package size={15} weight="regular" color="#0F6E56" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Confirm receipt</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: '#0F6E56' }}>{attentionCounts.confirmReceipt}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.payNow > 0 && (
              <button
                onClick={() => onNavigateToOrders(undefined, { role: 'buying', chip: 'overdue' })}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderLeft: '3px solid #E24B4A' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FCEBEB' }}>
                    <Hourglass size={15} weight="regular" color="#E24B4A" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Pay now</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: '#E24B4A' }}>{attentionCounts.payNow}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.disputes > 0 && (
              <button
                onClick={() => onNavigateToAttention('disputes')}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderLeft: '3px solid #8B5CF6' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5F0FF' }}>
                    <ShieldWarning size={15} weight="regular" color="#8B5CF6" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Respond to disputes</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: '#8B5CF6' }}>{attentionCounts.disputes}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.awaitingDispatch > 0 && (
              <button
                onClick={() => onNavigateToOrders(undefined, { role: 'buying', chip: 'placed' })}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderRight: '3px solid #4A6CF7' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
                    <Truck size={15} weight="regular" color="#4A6CF7" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Supplier yet to dispatch</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: '#4A6CF7' }}>{attentionCounts.awaitingDispatch}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.pendingReceivedRequests > 0 && onNavigateToManageConnections && (
              <button
                onClick={onNavigateToManageConnections}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderLeft: '3px solid #4A6CF7' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
                    <UsersThree size={15} weight="regular" color="#4A6CF7" />
                  </div>
                  <p className="text-[14px] text-foreground font-semibold">Review connection requests</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: '#4A6CF7' }}>{attentionCounts.pendingReceivedRequests}</span>
                  <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )}

            {attentionCounts.accept === 0 &&
              attentionCounts.dispatch === 0 &&
              attentionCounts.confirmReceipt === 0 &&
              attentionCounts.payNow === 0 &&
              attentionCounts.awaitingDispatch === 0 &&
              attentionCounts.awaitingPayment === 0 &&
              attentionCounts.disputes === 0 &&
              attentionCounts.pendingReceivedRequests === 0 && (
                <div className="bg-white border border-border rounded-xl px-4 py-6 text-center">
                  <p className="text-[13px] text-muted-foreground">All caught up — nothing needs attention right now.</p>
                </div>
              )}
          </div>
        </div>

        {onNavigateToSupplierDocs && (
          <ComplianceCard
            currentBusinessId={currentBusinessId}
            onNavigateToSupplierDocs={onNavigateToSupplierDocs}
          />
        )}

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
                  isBuyer={order.isBuyer}
                  onClick={() => onNavigateToConnection(order.connectionId, order.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {showBadgeInfo && overview.credibility && (
        <BadgeInfoSheet
          currentLevel={overview.credibility.level}
          missingItems={overview.credibility.missingItems}
          onClose={() => setShowBadgeInfo(false)}
          onCompleteProfile={() => {
            setShowBadgeInfo(false)
            onNavigateToProfile()
          }}
        />
      )}
    </div>
  )
}
