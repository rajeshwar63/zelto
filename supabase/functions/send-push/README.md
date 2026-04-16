# send-push Edge Function

Canonical runtime entrypoint: `supabase/functions/send-push/index.ts`.

Sends push notifications via two channels:
- **FCM V1 API** — native Android / iOS devices
- **W3C Web Push (VAPID)** — PWA on iOS Safari, desktop browsers

## Environment variables

### Required (FCM — native push)

- `FCM_SERVICE_ACCOUNT` (raw JSON string containing `project_id`, `client_email`, `private_key`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Required (Web Push — PWA)

- `VAPID_PUBLIC_KEY` — base64url-encoded 65-byte P-256 public key
- `VAPID_PRIVATE_KEY` — base64url-encoded 32-byte P-256 private key

## Deploy

```bash
supabase secrets set \
  FCM_SERVICE_ACCOUNT='{"type":"service_account","project_id":"<project-id>","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"<client-email>","token_uri":"https://oauth2.googleapis.com/token"}' \
  VAPID_PUBLIC_KEY='BEzwJ8no_F0goyL-F5iNk_bqOW_BnIM00mnnaKESDNrEiLdJY1BF9RGnapKELWhholkCHFINW2jAMzf2BG_dwS4' \
  VAPID_PRIVATE_KEY='7o6RDNboXvK-MNAhEwAZz33w17DoFGtIA_9-bOGAR2M'

supabase functions deploy send-push --no-verify-jwt
```

## Database migration

Run `supabase/migrations/20260416000002_add_web_push_support.sql` to add the
web push columns (`push_endpoint`, `push_p256dh`, `push_auth`) to `device_tokens`
and fix the notifications `type` CHECK constraint.

## Validation behavior

At startup, the function logs missing/invalid required env keys. If FCM configuration
is invalid, requests fail fast with HTTP 500 and a `missing` list. Missing VAPID keys
are a warning — FCM delivery still works, but web push is skipped.
