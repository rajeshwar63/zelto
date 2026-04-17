-- Migration: add missing foreign-key indexes
-- Flagged by Supabase performance advisor on 2026-04-17
-- Every query joining on these FKs was scanning the full referenced table.

-- business_documents
CREATE INDEX IF NOT EXISTS idx_business_documents_business_id_v2
  ON public.business_documents (business_id);
CREATE INDEX IF NOT EXISTS idx_business_documents_uploaded_by
  ON public.business_documents (uploaded_by);

-- business_invites
CREATE INDEX IF NOT EXISTS idx_business_invites_accepted_by
  ON public.business_invites (accepted_by);
CREATE INDEX IF NOT EXISTS idx_business_invites_invited_by
  ON public.business_invites (invited_by);

-- business_members
CREATE INDEX IF NOT EXISTS idx_business_members_invited_by
  ON public.business_members (invited_by);

-- business_subscriptions
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_subscribed_by
  ON public.business_subscriptions (subscribed_by);

-- connection_contacts
CREATE INDEX IF NOT EXISTS idx_connection_contacts_business_id
  ON public.connection_contacts (business_id);

-- entity_flags
CREATE INDEX IF NOT EXISTS idx_entity_flags_entity_id
  ON public.entity_flags (entity_id);

-- invoice_line_items
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
  ON public.invoice_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_item_master_id
  ON public.invoice_line_items (item_master_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_business_entity_id
  ON public.invoices (buyer_business_entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id
  ON public.invoices (order_id);

-- issue_comments
CREATE INDEX IF NOT EXISTS idx_issue_comments_author_business_id
  ON public.issue_comments (author_business_id);

-- item_master
CREATE INDEX IF NOT EXISTS idx_item_master_business_entity_id
  ON public.item_master (business_entity_id);

-- member_invites
CREATE INDEX IF NOT EXISTS idx_member_invites_accepted_by
  ON public.member_invites (accepted_by);
CREATE INDEX IF NOT EXISTS idx_member_invites_invited_by
  ON public.member_invites (invited_by);

-- opening_balance_payments
CREATE INDEX IF NOT EXISTS idx_opening_balance_payments_recorded_by_business_id
  ON public.opening_balance_payments (recorded_by_business_id);

-- opening_balances
CREATE INDEX IF NOT EXISTS idx_opening_balances_proposed_by_business_id
  ON public.opening_balances (proposed_by_business_id);

-- order_attachments
CREATE INDEX IF NOT EXISTS idx_order_attachments_payment_event_id
  ON public.order_attachments (payment_event_id);

-- role_change_requests
CREATE INDEX IF NOT EXISTS idx_role_change_requests_connection_id
  ON public.role_change_requests (connection_id);
CREATE INDEX IF NOT EXISTS idx_role_change_requests_requested_by_business_id
  ON public.role_change_requests (requested_by_business_id);

-- user_accounts
CREATE INDEX IF NOT EXISTS idx_user_accounts_member_invite_id
  ON public.user_accounts (member_invite_id);
