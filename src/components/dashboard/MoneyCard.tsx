import { useState } from 'react'
import type { CashForecast, CollectionItem, ConcentrationRisk, PaymentCalendarItem } from '@/lib/intelligence-engine'
import { formatInrCurrency } from '@/lib/utils'
import { CaretRight } from '@phosphor-icons/react'

interface Props {
  forecast: CashForecast | null
  collectionItems: CollectionItem[]
  concentrationRisk: ConcentrationRisk | null
  paymentCalendar?: PaymentCalendarItem[]
  loading: boolean
  onTapCollectionItem: (connectionId: string) => void
  onTapPaymentItem?: (connectionId: string) => void
  onTapForecastRow?: (type: 'inflow' | 'outflow', label: string) => void
}

const RANK_STYLES: Record<number, { bg: string; text: string }> = {
  1: { bg: '#FEF2F2', text: '#B91C1C' },
  2: { bg: '#FFFBEB', text: '#B45309' },
  3: { bg: '#EFF6FF', text: '#1D4ED8' },
}

export function MoneyCard({ forecast, collectionItems, concentrationRisk, paymentCalendar, loading, onTapCollectionItem, onTapPaymentItem, onTapForecastRow }: Props) {
  const [activeTab, setActiveTab] = useState<'collect' | 'forecast' | 'risk'>('collect')

  // Compute if tabs have data (for badge counts and empty states)
  const collectCount = collectionItems.length
  const hasForecasts = forecast !== null && (forecast.inflows.length > 0 || forecast.outflows.length > 0)
  const hasRisk = concentrationRisk !== null && concentrationRisk.percentage > 50

  // Determine which priority view to show
  const showBuyerPriority = collectionItems.length === 0 && (paymentCalendar?.length ?? 0) > 0
  const priorityCount = showBuyerPriority
    ? Math.min(paymentCalendar?.length ?? 0, 3)
    : (collectionItems.length > 0 ? Math.min(collectionItems.length, 3) : 0)

  // If nothing to show at all and not loading, don't render
  if (!loading && collectCount === 0 && (paymentCalendar?.length ?? 0) === 0 && !hasForecasts && !hasRisk) return null

  // Loading skeleton
  if (loading) {
    return (
      <div>
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '14px',
          border: '1px solid var(--border-color, #E8ECF0)',
          overflow: 'hidden',
        }}>
          {/* Tab skeleton */}
          <div style={{
            display: 'flex', padding: '4px', margin: '10px 12px 0',
            backgroundColor: '#F2F4F8', borderRadius: '10px',
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ flex: 1, height: 32, borderRadius: 8 }} />
            ))}
          </div>
          {/* Content skeleton */}
          <div style={{ padding: '12px 16px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                borderBottom: i < 2 ? '1px solid #F2F4F8' : 'none',
              }}>
                <div>
                  <div style={{ height: 13, width: 100, backgroundColor: '#E8ECF2', borderRadius: 4 }} className="animate-pulse" />
                  <div style={{ height: 11, width: 140, backgroundColor: '#E8ECF2', borderRadius: 4, marginTop: 4 }} className="animate-pulse" />
                </div>
                <div style={{ height: 14, width: 60, backgroundColor: '#E8ECF2', borderRadius: 4 }} className="animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const tabs: Array<{ id: 'collect' | 'forecast' | 'risk'; label: string; count?: number }> = [
    { id: 'collect', label: 'Priority', count: priorityCount > 0 ? priorityCount : undefined },
    { id: 'forecast', label: 'Cash Forecast' },
    { id: 'risk', label: 'Exposure' },
  ]

  return (
    <div>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '14px',
        border: '1px solid var(--border-color, #E8ECF0)',
        overflow: 'hidden',
      }}>
        {/* Segmented tab bar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '4px', margin: '10px 12px 0',
          backgroundColor: '#F2F4F8', borderRadius: '10px',
        }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, padding: '7px 0',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: activeTab === t.id ? 600 : 400,
                color: activeTab === t.id ? '#0F1320' : '#8492A6',
                backgroundColor: activeTab === t.id ? '#FFFFFF' : 'transparent',
                border: activeTab === t.id ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
                boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              }}
            >
              {t.label}
              {t.count !== undefined && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, color: '#FFFFFF',
                  backgroundColor: activeTab === t.id ? '#E24B4A' : '#8492A6',
                  borderRadius: '4px', padding: '1px 5px',
                  lineHeight: '14px',
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Collect Tab */}
        {activeTab === 'collect' && (
          <div style={{ padding: '12px 16px' }}>
            {showBuyerPriority ? (
              /* Buyer Priority: Payment Calendar */
              <>
                {paymentCalendar!.slice(0, 3).map((item, i, arr) => {
                  const isOverdue = item.daysUntilDue < 0
                  const isDueSoon = item.daysUntilDue >= 0 && item.daysUntilDue <= 3
                  const rank = i + 1
                  const rankStyle = RANK_STYLES[rank] ?? RANK_STYLES[3]

                  return (
                    <button
                      key={item.orderId}
                      onClick={() => onTapPaymentItem?.(item.connectionId)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '10px 0', textAlign: 'left',
                        background: 'none', border: 'none', cursor: 'pointer',
                        borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                      }}
                    >
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '7px',
                        backgroundColor: rankStyle.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 700, color: rankStyle.text,
                        flexShrink: 0, marginTop: '1px',
                      }}>
                        {rank}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F1320', margin: 0 }}>
                          {item.supplierName}
                        </p>
                        <p style={{ fontSize: '11px', color: '#8492A6', margin: '1px 0 0' }}>
                          {isOverdue
                            ? `${Math.abs(item.daysUntilDue)}d overdue`
                            : isDueSoon
                            ? `Due in ${item.daysUntilDue}d`
                            : `Due in ${item.daysUntilDue} days`}
                          {item.trustScoreIfLate !== null && item.trustScoreIfOnTime !== null && item.trustScoreIfLate < item.trustScoreIfOnTime
                            ? ' · Late payment affects trust score'
                            : ''}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{
                          fontSize: '14px', fontWeight: 600, margin: 0,
                          color: isOverdue ? '#E24B4A' : isDueSoon ? '#D97706' : '#0F1320',
                        }}>
                          {formatInrCurrency(item.amount)}
                        </p>
                        <p style={{
                          fontSize: '11px', margin: '1px 0 0',
                          color: isOverdue ? '#E24B4A' : '#8492A6',
                          opacity: 0.8,
                        }}>
                          {isOverdue ? 'overdue' : `Due ${new Date(item.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </>
            ) : collectionItems.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#8492A6', margin: 0 }}>No pending priorities</p>
              </div>
            ) : (
              /* Supplier Priority: Collection Items */
              <>
                {collectionItems.slice(0, 3).map((item, i, arr) => {
                  const rank = i + 1
                  const style = RANK_STYLES[rank] ?? RANK_STYLES[3]
                  const isOverdue = item.daysOverdue > 0

                  return (
                    <button
                      key={item.connectionId}
                      onClick={() => onTapCollectionItem(item.connectionId)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '10px 0', textAlign: 'left',
                        background: 'none', border: 'none', cursor: 'pointer',
                        borderBottomWidth: i < arr.length - 1 ? '1px' : '0',
                        borderBottomStyle: 'solid',
                        borderBottomColor: 'rgba(0,0,0,0.04)',
                      }}
                    >
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '7px',
                        backgroundColor: style.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 700, color: style.text,
                        flexShrink: 0, marginTop: '1px',
                      }}>
                        {rank}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F1320', margin: 0 }}>
                          {item.businessName}
                        </p>
                        <p style={{ fontSize: '11px', color: '#8492A6', margin: '1px 0 0' }}>
                          {item.patternDetail}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{
                          fontSize: '14px', fontWeight: 600, margin: 0,
                          color: '#22B573',
                        }}>
                          {formatInrCurrency(item.overdueAmount)}
                        </p>
                        <p style={{
                          fontSize: '11px', margin: '1px 0 0',
                          color: isOverdue ? '#E24B4A' : '#22B573',
                          opacity: 0.8,
                        }}>
                          {isOverdue ? `${item.daysOverdue}d overdue` : `Due in ${Math.abs(item.daysOverdue)}d`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* Forecast Tab */}
        {activeTab === 'forecast' && (
          <div style={{ padding: '12px 16px' }}>
            {!hasForecasts ? (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#8492A6', margin: 0 }}>No forecast data yet</p>
              </div>
            ) : (
              <>
                {forecast!.inflows.map((bucket, i, arr) => (
                  <div
                    key={`in-${i}`}
                    onClick={() => onTapForecastRow?.('inflow', bucket.label)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '11px 0',
                      borderBottom: (i < arr.length - 1 || forecast!.outflows.length > 0) ? '1px solid rgba(0,0,0,0.04)' : 'none',
                      cursor: onTapForecastRow ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#0F1320', margin: 0 }}>
                        Inflow — {bucket.label}
                      </p>
                      <p style={{ fontSize: '11px', color: '#8492A6', margin: '2px 0 0' }}>
                        {bucket.detail}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{
                        fontSize: '14px', fontWeight: 600, margin: 0,
                        color: '#22B573',
                      }}>
                        {formatInrCurrency(bucket.amount)}
                      </p>
                      {onTapForecastRow && (
                        <CaretRight size={14} color="#8492A6" />
                      )}
                    </div>
                  </div>
                ))}

                {forecast!.outflows.map((bucket, i) => (
                  <div
                    key={`out-${i}`}
                    onClick={() => onTapForecastRow?.('outflow', bucket.label)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '11px 0',
                      borderBottom: i < forecast!.outflows.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                      cursor: onTapForecastRow ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#0F1320', margin: 0 }}>
                        Outflow — {bucket.label}
                      </p>
                      <p style={{ fontSize: '11px', color: '#8492A6', margin: '2px 0 0' }}>
                        {bucket.detail}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#E24B4A', margin: 0 }}>
                        {formatInrCurrency(bucket.amount)}
                      </p>
                      {onTapForecastRow && (
                        <CaretRight size={14} color="#8492A6" />
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Risk Tab */}
        {activeTab === 'risk' && (
          <div style={{ padding: '12px 16px' }}>
            {!hasRisk ? (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#8492A6', margin: 0 }}>No concentration risk detected</p>
              </div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F1320', margin: 0 }}>
                    {concentrationRisk!.topBusinessName}
                  </p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#D97706', margin: 0 }}>
                    {concentrationRisk!.percentage}%
                  </p>
                </div>
                <p style={{ fontSize: '11px', color: '#8492A6', margin: '0 0 8px' }}>
                  {concentrationRisk!.percentage}% of your {concentrationRisk!.type === 'receivable' ? 'receivables' : 'payables'} to 1 {concentrationRisk!.type === 'receivable' ? 'buyer' : 'supplier'}
                </p>
                <div style={{
                  height: '5px', borderRadius: '3px',
                  backgroundColor: '#F2F4F8', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: '3px',
                    width: `${concentrationRisk!.percentage}%`,
                    backgroundColor: '#D97706',
                  }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
