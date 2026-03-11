# send-push Edge Function

Canonical runtime entrypoint: `supabase/functions/send-push/index.ts`.

## Environment variables

This function expects a **single** Firebase service-account JSON env var:

- `FCM_SERVICE_ACCOUNT` (raw JSON string containing `project_id`, `client_email`, `private_key`)

It also requires:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```bash
supabase secrets set \
  FCM_SERVICE_ACCOUNT='{"type":"service_account","project_id":"<project-id>","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"<client-email>","token_uri":"https://oauth2.googleapis.com/token"}'

supabase functions deploy send-push --no-verify-jwt
```

## Validation behavior

At startup, the function logs missing/invalid required env keys. If configuration is invalid, requests fail fast with HTTP 500 and a `missing` list.
