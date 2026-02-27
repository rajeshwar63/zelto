const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FIREBASE_PUBLIC_KEYS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

// Maximum clock skew tolerance in seconds when validating iat
const CLOCK_SKEW_TOLERANCE_SECONDS = 60

// Simple in-memory JWKS cache with TTL derived from Cache-Control max-age
let jwksCache: { keys: Array<{ kid: string } & JsonWebKey> } | null = null
let jwksCacheExpiry = 0

async function getPublicKeys(): Promise<Array<{ kid: string } & JsonWebKey>> {
  if (jwksCache && Date.now() < jwksCacheExpiry) {
    return jwksCache.keys
  }

  const response = await fetch(FIREBASE_PUBLIC_KEYS_URL)
  if (!response.ok) {
    throw new Error('Failed to fetch Firebase public keys')
  }

  // Honour Cache-Control: max-age=N from Google's response
  const cacheControl = response.headers.get('Cache-Control') ?? ''
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/)
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600
  jwksCacheExpiry = Date.now() + maxAge * 1000

  jwksCache = await response.json() as { keys: Array<{ kid: string } & JsonWebKey> }
  return jwksCache.keys
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

interface FirebaseTokenPayload {
  sub: string
  aud: string
  iss: string
  iat: number
  exp: number
  phone_number?: string
}

async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string
): Promise<FirebaseTokenPayload> {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token format')
  }

  const [headerB64, payloadB64, signatureB64] = parts

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)))
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as FirebaseTokenPayload

  const now = Math.floor(Date.now() / 1000)

  if (payload.exp < now) {
    throw new Error('Token has expired')
  }
  if (payload.iat > now + CLOCK_SKEW_TOLERANCE_SECONDS) {
    throw new Error('Token issued in the future')
  }
  if (payload.aud !== projectId) {
    throw new Error('Token audience does not match project')
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Token issuer is invalid')
  }
  if (!payload.sub) {
    throw new Error('Token has no subject')
  }

  // Fetch Firebase public keys (JWKS), with caching
  const keys = await getPublicKeys()

  const signingKey = keys.find(k => k.kid === header.kid)
  if (!signingKey) {
    throw new Error('Signing key not found for token kid')
  }

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    signingKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = base64UrlDecode(signatureB64)

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature,
    signedData
  )

  if (!isValid) {
    throw new Error('Token signature is invalid')
  }

  return payload
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { idToken } = await req.json()

    if (!idToken || typeof idToken !== 'string') {
      return new Response(
        JSON.stringify({ error: 'idToken is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
    if (!projectId) {
      throw new Error('FIREBASE_PROJECT_ID is not configured')
    }

    const payload = await verifyFirebaseIdToken(idToken, projectId)

    return new Response(
      JSON.stringify({ success: true, uid: payload.sub, phone_number: payload.phone_number }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Token verification failed' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
