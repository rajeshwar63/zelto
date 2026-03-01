-- Backfill migration: Populate new multi-user fields for existing data
-- Run AFTER add_multi_user_fields.sql has added the columns
--
-- Safe to re-run: each UPDATE only touches rows that haven't been set yet.

-- ============ USER ACCOUNTS ============

-- Backfill username from email for existing users
UPDATE user_accounts
SET username = SPLIT_PART(email, '@', 1)
WHERE username IS NULL OR username = '';

-- Set all existing users as owners
UPDATE user_accounts
SET role = 'owner'
WHERE role IS NULL OR role = '';

-- ============ BUSINESS ENTITIES ============

-- Backfill normalized name for existing businesses
UPDATE business_entities
SET name_normalized = LOWER(TRIM(business_name))
WHERE name_normalized IS NULL;
