// src/lib/push-notifications.ts
// Registers device for push notifications and saves FCM token to DB

import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase-client'
import { getAuthSession } from './auth'

export async function registerPushNotifications(businessEntityId: string): Promise<void> {
  console.log('Registering push notifications for:', businessEntityId)

  if (!businessEntityId) {
    console.error('No businessEntityId provided for push registration')
    return
  }

  if (!Capacitor.isNativePlatform()) return

  const permission = await PushNotifications.requestPermissions()
  console.log('Push permission:', permission.receive)
  if (permission.receive !== 'granted') {
    console.warn('Push notification permission not granted')
    return
  }

  await PushNotifications.register()

  PushNotifications.addListener('registration', async (token) => {
    console.log('FCM token received:', token.value)

    // Get the current auth user ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('No authenticated user found')
      return
    }

    // Get the user_account id for this auth user
    const { data: userAccount, error: userError } = await supabase
      .from('user_accounts')
      .select('id, business_entity_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userError || !userAccount) {
      console.error('Failed to get user account:', userError)
      return
    }

    const { error } = await supabase.from('device_tokens').upsert({
      user_id: userAccount.id,
      business_entity_id: userAccount.business_entity_id,
      fcm_token: token.value,
      platform: 'android',
      updated_at: Date.now(),
      created_at: Date.now(),
    }, { onConflict: 'fcm_token' })

    if (error) {
      console.error('Failed to save device token:', error)
    } else {
      console.log('Device token saved successfully')
    }
  })

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', JSON.stringify(error))
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // App is open — could refresh data via event bus
    console.log('Push received in foreground:', notification)
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    // User tapped notification — could navigate to relevant screen
    console.log('Push tapped:', action.notification.data)
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
