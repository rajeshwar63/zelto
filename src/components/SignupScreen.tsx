import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkPhoneNumberExists } from '@/lib/auth'
import { toast } from 'sonner'

interface SignupScreenProps {
  onSignup: (phoneNumber: string, businessName: string) => void
  onSwitchToLogin: () => void
}

export function SignupScreen({ onSignup, onSwitchToLogin }: SignupScreenProps) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 10) {
      setPhoneNumber(value)
      setError('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!phoneNumber.trim() || !businessName.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    if (phoneNumber.length !== 10) {
      setError('Please enter a valid 10-digit Indian mobile number')
      return
    }

    setIsLoading(true)
    try {
      const fullNumber = `+91${phoneNumber}`
      const exists = await checkPhoneNumberExists(fullNumber)
      if (exists) {
        toast.error('This number is already registered. Please login instead.')
        setIsLoading(false)
        return
      }

      onSignup(fullNumber, businessName)
    } catch (error) {
      console.error('Signup error:', error)
      toast.error('Something went wrong. Please try again.')
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
            <Label htmlFor="phoneNumber" className="text-sm font-medium text-foreground">
              Mobile Number
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-11 px-3 bg-muted rounded-md border border-input">
                <span className="text-sm font-medium text-foreground">+91</span>
              </div>
              <Input
                id="phoneNumber"
                type="tel"
                inputMode="numeric"
                placeholder="9876543210"
                value={phoneNumber}
                onChange={handlePhoneChange}
                disabled={isLoading}
                className="h-11 flex-1"
              />
            </div>
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
            {isLoading ? 'Checking...' : 'Continue'}
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
