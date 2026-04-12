import type { CollectionItem } from '@/lib/intelligence-engine'
import { formatInrCurrency } from '@/lib/utils'

interface Props {
  items: CollectionItem[]
  loading: boolean
  onTapItem: (connectionId: string) => void
}

const RANK_STYLES: Record<number, { bg: string; text: string }> = {
  1: { bg: '#FEF2F2', text: '#B91C1C' },
  2: { bg: '#FFFBEB', text: '#B45309' },
  3: { bg: '#EFF6FF', text: '#1D4ED8' },
}

export function CollectionPriorityCard({ items, loading, onTapItem }: Props) {
  if (loading) {
    return (
      <div>
        <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
          Follow Up Today
        </h2>
        <div className="bg-white border border-border rounded-xl px-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`flex gap-2.5 py-[10px] ${i < 2 ? 'border-b border-border' : ''}`}
            >
              <div className="w-5 h-5 rounded-full bg-[#E8ECF2] animate-pulse flex-shrink-0" />
              <div className="flex-1 flex flex-col gap-1">
                <div className="h-[13px] w-28 bg-[#E8ECF2] rounded animate-pulse" />
                <div className="h-[11px] w-36 bg-[#E8ECF2] rounded animate-pulse" />
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="h-[14px] w-16 bg-[#E8ECF2] rounded animate-pulse" />
                <div className="h-[11px] w-14 bg-[#E8ECF2] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) return null

  const visibleItems = items.slice(0, 3)

  return (
    <div>
      <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-3">
        Follow Up Today
      </h2>
      <div className="bg-white border border-border rounded-xl px-4">
        {visibleItems.map((item, i) => {
          const rank = i + 1
          const style = RANK_STYLES[rank] ?? RANK_STYLES[3]
          const isOverdue = item.daysOverdue > 0

          return (
            <button
              key={item.connectionId}
              onClick={() => onTapItem(item.connectionId)}
              className={`w-full flex gap-2.5 py-[10px] text-left ${i < visibleItems.length - 1 ? 'border-b border-border' : ''}`}
              style={{ background: 'transparent', border: 'none', padding: '10px 0' }}
            >
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: style.bg,
                  color: style.text,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {rank}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground m-0 truncate">
                  {item.businessName}
                </p>
                <p className="text-[11px] text-muted-foreground m-0 mt-0.5 truncate">
                  {item.patternDetail}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p
                  className="text-[14px] font-medium m-0"
                  style={{ color: isOverdue ? '#E05555' : '#D97706' }}
                >
                  {formatInrCurrency(item.overdueAmount)}
                </p>
                <p
                  className="text-[11px] m-0 mt-0.5"
                  style={{ color: isOverdue ? '#E05555' : 'var(--text-secondary)' }}
                >
                  {isOverdue ? `${item.daysOverdue}d overdue` : `Due in ${Math.abs(item.daysOverdue)}d`}
                </p>
              </div>
            </button>
          )
        })}
        {items.length > 3 && (
          <div className="py-2 text-center">
            <span className="text-[12px] font-medium" style={{ color: 'var(--brand-primary, #4A6CF7)' }}>
              View all collections &rarr;
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
