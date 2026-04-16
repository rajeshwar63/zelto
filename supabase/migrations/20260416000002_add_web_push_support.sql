-- ============================================================
-- Migration: add_web_push_support
-- Adds Web Push subscription columns to device_tokens so that
-- PWA clients (iOS Safari, desktop browsers) can receive push
-- notifications via the W3C Web Push protocol alongside native
-- FCM-based delivery.
-- Also fixes the notifications CHECK constraint to include all
-- notification types used by the application.
-- ============================================================

-- 1. Allow fcm_token to be NULL (web push rows won't have one)
ALTER TABLE device_tokens ALTER COLUMN fcm_token DROP NOT NULL;

-- 2. Add Web Push subscription columns
ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS push_endpoint TEXT;
ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS push_p256dh TEXT;
ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS push_auth TEXT;

-- 3. Unique index for web push subscriptions (one subscription per user + endpoint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_web_push
  ON device_tokens(user_id, push_endpoint) WHERE push_endpoint IS NOT NULL;

-- 4. Fix notifications type CHECK constraint to include all application types.
--    The original constraint was missing: OrderAccepted, IssueAcknowledged,
--    IssueResolved, MemberJoined — inserts with those types fail silently.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'OrderPlaced',
    'OrderAccepted',
    'OrderDispatched',
    'OrderDeclined',
    'PaymentRecorded',
    'PaymentDisputed',
    'IssueRaised',
    'IssueAcknowledged',
    'IssueResolved',
    'ConnectionAccepted',
    'MemberJoined'
  ));
