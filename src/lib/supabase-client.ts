import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Use direct Supabase URL for native apps, proxy for web production
const supabaseUrl = (import.meta.env.PROD && !Capacitor.isNativePlatform())
  ? `${window.location.origin}/supabase-proxy`
  : (import.meta.env.VITE_SUPABASE_URL || '')

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
