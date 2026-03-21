-- Add description column to business_entities
ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Create business_documents table
CREATE TABLE IF NOT EXISTS business_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  document_type    TEXT NOT NULL,
  -- Allowed values: 'gst_certificate' | 'msme_udyam' | 'trade_licence' |
  --                 'fssai_licence' | 'pan_card' | 'fire_safety' | 'other'
  file_name        TEXT NOT NULL,
  file_url         TEXT NOT NULL,       -- Supabase Storage public URL
  file_size_bytes  INTEGER,
  mime_type        TEXT,               -- 'application/pdf' | 'image/jpeg' | 'image/png'
  expiry_date      DATE,               -- nullable, for licences with expiry
  verification_status TEXT NOT NULL DEFAULT 'pending',
  -- Allowed values: 'pending' | 'verified'
  uploaded_at      BIGINT NOT NULL     -- epoch ms
);

-- Ensure required columns exist if table was pre-created with a different schema
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES business_entities(id) ON DELETE CASCADE;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS uploaded_at BIGINT;

CREATE INDEX IF NOT EXISTS idx_business_documents_business_id ON business_documents(business_id);

-- RLS Policies for business_documents

ALTER TABLE business_documents ENABLE ROW LEVEL SECURITY;

-- Business owners can insert their own documents
DO $$ BEGIN
  CREATE POLICY "business_documents_insert_own"
    ON business_documents FOR INSERT
    WITH CHECK (
      business_id IN (
        SELECT business_entity_id FROM user_accounts
        WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Business owners can delete their own documents
DO $$ BEGIN
  CREATE POLICY "business_documents_delete_own"
    ON business_documents FOR DELETE
    USING (
      business_id IN (
        SELECT business_entity_id FROM user_accounts
        WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Anyone can SELECT documents for a business they are connected to, or their own
DO $$ BEGIN
  CREATE POLICY "business_documents_select_connected"
    ON business_documents FOR SELECT
    USING (
      -- Own documents
      business_id IN (
        SELECT business_entity_id FROM user_accounts
        WHERE auth_user_id = auth.uid()
      )
      OR
      -- Connected business documents
      business_id IN (
        SELECT
          CASE
            WHEN buyer_business_id IN (
              SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
            ) THEN supplier_business_id
            ELSE buyer_business_id
          END
        FROM connections
        WHERE
          buyer_business_id IN (
            SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
          )
          OR supplier_business_id IN (
            SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
