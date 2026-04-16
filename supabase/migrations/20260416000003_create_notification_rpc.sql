-- ============================================================
-- Migration: create_notification_rpc
-- Creates a SECURITY DEFINER RPC for inserting notifications.
-- Client-side INSERTs via PostgREST are blocked by RLS because
-- the INSERT policy requires a sub-query across connections and
-- user_accounts.  A SECURITY DEFINER function bypasses RLS while
-- still validating that the caller is a party to the connection.
-- This matches the pattern used by accept_connection_request and
-- accept_member_invite which also insert notifications.
-- ============================================================

CREATE OR REPLACE FUNCTION create_notification(
  p_recipient_business_id UUID,
  p_type TEXT,
  p_related_entity_id UUID,
  p_connection_id UUID,
  p_message TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result notifications%ROWTYPE;
BEGIN
  -- Verify the caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '28000';  -- invalid_authorization_specification
  END IF;

  -- Verify the caller is a party to the referenced connection
  IF NOT EXISTS (
    SELECT 1 FROM connections c
    WHERE c.id = p_connection_id
    AND (
      c.buyer_business_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
      OR c.supplier_business_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'Caller is not a party to this connection'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  -- Insert the notification
  INSERT INTO notifications (
    recipient_business_id, type, related_entity_id, connection_id, message, created_at
  ) VALUES (
    p_recipient_business_id,
    p_type,
    p_related_entity_id,
    p_connection_id,
    p_message,
    (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT
  )
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
END;
$$;
