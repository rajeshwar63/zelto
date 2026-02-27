import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { JWT } from 'npm:google-auth-library'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber } = await req.json()

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!serviceAccountJson) {
      throw new Error('Firebase service account not configured')
    }
    const serviceAccount = JSON.parse(serviceAccountJson)

    const apiKey = Deno.env.get('FIREBASE_API_KEY')
    if (!apiKey) {
      throw new Error('Firebase API key not configured')
    }

    // Obtain an OAuth2 access token using the service account credentials.
    // Firebase Admin credentials bypass the reCAPTCHA requirement when calling
    // the Identity Toolkit REST API server-to-server.
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase'],
    })
    const { token: accessToken } = await jwtClient.getAccessToken()

    if (!accessToken) {
      throw new Error('Failed to obtain Firebase admin access token')
    }

    // Send verification code via Firebase Auth REST API.
    // Using the admin OAuth2 token in the Authorization header bypasses reCAPTCHA,
    // since this is a trusted server-to-server call.
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ phoneNumber }),
      }
    )

    const firebaseData = await firebaseResponse.json()

    if (!firebaseResponse.ok) {
      const errorMessage = mapFirebaseError(firebaseData.error?.message || '')
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { sessionInfo } = firebaseData

    // Store sessionInfo in Supabase so verify-otp can use it.
    // sessionInfo is a Firebase token that ties the send and verify calls together.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: dbError } = await supabase
      .from('otp_sessions')
      .upsert(
        {
          phone_number: phoneNumber,
          session_info: sessionInfo,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
        { onConflict: 'phone_number' }
      )

    if (dbError) {
      throw new Error('Failed to store OTP session')
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function mapFirebaseError(message: string): string {
  if (message.includes('INVALID_PHONE_NUMBER')) {
    return 'Invalid phone number. Please check and try again.'
  }
  if (message.includes('TOO_MANY_ATTEMPTS_TRY_LATER') || message.includes('QUOTA_EXCEEDED')) {
    return 'Too many attempts. Please wait a few minutes and try again.'
  }
  if (message.includes('MISSING_PHONE_NUMBER')) {
    return 'Phone number is required.'
  }
  return message || 'Failed to send verification code. Please try again.'
}
