import { useState, useEffect } from 'react'
import { intelligenceEngine } from '@/lib/intelligence-engine'
import type { TrustScoreCoach } from '@/lib/intelligence-engine'

interface Props {
  businessId: string
}

const PILLAR_COLORS: Record<string, { bg: string; color: string }> = {
  identity: { bg: '#EEF0FF', color: '#4A6CF7' },
  activity: { bg: '#E8F8F0', color: '#22B573' },
  tradeRecord: { bg: '#FFF4E0', color: '#EF9F27' },
}

function BadgeRing({ progress, size = 40 }: { progress: number; size?: number }) {
  const strokeWidth = 3.5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, progress)))

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E8ECF2"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#22B573"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  )
}

function getBadgeLabel(badge: string): string {
  if (badge === 'basic') return 'Basic'
  if (badge === 'verified') return 'Verified'
  if (badge === 'trusted') return 'Trusted'
  return badge
}

export function TrustCoachTab({ businessId }: Props) {
  const [coach, setCoach] = useState<TrustScoreCoach | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    intelligenceEngine.getTrustScoreCoach(businessId).then(data => {
      setCoach(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [businessId])

  if (loading) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <p style={{ fontSize: '13px', color: '#8492A6' }}>Loading coach data...</p>
      </div>
    )
  }

  if (!coach) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <p style={{ fontSize: '13px', color: '#8492A6' }}>Unable to load coach data.</p>
      </div>
    )
  }

  const isAtHighest = coach.currentBadge === 'trusted'
  const progress = isAtHighest ? 1 : (coach.currentScore / coach.nextBadgeThreshold)

  // Get the top 2 actions for the tracker text
  const topActions = coach.actions.slice(0, 2)
  const topPointsSum = topActions.reduce((sum, a) => sum + a.estimatedPoints, 0)

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Next badge tracker card */}
      <div style={{
        backgroundColor: '#E1F5EE',
        border: '1px solid #A7D8C4',
        borderRadius: '12px',
        padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BadgeRing progress={progress} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {isAtHighest ? (
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F36', margin: 0 }}>
                You've reached the highest trust level. Keep maintaining your score.
              </p>
            ) : (
              <>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F36', margin: 0 }}>
                  {coach.pointsToNextBadge} points to next badge.
                </p>
                <p style={{ fontSize: '12px', color: '#4A5568', margin: '2px 0 0' }}>
                  Complete the top 2 actions below to reach {coach.nextBadgeThreshold}+ and unlock {getBadgeLabel(coach.currentBadge === 'none' ? 'basic' : coach.currentBadge === 'basic' ? 'verified' : 'trusted')}.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions card */}
      <div>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#8492A6', letterSpacing: '0.6px', marginBottom: '8px' }}>
          HIGHEST IMPACT ACTIONS
        </p>
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
          {coach.actions.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#8492A6' }}>No actions available — your profile is in great shape.</p>
            </div>
          ) : (
            coach.actions.map((action, idx) => {
              const pillarColor = PILLAR_COLORS[action.pillar] ?? PILLAR_COLORS.identity
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: idx < coach.actions.length - 1 ? '1px solid #F2F4F8' : 'none',
                  }}
                >
                  {/* Pillar icon circle */}
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: pillarColor.bg,
                    flexShrink: 0,
                  }} />

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', color: '#1A1F36', margin: 0 }}>
                      {action.action}
                    </p>
                    <p style={{ fontSize: '11px', color: '#22B573', margin: '2px 0 0' }}>
                      +{action.estimatedPoints}pts estimated
                    </p>
                    <p style={{ fontSize: '11px', color: '#8492A6', margin: '2px 0 0' }}>
                      {action.pillar === 'identity' ? 'Identity' : action.pillar === 'activity' ? 'Activity' : 'Trade record'} · {action.subCategory}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
