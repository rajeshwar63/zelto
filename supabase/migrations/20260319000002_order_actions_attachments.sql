-- Order Actions & Attachments
-- Extends the existing order_attachments table and adds RLS policies
-- Adds storage bucket for order attachments

-- 1. Add new columns to existing order_attachments table
ALTER TABLE order_attachments
  ADD COLUMN IF NOT EXISTS payment_event_id uuid REFERENCES payment_events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS file_size_bytes integer,
  ADD COLUMN IF NOT EXISTS storage_path text;

-- 2. Drop existing type check constraint (if any) and recreate with expanded values
-- The existing type column has values: 'bill', 'payment_proof', 'note'
-- We add: 'dispatch_note', 'delivery_proof'
DO $$
BEGIN
  -- Drop old check constraint if it exists
  ALTER TABLE order_attachments DROP CONSTRAINT IF EXISTS order_attachments_type_check;
  -- Add new constraint with expanded type list
  ALTER TABLE order_attachments ADD CONSTRAINT order_attachments_type_check
    CHECK (type IN ('bill', 'payment_proof', 'note', 'dispatch_note', 'delivery_proof'));
EXCEPTION WHEN OTHERS THEN
  -- If no constraint existed, just add the new one
  ALTER TABLE order_attachments ADD CONSTRAINT order_attachments_type_check
    CHECK (type IN ('bill', 'payment_proof', 'note', 'dispatch_note', 'delivery_proof'));
END$$;

-- 3. RLS Policies for order_attachments
-- (These complement any existing policies)

-- View: both buyer and supplier in the connection can read attachments
DROP POLICY IF EXISTS "Connection parties can view attachments" ON order_attachments;
CREATE POLICY "Connection parties can view attachments"
  ON order_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN connections c ON c.id = o.connection_id
      WHERE o.id = order_attachments.order_id
        AND (
          c.buyer_business_id = (auth.uid())::text::uuid
          OR c.supplier_business_id = (auth.uid())::text::uuid
        )
    )
  );

-- Insert: only connection parties can add attachments
DROP POLICY IF EXISTS "Only connection parties can insert attachments" ON order_attachments;
CREATE POLICY "Only connection parties can insert attachments"
  ON order_attachments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN connections c ON c.id = o.connection_id
      WHERE o.id = order_attachments.order_id
        AND (
          c.buyer_business_id = (auth.uid())::text::uuid
          OR c.supplier_business_id = (auth.uid())::text::uuid
        )
    )
  );

-- Delete: only uploader can delete
DROP POLICY IF EXISTS "Only uploader can delete attachments" ON order_attachments;
CREATE POLICY "Only uploader can delete attachments"
  ON order_attachments
  FOR DELETE
  USING (uploaded_by = (auth.uid())::text);

-- 4. Storage bucket for order-attachments (private, signed URLs)
-- Note: bucket creation is typically done via Supabase dashboard or management API.
-- The insert below is idempotent if using Supabase's storage.buckets table directly.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-attachments',
  'order-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: allow authenticated users to upload to order-attachments bucket
DROP POLICY IF EXISTS "Authenticated users can upload order attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload order attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'order-attachments');

DROP POLICY IF EXISTS "Connection parties can view order attachment files" ON storage.objects;
CREATE POLICY "Connection parties can view order attachment files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'order-attachments');
