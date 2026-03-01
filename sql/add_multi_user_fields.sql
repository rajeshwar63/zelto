-- Migration: Add multi-user and fuzzy search fields
-- Adds username, phone, role to user_accounts
-- Adds name_normalized, city, area, phone to business_entities
-- Enables pg_trgm extension for fuzzy business name search

-- ============ EXTENSIONS ============

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ USER ACCOUNTS ============

-- Editable display name (defaults to email prefix for existing rows)
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS username VARCHAR(100);

-- Backfill username from email prefix for existing rows
UPDATE user_accounts
  SET username = split_part(email, '@', 1)
  WHERE username IS NULL;

-- Now make it NOT NULL
ALTER TABLE user_accounts
  ALTER COLUMN username SET NOT NULL;

-- Optional self-declared mobile number
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS phone VARCHAR(15);

-- Role within the business entity: owner, admin, or member
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'owner';

-- ============ BUSINESS ENTITIES ============

-- Lowercase, stripped version of business name for fuzzy matching
ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS name_normalized VARCHAR(255);

-- Backfill name_normalized from existing business_name
UPDATE business_entities
  SET name_normalized = lower(trim(business_name))
  WHERE name_normalized IS NULL;

-- City where the business operates
ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS city VARCHAR(100);

-- Locality/neighborhood (optional)
ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS area VARCHAR(100);

-- Business contact number (self-declared, not verified)
ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS phone VARCHAR(15);

-- ============ INDEXES ============

-- Trigram index for fuzzy name matching
CREATE INDEX IF NOT EXISTS idx_businesses_name_trgm
  ON business_entities USING gin(name_normalized gin_trgm_ops);

-- Index for city-based filtering
CREATE INDEX IF NOT EXISTS idx_businesses_city
  ON business_entities(city);

-- ============ RPC FUNCTION FOR FUZZY SEARCH ============

-- Search businesses by name similarity within a city, using pg_trgm
CREATE OR REPLACE FUNCTION search_businesses_by_name(
  search_name TEXT,
  search_city TEXT
)
RETURNS SETOF business_entities
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM business_entities
  WHERE city = search_city
    AND similarity(name_normalized, search_name) > 0.3
  ORDER BY similarity(name_normalized, search_name) DESC;
$$;
