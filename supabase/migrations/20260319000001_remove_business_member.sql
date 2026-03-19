-- ============================================================
-- Migration: remove_business_member
-- Creates an RPC that allows a business owner to remove a member.
-- On removal:
--   1. business_members.status is set to 'removed'
--   2. The removed user's user_accounts.business_entity_id is set to NULL
--      and role reset to 'member' so they go through business setup on next login.
-- ============================================================

CREATE OR REPLACE FUNCTION remove_business_member(
  p_owner_user_account_id uuid,
  p_member_user_account_id uuid,
  p_business_id            uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_role text;
  v_member_role text;
BEGIN
  -- Verify caller is owner of this business
  SELECT role INTO v_owner_role
  FROM user_accounts
  WHERE id = p_owner_user_account_id
    AND business_entity_id = p_business_id
    AND role = 'owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business owners can remove members';
  END IF;

  -- Verify target is a non-owner member of this business
  SELECT role INTO v_member_role
  FROM user_accounts
  WHERE id = p_member_user_account_id
    AND business_entity_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in this business';
  END IF;

  IF v_member_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the business owner';
  END IF;

  -- 1. Mark the business_members record as removed (if it exists)
  UPDATE business_members
  SET status = 'removed'
  WHERE business_entity_id = p_business_id
    AND user_account_id = p_member_user_account_id;

  -- 2. Detach the user from this business so they start fresh on next login
  UPDATE user_accounts
  SET business_entity_id = NULL,
      role = 'member'
  WHERE id = p_member_user_account_id
    AND business_entity_id = p_business_id;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_business_member(uuid, uuid, uuid) TO authenticated;
