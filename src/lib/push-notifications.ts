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

export async function registerPushNotifications(businessEntityId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const messaging = getMessaging(getFirebaseApp())

    const token = await getToken(messaging)

    if (!token) {
      console.error('No FCM token received')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: userAccount, error: userError } = await supabase
      .from('user_accounts')
      .select('id, business_entity_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userError || !userAccount) return

    const { error } = await supabase.from('device_tokens').upsert({
      user_id: userAccount.id,
      business_entity_id: userAccount.business_entity_id,
      fcm_token: token,
      platform: 'android',
      updated_at: Date.now(),
      created_at: Date.now(),
    }, { onConflict: 'fcm_token' })

    if (error) {
      console.error('Failed to save device token:', error)
    } else {
      console.log('Device token saved successfully:', token.substring(0, 20))
    }

    // Still use Capacitor for receiving notifications in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received:', notification)
    })

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push tapped:', action)
    })

  } catch (e) {
    console.error('Push registration error:', e)
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
