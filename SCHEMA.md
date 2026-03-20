# Zelto — Live Supabase Schema (Ground Truth)

> **For AI agents:** Read this file FIRST before touching any database-related code.  
> This reflects the ACTUAL live database. Do not assume any column exists unless listed here.  
> To add a new column or table, write a new SQL migration file — never modify existing ones.

---

## ⚠️ Critical Issue Found

`user_accounts` table is **MISSING required columns** that the code expects:

| Column | Expected by code | Present in DB? |
|--------|-----------------|----------------|
| `business_entity_id` | `data-store.ts` uses this to link users to businesses | ❌ MISSING |
| `username` | `data-store.ts` sets this on create | ❌ MISSING |
| `role` | `data-store.ts` sets this on create | ❌ MISSING |
| `phone` | Optional user phone | ❌ MISSING |
| `email` | Used as login credential | ✅ Present |

**This is likely your #1 source of errors right now.** Run the fix SQL at the bottom of this file.

---

## Tables

### `admin_accounts`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| username | varchar | NO | — |
| password | text | NO | — |
| created_at | bigint | NO | epoch ms |

---

### `business_entities`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| zelto_id | varchar | NO | — |
| business_name | varchar | NO | — |
| name_normalized | varchar | YES | — |
| city | varchar | YES | — |
| area | varchar | YES | — |
| phone | varchar | YES | — |
| gst_number | varchar | YES | — |
| business_address | text | YES | — |
| business_type | varchar | YES | — |
| website | text | YES | — |
| created_at | bigint | NO | epoch ms |

---

### `user_accounts`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| email | varchar | NO | — |
| ❌ business_entity_id | — | MISSING | MISSING |
| ❌ username | — | MISSING | MISSING |
| ❌ role | — | MISSING | MISSING |
| ❌ phone | — | MISSING | MISSING |

> **See fix SQL below.**

---

### `connection_requests`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| requester_business_id | uuid | NO | — |
| receiver_business_id | uuid | NO | — |
| requester_role | varchar | NO | — |
| receiver_role | varchar | NO | — |
| status | varchar | NO | 'Pending' |
| created_at | bigint | NO | epoch ms |
| resolved_at | bigint | YES | — |

---

### `connections`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| buyer_business_id | uuid | NO | — |
| supplier_business_id | uuid | NO | — |
| payment_terms | jsonb | YES | — |
| connection_state | varchar | NO | 'Stable' |
| behaviour_history | jsonb | NO | '[]' |
| created_at | bigint | NO | epoch ms |
| contact_phone | text | YES | — |

> **`contact_phone`**: Phone number stored by the viewing user for this connection. Used for call/WhatsApp actions. Not shared with the other party. Run migration: `ALTER TABLE connections ADD COLUMN IF NOT EXISTS contact_phone text;`

---

### `orders`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| connection_id | uuid | NO | — |
| item_summary | text | NO | — |
| order_value | numeric | NO | — |
| payment_terms_snapshot | jsonb | NO | — |
| state | varchar | NO | 'Placed' |
| placed_at | bigint | NO | epoch ms |
| accepted_at | bigint | YES | — |
| dispatched_at | bigint | YES | — |
| delivered_at | bigint | YES | — |
| invoice_date | bigint | YES | — |
| created_at | bigint | NO | epoch ms |

---

### `payment_events`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| order_id | uuid | NO | — |
| amount_paid | numeric | NO | — |
| disputed | boolean | NO | false |
| note | text | YES | — |
| created_at | bigint | NO | epoch ms |

---

### `issue_reports`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| order_id | uuid | NO | — |
| issue_type | text | NO | — |
| severity | varchar | NO | — |
| raised_by | varchar | NO | — |
| status | varchar | NO | 'Open' |
| description | text | YES | — |
| acknowledged_at | bigint | YES | — |
| resolved_at | bigint | YES | — |
| resolved_by | text | YES | — |
| created_at | bigint | NO | epoch ms |

> **Columns added by migrations:** `add_issue_resolution_fields.sql` (acknowledged_at, resolved_at, resolved_by) and `add_issue_description_and_comments.sql` (description). Run these if missing.

---

### `issue_comments`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| issue_id | uuid | NO | FK → issue_reports(id) CASCADE |
| author_business_id | uuid | NO | FK → business_entities(id) |
| author_role | varchar(10) | NO | — |
| message | text | NO | — |
| created_at | bigint | NO | epoch ms |

---

### `notifications`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| recipient_business_id | uuid | NO | — |
| type | text | NO | — |
| related_entity_id | uuid | NO | — |
| connection_id | uuid | NO | — |
| message | text | NO | — |
| created_at | bigint | NO | epoch ms |
| read_at | bigint | YES | — |

✅ This table exists in the live DB.

---

### `order_attachments`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| order_id | uuid | NO | — |
| type | text | NO | — |
| uploaded_by | text | NO | — |
| file_url | text | YES | — |
| file_name | text | YES | — |
| file_type | text | YES | — |
| thumbnail_url | text | YES | — |
| note_text | text | YES | — |
| created_at | bigint | NO | epoch ms |

---

### `role_change_requests`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| connection_id | uuid | NO | — |
| requested_by_business_id | uuid | NO | — |
| status | varchar | NO | 'pending' |
| created_at | bigint | NO | epoch ms |
| resolved_at | bigint | YES | — |

---

### `otp_codes`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| phone_number | text | NO | — |
| otp_code | text | NO | — |
| expires_at | timestamptz | NO | — |
| created_at | timestamptz | YES | now() |

---

### `entity_flags`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| entity_id | uuid | NO | — |
| role_context | varchar | NO | — |
| flag_type | text | NO | — |
| note | text | YES | — |
| created_by | text | NO | — |
| created_at | bigint | NO | epoch ms |
| timestamp | bigint | YES | — |

---

### `frozen_entities`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| entity_id | uuid | NO | — |
| reason | text | YES | — |
| frozen_by | text | NO | — |
| frozen_at | bigint | NO | epoch ms |

---

### `business_members` ✅ LIVE
Join table linking users to businesses with a role. Supports multi-business per user in future (V2 enforces one).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| business_entity_id | uuid | NO | FK → business_entities(id) CASCADE |
| user_account_id | uuid | NO | FK → user_accounts(id) CASCADE |
| role | text | NO | 'member', CHECK ('admin','member') |
| invited_by | uuid | YES | FK → user_accounts(id) SET NULL |
| joined_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| status | text | YES | — (unused legacy column) |
| invited_at | timestamptz | YES | — (unused legacy column) |
| created_at | bigint | YES | — (unused legacy column) |

UNIQUE constraint on (business_entity_id, user_account_id).
Indexes: idx on business_entity_id, idx on user_account_id.
RLS: `read_own_business_members` (SELECT for same-business members), `admin_manage_members` (ALL for admins).
Trigger: `trg_business_members_updated_at` → `set_updated_at()`.

---

### `business_invites` ✅ LIVE
Tracks both link-based and direct email invites for team onboarding.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| business_entity_id | uuid | NO | FK → business_entities(id) CASCADE |
| invited_by | uuid | NO | FK → user_accounts(id) CASCADE |
| invite_type | text | NO | CHECK ('link','email') |
| invite_code | text | NO | UNIQUE |
| email | text | YES | NULL for link invites |
| role | text | NO | 'member', CHECK ('admin','member') |
| status | text | NO | 'pending', CHECK ('pending','accepted','expired','revoked') |
| expires_at | timestamptz | NO | now() + 7 days |
| accepted_by | uuid | YES | FK → user_accounts(id) SET NULL |
| accepted_at | timestamptz | YES | — |
| created_at | timestamptz | NO | now() |

Indexes: idx on invite_code, idx on business_entity_id, partial idx on email WHERE email IS NOT NULL.
RLS: `admin_manage_invites` (ALL for admins of the business), `read_invite_by_code` (SELECT for all authenticated).

---

### `business_subscriptions` ✅ LIVE
Subscription at business level. One subscription per business covers all team members.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| business_entity_id | uuid | NO | PK, FK → business_entities(id) CASCADE |
| plan | text | NO | 'free', CHECK ('free','pro') |
| status | text | NO | 'active', CHECK ('active','lapsed') |
| subscribed_at | timestamptz | YES | — |
| expires_at | timestamptz | YES | — |
| early_bird_used | boolean | NO | false |
| razorpay_order_id | text | YES | — |
| subscribed_by | uuid | YES | FK → user_accounts(id) SET NULL |
| updated_at | timestamptz | NO | now() |

RLS: `members_read_subscription` (SELECT for all business members), `admin_update_subscription` (UPDATE for admins).
Trigger: `trg_business_subscriptions_updated_at` → `set_updated_at()`.

> **Note:** `user_subscriptions` table is kept in DB during transition. Do not drop.

---

### `device_tokens`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| business_entity_id | uuid | NO | FK → business_entities(id) |
| token | text | NO | — |
| platform | text | YES | — |
| created_at | timestamptz | YES | now() |

---

## RPCs ✅ LIVE

### `promote_to_admin(target_user_account_id UUID)`
Promotes a Member to Admin. Caller must be Admin of the same business.

### `demote_to_member(target_user_account_id UUID)`
Demotes an Admin to Member. Blocks if target is the last Admin. Caller must be Admin of same business.

### `remove_team_member(target_user_account_id UUID)`
Removes a Member from the business. Target must be Member (not Admin — demote first). Caller must be Admin.

### `get_team_members()`
Returns array of `{ user_account_id, name, email, role, joined_at }` for caller's business. Ordered by role (admin first), then joined_at ASC. Uses `ua.username` for the name field.

---

## Edge Functions

### `create-invite` (POST)
Creates a business invite (link or email). Caller must be Admin. Generates a 12-char URL-safe invite code. Optionally sends email via Resend.

### `accept-invite` (POST)
Accepts a business invite by code. Validates expiry, email match (for email invites), and V2 one-business-per-user constraint. Adds caller to business_members.

### `generate-ledger` (POST)
Aggregates ledger data for a business. Returns structured JSON for client-side report generation.

### `send-push` (webhook-triggered)
Triggered by DB webhook on notifications table INSERT. Sends push via Firebase Cloud Messaging V1 API.

---

## 🔧 Fix SQL — Run This in Supabase SQL Editor

The `user_accounts` table is missing columns that the entire auth and login flow depends on.
Run this once to fix:

```sql
-- Add missing columns to user_accounts
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS business_entity_id UUID REFERENCES business_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS username VARCHAR(100),
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS phone VARCHAR(15);

-- Backfill username from email prefix for existing rows
UPDATE user_accounts
  SET username = SPLIT_PART(email, '@', 1)
  WHERE username IS NULL;

-- Create index for fast lookup by email
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON user_accounts(email);

-- Create index for fast lookup by business
CREATE INDEX IF NOT EXISTS idx_user_accounts_business ON user_accounts(business_entity_id);
```

---

## Migration State

| Migration File | Status |
|---------------|--------|
| migrate_user_accounts_to_email.sql | ✅ Applied (email column exists) |
| add_multi_user_fields.sql (business_entities part) | ✅ Applied (name_normalized, city, area, phone exist) |
| add_multi_user_fields.sql (user_accounts part) | ❌ NOT APPLIED (username, role, phone missing) |
| backfill_multi_user_fields.sql | ⚠️ Partial (business part done, user part blocked) |
| create_notifications_table.sql | ✅ Applied (notifications table exists) |
| **user_accounts missing columns fix** | ❌ NEEDS TO BE RUN (see Fix SQL above) |
