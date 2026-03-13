-- Atomic RPC for accepting an incoming connection request.
--
-- Usage:
-- select * from accept_connection_request(
--   '<request_id>',
--   'buyer'::text,
--   '<actor_business_id>'
-- );

CREATE OR REPLACE FUNCTION accept_connection_request(
  p_request_id uuid,
  p_receiver_role text,
  p_actor_business_id uuid
)
RETURNS TABLE (
  connection_id uuid,
  request_status text,
  notification_status text,
  already_existed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request connection_requests%ROWTYPE;
  v_buyer_business_id uuid;
  v_supplier_business_id uuid;
  v_connection_id uuid;
  v_now bigint := floor(extract(epoch from now()) * 1000);
  v_notification_status text := 'skipped';
  v_already_existed boolean := false;
BEGIN
  IF p_receiver_role NOT IN ('buyer', 'supplier') THEN
    RAISE EXCEPTION 'Invalid receiver role: %', p_receiver_role;
  END IF;

  SELECT *
  INTO v_request
  FROM connection_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection request not found';
  END IF;

  IF v_request.receiver_business_id <> p_actor_business_id THEN
    RAISE EXCEPTION 'You are not authorized to accept this request';
  END IF;

  IF p_receiver_role = v_request.requester_role THEN
    RAISE EXCEPTION 'One party must be buyer and one must be supplier';
  END IF;

  v_buyer_business_id := CASE
    WHEN p_receiver_role = 'buyer' THEN p_actor_business_id
    ELSE v_request.requester_business_id
  END;

  v_supplier_business_id := CASE
    WHEN p_receiver_role = 'supplier' THEN p_actor_business_id
    ELSE v_request.requester_business_id
  END;

  SELECT id
  INTO v_connection_id
  FROM connections
  WHERE buyer_business_id = v_buyer_business_id
    AND supplier_business_id = v_supplier_business_id
  LIMIT 1;

  IF v_connection_id IS NOT NULL THEN
    v_already_existed := true;
  ELSE
    INSERT INTO connections (
      buyer_business_id,
      supplier_business_id,
      payment_terms,
      connection_state,
      behaviour_history,
      created_at
    ) VALUES (
      v_buyer_business_id,
      v_supplier_business_id,
      CASE WHEN p_receiver_role = 'buyer' THEN '{"type":"Payment on Delivery"}'::jsonb ELSE NULL END,
      'Stable',
      '[]'::jsonb,
      v_now
    )
    ON CONFLICT (buyer_business_id, supplier_business_id) DO NOTHING
    RETURNING id INTO v_connection_id;

    IF v_connection_id IS NULL THEN
      SELECT id
      INTO v_connection_id
      FROM connections
      WHERE buyer_business_id = v_buyer_business_id
        AND supplier_business_id = v_supplier_business_id
      LIMIT 1;
      v_already_existed := true;
    END IF;
  END IF;

  IF v_request.status = 'Pending' THEN
    UPDATE connection_requests
    SET status = 'Accepted',
        resolved_at = v_now,
        receiver_role = p_receiver_role
    WHERE id = p_request_id;

    BEGIN
      INSERT INTO notifications (
        recipient_business_id,
        type,
        related_entity_id,
        connection_id,
        message,
        created_at,
        read_at
      ) VALUES (
        v_request.requester_business_id,
        'ConnectionAccepted',
        v_connection_id,
        v_connection_id,
        'Your connection request has been accepted',
        v_now,
        NULL
      );
      v_notification_status := 'sent';
    EXCEPTION WHEN OTHERS THEN
      v_notification_status := 'failed';
    END;
  ELSIF v_request.status = 'Accepted' THEN
    v_already_existed := true;
    v_notification_status := 'skipped';
  ELSE
    RAISE EXCEPTION 'Only pending or accepted requests can be processed (current status: %)', v_request.status;
  END IF;

  connection_id := v_connection_id;
  request_status := 'Accepted';
  notification_status := v_notification_status;
  already_existed := v_already_existed;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_connection_request(uuid, text, uuid) TO authenticated;
