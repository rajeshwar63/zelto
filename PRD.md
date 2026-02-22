# Zelto — Relationship-First Business Workspace

Zelto is a private business workspace that enables two businesses to manage their buyer-supplier relationship through shared order visibility, payment tracking, and issue management.

**Experience Qualities**:
1. **Trust-First** - Every interaction reinforces transparency and accountability between business partners
2. **Precision-Driven** - Data integrity and accuracy are paramount; calculations are deterministic and auditable
3. **Relationship-Centered** - Features serve the connection between two specific businesses, not a marketplace

**Complexity Level**: Complex Application (advanced functionality with multiple interconnected entities)
- The system manages intricate business relationships with multi-state workflows, financial calculations, and temporal snapshots of business rules

## Essential Features

### Business Entity Management
- **Functionality**: Create and store business entities with unique identifiers
- **Purpose**: Foundation for all business relationships and user access
- **Trigger**: Business registration or user invitation
- **Progression**: Business details entered → Unique Zelto ID generated (ZELTO-XXXXX) → Entity created → User accounts linked
- **Success criteria**: Each entity has unique ID, timestamp tracked, user accounts properly linked

### Connection Establishment
- **Functionality**: Link two business entities in a buyer-supplier relationship
- **Purpose**: Define the bilateral relationship and establish payment terms
- **Trigger**: Supplier initiates connection with specific buyer
- **Progression**: Supplier selects buyer → Payment terms proposed → Buyer accepts → Connection active → All future orders inherit current payment terms
- **Success criteria**: Connection stores both parties, payment terms locked per order, behavior history persists

### Order Lifecycle Management
- **Functionality**: Track orders through four distinct states with timestamp capture
- **Purpose**: Provide shared visibility into order progress and trigger payment obligations
- **Trigger**: Buyer creates order or supplier accepts/dispatches/delivers
- **Progression**: Placed → Accepted → Dispatched → Delivered (each with timestamp)
- **Success criteria**: Order snapshots payment terms at creation, due date calculated correctly based on payment type

### Payment Ledger System
- **Functionality**: Record multiple payment events per order and compute settlement state
- **Purpose**: Track partial payments and automatically determine payment status
- **Trigger**: Payment recorded by either party
- **Progression**: Payment event added → Total paid recalculated → Pending amount updated → Settlement state computed (Paid/Partial/Awaiting/Pending)
- **Success criteria**: Settlement state always computed from events, never manually set; supports multiple payments per order

### Issue Reporting
- **Functionality**: Attach structured issue reports to specific orders
- **Purpose**: Document problems and track resolution status
- **Trigger**: Either party identifies order issue
- **Progression**: Issue raised with type/severity → Other party acknowledges → Resolution actions → Status updated to Resolved
- **Success criteria**: Every issue links to order, includes severity classification, tracks resolution lifecycle

### Behaviour Engine (Phase 2)
- **Functionality**: Compute behavioral signals from transaction data across time windows
- **Purpose**: Transform raw order, payment, and issue data into structured behavior patterns
- **Trigger**: On-demand computation when connection state assessment needed
- **Progression**: Raw data retrieved → Windowed filtering → Signal aggregation → Structured output per stream (settlement/operational/quality)
- **Success criteria**: Signals computed from medium (30-day) and short (7-day) windows; supports connection state classification

### Attention Engine (Phase 3)
- **Functionality**: Generate prioritized attention items based on friction detection
- **Purpose**: Surface what requires action without notification noise
- **Trigger**: Active friction detected (overdue payments, open issues, stale orders)
- **Progression**: Friction detected → Attention item created with category → Priority computed → Items sorted by urgency and age
- **Success criteria**: Maximum five categories (Pending Payments, Due Today, Overdue, Disputes, Approval Needed); priority scoring includes issue presence

### Insight Generator (Phase 4)
- **Functionality**: Select templated insight strings from fixed library based on behavior signals
- **Purpose**: Provide contextual relationship insights without AI generation or free-form text
- **Trigger**: Computed on-demand for each connection with viewer role context
- **Progression**: Behaviour signals retrieved → Friction summary checked → Candidate insights selected → Gating rules applied → Maximum two insights returned
- **Success criteria**: All insights from fixed template library; positive insights suppressed when active friction present; role-based prioritization (buyer sees settlement first, supplier sees operational/quality first)

## Edge Case Handling

- **Payment Term Changes**: Only affect future orders; existing orders preserve their payment term snapshot
- **Duplicate Zelto IDs**: System must guarantee uniqueness through generation validation
- **Orphaned Data**: Issues cannot exist without orders; users cannot exist without business entities
- **Overpayment**: System allows total_paid to exceed order value (captured in settlement logic)
- **Missing Timestamps**: Nullable fields handled gracefully in due date calculations (e.g., Bill to Bill without invoice date)
- **Zero-Value Orders**: Permitted but settlement state logic still applies
- **Connection Deletion**: Must consider cascade effects on orders, payments, and issues

## Design Direction
*Phase 1 is data foundation only — no UI implementation yet*

## Color Selection
*Deferred to Phase 2*

## Font Selection
*Deferred to Phase 2*

## Animations
*Deferred to Phase 2*

## Component Selection
*Deferred to Phase 2*
