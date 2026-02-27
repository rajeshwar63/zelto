import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendOTP, verifyOTP, signupWithPhone, loginWithPhone } from '@/lib/auth'
import { toast } from 'sonner'

interface OTPScreenProps {
  phoneNumber: string
  businessName?: string
  isSignup: boolean
  onSuccess: (businessId: string) => void
  onBack: () => void
}

export function OTPScreen({ phoneNumber, businessName, isSignup, onSuccess, onBack }: OTPScreenProps) {
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(30)
  const [isResending, setIsResending] = useState(false)

  const formatPhoneNumber = (phone: string) => {
    const cleanNumber = phone.replace(/\D/g, '')
    if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
      const tenDigits = cleanNumber.slice(2)
      return `+91 ${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`
    }
    return phone
  }

  // Countdown for resend button cooldown
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
      await sendOTP(phoneNumber)
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
      await verifyOTP(phoneNumber, otp)

      if (isSignup && businessName) {
        const result = await signupWithPhone(phoneNumber, businessName)
        toast.success('Account created successfully!')
        onSuccess(result.businessEntity.id)
      } else {
        const result = await loginWithPhone(phoneNumber)
        toast.success('Welcome back!')
        onSuccess(result.businessEntity.id)
      }
    } catch (err) {
      console.error('OTP verification error:', err)
      setError('Incorrect code, please try again')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <button
          onClick={onBack}
          className="mb-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Enter Verification Code</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification code to {formatPhoneNumber(phoneNumber)}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
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
              className="h-11 text-center text-lg font-mono tracking-widest"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 mt-6"
            disabled={isLoading || otp.length !== 6}
          >
            {isLoading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          {resendCooldown > 0 ? (
            <p className="text-sm text-muted-foreground">
              Resend code in {resendCooldown}s
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || isLoading}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Didn't receive a code? <span className="font-medium">Resend</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
