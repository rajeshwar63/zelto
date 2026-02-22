# ZELTO — PHASE 2: BEHAVIOUR ENGINE ✓ COMPLETE

## Overview
The Behaviour Engine is a logic-only system that computes trust signals from three independent data streams. No UI has been built. The engine derives connection states automatically based on configurable rules.

---

## Three Independent Trust Streams

### 1. Settlement Trust Stream
**Source:** Payment behaviour from orders and payment events

**Signals Computed (per connection):**
- `on_time_payment_count` — orders where payment completed before or on due date
- `late_payment_count` — orders where payment completed after due date
- `partial_payment_count` — orders currently in Partial Payment settlement state
- `overdue_count` — orders in Pending settlement state where due date has passed
- `unpaid_count` — orders in Awaiting Payment state where due date has not passed yet

**Time Windows:** 
- Medium (30 days) — default for all settlement signals
- Short (7 days) — for detecting recent payment shifts

---

### 2. Operational Trust Stream
**Source:** Order lifecycle timestamps (createdAt, acceptedAt, dispatchedAt, deliveredAt)

**Signals Computed (per connection):**
- `avg_acceptance_delay` — average time in hours between order creation and acceptance
- `avg_dispatch_delay` — average time in hours between acceptance and dispatch
- `delivery_consistency` — percentage of orders delivered within expected timeframe
- `orders_awaiting_acceptance` — count of orders in Placed state with no acceptedAt timestamp
- `orders_awaiting_dispatch` — count of orders Accepted but no dispatch after more than 24 hours

---

### 3. Quality Trust Stream
**Source:** Issue reports attached to orders

**Signals Computed (per connection):**
- `total_open_issues` — count of issues with status Open
- `total_issues_30_days` — count of all issues created in last 30 days
- `recurring_issue_types` — issue types that appear more than once in last 30 days
- `buyer_raised_issue_count` — issues raised by buyer in last 30 days
- `supplier_raised_issue_count` — issues raised by supplier in last 30 days

---

## Connection State Engine

Connection state is **automatically derived** from the three signal streams. It is never manually set.

### State Derivation Rules

**Under Stress** (highest priority) if any of:
- `overdue_count >= 2`
- `total_open_issues >= 3`
- `overdue_count >= 1 AND total_open_issues >= 2`

**Friction Rising** if any of:
- `overdue_count >= 1` (and no open issues)
- `partial_payment_count >= 2`
- `total_open_issues >= 1`
- `avg_acceptance_delay > 48 hours`
- `avg_dispatch_delay > 72 hours`

**Active** if:
- No friction signals present
- At least 1 order created in last 7 days

**Stable** if:
- No friction signals present
- No orders created in last 7 days

---

## State Update Modes

### 1. Interval Recalculation
Connection state is recalculated every 20 minutes for all connections.

**Implementation:**
```typescript
await behaviourEngine.recalculateAllConnectionStates()
```

### 2. Immediate Recalculation (Hard Triggers)
Connection state recalculates instantly when:
- A new overdue item appears (settlement state becomes Pending)
- An issue is created
- An order crosses 48 hours without acceptance

**Implementation:**
```typescript
await behaviourEngine.recalculateConnectionStateIfTriggered(connectionId)
```

**Note:** State changes are **silent**. No notifications or alerts are generated.

---

## API Reference

### BehaviourEngine Class

Located in: `/src/lib/behaviour-engine.ts`

#### Methods

**`computeSettlementSignals(connectionId, window?)`**
Returns settlement behaviour signals for a connection.
- `connectionId: string` — the connection ID
- `window: 'short' | 'medium'` — time window (default: 'medium')
- Returns: `Promise<SettlementBehaviourSignals>`

**`computeOperationalSignals(connectionId)`**
Returns operational behaviour signals for a connection.
- `connectionId: string` — the connection ID
- Returns: `Promise<OperationalBehaviourSignals>`

**`computeQualitySignals(connectionId)`**
Returns quality behaviour signals for a connection.
- `connectionId: string` — the connection ID
- Returns: `Promise<QualityBehaviourSignals>`

**`computeConnectionState(connectionId)`**
Derives connection state using all three signal sets.
- `connectionId: string` — the connection ID
- Returns: `Promise<ConnectionState>` — one of: 'Stable' | 'Active' | 'Friction Rising' | 'Under Stress'

**`getAllBehaviourSignals(connectionId)`**
Returns all signals and derived state in one call.
- `connectionId: string` — the connection ID
- Returns: `Promise<AllBehaviourSignals>`

**`recalculateAllConnectionStates()`**
Recalculates state for all connections and updates them in the data store.
- Returns: `Promise<void>`

**`checkForHardTriggers(connectionId)`**
Checks if a connection has any hard trigger conditions present.
- `connectionId: string` — the connection ID
- Returns: `Promise<boolean>`

**`recalculateConnectionStateIfTriggered(connectionId)`**
Recalculates connection state only if hard triggers are present.
- `connectionId: string` — the connection ID
- Returns: `Promise<void>`

---

## Data Store Updates

### New Method Added

**`updateConnectionState(connectionId, newState)`**
Updates the connection state in the data store.
- `connectionId: string` — the connection ID
- `newState: ConnectionState` — the new state to set
- Returns: `Promise<Connection>`

---

## Signal Structure Reference

### SettlementBehaviourSignals
```typescript
{
  on_time_payment_count: number
  late_payment_count: number
  partial_payment_count: number
  overdue_count: number
  unpaid_count: number
  window: 'short' | 'medium'
}
```

### OperationalBehaviourSignals
```typescript
{
  avg_acceptance_delay: number | null
  avg_dispatch_delay: number | null
  delivery_consistency: number | null
  orders_awaiting_acceptance: number
  orders_awaiting_dispatch: number
}
```

### QualityBehaviourSignals
```typescript
{
  total_open_issues: number
  total_issues_30_days: number
  recurring_issue_types: IssueType[]
  buyer_raised_issue_count: number
  supplier_raised_issue_count: number
}
```

### AllBehaviourSignals
```typescript
{
  settlement: {
    medium: SettlementBehaviourSignals
    short: SettlementBehaviourSignals
  }
  operational: OperationalBehaviourSignals
  quality: QualityBehaviourSignals
  derivedState: ConnectionState
}
```

---

## What's NOT Built Yet

- ❌ Attention logic
- ❌ Insights logic
- ❌ Any UI screens
- ❌ Notification system
- ❌ Behaviour history tracking

---

## Testing the Behaviour Engine

Use the exported `behaviourEngine` instance:

```typescript
import { behaviourEngine } from '@/lib/behaviour-engine'

// Get all signals for a connection
const signals = await behaviourEngine.getAllBehaviourSignals(connectionId)
console.log(signals.derivedState) // 'Stable' | 'Active' | 'Friction Rising' | 'Under Stress'

// Get individual signal streams
const settlement = await behaviourEngine.computeSettlementSignals(connectionId, 'medium')
const operational = await behaviourEngine.computeOperationalSignals(connectionId)
const quality = await behaviourEngine.computeQualitySignals(connectionId)

// Recalculate all connection states
await behaviourEngine.recalculateAllConnectionStates()
```

---

## Phase 2 Complete ✓

The Behaviour Engine is fully functional and ready for Phase 3 integration.
