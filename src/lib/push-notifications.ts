// src/lib/push-notifications.ts
// Registers device for push notifications and saves FCM token to DB

import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase-client'
import { getAuthSession } from './auth'

export async function registerPushNotifications(businessEntityId: string): Promise<void> {
  alert('Step 1: Starting registration for: ' + businessEntityId)

  await PushNotifications.removeAllListeners()
  alert('Step 2: Listeners cleared')

  PushNotifications.addListener('registration', async (token) => {
    alert('Step 5: Token received: ' + token.value.substring(0, 20))
  })

  PushNotifications.addListener('registrationError', (err) => {
    alert('Step 5 ERROR: ' + JSON.stringify(err))
  })

  alert('Step 3: Listeners added, calling requestPermissions')

  const permission = await PushNotifications.requestPermissions()
  alert('Step 4: Permission result: ' + permission.receive)

  if (permission.receive !== 'granted') return

  await PushNotifications.register()
  alert('Step 4b: register() called')
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
