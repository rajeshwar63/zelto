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
