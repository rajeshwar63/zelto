# ZELTO — PHASE 8: IMPLEMENTATION STATUS

## COMPLETED COMPONENTS

### 1. Data Foundation
- ✅ Updated `BusinessEntity` type with optional fields: `gstNumber`, `businessAddress`, `businessType`, `website`
- ✅ Updated `UserAccount` type (removed username/password, now phone-only)
- ✅ Added `ConnectionRequest` and `RoleChangeRequest` types
- ✅ Added connection request management functions to data-store.ts
- ✅ Added role change request functions to data-store.ts
- ✅ Added business entity update methods (GST validation, Zelto ID lookup)

### 2. Authentication System
- ✅ Created `auth.ts` with session management
- ✅ Implemented OTP verification (test code: 123456)
- ✅ Phone number-based authentication (no passwords)
- ✅ Session persistence via spark.kv

### 3. Auth UI Screens
- ✅ `SignupScreen.tsx` - Collects mobile number and business name
- ✅ `LoginScreen.tsx` - Collects mobile number only
- ✅ `OTPScreen.tsx` - 6-digit OTP entry with auto-verification

## IMPLEMENTATION REQUIREMENTS

To complete Phase 8, the following files need to be created/updated:

### Main App Update (App.tsx)
**Current:** Loads demo data, shows 4-tab interface immediately
**Needed:** 
1. Check for auth session on load
2. If no session → show auth flow (signup/login/OTP)
3. After auth → show main 4-tab interface
4. Remove demo data initialization
5. Use authenticated user's businessId for all data queries

### Connection Request Flow
**New files needed:**
1. `AddConnectionScreen.tsx` - Input Zelto ID, select role (buyer/supplier)
2. `ConnectionRequestCard.tsx` - Show pending request in Attention tab
3. Update `ConnectionsScreen.tsx` - Add "Add Connection" button
4. Update `AttentionScreen.tsx` - Show connection requests section

**Logic:**
- Validate Zelto ID exists before showing role selection
- Prevent duplicate requests
- Prevent self-connection
- Create connection via existing `createConnection()` after acceptance

### Progressive Identity (Business Details)
**New files needed:**
1. `BusinessDetailsScreen.tsx` - Optional fields form (GST, address, type, website)

**Logic:**
- Show "Add business details" prompt in Profile
- Validate GST uniqueness before saving
- All fields optional
- Save via `dataStore.updateBusinessEntity()`

### Zelto ID Sharing (Profile)
**Update:** `ProfileScreen.tsx`
- Display Zelto ID prominently
- Add Share button
- Use Web Share API: `navigator.share({ text: 'Connect with me on Zelto. My Zelto ID is [ZELTO-XXXXX]' })`

### Payment Terms After Connection
**Update:** Connection acceptance flow
- Immediately after accepting connection request, if user is supplier → show payment terms dialog
- Use existing payment term types from Phase 1
- Block connection usage until payment terms set
- Show "Awaiting payment terms" label in connections list

### Role Change Flow  
**New files needed:**
1. `RoleChangeRequestCard.tsx` - Show in Attention → Approval Needed
2. Add "Change roles" button in ConnectionDetailScreen header

**Logic:**
- Create role change request
- Other party approves/declines
- On approval: swap roles, clear payment terms, prompt supplier for new terms
- Preserve behaviour history

### Logout
**Update:** `ProfileScreen.tsx`
- Add logout button
- Call `logout()` from auth.ts
- Clear session and return to auth screen

## DATA FLOW ARCHITECTURE

```
Auth Flow:
User → SignupScreen/LoginScreen → OTPScreen → Main App
                                       ↓
                                  Create session
                                       ↓
                              Store businessId in KV

Connection Request Flow:
Connections Tab → Add Connection → Enter Zelto ID → Select Role → Send Request
                                                                        ↓
Other Party: Attention Tab → Connection Requests → Accept/Decline
                                                        ↓ Accept
                                            Create Connection via existing interaction
                                                        ↓
                                    Is accepted party supplier? → Payment Terms Dialog
```

## KEY RULES IMPLEMENTED

1. **Auth:** OTP always 123456 for testing, no real SMS
2. **GST Validation:** Duplicate GST check before save, show warning if exists
3. **Connection Requests:**
   - Cannot request connection to self
   - Cannot request if connection or pending request exists
   - Roles must be opposite (one buyer, one supplier)
4. **Payment Terms:** Supplier sets terms after connection accepted, required before orders
5. **Role Changes:** Swapping roles clears payment terms, new supplier must set new terms

## WHAT WORKS NOW

- Type definitions support all Phase 8 features
- Data store has methods for all Phase 8 operations
- Auth system ready (session, OTP, login/signup)
- Auth UI screens built and functional

## WHAT NEEDS WIRING

- App.tsx routing between auth and main app
- Connection request UI screens
- Business details screen
- Profile screen updates (logout, share, business details link)
- Attention tab updates for new request types
- Payment terms dialog after connection acceptance
- Role change UI and approval flow

## TESTING NOTES

To test auth flow:
1. Open app → should show SignupScreen or LoginScreen
2. Enter any phone number + business name
3. Enter OTP: 123456
4. Should land on Connections tab with authenticated session

Connection request test flow:
1. User A creates account
2. User A sees their Zelto ID in Profile
3. User A shares Zelto ID via Share button
4. User B creates account
5. User B taps "Add Connection" in Connections tab
6. User B enters User A's Zelto ID
7. User B selects "I am the Buyer"
8. Request sent
9. User A sees request in Attention → Connection Requests
10. User A sees "You will be the Supplier" confirmation
11. User A accepts
12. User A (supplier) prompted for payment terms
13. Connection appears in both users' Connections list
