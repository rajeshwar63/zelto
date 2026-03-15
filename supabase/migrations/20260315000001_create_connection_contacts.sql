-- Create private-per-business contact table
-- Each side of a connection stores their own phone/branch/contact independently
CREATE TABLE IF NOT EXISTS connection_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  contact_phone text,
  branch_label text,
  contact_name text,
  UNIQUE (connection_id, business_id)
);

-- Migrate existing shared data: give a copy to BOTH buyer and supplier
-- (We cannot determine which party originally entered the data, so both get the existing values)
INSERT INTO connection_contacts (connection_id, business_id, contact_phone, branch_label, contact_name)
SELECT c.id, c.buyer_business_id, c.contact_phone, c.branch_label, c.contact_name
FROM connections c
WHERE c.contact_phone IS NOT NULL OR c.branch_label IS NOT NULL OR c.contact_name IS NOT NULL
ON CONFLICT (connection_id, business_id) DO NOTHING;

INSERT INTO connection_contacts (connection_id, business_id, contact_phone, branch_label, contact_name)
SELECT c.id, c.supplier_business_id, c.contact_phone, c.branch_label, c.contact_name
FROM connections c
WHERE c.contact_phone IS NOT NULL OR c.branch_label IS NOT NULL OR c.contact_name IS NOT NULL
ON CONFLICT (connection_id, business_id) DO NOTHING;

-- Drop old shared columns from connections
ALTER TABLE connections
  DROP COLUMN IF EXISTS contact_phone,
  DROP COLUMN IF EXISTS branch_label,
  DROP COLUMN IF EXISTS contact_name;
