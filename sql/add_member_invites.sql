-- Migration: add_member_invites.sql
-- Creates member_invites table for tracking pending invite links.

CREATE TABLE IF NOT EXISTS member_invites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_entity_id  UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  invited_by          UUID NOT NULL REFERENCES user_accounts(id),
  invite_token        VARCHAR(64) NOT NULL UNIQUE,
  email               VARCHAR(255),          -- optional, if invited by email
  role                VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at          BIGINT NOT NULL,        -- epoch ms, 7 days from creation
  accepted_at         BIGINT,
  accepted_by         UUID REFERENCES user_accounts(id),
  created_at          BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_member_invites_token ON member_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_member_invites_business ON member_invites(business_entity_id);

-- RLS Policies
ALTER TABLE member_invites ENABLE ROW LEVEL SECURITY;

-- Only owners of the business can see invite records
CREATE POLICY "member_invites_select" ON member_invites
  FOR SELECT USING (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members
      WHERE user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND role = 'owner'
      AND status = 'active'
    )
  );

-- Only owners can create invites
CREATE POLICY "member_invites_insert" ON member_invites
  FOR INSERT WITH CHECK (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members
      WHERE user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND role = 'owner'
      AND status = 'active'
    )
  );

-- Only owners can update invites (revoke)
CREATE POLICY "member_invites_update" ON member_invites
  FOR UPDATE USING (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members
      WHERE user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND role = 'owner'
      AND status = 'active'
    )
  );

-- Token lookup must be accessible without auth (for invite accept flow)
-- This is handled via a security-definer RPC function, not direct table access.
-- The accept_member_invite() RPC validates the token server-side.
