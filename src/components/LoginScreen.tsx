import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkEmailExists, sendEmailOTP } from '@/lib/auth'
import { toast } from 'sonner'

interface LoginScreenProps {
  onLogin: (email: string) => void
  onSwitchToSignup: () => void
}

export function LoginScreen({ onLogin, onSwitchToSignup }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError('Please enter your email address')
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
      if (!exists) {
        toast.error('This email is not registered. Please sign up instead.')
        setIsLoading(false)
        return
      }

      await sendEmailOTP(email)
      onLogin(email)
    } catch (error) {
      console.error('Login error:', error)
      const msg = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      toast.error(msg)
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center bg-background px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Welcome Back</h1>
          <p className="text-sm text-muted-foreground">Enter your email to continue</p>
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
            onClick={onSwitchToSignup}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Don't have an account? <span className="font-medium">Sign up</span>
          </button>
        </div>
      </div>
    </div>
  )
}
