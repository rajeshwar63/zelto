-- Migration: add_audit_fields_to_orders.sql
-- Adds audit fields to orders and connections for multi-user action attribution.
-- created_by_user_id tracks which team member performed the action (internal audit only).
-- Counterparties always see the business name only.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES user_accounts(id);

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID REFERENCES user_accounts(id);

-- Also add member_invite_id to user_accounts to trace how a user joined
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS member_invite_id UUID;
-- Note: FK to member_invites cannot be added here as member_invites may not exist yet.
-- Run add_member_invites.sql first, then:
-- ALTER TABLE user_accounts ADD CONSTRAINT fk_member_invite FOREIGN KEY (member_invite_id) REFERENCES member_invites(id);
