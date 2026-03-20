# Zelto — Supabase Deployment State

> **For AI agents:** This tracks what's actually deployed in the live Supabase project.
> Cross-reference with SCHEMA.md for table schemas.

---

## Tables

| Table | Status | Notes |
|-------|--------|-------|
| admin_accounts | ✅ Live | Admin login |
| business_entities | ✅ Live | Core business profiles |
| user_accounts | ✅ Live | User profiles (see SCHEMA.md for missing columns issue) |
| connection_requests | ✅ Live | B2B connection handshake |
| connections | ✅ Live | Established B2B relationships |
| orders | ✅ Live | Order lifecycle |
| payment_events | ✅ Live | Payment records |
| issue_reports | ✅ Live | Quality/operational issues |
| issue_comments | ✅ Live | Comments on issues |
| notifications | ✅ Live | Event notifications (triggers send-push webhook) |
| order_attachments | ✅ Live | File uploads for orders |
| role_change_requests | ✅ Live | Buyer/supplier role swap requests |
| connection_blocks | ✅ Live | Business blocking |
| entity_flags | ✅ Live | Admin trust flags |
| frozen_entities | ✅ Live | Suspended businesses |
| otp_codes | ✅ Live | Email OTP verification |
| device_tokens | ✅ Live | FCM device tokens for push |
| business_documents | ✅ Live | KYC/compliance documents |
| business_members | ✅ Live | Multi-user team join table (Step 1) |
| business_invites | ✅ Live | Team invite tracking (Step 2) |
| business_subscriptions | ✅ Live | Business-level subscriptions (Step 3) |
| user_subscriptions | ✅ Live | Legacy — kept during transition, do NOT drop |

---

## RPCs

| RPC | Status | Notes |
|-----|--------|-------|
| promote_to_admin | ✅ Live | Step 5 — promotes Member → Admin |
| demote_to_member | ✅ Live | Step 5 — demotes Admin → Member (blocks last admin) |
| remove_team_member | ✅ Live | Step 5 — removes Member from business |
| get_team_members | ✅ Live | Step 5 — returns team list, uses `ua.username` for name |

---

## Edge Functions

| Function | Status | Notes |
|----------|--------|-------|
| generate-ledger | ✅ Deployed | Ledger aggregation endpoint |
| send-push | ✅ Deployed | FCM push via DB webhook trigger |
| create-invite | 🔨 Built | Step 6 — awaiting deployment |
| accept-invite | 🔨 Built | Step 6 — awaiting deployment |

---

## Backfills Completed

- ✅ All existing users inserted into `business_members` as Admin (7 users)
- ✅ Subscription data migrated from `user_subscriptions` → `business_subscriptions`
- ✅ Free subscription rows backfilled for businesses without one

---

## Multi-User Implementation Progress (Spec Section 9)

| Step | Description | Status |
|------|-------------|--------|
| 1 | DB: business_members table + RLS + backfill | ✅ Done |
| 2 | DB: business_invites table + RLS | ✅ Done |
| 3 | DB: business_subscriptions table + migration | ✅ Done |
| 4 | DB: Backfill existing users as Admin | ✅ Done |
| 5 | Backend: RPCs (promote, demote, remove, get_team) | ✅ Done |
| 6 | Backend: Edge Functions (create-invite, accept-invite) | ✅ Built |
| 7 | Frontend: useTeamRole hook + TeamRoleContext | ⬜ Pending |
| 8 | Frontend: Update useSubscription → business_subscriptions | ⬜ Pending |
| 9 | Frontend: PermissionGate component | ⬜ Pending |
| 10 | Frontend: TeamScreen (Admin + Member views) | ⬜ Pending |
| 11 | Frontend: InviteScreen | ⬜ Pending |
| 12 | Frontend: Join flow (/join/{code}) | ⬜ Pending |
| 13 | Backend: Update Razorpay Edge Functions | ⬜ Pending |
| 14 | Push notifications for team events | ⬜ Pending |
| 15 | QA: Full flow testing | ⬜ Pending |
