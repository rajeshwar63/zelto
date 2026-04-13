import { useEffect, useState, useMemo } from 'react'

interface CelebrationOverlayProps {
  type: 'payment_received' | 'order_created' | 'delivery_confirmed'
  amount?: string
  onComplete: () => void
}

const CONFETTI_COLORS = [
  'var(--brand-primary, #4A6CF7)',
  'var(--status-delivered, #22B573)',
  'var(--brand-primary-light, #6B8AFF)',
  'var(--status-new, #4A6CF7)',
  '#FFD700',
]

/**
 * Full-screen celebration overlay for payment received, order created, etc.
 * - Green checkmark draws itself (stroke animation)
 * - Confetti burst from center
 * - Amount display fades in
 * - Auto-dismisses after 1200ms
 * - pointer-events: none — user can still interact with app beneath
 * - Respects prefers-reduced-motion
 */
export function CelebrationOverlay({ type, amount, onComplete }: CelebrationOverlayProps) {
  const [phase, setPhase] = useState<'active' | 'fading' | 'done'>('active')
  const prefersReduced = usePrefersReducedMotion()

  const particles = useMemo(() =>
    Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: Math.random() * 200 - 100,
      y: -(Math.random() * 180 + 80),
      rotation: Math.random() * 720 - 360,
      scale: Math.random() * 0.5 + 0.5,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      shape: i % 3 === 0 ? 'circle' as const : 'rect' as const,
      delay: Math.random() * 100,
    })),
  [])

  useEffect(() => {
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50)
    }

    const fadeTimer = setTimeout(() => setPhase('fading'), 900)
    const doneTimer = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, 1200)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [onComplete])

  if (phase === 'done') return null

  const message = type === 'payment_received'
    ? amount ? `${amount} received` : 'Payment received'
    : type === 'order_created'
      ? 'Order created'
      : 'Delivery confirmed'

  // Reduced motion fallback: simple banner
  if (prefersReduced) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          pointerEvents: 'none',
          padding: '60px 24px 20px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: 'var(--status-delivered, #22B573)',
            color: '#FFFFFF',
            borderRadius: '12px',
            padding: '14px 20px',
            fontSize: '15px',
            fontWeight: 600,
            opacity: phase === 'fading' ? 0 : 1,
            transition: 'opacity 200ms ease-out',
          }}
        >
          {'\u2713'} {message}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: phase === 'fading' ? 0 : 1,
        transition: 'opacity 300ms ease-out',
      }}
    >
      {/* Green flash overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'var(--status-delivered, #22B573)',
          opacity: 0,
          animation: 'celebrationFadeIn 100ms ease-out forwards, celebrationFadeOut 200ms ease-out 150ms forwards',
        }}
      />

      {/* Confetti particles */}
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: p.shape === 'circle' ? '8px' : '6px',
            height: p.shape === 'circle' ? '8px' : '10px',
            borderRadius: p.shape === 'circle' ? '50%' : '2px',
            backgroundColor: p.color,
            transform: `scale(${p.scale})`,
            '--confetti-x': `${p.x}px`,
            '--confetti-y': `${p.y}px`,
            '--confetti-r': `${p.rotation}deg`,
            animation: `confettiArc 800ms ease-out ${200 + p.delay}ms forwards`,
            opacity: 0,
            animationFillMode: 'forwards',
          } as React.CSSProperties}
        />
      ))}

      {/* Checkmark circle */}
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          backgroundColor: 'var(--status-delivered, #22B573)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'scaleBounce 500ms ease-out 200ms both',
          boxShadow: '0 8px 32px rgba(34, 181, 115, 0.3)',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M8 16L14 22L24 10"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 40,
              strokeDashoffset: 40,
              animation: 'strokeDraw 400ms ease-out 400ms forwards',
            }}
          />
        </svg>
      </div>

      {/* Amount text */}
      <p
        style={{
          marginTop: '16px',
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary, #1A1A2E)',
          opacity: 0,
          animation: 'celebrationFadeIn 300ms ease-out 500ms forwards',
          textShadow: '0 1px 2px rgba(0,0,0,0.1)',
          backgroundColor: 'rgba(255,255,255,0.9)',
          padding: '6px 16px',
          borderRadius: '8px',
        }}
      >
        {message}
      </p>
    </div>
  )
}

function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return prefersReduced
}
