-- Migration: add_business_documents.sql
-- Creates business_documents table for compliance documents uploaded to Trust Profile.
-- Storage bucket: business-documents (private, access controlled via RLS)

CREATE TABLE IF NOT EXISTS business_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_entity_id  UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  display_name        VARCHAR(255) NOT NULL,  -- user-defined name after upload
  file_url            TEXT NOT NULL,           -- Supabase Storage URL
  file_name           TEXT NOT NULL,           -- original filename
  file_type           VARCHAR(50) NOT NULL,    -- MIME type
  file_size_bytes     INTEGER,
  expires_at          BIGINT,                  -- epoch ms, nullable — not all docs expire
  uploaded_by         UUID REFERENCES user_accounts(id),
  created_at          BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at          BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_business_documents_business ON business_documents(business_entity_id);
CREATE INDEX IF NOT EXISTS idx_business_documents_expires ON business_documents(expires_at) WHERE expires_at IS NOT NULL;

-- RLS Policies
ALTER TABLE business_documents ENABLE ROW LEVEL SECURITY;

-- Members of the business can read their own documents
-- Connected businesses can also read (for viewing docs via connection)
CREATE POLICY "business_documents_select" ON business_documents
  FOR SELECT USING (
    -- Own business members
    business_entity_id IN (
      SELECT business_entity_id FROM business_members
      WHERE user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND status = 'active'
    )
    OR
    -- Connected businesses can read
    business_entity_id IN (
      SELECT CASE
        WHEN buyer_business_id = (
          SELECT business_entity_id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
        ) THEN supplier_business_id
        ELSE buyer_business_id
      END
      FROM connections
      WHERE buyer_business_id = (
        SELECT business_entity_id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      OR supplier_business_id = (
        SELECT business_entity_id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
    )
  );

-- Only members of the owning business can insert documents
CREATE POLICY "business_documents_insert" ON business_documents
  FOR INSERT WITH CHECK (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members
      WHERE user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND status = 'active'
    )
  );

-- Only members of the owning business can update documents
CREATE POLICY "business_documents_update" ON business_documents
  FOR UPDATE USING (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members
      WHERE user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND status = 'active'
    )
  );

-- Only members of the owning business can delete documents
CREATE POLICY "business_documents_delete" ON business_documents
  FOR DELETE USING (
    business_entity_id IN (
      SELECT business_entity_id FROM business_members
      WHERE user_account_id = (
        SELECT id FROM user_accounts WHERE id::text = auth.uid()::text LIMIT 1
      )
      AND status = 'active'
    )
  );
