import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseDirectUrl = import.meta.env.VITE_SUPABASE_URL || ''
// Use direct Supabase URL for native apps, proxy for web production
const supabaseUrl = (import.meta.env.PROD && !Capacitor.isNativePlatform())
  ? `${window.location.origin}/supabase-proxy`
  : supabaseDirectUrl
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}
// Proxied client — used for DB, storage in web production
// storageKey ensures proxy client shares auth session with direct client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'sb-cncimuwunjjxrlsnjstm-auth-token',
  }
})
export { supabaseUrl }
// Direct client — always bypasses the proxy, used for auth and functions.invoke
export const supabaseDirect = createClient(supabaseDirectUrl, supabaseAnonKey)
