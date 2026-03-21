// supabase/functions/accept-invite/index.ts
// Accepts a business invite by code. Adds the caller to the business as a team member.
// Handles both link-based and email-based invites.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  inviteCode: string
  userId: string
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
    // Parse request body
    const body: RequestBody = await req.json()

    if (!body.inviteCode || typeof body.inviteCode !== 'string') {
      return new Response(JSON.stringify({ error: 'inviteCode is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!body.userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Look up invite by code
    const { data: invite, error: inviteError } = await serviceClient
      .from('business_invites')
      .select('*')
      .eq('invite_code', body.inviteCode)
      .single()

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: 'Invite not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check invite status
    if (invite.status !== 'pending') {
      if (invite.status === 'accepted' && invite.invite_type === 'email') {
        return new Response(JSON.stringify({ error: 'invite_already_used', message: 'This invite has already been used.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (invite.status === 'revoked') {
        return new Response(JSON.stringify({ error: 'invite_revoked', message: 'This invite has been revoked.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (invite.status === 'expired') {
        return new Response(JSON.stringify({ error: 'invite_expired', message: 'This invite link has expired. Ask the person who shared it to send a new one.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Check expiry
    const now = new Date()
    const expiresAt = new Date(invite.expires_at)
    if (now > expiresAt) {
      await serviceClient
        .from('business_invites')
        .update({ status: 'expired' })
        .eq('id', invite.id)

      return new Response(JSON.stringify({
        error: 'invite_expired',
        message: 'This invite link has expired. Ask the person who shared it to send a new one.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve caller's user_account by userId
    const { data: callerAccount, error: accountError } = await serviceClient
      .from('user_accounts')
      .select('id, email, business_entity_id')
      .eq('id', body.userId)
      .single()

    if (accountError || !callerAccount) {
      console.error('[accept-invite] Failed to resolve user account:', accountError)
      return new Response(JSON.stringify({ error: 'User account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // For email invites: verify caller's email matches
    if (invite.invite_type === 'email' && invite.email) {
      if (callerAccount.email.toLowerCase() !== invite.email.toLowerCase()) {
        return new Response(JSON.stringify({
          error: 'email_mismatch',
          message: 'This invite was sent to a different email address.',
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Check if caller is already a member of this business
    const { data: existingMembership } = await serviceClient
      .from('business_members')
      .select('id')
      .eq('business_entity_id', invite.business_entity_id)
      .eq('user_account_id', callerAccount.id)
      .maybeSingle()

    if (existingMembership) {
      return new Response(JSON.stringify({
        error: 'already_member',
        message: 'You are already a member of this business.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // V2 constraint: check caller is not already a member of ANY business
    const { data: anyMembership } = await serviceClient
      .from('business_members')
      .select('id')
      .eq('user_account_id', callerAccount.id)
      .limit(1)
      .maybeSingle()

    if (anyMembership) {
      return new Response(JSON.stringify({
        error: 'already_has_business',
        message: "You're already part of a business on Zelto. One business per account for now.",
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert into business_members with role from invite
    const { error: insertError } = await serviceClient
      .from('business_members')
      .insert({
        business_entity_id: invite.business_entity_id,
        user_account_id: callerAccount.id,
        role: invite.role,
        invited_by: invite.invited_by,
      })

    if (insertError) {
      console.error('[accept-invite] Failed to add member:', insertError)
      return new Response(JSON.stringify({ error: 'Failed to join business' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update user_accounts.business_entity_id to link user to this business
    await serviceClient
      .from('user_accounts')
      .update({ business_entity_id: invite.business_entity_id })
      .eq('id', callerAccount.id)

    // For email invites: mark as accepted (single-use)
    // For link invites: mark accepted_by but keep status pending (reusable)
    if (invite.invite_type === 'email') {
      await serviceClient
        .from('business_invites')
        .update({
          status: 'accepted',
          accepted_by: callerAccount.id,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invite.id)
    } else {
      await serviceClient
        .from('business_invites')
        .update({
          accepted_by: callerAccount.id,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invite.id)
    }

    // Fetch business name for response
    const { data: business } = await serviceClient
      .from('business_entities')
      .select('business_name')
      .eq('id', invite.business_entity_id)
      .single()

    return new Response(
      JSON.stringify({
        businessName: business?.business_name || 'Unknown',
        role: invite.role,
        businessEntityId: invite.business_entity_id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('[accept-invite] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
