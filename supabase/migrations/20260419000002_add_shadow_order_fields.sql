-- Migration 2: Add single-party trade fields to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS counterparty_type VARCHAR(20) NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS shadow_counterparty_id UUID NULL REFERENCES business_entities(id),
  ADD COLUMN IF NOT EXISTS supplier_business_id UUID NULL REFERENCES business_entities(id),
  ADD COLUMN IF NOT EXISTS real_counterparty_id UUID NULL REFERENCES business_entities(id),
  ADD COLUMN IF NOT EXISTS verification_state VARCHAR(30) NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS retroactive_confirmation JSONB NULL,
  ADD COLUMN IF NOT EXISTS disputed_retroactively JSONB NULL;

ALTER TABLE orders
  ADD CONSTRAINT IF NOT EXISTS chk_counterparty_type
  CHECK (counterparty_type IN ('connected', 'shadow'));

ALTER TABLE orders
  ADD CONSTRAINT IF NOT EXISTS chk_verification_state
  CHECK (verification_state IN ('verified', 'unverified', 'retroactively_verified'));

-- Covering indexes for FK columns added in this migration
CREATE INDEX IF NOT EXISTS idx_orders_shadow_counterparty_id
  ON orders(shadow_counterparty_id)
  WHERE shadow_counterparty_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_supplier_business_id
  ON orders(supplier_business_id)
  WHERE supplier_business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_real_counterparty_id
  ON orders(real_counterparty_id)
  WHERE real_counterparty_id IS NOT NULL;

-- Useful for trust-score aggregation: fetch unverified orders fast
CREATE INDEX IF NOT EXISTS idx_orders_verification_state
  ON orders(verification_state)
  WHERE verification_state != 'verified';
