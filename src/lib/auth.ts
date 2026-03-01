import { supabase } from './supabase-client'
import { dataStore } from './data-store'

const AUTH_SESSION_KEY = 'zelto:local-auth-session'

export interface AuthSession {
  businessId: string
  userId: string
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

export type AuthResult =
  | { status: 'existing_user'; session: AuthSession; username: string }
  | { status: 'new_user'; email: string }

export async function authenticateUser(email: string): Promise<AuthResult> {
  const userAccount = await dataStore.getUserAccountByEmail(email)

  if (userAccount) {
    const session: AuthSession = {
      businessId: userAccount.businessEntityId,
      userId: userAccount.id,
      email,
      createdAt: Date.now(),
    }
    await setAuthSession(session)
    return { status: 'existing_user', session, username: userAccount.username }
  }

  return { status: 'new_user', email }
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
