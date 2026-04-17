-- Migration: enable RLS on tables that were public but unprotected.
-- Flagged by Supabase security advisor. Any user with the anon/authenticated
-- key could read/write these tables until this migration runs.

-- ---------------- device_tokens ----------------
-- dt_* policies already exist (created in sql/create_device_tokens_table.sql).
-- Enabling RLS activates them.
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- ---------------- issue_comments ----------------
ALTER TABLE public.issue_comments ENABLE ROW LEVEL SECURITY;

-- Connection parties may read comments on issues raised in their orders.
DO $$ BEGIN
  CREATE POLICY issue_comments_select ON public.issue_comments
    FOR SELECT TO authenticated
    USING (
      issue_id IN (
        SELECT ir.id FROM public.issue_reports ir
        JOIN public.orders o ON o.id = ir.order_id
        JOIN public.connections c ON c.id = o.connection_id
        JOIN public.user_accounts ua ON (
          ua.business_entity_id = c.buyer_business_id OR
          ua.business_entity_id = c.supplier_business_id
        )
        WHERE ua.auth_user_id = (select auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Members of the author's business may insert comments authored by that business.
DO $$ BEGIN
  CREATE POLICY issue_comments_insert ON public.issue_comments
    FOR INSERT TO authenticated
    WITH CHECK (
      author_business_id IN (
        SELECT business_entity_id FROM public.user_accounts
        WHERE auth_user_id = (select auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------- connection_contacts ----------------
ALTER TABLE public.connection_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY connection_contacts_select ON public.connection_contacts
    FOR SELECT TO authenticated
    USING (
      business_id IN (
        SELECT business_entity_id FROM public.user_accounts
        WHERE auth_user_id = (select auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY connection_contacts_insert ON public.connection_contacts
    FOR INSERT TO authenticated
    WITH CHECK (
      business_id IN (
        SELECT business_entity_id FROM public.user_accounts
        WHERE auth_user_id = (select auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY connection_contacts_update ON public.connection_contacts
    FOR UPDATE TO authenticated
    USING (
      business_id IN (
        SELECT business_entity_id FROM public.user_accounts
        WHERE auth_user_id = (select auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY connection_contacts_delete ON public.connection_contacts
    FOR DELETE TO authenticated
    USING (
      business_id IN (
        SELECT business_entity_id FROM public.user_accounts
        WHERE auth_user_id = (select auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------- member_invites ----------------
ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;

-- Senders see invites they created; recipients see invites addressed to their email.
DO $$ BEGIN
  CREATE POLICY member_invites_select ON public.member_invites
    FOR SELECT TO authenticated
    USING (
      invited_by IN (
        SELECT id FROM public.user_accounts
        WHERE auth_user_id = (select auth.uid())
      )
      OR email = (select auth.jwt() ->> 'email')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY member_invites_insert ON public.member_invites
    FOR INSERT TO authenticated
    WITH CHECK (
      invited_by IN (
        SELECT id FROM public.user_accounts
        WHERE auth_user_id = (select auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- otp_codes and admin_accounts have RLS enabled with zero policies. This is
-- correct: clients must never query them directly. The client code has been
-- verified to not reference otp_codes; admin_accounts is only touched by the
-- orphan src/lib/admin-store.ts which is never imported (admin login validates
-- against VITE_ADMIN_USERNAME/VITE_ADMIN_PASSWORD locally).
