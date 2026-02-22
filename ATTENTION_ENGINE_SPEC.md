# ZELTO — PHASE 3: ATTENTION ENGINE

## Overview
The Attention Engine is the real-time friction detection layer of Zelto. It reads from settlement states, issue statuses, and order lifecycle timestamps to produce a structured list of items that need human awareness. It does not send notifications—it produces a data structure that the UI will read.

## Attention Categories

There are exactly **five categories**:

1. **Pending Payments**: Orders where `pending_amount > 0` and calculated due date is in the future
2. **Due Today**: Orders where `pending_amount > 0` and calculated due date is today (within the current calendar day)
3. **Overdue**: Orders where `pending_amount > 0` and calculated due date has passed
4. **Disputes**: Any issue report with status `Open`, regardless of issue type
5. **Approval Needed**: 
   - Orders in `Placed` state with no `acceptedAt` timestamp
   - Orders in `Accepted` state with no `dispatchedAt` after 48 hours

## Attention Item Structure

```typescript
export interface AttentionItem {
  id: string                      // Unique identifier for this attention item
  category: AttentionCategory     // One of the five categories
  connectionId: string            // Connection this item belongs to
  orderId?: string                // Order ID if applicable
  issueId?: string                // Issue ID if applicable (Disputes only)
  description: string             // Human-readable description
  priorityScore: number           // Internal priority for sorting (1 = highest)
  frictionStartedAt: number       // Timestamp when friction began
  metadata?: {                    // Additional contextual data
    issueType?: string
    pendingAmount?: number
    daysOverdue?: number
    stateInfo?: string
  }
}
```

### Example Attention Items

#### Overdue Payment with Open Issue (Highest Priority)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "category": "Overdue",
  "connectionId": "conn-123",
  "orderId": "order-456",
  "description": "Payment overdue by 5 days for order Rice 25kg bags",
  "priorityScore": 1,
  "frictionStartedAt": 1705324800000,
  "metadata": {
    "pendingAmount": 15000,
    "daysOverdue": 5
  }
}
```

#### Open Dispute
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "category": "Disputes",
  "connectionId": "conn-123",
  "orderId": "order-789",
  "issueId": "issue-101",
  "description": "Damaged Product reported on order Wheat flour",
  "priorityScore": 4,
  "frictionStartedAt": 1705411200000,
  "metadata": {
    "issueType": "Damaged Product"
  }
}
```

#### Stale Acceptance
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "category": "Approval Needed",
  "connectionId": "conn-123",
  "orderId": "order-999",
  "description": "Order Sugar 50kg bags not dispatched after 72 hours",
  "priorityScore": 6,
  "frictionStartedAt": 1705497600000,
  "metadata": {
    "stateInfo": "Accepted - Not Dispatched"
  }
}
```

## Priority Ordering

Items are sorted within each category by urgency using internal priority scores:

| Priority Score | Category | Condition |
|----------------|----------|-----------|
| 1 (Highest) | Overdue | Payment overdue AND has open issues on same order |
| 2 | Overdue | Payment overdue with no open issues |
| 3 | Due Today | Payment due within current calendar day |
| 4 | Disputes | Any open issue report |
| 5 | Pending Payments | Payment pending but not yet due |
| 6 (Lowest) | Approval Needed | Order awaiting acceptance or dispatch |

Within the same priority score, items are sorted by `frictionStartedAt` (earliest first).

## API Methods

### `getAttentionItems(businessId: string): Promise<AttentionItem[]>`

Returns all attention items across all connections for a given business, sorted by priority.

**Use case**: Display all friction points for a business in a dashboard view.

```typescript
const items = await attentionEngine.getAttentionItems('business-123')
// Returns: AttentionItem[] sorted by priority
```

### `getAttentionItemsByConnection(connectionId: string): Promise<AttentionItem[]>`

Returns attention items for a single connection, sorted by priority.

**Use case**: Display friction specific to one buyer-supplier relationship.

```typescript
const items = await attentionEngine.getAttentionItemsByConnection('conn-456')
// Returns: AttentionItem[] for this connection only
```

### `getActiveFrictionSummary(connectionId: string): Promise<ActiveFrictionSummary>`

Returns a boolean summary of active friction types for a connection. Used by the Insight Engine (Phase 4) to gate positive insights.

```typescript
export interface ActiveFrictionSummary {
  hasSettlementFriction: boolean    // true if Overdue or Due Today items exist
  hasOperationalFriction: boolean   // true if Approval Needed items exist
  hasQualityFriction: boolean       // true if Disputes exist
}
```

**Use case**: Check if positive insights should be suppressed due to active friction.

```typescript
const friction = await attentionEngine.getActiveFrictionSummary('conn-456')
if (!friction.hasSettlementFriction) {
  // Safe to show positive settlement insights
}
```

### `checkStaleAcceptedOrders(): Promise<AttentionItem[]>`

Scans all orders in `Accepted` state and flags those exceeding 48 hours without dispatch. Returns only the stale acceptance items.

**Use case**: Periodic background check to detect orders stuck in acceptance.

```typescript
const staleOrders = await attentionEngine.checkStaleAcceptedOrders()
// Returns: AttentionItem[] with category 'Approval Needed'
```

## Hard Trigger Events

The Attention Engine must recalculate immediately when these events occur:

1. **Settlement state changes to Pending** → Generates Overdue item
2. **New issue report created with status Open** → Generates Dispute item
3. **Order transitions to Placed state** → Generates Approval Needed item
4. **Order crosses 48 hours in Accepted without dispatch** → Generates Approval Needed item

For the 48-hour check, use `checkStaleAcceptedOrders()` in a periodic scan.

## Consistency Rule

**Attention reflects present friction.** This is the ground truth of the system.

The Insight Engine (Phase 4) will gate its outputs against Attention—meaning positive insights will be suppressed if Attention shows active friction in the same stream.

Example:
- If `hasSettlementFriction = true`, do not show "Payment behaviour improving" insight
- If `hasQualityFriction = true`, do not show "Quality standards maintained" insight
- If `hasOperationalFriction = true`, do not show "Fast order processing" insight

## Implementation Notes

### Date Handling
- "Due Today" uses calendar day comparison (same year, month, and date)
- "Overdue" excludes today (only past dates)
- Days overdue are calculated as floor of milliseconds difference

### Category Assignment
- An order can appear in multiple categories (e.g., Overdue payment + Dispute)
- Each attention item is independent—same order can generate multiple items
- Priority score determines sort order across all categories

### Performance
- All methods are async and query the data store directly
- No caching—always reflects current state
- Friction summary method reuses attention item generation logic

### Metadata Usage
- Metadata is optional and category-specific
- Used for display context in UI (amounts, days, issue types)
- Not used for sorting or filtering logic
