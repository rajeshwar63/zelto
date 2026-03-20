import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { getLocalAuthSessionSync } from '@/lib/auth'

export type TeamRole = 'admin' | 'member'

export interface TeamRoleState {
  role: TeamRole | null
  isAdmin: boolean
  isMember: boolean
  loading: boolean
  refresh: () => Promise<void>
}

export function useTeamRole(): TeamRoleState {
  const [role, setRole] = useState<TeamRole | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchRole = useCallback(async () => {
    const session = getLocalAuthSessionSync()
    if (!session) {
      if (mountedRef.current) {
        setRole(null)
        setLoading(false)
      }
      return
    }

    try {
      const { data, error } = await supabase
        .from('business_members')
        .select('role')
        .eq('user_account_id', session.userId)
        .eq('business_entity_id', session.businessId)
        .single()

      if (mountedRef.current) {
        if (error || !data) {
          // Fallback: user might be the owner (pre-migration) — treat as admin
          setRole('admin')
        } else {
          setRole(data.role as TeamRole)
        }
        setLoading(false)
      }
    } catch {
      if (mountedRef.current) {
        setRole('admin') // Safe fallback
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetchRole()
    return () => { mountedRef.current = false }
  }, [fetchRole])

  // Refresh on app foreground resume
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void fetchRole()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchRole])

  return useMemo(() => ({
    role,
    isAdmin: role === 'admin',
    isMember: role === 'member',
    loading,
    refresh: fetchRole,
  }), [role, loading, fetchRole])
}
