import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY')!

serve(async (req) => {
  const { record } = await req.json()

  // record = the new notification row
  const recipientBusinessId = record.recipient_business_id
  const message = record.message
  const type = record.type

  // Get all device tokens for this business
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('fcm_token')
    .eq('business_entity_id', recipientBusinessId)

  if (error || !tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  // Send to all devices via FCM
  const fcmTokens = tokens.map((t: { fcm_token: string }) => t.fcm_token)

  const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `key=${FCM_SERVER_KEY}`,
    },
    body: JSON.stringify({
      registration_ids: fcmTokens,
      notification: {
        title: getNotificationTitle(type),
        body: message,
      },
      data: {
        type: record.type,
        connection_id: record.connection_id,
        related_entity_id: record.related_entity_id,
      },
    }),
  })

  const result = await fcmResponse.json()
  return new Response(JSON.stringify({ sent: result.success }), { status: 200 })
})

function getNotificationTitle(type: string): string {
  const titles: Record<string, string> = {
    'OrderPlaced': 'New Order',
    'OrderDispatched': 'Order Dispatched',
    'OrderDeclined': 'Order Declined',
    'PaymentRecorded': 'Payment Received',
    'PaymentDisputed': 'Payment Disputed',
    'IssueRaised': 'Issue Reported',
    'ConnectionAccepted': 'Connection Accepted',
  }
  return titles[type] || 'Zelto'
}
