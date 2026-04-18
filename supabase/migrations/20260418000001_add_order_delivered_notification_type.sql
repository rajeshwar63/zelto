-- Add OrderDelivered to the notifications CHECK constraint.
-- Already applied directly to production on 2026-04-18; this migration exists
-- only so dev branches / future deploys stay in sync with production state.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'OrderPlaced',
    'OrderAccepted',
    'OrderDispatched',
    'OrderDelivered',
    'OrderDeclined',
    'PaymentRecorded',
    'PaymentDisputed',
    'IssueRaised',
    'IssueAcknowledged',
    'IssueResolved',
    'ConnectionAccepted',
    'MemberJoined'
  ));
