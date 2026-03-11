// supabase/functions/send-push/index.ts
// Triggered by DB webhook when a notification row is inserted
// Sends push via Firebase Cloud Messaging V1 API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

const startupErrors: string[] = []

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
if (!SUPABASE_URL) startupErrors.push('SUPABASE_URL')

const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!SUPABASE_SERVICE_KEY) startupErrors.push('SUPABASE_SERVICE_ROLE_KEY')

let FCM_PROJECT_ID = ''
let FCM_CLIENT_EMAIL = ''
let FCM_PRIVATE_KEY = ''

const fcmServiceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT')
if (!fcmServiceAccountRaw) {
  startupErrors.push('FCM_SERVICE_ACCOUNT')
} else {
  try {
    const parsed = JSON.parse(fcmServiceAccountRaw) as ServiceAccount

    if (!parsed.project_id) startupErrors.push('FCM_SERVICE_ACCOUNT.project_id')
    if (!parsed.client_email) startupErrors.push('FCM_SERVICE_ACCOUNT.client_email')
    if (!parsed.private_key) startupErrors.push('FCM_SERVICE_ACCOUNT.private_key')

    FCM_PROJECT_ID = parsed.project_id
    FCM_CLIENT_EMAIL = parsed.client_email
    FCM_PRIVATE_KEY = parsed.private_key
  } catch (error) {
    console.error('[send-push] FCM_SERVICE_ACCOUNT is not valid JSON:', error)
    startupErrors.push('FCM_SERVICE_ACCOUNT (valid JSON)')
  }
}

if (startupErrors.length > 0) {
  console.error('[send-push] Missing/invalid required env configuration:', startupErrors)
} else {
  console.log('[send-push] Startup env validation passed')
}

// Get OAuth2 access token for FCM V1 API
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    iss: FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))

  const signInput = `${header}.${payload}`

  // Import private key
  const pemContents = FCM_PRIVATE_KEY
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput)
  )

  const jwt = `${signInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

const NOTIFICATION_TITLES: Record<string, string> = {
  'OrderPlaced': 'New Order',
  'OrderDispatched': 'Order Dispatched',
  'OrderDeclined': 'Order Declined',
  'PaymentRecorded': 'Payment Received',
  'PaymentDisputed': 'Payment Disputed',
  'IssueRaised': 'Issue Reported',
  'ConnectionAccepted': 'Connection Accepted',
}

serve(async (req) => {
  try {
    if (startupErrors.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured', missing: startupErrors }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { record } = await req.json()

    const recipientBusinessId = record.recipient_business_id
    const message = record.message
    const type = record.type

    // Get device tokens for recipient business
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('fcm_token')
      .eq('business_entity_id', recipientBusinessId)

    if (error || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_tokens' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getAccessToken()
    const title = NOTIFICATION_TITLES[type] || 'Zelto'
    let successCount = 0

    // Send to each device individually (FCM V1 requires individual sends)
    for (const { fcm_token } of tokens) {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token: fcm_token,
                notification: {
                  title,
                  body: message,
                },
                data: {
                  type: type,
                  connection_id: record.connection_id,
                  related_entity_id: record.related_entity_id,
                },
                android: {
                  priority: 'high',
                  notification: {
                    channel_id: 'zelto_default',
                    sound: 'default',
                  },
                },
              },
            }),
          }
        )

        if (response.ok) {
          successCount++
        } else {
          const err = await response.json()
          console.error('FCM send failed:', err)

          // Remove invalid tokens
          if (err?.error?.details?.some((d: any) =>
            d.errorCode === 'UNREGISTERED' || d.errorCode === 'INVALID_ARGUMENT'
          )) {
            await supabase
              .from('device_tokens')
              .delete()
              .eq('fcm_token', fcm_token)
          }
        }
      } catch (sendErr) {
        console.error('FCM send error:', sendErr)
      }
    }

    return new Response(
      JSON.stringify({ sent: successCount, total: tokens.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
