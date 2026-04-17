-- Migration: lock search_path on flagged functions.
-- A mutable search_path allows schema-hijack attacks if an attacker can create
-- objects in a schema listed earlier in search_path.
-- Using ALTER FUNCTION ... SET search_path fixes the resolution at call time.
--
-- Each block is wrapped in a DO so a missing signature (e.g. a function that
-- was renamed in a later migration) doesn't abort the entire migration.

DO $$
DECLARE
  r RECORD;
  v_signature TEXT;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'whoami()',
      'set_updated_at()',
      'delete_account()',
      'search_businesses_by_name(text, text)',
      'check_payment_overflow()',
      'promote_to_admin(uuid)',
      'demote_to_member(uuid)',
      'epoch_ms_now()',
      'handle_updated_at()',
      'remove_team_member(uuid)',
      'accept_connection_request(uuid, text, uuid)',
      'get_team_members()',
      'get_business_activity_counts(uuid)',
      'get_compliance_alerts(uuid)',
      'get_or_create_member_invite(uuid, text)',
      'accept_member_invite(uuid)',
      'remove_business_member(uuid, uuid, uuid)',
      'get_next_invoice_number(uuid)',
      'archive_connection_request(uuid, uuid)',
      'notify_push()',
      'block_business_from_request(uuid, uuid)'
    ]) AS signature
  LOOP
    v_signature := r.signature;
    BEGIN
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public, pg_catalog', v_signature);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE '[skip] function public.% not found', v_signature;
      WHEN others THEN
        RAISE NOTICE '[skip] function public.% failed: %', v_signature, SQLERRM;
    END;
  END LOOP;
END $$;
