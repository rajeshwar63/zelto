# SQL Migrations

Run these scripts **in order** using the Supabase SQL Editor.

## How to run

1. Open your Supabase project dashboard
2. Go to **SQL Editor** (left sidebar)
3. Click **New query**
4. Paste the contents of each script (in order) and click **Run**

## Migration order

| # | File | Description |
|---|------|-------------|
| 1 | `add_multi_user_fields.sql` | Schema changes — adds `username`, `phone`, `role` to `user_accounts`; adds `name_normalized`, `city`, `area`, `phone` to `business_entities`; creates trigram index and fuzzy search function |
| 2 | `backfill_multi_user_fields.sql` | Data backfill — sets `username` from email prefix, `role` to `'owner'` for existing users, and `name_normalized` from `business_name` for existing businesses |

## Notes

- Each backfill statement is idempotent (safe to re-run).
- `city`, `area`, and `phone` on `business_entities` are left as `NULL` — users can fill these in later through the UI.
