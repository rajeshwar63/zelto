-- Create notifications table for Zelto
-- This table stores all notifications sent to businesses about key events

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_business_id UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'OrderPlaced',
    'OrderDispatched',
    'OrderDeclined',
    'PaymentRecorded',
    'PaymentDisputed',
    'IssueRaised',
    'ConnectionAccepted'
  )),
  related_entity_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at BIGINT
);

-- Create index for faster queries by recipient_business_id
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_business_id 
  ON notifications(recipient_business_id);

-- Create index for faster queries on unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread 
  ON notifications(recipient_business_id, read_at) 
  WHERE read_at IS NULL;

-- Create index for ordering by created_at
CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
  ON notifications(created_at DESC);
