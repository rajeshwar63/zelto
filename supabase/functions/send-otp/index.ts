import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { initializeApp, cert, getApps } from 'npm:firebase-admin/app'
import { getAuth } from 'npm:firebase-admin/auth'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phoneNumber } = await req.json()
    const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`

    // Generate a custom OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // Store OTP temporarily (expires in 10 minutes)
    const expiresAt = Date.now() + 10 * 60 * 1000

    // Send SMS via Firebase Admin
    await getAuth().createCustomToken(formatted)

    // Use Firebase Admin to send SMS via a direct approach
    // Store the OTP in a Supabase table for verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    await fetch(`${supabaseUrl}/rest/v1/otp_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ phone_number: formatted, otp, expires_at: expiresAt })
    })

    // Send SMS via Fast2SMS (free Indian SMS provider)
    const smsRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': Deno.env.get('FAST2SMS_API_KEY')!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        route: 'otp',
        variables_values: otp,
        numbers: formatted.replace('+91', '')
      })
    })

    const smsData = await smsRes.json()
    console.log('Fast2SMS response:', JSON.stringify(smsData))

    if (!smsData.return) {
      return new Response(JSON.stringify({ error: 'Failed to send SMS' }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-otp error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders })
  }
})
