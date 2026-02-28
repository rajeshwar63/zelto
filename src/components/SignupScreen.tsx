import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkEmailExists, sendEmailOTP } from '@/lib/auth'
import { toast } from 'sonner'

interface SignupScreenProps {
  onSignup: (email: string, businessName: string) => void
  onSwitchToLogin: () => void
}

export function SignupScreen({ onSignup, onSwitchToLogin }: SignupScreenProps) {
  const [email, setEmail] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim() || !businessName.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setIsLoading(true)
    try {
      const exists = await checkEmailExists(email)
      if (exists) {
        toast.error('This email is already registered. Please login instead.')
        setIsLoading(false)
        return
      }

      await sendEmailOTP(email)
      onSignup(email, businessName)
    } catch (error) {
      console.error('Signup error:', error)
      const msg = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      toast.error(msg)
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center bg-background px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Create Account</h1>
          <p className="text-sm text-muted-foreground">Enter your details to get started with Zelto</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
              disabled={isLoading}
              className="h-11"
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessName" className="text-sm font-medium text-foreground">
              Business Name
            </Label>
            <Input
              id="businessName"
              type="text"
              placeholder="Your business name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={isLoading}
              className="h-11"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 mt-6"
            disabled={isLoading}
          >
            {isLoading ? 'Sending code…' : 'Continue'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Already have an account? <span className="font-medium">Login</span>
          </button>
        </div>
      </div>
    </div>
  )
}
