# PHASE 4 COMPLETE: INSIGHT GENERATOR

## What Was Built

The Insight Generator is the fourth layer of Zelto's intelligence system. It transforms Behaviour Engine signals into human-readable templated insights, applying strict gating rules to ensure insights never contradict active friction.

## Architecture

**File**: `src/lib/insight-engine.ts`

### Core Components

1. **InsightEngine class** with two public methods:
   - `getInsightsForConnection(connectionId, viewerRole)` - Returns at most two insights for a connection
   - `getAllInsightTemplates()` - Returns the complete flat list of all 16 possible insights

2. **Template Library** (16 total insights):
   - Settlement: 6 insights
   - Operational: 5 insights  
   - Quality: 5 insights

3. **Viewer Role Support**: `buyer` | `supplier` parameter influences prioritization

## Template Library

### Settlement Insights
- "Payments usually on time"
- "Partial payments common"
- "Payments often completed in stages"
- "Delay increasing recently"
- "Stable payment rhythm"
- "Payments frequently overdue"

### Operational Insights
- "Dispatch timing consistent"
- "Acceptance slow recently"
- "Delivery timing reliable"
- "Dispatch delays observed"
- "Orders accepted quickly"

### Quality Insights
- "Issues reported recently"
- "Low issue frequency"
- "Recurring issues observed"
- "Issue rate increasing"
- "No issues reported recently"

## Selection Logic

### Settlement (uses medium window signals)
1. If `overdue_count >= 1` → "Payments frequently overdue"
2. If `late_payment_count > on_time_payment_count` → "Delay increasing recently"
3. If `on_time_payment_count >= 3 && late_payment_count === 0` → "Stable payment rhythm"
4. If `partial_payment_count >= 2` → "Partial payments common"
5. If `partial_payment_count >= 1 && on_time_payment_count > 0` → "Payments often completed in stages"
6. If `on_time_payment_count > late_payment_count && overdue_count === 0` → "Payments usually on time"

### Operational
1. If `avg_acceptance_delay > 48 hours` → "Acceptance slow recently"
2. If `avg_dispatch_delay > 72 hours` → "Dispatch delays observed"
3. If `avg_dispatch_delay < 24 hours && orderCount >= 3` → "Dispatch timing consistent"
4. If `delivery_consistency >= 90 && orderCount >= 3` → "Delivery timing reliable"
5. If `avg_acceptance_delay < 4 hours && orderCount >= 3` → "Orders accepted quickly"

### Quality
1. If `total_open_issues >= 1` → "Issues reported recently"
2. If `recurring_issue_types.length >= 1` → "Recurring issues observed"
3. If `total_issues_30_days > 3` → "Issue rate increasing"
4. If `total_issues_30_days === 0` → "No issues reported recently"
5. If `total_issues_30_days in [1,2] && total_open_issues === 0` → "Low issue frequency"

## Insight Gating — Critical Rule

Before any insight is included in final output, it's checked against `ActiveFrictionSummary` from Attention Engine.

**Positive insights are suppressed when friction is active:**

- Settlement positives suppressed if `hasSettlementFriction === true`
  - "Payments usually on time"
  - "Stable payment rhythm"  
  - "Payments often completed in stages"

- Operational positives suppressed if `hasOperationalFriction === true`
  - "Orders accepted quickly"
  - "Delivery timing reliable"
  - "Dispatch timing consistent"

- Quality positives suppressed if `hasQualityFriction === true`
  - "No issues reported recently"
  - "Low issue frequency"

**Negative insights are never suppressed.** They always show when signal criteria are met.

## Viewer Role Prioritization

Maximum of two insights applies regardless of role.

**When `viewerRole === 'buyer'`:**
- Prioritize settlement insights first
- If 3+ ungated insights exist, select one settlement + one non-settlement

**When `viewerRole === 'supplier'`:**
- Prioritize operational and quality insights first
- If 3+ ungated insights exist, prefer operational + quality combination

## Data Flow

```
Connection ID + Viewer Role
    ↓
Behaviour Engine → AllBehaviourSignals
    ↓
Attention Engine → ActiveFrictionSummary
    ↓
Selection Logic → 3 candidate insights (settlement, operational, quality)
    ↓
Gating Filter → Remove suppressed positive insights
    ↓
Role Prioritization → Select at most 2 insights
    ↓
Return: InsightTemplate[]
```

## Key Design Decisions

1. **No AI Generation**: Every insight comes from a fixed template library
2. **Maximum Two Insights**: Prevents overwhelming users with information
3. **Gating Over Accuracy**: Better to show nothing than contradict active friction
4. **Role-Based Context**: Same connection shows different insights to buyer vs supplier
5. **Negative Bias**: Negative signals always surface; positive signals are conditional

## Integration Points

- **Reads from**: Behaviour Engine (signals), Attention Engine (friction summary)
- **Consumed by**: UI layer (not yet built), Admin panel (future)
- **No writes**: Pure computation layer with no side effects

## What's Next

Phase 5 would typically involve:
- UI implementation to display insights
- Admin interface to audit insight selection
- Historical tracking of which insights were shown when
- A/B testing framework for template variations

## Validation Checklist

✅ All 16 template strings implemented  
✅ Selection logic matches specification exactly  
✅ Gating rules prevent contradictory insights  
✅ Viewer role influences prioritization  
✅ Maximum two insights enforced  
✅ Negative insights never suppressed  
✅ No AI or free-form text generation  
✅ Pure function with no side effects  
✅ Integrates with Behaviour Engine and Attention Engine  
✅ TypeScript types exported for downstream use
