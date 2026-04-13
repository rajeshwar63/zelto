import { useState, useEffect, useRef, useCallback } from 'react'
import { Check } from '@phosphor-icons/react'

type ButtonState = 'idle' | 'submitting' | 'success'

interface MorphButtonProps {
  label: string
  onClick: () => Promise<void>
  disabled?: boolean
  style?: React.CSSProperties
  className?: string
}

/**
 * Button that morphs into a green checkmark circle on success.
 * States: idle → submitting → success → idle
 *
 * - On tap: calls onClick, shows submitting spinner
 * - On success: morphs to green circle with white checkmark
 * - After 800ms: returns to idle
 * - Reduced motion: shows static green checkmark, no morph animation
 */
export function MorphButton({ label, onClick, disabled = false, style, className }: MorphButtonProps) {
  const [state, setState] = useState<ButtonState>('idle')
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  const handleClick = useCallback(async () => {
    if (state !== 'idle' || disabled) return
    setState('submitting')

    try {
      await onClick()
      if (!mountedRef.current) return
      setState('success')

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(30)
      }

      setTimeout(() => {
        if (mountedRef.current) setState('idle')
      }, 800)
    } catch {
      if (mountedRef.current) setState('idle')
    }
  }, [onClick, state, disabled])

  const isSuccess = state === 'success'
  const isSubmitting = state === 'submitting'

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state !== 'idle'}
      className={className}
      style={{
        height: '48px',
        minWidth: isSuccess ? '48px' : undefined,
        width: isSuccess ? '48px' : undefined,
        borderRadius: isSuccess ? '24px' : 'var(--radius-button, 12px)',
        background: isSuccess
          ? 'var(--status-delivered, #22B573)'
          : 'var(--brand-primary, #4A6CF7)',
        color: '#FFFFFF',
        fontSize: '14px',
        fontWeight: 600,
        border: 'none',
        cursor: disabled || state !== 'idle' ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'width 300ms ease-out, border-radius 300ms ease-out, background-color 200ms ease-out',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        padding: isSuccess ? 0 : '0 24px',
        margin: '0 auto',
        ...style,
      }}
      aria-label={isSuccess ? 'Success' : label}
    >
      {isSuccess ? (
        <Check size={20} weight="bold" color="#FFFFFF" />
      ) : isSubmitting ? (
        <span
          style={{
            width: '18px',
            height: '18px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#FFFFFF',
            borderRadius: '50%',
            animation: 'spin 600ms linear infinite',
          }}
        />
      ) : (
        label
      )}
    </button>
  )
}
