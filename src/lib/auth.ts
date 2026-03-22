import { supabase } from './supabase-client'
import { dataStore } from './data-store'

const AUTH_SESSION_KEY = 'zelto:local-auth-session'

export interface AuthSession {
  businessId: string
  userId: string
  email: string
  createdAt: number
}

// Three possible auth states on app load
export type AuthState =
  | { status: 'authenticated'; session: AuthSession }
  | { status: 'needs_business_setup'; email: string }
  | { status: 'unauthenticated' }

function parseStoredAuthSession(cached: string | null): AuthSession | null {
  if (!cached) return null
  try {
    const parsed = JSON.parse(cached) as AuthSession
    if (!parsed.businessId || !parsed.userId || !parsed.email) return null
    return parsed
  } catch {
    return null
  }
}

export function getLocalAuthSessionSync(): AuthSession | null {
  const session = parseStoredAuthSession(localStorage.getItem(AUTH_SESSION_KEY))
  if (!session) {
    localStorage.removeItem(AUTH_SESSION_KEY)
  }
  return session
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  })
  if (error) throw new Error(error.message)
  // Supabase redirects the browser — no return value needed
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

export async function checkEmailRegistered(email: string): Promise<boolean> {
  const userAccount = await dataStore.getUserAccountByEmail(email).catch(() => undefined)
  return !!userAccount
}

export async function verifyEmailOTP(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })
  if (error) throw new Error(error.message)
}

// NEW: Replaces getAuthSession() — detects the desync state
export async function getAuthState(): Promise<AuthState> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { status: 'unauthenticated' }

  const email = session.user.email
  if (!email) return { status: 'unauthenticated' }

  // Check localStorage cache first
  const cachedSession = getLocalAuthSessionSync()
  if (cachedSession?.email === email) {
    return { status: 'authenticated', session: cachedSession }
  }

  // Cache miss — check database
  try {
    const userAccount = await dataStore.getUserAccountByEmail(email)
    if (!userAccount || !userAccount.businessEntityId) {
      // DESYNC STATE: Supabase auth exists but no user account / no business
      return { status: 'needs_business_setup', email }
    }

    const authSession: AuthSession = {
      businessId: userAccount.businessEntityId,
      userId: userAccount.id,
      email,
      createdAt: Date.now(),
    }
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession))
    return { status: 'authenticated', session: authSession }
  } catch {
    // DB query failed — still have Supabase auth, route to setup
    return { status: 'needs_business_setup', email }
  }
}

// KEPT for backward compat — components that just need the session
export async function getAuthSession(): Promise<AuthSession | null> {
  const state = await getAuthState()
  if (state.status === 'authenticated') return state.session
  return null
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const username = signupData?.name
      || user.user_metadata?.full_name
      || email.split('@')[0]

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

export async function deleteAccount(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: { userId: session.user.id },
  })
  if (error) throw new Error(error.message || 'Failed to delete account')
  await supabase.auth.signOut()
  await clearAuthSession()
}
