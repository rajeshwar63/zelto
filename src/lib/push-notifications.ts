// src/lib/push-notifications.ts
// Registers device for push notifications and saves FCM token to DB

import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase-client'
import { getAuthSession } from './auth'

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') {
    console.warn('Push notification permission not granted')
    return
  }

  await PushNotifications.register()

  PushNotifications.addListener('registration', async (token) => {
    console.log('FCM Token:', token.value)
    await saveDeviceToken(token.value)
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // App is open — could refresh data via event bus
    console.log('Push received in foreground:', notification)
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    // User tapped notification — could navigate to relevant screen
    console.log('Push tapped:', action.notification.data)
  })

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration failed:', error)
  })
}

async function saveDeviceToken(fcmToken: string): Promise<void> {
  const session = await getAuthSession()
  if (!session) return

  const platform = Capacitor.getPlatform()

  const { error } = await supabase
    .from('device_tokens')
    .upsert({
      user_id: session.userId,
      business_entity_id: session.businessId,
      fcm_token: fcmToken,
      platform,
      updated_at: Date.now(),
    }, {
      onConflict: 'user_id,fcm_token'
    })

  if (error) console.error('Failed to save device token:', error)
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
