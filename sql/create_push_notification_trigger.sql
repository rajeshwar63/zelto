-- Enable pg_net extension (required for HTTP calls from triggers)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to call the send-push edge function when a notification is created
-- Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_SERVICE_ROLE_KEY with actual values
-- or configure via environment/vault secrets
CREATE OR REPLACE FUNCTION notify_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://cncimuwunjjxrlsnjstm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block notification insert if push fails
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_push_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push();
