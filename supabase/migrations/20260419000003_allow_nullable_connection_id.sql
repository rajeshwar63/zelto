-- Migration 3: Allow connection_id to be NULL for shadow (single-party) orders
ALTER TABLE orders ALTER COLUMN connection_id DROP NOT NULL;

-- Enforce mutual exclusivity: a connected order must have connection_id,
-- a shadow order must have shadow_counterparty_id + supplier_business_id.
ALTER TABLE orders
  ADD CONSTRAINT IF NOT EXISTS chk_order_counterparty_consistency CHECK (
    (
      counterparty_type = 'connected'
      AND connection_id IS NOT NULL
      AND shadow_counterparty_id IS NULL
      AND supplier_business_id IS NULL
    )
    OR
    (
      counterparty_type = 'shadow'
      AND connection_id IS NULL
      AND shadow_counterparty_id IS NOT NULL
      AND supplier_business_id IS NOT NULL
    )
  );
