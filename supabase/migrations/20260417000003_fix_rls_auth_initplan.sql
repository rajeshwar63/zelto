-- Migration: wrap auth.uid()/auth.jwt() calls in RLS policies with (select ...)
-- Flagged by Supabase performance advisor as auth_rls_initplan.
--
-- Postgres re-evaluates naked auth.uid() for EVERY ROW in the result set when
-- used inside an RLS USING/WITH CHECK expression. Wrapping it in a subselect
-- causes Postgres to evaluate it ONCE per query (initplan).
--
-- Rather than hand-writing every policy's new expression (which risks drifting
-- from what currently exists in production), this migration reads the current
-- policy definition from pg_policy, string-replaces the auth function calls,
-- and recreates the policy with identical semantics.

DO $$
DECLARE
  r RECORD;
  v_cmd_char CHAR;
  v_cmd TEXT;
  v_qual TEXT;
  v_check TEXT;
  v_roles TEXT;
  v_permissive BOOLEAN;
  v_new_qual TEXT;
  v_new_check TEXT;
  v_sql TEXT;
BEGIN
  FOR r IN
    SELECT table_name, policy_name
    FROM (VALUES
      ('business_members',         'admin_insert_members'),
      ('business_members',         'admin_update_members'),
      ('business_members',         'admin_delete_members'),
      ('business_members',         'read_own_business_members'),
      ('user_preferences',         'Users can update own preferences'),
      ('user_preferences',         'user_preferences_select_own'),
      ('user_preferences',         'user_preferences_insert_own'),
      ('user_preferences',         'user_preferences_update_own'),
      ('user_preferences',         'Users can read own preferences'),
      ('user_preferences',         'Users can insert own preferences'),
      ('invoice_settings',         'business reads own invoice settings'),
      ('business_documents',       'business_documents_select_connected'),
      ('business_documents',       'business_documents_insert_own'),
      ('business_documents',       'business_documents_delete_own'),
      ('invoices',                 'supplier updates invoice'),
      ('invoices',                 'invoice parties can read'),
      ('invoices',                 'supplier manages invoice'),
      ('opening_balances',         'ob_insert'),
      ('opening_balances',         'ob_select'),
      ('opening_balances',         'ob_update'),
      ('item_master',              'business manages own items'),
      ('user_accounts',            'ua_update_own'),
      ('user_accounts',            'ua_insert_own'),
      ('user_accounts',            'ua_select_own_and_teammates'),
      ('order_attachments',        'Connection parties can view attachments'),
      ('order_attachments',        'Only connection parties can insert attachments'),
      ('order_attachments',        'Only uploader can delete attachments'),
      ('invoice_line_items',       'invoice parties can read line items'),
      ('invoice_line_items',       'supplier inserts line items'),
      ('connection_blocks',        'Users can manage their own blocks'),
      ('business_subscriptions',   'members_read_subscription'),
      ('business_subscriptions',   'admin_update_subscription'),
      ('business_invites',         'read_own_business_invites'),
      ('business_invites',         'admin_manage_invites'),
      ('opening_balance_payments', 'obp_select'),
      ('opening_balance_payments', 'obp_insert'),
      ('notifications',            'notifications_select_own'),
      ('notifications',            'notifications_insert_connection_party'),
      ('notifications',            'notifications_update_own'),
      ('notifications',            'notifications_delete_own')
    ) AS t(table_name, policy_name)
  LOOP
    SELECT
      p.polcmd,
      p.polpermissive,
      pg_get_expr(p.polqual, p.polrelid),
      pg_get_expr(p.polwithcheck, p.polrelid),
      pg_catalog.array_to_string(
        COALESCE(
          (SELECT array_agg(quote_ident(rolname) ORDER BY rolname)
           FROM pg_roles WHERE oid = ANY(p.polroles)),
          ARRAY['PUBLIC']::text[]
        ),
        ', '
      )
    INTO v_cmd_char, v_permissive, v_qual, v_check, v_roles
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = r.table_name
      AND p.polname = r.policy_name;

    IF v_cmd_char IS NULL THEN
      RAISE NOTICE '[skip] policy "%.%": not found', r.table_name, r.policy_name;
      CONTINUE;
    END IF;

    v_cmd := CASE v_cmd_char
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
    END;

    -- Idempotency: if the expression already uses (select auth...) or doesn't
    -- reference auth functions at all, skip.
    IF (
      (v_qual IS NULL OR v_qual !~ '\mauth\.(uid|jwt|role|email)\s*\(')
      AND
      (v_check IS NULL OR v_check !~ '\mauth\.(uid|jwt|role|email)\s*\(')
    ) THEN
      RAISE NOTICE '[skip] policy "%.%": no auth.* calls to rewrite (already rewritten or N/A)',
        r.table_name, r.policy_name;
      CONTINUE;
    END IF;

    -- Rewrite: wrap bare auth.uid() / auth.jwt() / auth.role() / auth.email()
    -- calls in (select ...) so Postgres evaluates once per query.
    -- regexp_replace with \m (left word boundary) avoids wrapping calls that
    -- are already inside (select ...).
    v_new_qual := v_qual;
    v_new_check := v_check;

    IF v_new_qual IS NOT NULL THEN
      v_new_qual := regexp_replace(
        v_new_qual,
        '\(\s*select\s+auth\.(uid|jwt|role|email)\s*\(\s*\)\s*\)',
        'SELAUTH_\1()',
        'gi'
      );
      v_new_qual := regexp_replace(
        v_new_qual,
        '\mauth\.(uid|jwt|role|email)\s*\(\s*\)',
        '(select auth.\1())',
        'g'
      );
      v_new_qual := regexp_replace(
        v_new_qual,
        'SELAUTH_(uid|jwt|role|email)\(\)',
        '(select auth.\1())',
        'g'
      );
    END IF;

    IF v_new_check IS NOT NULL THEN
      v_new_check := regexp_replace(
        v_new_check,
        '\(\s*select\s+auth\.(uid|jwt|role|email)\s*\(\s*\)\s*\)',
        'SELAUTH_\1()',
        'gi'
      );
      v_new_check := regexp_replace(
        v_new_check,
        '\mauth\.(uid|jwt|role|email)\s*\(\s*\)',
        '(select auth.\1())',
        'g'
      );
      v_new_check := regexp_replace(
        v_new_check,
        'SELAUTH_(uid|jwt|role|email)\(\)',
        '(select auth.\1())',
        'g'
      );
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', r.policy_name, r.table_name);

    v_sql := format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
      r.policy_name,
      r.table_name,
      CASE WHEN v_permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      v_cmd,
      v_roles
    );

    IF v_new_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_new_qual);
    END IF;

    IF v_new_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_new_check);
    END IF;

    EXECUTE v_sql;

    RAISE NOTICE '[ok] rewrote policy "%.%"', r.table_name, r.policy_name;
  END LOOP;
END $$;
