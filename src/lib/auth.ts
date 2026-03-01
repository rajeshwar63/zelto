import { supabase } from './supabase-client'
import { dataStore } from './data-store'

const AUTH_SESSION_KEY = 'zelto:local-auth-session'

export interface AuthSession {
  businessId: string
  email: string
  createdAt: number
}

export async function sendEmailOTP(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    }
  })
  if (error) throw new Error(error.message)
}

export async function verifyEmailOTP(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })
  if (error) throw new Error(error.message)
}

export async function findOrCreateBusinessSession(email: string): Promise<AuthSession> {
  const accounts = await dataStore.getAllUserAccounts()
  const userAccount = accounts.find(a => a.email === email)

  let businessId: string
  if (userAccount) {
    businessId = userAccount.businessEntityId
  } else {
    const emailPrefix = email.split('@')[0]
    const businessEntity = await dataStore.createBusinessEntity(emailPrefix)
    await dataStore.createUserAccount(email, businessEntity.id, emailPrefix)
    businessId = businessEntity.id
  }

  const session: AuthSession = { businessId, email, createdAt: Date.now() }
  await setAuthSession(session)
  return session
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const sessionStr = localStorage.getItem(AUTH_SESSION_KEY)
  if (!sessionStr) return null
  try {
    return JSON.parse(sessionStr) as AuthSession
  } catch {
    return null
  }
}

export async function setAuthSession(session: AuthSession): Promise<void> {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
}

export async function clearAuthSession(): Promise<void> {
  localStorage.removeItem(AUTH_SESSION_KEY)
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
  await clearAuthSession()
}
