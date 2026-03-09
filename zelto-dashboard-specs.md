# Zelto Dashboard — Implementation Specs

**Version:** 1.0
**Date:** March 10, 2026
**For:** Coding Agent (Claude Code / Opus)

---

## Overview

Replace the current landing screen with a new **Dashboard** (Home) tab. The Dashboard becomes the first screen the user sees after login. The existing **Attention tab is removed** — its purpose is absorbed by the Dashboard.

### New Tab Bar (left to right)

| Position | Tab       | Icon    | Notes                          |
|----------|-----------|---------|--------------------------------|
| 1        | Home      | 🏠 home | NEW — Dashboard landing screen |
| 2        | Orders    | 📋 list | Existing — no changes          |
| 3        | Connections | 🤝 people | Existing — no changes       |
| 4        | Profile   | 👤 user | Existing — no changes          |

**Removed:** Attention tab (fully replaced by Dashboard)

### Notification Badge Behavior

- **Only the Home tab** gets a notification badge (red dot or count)
- Orders and Connections tabs: **no badges ever**
- Push notification taps: deep link to the specific order/item detail screen, not a tab

---

## Dashboard Screen Layout

The Dashboard has three sections that scroll vertically. The header is fixed at the top.

### Header (Fixed)

```
┌─────────────────────────────────┐
│ Welcome back                    │
│ [Business Name]           [Avatar] │
└─────────────────────────────────┘
```

- "Welcome back" — static subtitle (13px, grey)
- Business Name — from user's business entity (22px, bold, dark)
- Avatar — business initials in colored circle, taps to Profile tab
- Pull-to-refresh triggers data reload for all three sections

---

### Section 1: Business Pulse

**Purpose:** Financial + activity snapshot. Shows totals, NOT actionable items.

```
┌──────────────┐  ┌──────────────┐
│  To Pay       │  │  To Receive  │
│  ₹1,24,500   │  │  ₹2,87,300   │
└──────────────┘  └──────────────┘
┌──────────────┐  ┌──────────────┐
│ Orders Today │  │   Overdue    │
│     12       │  │  ₹45,000     │
└──────────────┘  └──────────────┘
```

**Layout:** 2×2 grid of cards

| Card           | Data Source                                                              | Display Format |
|----------------|--------------------------------------------------------------------------|----------------|
| To Pay         | SUM of `total_amount` from orders WHERE current user is buyer AND payment_status = 'pending' or 'partial' | ₹ amount       |
| To Receive     | SUM of `total_amount` from orders WHERE current user is seller AND payment_status = 'pending' or 'partial' | ₹ amount       |
| Orders Today   | COUNT of orders WHERE `created_at` is today (user's timezone)            | Integer        |
| Overdue        | SUM of `total_amount` from orders WHERE `payment_due_date` < today AND payment_status != 'paid' | ₹ amount       |

**Card behavior:**
- Each card is tappable → navigates to a filtered view in Orders tab
- To Pay → Orders filtered to: buyer role, payment pending
- To Receive → Orders filtered to: seller role, payment pending
- Orders Today → Orders filtered to: created today
- Overdue → Orders filtered to: overdue payments

**Styling:**
- White card background with subtle colored border/icon
- Each card has a distinct color: To Pay (red), To Receive (green), Orders Today (blue), Overdue (orange)
- Small icon in top-right corner of each card
- Amount in large bold text (20px)
- Label in small grey text (12px)

---

### Section 2: Needs Attention

**Purpose:** Actionable items that require the user's response. Each row shows an unread/pending count.

```
┌─────────────────────────────────────┐
│ NEEDS ATTENTION              12 items│
├─────────────────────────────────────┤
│ 🆕 New Orders / Approval        (4)│
│ 🚚 Dispatched                   (3)│
│ ✅ Delivered                     (2)│
│ ⚡ Issues Raised                 (1)│
│ ⚖️ Disputes                     (0)│
│ 💳 Payment Verification         (2)│
└─────────────────────────────────────┘
```

**Layout:** Single white card with list rows. Section header shows total count badge.

| Row                    | Count Logic                                                                                     | Tap Action                            |
|------------------------|-------------------------------------------------------------------------------------------------|---------------------------------------|
| New Orders / Approval  | Orders WHERE user is seller AND status = 'new' or 'pending_approval' AND not yet viewed/acted on | Navigate to filtered order list        |
| Dispatched             | Orders WHERE status = 'dispatched' AND user hasn't acknowledged                                 | Navigate to filtered order list        |
| Delivered              | Orders WHERE status = 'delivered' AND user hasn't confirmed delivery                            | Navigate to filtered order list        |
| Issues Raised          | Orders WHERE has open issue AND user is the respondent                                          | Navigate to filtered order list        |
| Disputes               | Orders WHERE has open dispute AND user is a party                                               | Navigate to filtered order list        |
| Payment Verification   | Payments WHERE other party marked as paid AND user hasn't confirmed receipt                     | Navigate to filtered order list        |

**Row behavior:**
- Rows with count = 0 are greyed out (opacity 0.4) but still visible
- Count badge uses the row's accent color
- Each row has a chevron (›) indicating it's tappable
- Tapping navigates to the Orders tab with the appropriate filter pre-applied

**"Unread" tracking:**
- This requires a `dashboard_read_status` or similar tracking mechanism
- Option A: Track per-order `last_viewed_at` timestamp per user — count items where `updated_at > last_viewed_at`
- Option B: Simpler — count items in each status that haven't been explicitly acted on (e.g., new order not yet accepted/rejected)
- **Recommended: Option B** — aligns with actual workflow states, no extra tracking table needed

---

### Section 3: Recent Activity

**Purpose:** Scrollable feed of all orders, reusing the existing order card component from the Orders tab "All" section.

```
┌─────────────────────────────────────┐
│ RECENT ACTIVITY                     │
├─────────────────────────────────────┤
│ ┃ Sharma Textiles          ₹32,500 │
│ ┃ New Order · ORD-1247    10m ago  │
│ ┃ Cotton Fabric × 500m             │
├─────────────────────────────────────┤
│ ┃ Gupta Traders            ₹18,200 │
│ ┃ Dispatched · ORD-1245     1h ago │
│ ┃ Silk Thread × 200 rolls          │
├─────────────────────────────────────┤
│   Patel & Sons             ₹56,800 │
│   Delivered · ORD-1243     3h ago  │
│   Polyester Blend × 1000m          │
└─────────────────────────────────────┘
         ... scrolls to load more ...
```

**Implementation:**
- **Reuse the existing OrderCard component** from the Orders tab
- Data source: Same query as Orders tab "All" section, sorted by `updated_at DESC`
- Pagination: Load 10 at a time, infinite scroll for more
- New/unread orders get a left color border + blue dot indicator
- Each card taps into the order detail screen

**Visual enhancement for dashboard context:**
- Add a colored left border matching the order's status color
- Add a small blue dot next to business name for unread items
- No other changes to the existing card layout

---

## Data Fetching Strategy

### On Dashboard Load (Initial)

Fetch all three sections in parallel:

```
Promise.all([
  fetchBusinessPulse(),      // Aggregation queries for Section 1
  fetchNeedsAttention(),     // Count queries for Section 2
  fetchRecentActivity(0, 10) // Paginated order list for Section 3
])
```

### Refresh Triggers

- **Pull-to-refresh:** Refetch all three sections
- **Push notification received:** Refetch Needs Attention counts + prepend to Recent Activity
- **Returning to Dashboard tab:** Refetch if last fetch was > 30 seconds ago
- **After any order action** (accept, reject, confirm delivery, etc.): Refetch Needs Attention counts

### Supabase Queries (Pseudocode)

**Business Pulse — To Pay:**
```sql
SELECT COALESCE(SUM(total_amount), 0) as total
FROM orders
WHERE buyer_entity_id = get_my_business_entity_id()
  AND payment_status IN ('pending', 'partial');
```

**Business Pulse — To Receive:**
```sql
SELECT COALESCE(SUM(total_amount), 0) as total
FROM orders
WHERE seller_entity_id = get_my_business_entity_id()
  AND payment_status IN ('pending', 'partial');
```

**Business Pulse — Orders Today:**
```sql
SELECT COUNT(*) as total
FROM orders
WHERE (buyer_entity_id = get_my_business_entity_id()
   OR seller_entity_id = get_my_business_entity_id())
  AND created_at >= CURRENT_DATE;
```

**Business Pulse — Overdue:**
```sql
SELECT COALESCE(SUM(total_amount), 0) as total
FROM orders
WHERE (buyer_entity_id = get_my_business_entity_id()
   OR seller_entity_id = get_my_business_entity_id())
  AND payment_due_date < CURRENT_DATE
  AND payment_status NOT IN ('paid', 'cancelled');
```

**Needs Attention — counts per category:**
Each count query filters by the user's business entity and the relevant status/condition. These should be individual RPC calls or a single aggregate RPC function that returns all counts at once for efficiency:

```sql
-- Example: single RPC function
CREATE OR REPLACE FUNCTION get_dashboard_attention_counts()
RETURNS JSON AS $$
  SELECT json_build_object(
    'new_orders', (SELECT COUNT(*) FROM orders WHERE seller_entity_id = get_my_business_entity_id() AND status = 'new'),
    'dispatched', (SELECT COUNT(*) FROM orders WHERE buyer_entity_id = get_my_business_entity_id() AND status = 'dispatched'),
    'delivered', (SELECT COUNT(*) FROM orders WHERE ... AND status = 'delivered'),
    'issues', (SELECT COUNT(*) FROM orders WHERE ... AND has_open_issue = true),
    'disputes', (SELECT COUNT(*) FROM orders WHERE ... AND has_open_dispute = true),
    'payment_verification', (SELECT COUNT(*) FROM payments WHERE ... AND needs_verification = true)
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

> **Note:** Adjust column names and conditions to match the actual Zelto schema. Check `SCHEMA.md` at the repo root for exact table/column names before implementing.

---

## Navigation Flow

```
Dashboard
├── Business Pulse card tap → Orders tab (with filter params)
├── Needs Attention row tap → Orders tab (with filter params)
├── Recent Activity card tap → Order Detail screen
└── Avatar tap → Profile tab

Push Notification tap → Order Detail screen (deep link)
```

### Filter Parameter Passing

When navigating from Dashboard to Orders tab, pass filter parameters via:
- React Router search params, OR
- Shared state (context/store)

Example: Tapping "Dispatched (3)" in Needs Attention → navigates to Orders tab with `?status=dispatched&role=buyer` pre-applied.

---

## File Changes Required

| File / Area                  | Change                                                        |
|------------------------------|---------------------------------------------------------------|
| `src/screens/DashboardScreen.tsx` | **NEW** — Main dashboard component                      |
| `src/components/BusinessPulseCard.tsx` | **NEW** — Reusable pulse metric card              |
| `src/components/NeedsAttentionList.tsx` | **NEW** — Attention items list component          |
| Tab bar / navigation config  | Replace Attention tab with Dashboard (Home) tab               |
| `src/screens/AttentionScreen.tsx` | **REMOVE** or deprecate                                  |
| Order card component         | **MODIFY** — Add optional left border + unread dot props      |
| Supabase functions           | **NEW** — `get_dashboard_pulse()` and `get_dashboard_attention_counts()` RPC functions |
| Push notification handler    | **MODIFY** — Deep link to order detail, trigger dashboard refresh |

---

## Styling Guidelines

- **Mobile-first:** 375px reference width, fluid scaling
- **Card radius:** 14px (consistent with existing Zelto UI)
- **Section headers:** 13px, uppercase, grey (#8492A6), letter-spacing 0.08em
- **Amounts:** 20px bold, color-coded per card type
- **Labels:** 12px medium weight, grey
- **Section background:** Light grey (#F2F4F8) between cards
- **Card background:** White (#FFFFFF)
- **Font:** Use existing Zelto app font stack
- **Accent colors:**
  - Red (#FF6B6B) — To Pay, overdue
  - Green (#22B573) — To Receive, delivered
  - Blue (#4A6CF7) — Orders Today, new orders
  - Orange (#FF8C42) — Dispatched, overdue
  - Yellow (#FFB020) — Issues
  - Purple (#8B5CF6) — Disputes
  - Pink (#EC4899) — Payment verification

---

## Edge Cases

- **No orders yet:** Show all Business Pulse cards as ₹0 / 0. Show Needs Attention with all counts at 0 (greyed out). Recent Activity shows empty state: "No orders yet. Create your first order to get started."
- **No connections:** If user has no connections, Dashboard still loads but Recent Activity will be empty.
- **Slow network:** Show skeleton loading placeholders for each section independently. Sections render as data arrives (don't wait for all).
- **Error fetching:** Show a retry button per section, not a full-screen error.
- **Large amounts:** Ensure ₹ formatting handles lakhs/crores (Indian number system) — e.g., ₹12,45,000 not ₹1,245,000.

---

## Future Slots (Do NOT build now)

These are reserved areas on the Dashboard for future features. Just note them for layout planning:

- **Trust / Credibility Score card** — between Business Pulse and Needs Attention
- **Profile completeness nudge** — below header or as a dismissible banner
- **Announcements / Tips** — bottom of dashboard, above Recent Activity
- **Quick Actions** (Create Order, Add Connection) — floating action button or header actions
