-- Standardize user identity: use email as the single source of truth
-- Remove phone_number column and ensure email column exists
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS email TEXT,
  DROP COLUMN IF EXISTS phone_number;
