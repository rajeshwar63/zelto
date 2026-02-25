-- Order Attachments table
-- Stores file attachments (bills, payment proofs, notes) linked to orders

CREATE TABLE IF NOT EXISTS order_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  thumbnail_url TEXT,
  note_text TEXT,
  type TEXT NOT NULL CHECK (type IN ('bill', 'payment_proof', 'note')),
  uploaded_by UUID NOT NULL REFERENCES business_entities(id),
  timestamp BIGINT NOT NULL
);

CREATE INDEX idx_order_attachments_order_id ON order_attachments(order_id);
CREATE INDEX idx_order_attachments_uploaded_by ON order_attachments(uploaded_by);
