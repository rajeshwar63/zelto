import { supabase } from './supabase-client'

export type OrdersDefaultTab = 'all' | 'buying' | 'selling'

const LS_KEY = 'zelto_orders_default_tab'
const HINT_KEY = 'zelto_orders_pin_hint_shown'

export function getOrdersDefaultTab(): OrdersDefaultTab {
  try {
    const val = localStorage.getItem(LS_KEY)
    if (val === 'buying' || val === 'selling' || val === 'all') return val
  } catch {}
  return 'all'
}

export function setOrdersDefaultTabLocal(tab: OrdersDefaultTab): void {
  try {
    localStorage.setItem(LS_KEY, tab)
  } catch {}
}

export function clearOrdersDefaultTabLocal(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {}
}

export function hasPinHintBeenShown(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === 'true'
  } catch {}
  return false
}

export function markPinHintShown(): void {
  try {
    localStorage.setItem(HINT_KEY, 'true')
  } catch {}
}

export async function syncOrdersDefaultTabFromSupabase(
  onUpdate: (tab: OrdersDefaultTab) => void
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('auth_user_id', user.id)
      .single()

    if (error || !data) return

    const remoteTab = (data as any).preferences?.orders_default_tab
    if (remoteTab === 'buying' || remoteTab === 'selling' || remoteTab === 'all') {
      setOrdersDefaultTabLocal(remoteTab)
      onUpdate(remoteTab)
    }
  } catch {}
}

export async function saveOrdersDefaultTabToSupabase(tab: OrdersDefaultTab | null): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const localTab = tab ?? 'all'
    const preferences = tab ? { orders_default_tab: localTab } : {}

    await supabase
      .from('user_preferences')
      .upsert(
        { auth_user_id: user.id, preferences, updated_at: Date.now() },
        { onConflict: 'auth_user_id' }
      )
  } catch {}
}
