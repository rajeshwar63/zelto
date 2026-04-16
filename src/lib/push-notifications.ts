// src/lib/push-notifications.ts
// Registers device for push notifications.
// Native (Android/iOS): Uses Capacitor PushNotifications + FCM tokens.
// Web (PWA):            Uses W3C Push API + VAPID for iOS Safari & desktop browsers.

import * as Sentry from '@sentry/react'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase-client'
import { getAuthSession } from './auth'
import { getMessaging } from 'firebase/messaging'
import { getApp, initializeApp } from 'firebase/app'

// ─── Firebase config (native FCM) ───────────────────────────────────────────
const firebaseConfig = {
  apiKey: 'AIzaSyDi88lmNnBmbBQ_kKuL6L2PsQ8cMb1aIQk',
  projectId: 'zelto-87b9f',
  messagingSenderId: '1087219191711',
  appId: '1:1087219191711:android:857f042a120957413077aa',
  storageBucket: 'zelto-87b9f.firebasestorage.app',
}

function getFirebaseApp() {
  try {
    return getApp()
  } catch {
    return initializeApp(firebaseConfig)
  }
}

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

// ─── Shared state ───────────────────────────────────────────────────────────
let listenersRegistered = false
let activeBusinessEntityId: string | null = null
let webPushRegistered = false

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
    console.error('Push token persistence skipped: no authenticated user')
    return
  }

  const { error } = await supabase.from('device_tokens').upsert(
    {
      user_id: account.userId,
      business_entity_id: account.businessEntityId,
      fcm_token: token,
      platform: Capacitor.getPlatform(),
      updated_at: Date.now(),
      created_at: Date.now(),
    },
    { onConflict: 'fcm_token' },
  )

  if (error) {
    console.error('Failed to save device token:', error)
  } else {
    console.log('Device token saved successfully:', token.substring(0, 20))
  }
}

// ─── Native: listeners ──────────────────────────────────────────────────────
function registerPushListeners(): void {
  if (listenersRegistered) return

  PushNotifications.addListener('registration', async (token) => {
    console.log('Push registration success', { tokenPreview: token.value.substring(0, 20) })
    await persistDeviceToken(token.value, activeBusinessEntityId ?? undefined)
  })

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error', {
      code: err.error,
      message: err.error,
      details: err,
    })
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received:', notification)
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('Push tapped:', action)
  })

  listenersRegistered = true
}

// ─── Native: registration ───────────────────────────────────────────────────
async function registerNativePush(businessEntityId: string): Promise<void> {
  if (activeBusinessEntityId === businessEntityId && listenersRegistered) return

  activeBusinessEntityId = businessEntityId

  const permissionStatus = await PushNotifications.checkPermissions()

  if (permissionStatus.receive !== 'granted') {
    const requestStatus = await PushNotifications.requestPermissions()
    if (requestStatus.receive !== 'granted') {
      console.warn('Push notification permission was not granted')
      return
    }
  }

  registerPushListeners()

  // Ensure Firebase messaging is initialized for FCM on native platforms.
  getMessaging(getFirebaseApp())

  await PushNotifications.register()
}

// ─── Web: persist subscription ──────────────────────────────────────────────
async function persistWebPushSubscription(
  subscription: PushSubscription,
  businessEntityId: string,
): Promise<void> {
  const account = await resolveUserAccount(businessEntityId)
  if (!account) {
    console.error('Web push persistence skipped: no authenticated user')
    return
  }

  const subJSON = subscription.toJSON()
  const endpoint = subscription.endpoint
  const p256dh = subJSON.keys?.p256dh ?? ''
  const auth = subJSON.keys?.auth ?? ''

  if (!p256dh || !auth) {
    console.error('Web push subscription missing keys')
    return
  }

  // PostgREST can't match the partial unique index for upsert, so we
  // delete-then-insert instead. Both operations have RLS policies.
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
    console.error('Failed to save web push subscription:', error)
  } else {
    console.log('Web push subscription saved for endpoint:', endpoint.substring(0, 40))
  }
}

// ─── Web: registration ──────────────────────────────────────────────────────
async function registerWebPush(businessEntityId: string): Promise<void> {
  if (webPushRegistered && activeBusinessEntityId === businessEntityId) return

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Web Push not supported in this browser')
    return
  }

  // iOS Safari requires permission request from a user gesture.
  // This is called from handleOTPSuccess / login flow which IS user-initiated.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('Notification permission not granted:', permission)
    return
  }

  // Use the Workbox service worker that's already registered by vite-plugin-pwa.
  // sw-push.js is imported into it via workbox.importScripts — do NOT register
  // a separate SW here or it will conflict with the Workbox one.
  const registration = await navigator.serviceWorker.ready

  // Check for existing subscription first
  let subscription = await registration.pushManager.getSubscription()

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

// ─── Public API ─────────────────────────────────────────────────────────────

export async function registerPushNotifications(businessEntityId: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await registerNativePush(businessEntityId)
    } else {
      await registerWebPush(businessEntityId)
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { flow: Capacitor.isNativePlatform() ? 'fcm_registration' : 'web_push_registration' },
    })
    console.error('Push setup error:', e)
  }
}

export async function removeDeviceTokens(): Promise<void> {
  const session = await getAuthSession()
  if (!session) return

  // Unsubscribe the web push subscription if on web
  if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) await subscription.unsubscribe()
    } catch (e) {
      console.error('Failed to unsubscribe web push:', e)
    }
  }

  const { error } = await supabase.from('device_tokens').delete().eq('user_id', session.userId)
  if (error) console.error('Failed to remove device tokens:', error)

  webPushRegistered = false
  activeBusinessEntityId = null
}
