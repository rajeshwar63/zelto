# Zelto Data Foundation — Phase 1 Complete

## Overview

The Zelto data foundation has been implemented with all entity models, relationships, business rules, and calculation logic. This document describes the complete data structure.

---

## Entity Models

### 1. BusinessEntity

Represents a business that can participate in buyer-supplier relationships.

```typescript
interface BusinessEntity {
  id: string                  // UUID
  zeltoId: string             // Format: ZELTO-XXXXX (e.g., ZELTO-10247)
  businessName: string
  createdAt: number          // Unix timestamp in milliseconds
}
```

**Business Rules:**
- Zelto ID is auto-generated and guaranteed unique across all entities
- Generation function validates against existing IDs to prevent duplicates
- Entities are invisible to each other unless a connection exists
- No global search or public directory

---

### 2. UserAccount

Represents a user who belongs to a specific business entity.

```typescript
interface UserAccount {
  id: string                  // UUID
  phoneNumber: string
  username: string
  password: string            // In production would be hashed
  businessEntityId: string    // Foreign key to BusinessEntity
}
```

**Business Rules:**
- Every user must be linked to a valid BusinessEntity
- Multiple users can belong to the same business entity
- Users cannot exist without a business entity (enforced in data store)

---

### 3. Connection

Represents a bilateral relationship between a buyer and supplier business.

```typescript
interface Connection {
  id: string                     // UUID
  buyerBusinessId: string        // Foreign key to BusinessEntity
  supplierBusinessId: string     // Foreign key to BusinessEntity
  paymentTerms: PaymentTermType
  connectionState: ConnectionState  // Default: 'Stable'
  behaviourHistory: Record<string, unknown>[]  // Persistent, never resets
  createdAt: number             // Unix timestamp in milliseconds
}

type PaymentTermType = 
  | { type: 'Advance Required' }
  | { type: 'Payment on Delivery' }
  | { type: 'Bill to Bill' }
  | { type: 'Days After Delivery'; days: number }

type ConnectionState = 'Stable'
```

**Business Rules:**
- One payment rhythm per connection
- Supplier always proposes payment terms (enforced in business layer)
- Payment term changes only affect future orders
- Existing orders preserve their payment term snapshot
- Connection state defaults to 'Stable' on creation
- Behaviour history persists indefinitely

---

### 4. Order

Represents a purchase order between buyer and supplier within a connection.

```typescript
interface Order {
  id: string                        // UUID
  connectionId: string              // Foreign key to Connection
  itemSummary: string               // Text description
  orderValue: number                // Numeric value
  createdAt: number                 // Unix timestamp
  acceptedAt: number | null         // Unix timestamp (nullable)
  dispatchedAt: number | null       // Unix timestamp (nullable)
  deliveredAt: number | null        // Unix timestamp (nullable)
  paymentTermSnapshot: PaymentTermType  // Copied from connection at creation
  billToBillInvoiceDate: number | null  // For Bill to Bill payment terms
}

type OrderLifecycleState = 'Placed' | 'Accepted' | 'Dispatched' | 'Delivered'
```

**Business Rules:**
- Each order snapshots the connection's payment terms at creation time
- Payment term snapshot is immutable once order is created
- Order lifecycle progresses through exactly 4 states: Placed → Accepted → Dispatched → Delivered
- State transitions are tracked via timestamps (acceptedAt, dispatchedAt, deliveredAt)
- Order must belong to a valid connection

**Due Date Calculation:**

The due date is computed (not stored) based on payment term snapshot:

1. **Advance Required**: Due date = `createdAt`
2. **Payment on Delivery**: Due date = `deliveredAt`
3. **Bill to Bill**: Due date = `billToBillInvoiceDate` (manually set when invoice issued)
4. **Days After Delivery**: Due date = `deliveredAt + (days * 24 * 60 * 60 * 1000)`

Implementation: See `calculateDueDate()` in `business-logic.ts`

---

### 5. PaymentEvent

Represents a single payment transaction against an order.

```typescript
interface PaymentEvent {
  id: string           // UUID
  orderId: string      // Foreign key to Order
  amountPaid: number   // Amount in this payment
  timestamp: number    // Unix timestamp
}
```

**Business Rules:**
- Multiple payment events can exist per order (supports partial payments)
- Payment events cannot exist without a valid order
- Each event records a specific amount at a specific time

**Computed Payment State:**

These values are always computed from payment events, never stored:

```typescript
interface OrderWithPaymentState extends Order {
  totalPaid: number           // Sum of all payment event amounts
  pendingAmount: number       // orderValue - totalPaid
  settlementState: SettlementState  // Computed state
  calculatedDueDate: number | null  // Computed from payment terms
}

type SettlementState = 
  | 'Paid'                // totalPaid >= orderValue
  | 'Partial Payment'     // totalPaid > 0 and < orderValue
  | 'Awaiting Payment'    // totalPaid === 0 and dueDate not passed
  | 'Pending'             // totalPaid === 0 and dueDate passed
```

**Settlement State Logic:**

```
if (totalPaid >= orderValue)
  → 'Paid'

else if (totalPaid > 0 && totalPaid < orderValue)
  → 'Partial Payment'

else if (totalPaid === 0)
  if (dueDate is null OR currentTime < dueDate)
    → 'Awaiting Payment'
  else
    → 'Pending'
```

Implementation: See `calculateSettlementState()` in `business-logic.ts`

---

### 6. IssueReport

Represents a problem report attached to an order.

```typescript
interface IssueReport {
  id: string              // UUID
  orderId: string         // Foreign key to Order (required)
  issueType: IssueType
  severity: IssueSeverity
  raisedBy: RaisedBy      // 'buyer' or 'supplier'
  status: IssueStatus
  createdAt: number       // Unix timestamp
}

type IssueType = 
  | 'Damaged Product'
  | 'Quality Below Expectation'
  | 'Expired Product'
  | 'Packaging Issue'
  | 'Short Supply'
  | 'Wrong Items Delivered'
  | 'Billing Mismatch'
  | 'Price Discrepancy'

type IssueSeverity = 'Low' | 'Medium' | 'High'
type IssueStatus = 'Open' | 'Acknowledged' | 'Resolved'
type RaisedBy = 'buyer' | 'supplier'
```

**Business Rules:**
- Every issue MUST be attached to an existing order
- Issues cannot exist without an order (enforced in data store)
- Either buyer or supplier can raise issues
- Issue types come from a fixed enumeration
- Status progresses: Open → Acknowledged → Resolved

---

## Data Store Architecture

### Storage Keys

All data is persisted using the Spark KV API with the following keys:

- `zelto:business-entities` → BusinessEntity[]
- `zelto:user-accounts` → UserAccount[]
- `zelto:connections` → Connection[]
- `zelto:orders` → Order[]
- `zelto:payment-events` → PaymentEvent[]
- `zelto:issue-reports` → IssueReport[]

### ZeltoDataStore Class

The `ZeltoDataStore` class (in `lib/data-store.ts`) provides a complete API for:

**Business Entities:**
- `createBusinessEntity(businessName)` — Auto-generates unique Zelto ID
- `getAllBusinessEntities()`
- `getBusinessEntityById(id)`

**User Accounts:**
- `createUserAccount(phoneNumber, username, password, businessEntityId)` — Validates entity exists
- `getAllUserAccounts()`
- `getUserAccountsByBusinessId(businessEntityId)`

**Connections:**
- `createConnection(buyerBusinessId, supplierBusinessId, paymentTerms)` — Validates both entities
- `getAllConnections()`
- `getConnectionById(id)`
- `getConnectionsByBusinessId(businessId)`
- `updateConnectionPaymentTerms(connectionId, newPaymentTerms)` — Only affects future orders

**Orders:**
- `createOrder(connectionId, itemSummary, orderValue)` — Snapshots payment terms at creation
- `getAllOrders()`
- `getOrderById(id)`
- `getOrdersByConnectionId(connectionId)`
- `updateOrderState(orderId, state)` — Updates acceptedAt, dispatchedAt, or deliveredAt
- `updateOrderBillToBillInvoiceDate(orderId, invoiceDate)` — For Bill to Bill payment terms
- `getOrderWithPaymentState(orderId)` — Returns enriched order with computed payment state
- `getAllOrdersWithPaymentState()` — Returns all orders with payment state
- `getOrdersWithPaymentStateByConnectionId(connectionId)` — Filtered orders with payment state

**Payment Events:**
- `createPaymentEvent(orderId, amountPaid)` — Validates order exists
- `getAllPaymentEvents()`
- `getPaymentEventsByOrderId(orderId)`

**Issue Reports:**
- `createIssueReport(orderId, issueType, severity, raisedBy)` — Validates order exists
- `updateIssueStatus(issueId, status)`
- `getAllIssueReports()`
- `getIssueReportsByOrderId(orderId)`

**Utility:**
- `clearAllData()` — Deletes all data (for testing/reset)

---

## Business Logic Functions

Located in `lib/business-logic.ts`:

### ID Generation
- `generateZeltoId(existingIds: string[]): string`
  - Generates format ZELTO-XXXXX
  - Validates uniqueness against existing IDs

### Payment Calculations
- `calculateDueDate(order: Order, paymentEvents: PaymentEvent[]): number | null`
  - Computes due date based on payment term type and relevant timestamps

- `calculateTotalPaid(orderId: string, allPaymentEvents: PaymentEvent[]): number`
  - Sums all payment event amounts for an order

- `calculateSettlementState(orderValue: number, totalPaid: number, dueDate: number | null): SettlementState`
  - Determines settlement state using business rules

- `enrichOrderWithPaymentState(order: Order, allPaymentEvents: PaymentEvent[]): OrderWithPaymentState`
  - Combines order with computed payment metrics

### Utilities
- `validateUniqueZeltoId(zeltoId: string, allZeltoIds: string[]): boolean`
  - Checks if a Zelto ID is unique

- `snapshotPaymentTerms(connectionPaymentTerms: PaymentTermType): PaymentTermType`
  - Deep clones payment terms for order snapshot

---

## Seed Data

The system is seeded with realistic data demonstrating all models:

### Business Entities (4)
1. TechParts Manufacturing (ZELTO-10247) — Supplier
2. GreenLeaf Electronics (ZELTO-28451) — Buyer
3. BuildRight Supplies (ZELTO-39562) — Buyer
4. MetalWorks Industries (ZELTO-47128) — Supplier

### Connections (3)
1. GreenLeaf ← TechParts (Days After Delivery: 30 days)
2. BuildRight ← MetalWorks (Payment on Delivery)
3. GreenLeaf ← MetalWorks (Bill to Bill)

### Orders (5)
1. **Order-1** (conn-1): Circuit boards, $12,500 — Delivered, Paid in full
2. **Order-2** (conn-1): Power supplies, $8,400 — Delivered, Partial payment ($8,400 total)
3. **Order-3** (conn-2): Steel beams, $45,000 — Delivered, Paid in full
4. **Order-4** (conn-3): Aluminum sheets, $18,900 — Dispatched, No payment yet
5. **Order-5** (conn-1): Cooling fans, $3,200 — Placed (not accepted), No payment

### Payment Events (4)
- Order-1: Full payment ($12,500)
- Order-2: Two partial payments ($5,000 + $3,400 = $8,400)
- Order-3: Full payment ($45,000)

### Issues (3)
1. Order-2: Packaging Issue (Low severity) — Resolved
2. Order-3: Short Supply (High severity) — Acknowledged
3. Order-4: Damaged Product (Medium severity) — Open

---

## Type Safety

All types are defined in `lib/types.ts` with TypeScript interfaces and type unions that enforce:
- Discriminated unions for payment term types
- Strict enumerations for states, severities, and issue types
- Nullable fields where business logic permits null
- Separate interfaces for stored vs. computed data

---

## Key Implementation Details

### Payment Term Snapshot Mechanism
When an order is created:
1. `createOrder()` calls `snapshotPaymentTerms()` to deep-clone current connection payment terms
2. Snapshot is stored in `order.paymentTermSnapshot`
3. Future changes to connection payment terms do not affect existing orders
4. Each order's due date calculation uses its own snapshot

### Settlement State Computation
Settlement state is NEVER stored in the database:
1. When order data is needed, call `enrichOrderWithPaymentState()`
2. Function queries all payment events for that order
3. Computes `totalPaid`, `pendingAmount`, `calculatedDueDate`, and `settlementState`
4. Returns augmented `OrderWithPaymentState` object
5. Original order data remains unchanged

### Foreign Key Validation
The data store enforces referential integrity:
- User accounts must reference existing entities
- Connections must reference two existing entities
- Orders must reference existing connections
- Payment events must reference existing orders
- Issue reports must reference existing orders

### Orphan Prevention
The system prevents orphaned data:
- Cannot create users without valid business entity
- Cannot create orders without valid connection
- Cannot create payments without valid order
- Cannot create issues without valid order

---

## What's NOT in Phase 1

As specified, Phase 1 is data foundation only. The following are NOT implemented:

- ❌ UI screens or components
- ❌ Navigation or routing
- ❌ Connection state calculation logic
- ❌ Insights or analytics
- ❌ Admin features
- ❌ Authentication/authorization
- ❌ User management workflows
- ❌ Forms or user input

---

## Next Steps (Future Phases)

Phase 1 provides the complete data foundation for:
- Phase 2: UI implementation for viewing data
- Phase 3: Connection management and payment term proposals
- Phase 4: Order lifecycle management
- Phase 5: Payment tracking and reporting
- Phase 6: Issue management workflows
- Phase 7: Analytics and insights
- Phase 8: Connection state health monitoring

---

## Files Created

- `/PRD.md` — Product requirements document
- `/src/lib/types.ts` — TypeScript type definitions
- `/src/lib/business-logic.ts` — Calculation and validation functions
- `/src/lib/data-store.ts` — Data access layer with business rule enforcement
- `/src/App.tsx` — Simple data structure display (not a real UI)
- `/DATA_STRUCTURE.md` — This document

## Data Access Example

```typescript
import { dataStore } from '@/lib/data-store'

// Create a business entity
const entity = await dataStore.createBusinessEntity('Acme Corp')
console.log(entity.zeltoId) // ZELTO-12345

// Create a connection
const connection = await dataStore.createConnection(
  buyerId,
  supplierId,
  { type: 'Days After Delivery', days: 30 }
)

// Create an order (payment terms are automatically snapshotted)
const order = await dataStore.createOrder(
  connection.id,
  'Widget shipment',
  10000
)

// Record a payment
await dataStore.createPaymentEvent(order.id, 5000)

// Get order with computed payment state
const orderState = await dataStore.getOrderWithPaymentState(order.id)
console.log(orderState.settlementState) // 'Partial Payment'
console.log(orderState.totalPaid) // 5000
console.log(orderState.pendingAmount) // 5000
```

---

**Phase 1 Status: ✅ COMPLETE**

All data models, relationships, business rules, and calculations are implemented and tested with seed data.
