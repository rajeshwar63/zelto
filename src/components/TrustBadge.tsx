/**
 * TrustBadge — badge-only display of business trust level.
 * Shows Trusted / Verified / Basic / New as a pill with no numeric score.
 * Replaces CredibilityBadge for all public-facing trust level displays.
 *
 * Design spec (section 10):
 *   Trusted:  bg rgba(34,181,115,0.2),  text #22B573, border rgba(34,181,115,0.3)
 *   Verified: bg rgba(74,108,247,0.2),  text #7B8FF7, border rgba(74,108,247,0.3)
 *   Basic:    bg rgba(255,176,32,0.2),  text #FFB020, border rgba(255,176,32,0.3)
 *   New:      bg rgba(255,255,255,0.1), text rgba(255,255,255,0.5), border rgba(255,255,255,0.15)
 *
 * Use `variant="light"` on dark backgrounds (default).
 * Use `variant="dark"` on white card backgrounds (inverts New badge colors).
 */

import type { CredibilityBreakdown } from '@/lib/credibility'

type Level = CredibilityBreakdown['level']

interface Props {
  level: Level
  /** 'light' = dark background (default). 'dark' = white card background. */
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md'
}

const BADGE_CONFIG: Record<Level, { label: string; bg: string; color: string; border: string; darkBg?: string; darkColor?: string; darkBorder?: string }> = {
  trusted: {
    label: 'Trusted',
    bg: 'rgba(34,181,115,0.2)',
    color: '#22B573',
    border: '1px solid rgba(34,181,115,0.3)',
  },
  verified: {
    label: 'Verified',
    bg: 'rgba(74,108,247,0.2)',
    color: '#7B8FF7',
    border: '1px solid rgba(74,108,247,0.3)',
  },
  basic: {
    label: 'Basic',
    bg: 'rgba(255,176,32,0.2)',
    color: '#FFB020',
    border: '1px solid rgba(255,176,32,0.3)',
  },
  none: {
    label: 'New',
    bg: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.15)',
    // On white/card backgrounds use grey tones
    darkBg: 'rgba(0,0,0,0.06)',
    darkColor: '#8492A6',
    darkBorder: '1px solid rgba(0,0,0,0.1)',
  },
}

export function TrustBadge({ level, variant = 'light', size = 'sm' }: Props) {
  const cfg = BADGE_CONFIG[level]
  const isOnDark = variant === 'light'

  const bg = (!isOnDark && cfg.darkBg) ? cfg.darkBg : cfg.bg
  const color = (!isOnDark && cfg.darkColor) ? cfg.darkColor : cfg.color
  const border = (!isOnDark && cfg.darkBorder) ? cfg.darkBorder : cfg.border

  const fontSize = size === 'md' ? '12px' : '11px'
  const padding = size === 'md' ? '4px 10px' : '3px 8px'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: bg,
        color,
        border,
        borderRadius: '100px',
        fontSize,
        fontWeight: 600,
        padding,
        whiteSpace: 'nowrap',
        letterSpacing: '0.01em',
      }}
    >
      {cfg.label}
    </span>
  )
}
