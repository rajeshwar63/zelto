# Zelto — Agent instructions

## Query discipline (HARD RULE)

**No screen's initial data load may loop over connections or orders and fire
per-item queries from the client.** All aggregation happens either in a batch
fetcher (`dataStore.get<X>ByConnectionIds`, `getOrdersWithPaymentStateByBusinessId`,
etc.) or in a Postgres RPC. Client-side `for (const conn of connections) { await ... }`
on a render path is forbidden.

If a new feature ever needs per-connection data aggregated across all
connections, write a Postgres RPC or a batch fetcher for it. Do not ship
without one.

Violations that caused the April 2026 tab-load regression:
- `ConnectionsScreen.loadConnections` called `getOrdersWithPaymentStateByConnectionId`
  inside a `Promise.all(rawConnections.map(...))` — fixed by adding
  `getOrdersWithPaymentStateByConnectionIds` batch fetcher.
- `useBusinessOverviewData` awaited `computeTrustScore` on the critical path.
  It loops connections and loops orders inside those — fixed by reading the
  cached `business_entities.credibility_score` on the initial paint and
  refreshing it in the background after paint.
- `DashboardScreen` fired all four intelligence-engine queries in `Promise.all`
  on mount. Each loops connections. Fixed by deferring 500ms after first paint
  and running them sequentially (they hit the same Supabase connection pool).

## Tiered database work

- **Free tier** caps API throughput at ~60 req/s. Assume we're moving to Pro;
  write code as if we already had it.
- RLS policies MUST wrap `auth.uid()` / `auth.jwt()` in `(select ...)` so
  Postgres evaluates them once per query instead of once per row. See
  `supabase/migrations/20260417000003_fix_rls_auth_initplan.sql`.
- Every foreign key should have a covering index. Check
  `supabase/migrations/20260417000001_add_missing_fk_indexes.sql` before
  adding new FKs.
