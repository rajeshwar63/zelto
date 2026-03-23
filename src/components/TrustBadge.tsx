import { SealCheck } from '@phosphor-icons/react'
import type { CredibilityBreakdown } from '@/lib/credibility'

type Level = CredibilityBreakdown['level']

interface Props {
  level: Level
  size?: 'sm' | 'md'
}

const BADGE_CONFIG: Record<Level, {
  label: string
  background: string
  boxShadow: string
}> = {
  trusted: {
    label: 'Trusted',
    background: 'linear-gradient(135deg, #0D9488 0%, #059669 100%)',
    boxShadow: '0 1px 6px rgba(13, 148, 136, 0.40), 0 0 0 1px rgba(13, 148, 136, 0.25)',
  },
  verified: {
    label: 'Verified',
    background: 'linear-gradient(135deg, #4A6CF7 0%, #3B5DE7 100%)',
    boxShadow: '0 1px 6px rgba(74, 108, 247, 0.40), 0 0 0 1px rgba(74, 108, 247, 0.25)',
  },
  basic: {
    label: 'Basic',
    background: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)',
    boxShadow: '0 1px 6px rgba(107, 114, 128, 0.40), 0 0 0 1px rgba(107, 114, 128, 0.25)',
  },
  none: {
    label: 'New',
    background: 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)',
    boxShadow: '0 1px 6px rgba(156, 163, 175, 0.30), 0 0 0 1px rgba(156, 163, 175, 0.20)',
  },
}

export function TrustBadge({ level, size = 'sm' }: Props) {
  const cfg = BADGE_CONFIG[level]

  const fontSize = size === 'md' ? '12px' : '11px'
  const iconSize = size === 'md' ? 14 : 12
  const padding = size === 'md' ? '4px 10px 4px 7px' : '3px 8px 3px 6px'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding,
        borderRadius: '999px',
        background: cfg.background,
        color: '#ffffff',
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        boxShadow: cfg.boxShadow,
      }}
    >
      <SealCheck size={iconSize} weight="fill" />
      {cfg.label}
    </span>
  )
}
