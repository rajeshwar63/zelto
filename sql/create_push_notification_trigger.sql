-- Enable extensions required for HTTP calls and secrets access
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS vault;

-- Store the Supabase service-role key in Vault first, for example:
--   SELECT vault.create_secret('YOUR_REAL_SERVICE_ROLE_KEY', 'supabase_service_role_key');

-- Function to call the send-push edge function when a notification is created
CREATE OR REPLACE FUNCTION notify_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_role_key text;
BEGIN
  SELECT decrypted_secret
  INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'Missing Vault secret: supabase_service_role_key';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://cncimuwunjjxrlsnjstm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block notification insert if push fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_notification ON notifications;
CREATE TRIGGER trg_push_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push();
