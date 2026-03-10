-- Add description column to issue_reports for issue context
ALTER TABLE issue_reports
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Create issue_comments table for threaded responses on issues
CREATE TABLE IF NOT EXISTS issue_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
  author_business_id UUID NOT NULL REFERENCES business_entities(id),
  author_role VARCHAR(10) NOT NULL CHECK (author_role IN ('buyer', 'supplier')),
  message TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- Index for fast lookup by issue
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id);
