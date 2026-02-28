import { createClient } from '@supabase/supabase-js'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// In production (Vercel), proxy through our own domain to bypass ISP blocks in India.
// In development, use the direct Supabase URL from .env.
const supabaseUrl = import.meta.env.PROD
  ? `${window.location.origin}/supabase-proxy`
  : (import.meta.env.VITE_SUPABASE_URL || '')

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
