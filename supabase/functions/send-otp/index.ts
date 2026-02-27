import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const FIREBASE_API_KEY = Deno.env.get('FIREBASE_API_KEY')!

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { phoneNumber } = await req.json()
  const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: formatted, recaptchaToken: 'skip' })
    }
  )

  const data = await res.json()
  if (!res.ok) return new Response(JSON.stringify({ error: data.error?.message }), { status: 400, headers: corsHeaders })

  return new Response(JSON.stringify({ sessionInfo: data.sessionInfo }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
