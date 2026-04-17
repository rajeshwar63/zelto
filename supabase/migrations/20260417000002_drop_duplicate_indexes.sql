-- Migration: drop duplicate indexes flagged by performance advisor.
-- Each duplicate index slows every INSERT/UPDATE on that table without
-- providing any read benefit.

-- business_documents: duplicate on business_id.
-- Keeping idx_business_documents_business_id_v2 (created in the preceding migration).
DROP INDEX IF EXISTS public.idx_business_documents_business_id;

-- user_accounts: duplicate on auth_user_id. Keep idx_user_accounts_auth_user_id.
DROP INDEX IF EXISTS public.idx_user_accounts_auth_user;

-- user_accounts: duplicate on business_entity_id. Keep idx_user_accounts_business_entity_id.
DROP INDEX IF EXISTS public.idx_user_accounts_business;
