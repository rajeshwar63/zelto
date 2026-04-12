import * as Sentry from '@sentry/react'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { sendEmailOTP, verifyEmailOTP, findOrCreateBusinessSession } from '@/lib/auth'
import { toast } from 'sonner'
import { ArrowLeft, EnvelopeSimple } from '@phosphor-icons/react'

interface OTPScreenProps {
  email: string
  signupData?: { name: string; businessName: string }
  onSuccess: (businessId: string) => void
  onBack: () => void
}

export function OTPScreen({ email, signupData, onSuccess, onBack }: OTPScreenProps) {
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(30)
  const [isResending, setIsResending] = useState(false)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  const handleResend = async () => {
    setIsResending(true)
    setError(null)
    setOtp('')
    try {
      await sendEmailOTP(email)
      setResendCooldown(30)
      toast.success('Verification code resent')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resend verification code'
      toast.error(msg)
    } finally {
      setIsResending(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (otp.length !== 6) {
      toast.error('Please enter a 6-digit code')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      if (email.endsWith('@zelto.test')) {
        const { loginAsDemo } = await import('@/lib/auth')
        const session = await loginAsDemo(email)
        onSuccess(session.businessId)
        return
      }

      await verifyEmailOTP(email, otp)
      const session = await findOrCreateBusinessSession(email, signupData)
      onSuccess(session.businessId)
    } catch (err) {
      Sentry.captureException(err, {
        tags: { flow: 'otp_verification' },
      })
      console.error('OTP verification error:', err)
      setError('Incorrect code, please try again')
      setIsLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--bg-screen)' }}
    >
      <div className="w-full max-w-sm">
        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-primary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            padding: 0,
            marginBottom: 16,
            minHeight: 44,
          }}
        >
          <ArrowLeft size={20} weight="bold" />
          Back
        </button>

        {/* Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-modal)',
            border: '1px solid var(--border-light)',
            padding: '24px 20px',
          }}
        >
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: 8,
            }}
          >
            Enter the code
          </h1>

          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
            We sent a code to
          </p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'var(--brand-primary-bg)',
              borderRadius: 8,
              padding: '6px 10px',
              marginBottom: 20,
            }}
          >
            <EnvelopeSimple size={14} weight="bold" color="var(--brand-primary)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-primary)' }}>{email}</span>
          </div>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 'var(--radius-input)',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                border: '1px solid rgba(255, 107, 107, 0.25)',
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--status-overdue)' }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, ''))
                setError(null)
              }}
              disabled={isLoading}
              className="h-16 text-center text-2xl font-mono"
              style={{
                borderRadius: 'var(--radius-input)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                letterSpacing: '0.5em',
              }}
              autoFocus
            />

            <button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              style={{
                width: '100%',
                height: 48,
                backgroundColor: 'var(--brand-primary)',
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 'var(--radius-button)',
                border: 'none',
                cursor: isLoading || otp.length !== 6 ? 'not-allowed' : 'pointer',
                opacity: isLoading || otp.length !== 6 ? 0.4 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              {isLoading ? 'Verifying…' : 'Verify'}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            {resendCooldown > 0 ? (
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                Resend code in{' '}
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{resendCooldown}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending || isLoading}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: 'none',
                  cursor: isResending || isLoading ? 'not-allowed' : 'pointer',
                  opacity: isResending || isLoading ? 0.4 : 1,
                }}
              >
                Didn't receive a code?{' '}
                <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>Resend code</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
