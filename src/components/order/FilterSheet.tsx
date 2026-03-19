import { motion, AnimatePresence } from 'framer-motion'
import {
  type StatusChip,
  type RoleFilter,
  CHIPS_BY_ROLE,
  CHIP_LABELS,
  CHIP_COLORS,
} from '@/components/order/OrderSearchPanel'

interface FilterSheetProps {
  open: boolean
  onClose: () => void
  activeChips: Set<StatusChip>
  onToggleChip: (chip: StatusChip) => void
  onClearAll: () => void
  roleFilter: RoleFilter
}

export function FilterSheet({ open, onClose, activeChips, onToggleChip, onClearAll, roleFilter }: FilterSheetProps) {
  const visibleChips = CHIPS_BY_ROLE[roleFilter]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-muted rounded-full" />
            </div>

            <div className="px-4 pb-4">
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
              }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Filter orders
                </h3>
                <button
                  onClick={onClearAll}
                  style={{
                    fontSize: '13px',
                    color: 'var(--brand-primary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Clear all
                </button>
              </div>

              {/* Status section */}
              <p style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '10px',
              }}>
                Status
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {visibleChips.map(chip => {
                  const isActive = activeChips.has(chip)
                  return (
                    <button
                      key={chip}
                      onClick={() => onToggleChip(chip)}
                      style={{
                        fontSize: '13px',
                        padding: '6px 14px',
                        borderRadius: 999,
                        border: isActive ? 'none' : '0.5px solid var(--border-light)',
                        background: isActive ? getStatusChipBackground(chip) : 'transparent',
                        color: isActive ? getStatusChipColor(chip) : 'var(--text-secondary)',
                        fontWeight: isActive ? 500 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {CHIP_LABELS[chip]}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function getStatusChipBackground(status: StatusChip): string {
  switch (status) {
    case 'new':
    case 'accepted':
    case 'placed':
      return 'rgba(74, 108, 247, 0.1)'
    case 'dispatched':
      return 'rgba(255, 140, 66, 0.1)'
    case 'delivered':
    case 'paid':
      return 'rgba(34, 181, 115, 0.1)'
    case 'overdue':
      return 'rgba(255, 107, 107, 0.1)'
    default:
      return 'var(--bg-screen)'
  }
}

function getStatusChipColor(status: StatusChip): string {
  switch (status) {
    case 'new':
    case 'accepted':
    case 'placed':
      return 'var(--status-new, #4A6CF7)'
    case 'dispatched':
      return 'var(--status-dispatched, #FF8C42)'
    case 'delivered':
      return 'var(--status-delivered, #22B573)'
    case 'paid':
      return 'var(--status-success, #22B573)'
    case 'overdue':
      return 'var(--status-overdue, #FF6B6B)'
    default:
      return 'var(--text-secondary)'
  }
}

export { getStatusChipBackground, getStatusChipColor }
