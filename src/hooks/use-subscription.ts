import { useCallback, useMemo } from 'react'
import { useCachedQuery } from '@/hooks/data/cache'
import { supabase } from '@/lib/supabase-client'

interface BusinessSubscription {
  plan: 'free' | 'pro'
  status: 'active' | 'lapsed'
  subscribedAt: string | null
  expiresAt: string | null
  earlyBirdUsed: boolean
}

export interface SubscriptionState {
  plan: 'free' | 'pro'
  status: 'active' | 'lapsed'
  isProActive: boolean
  earlyBirdEligible: boolean
  daysLeftEarlyBird: number
  connectionCount: number | null
  loading: boolean
}

const EARLY_BIRD_WINDOW_DAYS = 30

async function fetchSubscription(businessId: string): Promise<{
  subscription: BusinessSubscription | null
  businessCreatedAt: number | null
  connectionCount: number
}> {
  const [subResult, entityResult, connResult] = await Promise.all([
    supabase
      .from('business_subscriptions')
      .select('plan, status, subscribed_at, expires_at, early_bird_used')
      .eq('business_entity_id', businessId)
      .maybeSingle(),
    supabase
      .from('business_entities')
      .select('created_at')
      .eq('id', businessId)
      .single(),
    supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`buyer_business_id.eq.${businessId},supplier_business_id.eq.${businessId}`),
  ])

  const sub = subResult.data
    ? {
        plan: subResult.data.plan as 'free' | 'pro',
        status: subResult.data.status as 'active' | 'lapsed',
        subscribedAt: subResult.data.subscribed_at,
        expiresAt: subResult.data.expires_at,
        earlyBirdUsed: subResult.data.early_bird_used,
      }
    : null

  return {
    subscription: sub,
    businessCreatedAt: entityResult.data?.created_at ?? null,
    connectionCount: connResult.count ?? 0,
  }
}

export function useSubscription(currentBusinessId: string, isActive = true): SubscriptionState {
  const fetcher = useCallback(
    () => fetchSubscription(currentBusinessId),
    [currentBusinessId]
  )

  const { data, isInitialLoading } = useCachedQuery({
    key: `subscription:${currentBusinessId}`,
    fetcher,
    isActive,
    staleAfterMs: 60_000,
  })

  return useMemo(() => {
    if (!data) {
      return {
        plan: 'free',
        status: 'active' as const,
        isProActive: false,
        earlyBirdEligible: false,
        daysLeftEarlyBird: 0,
        connectionCount: null,
        loading: isInitialLoading,
      }
    }

    const { subscription, businessCreatedAt, connectionCount } = data
    const plan = subscription?.plan ?? 'free'
    const status = subscription?.status ?? 'active'
    const isProActive = plan === 'pro' && status === 'active'

    let earlyBirdEligible = false
    let daysLeftEarlyBird = 0

    if (businessCreatedAt && !subscription?.earlyBirdUsed) {
      const createdDate = new Date(businessCreatedAt)
      const now = new Date()
      const daysSinceCreation = Math.floor(
        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const remaining = EARLY_BIRD_WINDOW_DAYS - daysSinceCreation
      if (remaining > 0) {
        earlyBirdEligible = true
        daysLeftEarlyBird = remaining
      }
    }

    return {
      plan,
      status,
      isProActive,
      earlyBirdEligible,
      daysLeftEarlyBird,
      connectionCount,
      loading: isInitialLoading,
    }
  }, [data, isInitialLoading])
}
