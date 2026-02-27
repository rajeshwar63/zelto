import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const FIREBASE_API_KEY = Deno.env.get('FIREBASE_API_KEY')!

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phoneNumber } = await req.json()
    const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`

    // Use Firebase Auth REST API with test mode
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: formatted,
          recaptchaToken: 'test-token'
        })
      }
    )

    const data = await res.json()
    console.log('Firebase send-otp response:', JSON.stringify(data))

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data.error?.message || 'Failed to send OTP' }),
        { status: 400, headers: corsHeaders }
      )
    }

    return new Response(
      JSON.stringify({ sessionInfo: data.sessionInfo }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-otp error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    )
  }
})
