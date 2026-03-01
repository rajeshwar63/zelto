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

export async function findOrCreateBusinessSession(
  email: string,
  signupData?: { name: string; businessName: string }
): Promise<AuthSession> {
  const userAccount = await dataStore.getUserAccountByEmail(email).catch((err) => {
    console.warn('User account lookup failed:', err)
    return undefined
  })

  let businessId: string
  let userId: string

  if (userAccount) {
    businessId = userAccount.businessEntityId
    userId = userAccount.id
  } else {
    const businessName = signupData?.businessName || email.split('@')[0]
    const username = signupData?.name || email.split('@')[0]

    const businessEntity = await dataStore.createBusinessEntity(businessName)
    const newAccount = await dataStore.createUserAccount(email, businessEntity.id, {
      username,
      role: 'owner',
    })
    businessId = businessEntity.id
    userId = newAccount.id
  }

  const session: AuthSession = {
    businessId,
    userId,
    email,
    createdAt: Date.now(),
  }
  await setAuthSession(session)
  return session
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
  await clearAuthSession()
}
