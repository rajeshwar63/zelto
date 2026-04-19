-- Migration 1: Add shadow entity discriminator fields to business_entities
ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(20) NOT NULL DEFAULT 'real',
  ADD COLUMN IF NOT EXISTS shadow_metadata JSONB NULL,
  ADD COLUMN IF NOT EXISTS claimed_from_shadow_id UUID NULL REFERENCES business_entities(id),
  ADD COLUMN IF NOT EXISTS claimed_at BIGINT NULL;

ALTER TABLE business_entities
  ADD CONSTRAINT IF NOT EXISTS chk_entity_type
  CHECK (entity_type IN ('real', 'shadow', 'shadow_archived'));

-- All existing rows already satisfy entity_type = 'real' via the DEFAULT.

-- Shadow entities must NOT appear in global search/discovery.
-- The application layer enforces this, but we also add a partial index
-- to make filtered queries fast.
CREATE INDEX IF NOT EXISTS idx_business_entities_entity_type
  ON business_entities(entity_type)
  WHERE entity_type != 'real';
