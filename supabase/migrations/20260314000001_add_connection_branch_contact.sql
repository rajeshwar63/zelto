ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS branch_label text,
  ADD COLUMN IF NOT EXISTS contact_name text;
