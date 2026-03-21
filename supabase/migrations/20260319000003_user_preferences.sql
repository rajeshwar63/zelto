-- Create user_preferences table for per-user UI preferences synced across devices
CREATE TABLE IF NOT EXISTS user_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences     JSONB NOT NULL DEFAULT '{}',
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_auth_user_id ON user_preferences(auth_user_id);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only read their own preferences
DO $$ BEGIN
  CREATE POLICY "user_preferences_select_own"
    ON user_preferences FOR SELECT
    USING (auth_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can insert their own preferences
DO $$ BEGIN
  CREATE POLICY "user_preferences_insert_own"
    ON user_preferences FOR INSERT
    WITH CHECK (auth_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can update their own preferences
DO $$ BEGIN
  CREATE POLICY "user_preferences_update_own"
    ON user_preferences FOR UPDATE
    USING (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
