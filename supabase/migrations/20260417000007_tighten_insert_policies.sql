-- Migration: tighten overly permissive INSERT policies.
-- Advisor flagged INSERT policies that effectively bypass RLS.
--
-- NOTE: Only business_entities is tightened here. The entity_flags and
-- frozen_entities tables were originally slated for WITH CHECK (false),
-- but admin flagging/freezing currently runs through the regular
-- authenticated Supabase client (src/lib/data-store.ts calls from
-- src/components/admin/*), not a service-role admin client. Locking them
-- to false would break the admin panel. Leaving them pending a follow-up
-- that moves admin writes to a SECURITY DEFINER RPC or service role.

DO $$ BEGIN
  DROP POLICY IF EXISTS be_insert_authenticated ON public.business_entities;
  CREATE POLICY be_insert_authenticated ON public.business_entities
    FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) IS NOT NULL);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
