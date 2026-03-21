-- ============================================================
-- Migration: compliance_alerts_and_member_invites
-- 1. Add display_name column to business_documents
-- 2. Add MemberJoined to notifications type constraint
-- 3. Create get_compliance_alerts RPC
-- 4. Create get_or_create_member_invite RPC
-- 5. Create accept_member_invite RPC
-- ============================================================

-- 1. Add display_name to business_documents
ALTER TABLE business_documents
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Backfill display_name from document_type for existing rows
UPDATE business_documents
SET display_name = CASE document_type
  WHEN 'gst_certificate'  THEN 'GST Certificate'
  WHEN 'msme_udyam'       THEN 'MSME / Udyam Certificate'
  WHEN 'trade_licence'    THEN 'Trade Licence'
  WHEN 'fssai_licence'    THEN 'FSSAI Licence'
  WHEN 'pan_card'         THEN 'PAN Card'
  WHEN 'fire_safety'      THEN 'Fire Safety Certificate'
  ELSE document_type
END
WHERE display_name IS NULL;

-- 2. Add MemberJoined to notifications type constraint
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'OrderPlaced',
      'OrderAccepted',
      'OrderDispatched',
      'OrderDeclined',
      'PaymentRecorded',
      'PaymentDisputed',
      'IssueRaised',
      'IssueAcknowledged',
      'IssueResolved',
      'ConnectionAccepted',
      'MemberJoined'
    ));
EXCEPTION WHEN others THEN
  -- Constraint may not exist yet; ignore
  NULL;
END;
$$;

-- 3. get_compliance_alerts RPC
-- Returns up to 50 compliance issues from suppliers of p_business_id.
-- issue_type: 'expired' | 'expiring' (within 30 days) | 'missing' (no docs at all)
-- Sorted: expired first, then expiring soonest, then missing.
DROP FUNCTION IF EXISTS get_compliance_alerts(uuid);
CREATE OR REPLACE FUNCTION get_compliance_alerts(p_business_id uuid)
RETURNS TABLE (
  connection_id          uuid,
  other_business_id      uuid,
  other_business_name    text,
  other_business_zelto_id text,
  issue_type             text,
  document_display_name  text,
  expires_at             text,
  days_remaining         integer
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    sub.connection_id,
    sub.other_business_id,
    sub.other_business_name,
    sub.other_business_zelto_id,
    sub.issue_type,
    sub.document_display_name,
    sub.expires_at,
    sub.days_remaining
  FROM (
    -- Expired documents
    SELECT
      c.id                                              AS connection_id,
      c.supplier_business_id                            AS other_business_id,
      be.business_name                                  AS other_business_name,
      be.zelto_id                                       AS other_business_zelto_id,
      'expired'::text                                   AS issue_type,
      COALESCE(bd.display_name, bd.document_type)      AS document_display_name,
      bd.expiry_date::text                              AS expires_at,
      (bd.expiry_date - CURRENT_DATE)::integer          AS days_remaining
    FROM connections c
    JOIN business_entities be ON be.id = c.supplier_business_id
    JOIN business_documents bd ON bd.business_id = c.supplier_business_id
    WHERE c.buyer_business_id = p_business_id
      AND bd.expiry_date IS NOT NULL
      AND bd.expiry_date < CURRENT_DATE

    UNION ALL

    -- Expiring within 30 days
    SELECT
      c.id                                              AS connection_id,
      c.supplier_business_id                            AS other_business_id,
      be.business_name                                  AS other_business_name,
      be.zelto_id                                       AS other_business_zelto_id,
      'expiring'::text                                  AS issue_type,
      COALESCE(bd.display_name, bd.document_type)      AS document_display_name,
      bd.expiry_date::text                              AS expires_at,
      (bd.expiry_date - CURRENT_DATE)::integer          AS days_remaining
    FROM connections c
    JOIN business_entities be ON be.id = c.supplier_business_id
    JOIN business_documents bd ON bd.business_id = c.supplier_business_id
    WHERE c.buyer_business_id = p_business_id
      AND bd.expiry_date IS NOT NULL
      AND bd.expiry_date >= CURRENT_DATE
      AND bd.expiry_date <= CURRENT_DATE + INTERVAL '30 days'

    UNION ALL

    -- Suppliers with no documents at all
    SELECT
      c.id                                AS connection_id,
      c.supplier_business_id              AS other_business_id,
      be.business_name                    AS other_business_name,
      be.zelto_id                         AS other_business_zelto_id,
      'missing'::text                     AS issue_type,
      'No documents uploaded'::text       AS document_display_name,
      NULL::text                          AS expires_at,
      NULL::integer                       AS days_remaining
    FROM connections c
    JOIN business_entities be ON be.id = c.supplier_business_id
    WHERE c.buyer_business_id = p_business_id
      AND NOT EXISTS (
        SELECT 1 FROM business_documents bd2
        WHERE bd2.business_id = c.supplier_business_id
      )
  ) sub
  ORDER BY
    CASE sub.issue_type
      WHEN 'expired'  THEN 1
      WHEN 'expiring' THEN 2
      WHEN 'missing'  THEN 3
    END,
    sub.days_remaining NULLS LAST
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION get_compliance_alerts(uuid) TO authenticated;

-- 4. get_or_create_member_invite RPC
-- Returns active invite token for the business, creating one if none exists.
-- Only callable by the business owner.
CREATE OR REPLACE FUNCTION get_or_create_member_invite(
  p_business_id    uuid,
  p_user_account_id uuid
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role           text;
  v_existing_token text;
  v_new_token      text;
  v_now            bigint;
  v_expires_at     bigint;
BEGIN
  v_now := floor(extract(epoch from now()) * 1000);

  -- Verify caller is owner of this business
  SELECT role INTO v_role
  FROM user_accounts
  WHERE id = p_user_account_id
    AND business_entity_id = p_business_id
    AND role = 'owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business owners can create invite links';
  END IF;

  -- Return existing active invite if one exists
  SELECT invite_token INTO v_existing_token
  FROM member_invites
  WHERE business_entity_id = p_business_id
    AND status = 'pending'
    AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_token IS NOT NULL THEN
    RETURN v_existing_token;
  END IF;

  -- Generate a new 24-byte (48 hex chars) random token
  v_new_token  := encode(gen_random_bytes(24), 'hex');
  v_expires_at := v_now + (7 * 24 * 60 * 60 * 1000); -- 7 days in ms

  INSERT INTO member_invites (
    business_entity_id,
    invited_by,
    invite_token,
    role,
    status,
    expires_at
  ) VALUES (
    p_business_id,
    p_user_account_id,
    v_new_token,
    'member',
    'pending',
    v_expires_at
  );

  RETURN v_new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_member_invite(uuid, uuid) TO authenticated;

-- 5. accept_member_invite RPC
-- Validates token, checks invitee eligibility, joins the business.
-- SECURITY DEFINER so invitee can accept without being a member yet.
CREATE OR REPLACE FUNCTION accept_member_invite(
  p_token           text,
  p_user_account_id uuid
)
RETURNS TABLE (
  success       boolean,
  error_code    text,
  business_id   uuid,
  business_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite        member_invites%ROWTYPE;
  v_user          user_accounts%ROWTYPE;
  v_business      business_entities%ROWTYPE;
  v_now           bigint;
  v_has_connections boolean;
BEGIN
  v_now := floor(extract(epoch from now()) * 1000);

  -- Look up the invite
  SELECT * INTO v_invite
  FROM member_invites
  WHERE invite_token = p_token;

  IF NOT FOUND THEN
    success := false; error_code := 'invalid_token';
    business_id := null; business_name := null;
    RETURN NEXT; RETURN;
  END IF;

  IF v_invite.status != 'pending' THEN
    success := false; error_code := 'invite_used';
    business_id := null; business_name := null;
    RETURN NEXT; RETURN;
  END IF;

  IF v_invite.expires_at < v_now THEN
    success := false; error_code := 'invite_expired';
    business_id := null; business_name := null;
    RETURN NEXT; RETURN;
  END IF;

  -- Look up the invitee
  SELECT * INTO v_user FROM user_accounts WHERE id = p_user_account_id;

  IF NOT FOUND THEN
    success := false; error_code := 'user_not_found';
    business_id := null; business_name := null;
    RETURN NEXT; RETURN;
  END IF;

  -- If user is already a member of the target business, succeed immediately
  IF v_user.business_entity_id = v_invite.business_entity_id THEN
    SELECT * INTO v_business FROM business_entities WHERE id = v_invite.business_entity_id;
    success := true; error_code := null;
    business_id := v_business.id; business_name := v_business.business_name;
    RETURN NEXT; RETURN;
  END IF;

  -- If user already has a DIFFERENT established business (has connections), error
  IF v_user.business_entity_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM connections
      WHERE buyer_business_id = v_user.business_entity_id
        OR supplier_business_id = v_user.business_entity_id
    ) INTO v_has_connections;

    IF v_has_connections THEN
      success := false; error_code := 'already_has_business';
      business_id := null; business_name := null;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- Load the target business
  SELECT * INTO v_business FROM business_entities WHERE id = v_invite.business_entity_id;

  IF NOT FOUND THEN
    success := false; error_code := 'business_not_found';
    business_id := null; business_name := null;
    RETURN NEXT; RETURN;
  END IF;

  -- 1. Add to business_members
  INSERT INTO business_members (
    business_entity_id, user_account_id, role, status,
    invited_by, invited_at, joined_at
  ) VALUES (
    v_invite.business_entity_id, p_user_account_id, 'member', 'active',
    v_invite.invited_by, v_invite.created_at, v_now
  )
  ON CONFLICT (business_entity_id, user_account_id) DO NOTHING;

  -- 2. Switch user's active business context
  UPDATE user_accounts
  SET business_entity_id = v_invite.business_entity_id,
      role = 'member'
  WHERE id = p_user_account_id;

  -- 3. Mark invite accepted
  UPDATE member_invites
  SET status     = 'accepted',
      accepted_at = v_now,
      accepted_by = p_user_account_id
  WHERE invite_token = p_token;

  -- 4. Notify owner (best-effort)
  BEGIN
    INSERT INTO notifications (
      recipient_business_id, type, related_entity_id, connection_id,
      message, created_at, read_at
    ) VALUES (
      v_invite.business_entity_id,
      'MemberJoined',
      p_user_account_id,
      p_user_account_id,
      v_user.username || ' joined your team',
      v_now,
      NULL
    );
  EXCEPTION WHEN others THEN
    NULL; -- Notification failure must not break invite acceptance
  END;

  success := true; error_code := null;
  business_id := v_business.id; business_name := v_business.business_name;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_member_invite(text, uuid) TO authenticated;
