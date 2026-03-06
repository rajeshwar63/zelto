import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase-client'
import { getAuthSession } from './auth'

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  // Request permission
  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') {
    console.warn('Push notification permission not granted')
    return
  }

  // Register with FCM
  await PushNotifications.register()

  // Listen for token
  PushNotifications.addListener('registration', async (token) => {
    console.log('FCM Token:', token.value)
    await saveDeviceToken(token.value)
  })

  // Listen for push received while app is open
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received:', notification)
    // Could trigger data-events to refresh UI
  })

  // Listen for push tap (app opened from notification)
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('Push action:', action)
    // Navigate to relevant screen based on action.notification.data
  })

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error)
  })
}

async function saveDeviceToken(fcmToken: string): Promise<void> {
  const session = await getAuthSession()
  if (!session) return

  const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web'

  // Upsert token
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

export async function removeDeviceToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  // Called on logout — remove this device's token
  const session = await getAuthSession()
  if (!session) return

  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', session.userId)

  if (error) console.error('Failed to remove device token:', error)
}
