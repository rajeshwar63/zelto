-- Migration: add_subscription_to_business.sql
-- Moves subscription fields to business_entities (subscription belongs to business, not user).
-- Razorpay integration is blocked pending company registration — columns added now for correct data model.

ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS plan                VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS plan_started_at     BIGINT,
  ADD COLUMN IF NOT EXISTS plan_expires_at     BIGINT,
  ADD COLUMN IF NOT EXISTS razorpay_sub_id     TEXT,
  ADD COLUMN IF NOT EXISTS early_bird_eligible BOOLEAN NOT NULL DEFAULT FALSE;
