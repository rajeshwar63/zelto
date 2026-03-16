import { Check } from '@phosphor-icons/react'
import type { CredibilityBreakdown } from '@/lib/credibility'

interface Props {
  level: CredibilityBreakdown['level']
}

const BADGE_CONFIG = {
  basic: {
    label: 'Zelto Basic',
    color: '#92400E',
    bg: '#FEF3C7',
    border: '#FDE68A',
  },
  verified: {
    label: 'Zelto Verified',
    color: '#1E40AF',
    bg: '#DBEAFE',
    border: '#BFDBFE',
  },
  trusted: {
    label: 'Zelto Trusted',
    color: '#0F766E',
    bg: '#F0FDFA',
    border: '#99F6E4',
  },
} as const

export function CredibilityBadge({ level }: Props) {
  if (level === 'none') return null
  const config = BADGE_CONFIG[level]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '1px 7px 1px 5px',
        borderRadius: '999px',
        border: `1px solid ${config.border}`,
        backgroundColor: config.bg,
        color: config.color,
        fontSize: '11px',
        fontWeight: '600',
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      }}
    >
      <Check size={10} weight="bold" />
      {config.label}
    </span>
  )
}
