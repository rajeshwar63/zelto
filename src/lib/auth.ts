import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase-client'
import { dataStore } from './data-store'
import { BusinessEntity, UserAccount } from './types'

const AUTH_SESSION_KEY = 'zelto:local-auth-session'

// Tracks the phone number from the most recent sendOTP call so
// confirmOTP can pass it to verify-otp without changing the public API.
let pendingPhoneNumber: string | null = null

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

async function invokeFunctionOrThrow(fnName: string, body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke(fnName, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const errorBody = await error.context.json().catch(() => ({}))
      throw new Error(errorBody.error || error.message || 'Something went wrong. Please try again.')
    }
    throw new Error(error.message || 'Something went wrong. Please try again.')
  }
}

export async function sendOTP(phoneNumber: string): Promise<void> {
  pendingPhoneNumber = phoneNumber
  await invokeFunctionOrThrow('send-otp', { phoneNumber })
}

export async function confirmOTP(code: string): Promise<void> {
  if (!pendingPhoneNumber) {
    throw new Error('No OTP request in progress. Please go back and request a new code.')
  }

  await invokeFunctionOrThrow('verify-otp', { phoneNumber: pendingPhoneNumber, code })
  pendingPhoneNumber = null
}

export async function resendOTP(phoneNumber: string): Promise<void> {
  await sendOTP(phoneNumber)
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
