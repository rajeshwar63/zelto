-- Migration: ensure business_entities.credibility_score column exists.
-- Required by the dashboard trust-score caching path: the dashboard now
-- reads the cached score directly from business_entities and refreshes it
-- in the background after paint.

ALTER TABLE public.business_entities
  ADD COLUMN IF NOT EXISTS credibility_score INTEGER NOT NULL DEFAULT 0;
