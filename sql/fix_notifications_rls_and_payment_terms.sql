-- =============================================================================
-- Fix 1: Allow NULL payment_terms in the connections table
-- =============================================================================
-- Connection requests accepted when the current user is a Supplier should
-- be able to omit payment_terms (set to NULL) until terms are negotiated.
-- Run this if you see "null value in column payment_terms violates not-null constraint".

ALTER TABLE connections
  ALTER COLUMN payment_terms DROP NOT NULL;


-- =============================================================================
-- Fix 2: Notifications RLS — allow authenticated inserts and appropriate reads/updates
-- =============================================================================
-- First, enable RLS on the notifications table if not already enabled.

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing conflicting policies if re-running this migration.
-- "System can create notifications" is the name used in NOTIFICATION_SETUP.md.
DROP POLICY IF EXISTS "System can create notifications"          ON notifications;
DROP POLICY IF EXISTS "Users can view their own notifications"   ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;

-- Allow any authenticated user (or service-role) to INSERT notifications.
-- This is required so that the connection-acceptance flow can notify the
-- requester even when the accepting user is different from the recipient.
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow a user to read notifications addressed to their own business entity.
-- get_my_business_entity_id() must exist; see below if it does not.
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    recipient_business_id = get_my_business_entity_id()
  );

-- Allow a user to mark their own notifications as read.
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (
    recipient_business_id = get_my_business_entity_id()
  );


-- =============================================================================
-- Helper function: get_my_business_entity_id()
-- =============================================================================
-- Returns the business_entity_id for the currently authenticated Supabase user.
-- Create this function if it does not already exist in your database.
--
-- Prerequisites: user_accounts table has columns (id uuid, business_entity_id uuid).

CREATE OR REPLACE FUNCTION get_my_business_entity_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT business_entity_id
  FROM   user_accounts
  WHERE  id = auth.uid()
  LIMIT  1;
$$;
