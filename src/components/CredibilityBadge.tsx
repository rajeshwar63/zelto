import { Check, SealCheck } from '@phosphor-icons/react'
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
} as const

export function CredibilityBadge({ level }: Props) {
  if (level === 'none') return null

  // Premium trusted treatment
  if (level === 'trusted') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 10px 4px 7px',
          borderRadius: '999px',
          background: 'linear-gradient(135deg, #0D9488 0%, #059669 100%)',
          color: '#ffffff',
          fontSize: '11.5px',
          fontWeight: '700',
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 6px rgba(13, 148, 136, 0.40), 0 0 0 1px rgba(13, 148, 136, 0.25)',
        }}
      >
        <SealCheck size={14} weight="fill" />
        Zelto Trusted
      </span>
    )
  }

  // basic / verified
  const config = BADGE_CONFIG[level]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '2px 8px 2px 6px',
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
