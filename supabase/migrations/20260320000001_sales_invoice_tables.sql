-- Sales Invoice Feature: invoice_settings, item_master, invoices, invoice_line_items
-- Plus get_next_invoice_number RPC

-- ============ INVOICE SETTINGS ============
CREATE TABLE IF NOT EXISTS invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_entity_id UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  default_due_days INTEGER NOT NULL DEFAULT 7,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  upi_id TEXT,
  terms_and_conditions TEXT,
  logo_url TEXT,
  signature_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_entity_id)
);

ALTER TABLE invoice_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "business reads own invoice settings"
    ON invoice_settings FOR ALL TO authenticated
    USING (
      business_entity_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_invoice_settings_updated_at
    BEFORE UPDATE ON invoice_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ ITEM MASTER ============
CREATE TABLE IF NOT EXISTS item_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_entity_id UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hsn_code TEXT,
  tax_rate NUMERIC(5,2),
  sale_price NUMERIC(12,2),
  purchase_price NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "business manages own items"
    ON item_master FOR ALL TO authenticated
    USING (
      business_entity_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_item_master_updated_at
    BEFORE UPDATE ON item_master
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ INVOICES ============
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_business_entity_id UUID NOT NULL REFERENCES business_entities(id),
  buyer_business_entity_id UUID NOT NULL REFERENCES business_entities(id),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  place_of_supply TEXT,
  subtotal NUMERIC(12,2) NOT NULL,
  taxable_amount NUMERIC(12,2) NOT NULL,
  total_cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_igst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL,
  is_inter_state BOOLEAN NOT NULL DEFAULT false,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('draft', 'generated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplier_business_entity_id, invoice_number)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "invoice parties can read"
    ON invoices FOR SELECT TO authenticated
    USING (
      supplier_business_entity_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
      OR
      buyer_business_entity_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "supplier manages invoice"
    ON invoices FOR INSERT TO authenticated
    WITH CHECK (
      supplier_business_entity_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "supplier updates invoice"
    ON invoices FOR UPDATE TO authenticated
    USING (
      supplier_business_entity_id IN (
        SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ INVOICE LINE ITEMS ============
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_master_id UUID REFERENCES item_master(id),
  name TEXT NOT NULL,
  hsn_code TEXT,
  quantity NUMERIC(10,3) NOT NULL,
  unit TEXT,
  rate NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(12,2) NOT NULL,
  tax_amount NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "invoice parties can read line items"
    ON invoice_line_items FOR SELECT TO authenticated
    USING (
      invoice_id IN (
        SELECT id FROM invoices WHERE
          supplier_business_entity_id IN (
            SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
          )
          OR
          buyer_business_entity_id IN (
            SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "supplier inserts line items"
    ON invoice_line_items FOR INSERT TO authenticated
    WITH CHECK (
      invoice_id IN (
        SELECT id FROM invoices WHERE
          supplier_business_entity_id IN (
            SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid()
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ GET NEXT INVOICE NUMBER RPC ============
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_business_entity_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_number INTEGER;
  v_invoice_number TEXT;
BEGIN
  SELECT invoice_prefix, next_invoice_number
  INTO v_prefix, v_number
  FROM invoice_settings
  WHERE business_entity_id = p_business_entity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO invoice_settings (business_entity_id)
    VALUES (p_business_entity_id)
    RETURNING invoice_prefix, next_invoice_number INTO v_prefix, v_number;
  END IF;

  v_invoice_number := v_prefix || v_number::TEXT;

  UPDATE invoice_settings
  SET next_invoice_number = next_invoice_number + 1
  WHERE business_entity_id = p_business_entity_id;

  RETURN v_invoice_number;
END;
$$;
