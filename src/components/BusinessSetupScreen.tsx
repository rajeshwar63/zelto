import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dataStore } from '@/lib/data-store'
import { setAuthSession } from '@/lib/auth'
import { toast } from 'sonner'
import type { BusinessEntity } from '@/lib/types'

interface BusinessSetupScreenProps {
  email: string
  onComplete: (businessId: string) => void
}

export function BusinessSetupScreen({ email, onComplete }: BusinessSetupScreenProps) {
  const [username, setUsername] = useState(email.split('@')[0])
  const [businessName, setBusinessName] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [zeltoCode, setZeltoCode] = useState('')

  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  // Fuzzy match state
  const [similarBusinesses, setSimilarBusinesses] = useState<BusinessEntity[]>([])
  const [showSimilarBanner, setShowSimilarBanner] = useState(false)
  const [joinRequestSent, setJoinRequestSent] = useState(false)

  // Zelto code lookup state
  const [zeltoLookupBusiness, setZeltoLookupBusiness] = useState<BusinessEntity | null>(null)
  const [zeltoLookupError, setZeltoLookupError] = useState('')
  const [isLookingUpZelto, setIsLookingUpZelto] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced fuzzy search when business name + city are filled
  const searchBusinesses = useCallback(async (name: string, searchCity: string) => {
    if (name.length < 3 || searchCity.length < 2) {
      setSimilarBusinesses([])
      setShowSimilarBanner(false)
      return
    }

    setIsSearching(true)
    try {
      const results = await dataStore.searchBusinessesByName(name, searchCity)
      setSimilarBusinesses(results)
      setShowSimilarBanner(results.length > 0)
    } catch (err) {
      console.error('Business search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    if (businessName.length >= 3 && city.length >= 2) {
      debounceTimer.current = setTimeout(() => {
        searchBusinesses(businessName, city)
      }, 500)
    } else {
      setSimilarBusinesses([])
      setShowSimilarBanner(false)
    }

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [businessName, city, searchBusinesses])

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!businessName.trim()) {
      toast.error('Please enter a business name')
      return
    }
    if (!city.trim()) {
      toast.error('Please enter a city')
      return
    }

    setIsCreating(true)
    try {
      const business = await dataStore.createBusinessEntity(businessName.trim(), {
        city: city.trim(),
        phone: phone.trim() || undefined,
      })

      const userAccount = await dataStore.createUserAccount(email, business.id, {
        username: username.trim() || undefined,
        role: 'owner',
      })

      await setAuthSession({
        businessId: business.id,
        userId: userAccount.id,
        email,
        createdAt: Date.now(),
      })

      onComplete(business.id)
    } catch (err) {
      console.error('Failed to create business:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to create business')
      setIsCreating(false)
    }
  }

  const handleZeltoCodeLookup = async () => {
    const code = zeltoCode.trim().toUpperCase()
    if (!code) {
      toast.error('Please enter a Zelto Code')
      return
    }

    setIsLookingUpZelto(true)
    setZeltoLookupError('')
    setZeltoLookupBusiness(null)

    try {
      const business = await dataStore.getBusinessEntityByZeltoId(code)
      if (business) {
        setZeltoLookupBusiness(business)
      } else {
        setZeltoLookupError('No business found with this code')
      }
    } catch (err) {
      console.error('Zelto code lookup failed:', err)
      setZeltoLookupError('Failed to look up code')
    } finally {
      setIsLookingUpZelto(false)
    }
  }

  const handleJoinBusiness = async (business: BusinessEntity) => {
    setIsJoining(true)
    try {
      // MVP: auto-approve — create user with member role directly
      const userAccount = await dataStore.createUserAccount(email, business.id, {
        username: username.trim() || undefined,
        role: 'member',
      })

      await setAuthSession({
        businessId: business.id,
        userId: userAccount.id,
        email,
        createdAt: Date.now(),
      })

      onComplete(business.id)
    } catch (err) {
      console.error('Failed to join business:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to join business')
      setIsJoining(false)
    }
  }

  const handleFuzzyMatchJoin = async (business: BusinessEntity) => {
    setJoinRequestSent(true)
    // MVP: auto-approve — join directly
    await handleJoinBusiness(business)
  }

  const handleDismissSimilar = () => {
    setShowSimilarBanner(false)
  }

  if (joinRequestSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Request sent!</h1>
          <p className="text-sm text-muted-foreground">
            You'll be notified when approved.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-1">Set up your business</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {email}
          </p>
        </div>

        <form onSubmit={handleCreateBusiness} className="space-y-4">
          {/* Your name */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium text-foreground">
              Your name
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="Your name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isCreating || isJoining}
              className="h-11"
            />
          </div>

          {/* Business name */}
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
                setShowSimilarBanner(false)
              }}
              disabled={isCreating || isJoining}
              className="h-11"
            />
            {isSearching && (
              <p className="text-xs text-muted-foreground">Searching...</p>
            )}
          </div>

          {/* City */}
          <div className="space-y-2">
            <Label htmlFor="city" className="text-sm font-medium text-foreground">
              City
            </Label>
            <Input
              id="city"
              type="text"
              placeholder="Hyderabad"
              value={city}
              onChange={(e) => {
                setCity(e.target.value)
                setShowSimilarBanner(false)
              }}
              disabled={isCreating || isJoining}
              className="h-11"
            />
          </div>

          {/* Business phone */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium text-foreground">
              Business phone <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              disabled={isCreating || isJoining}
              className="h-11"
            />
          </div>

          {/* Similar businesses banner */}
          {showSimilarBanner && similarBusinesses.length > 0 && (
            <div className="rounded-md border border-border bg-muted/50 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                Similar businesses found in {city}:
              </p>
              {similarBusinesses.map((biz) => (
                <div key={biz.id} className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {biz.businessName}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {biz.zeltoId}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleFuzzyMatchJoin(biz)}
                      disabled={isJoining}
                    >
                      {isJoining ? 'Joining…' : 'This is my business'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDismissSimilar}
                    >
                      Not mine
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground uppercase">
                or
              </span>
            </div>
          </div>

          {/* Zelto Code join */}
          <div className="space-y-2">
            <Label htmlFor="zeltoCode" className="text-sm font-medium text-foreground">
              Have a Zelto Code?
            </Label>
            <div className="flex gap-2">
              <Input
                id="zeltoCode"
                type="text"
                placeholder="ZELTO-XXXXXXXX"
                value={zeltoCode}
                onChange={(e) => {
                  setZeltoCode(e.target.value.toUpperCase())
                  setZeltoLookupBusiness(null)
                  setZeltoLookupError('')
                }}
                disabled={isCreating || isJoining || isLookingUpZelto}
                className="h-11 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                onClick={handleZeltoCodeLookup}
                disabled={isCreating || isJoining || isLookingUpZelto || !zeltoCode.trim()}
              >
                {isLookingUpZelto ? 'Looking up…' : 'Join'}
              </Button>
            </div>
            {zeltoLookupError && (
              <p className="text-sm text-destructive">{zeltoLookupError}</p>
            )}
          </div>

          {/* Zelto code lookup result */}
          {zeltoLookupBusiness && (
            <div className="rounded-md border border-border bg-muted/50 p-4 space-y-3">
              <p className="text-sm text-foreground">
                Request to join <span className="font-medium">{zeltoLookupBusiness.businessName}</span>?
              </p>
              {zeltoLookupBusiness.city && (
                <p className="text-xs text-muted-foreground">{zeltoLookupBusiness.city}</p>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => handleJoinBusiness(zeltoLookupBusiness)}
                disabled={isJoining}
              >
                {isJoining ? 'Joining…' : 'Confirm'}
              </Button>
            </div>
          )}

          {/* Create Business button */}
          <Button
            type="submit"
            className="w-full h-11 mt-6"
            disabled={isCreating || isJoining}
          >
            {isCreating ? 'Creating…' : 'Create Business'}
          </Button>
        </form>
      </div>
    </div>
  )
}
