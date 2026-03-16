import { SealCheck } from '@phosphor-icons/react'
import type { CredibilityBreakdown } from '@/lib/credibility'

interface Props {
  level: CredibilityBreakdown['level']
}

const BADGE_CONFIG = {
  trusted: {
    label: 'Zelto Trusted',
    background: 'linear-gradient(135deg, #0D9488 0%, #059669 100%)',
    boxShadow: '0 1px 6px rgba(13, 148, 136, 0.40), 0 0 0 1px rgba(13, 148, 136, 0.25)',
  },
  verified: {
    label: 'Zelto Verified',
    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    boxShadow: '0 1px 6px rgba(245, 158, 11, 0.40), 0 0 0 1px rgba(245, 158, 11, 0.25)',
  },
  basic: {
    label: 'Zelto Basic',
    background: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)',
    boxShadow: '0 1px 6px rgba(107, 114, 128, 0.40), 0 0 0 1px rgba(107, 114, 128, 0.25)',
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
        gap: '5px',
        padding: '4px 10px 4px 7px',
        borderRadius: '999px',
        background: config.background,
        color: '#ffffff',
        fontSize: '11.5px',
        fontWeight: '700',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        boxShadow: config.boxShadow,
      }}
    >
      <SealCheck size={14} weight="fill" />
      {config.label}
    </span>
  )
}
