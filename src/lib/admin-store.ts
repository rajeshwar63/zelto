import { supabase } from './supabase-client'
import type { AdminAccount } from './types'

// Helper — duplicated here to avoid circular imports
function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamelCase)
  if (obj === null || typeof obj !== 'object') return obj
  const result: any = {}
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    result[camelKey] = toCamelCase(obj[key])
  }
  return result
}

export async function getAllAdminAccounts(): Promise<AdminAccount[]> {
  const { data, error } = await supabase
    .from('admin_accounts')
    .select('*')

  if (error) throw error
  return toCamelCase(data || [])
}

export async function createAdminAccount(username: string, password: string): Promise<AdminAccount> {
  const bcrypt = (await import('bcryptjs')).default
  const hashedPassword = await bcrypt.hash(password, 10)
  const { data, error } = await supabase
    .from('admin_accounts')
    .insert([{ username, password: hashedPassword }])
    .select()
    .single()

  if (error) throw error
  return toCamelCase(data)
}

export async function getAdminAccountByUsername(username: string): Promise<AdminAccount | undefined> {
  const { data, error } = await supabase
    .from('admin_accounts')
    .select('*')
    .eq('username', username)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return undefined
    throw error
  }
  return toCamelCase(data)
}
