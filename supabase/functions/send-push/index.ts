// supabase/functions/send-push/index.ts
// Triggered by DB webhook when a notification row is inserted.
// Sends push via:
//   - Firebase Cloud Messaging V1 API  (native Android / iOS)
//   - W3C Web Push with VAPID          (PWA / web browsers)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

interface DeviceToken {
  id: string
  fcm_token: string | null
  platform: string
  push_endpoint: string | null
  push_p256dh: string | null
  push_auth: string | null
}

// ─── Startup validation ─────────────────────────────────────────────────────

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

// VAPID keys for Web Push (base64url-encoded)
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = 'mailto:notifications@zelto.in'

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('[send-push] VAPID keys not set — web push will be skipped')
}

if (startupErrors.length > 0) {
  console.error('[send-push] Missing/invalid required env configuration:', startupErrors)
} else {
  console.log('[send-push] Startup env validation passed')
}

// ─── Base64URL helpers ──────────────────────────────────────────────────────

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64urlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4)
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function b64urlEncodeStr(str: string): string {
  return b64urlEncode(new TextEncoder().encode(str))
}

function concatBuffers(...buffers: (Uint8Array | ArrayBuffer)[]): Uint8Array {
  const arrays = buffers.map((b) => (b instanceof Uint8Array ? b : new Uint8Array(b)))
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// ─── FCM V1 access token ───────────────────────────────────────────────────

async function getFcmAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(
    JSON.stringify({
      iss: FCM_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )

  const signInput = `${header}.${payload}`

  const pemContents = FCM_PRIVATE_KEY.replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signInput))

  const jwt = `${signInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// ─── FCM send ───────────────────────────────────────────────────────────────

const NOTIFICATION_TITLES: Record<string, string> = {
  OrderPlaced: 'New Order',
  OrderAccepted: 'Order Accepted',
  OrderDispatched: 'Order Dispatched',
  OrderDelivered: 'Order Delivered',
  OrderDeclined: 'Order Declined',
  PaymentRecorded: 'Payment Received',
  PaymentDisputed: 'Payment Disputed',
  IssueRaised: 'Issue Reported',
  IssueAcknowledged: 'Issue Acknowledged',
  IssueResolved: 'Issue Resolved',
  ConnectionAccepted: 'Connection Accepted',
  MemberJoined: 'New Team Member',
}

async function sendFcm(
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
  accessToken: string,
): Promise<boolean> {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data,
        android: {
          priority: 'high',
          notification: { channel_id: 'zelto_default', sound: 'default' },
        },
      },
    }),
  })

  if (response.ok) return true

  const err = await response.json()
  console.error('FCM send failed:', err)
  return false
}

// ─── Web Push (RFC 8291 + RFC 8188 aes128gcm) ──────────────────────────────

async function createVapidAuth(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin
  const expiry = Math.floor(Date.now() / 1000) + 12 * 3600

  // Decode VAPID keys
  const pubBytes = b64urlDecode(VAPID_PUBLIC_KEY)
  const privBytes = b64urlDecode(VAPID_PRIVATE_KEY)

  // Build JWK for signing (ECDSA P-256)
  const x = b64urlEncode(pubBytes.slice(1, 33))
  const y = b64urlEncode(pubBytes.slice(33, 65))
  const d = b64urlEncode(privBytes)

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const headerB64 = b64urlEncodeStr(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const payloadB64 = b64urlEncodeStr(JSON.stringify({ aud: audience, exp: expiry, sub: VAPID_SUBJECT }))
  const unsignedToken = `${headerB64}.${payloadB64}`

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(unsignedToken),
  )

  const jwt = `${unsignedToken}.${b64urlEncode(sig)}`
  return `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`
}

async function encryptPayload(
  plaintext: string,
  subscriberP256dh: string,
  subscriberAuth: string,
): Promise<Uint8Array> {
  const ptBytes = new TextEncoder().encode(plaintext)
  const uaPublic = b64urlDecode(subscriberP256dh)
  const authSecret = b64urlDecode(subscriberAuth)

  // 1. Ephemeral ECDH key pair
  const localKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKP.publicKey))

  // 2. Import subscriber public key
  const subKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])

  // 3. ECDH shared secret
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: subKey }, localKP.privateKey, 256))

  // 4. Derive IKM (RFC 8291 §3.4)
  //    IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info\0" || ua_public || as_public, L=32)
  const keyInfo = concatBuffers(new TextEncoder().encode('WebPush: info\0'), uaPublic, localPubRaw)
  const ikmKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits'])
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfo }, ikmKey, 256),
  )

  // 5. Random 16-byte salt for content encryption
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // 6. Derive CEK and nonce (RFC 8188)
  const ikmHkdf = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0')
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0')

  const cek = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo }, ikmHkdf, 128),
  )
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, ikmHkdf, 96),
  )

  // 7. Encrypt (AES-128-GCM) with \x02 padding delimiter
  const padded = concatBuffers(ptBytes, new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded))

  // 8. Build aes128gcm record: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false)

  return concatBuffers(salt, rs, new Uint8Array([localPubRaw.length]), localPubRaw, encrypted)
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
): Promise<boolean> {
  const payloadStr = JSON.stringify(payload)
  const encrypted = await encryptPayload(payloadStr, subscription.p256dh, subscription.auth)
  const authorization = await createVapidAuth(subscription.endpoint)

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Authorization: authorization,
    },
    body: encrypted,
  })

  if (response.status === 201 || response.status === 200) return true

  const errText = await response.text()
  console.error(`Web push failed (${response.status}):`, errText)
  return false
}

// ─── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  try {
    if (startupErrors.length > 0) {
      return new Response(JSON.stringify({ error: 'Server misconfigured', missing: startupErrors }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { record } = await req.json()

    const recipientBusinessId = record.recipient_business_id
    const rawMessage = record.message as string
    const type = record.type

    // Split encoded title|body. If no pipe, fall back to type-based title.
    const pipeIndex = rawMessage.indexOf('|')
    const title = pipeIndex >= 0
      ? rawMessage.slice(0, pipeIndex)
      : (NOTIFICATION_TITLES[type] || 'Zelto')
    const message = pipeIndex >= 0
      ? rawMessage.slice(pipeIndex + 1)
      : rawMessage

    const pushData = {
      type,
      connection_id: record.connection_id,
      related_entity_id: record.related_entity_id,
    }

    // Get all device tokens (FCM + Web Push) for recipient
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('id, fcm_token, platform, push_endpoint, push_p256dh, push_auth')
      .eq('business_entity_id', recipientBusinessId)

    if (error || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_tokens' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Split tokens into FCM (native) and Web Push
    const fcmTokens = tokens.filter((t: DeviceToken) => t.fcm_token && t.platform !== 'web')
    const webPushTokens = tokens.filter(
      (t: DeviceToken) => t.platform === 'web' && t.push_endpoint && t.push_p256dh && t.push_auth,
    )

    let successCount = 0
    const staleTokenIds: string[] = []

    // ── Send via FCM (native devices) ──
    if (fcmTokens.length > 0) {
      const accessToken = await getFcmAccessToken()

      for (const token of fcmTokens) {
        try {
          const ok = await sendFcm(token.fcm_token!, title, message, pushData, accessToken)
          if (ok) {
            successCount++
          } else {
            staleTokenIds.push(token.id)
          }
        } catch (err) {
          console.error('FCM send error:', err)
        }
      }
    }

    // ── Send via Web Push (PWA / browsers) ──
    if (webPushTokens.length > 0 && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      for (const token of webPushTokens) {
        try {
          const ok = await sendWebPush(
            {
              endpoint: token.push_endpoint!,
              p256dh: token.push_p256dh!,
              auth: token.push_auth!,
            },
            { title, body: message, tag: `zelto-${type}`, data: pushData },
          )
          if (ok) {
            successCount++
          } else {
            staleTokenIds.push(token.id)
          }
        } catch (err) {
          console.error('Web push send error:', err)
        }
      }
    }

    // Clean up stale / invalid tokens
    if (staleTokenIds.length > 0) {
      await supabase.from('device_tokens').delete().in('id', staleTokenIds)
    }

    return new Response(JSON.stringify({ sent: successCount, total: tokens.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
