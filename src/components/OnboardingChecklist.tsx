import { useState, useEffect, useMemo } from 'react'
import { Check, X, CaretRight } from '@phosphor-icons/react'

const STORAGE_KEYS = {
  dismissed: 'onboarding_checklist_dismissed',
  sharedZeltoId: 'onboarding_shared_zelto_id',
}

interface OnboardingChecklistProps {
  connectionCount: number
  orderCount: number
  accountCreatedAt: Date
  onNavigate: (target: 'profile' | 'add-connection' | 'create-order') => void
}

interface Step {
  label: string
  completed: boolean
  target: 'profile' | 'add-connection' | 'create-order'
}

/**
 * 3-step onboarding checklist card displayed at the top of Dashboard.
 *
 * Shows when:
 * - User has completed fewer than 3 steps
 * - User has not dismissed the card
 * - Account is less than 30 days old
 *
 * Steps:
 * 1. Share your Zelto ID (auto-completes after 3 days)
 * 2. Add your first connection (connectionCount >= 1)
 * 3. Create your first order (orderCount >= 1)
 */
export function OnboardingChecklist({ connectionCount, orderCount, accountCreatedAt, onNavigate }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.dismissed) === 'true'
    } catch {
      return false
    }
  })

  const [sharedId, setSharedId] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.sharedZeltoId) === 'true'
    } catch {
      return false
    }
  })

  const [celebrating, setCelebrating] = useState(false)
  const [visible, setVisible] = useState(true)

  const daysSinceSignup = useMemo(() => {
    return Math.floor((Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24))
  }, [accountCreatedAt])

  const steps: Step[] = useMemo(() => [
    {
      label: 'Share your Zelto ID',
      completed: sharedId || daysSinceSignup >= 3,
      target: 'profile',
    },
    {
      label: 'Add your first connection',
      completed: connectionCount >= 1,
      target: 'add-connection',
    },
    {
      label: 'Create your first order',
      completed: orderCount >= 1,
      target: 'create-order',
    },
  ], [sharedId, daysSinceSignup, connectionCount, orderCount])

  const completedCount = steps.filter(s => s.completed).length
  const allComplete = completedCount === 3
  const progressPercent = Math.round((completedCount / 3) * 100)

  // Account too old or already dismissed
  const shouldHide = dismissed || daysSinceSignup >= 30

  // Auto-dismiss on 100% completion after celebration
  useEffect(() => {
    if (allComplete && !dismissed) {
      setCelebrating(true)
      const timer = setTimeout(() => {
        setVisible(false)
        try {
          localStorage.setItem(STORAGE_KEYS.dismissed, 'true')
        } catch { /* ignore */ }
        setTimeout(() => setDismissed(true), 200)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [allComplete, dismissed])

  // Listen for the share event from ProfileScreen
  useEffect(() => {
    const handler = () => {
      try {
        localStorage.setItem(STORAGE_KEYS.sharedZeltoId, 'true')
      } catch { /* ignore */ }
      setSharedId(true)
    }
    window.addEventListener('zelto:shared-id', handler)
    return () => window.removeEventListener('zelto:shared-id', handler)
  }, [])

  if (shouldHide || !visible) return null

  const handleDismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(STORAGE_KEYS.dismissed, 'true')
    } catch { /* ignore */ }
    setTimeout(() => setDismissed(true), 200)
  }

  return (
    <div
      style={{
        background: celebrating ? 'rgba(34, 181, 115, 0.05)' : 'var(--bg-card, #FFFFFF)',
        border: `1px solid ${celebrating ? 'var(--status-delivered, #22B573)' : 'rgba(74, 108, 247, 0.2)'}`,
        borderRadius: '14px',
        padding: '16px',
        marginBottom: '12px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease-out, background-color 300ms ease-out, border-color 300ms ease-out',
        position: 'relative',
      }}
    >
      {/* Dismiss button */}
      {!allComplete && (
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--text-secondary, #8492A6)',
            minWidth: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Dismiss checklist"
        >
          <X size={16} />
        </button>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingRight: allComplete ? 0 : '28px' }}>
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          color: celebrating ? 'var(--status-delivered, #22B573)' : 'var(--text-secondary, #8492A6)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {celebrating ? "You're all set!" : 'Getting started'}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #8492A6)' }}>
          {celebrating ? 'Welcome to Zelto' : `${completedCount} of 3`}
        </span>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '14px' }}>
        {steps.map((step, i) => (
          <button
            key={i}
            onClick={() => !step.completed && onNavigate(step.target)}
            disabled={step.completed}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              minHeight: '44px',
              padding: '6px 0',
              background: 'none',
              border: 'none',
              cursor: step.completed ? 'default' : 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            {/* Step indicator circle */}
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: step.completed ? 'var(--status-delivered, #22B573)' : 'var(--bg-screen, #F2F4F8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background-color 300ms ease-out, transform 300ms ease-out',
              }}
            >
              {step.completed ? (
                <Check size={14} weight="bold" color="#FFFFFF" />
              ) : (
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #8492A6)' }}>
                  {i + 1}
                </span>
              )}
            </div>

            {/* Label */}
            <span style={{
              flex: 1,
              fontSize: '14px',
              fontWeight: 600,
              color: step.completed ? 'var(--text-secondary, #8492A6)' : 'var(--text-primary, #1A1A2E)',
              textDecoration: step.completed ? 'line-through' : 'none',
            }}>
              {step.label}
            </span>

            {/* Right side */}
            {step.completed ? (
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--status-delivered, #22B573)' }}>
                Done
              </span>
            ) : (
              <CaretRight size={16} color="var(--text-muted, #C0C8D4)" />
            )}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: '6px' }}>
        <div style={{
          width: '100%',
          height: '4px',
          backgroundColor: 'var(--bg-screen, #F2F4F8)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor: celebrating ? 'var(--status-delivered, #22B573)' : 'var(--brand-primary, #4A6CF7)',
            borderRadius: '2px',
            transition: 'width 400ms ease-out, background-color 300ms ease-out',
          }} />
        </div>
      </div>

      {/* Progress label */}
      <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #8492A6)', margin: 0 }}>
        {celebrating ? 'Welcome to Zelto' : `Progress: ${progressPercent}%`}
      </p>
    </div>
  )
}

/**
 * Call this from ProfileScreen when user taps Share to mark step 1 complete.
 */
export function markZeltoIdShared() {
  try {
    localStorage.setItem(STORAGE_KEYS.sharedZeltoId, 'true')
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('zelto:shared-id'))
}
