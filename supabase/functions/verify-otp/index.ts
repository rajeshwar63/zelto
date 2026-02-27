import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const FIREBASE_API_KEY = Deno.env.get('FIREBASE_API_KEY')!

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { sessionInfo, code } = await req.json()

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionInfo, code })
    }
  )

  const data = await res.json()
  if (!res.ok) return new Response(JSON.stringify({ error: data.error?.message }), { status: 400, headers: corsHeaders })

  return new Response(JSON.stringify({ success: true, phoneNumber: data.phoneNumber }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
