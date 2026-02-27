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
    const { phoneNumber } = await req.json()

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return new Response(
        JSON.stringify({ error: 'phoneNumber is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authKey = Deno.env.get('MSG91_AUTH_KEY')
    if (!authKey) {
      throw new Error('MSG91_AUTH_KEY is not configured')
    }

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Store OTP in Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Delete any existing OTP for this phone number
    await supabase.from('otp_codes').delete().eq('phone_number', phoneNumber)

    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({ phone_number: phoneNumber, otp_code: otp, expires_at: expiresAt })

    if (insertError) {
      throw new Error(`Failed to store OTP: ${insertError.message}`)
    }

    // Strip leading '+' for MSG91
    const recipientNumber = phoneNumber.replace(/^\+/, '')

    const msg91Response = await fetch(
      'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authkey': authKey,
        },
        body: JSON.stringify({
          integrated_number: '15557443470',
          content_type: 'template',
          payload: {
            messaging_product: 'whatsapp',
            type: 'template',
            template: {
              name: 'zelto_otp',
              language: {
                code: 'en',
                policy: 'deterministic',
              },
              namespace: '1533d919_ca1e_4004_ba6c_deb567d9e79b',
              to_and_components: [
                {
                  to: [recipientNumber],
                  components: {
                    body_1: {
                      type: 'text',
                      value: otp,
                    },
                  },
                },
              ],
            },
          },
        }),
      }
    )

    if (!msg91Response.ok) {
      const errorText = await msg91Response.text()
      throw new Error(`MSG91 API error: ${errorText}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to send OTP' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
