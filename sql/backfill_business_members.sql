-- Migration: backfill_business_members.sql
-- Backfill: every existing user_account with a linked business_entity_id
-- gets an 'owner' record in business_members.
-- Safe to re-run (idempotent via ON CONFLICT DO NOTHING).

INSERT INTO business_members (business_entity_id, user_account_id, role, status, joined_at, created_at)
SELECT
  ua.business_entity_id,
  ua.id,
  'owner',
  'active',
  ua.created_at,
  ua.created_at
FROM user_accounts ua
WHERE ua.business_entity_id IS NOT NULL
ON CONFLICT (business_entity_id, user_account_id) DO NOTHING;
