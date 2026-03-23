import { X } from '@phosphor-icons/react'
import { CredibilityBadge } from './CredibilityBadge'
import type { CredibilityBreakdown } from '@/lib/credibility'
import type { TrustScoreBreakdown } from '@/lib/trust-score'

interface Props {
  currentLevel: CredibilityBreakdown['level']
  trustScore: TrustScoreBreakdown | null
  onClose: () => void
  onCompleteProfile: () => void
}

const TIERS: Array<{
  level: Exclude<CredibilityBreakdown['level'], 'none'>
  label: string
  range: string
  description: string
}> = [
  { level: 'basic',    label: 'Basic',    range: '20–44', description: 'Profile set up, starting to trade' },
  { level: 'verified', label: 'Verified', range: '45–69', description: 'Active with some trade history' },
  { level: 'trusted',  label: 'Trusted',  range: '70–100', description: 'Strong behaviour across connections' },
]

function getPillarBarColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0
  if (pct >= 0.7) return '#22B573'
  if (pct >= 0.4) return '#EF9F27'
  return '#E24B4A'
}

export function BadgeInfoSheet({ currentLevel, trustScore, onClose, onCompleteProfile }: Props) {
  const isTrusted = currentLevel === 'trusted'

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
          maxHeight: '85vh',
          overflowY: 'auto',
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
          Your trust badge
        </h2>
        <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
          Your badge reflects how complete, active, and reliable your business is on Zelto.
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

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: '#E8ECF2', marginBottom: '20px' }} />

        {/* Score Breakdown */}
        {trustScore && (
          <>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#8492A6', letterSpacing: '0.6px', marginBottom: '12px' }}>
              YOUR SCORE BREAKDOWN
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
              {([
                { name: 'Identity & Compliance', pillar: trustScore.identity, insufficient: false },
                { name: 'Activity & Tenure', pillar: trustScore.activity, insufficient: false },
                { name: 'Trade Record', pillar: trustScore.tradeRecord, insufficient: trustScore.tradeRecordInsufficient },
              ]).map(({ name, pillar, insufficient }) => {
                const barColor = getPillarBarColor(pillar.score, pillar.max)
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F36' }}>{name}</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F36' }}>
                        {insufficient ? '—' : pillar.score}/{pillar.max}
                      </span>
                    </div>
                    <div style={{ height: 6, backgroundColor: '#E8ECF2', borderRadius: 99, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, (pillar.score / pillar.max) * 100)}%`,
                          backgroundColor: barColor,
                          borderRadius: 99,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Nudge card */}
            <div style={{
              backgroundColor: '#FFF8E8',
              border: '1px solid #FFE4A0',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '20px',
            }}>
              <p style={{ fontSize: '13px', color: '#92600A', fontWeight: 500, margin: 0 }}>
                {trustScore.nudgeText}
              </p>
            </div>

            {/* Total score */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '36px', fontWeight: 800, color: '#1A1F36' }}>{trustScore.total}</span>
              <span style={{ fontSize: '16px', fontWeight: 500, color: '#8492A6' }}>/100</span>
            </div>
          </>
        )}

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

        {isTrusted && (
          <p style={{ fontSize: '13px', color: '#22C55E', fontWeight: 600, textAlign: 'center' }}>
            You've reached the highest level
          </p>
        )}
      </div>
    </>
  )
}
