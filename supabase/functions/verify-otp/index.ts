import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phoneNumber, code } = await req.json()
    const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const res = await fetch(
      `${supabaseUrl}/rest/v1/otp_codes?phone_number=eq.${encodeURIComponent(formatted)}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    )

    const records = await res.json()
    const record = records[0]

    if (!record) return new Response(JSON.stringify({ error: 'OTP not found' }), { status: 400, headers: corsHeaders })
    if (Date.now() > record.expires_at) return new Response(JSON.stringify({ error: 'OTP expired' }), { status: 400, headers: corsHeaders })
    if (record.otp !== code) return new Response(JSON.stringify({ error: 'Incorrect OTP' }), { status: 400, headers: corsHeaders })

    // Delete used OTP
    await fetch(`${supabaseUrl}/rest/v1/otp_codes?phone_number=eq.${encodeURIComponent(formatted)}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    })

    return new Response(JSON.stringify({ success: true, phoneNumber: formatted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('verify-otp error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders })
  }
})
