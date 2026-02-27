import { supabase } from './supabase-client'
import { dataStore } from './data-store'
import { BusinessEntity, UserAccount } from './types'

const AUTH_SESSION_KEY = 'zelto:local-auth-session'

export interface AuthSession {
  businessId: string
  phoneNumber: string
  createdAt: number
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

export async function checkPhoneNumberExists(phoneNumber: string): Promise<boolean> {
  const accounts = await dataStore.getAllUserAccounts()
  return accounts.some(a => a.phoneNumber === phoneNumber)
}

export async function sendOTP(phoneNumber: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-otp', {
    body: { phoneNumber }
  })
  if (error || data?.error) throw new Error(data?.error || 'Failed to send OTP')
}

export async function verifyOTP(phoneNumber: string, code: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('verify-otp', {
    body: { phoneNumber, code }
  })
  if (error || data?.error) throw new Error(data?.error || 'Invalid OTP')
  return true
}

export async function signupWithPhone(phoneNumber: string, businessName: string): Promise<{ businessEntity: BusinessEntity; userAccount: UserAccount }> {
  const exists = await checkPhoneNumberExists(phoneNumber)
  if (exists) {
    throw new Error('Phone number already registered')
  }

  const businessEntity = await dataStore.createBusinessEntity(businessName)
  const userAccount = await dataStore.createUserAccount(phoneNumber, businessEntity.id)

  await setAuthSession({
    businessId: businessEntity.id,
    phoneNumber,
    createdAt: Date.now()
  })

  return { businessEntity, userAccount }
}

export async function loginWithPhone(phoneNumber: string): Promise<{ businessEntity: BusinessEntity; userAccount: UserAccount }> {
  const accounts = await dataStore.getAllUserAccounts()
  const userAccount = accounts.find(a => a.phoneNumber === phoneNumber)

  if (!userAccount) {
    throw new Error('Phone number not registered')
  }

  const businessEntity = await dataStore.getBusinessEntityById(userAccount.businessEntityId)
  if (!businessEntity) {
    throw new Error('Business entity not found')
  }

  await setAuthSession({
    businessId: businessEntity.id,
    phoneNumber,
    createdAt: Date.now()
  })

  return { businessEntity, userAccount }
}

export async function logout(): Promise<void> {
  await clearAuthSession()
}
