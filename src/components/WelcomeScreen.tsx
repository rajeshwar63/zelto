import { useState } from 'react'
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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--bg-screen)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo + wordmark */}
        <div className="flex flex-col items-center mb-8">
          <div
            style={{
              width: 56,
              height: 56,
              backgroundColor: 'var(--brand-primary)',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              boxShadow: '0 4px 16px rgba(74, 108, 247, 0.35)',
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em' }}>Z</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Zelto
          </h1>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 4 }}>
            {isLoginMode ? 'Welcome back' : 'Built for Indian business'}
          </p>
        </div>

        {/* Form card */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-modal)',
            border: '1px solid var(--border-light)',
            padding: '24px 20px',
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: '-0.02em' }}>
            {isLoginMode ? 'Login' : 'Sign up'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLoginMode && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Your name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="First Name Last Name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setErrors(prev => ({ ...prev, name: undefined }))
                    }}
                    disabled={isLoading}
                    className="h-12"
                    style={{ borderRadius: 'var(--radius-input)' }}
                    autoFocus
                  />
                  {errors.name && (
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--status-overdue)' }}>{errors.name}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="businessName" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Business name
                  </Label>
                  <Input
                    id="businessName"
                    type="text"
                    placeholder="Company Name"
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value)
                      setErrors(prev => ({ ...prev, businessName: undefined }))
                    }}
                    disabled={isLoading}
                    className="h-12"
                    style={{ borderRadius: 'var(--radius-input)' }}
                  />
                  {errors.businessName && (
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--status-overdue)' }}>{errors.businessName}</p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
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
                className="h-12"
                style={{ borderRadius: 'var(--radius-input)' }}
                autoFocus={isLoginMode}
              />
              {errors.email && (
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--status-overdue)' }}>{errors.email}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                height: 48,
                marginTop: 8,
                backgroundColor: isLoading ? 'var(--text-tertiary)' : 'var(--brand-primary)',
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 'var(--radius-button)',
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              {isLoading ? 'Sending code…' : 'Continue'}
            </button>
          </form>

          <div
            style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid var(--border-section)',
              textAlign: 'center',
            }}
          >
            {isLoginMode ? (
              <button
                type="button"
                onClick={() => {
                  setIsLoginMode(false)
                  setErrors({})
                }}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                New to Zelto?{' '}
                <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>Sign up</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsLoginMode(true)
                  setErrors({})
                }}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Already have an account?{' '}
                <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>Log in with email only</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
