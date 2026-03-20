// supabase/functions/create-invite/index.ts
// Creates a business invite (link or email) for team member onboarding.
// Only Admins can create invites.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''

const APP_URL = 'https://app.zeltoapp.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  type: 'link' | 'email'
  role: 'admin' | 'member'
  email?: string
}

// Generate a URL-safe invite code (12 chars, alphanumeric)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < 12; i++) {
    code += chars[bytes[i] % chars.length]
  }
  return code
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Authenticate caller via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const body: RequestBody = await req.json()

    if (!body.type || !['link', 'email'].includes(body.type)) {
      return new Response(JSON.stringify({ error: 'Invalid invite type. Must be "link" or "email".' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!body.role || !['admin', 'member'].includes(body.role)) {
      return new Response(JSON.stringify({ error: 'Invalid role. Must be "admin" or "member".' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.type === 'email' && !body.email) {
      return new Response(JSON.stringify({ error: 'Email is required for email invites.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service-role client for DB operations
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Resolve caller's user_account and verify Admin role
    const { data: callerAccount, error: accountError } = await serviceClient
      .from('user_accounts')
      .select('id, business_entity_id')
      .eq('auth_user_id', user.id)
      .single()

    if (accountError || !callerAccount) {
      console.error('[create-invite] Failed to resolve user account:', accountError)
      return new Response(JSON.stringify({ error: 'User account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!callerAccount.business_entity_id) {
      return new Response(JSON.stringify({ error: 'User is not associated with a business' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check caller is Admin
    const { data: membership, error: memberError } = await serviceClient
      .from('business_members')
      .select('role')
      .eq('business_entity_id', callerAccount.business_entity_id)
      .eq('user_account_id', callerAccount.id)
      .single()

    if (memberError || !membership) {
      console.error('[create-invite] Failed to resolve membership:', memberError)
      return new Response(JSON.stringify({ error: 'Business membership not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (membership.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only Admins can create invites' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate unique invite code with retry
    let inviteCode = ''
    let attempts = 0
    while (attempts < 5) {
      const candidate = generateInviteCode()
      const { data: existing } = await serviceClient
        .from('business_invites')
        .select('id')
        .eq('invite_code', candidate)
        .maybeSingle()

      if (!existing) {
        inviteCode = candidate
        break
      }
      attempts++
    }

    if (!inviteCode) {
      return new Response(JSON.stringify({ error: 'Failed to generate unique invite code' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert invite
    const { data: invite, error: insertError } = await serviceClient
      .from('business_invites')
      .insert({
        business_entity_id: callerAccount.business_entity_id,
        invited_by: callerAccount.id,
        invite_type: body.type,
        invite_code: inviteCode,
        email: body.type === 'email' ? body.email : null,
        role: body.role,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError || !invite) {
      console.error('[create-invite] Insert failed:', insertError)
      return new Response(JSON.stringify({ error: 'Failed to create invite' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const inviteUrl = `${APP_URL}/join/${inviteCode}`

    // Send email if email invite and Resend is configured
    if (body.type === 'email' && body.email && RESEND_API_KEY) {
      // Fetch business name for the email
      const { data: business } = await serviceClient
        .from('business_entities')
        .select('business_name')
        .eq('id', callerAccount.business_entity_id)
        .single()

      const businessName = business?.business_name || 'A business'

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Zelto <no-reply@zeltoapp.com>',
            to: [body.email],
            subject: `You've been invited to join ${businessName} on Zelto`,
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h2>You're invited!</h2>
                <p><strong>${businessName}</strong> has invited you to join their team on Zelto as a <strong>${body.role}</strong>.</p>
                <p>
                  <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    Join Team
                  </a>
                </p>
                <p style="color: #666; font-size: 14px;">This invite expires in 7 days.</p>
                <p style="color: #999; font-size: 12px;">If you didn't expect this email, you can safely ignore it.</p>
              </div>
            `,
          }),
        })

        if (!emailRes.ok) {
          const emailError = await emailRes.text()
          console.error('[create-invite] Resend email failed:', emailError)
          // Don't fail the invite creation — email is best-effort
        }
      } catch (emailErr) {
        console.error('[create-invite] Email send error:', emailErr)
        // Don't fail the invite creation — email is best-effort
      }
    }

    return new Response(
      JSON.stringify({
        inviteCode,
        inviteUrl,
        inviteId: invite.id,
        type: body.type,
        role: body.role,
        expiresAt: invite.expires_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('[create-invite] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
