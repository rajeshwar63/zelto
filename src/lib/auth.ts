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
  // First check Supabase session
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  // Then check localStorage cache for businessId
  const cached = localStorage.getItem(AUTH_SESSION_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as AuthSession
      // Validate the cached session matches the Supabase session
      if (parsed.email === session.user.email) {
        return parsed
      }
    } catch {}
  }

  // Cache miss or mismatch — resolve from database
  try {
    const email = session.user.email
    if (!email) return null

    const userAccount = await dataStore.getUserAccountByEmail(email)
    if (!userAccount) return null

    const authSession: AuthSession = {
      businessId: userAccount.businessEntityId,
      userId: userAccount.id,
      email,
      createdAt: Date.now(),
    }
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession))
    return authSession
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const businessEntity = await dataStore.createBusinessEntity(businessName)
    const newAccount = await dataStore.createUserAccount(email, businessEntity.id, {
      username,
      role: 'owner',
      authUserId: user.id,
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
