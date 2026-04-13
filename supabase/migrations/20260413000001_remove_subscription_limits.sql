-- Migration: remove_subscription_limits.sql
-- Zelto is now fully free — no subscription gates, no limits.
-- Make all existing businesses "pro" permanently and update defaults for new signups.

-- 1. Make all existing businesses permanently "pro" with no expiry
UPDATE business_subscriptions
SET plan = 'pro',
    status = 'active',
    expires_at = NULL
WHERE plan = 'free' OR status = 'lapsed';

-- 2. Change default so new rows are created as 'pro'
ALTER TABLE business_subscriptions ALTER COLUMN plan SET DEFAULT 'pro';

-- 3. Also update the plan column on business_entities (added by add_subscription_to_business.sql)
UPDATE business_entities
SET plan = 'pro'
WHERE plan = 'free';

ALTER TABLE business_entities ALTER COLUMN plan SET DEFAULT 'pro';
