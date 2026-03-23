# Zelto — Trust Score V2 & Insights Tab Spec

> **For Claude Opus / Claude Code agent handoff.**
> This spec replaces the current credibility scoring system (`src/lib/credibility.ts`) with a three-pillar trust score, adds an Insights tab to the Trust Profile, and updates the badge info sheet.

---

## 1. Overview

### Problem

The current trust score is a profile-completeness checker. A business scores 95/100 by filling in profile fields and placing 10 orders — even if they never pay on time. The score carries no behavioural signal and provides no trust value to other businesses evaluating a connection.

### Solution

Replace the single credibility score with a **three-pillar trust score** that incorporates actual trade behaviour:

| Pillar | Max Points | What it measures |
|--------|-----------|------------------|
| Identity & compliance | 30 | Profile completeness + document health |
| Activity & tenure | 20 | Network size, order volume, platform tenure |
| Trade record | 50 | Payment behaviour, operational reliability, dispute rate — aggregated across ALL connections |

Total: **100 points**

### Key design decisions

1. **Role-agnostic**: All insights and scoring describe the business neutrally — no buyer/supplier framing. Every Zelto user is both.
2. **No specific document requirements**: Document scoring counts valid/expired documents generically. Industry-specific requirements (e.g., FSSAI for food businesses) are deferred to a future version.
3. **Collective insights are business-level**: The existing Behaviour Engine and Insight Engine work per-connection. This spec adds an aggregation layer that computes signals across ALL connections for a business.
4. **Privacy-safe**: The Insights tab shows collective insights on the Trust Profile. For MVP, this is visible to the business itself and to connected businesses. Non-connected businesses see the trust score number and badge only — not the pillar breakdown or insights. (This can be expanded later.)

---

## 2. Pillar 1: Identity & Compliance (max 30 pts)

### Data sources

- `business_entities` table (profile fields)
- `business_documents` table (uploaded documents + expiry dates)

### Scoring rules

**Profile completeness (max 15 pts):**

| Field | Points | Source |
|-------|--------|--------|
| Business name | 2 | Always present |
| Phone number | 2 | `business_entities.phone` |
| GST number | 3 | `business_entities.gst_number` |
| Business address OR formatted address | 2 | `business_entities.business_address` or `formatted_address` |
| Map location (lat/lng present) | 2 | `business_entities.latitude` + `longitude` |
| Business type | 2 | `business_entities.business_type` |
| Website | 1 | `business_entities.website` |
| Business description | 1 | `business_entities.description` (non-empty) |

**Document health (max 15 pts):**

| Signal | Points | Logic |
|--------|--------|-------|
| At least 1 document uploaded | 5 | `COUNT(*) FROM business_documents WHERE business_id = ?` >= 1 |
| At least 3 documents uploaded | 3 | Count >= 3 |
| All documents with expiry dates are valid (not expired) | 5 | No rows where `expiry_date < CURRENT_DATE` |
| No documents expiring within 30 days | 2 | No rows where `expiry_date` between today and today+30 |

### Tags to display

Generate an array of `{ label: string, sentiment: 'positive' | 'warning' | 'neutral' }`:

- Profile score >= 13: `{ label: 'Profile complete', sentiment: 'positive' }`
- Profile score >= 8 and < 13: `{ label: 'Profile mostly complete', sentiment: 'neutral' }`
- Profile score < 8: `{ label: 'Profile incomplete', sentiment: 'warning' }`
- Valid doc count > 0: `{ label: '${count} documents valid', sentiment: 'positive' }`
- Expiring doc count > 0: `{ label: '${count} expiring soon', sentiment: 'warning' }`
- Expired doc count > 0: `{ label: '${count} expired', sentiment: 'warning' }`
- Zero documents: `{ label: 'No documents uploaded', sentiment: 'warning' }`

---

## 3. Pillar 2: Activity & Tenure (max 20 pts)

### Data sources

- `connections` table (connection count)
- `orders` table (order count, recent activity)
- `business_entities.created_at` (tenure)

### Scoring rules

**Connections (max 7 pts):**

| Signal | Points |
|--------|--------|
| 1+ connections | 3 |
| 3+ connections | 2 (additional) |
| 5+ connections | 2 (additional) |

**Orders (max 5 pts):**

| Signal | Points |
|--------|--------|
| 1+ orders | 2 |
| 10+ orders | 3 (additional) |

**Recency (max 5 pts):**

| Signal | Points | Logic |
|--------|--------|-------|
| Active in last 7 days | 3 | Any order with `created_at` within last 7 days |
| Active in last 30 days | 2 | Any order with `created_at` within last 30 days (if not already awarded 7-day points, award 2 pts; if 7-day awarded, award 2 pts additional) |

Note: A business active in last 7 days gets 3 + 2 = 5 pts total. A business active only in last 30 days (not last 7) gets 2 pts.

**Tenure (max 3 pts):**

| Signal | Points | Logic |
|--------|--------|-------|
| Member for 1+ months | 1 | `business_entities.created_at` is > 30 days ago |
| Member for 3+ months | 1 (additional) | > 90 days ago |
| Member for 6+ months | 1 (additional) | > 180 days ago |

### Tags to display

- `{ label: '${n} connections', sentiment: 'neutral' }`
- `{ label: '${n} orders', sentiment: 'neutral' }`
- Active in last 7 days: `{ label: 'Active this week', sentiment: 'positive' }`
- Active in last 30 days (but not 7): `{ label: 'Active this month', sentiment: 'neutral' }`
- Not active in 30 days: `{ label: 'Inactive', sentiment: 'warning' }`
- Tenure tag: `{ label: 'Member since ${month} ${year}', sentiment: 'neutral' }`

---

## 4. Pillar 3: Trade Record (max 50 pts)

### Critical: Aggregation layer needed

The existing `BehaviourEngine` computes signals per connection. This pillar requires a **new aggregation function** that:

1. Gets all connections for the business: `dataStore.getConnectionsByBusinessId(businessId)`
2. For each connection, calls `behaviourEngine.computeAllSignals(connectionId)`
3. Sums/averages signals across all connections
4. Computes the pillar score from aggregated signals

### New function: `aggregateBusinessBehaviourSignals(businessId)`

```typescript
interface AggregatedBehaviourSignals {
  // Settlement (summed across all connections, medium window)
  total_on_time_payments: number
  total_late_payments: number
  total_overdue: number
  total_partial_payments: number
  on_time_rate: number | null  // percentage, null if no completed payments

  // Settlement trend (compare short vs medium)
  short_window_late_count: number
  medium_window_late_count: number
  trend: 'improving' | 'worsening' | 'stable' | 'insufficient_data'

  // Operational (weighted average across connections by order count)
  weighted_avg_acceptance_delay: number | null  // hours
  weighted_avg_dispatch_delay: number | null     // hours
  avg_delivery_consistency: number | null        // percentage

  // Quality (summed across all connections)
  total_open_issues: number
  total_issues_30_days: number
  has_recurring_issues: boolean

  // Metadata
  connections_evaluated: number
  total_orders_evaluated: number
}
```

**Aggregation logic:**

```
For each connection:
  signals = behaviourEngine.computeAllSignals(connectionId)
  orders = dataStore.getOrdersByConnectionId(connectionId)
  orderCount = orders.length

  // Sum settlement counts
  total_on_time_payments += signals.settlement.medium.on_time_payment_count
  total_late_payments += signals.settlement.medium.late_payment_count
  total_overdue += signals.settlement.medium.overdue_count
  total_partial_payments += signals.settlement.medium.partial_payment_count

  // Sum short window for trend
  short_window_late_count += signals.settlement.short.late_payment_count
  medium_window_late_count += signals.settlement.medium.late_payment_count

  // Weighted operational (weight by order count)
  if signals.operational.avg_acceptance_delay != null:
    acceptance_delay_sum += signals.operational.avg_acceptance_delay * orderCount
    acceptance_delay_weight += orderCount
  // Same pattern for dispatch delay and delivery consistency

  // Sum quality
  total_open_issues += signals.quality.total_open_issues
  total_issues_30_days += signals.quality.total_issues_30_days
  // Union recurring issue types across connections
  if signals.quality.recurring_issue_types.length > 0:
    has_recurring_issues = true

// Compute derived values
completed_payments = total_on_time_payments + total_late_payments
on_time_rate = completed_payments > 0 ? (total_on_time_payments / completed_payments) * 100 : null

weighted_avg_acceptance_delay = acceptance_delay_weight > 0 ? acceptance_delay_sum / acceptance_delay_weight : null
// Same for dispatch

// Trend: compare short vs medium late counts
if medium_window_late_count == 0 and short_window_late_count == 0:
  trend = 'stable'
else if short_window_late_count < medium_window_late_count * 0.3:
  trend = 'improving'
else if short_window_late_count > medium_window_late_count * 0.7:
  trend = 'worsening'
else:
  trend = 'stable'
```

### Scoring rules

**Payment behaviour (max 20 pts):**

| Signal | Points | Logic |
|--------|--------|-------|
| On-time rate >= 90% | 15 | `on_time_rate >= 90` |
| On-time rate >= 70% | 10 | `on_time_rate >= 70 && < 90` |
| On-time rate >= 50% | 5 | `on_time_rate >= 50 && < 70` |
| On-time rate < 50% | 0 | — |
| Zero current overdue | 5 | `total_overdue === 0` |
| 1 overdue | 2 | `total_overdue === 1` |
| 2+ overdue | 0 | — |

Note: These are mutually exclusive tiers (take the highest qualifying). Overdue bonus is additive.

**Operational reliability (max 15 pts):**

| Signal | Points | Logic |
|--------|--------|-------|
| Avg order processing < 12 hours | 8 | `weighted_avg_acceptance_delay < 12` |
| Avg order processing < 24 hours | 5 | `weighted_avg_acceptance_delay < 24` |
| Avg order processing < 48 hours | 2 | `weighted_avg_acceptance_delay < 48` |
| Avg dispatch < 24 hours | 4 | `weighted_avg_dispatch_delay < 24` |
| Avg dispatch < 48 hours | 2 | `weighted_avg_dispatch_delay < 48` |
| Delivery consistency >= 90% | 3 | `avg_delivery_consistency >= 90` |
| Delivery consistency >= 70% | 1 | `avg_delivery_consistency >= 70` |

Note: For order processing and dispatch, take highest qualifying tier only. Delivery consistency is additive.

**Quality (max 10 pts):**

| Signal | Points | Logic |
|--------|--------|-------|
| Zero open issues | 5 | `total_open_issues === 0` |
| 1 open issue | 2 | — |
| 2+ open issues | 0 | — |
| Low issue rate (0-1 issues in 30 days) | 3 | `total_issues_30_days <= 1` |
| No recurring issues | 2 | `has_recurring_issues === false` |

**Trend bonus (max 5 pts):**

| Signal | Points | Logic |
|--------|--------|-------|
| Trend improving | 5 | `trend === 'improving'` |
| Trend stable with good record (on_time_rate >= 70%) | 3 | `trend === 'stable' && on_time_rate >= 70` |
| Trend stable | 1 | `trend === 'stable'` |
| Trend worsening | 0 | — |

### Tags to display

- `on_time_rate >= 80`: `{ label: 'Mostly on-time payments', sentiment: 'positive' }`
- `on_time_rate >= 50 && < 80`: `{ label: 'Mixed payment timing', sentiment: 'warning' }`
- `on_time_rate < 50`: `{ label: 'Frequent late payments', sentiment: 'warning' }`
- `total_overdue >= 1`: `{ label: '${n} payments overdue', sentiment: 'warning' }`
- `total_overdue === 0 && completed_payments >= 3`: `{ label: 'No overdue payments', sentiment: 'positive' }`
- `weighted_avg_acceptance_delay < 24`: `{ label: 'Fast order processing', sentiment: 'positive' }`
- `weighted_avg_acceptance_delay > 48`: `{ label: 'Slow order processing', sentiment: 'warning' }`
- `total_open_issues === 0 && total_issues_30_days === 0`: `{ label: 'No disputes recently', sentiment: 'positive' }`
- `total_open_issues >= 1`: `{ label: '${n} open disputes', sentiment: 'warning' }`
- `trend === 'improving'`: `{ label: 'Improving trend', sentiment: 'positive' }`
- `trend === 'worsening'`: `{ label: 'Declining trend', sentiment: 'warning' }`

### Minimum data threshold

If a business has **fewer than 3 completed orders** across all connections, the Trade Record pillar shows "Insufficient trade history" instead of a score, and contributes **0 points** to the total. This prevents a business with 1 on-time payment from scoring 50/50.

When insufficient data:
- Pillar score displays as `—/50`
- Tag: `{ label: 'Insufficient trade history', sentiment: 'neutral' }`
- Total trust score is calculated from Pillar 1 + Pillar 2 only, but **max is still 100** — so the effective max is 50 until they have enough trade history

---

## 5. Badge Levels (Updated Thresholds)

| Level | Score Range | Label | Description |
|-------|-----------|-------|-------------|
| New | 0–19 | New | Just joined, no meaningful activity |
| Basic | 20–44 | Basic | Profile set up, starting to trade |
| Verified | 45–69 | Verified | Active with some trade history |
| Trusted | 70–100 | Trusted | Strong behaviour across connections |

No changes to badge label names or visual treatment. The `TrustBadge` component and its color config remain the same.

Update `scoreToLevel()` in `credibility.ts`:

```typescript
export function scoreToLevel(score: number): CredibilityBreakdown['level'] {
  if (score >= 70) return 'trusted'
  if (score >= 45) return 'verified'
  if (score >= 20) return 'basic'
  return 'none'
}
```

---

## 6. Badge Info Sheet (Updated)

The existing `BadgeInfoSheet` component is updated to show the three-pillar breakdown.

### Layout (top to bottom)

1. **Title**: "Your trust badge"
2. **Subtitle**: "Your badge reflects how complete, active, and reliable your business is on Zelto."
3. **Badge tier list** (same as current, with updated thresholds and "You are here" highlight)
4. **Divider**
5. **Section header**: "YOUR SCORE BREAKDOWN"
6. **Three pillar bars**: Each shows pillar name, score/max, and a progress bar
   - Bar color: use the pillar's primary color (blue for Identity, green for Activity, amber/green for Trade Record depending on score %)
   - Bar color logic: score >= 70% of max → green (#22B573), score >= 40% → amber (#EF9F27), score < 40% → red (#E24B4A)
7. **Nudge card**: Amber background, identifies the weakest pillar by name, gives specific actionable advice
8. **Total score**: Large number display with /100

### Nudge logic

Find the pillar with the lowest percentage score (score / max). Generate nudge text:

- Weakest is Identity: "Complete your profile and upload compliance documents to improve your score."
- Weakest is Activity: "Build more connections and stay active on the platform."
- Weakest is Trade Record: "Clear overdue payments and maintain on-time settlement to reach the next level."
- If Trade Record has insufficient data: "Build trade history by completing more orders with your connections."

---

## 7. Insights Tab on Trust Profile

### Tab addition

Add "Insights" as the third tab in the Trust Profile tab strip: `Identity | Docs | Insights`

Update the tab type: `('identity' | 'docs' | 'insights')`

### Insights tab layout (top to bottom)

1. **Trust score breakdown card**
   - Section header: "TRUST SCORE BREAKDOWN"
   - White card with three pillar rows, each containing:
     - Icon (24x24 rounded square) + pillar name + score/max (right-aligned)
     - Progress bar (6px height, colored by pillar)
     - Tags row (wrapped flex, gap 6px)
   - Pillars separated by 1px dividers (#F2F4F8)

2. **Collective insights section**
   - Section header: "COLLECTIVE INSIGHTS"
   - White card with insight rows, each containing:
     - Colored dot (6px circle): green for positive, amber for warning
     - Insight text (13px, 500 weight)
     - Category + timeframe label (11px, #8492A6)
   - Separated by 1px dividers

3. **Tenure card**
   - Single white card: calendar icon + "On Zelto since {month} {year}" + "Building trust for {duration}"

### Collective insights generation

Create a new function: `generateBusinessInsights(businessId: string): Promise<BusinessInsight[]>`

```typescript
interface BusinessInsight {
  text: string
  category: 'settlement' | 'operational' | 'quality'
  sentiment: 'positive' | 'warning'
  timeframe: string  // e.g., "Last 30 days", "Current"
}
```

This function uses `aggregateBusinessBehaviourSignals()` and produces up to 4 role-agnostic insight sentences:

**Settlement insights (pick 1):**
- `on_time_rate >= 80`: "On-time payments with {x} of {total} connections" → positive, "Last 30 days"
- `on_time_rate >= 50 && < 80`: "Mixed payment timing across connections" → warning, "Last 30 days"
- `on_time_rate < 50`: "Frequent late payments across connections" → warning, "Last 30 days"
- `total_overdue >= 1`: "{n} payments overdue across connections" → warning, "Current"
  (This one is always shown in addition to the rate insight if overdue > 0)

**Operational insight (pick 1):**
- `weighted_avg_acceptance_delay < 12`: "Orders processed within {n} hours on average" → positive, "Last 30 days"
- `weighted_avg_acceptance_delay < 48`: "Orders typically processed within {n} hours" → positive, "Last 30 days"
- `weighted_avg_acceptance_delay >= 48`: "Order processing averaging {n} hours" → warning, "Last 30 days"
- `null` (no data): skip

**Quality insight (pick 1):**
- `total_open_issues === 0 && total_issues_30_days === 0`: "No disputes reported recently" → positive, "Last 30 days"
- `total_open_issues === 0 && total_issues_30_days >= 1`: "{n} disputes raised, all resolved" → positive, "Last 30 days"
- `total_open_issues >= 1`: "{n} open disputes across connections" → warning, "Current"

**Insufficient data handling:**
If `total_orders_evaluated < 3`, show a single insight: "Not enough trade history to generate insights yet" → neutral, and skip all other insights.

### Visibility rules (MVP)

- **Self-profile**: Business always sees their own full Insights tab (all three sections).
- **Connected businesses**: See the full Insights tab.
- **Non-connected businesses (via Zelto ID search)**: See only the trust score number and badge in the header. The Insights tab shows a locked state: "Connect with this business to see their trade insights." This preserves privacy and incentivizes connections.

---

## 8. New File: `src/lib/trust-score.ts`

This is the main new file. It replaces the scoring logic in `credibility.ts`.

### Exports

```typescript
// Types
export interface PillarScore {
  score: number
  max: number
  tags: Array<{ label: string; sentiment: 'positive' | 'warning' | 'neutral' }>
}

export interface TrustScoreBreakdown {
  total: number                    // 0-100
  level: 'none' | 'basic' | 'verified' | 'trusted'
  identity: PillarScore            // max 30
  activity: PillarScore            // max 20
  tradeRecord: PillarScore         // max 50
  tradeRecordInsufficient: boolean  // true if < 3 orders
  weakestPillar: 'identity' | 'activity' | 'tradeRecord'
  nudgeText: string
}

export interface BusinessInsight {
  text: string
  category: 'settlement' | 'operational' | 'quality'
  sentiment: 'positive' | 'warning' | 'neutral'
  timeframe: string
}

export interface AggregatedBehaviourSignals {
  total_on_time_payments: number
  total_late_payments: number
  total_overdue: number
  total_partial_payments: number
  on_time_rate: number | null
  short_window_late_count: number
  medium_window_late_count: number
  trend: 'improving' | 'worsening' | 'stable' | 'insufficient_data'
  weighted_avg_acceptance_delay: number | null
  weighted_avg_dispatch_delay: number | null
  avg_delivery_consistency: number | null
  total_open_issues: number
  total_issues_30_days: number
  has_recurring_issues: boolean
  connections_evaluated: number
  total_orders_evaluated: number
}

// Functions
export async function computeTrustScore(businessId: string): Promise<TrustScoreBreakdown>
export async function aggregateBusinessBehaviourSignals(businessId: string): Promise<AggregatedBehaviourSignals>
export async function generateBusinessInsights(businessId: string): Promise<BusinessInsight[]>
```

### Caching

After computing the trust score, update the cached score in the DB (same pattern as current `credibility.ts`):

```typescript
await dataStore.updateCredibilityScore(businessId, breakdown.total)
```

The full breakdown is NOT cached in the DB — it's computed on demand when the Trust Profile or Badge Info Sheet is opened. Only the total score number is cached for display in headers and cards.

---

## 9. Migration from Current System

### What changes

| File | Change |
|------|--------|
| `src/lib/credibility.ts` | Keep `calculateCredibility()` but mark as **deprecated**. Add `computeTrustScore()` import from new `trust-score.ts`. Update `scoreToLevel()` thresholds. |
| `src/lib/trust-score.ts` | **NEW FILE** — all scoring, aggregation, and insight logic |
| `src/components/TrustProfileScreen.tsx` | Add "Insights" tab, wire up `computeTrustScore()` and `generateBusinessInsights()` |
| `src/components/BadgeInfoSheet.tsx` | Update to show three-pillar breakdown, nudge, and updated thresholds |
| `src/components/BusinessDetailsScreen.tsx` | Update credibility banner to use new `computeTrustScore()` |
| `src/components/ProfileScreen.tsx` | No changes — still shows badge from cached score |

### What stays the same

- `TrustBadge` component — no visual changes
- `business_entities` table — no schema changes
- `business_documents` table — no schema changes
- Behaviour Engine (`behaviour-engine.ts`) — no changes, consumed as-is
- Insight Engine (`insight-engine.ts`) — no changes, this is connection-level and stays for ConnectionDetailScreen
- Attention Engine — no changes

### No new database tables or migrations needed

All data already exists. The new logic is purely a computation layer on top of existing tables.

---

## 10. Performance Considerations

### Aggregation cost

`aggregateBusinessBehaviourSignals()` calls `behaviourEngine.computeAllSignals()` for every connection. For a business with 10 connections, that's 10 sets of queries. This could be slow.

**Mitigation:**
- Run all connection signal computations in parallel: `Promise.all(connections.map(...))`
- The Trust Profile is only opened explicitly by a user — it's not on a high-frequency path
- Consider adding a lightweight cache (in-memory, expires after 5 minutes) if performance becomes an issue

### Trust score computation timing

- **On Trust Profile open**: Compute fresh (ensures accuracy)
- **On badge display (headers, cards)**: Use cached score from `business_entities.credibility_score`
- **Periodic refresh**: The existing 20-minute recalculation interval for connection states could also trigger a trust score refresh — but this is optional for MVP

---

## 11. Edge Cases

| Case | Handling |
|------|----------|
| Brand new business (no connections, no orders) | Pillar 1 scores from profile. Pillar 2 = 0. Pillar 3 = insufficient data (0). Badge = "New" |
| Business with connections but no orders | Pillar 2 gets connection points but no order/recency points. Pillar 3 = insufficient data. |
| Business with 1-2 completed orders | Pillar 3 = insufficient data. Need 3+ to score. |
| All payments on time but only 3 orders | Pillar 3 scores normally but total will be limited by small sample. This is acceptable. |
| Business only acts as buyer (never supplier) | Operational signals may be null (acceptance/dispatch are supplier actions). Score only from available signals. Null operational signals = 0 operational points, but settlement and quality still score. |
| Business only acts as supplier | Settlement signals may have fewer data points (payment is buyer's action). Same principle — score from available data. |
| All connections are new (no order history) | Trade record = insufficient data. Score from Pillar 1 + 2 only. |

---

## 12. Testing Checklist

- [ ] Business with complete profile + 0 connections → score comes from Pillar 1 only (~15-30)
- [ ] Business with profile + 5 connections + 0 orders → Pillar 1 + partial Pillar 2 (~25-40)
- [ ] Business with everything but all payments late → Pillar 3 scores low, total drops significantly
- [ ] Business with minimal profile but perfect trade record → Pillar 1 low, Pillar 3 high, balanced total
- [ ] Badge transitions: verify a business moves from Basic → Verified → Trusted as it builds history
- [ ] Insufficient data threshold: verify < 3 orders shows "insufficient" state
- [ ] Tags correctly reflect the underlying data
- [ ] Nudge text identifies the correct weakest pillar
- [ ] Insights tab shows role-agnostic language (no buyer/supplier references)
- [ ] Non-connected business sees locked Insights tab

---

## 13. Future Enhancements (NOT in this spec)

- Industry-specific document requirements (e.g., FSSAI for food businesses)
- Public trust score visibility for non-connected businesses
- Historical trust score tracking (score over time graph)
- Trust score as a factor in search/discovery ranking
- LLM-generated narrative insights (Phase B of insight engine)
- Reputation system with cross-business signals
