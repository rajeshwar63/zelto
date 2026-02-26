import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth'
import { auth } from './firebase'
import { dataStore } from './data-store'
import { BusinessEntity, UserAccount } from './types'

const AUTH_SESSION_KEY = 'zelto:local-auth-session'

// Module-level state for Firebase Phone Auth flow
let confirmationResult: ConfirmationResult | null = null
let recaptchaVerifier: RecaptchaVerifier | null = null
let lastSentPhoneNumber: string | null = null

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

function getRecaptchaVerifier(): RecaptchaVerifier {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    })
  }
  return recaptchaVerifier
}

function formatFirebaseError(error: unknown): string {
  const code = (error as { code?: string }).code
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'Invalid phone number. Please check and try again.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.'
    case 'auth/code-expired':
      return 'Verification code has expired. Please request a new one.'
    case 'auth/invalid-verification-code':
      return 'Invalid verification code. Please check and try again.'
    case 'auth/missing-phone-number':
      return 'Phone number is required.'
    case 'auth/quota-exceeded':
      return 'SMS quota exceeded. Please try again later.'
    default:
      return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  }
}

export async function sendOTP(phoneNumber: string): Promise<void> {
  // Avoid re-sending if already sent for this number and confirmation is active
  if (lastSentPhoneNumber === phoneNumber && confirmationResult) {
    return
  }

  try {
    const verifier = getRecaptchaVerifier()
    confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier)
    lastSentPhoneNumber = phoneNumber
  } catch (error) {
    // Reset verifier on error so it can be recreated for retry
    if (recaptchaVerifier) {
      recaptchaVerifier.clear()
      recaptchaVerifier = null
    }
    confirmationResult = null
    lastSentPhoneNumber = null
    throw new Error(formatFirebaseError(error))
  }
}

export async function confirmOTP(code: string): Promise<void> {
  if (!confirmationResult) {
    throw new Error('No OTP request in progress. Please go back and request a new code.')
  }
  try {
    await confirmationResult.confirm(code)
    confirmationResult = null
    lastSentPhoneNumber = null
  } catch (error) {
    throw new Error(formatFirebaseError(error))
  }
}

export async function resendOTP(phoneNumber: string): Promise<void> {
  // Force a new OTP send by clearing existing state
  confirmationResult = null
  lastSentPhoneNumber = null
  if (recaptchaVerifier) {
    recaptchaVerifier.clear()
    recaptchaVerifier = null
  }
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
