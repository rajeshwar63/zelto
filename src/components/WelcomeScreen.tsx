import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sendEmailOTP } from '@/lib/auth'
import { toast } from 'sonner'

interface WelcomeScreenProps {
  onContinue: (data: { name: string; businessName: string; email: string }) => void
  onLoginOnly: (email: string) => void
}

export function WelcomeScreen({ onContinue, onLoginOnly }: WelcomeScreenProps) {
  const [isLoginMode, setIsLoginMode] = useState(false)
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; businessName?: string; email?: string }>({})

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const newErrors: { name?: string; businessName?: string; email?: string } = {}

    if (!isLoginMode && !name.trim()) {
      newErrors.name = 'Please enter your name'
    }
    if (!isLoginMode && !businessName.trim()) {
      newErrors.businessName = 'Please enter your business name'
    }
    if (!email.trim()) {
      newErrors.email = 'Please enter your email address'
    } else if (!emailRegex.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsLoading(true)
    setErrors({})
    try {
      await sendEmailOTP(email)
      if (isLoginMode) {
        onLoginOnly(email)
      } else {
        onContinue({ name: name.trim(), businessName: businessName.trim(), email })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      toast.error(msg)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <span className="text-4xl font-bold tracking-tight text-foreground">Zelto</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLoginMode && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-foreground">
                  Your name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Rajeshwar Kumar"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setErrors(prev => ({ ...prev, name: undefined }))
                  }}
                  disabled={isLoading}
                  className="h-11"
                  autoFocus
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName" className="text-sm font-medium text-foreground">
                  Business name
                </Label>
                <Input
                  id="businessName"
                  type="text"
                  placeholder="Sri Lakshmi Traders"
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value)
                    setErrors(prev => ({ ...prev, businessName: undefined }))
                  }}
                  disabled={isLoading}
                  className="h-11"
                />
                {errors.businessName && (
                  <p className="text-sm text-destructive">{errors.businessName}</p>
                )}
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErrors(prev => ({ ...prev, email: undefined }))
              }}
              disabled={isLoading}
              className="h-11"
              autoFocus={isLoginMode}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
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
          {isLoginMode ? (
            <button
              type="button"
              onClick={() => {
                setIsLoginMode(false)
                setErrors({})
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              New to Zelto? <span className="font-medium">Sign up</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsLoginMode(true)
                setErrors({})
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Already have an account? <span className="font-medium">Log in with email only</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
