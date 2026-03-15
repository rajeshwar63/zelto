import { X } from '@phosphor-icons/react'
import { CredibilityBadge } from './CredibilityBadge'
import type { CredibilityBreakdown } from '@/lib/credibility'

interface Props {
  currentLevel: CredibilityBreakdown['level']
  missingItems: string[]
  onClose: () => void
  onCompleteProfile: () => void
}

const TIERS: Array<{
  level: Exclude<CredibilityBreakdown['level'], 'none'>
  description: string
}> = [
  { level: 'basic',    description: 'Profile created, getting started' },
  { level: 'verified', description: 'Key business details added' },
  { level: 'trusted',  description: 'Fully complete, actively trading' },
]

export function BadgeInfoSheet({ currentLevel, missingItems, onClose, onCompleteProfile }: Props) {
  const isTrusted = currentLevel === 'trusted'
  const nudgeText = isTrusted
    ? null
    : missingItems.length > 0
      ? `Add ${missingItems.slice(0, 2).join(' and ')} to reach the next level`
      : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.35)',
          zIndex: 50,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          backgroundColor: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          padding: '20px 20px 40px',
          zIndex: 51,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#888', padding: '4px',
          }}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Title */}
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>
          What does your Zelto badge mean?
        </h2>
        <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
          Your badge shows other businesses how complete and active your profile is.
        </p>

        {/* Tier rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {TIERS.map(({ level, description }) => {
            const isCurrent = level === currentLevel
            return (
              <div
                key={level}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: isCurrent ? '#F7F9FF' : 'transparent',
                  border: isCurrent ? '1px solid #E0E7FF' : '1px solid transparent',
                }}
              >
                <CredibilityBadge level={level} />
                <p style={{ flex: 1, fontSize: '13px', fontWeight: isCurrent ? 600 : 500, color: isCurrent ? '#111' : '#555' }}>
                  {description}
                </p>
                {isCurrent && (
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#4A6CF7' }}>
                    You're here
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Nudge */}
        {isTrusted ? (
          <p style={{ fontSize: '13px', color: '#22C55E', fontWeight: 600, textAlign: 'center', marginBottom: '16px' }}>
            You've reached the highest level 🎉
          </p>
        ) : nudgeText ? (
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
            {nudgeText}
          </p>
        ) : null}

        {/* CTA */}
        {!isTrusted && (
          <button
            onClick={onCompleteProfile}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '12px',
              backgroundColor: 'var(--brand-primary)',
              color: '#FFFFFF',
              fontSize: '15px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Complete my profile
          </button>
        )}
      </div>
    </>
  )
}
