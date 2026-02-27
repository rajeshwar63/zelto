-- OTP Sessions table for backend phone auth flow
-- Stores Firebase sessionInfo between send-otp and verify-otp edge function calls

CREATE TABLE IF NOT EXISTS otp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  session_info TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for fast lookup by phone number
CREATE INDEX IF NOT EXISTS otp_sessions_phone_number_idx ON otp_sessions (phone_number);

-- Index for expiry cleanup queries
CREATE INDEX IF NOT EXISTS otp_sessions_expires_at_idx ON otp_sessions (expires_at);

-- Disable RLS so edge functions using service role key can read/write freely
ALTER TABLE otp_sessions DISABLE ROW LEVEL SECURITY;
