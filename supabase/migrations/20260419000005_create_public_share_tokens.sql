-- Migration 5: Public share tokens for read-only trade/counterparty views
CREATE TABLE IF NOT EXISTS public_share_tokens (
  token VARCHAR(32) PRIMARY KEY,
  resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('trade', 'shadow_counterparty')),
  resource_id UUID NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_token_resource
  ON public_share_tokens(resource_type, resource_id);

-- Tokens are publicly readable (no auth required) for the /t/ and /c/ routes.
-- Inserts are done by authenticated users only.
ALTER TABLE public_share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY share_tokens_public_read ON public_share_tokens
  FOR SELECT
  USING (true);

CREATE POLICY share_tokens_auth_insert ON public_share_tokens
  FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);
