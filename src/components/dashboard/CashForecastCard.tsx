import type { CashForecast } from '@/lib/intelligence-engine'
import { formatInrCurrency } from '@/lib/utils'

interface Props {
  forecast: CashForecast | null
  loading: boolean
}

export function CashForecastCard({ forecast, loading }: Props) {
  if (loading) {
    return (
      <div>
        <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
          Cash Forecast
        </h2>
        <div className="bg-white border border-border rounded-xl px-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex justify-between py-[10px] ${i < 3 ? 'border-b border-border' : ''}`}
            >
              <div className="flex flex-col gap-1">
                <div className="h-[13px] w-24 bg-[#E8ECF2] rounded animate-pulse" />
                <div className="h-[11px] w-32 bg-[#E8ECF2] rounded animate-pulse" />
              </div>
              <div className="h-[14px] w-16 bg-[#E8ECF2] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!forecast) return null

  const allRows = [
    ...forecast.inflows.map((bucket) => ({
      label: `Inflow — ${bucket.label}`,
      sublabel: bucket.detail,
      amount: bucket.amount,
      colorType: 'green',
    })),
    ...forecast.outflows.map((bucket) => ({
      label: `Outflow — ${bucket.label}`,
      sublabel: bucket.detail,
      amount: bucket.amount,
      colorType: 'red' as const,
    })),
  ]

  if (allRows.length === 0 || allRows.every((r) => r.amount === 0)) return null

  const getAmountColor = (type: string) => {
    if (type === 'green') return '#22B573'
    if (type === 'red') return '#E05555'
    return '#D97706'
  }

  return (
    <div>
      <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
        Cash Forecast
      </h2>
      <div className="bg-white border border-border rounded-xl px-4">
        {allRows.map((row, i) => (
          <div
            key={i}
            className={`flex justify-between items-center py-[10px] ${i < allRows.length - 1 ? 'border-b border-border' : ''}`}
          >
            <div>
              <p className="text-[13px] text-foreground m-0">{row.label}</p>
              <p className="text-[11px] text-muted-foreground m-0 mt-0.5">{row.sublabel}</p>
            </div>
            <p
              className="text-[14px] font-medium m-0"
              style={{ color: getAmountColor(row.colorType) }}
            >
              {formatInrCurrency(row.amount)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
