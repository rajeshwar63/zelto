# Zelto — Business Entity & Multi-User Architecture

## Implementation Instructions for Claude Opus 4.6

> **Context:** Zelto is a B2B trust platform for Indian SMEs. Trust, connections, orders, and reputation all live at the **business level**, not the individual user level. This document provides complete instructions to build the business entity system, multi-user mapping, deduplication, and profile management.

---

## 1. Core Principles

1. **Trust belongs to the business**, not the individual. Every trust score, connection, order, and transaction is tied to a business entity.
2. **Email is the only verified auth channel.** No SMS OTP (DLT registration is out of scope for MVP). Mobile numbers are self-declared, unverified fields.
3. **Zelto Code identifies a business**, not a user. The code (e.g., `ZELTO-WBWXZ2NK`) is the public identity of the business.
4. **Multiple users can operate under one business.** All users within a business see all orders, connections, and activity (full visibility model).
5. **Business creation happens during signup** — it's a mandatory step, not a post-signup optional action.

---

## 2. Database Schema

### 2.1 `users` table

Represents individual human accounts. Auth is email + OTP only.

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL UNIQUE,       -- login credential, verified via OTP
  username        VARCHAR(100) NOT NULL,               -- editable display name, initially = email prefix
  phone           VARCHAR(15),                         -- optional, self-declared, NOT verified
  avatar_url      TEXT,                                -- optional profile image
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
```

**On signup:**
- `email` = the email they signed up with
- `username` = extract the part before `@` (e.g., `rajeshwar63` from `rajeshwar63@gmail.com`)
- User can edit `username` at any time from the Profile screen

### 2.2 `businesses` table

The core entity in Zelto. All trust, connections, and orders hang off this.

```sql
CREATE TABLE businesses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,              -- business name (e.g., "Sri Lakshmi Traders")
  name_normalized   VARCHAR(255) NOT NULL,              -- lowercase, stripped, for fuzzy matching
  zelto_code        VARCHAR(20) NOT NULL UNIQUE,        -- e.g., "ZELTO-WBWXZ2NK"
  phone             VARCHAR(15),                        -- business contact number (self-declared, NOT verified)
  city              VARCHAR(100) NOT NULL,              -- for dedup matching
  area              VARCHAR(100),                       -- locality / neighborhood (optional but helps dedup)
  state             VARCHAR(100),
  pincode           VARCHAR(10),
  address           TEXT,
  gstin             VARCHAR(15),                        -- optional, not required for MVP
  description       TEXT,                               -- what the business does
  trust_score       DECIMAL(5,2) DEFAULT 0,             -- Zelto trust score
  verified          BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_businesses_zelto_code ON businesses(zelto_code);
CREATE INDEX idx_businesses_name_normalized ON businesses(name_normalized);
CREATE INDEX idx_businesses_city ON businesses(city);
CREATE INDEX idx_businesses_phone ON businesses(phone);
```

### 2.3 `business_members` table

Maps users to businesses. One user belongs to one business (MVP). One business can have many users.

```sql
CREATE TABLE business_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'owner', 'admin', 'member'
  status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'pending', 'removed'
  invited_by      UUID REFERENCES users(id),              -- who invited this member (null for owner)
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, business_id)
);

CREATE INDEX idx_bm_user ON business_members(user_id);
CREATE INDEX idx_bm_business ON business_members(business_id);
```

### 2.4 `join_requests` table

When a user wants to join an existing business (via Zelto Code or from fuzzy match suggestion).

```sql
CREATE TABLE join_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  message         TEXT,                                     -- optional message from requester
  reviewed_by     UUID REFERENCES users(id),               -- owner who approved/rejected
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX idx_jr_business_status ON join_requests(business_id, status);
```

### 2.5 Updated `connections` table (business-to-business)

Connections are between businesses, not individuals.

```sql
CREATE TABLE connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_biz_id  UUID NOT NULL REFERENCES businesses(id),
  responder_biz_id  UUID NOT NULL REFERENCES businesses(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'accepted', 'rejected'
  requested_by      UUID REFERENCES users(id),               -- which individual sent the request
  responded_by      UUID REFERENCES users(id),               -- which individual responded
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(requester_biz_id, responder_biz_id)
);
```

### 2.6 Updated `orders` table (business-to-business)

Orders are between businesses. The individual who created the order is tracked for accountability.

```sql
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_business_id  UUID NOT NULL REFERENCES businesses(id),
  to_business_id    UUID NOT NULL REFERENCES businesses(id),
  created_by        UUID NOT NULL REFERENCES users(id),     -- which individual created this order
  -- ... other order fields remain the same ...
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. Business Name Normalization & Fuzzy Matching

### 3.1 Normalization Function

Create a server-side function that normalizes business names for comparison:

```javascript
function normalizeBusinessName(name) {
  let normalized = name.toLowerCase().trim();
  
  // Remove common business suffixes
  const suffixes = [
    'pvt ltd', 'private limited', 'limited', 'ltd', 'llp',
    'enterprises', 'enterprise', 'traders', 'trading',
    'industries', 'solutions', 'services', 'agency',
    'co', 'company', 'corp', 'corporation', 'inc'
  ];
  for (const suffix of suffixes) {
    normalized = normalized.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '');
  }
  
  // Common transliteration variants
  const variants = {
    'shri': 'sri', 'shree': 'sri', 'sree': 'sri',
    'laxmi': 'lakshmi', 'luxmi': 'lakshmi',
    'balaji': 'balaji', 'venkatesh': 'venkatesh',
    'and': '&', 'nd': '&',
  };
  for (const [from, to] of Object.entries(variants)) {
    normalized = normalized.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  
  // Remove special characters, extra spaces
  normalized = normalized.replace(/[^a-z0-9&]/g, ' ').replace(/\s+/g, ' ').trim();
  
  return normalized;
}
```

### 3.2 Fuzzy Match Query

When a user types a business name during creation, run this query in real-time:

```sql
-- Find similar businesses in the same city
SELECT b.id, b.name, b.city, b.area, b.zelto_code,
       similarity(b.name_normalized, $1) AS name_score
FROM businesses b
WHERE b.city = $2                              -- same city
  AND similarity(b.name_normalized, $1) > 0.4  -- pg_trgm threshold
ORDER BY name_score DESC
LIMIT 5;
```

**Requires PostgreSQL `pg_trgm` extension:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_businesses_name_trgm ON businesses USING gin(name_normalized gin_trgm_ops);
```

### 3.3 Phone Number Match (Secondary Signal)

If the user also entered a phone number, check for matches:

```sql
SELECT b.id, b.name, b.city, b.zelto_code
FROM businesses b
WHERE b.phone = $1 AND b.phone IS NOT NULL;
```

If phone matches → very strong signal of duplicate, show prominently.

---

## 4. Signup & Onboarding Flow

### Step 1: Email Signup
```
Screen: Enter Email
- User enters email address
- System sends OTP to email
- User enters OTP → verified

Backend:
- Create user record
- Set username = email.split('@')[0]
- Proceed to Step 2
```

### Step 2: Create or Join Business
```
Screen: "Set up your business"

Fields:
- Business Name (required) → triggers fuzzy search as user types
- City (required) → dropdown or autocomplete
- Area / Locality (optional)
- Business Phone (optional, not verified)

As user types business name + selects city:
→ Run fuzzy match in background
→ If matches found, show banner:

  ┌──────────────────────────────────────────────────┐
  │  We found similar businesses in [City]:           │
  │                                                    │
  │  🏪 Sri Lakshmi Traders — Ameerpet                │
  │     Zelto Code: ZELTO-WBWXZ2NK                   │
  │                                                    │
  │  [This is my business →]  [Not mine, create new]  │
  └──────────────────────────────────────────────────────┘

If "This is my business" → Send join request to owner → User waits for approval
If "Not mine, create new" → Proceed to create business

Alternative entry:
  "Already have a Zelto Code?" → Enter code → join request sent
```

### Step 3: Business Created / Join Request Sent
```
If new business:
- Create business record with generated Zelto Code
- Create business_members record (role = 'owner', status = 'active')
- Redirect to home screen

If join request:
- Create join_request record (status = 'pending')
- Send notification to business owner
- Show user: "Request sent! You'll be notified when the owner approves."
- User lands on a limited home screen until approved
```

---

## 5. Profile Screen — Updated Design

### What the Profile Screen Should Show:

```
┌─────────────────────────────────────────┐
│ Profile                              🔔  │
│                                          │
│ [Avatar]                                 │
│ rajeshwar63              [Edit ✏️]       │ ← editable username
│ rajeshwar63@gmail.com                    │ ← email (read-only)
│                                          │
│ ─────────────────────────────────────    │
│                                          │
│ BUSINESS                                 │
│ Sri Lakshmi Traders                      │
│ ZELTO-WBWXZ2NK  [Share]                 │ ← Zelto Code belongs to business
│ Owner                                    │ ← user's role
│ Ameerpet, Hyderabad                      │
│                                          │
│ [Edit Business Details →]                │
│ [Manage Members →]          (owner only) │
│                                          │
│ ─────────────────────────────────────    │
│                                          │
│ SETTINGS                                 │
│ Notifications                        →   │
│ Account                              →   │
│ Help & Support                       →   │
│                                          │
│ Privacy Policy · Terms of Service        │
│                                          │
│ Log out                                  │
└─────────────────────────────────────────┘
```

### Edit Username

```
Endpoint: PATCH /api/users/me
Body: { "username": "Rajeshwar Kumar" }

Validation:
- 2-50 characters
- Alphanumeric, spaces, dots, underscores
- No profanity filter needed for MVP
- No uniqueness constraint (display name, not handle)
```

### Edit Business Details (Owner/Admin only)

```
Endpoint: PATCH /api/businesses/:id
Body: { "name": "Sri Lakshmi Traders", "phone": "9876543210", "city": "Hyderabad", ... }

Authorization: Only users with role 'owner' or 'admin' for this business
```

### Manage Members Screen (Owner only)

```
┌─────────────────────────────────────────┐
│ ← Members                                │
│                                          │
│ Share your Zelto Code to invite members: │
│ ZELTO-WBWXZ2NK  [Copy] [Share]          │
│                                          │
│ ACTIVE MEMBERS                           │
│ 👤 Rajeshwar Kumar (You) — Owner         │
│ 👤 Suresh M — Member          [Remove]   │
│                                          │
│ PENDING REQUESTS                         │
│ 👤 priya.k@gmail.com                     │
│    Requested 2 hours ago                 │
│    [Approve]  [Reject]                   │
│                                          │
└─────────────────────────────────────────┘
```

---

## 6. API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP to email |
| POST | `/api/auth/verify-otp` | Verify OTP, return JWT |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me` | Get current user profile |
| PATCH | `/api/users/me` | Update username, phone, avatar |

### Businesses
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/businesses` | Create new business (during signup) |
| GET | `/api/businesses/:id` | Get business details |
| PATCH | `/api/businesses/:id` | Update business details (owner/admin) |
| GET | `/api/businesses/search?name=...&city=...` | Fuzzy search for dedup |
| GET | `/api/businesses/by-code/:zeltoCode` | Lookup business by Zelto Code |

### Members
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/businesses/:id/members` | List members of a business |
| DELETE | `/api/businesses/:id/members/:userId` | Remove a member (owner only) |
| PATCH | `/api/businesses/:id/members/:userId` | Change member role (owner only) |

### Join Requests
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/businesses/:id/join-requests` | Request to join a business |
| GET | `/api/businesses/:id/join-requests` | List pending requests (owner/admin) |
| PATCH | `/api/join-requests/:id` | Approve or reject (owner/admin) |

### Connections (updated — business-level)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/connections` | Send connection request (biz-to-biz) |
| GET | `/api/businesses/:id/connections` | List connections for a business |
| PATCH | `/api/connections/:id` | Accept/reject connection |

---

## 7. Zelto Code Generation

Generate unique, readable business codes:

```javascript
function generateZeltoCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `ZELTO-${code}`;
}

// Example output: ZELTO-WBWXZ2NK
// Always check uniqueness against DB before assigning
```

---

## 8. Authorization Middleware

```javascript
// Middleware: requireBusinessRole('owner', 'admin')
async function requireBusinessRole(...allowedRoles) {
  return async (req, res, next) => {
    const userId = req.user.id;
    const businessId = req.params.businessId || req.body.businessId;
    
    const member = await db.businessMembers.findOne({
      user_id: userId,
      business_id: businessId,
      status: 'active'
    });
    
    if (!member || !allowedRoles.includes(member.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    req.businessMember = member;
    next();
  };
}

// Usage:
app.patch('/api/businesses/:businessId', requireBusinessRole('owner', 'admin'), updateBusiness);
app.delete('/api/businesses/:businessId/members/:userId', requireBusinessRole('owner'), removeMember);
app.get('/api/businesses/:businessId/orders', requireBusinessRole('owner', 'admin', 'member'), listOrders);
```

---

## 9. Key Business Rules

### Visibility (MVP — Full Visibility)
- All members of a business can see ALL orders, connections, and activity for that business
- Only owner/admin can edit business details
- Only owner can manage members (approve/reject/remove)
- Any member can create orders and send connection requests on behalf of the business

### One User, One Business (MVP)
- A user can only belong to ONE business at a time
- To switch businesses, they must leave the current one first
- Post-MVP: allow users to belong to multiple businesses (e.g., a CA managing multiple clients)

### Business Deletion
- Not allowed in MVP. If a business has no active members, it becomes dormant but retains its history and trust score
- Owner transfer: Owner can promote an admin to owner before leaving

### Zelto Code Sharing
- The Zelto Code is shown on the business profile, not the user profile
- Share via: copy to clipboard, WhatsApp share, QR code (post-MVP)
- Anyone with the code can send a join request — still requires owner approval

---

## 10. Migration Strategy

### For Existing Users (who signed up before this change)
1. Existing user accounts remain intact
2. On first login after migration, show the "Set up your business" screen
3. Their current Zelto Code transfers to the new business entity
4. They automatically become the `owner` of that business
5. Their existing connections and orders are migrated to the new business entity

### Migration Script
```sql
-- Create businesses from existing user data
INSERT INTO businesses (id, name, zelto_code, city, created_at)
SELECT gen_random_uuid(), username, zelto_code, city, created_at
FROM users_old
WHERE zelto_code IS NOT NULL;

-- Create business_members for existing users
INSERT INTO business_members (user_id, business_id, role, status)
SELECT u.id, b.id, 'owner', 'active'
FROM users u
JOIN businesses b ON b.zelto_code = u.old_zelto_code;

-- Migrate connections from user-level to business-level
-- (update foreign keys from user_id to business_id)
```

---

## 11. Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trust lives at | Business level | Trust belongs to the entity, survives employee changes |
| Auth method | Email + OTP only | No DLT registration needed for MVP |
| Business creation | During signup (mandatory) | Business is core to Zelto, can't operate without one |
| Dedup method | Zelto Code join + fuzzy name matching | No GSTIN/PAN needed, works for small businesses |
| Mobile number role | Optional contact field (unverified) | Can't do SMS OTP without DLT |
| Order visibility | Full visibility for all members | Simple, builds internal trust, suits small teams |
| Username | Editable from profile | Initially set to email prefix |
| Member approval | Owner only | Keep it simple for MVP |
| Users per business | Multiple (owner + members) | Real businesses have multiple people |
| Businesses per user | One (MVP) | Simplifies architecture |

---

## 12. Implementation Priority

### Phase 1 — Core (Build First)
1. Updated database schema (users, businesses, business_members)
2. Signup flow with business creation
3. Fuzzy matching on business name + city
4. Join via Zelto Code
5. Profile screen with editable username
6. Business profile section on profile screen

### Phase 2 — Member Management
7. Join request flow (request → notify owner → approve/reject)
8. Manage Members screen
9. Role-based action permissions (owner vs member)

### Phase 3 — Migration & Polish
10. Migrate existing users to new schema
11. Update connections to business-to-business
12. Update orders to business-level with `created_by` tracking
13. Share Zelto Code via WhatsApp / copy link
