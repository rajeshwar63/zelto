-- Migration: add_business_members.sql
-- Creates business_members table for multi-user role management.
-- Each business entity can have multiple user accounts as owner or member.

CREATE TABLE IF NOT EXISTS business_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_entity_id  UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  user_account_id     UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  role                VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'member')),
  status              VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'removed')),
  invited_by          UUID REFERENCES user_accounts(id),
  invited_at          BIGINT,
  joined_at           BIGINT,
  created_at          BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  UNIQUE (business_entity_id, user_account_id)
);

CREATE INDEX IF NOT EXISTS idx_business_members_business ON business_members(business_entity_id);
CREATE INDEX IF NOT EXISTS idx_business_members_user ON business_members(user_account_id);
CREATE INDEX IF NOT EXISTS idx_business_members_status ON business_members(status);

-- RLS Policies
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

-- A user can read members of any business they are an active member of
CREATE POLICY "business_members_select" ON business_members
  FOR SELECT USING (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members bm2
      WHERE bm2.user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND bm2.status = 'active'
    )
  );

-- Only owners can insert new members
CREATE POLICY "business_members_insert" ON business_members
  FOR INSERT WITH CHECK (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members bm2
      WHERE bm2.user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND bm2.role = 'owner'
      AND bm2.status = 'active'
    )
  );

-- Only owners can update member records
CREATE POLICY "business_members_update" ON business_members
  FOR UPDATE USING (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members bm2
      WHERE bm2.user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND bm2.role = 'owner'
      AND bm2.status = 'active'
    )
  );

-- Only owners can delete member records
CREATE POLICY "business_members_delete" ON business_members
  FOR DELETE USING (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members bm2
      WHERE bm2.user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND bm2.role = 'owner'
      AND bm2.status = 'active'
    )
  );
