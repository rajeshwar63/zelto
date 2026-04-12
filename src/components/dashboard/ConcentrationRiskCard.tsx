import type { ConcentrationRisk } from '@/lib/intelligence-engine'

interface Props {
  risk: ConcentrationRisk | null
  loading: boolean
}

export function ConcentrationRiskCard({ risk, loading }: Props) {
  if (loading) {
    return (
      <div>
        <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
          Concentration Risk
        </h2>
        <div className="bg-white border border-border rounded-xl px-4 py-3">
          <div className="flex justify-between items-center mb-2">
            <div className="h-[13px] w-28 bg-[#E8ECF2] rounded animate-pulse" />
            <div className="h-[13px] w-10 bg-[#E8ECF2] rounded animate-pulse" />
          </div>
          <div className="h-[11px] w-48 bg-[#E8ECF2] rounded animate-pulse mb-3" />
          <div className="h-1 w-full bg-[#E8ECF2] rounded-full animate-pulse" />
        </div>
      </div>
    )
  }

  if (!risk || risk.percentage <= 50) return null

  const typeLabel = risk.type === 'receivable' ? 'receivables' : 'payables'
  const connectionCount = risk.type === 'receivable' ? 'buyer' : 'supplier'

  return (
    <div>
      <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
        Concentration Risk
      </h2>
      <div className="bg-white border border-border rounded-xl px-4 py-3">
        <div className="flex justify-between items-center">
          <p className="text-[13px] font-medium text-foreground m-0">
            {risk.topBusinessName}
          </p>
          <p className="text-[13px] font-medium m-0" style={{ color: '#D97706' }}>
            {risk.percentage}%
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground m-0 mt-1">
          {risk.percentage}% of your {typeLabel} to 1 {connectionCount}
        </p>
        <div
          className="mt-3 rounded-full overflow-hidden"
          style={{ height: 4, backgroundColor: 'var(--border-light, #E8ECF2)' }}
        >
          <div
            className="rounded-full"
            style={{
              height: 4,
              width: `${risk.percentage}%`,
              backgroundColor: '#D97706',
            }}
          />
        </div>
      </div>
    </div>
  )
}
