import { SealCheck } from '@phosphor-icons/react'
import type { CredibilityBreakdown } from '@/lib/credibility'

type Level = CredibilityBreakdown['level']

interface Props {
  level: Level
  /** 'light' = dark background (default). 'dark' = white card background. */
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md'
}

const BADGE_CONFIG: Record<Level, {
  label: string
  background: string
  boxShadow: string
  // Flat style overrides for dark variant (on white/card backgrounds)
  flatBg: string
  flatColor: string
  flatBorder: string
}> = {
  trusted: {
    label: 'Trusted',
    background: 'linear-gradient(135deg, #0D9488 0%, #059669 100%)',
    boxShadow: '0 1px 6px rgba(13, 148, 136, 0.40), 0 0 0 1px rgba(13, 148, 136, 0.25)',
    flatBg: 'rgba(34,181,115,0.15)',
    flatColor: '#0D9488',
    flatBorder: '1px solid rgba(34,181,115,0.3)',
  },
  verified: {
    label: 'Verified',
    background: 'linear-gradient(135deg, #4A6CF7 0%, #3B5DE7 100%)',
    boxShadow: '0 1px 6px rgba(74, 108, 247, 0.40), 0 0 0 1px rgba(74, 108, 247, 0.25)',
    flatBg: 'rgba(74,108,247,0.15)',
    flatColor: '#4A6CF7',
    flatBorder: '1px solid rgba(74,108,247,0.3)',
  },
  basic: {
    label: 'Basic',
    background: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)',
    boxShadow: '0 1px 6px rgba(107, 114, 128, 0.40), 0 0 0 1px rgba(107, 114, 128, 0.25)',
    flatBg: 'rgba(107,114,128,0.12)',
    flatColor: '#6B7280',
    flatBorder: '1px solid rgba(107,114,128,0.25)',
  },
  none: {
    label: 'New',
    background: 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)',
    boxShadow: '0 1px 6px rgba(156, 163, 175, 0.30), 0 0 0 1px rgba(156, 163, 175, 0.20)',
    flatBg: 'rgba(0,0,0,0.06)',
    flatColor: '#8492A6',
    flatBorder: '1px solid rgba(0,0,0,0.1)',
  },
}

export function TrustBadge({ level, variant = 'light', size = 'sm' }: Props) {
  const cfg = BADGE_CONFIG[level]
  const useGradient = variant === 'light' // gradient on dark backgrounds, flat on white

  const fontSize = size === 'md' ? '12px' : '11px'

  if (useGradient) {
    // Gradient style — white text on colored gradient, with icon
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: size === 'md' ? '4px 10px 4px 7px' : '3px 8px 3px 6px',
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
        <SealCheck size={size === 'md' ? 14 : 12} weight="fill" />
        {cfg.label}
      </span>
    )
  }

  // Flat style — for white/card backgrounds
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: size === 'md' ? '4px 10px 4px 7px' : '3px 8px 3px 6px',
        borderRadius: '999px',
        backgroundColor: cfg.flatBg,
        color: cfg.flatColor,
        border: cfg.flatBorder,
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      <SealCheck size={size === 'md' ? 14 : 12} weight="fill" />
      {cfg.label}
    </span>
  )
}
