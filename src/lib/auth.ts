import { supabase } from './supabase-client'
import { dataStore } from './data-store'
import { BusinessEntity, UserAccount } from './types'

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
    type: 'email'
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

export async function checkEmailExists(email: string): Promise<boolean> {
  const accounts = await dataStore.getAllUserAccounts()
  return accounts.some(a => a.email === email)
}

export async function signupWithEmail(email: string, businessName: string): Promise<{ businessEntity: BusinessEntity; userAccount: UserAccount }> {
  const exists = await checkEmailExists(email)
  if (exists) {
    throw new Error('Email already registered')
  }

  const businessEntity = await dataStore.createBusinessEntity(businessName)
  const userAccount = await dataStore.createUserAccount(email, businessEntity.id)

  await setAuthSession({
    businessId: businessEntity.id,
    email,
    createdAt: Date.now()
  })

  return { businessEntity, userAccount }
}

export async function loginWithEmail(email: string): Promise<{ businessEntity: BusinessEntity; userAccount: UserAccount }> {
  const accounts = await dataStore.getAllUserAccounts()
  const userAccount = accounts.find(a => a.email === email)

  if (!userAccount) {
    throw new Error('Email not registered')
  }

  const businessEntity = await dataStore.getBusinessEntityById(userAccount.businessEntityId)
  if (!businessEntity) {
    throw new Error('Business entity not found')
  }

  await setAuthSession({
    businessId: businessEntity.id,
    email,
    createdAt: Date.now()
  })

  return { businessEntity, userAccount }
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
  await clearAuthSession()
}
