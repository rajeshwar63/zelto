# Zelto — Troubleshooting & Supabase Setup

This document covers common Supabase RLS / schema issues that can arise in a
fresh deployment, along with the SQL snippets you need to run in the Supabase
SQL Editor to fix them.

---

## 1. Admin panel logs out on page refresh

**Symptom:** Navigating to `/admin` or refreshing the page while logged in
redirects you back to the login screen.

**Cause:** Previously the admin session was kept only in React state, which is
lost on a full page reload.

**Fix (already applied in code):** The admin session is now persisted in
`localStorage` under the key `zelto:admin-session` with a 24-hour TTL.  
The session is cleared automatically on logout or expiry.

---

## 2. Admin sections show no data / silent failures

**Symptom:** The Entities, Connections, Flags, or System tabs in the Admin panel
appear empty even though data exists in the database, with no error message.

**Cause:** Supabase RLS policies may block admin reads if the admin panel is
running under the anon/authenticated role without a matching policy.

**Fix (already applied in code):** All four admin sections now wrap their data
loading in `try/catch`, surface errors via `toast.error`, and display an inline
red banner with the error message.

**Database fix (run once):**  
Ensure your `admin_accounts`, `business_entities`, `connections`, `orders`,
`issue_reports`, and `entity_flags` tables have permissive RLS policies for the
service role, or temporarily disable RLS on tables that the admin panel reads
directly (admin reads are server-authenticated, not user-authenticated):

```sql
-- Example: allow service_role full access to admin_accounts
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to admin_accounts"
  ON admin_accounts
  TO service_role
  USING (true)
  WITH CHECK (true);
```

---

## 3. "Failed to accept request" even when connection was created

**Symptom:** The connection-acceptance flow shows an error toast, but the
connection actually appears in the database.

**Cause:** After creating the connection, the app tried to insert a row into
`notifications`. The INSERT failed due to an RLS policy that blocks authenticated
users from inserting notifications for other businesses.

**Fix (already applied in code):** The notification creation step is now wrapped
in its own `try/catch`. If it fails, the acceptance still succeeds and the user
is navigated to the connections screen. A non-blocking warning message is shown
instead of a full error.

**Database fix:** Run the SQL in `sql/fix_notifications_rls_and_payment_terms.sql`
to add the correct INSERT policy:

```sql
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

---

## 4. Badge visibility (Basic/Verified/Trusted)

**Symptom:** Only "Verified" (blue ✓) and "Trusted" (green ✓) badges appear in
the Add Connection screen and in connection request cards. The "Basic" level was
never shown.

**Fix (already applied in code):** Both `AddConnectionScreen` and
`ConnectionRequestItem` now use the shared `CredibilityBadge` component, which
renders pill badges for all three levels (Basic / Verified / Trusted).

---

## 5. NULL payment_terms causes a database constraint error

**Symptom:** Accepting a connection request where the current user is the
**Supplier** fails with:

```
null value in column "payment_terms" violates not-null constraint
```

**Cause:** When the acceptor is a Supplier, payment terms are intentionally left
`null` until the buyer sets them. The `connections` table has a NOT NULL
constraint that prevents this.

**Database fix:** Run the following SQL in the Supabase SQL Editor:

```sql
ALTER TABLE connections
  ALTER COLUMN payment_terms DROP NOT NULL;
```

This is also included in `sql/fix_notifications_rls_and_payment_terms.sql`.

---

## 6. Running all SQL fixes

All schema and RLS fixes are bundled in:

```
sql/fix_notifications_rls_and_payment_terms.sql
```

1. Open your Supabase project dashboard.
2. Go to **SQL Editor** → **New query**.
3. Paste the contents of the file and click **Run**.

> Re-running the script is safe because all `DROP POLICY IF EXISTS` and
> `ALTER TABLE … DROP NOT NULL` statements are idempotent.

---

## Required Supabase RLS Policies Summary

| Table | Operation | Policy |
|-------|-----------|--------|
| `notifications` | INSERT | Authenticated users can insert (any recipient) |
| `notifications` | SELECT | Recipient's own business entity only |
| `notifications` | UPDATE | Recipient's own business entity only |
| `connections` | `payment_terms` | Column allows NULL values |

### `get_my_business_entity_id()` helper function

The SELECT and UPDATE policies on `notifications` rely on a database function
that resolves the current user's business entity:

```sql
CREATE OR REPLACE FUNCTION get_my_business_entity_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT business_entity_id FROM user_accounts
  WHERE  id = auth.uid() LIMIT 1;
$$;
```

This function is also included in the bundled SQL file.
