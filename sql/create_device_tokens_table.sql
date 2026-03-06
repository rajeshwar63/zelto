-- Create device_tokens table for push notification FCM token storage
-- Each row represents a registered device for a user/business

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  business_entity_id UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  created_at BIGINT NOT NULL DEFAULT epoch_ms_now(),
  updated_at BIGINT NOT NULL DEFAULT epoch_ms_now()
);

-- One token per device per user (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_unique
  ON device_tokens(user_id, fcm_token);

-- Fast lookup by business (to send push to all devices for a business)
CREATE INDEX IF NOT EXISTS idx_device_tokens_business
  ON device_tokens(business_entity_id);

-- RLS
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Helper function for RLS checks
CREATE OR REPLACE FUNCTION auth_user_id_matches(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_accounts
    WHERE id = p_user_id AND auth_user_id = auth.uid()
  );
$$;

CREATE POLICY dt_insert ON device_tokens FOR INSERT TO authenticated
  WITH CHECK (auth_user_id_matches(user_id));

CREATE POLICY dt_select ON device_tokens FOR SELECT TO authenticated
  USING (user_id IN (
    SELECT id FROM user_accounts WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY dt_delete ON device_tokens FOR DELETE TO authenticated
  USING (user_id IN (
    SELECT id FROM user_accounts WHERE auth_user_id = auth.uid()
  ));
