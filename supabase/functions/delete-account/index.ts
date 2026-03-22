// supabase/functions/delete-account/index.ts
// Deletes a user's account: removes business membership, user_account row,
// user_preferences, and the Supabase auth user.

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
    const body: RequestBody = await req.json()

    if (!body.userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Look up the user account
    const { data: userAccount, error: lookupError } = await serviceClient
      .from('user_accounts')
      .select('id, auth_user_id, business_entity_id, role')
      .eq('id', body.userId)
      .single()

    if (lookupError || !userAccount) {
      console.error('[delete-account] User not found:', lookupError)
      return new Response(JSON.stringify({ error: 'User account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Delete business_members entry
    await serviceClient
      .from('business_members')
      .delete()
      .eq('user_account_id', userAccount.id)

    // Delete user_preferences
    if (userAccount.auth_user_id) {
      await serviceClient
        .from('user_preferences')
        .delete()
        .eq('auth_user_id', userAccount.auth_user_id)
    }

    // Delete the user_account row
    const { error: deleteAccountError } = await serviceClient
      .from('user_accounts')
      .delete()
      .eq('id', userAccount.id)

    if (deleteAccountError) {
      console.error('[delete-account] Failed to delete user_account:', deleteAccountError)
      return new Response(JSON.stringify({ error: 'Failed to delete user account' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Delete the Supabase auth user
    if (userAccount.auth_user_id) {
      const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(
        userAccount.auth_user_id
      )

      if (authDeleteError) {
        console.error('[delete-account] Failed to delete auth user:', authDeleteError)
        // Don't fail — user_account is already deleted
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[delete-account] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
