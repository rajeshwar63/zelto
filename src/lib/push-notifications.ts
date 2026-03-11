// src/lib/push-notifications.ts
// Registers device for push notifications and saves FCM token to DB

import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase-client'
import { getAuthSession } from './auth'
import { getMessaging, getToken } from 'firebase/messaging'
import { getApp, initializeApp } from 'firebase/app'

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

let listenersRegistered = false
let activeBusinessEntityId: string | null = null

export async function registerPushNotifications(businessEntityId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (activeBusinessEntityId === businessEntityId && listenersRegistered) return

  try {
    const permissionStatus = await PushNotifications.checkPermissions()

    if (permissionStatus.receive !== 'granted') {
      const requestStatus = await PushNotifications.requestPermissions()

      if (requestStatus.receive !== 'granted') {
        console.warn('Push notification permission was not granted')
        return
      }
    }

    await PushNotifications.register()

    const messaging = getMessaging(getFirebaseApp())

let listenersRegistered = false
let activeBusinessEntityId: string | null = null

async function persistDeviceToken(token: string, businessEntityId?: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error('Push token persistence skipped: no authenticated user')
    return
  }

  const { data: userAccount, error: userError } = await supabase
    .from('user_accounts')
    .select('id, business_entity_id')
    .eq('auth_user_id', user.id)
    .single()

  if (userError || !userAccount) {
    console.error('Push token persistence failed to resolve user account', {
      userError,
      authUserId: user.id,
    })
    return
  }

  const resolvedBusinessEntityId = businessEntityId ?? userAccount.business_entity_id

  const { error } = await supabase.from('device_tokens').upsert(
    {
      user_id: userAccount.id,
      business_entity_id: resolvedBusinessEntityId,
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

function registerPushListeners(): void {
  if (listenersRegistered) return

    activeBusinessEntityId = businessEntityId

    if (!listenersRegistered) {
      // Still use Capacitor for receiving notifications in foreground
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received:', notification)
      })

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Push tapped:', action)
      })

      listenersRegistered = true
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

export async function registerPushNotifications(businessEntityId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  activeBusinessEntityId = businessEntityId

  try {
    registerPushListeners()

    const permissionStatus = await PushNotifications.requestPermissions()

    if (permissionStatus.receive !== 'granted') {
      console.error('Push notification permission not granted', permissionStatus)
      return
    }

    await PushNotifications.register()
  } catch (e) {
    console.error('Push setup error:', e)
  }
}

export async function removeDeviceTokens(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  const session = await getAuthSession()
  if (!session) return

  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', session.userId)

  if (error) console.error('Failed to remove device tokens:', error)
}
