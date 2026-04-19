-- Migration 4: Shadow match index for fast signup-to-shadow lookups
CREATE TABLE IF NOT EXISTS shadow_match_index (
  shadow_entity_id UUID PRIMARY KEY REFERENCES business_entities(id) ON DELETE CASCADE,
  phone_normalized VARCHAR(20) NOT NULL,
  gst_normalized VARCHAR(15) NULL,
  udyam_normalized VARCHAR(30) NULL,
  created_by_business_id UUID NOT NULL REFERENCES business_entities(id),
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shadow_phone ON shadow_match_index(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_shadow_gst ON shadow_match_index(gst_normalized) WHERE gst_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shadow_udyam ON shadow_match_index(udyam_normalized) WHERE udyam_normalized IS NOT NULL;

-- RLS: shadow_match_index rows are only read by the system during signup.
-- Regular users cannot query this table directly.
ALTER TABLE shadow_match_index ENABLE ROW LEVEL SECURITY;

-- Service role (used by server-side logic) has full access.
-- Authenticated users have no direct access — queries go through RPCs or
-- server-side functions that run with elevated privileges.
CREATE POLICY shadow_match_index_service_only ON shadow_match_index
  USING (false)
  WITH CHECK (false);
