// src/lib/push-notifications.ts
// Registers device for push notifications.
// Native (Android): Uses Capacitor PushNotifications + FCM tokens.
// Web (PWA / desktop): Uses W3C Push API + VAPID.
//
// IMPORTANT: On iOS Safari, permission MUST be requested from a direct user
// gesture. That's why registerPushNotifications() only does the "silent" work
// (checks state, stores business id). The actual subscribe + permission
// prompt happens in requestPushPermissionFromUserGesture() which MUST be
// called from an onClick handler.

import * as Sentry from '@sentry/react'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase-client'
import { getAuthSession } from './auth'

// ─── VAPID public key for Web Push ──────────────────────────────────────────
const VAPID_PUBLIC_KEY =
  'BEzwJ8no_F0goyL-F5iNk_bqOW_BnIM00mnnaKESDNrEiLdJY1BF9RGnapKELWhholkCHFINW2jAMzf2BG_dwS4'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const out = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i)
  return out
}

// ─── Diagnostic state (exposed for debug screen) ────────────────────────────
export type PushDiagnostic = {
  platform: string
  isStandalone: boolean
  isIos: boolean
  pushSupported: boolean
  permissionStatus: string
  serviceWorkerReady: boolean
  registrationAttempted: boolean
  registrationSucceeded: boolean
  tokenSavedToDb: boolean
  lastError: string | null
  tokenPreview: string | null
  lastUpdatedAt: number | null
}

const diagnostic: PushDiagnostic = {
  platform: Capacitor.getPlatform(),
  isStandalone: false,
  isIos: false,
  pushSupported: false,
  permissionStatus: 'unknown',
  serviceWorkerReady: false,
  registrationAttempted: false,
  registrationSucceeded: false,
  tokenSavedToDb: false,
  lastError: null,
  tokenPreview: null,
  lastUpdatedAt: null,
}

function updateDiagnostic(patch: Partial<PushDiagnostic>) {
  Object.assign(diagnostic, patch, { lastUpdatedAt: Date.now() })
}

function recordError(where: string, err: unknown) {
  const msg = err instanceof Error ? `${where}: ${err.message}` : `${where}: ${String(err)}`
  updateDiagnostic({ lastError: msg })
  console.error('[push]', msg, err)
  Sentry.captureException(err, { tags: { flow: where } })
}

export function getPushDiagnostic(): PushDiagnostic {
  return {
    ...diagnostic,
    isStandalone: isRunningAsStandalonePwa(),
    isIos: isIosDevice(),
    pushSupported: isPushSupported(),
    permissionStatus:
      typeof Notification !== 'undefined' ? Notification.permission : 'unavailable',
  }
}

// ─── Shared state ───────────────────────────────────────────────────────────
let listenersRegistered = false
let activeBusinessEntityId: string | null = null
let webPushRegistered = false

// ─── Platform detection helpers ─────────────────────────────────────────────
export function isRunningAsStandalonePwa(): boolean {
  if (Capacitor.isNativePlatform()) return false
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  // iOS Safari uses navigator.standalone (non-standard, not in TS DOM lib)
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  return false
}

export function isIosDevice(): boolean {
  if (Capacitor.isNativePlatform()) return false
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua)
}

export function isPushSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// ─── Resolve current user_account row ───────────────────────────────────────
async function resolveUserAccount(businessEntityId?: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userAccount, error } = await supabase
    .from('user_accounts')
    .select('id, business_entity_id')
    .eq('auth_user_id', user.id)
    .single()

  if (error || !userAccount) return null

  return {
    userId: userAccount.id,
    businessEntityId: businessEntityId ?? userAccount.business_entity_id,
  }
}

// ─── Native: persist FCM token ──────────────────────────────────────────────
async function persistDeviceToken(token: string, businessEntityId?: string): Promise<void> {
  const account = await resolveUserAccount(businessEntityId)
  if (!account) {
    recordError('fcm_persist', new Error('no authenticated user'))
    return
  }

  // Clean up any stale rows for this user on this platform first.
  // This handles the reinstall case where the old fcm_token is still in the
  // table but useless. Without this, the unique index (user_id, fcm_token)
  // would leave orphan rows forever.
  const platform = Capacitor.getPlatform()
  const { error: cleanupError } = await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', account.userId)
    .eq('platform', platform)
    .neq('fcm_token', token)

  if (cleanupError) {
    console.warn('[push] cleanup of stale tokens failed (non-fatal):', cleanupError)
  }

  // Upsert using the ACTUAL unique index: (user_id, fcm_token).
  // The old code used onConflict: 'fcm_token' which doesn't match any index.
  const { error } = await supabase.from('device_tokens').upsert(
    {
      user_id: account.userId,
      business_entity_id: account.businessEntityId,
      fcm_token: token,
      platform,
      updated_at: Date.now(),
      created_at: Date.now(),
    },
    { onConflict: 'user_id,fcm_token' },
  )

  if (error) {
    recordError('fcm_persist', error)
    updateDiagnostic({ tokenSavedToDb: false })
    return
  }

  updateDiagnostic({
    tokenSavedToDb: true,
    tokenPreview: token.substring(0, 20) + '…',
    registrationSucceeded: true,
  })
  console.log('[push] FCM token saved:', token.substring(0, 20))
}

// ─── Native: listeners ──────────────────────────────────────────────────────
function registerPushListeners(): void {
  if (listenersRegistered) return

  PushNotifications.addListener('registration', async (token) => {
    console.log('[push] FCM registration success', token.value.substring(0, 20))
    updateDiagnostic({ registrationSucceeded: true, tokenPreview: token.value.substring(0, 20) + '…' })
    await persistDeviceToken(token.value, activeBusinessEntityId ?? undefined)
  })

  PushNotifications.addListener('registrationError', (err) => {
    recordError('fcm_registration', new Error(JSON.stringify(err)))
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[push] received:', notification)
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[push] tapped:', action)
  })

  listenersRegistered = true
}

// ─── Native: registration ───────────────────────────────────────────────────
async function registerNativePush(businessEntityId: string): Promise<void> {
  if (activeBusinessEntityId === businessEntityId && listenersRegistered && diagnostic.tokenSavedToDb) {
    return
  }

  activeBusinessEntityId = businessEntityId
  updateDiagnostic({ registrationAttempted: true })

  const permissionStatus = await PushNotifications.checkPermissions()
  updateDiagnostic({ permissionStatus: permissionStatus.receive })

  if (permissionStatus.receive !== 'granted') {
    const requestStatus = await PushNotifications.requestPermissions()
    updateDiagnostic({ permissionStatus: requestStatus.receive })
    if (requestStatus.receive !== 'granted') {
      recordError('fcm_permission', new Error('permission not granted: ' + requestStatus.receive))
      return
    }
  }

  registerPushListeners()

  // DO NOT call getMessaging() or any firebase/messaging APIs here.
  // On native Android, FCM is bootstrapped by google-services.json via the
  // gradle plugin. The web SDK call would throw and prevent .register() from
  // running, which is the original bug causing zero Android tokens in DB.
  await PushNotifications.register()
}

// ─── Web: persist subscription ──────────────────────────────────────────────
async function persistWebPushSubscription(
  subscription: PushSubscription,
  businessEntityId: string,
): Promise<void> {
  const account = await resolveUserAccount(businessEntityId)
  if (!account) {
    recordError('web_push_persist', new Error('no authenticated user'))
    return
  }

  const subJSON = subscription.toJSON()
  const endpoint = subscription.endpoint
  const p256dh = subJSON.keys?.p256dh ?? ''
  const auth = subJSON.keys?.auth ?? ''

  if (!p256dh || !auth) {
    recordError('web_push_persist', new Error('subscription missing keys'))
    return
  }

  // Delete-then-insert: PostgREST can't match a partial unique index for upsert,
  // and we want only one 'web' row per user at any time.
  await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', account.userId)
    .eq('platform', 'web')

  const { error } = await supabase.from('device_tokens').insert({
    user_id: account.userId,
    business_entity_id: account.businessEntityId,
    platform: 'web',
    push_endpoint: endpoint,
    push_p256dh: p256dh,
    push_auth: auth,
    updated_at: Date.now(),
    created_at: Date.now(),
  })

  if (error) {
    recordError('web_push_persist', error)
    updateDiagnostic({ tokenSavedToDb: false })
    return
  }

  updateDiagnostic({
    tokenSavedToDb: true,
    registrationSucceeded: true,
    tokenPreview: endpoint.substring(0, 40) + '…',
  })
  console.log('[push] Web push subscription saved:', endpoint.substring(0, 40))
}

// ─── Web: registration (ONLY called from user-gesture handler) ──────────────
async function subscribeWebPush(businessEntityId: string): Promise<void> {
  if (!isPushSupported()) {
    recordError('web_push_subscribe', new Error('Push API not supported'))
    return
  }

  updateDiagnostic({ registrationAttempted: true })

  // iOS Safari blocks notifications when PWA is run in a regular Safari tab.
  // It only works when launched from Home Screen (standalone mode).
  if (isIosDevice() && !isRunningAsStandalonePwa()) {
    recordError(
      'web_push_subscribe',
      new Error('iOS requires Add to Home Screen then launch from icon'),
    )
    return
  }

  // MUST be called from a user-gesture context on iOS Safari.
  const permission = await Notification.requestPermission()
  updateDiagnostic({ permissionStatus: permission })
  if (permission !== 'granted') {
    recordError('web_push_permission', new Error('permission: ' + permission))
    return
  }

  // Workbox SW is already registered by vite-plugin-pwa and imports sw-push.js.
  const registration = await navigator.serviceWorker.ready
  updateDiagnostic({ serviceWorkerReady: true })

  let subscription = await registration.pushManager.getSubscription()

  // If there's a stale subscription with a different VAPID key, unsubscribe
  // and re-subscribe. This handles the case where VAPID_PUBLIC_KEY was rotated.
  if (subscription) {
    const currentKey = subscription.options.applicationServerKey
    const expectedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    if (!currentKey || !buffersEqual(currentKey, expectedKey)) {
      await subscription.unsubscribe()
      subscription = null
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  await persistWebPushSubscription(subscription, businessEntityId)

  activeBusinessEntityId = businessEntityId
  webPushRegistered = true
}

function buffersEqual(a: ArrayBuffer, b: Uint8Array | ArrayBuffer): boolean {
  const aa = new Uint8Array(a)
  const bb = b instanceof Uint8Array ? b : new Uint8Array(b)
  if (aa.byteLength !== bb.byteLength) return false
  for (let i = 0; i < aa.byteLength; i++) if (aa[i] !== bb[i]) return false
  return true
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true if push is actually set up right now, based on real browser
 * state (not the in-memory diagnostic flag). Safe to call on every mount —
 * the permission and subscription lookups are cheap.
 *
 * Use this instead of getPushDiagnostic().tokenSavedToDb to decide whether
 * to show the "Enable notifications" banner. The diagnostic flag resets to
 * false on every page load (module state is not persisted), while the real
 * subscription persists across reloads in the browser.
 */
export async function isPushActuallyEnabled(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await PushNotifications.checkPermissions()
      return status.receive === 'granted'
    }

    if (!isPushSupported()) return false
    if (typeof Notification === 'undefined') return false
    if (Notification.permission !== 'granted') return false

    // Permission alone is necessary but not sufficient — user might have
    // revoked the subscription via browser settings, or the SW might have
    // been unregistered. Check the actual PushSubscription exists.
    if (!('serviceWorker' in navigator)) return false
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    // Any failure (SW not ready, API access denied, etc.) → treat as not
    // enabled. The banner will prompt the user; worst case is one extra
    // tap on a functioning subscription, which is harmless.
    return false
  }
}

/**
 * Called at login (handleOTPSuccess). Does silent work only:
 * - On native: this IS safe to call — it triggers the system permission
 *   prompt which Android shows as a normal dialog.
 * - On web: stores businessEntityId and reports capability status, but does
 *   NOT call Notification.requestPermission (iOS Safari would deny it).
 *   The user must then tap "Enable notifications" in Profile.
 */
export async function registerPushNotifications(businessEntityId: string): Promise<void> {
  try {
    activeBusinessEntityId = businessEntityId

    if (Capacitor.isNativePlatform()) {
      await registerNativePush(businessEntityId)
    } else {
      // Web: just refresh capability diagnostic, don't prompt.
      updateDiagnostic({
        permissionStatus:
          typeof Notification !== 'undefined' ? Notification.permission : 'unavailable',
      })
      // If permission was already granted in a previous session, re-subscribe
      // silently — no user gesture needed when permission is already 'granted'.
      if (
        isPushSupported() &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        await subscribeWebPush(businessEntityId)
      }
    }
  } catch (e) {
    recordError('register_push_notifications', e)
  }
}

/**
 * Must be called from a user-gesture onClick handler (button tap).
 * This is the one that triggers the iOS permission prompt.
 */
export async function requestPushPermissionFromUserGesture(
  businessEntityId: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (Capacitor.isNativePlatform()) {
      await registerNativePush(businessEntityId)
      return diagnostic.tokenSavedToDb
        ? { ok: true }
        : { ok: false, reason: diagnostic.lastError ?? 'unknown' }
    }

    if (!isPushSupported()) {
      return { ok: false, reason: 'Push notifications not supported on this browser' }
    }
    if (isIosDevice() && !isRunningAsStandalonePwa()) {
      return {
        ok: false,
        reason: 'On iOS, add Zelto to your Home Screen and open it from there first.',
      }
    }

    await subscribeWebPush(businessEntityId)
    return diagnostic.tokenSavedToDb
      ? { ok: true }
      : { ok: false, reason: diagnostic.lastError ?? 'unknown' }
  } catch (e) {
    recordError('request_permission_user_gesture', e)
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function removeDeviceTokens(): Promise<void> {
  const session = await getAuthSession()
  if (!session) return

  if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) await subscription.unsubscribe()
    } catch (e) {
      console.error('[push] Failed to unsubscribe web push:', e)
    }
  }

  const { error } = await supabase.from('device_tokens').delete().eq('user_id', session.userId)
  if (error) console.error('[push] Failed to remove device tokens:', error)

  webPushRegistered = false
  activeBusinessEntityId = null
  updateDiagnostic({
    tokenSavedToDb: false,
    registrationSucceeded: false,
    tokenPreview: null,
  })
}
