# Notification System Setup Guide

## Overview
This guide explains how to set up the notification system in the Zelto application.

## Database Setup

### Creating the Notifications Table

Run the following SQL script in your Supabase SQL editor:

```sql
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
  related_entity_id UUID NOT NULL,
  connection_id UUID NOT NULL,
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
```

### Enable Row Level Security (RLS)

If you have RLS enabled on your database, add these policies:

```sql
-- Allow users to read their own notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (
    recipient_business_id IN (
      SELECT business_entity_id 
      FROM user_accounts 
      WHERE id = auth.uid()
    )
  );

-- Allow the system to create notifications
CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Allow users to update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (
    recipient_business_id IN (
      SELECT business_entity_id 
      FROM user_accounts 
      WHERE id = auth.uid()
    )
  );
```

## Features

### Notification Types

The system supports the following notification types:

1. **OrderPlaced** - Sent to supplier when a buyer places an order
2. **OrderDispatched** - Sent to buyer when supplier dispatches an order
3. **OrderDeclined** - Sent to buyer when supplier declines an order
4. **PaymentRecorded** - Sent to the other party when a payment is recorded
5. **PaymentDisputed** - Sent to the other party when a payment is disputed
6. **IssueRaised** - Sent to the other party when an issue is raised
7. **ConnectionAccepted** - Sent to requester when their connection request is accepted

### User Interface

- **Bell Icon**: Located in the Profile tab header with an unread count badge
- **Notification History Screen**: Shows all notifications sorted by date with read/unread indicators
- **Mark as Read**: Individual notifications are marked as read when tapped
- **Mark All as Read**: Button to mark all notifications as read at once
- **Navigation**: Tapping a notification navigates to the relevant connection or order

### Performance

- Notifications are limited to 100 most recent per query to optimize performance
- Indexes are created for fast lookups by recipient and unread status
- Notifications are marked as read asynchronously to avoid blocking UI

## Testing

After setting up the database:

1. Create a connection between two businesses
2. Place an order - supplier should receive a notification
3. Dispatch the order - buyer should receive a notification
4. Record a payment - other party should receive a notification
5. Raise an issue - other party should receive a notification
6. Dispute a payment - other party should receive a notification
7. Accept a connection request - requester should receive a notification

## Troubleshooting

### Notifications not appearing

1. Check that the notifications table was created successfully
2. Verify RLS policies are correctly configured
3. Check browser console for any errors
4. Ensure Supabase connection is working

### Badge count not updating

- The badge count updates when ProfileScreen is loaded
- Try navigating away and back to the Profile tab
- Check network tab for failed API calls

## Future Enhancements

Potential improvements for the future:

- Push notifications for mobile
- Email notifications for important events
- Notification preferences/settings
- Group notifications by connection
- Notification search and filtering
- Pagination for notification history
