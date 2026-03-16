import { useState, useCallback } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { startOfDay, isToday, isSameDay } from 'date-fns'

export type StatusChip = 'placed' | 'dispatched' | 'delivered' | 'payment_pending' | 'paid'

export interface OrderFilters {
  searchText: string
  activeChips: Set<StatusChip>
  fromDate: Date | null
  toDate: Date | null
}

export const CHIP_LABELS: Record<StatusChip, string> = {
  placed: 'Placed',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  payment_pending: 'Due',
  paid: 'Paid',
}

const CHIP_COLORS: Record<StatusChip, string> = {
  placed: 'var(--brand-primary)',
  dispatched: 'var(--status-dispatched)',
  delivered: 'var(--status-delivered)',
  payment_pending: 'var(--status-overdue)',
  paid: 'var(--status-success)',
}

const ALL_CHIPS: StatusChip[] = ['placed', 'dispatched', 'delivered', 'payment_pending', 'paid']

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  return cells
}

function isInRange(date: Date, from: Date, to: Date): boolean {
  return startOfDay(date) > startOfDay(from) && startOfDay(date) < startOfDay(to)
}

function isDisabled(date: Date): boolean {
  return startOfDay(date) > startOfDay(new Date())
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface OrderSearchPanelProps {
  filters: OrderFilters
  onFiltersChange: (filters: OrderFilters) => void
  placeholder?: string
}

export function OrderSearchPanel({ filters, onFiltersChange, placeholder = 'Search orders…' }: OrderSearchPanelProps) {
  const [calOpen, setCalOpen] = useState(false)
  const [calMode, setCalMode] = useState<'from' | 'to' | null>(null)
  const [calView, setCalView] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  })

  const { searchText, activeChips, fromDate, toDate } = filters

  const update = useCallback((patch: Partial<OrderFilters>) => {
    onFiltersChange({ ...filters, ...patch })
  }, [filters, onFiltersChange])

  const toggleChip = useCallback((chip: StatusChip) => {
    const next = new Set(activeChips)
    if (next.has(chip)) next.delete(chip)
    else next.add(chip)
    update({ activeChips: next })
  }, [activeChips, update])

  const handleFromClick = () => {
    setCalMode('from')
    setCalOpen(true)
  }

  const handleToClick = () => {
    setCalMode(fromDate ? 'to' : 'from')
    setCalOpen(true)
  }

  const handleDayClick = (date: Date) => {
    if (isDisabled(date)) return

    if (calMode === 'from') {
      update({ fromDate: date, toDate: null })
      setCalMode('to')
    } else if (calMode === 'to') {
      if (fromDate && startOfDay(date) < startOfDay(fromDate)) {
        update({ fromDate: date, toDate: null })
        // stay in 'to' mode
      } else {
        update({ toDate: date })
        setCalOpen(false)
        setCalMode(null)
      }
    }
  }

  const clearDates = () => {
    update({ fromDate: null, toDate: null })
    setCalOpen(false)
    setCalMode(null)
  }

  const prevMonth = () => {
    const d = new Date(calView.year, calView.month - 1, 1)
    setCalView({ year: d.getFullYear(), month: d.getMonth() })
  }

  const nextMonth = () => {
    const d = new Date(calView.year, calView.month + 1, 1)
    setCalView({ year: d.getFullYear(), month: d.getMonth() })
  }

  const grid = getMonthGrid(calView.year, calView.month)

  return (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: calOpen ? '700px' : '420px',
        backgroundColor: 'var(--bg-header)',
        borderBottom: '1px solid var(--border-light)',
        transition: 'max-height 420ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div style={{ position: 'relative', padding: '10px 16px 12px' }}>
        {/* Search bar */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <MagnifyingGlass
            size={18}
            weight="regular"
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={searchText}
            onChange={e => update({ searchText: e.target.value })}
            placeholder={placeholder}
            style={{
              width: '100%',
              paddingLeft: '34px',
              paddingRight: searchText ? '34px' : '10px',
              paddingTop: '8px',
              paddingBottom: '8px',
              fontSize: '14px',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-screen)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-input)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {searchText && (
            <button
              onClick={() => update({ searchText: '' })}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '4px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        {/* Status chips */}
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            STATUS
          </p>
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            {ALL_CHIPS.map(chip => {
              const isActive = activeChips.has(chip)
              return (
                <button
                  key={chip}
                  onClick={() => toggleChip(chip)}
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: '20px',
                    border: `1.5px solid ${isActive ? CHIP_COLORS[chip] : 'var(--border-light)'}`,
                    backgroundColor: isActive ? CHIP_COLORS[chip] + '22' : 'transparent',
                    color: isActive ? CHIP_COLORS[chip] : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                  }}
                >
                  {CHIP_LABELS[chip]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Date range */}
        <div>
          <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            DATE RANGE
          </p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: calOpen ? '10px' : 0 }}>
            <button
              onClick={handleFromClick}
              style={{
                flex: 1,
                padding: '7px 10px',
                fontSize: '13px',
                fontWeight: fromDate ? 600 : 400,
                color: fromDate ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: 'var(--bg-screen)',
                border: `1.5px solid ${fromDate ? 'var(--brand-primary)' : 'var(--border-light)'}`,
                borderRadius: 'var(--radius-input)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {fromDate ? formatDateShort(fromDate) : 'Select date'}
            </button>
            <button
              onClick={handleToClick}
              style={{
                flex: 1,
                padding: '7px 10px',
                fontSize: '13px',
                fontWeight: toDate ? 600 : 400,
                color: toDate ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: 'var(--bg-screen)',
                border: `1.5px solid ${toDate ? 'var(--brand-primary)' : 'var(--border-light)'}`,
                borderRadius: 'var(--radius-input)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {toDate ? formatDateShort(toDate) : 'Select date'}
            </button>
          </div>

          {/* Inline calendar */}
          {calOpen && (
            <div
              style={{
                overflow: 'hidden',
                maxHeight: '280px',
                transition: 'max-height 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                backgroundColor: 'var(--bg-screen)',
                borderRadius: 'var(--radius-card)',
                border: '1px solid var(--border-light)',
                padding: '12px',
              }}
            >
              {/* Month header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <button
                  onClick={prevMonth}
                  style={{ padding: '4px 8px', fontSize: '16px', color: 'var(--text-primary)', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  ‹
                </button>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {MONTH_NAMES[calView.month]} {calView.year}
                </span>
                <button
                  onClick={nextMonth}
                  style={{ padding: '4px 8px', fontSize: '16px', color: 'var(--text-primary)', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  ›
                </button>
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
                {DAY_NAMES.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {grid.map((date, i) => {
                  if (!date) return <div key={`e-${i}`} />
                  const disabled = isDisabled(date)
                  const isFrom = fromDate ? isSameDay(date, fromDate) : false
                  const isTo = toDate ? isSameDay(date, toDate) : false
                  const inRange = fromDate && toDate ? isInRange(date, fromDate, toDate) : false
                  const today = isToday(date)
                  const isSingle = isFrom && isTo

                  let bgColor = 'transparent'
                  let textColor = disabled ? 'var(--text-tertiary)' : 'var(--text-primary)'
                  let borderRadius = '50%'
                  let fontWeight: number = today ? 700 : 400

                  if (isFrom || isTo || isSingle) {
                    bgColor = 'var(--brand-primary)'
                    textColor = '#FFFFFF'
                    fontWeight = 600
                  } else if (inRange) {
                    bgColor = 'rgba(74, 108, 247, 0.15)'
                    borderRadius = '0'
                  }

                  if (isFrom && !isSingle && toDate) borderRadius = '50% 0 0 50%'
                  if (isTo && !isSingle && fromDate) borderRadius = '0 50% 50% 0'
                  if (isSingle) borderRadius = '50%'

                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => handleDayClick(date)}
                      disabled={disabled}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 0',
                        backgroundColor: bgColor,
                        borderRadius,
                        cursor: disabled ? 'default' : 'pointer',
                        border: 'none',
                        minHeight: '32px',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight, color: textColor, lineHeight: 1 }}>
                        {date.getDate()}
                      </span>
                      {today && !isFrom && !isTo && (
                        <span style={{ display: 'block', width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--brand-primary)', marginTop: '2px' }} />
                      )}
                    </button>
                  )
                })}
              </div>

              {(fromDate || toDate) && (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                  <button
                    onClick={clearDates}
                    style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline' }}
                  >
                    Clear dates
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
