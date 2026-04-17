-- Migration: remove duplicate permissive RLS policies.
-- When two permissive policies exist for the same role+action, Postgres
-- evaluates BOTH on every query, doubling the RLS cost with zero read benefit.

-- device_tokens: legacy "allow-all" and "business can manage own tokens"
-- duplicate the scoped dt_* policies.
DROP POLICY IF EXISTS allow_all_device_tokens ON public.device_tokens;
DROP POLICY IF EXISTS "business can manage own tokens" ON public.device_tokens;

-- business_documents: quoted legacy policies duplicate the snake_case ones
-- created in the trust_profile migration.
DROP POLICY IF EXISTS "Can delete own business documents only" ON public.business_documents;
DROP POLICY IF EXISTS "Can upload documents for own business only" ON public.business_documents;
DROP POLICY IF EXISTS "Can read own and connected business documents" ON public.business_documents;
DROP POLICY IF EXISTS "admin_anon_read_business_documents" ON public.business_documents;

-- notifications: legacy notif_* duplicate notifications_*_own.
DROP POLICY IF EXISTS notif_select ON public.notifications;
DROP POLICY IF EXISTS notif_update ON public.notifications;

-- order_attachments: three duplicate INSERT policies, one duplicate DELETE.
-- Keep the more specific "Only connection parties can insert attachments",
-- "Only uploader can delete attachments", and "Connection parties can view
-- attachments" from the order_actions_attachments migration.
DROP POLICY IF EXISTS "Connection parties can insert attachments" ON public.order_attachments;
DROP POLICY IF EXISTS oa_delete ON public.order_attachments;
DROP POLICY IF EXISTS oa_insert ON public.order_attachments;
DROP POLICY IF EXISTS oa_select ON public.order_attachments;

-- user_accounts: duplicate anon SELECT policy overlapping "anon email lookup
-- for login".
DROP POLICY IF EXISTS admin_anon_read_user_accounts ON public.user_accounts;

-- user_preferences: camelCase duplicates of snake_case policies.
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can read own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
