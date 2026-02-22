import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { verifyOTP, signupWithPhone, loginWithPhone } from '@/lib/auth'
import { toast } from 'sonner'

interface OTPScreenProps {
  phoneNumber: string
  businessName?: string
  isSignup: boolean
  onSuccess: () => void
  onBack: () => void
}

export function OTPScreen({ phoneNumber, businessName, isSignup, onSuccess, onBack }: OTPScreenProps) {
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const formatPhoneNumber = (phone: string) => {
    const cleanNumber = phone.replace(/\D/g, '')
    if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
      const tenDigits = cleanNumber.slice(2)
      return `+91 ${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`
    }
    return phone
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (otp.length !== 6) {
      toast.error('Please enter a 6-digit code')
      return
    }

    if (!verifyOTP(otp)) {
      toast.error('Invalid verification code')
      return
    }

    setIsLoading(true)
    try {
      if (isSignup && businessName) {
        await signupWithPhone(phoneNumber, businessName)
        toast.success('Account created successfully!')
      } else {
        await loginWithPhone(phoneNumber)
        toast.success('Welcome back!')
      }
      onSuccess()
    } catch (error) {
      console.error('OTP verification error:', error)
      toast.error(error instanceof Error ? error.message : 'Verification failed')
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
            We sent a code to {formatPhoneNumber(phoneNumber)}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            For testing, use code: <span className="font-mono font-medium">123456</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
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
            {isLoading ? 'Verifying...' : 'Verify'}
          </Button>
        </form>
      </div>
    </div>
  )
}
