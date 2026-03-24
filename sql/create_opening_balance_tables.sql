-- Opening Balance tables for tracking pre-Zelto outstanding dues between connections

CREATE TABLE opening_balances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id         UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  proposed_by_business_id UUID NOT NULL REFERENCES business_entities(id),
  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  line_items            JSONB NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'agreed', 'disputed', 'settled')),
  counter_amount        NUMERIC(12,2),
  agreed_amount         NUMERIC(12,2),
  total_paid            NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at            BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  agreed_at             BIGINT,
  settled_at            BIGINT,
  note                  TEXT,
  UNIQUE(connection_id)
);

CREATE INDEX idx_ob_connection ON opening_balances(connection_id);
CREATE INDEX idx_ob_status ON opening_balances(status);

CREATE TABLE opening_balance_payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_balance_id      UUID NOT NULL REFERENCES opening_balances(id) ON DELETE CASCADE,
  amount                  NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  recorded_by_business_id UUID NOT NULL REFERENCES business_entities(id),
  timestamp               BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  disputed                BOOLEAN NOT NULL DEFAULT false,
  disputed_at             BIGINT
);

CREATE INDEX idx_obp_balance ON opening_balance_payments(opening_balance_id);

-- RLS policies for opening_balances
ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ob_select" ON opening_balances FOR SELECT USING (
  connection_id IN (
    SELECT id FROM connections
    WHERE buyer_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
       OR supplier_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
  )
);

CREATE POLICY "ob_insert" ON opening_balances FOR INSERT WITH CHECK (
  connection_id IN (
    SELECT id FROM connections
    WHERE buyer_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
       OR supplier_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
  )
);

CREATE POLICY "ob_update" ON opening_balances FOR UPDATE USING (
  connection_id IN (
    SELECT id FROM connections
    WHERE buyer_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
       OR supplier_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
  )
);

-- RLS policies for opening_balance_payments
ALTER TABLE opening_balance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obp_select" ON opening_balance_payments FOR SELECT USING (
  opening_balance_id IN (
    SELECT ob.id FROM opening_balances ob
    JOIN connections c ON c.id = ob.connection_id
    WHERE c.buyer_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
       OR c.supplier_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
  )
);

CREATE POLICY "obp_insert" ON opening_balance_payments FOR INSERT WITH CHECK (
  opening_balance_id IN (
    SELECT ob.id FROM opening_balances ob
    JOIN connections c ON c.id = ob.connection_id
    WHERE c.buyer_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
       OR c.supplier_business_id IN (SELECT business_entity_id FROM user_accounts WHERE auth_user_id = auth.uid())
  )
);
