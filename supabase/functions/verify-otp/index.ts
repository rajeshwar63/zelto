import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber, code } = await req.json()

    if (!phoneNumber || !code) {
      return new Response(
        JSON.stringify({ error: 'Phone number and code are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Retrieve the sessionInfo stored during send-otp
    const { data: session, error: fetchError } = await supabase
      .from('otp_sessions')
      .select('session_info, expires_at')
      .eq('phone_number', phoneNumber)
      .single()

    if (fetchError || !session) {
      return new Response(
        JSON.stringify({ error: 'No OTP session found. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('otp_sessions').delete().eq('phone_number', phoneNumber)
      return new Response(
        JSON.stringify({ error: 'OTP has expired. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('FIREBASE_API_KEY')
    if (!apiKey) {
      throw new Error('Firebase API key not configured')
    }

    // Verify the OTP code using Firebase Auth REST API.
    // sessionInfo from the send step ties these two calls together server-side.
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionInfo: session.session_info,
          code,
          phoneNumber,
        }),
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

    // Delete the used OTP session to prevent replay attacks
    await supabase.from('otp_sessions').delete().eq('phone_number', phoneNumber)

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
  if (message.includes('INVALID_CODE') || message.includes('INVALID_SESSION_INFO')) {
    return 'Invalid verification code. Please check and try again.'
  }
  if (message.includes('SESSION_EXPIRED') || message.includes('CODE_EXPIRED')) {
    return 'Verification code has expired. Please request a new one.'
  }
  if (message.includes('TOO_MANY_ATTEMPTS')) {
    return 'Too many attempts. Please wait and try again.'
  }
  return message || 'Verification failed. Please try again.'
}
