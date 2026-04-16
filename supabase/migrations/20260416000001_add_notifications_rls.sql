-- ============================================================
-- Migration: add_notifications_rls
-- Adds Row Level Security policies to the notifications table.
-- The table was created without RLS policies, which means if RLS
-- was enabled (e.g. via Supabase dashboard), all client-side
-- operations would be silently denied.
-- ============================================================

-- 1. Enable RLS (idempotent — no-op if already enabled)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 2. SELECT: Users can read notifications addressed to their business
DO $$ BEGIN
  CREATE POLICY "notifications_select_own"
    ON notifications FOR SELECT TO authenticated
    USING (
      recipient_business_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. INSERT: Connection parties can create notifications for each other.
--    When a user performs an action (e.g. places an order), they create a
--    notification for the OTHER party in the connection. This policy verifies
--    the inserting user belongs to one side of the referenced connection.
--    Note: MemberJoined and ConnectionAccepted notifications are created in
--    SECURITY DEFINER RPCs which bypass RLS entirely.
DO $$ BEGIN
  CREATE POLICY "notifications_insert_connection_party"
    ON notifications FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM connections c
        WHERE c.id = notifications.connection_id
        AND (
          c.buyer_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
          OR c.supplier_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. UPDATE: Users can mark their own notifications as read
DO $$ BEGIN
  CREATE POLICY "notifications_update_own"
    ON notifications FOR UPDATE TO authenticated
    USING (
      recipient_business_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    )
    WITH CHECK (
      recipient_business_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. DELETE: Users can delete their own notifications (used by dev resetAllData)
DO $$ BEGIN
  CREATE POLICY "notifications_delete_own"
    ON notifications FOR DELETE TO authenticated
    USING (
      recipient_business_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
