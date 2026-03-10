-- Add resolvedAt, resolvedBy, and acknowledgedAt columns to issue_reports
-- for tracking issue resolution lifecycle

ALTER TABLE issue_reports
  ADD COLUMN IF NOT EXISTS resolved_at BIGINT,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_at BIGINT;

-- Add check constraint for resolved_by values
ALTER TABLE issue_reports
  ADD CONSTRAINT issue_reports_resolved_by_check
  CHECK (resolved_by IS NULL OR resolved_by IN ('buyer', 'supplier'));
