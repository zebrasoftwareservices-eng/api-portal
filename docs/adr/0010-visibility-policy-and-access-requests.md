# ADR 0010 — One visibility policy, access requests beside apps, keys issued on reveal

- Status: Proposed (accept by merging)
- Date: 2026-11-14
- Spec: 010-access-requests-and-visibility
- Builds on: [ADR 0008](0008-teams-own-apps.md) (teams own apps),
  [ADR 0009](0009-plans-map-to-kong-rate-limiting.md) (a subscription is an app on a plan)

## Context
Spec 010 adds four product visibility levels (Open, Hidden, Internal, Manual), plans that need an
admin's approval, plan changes that need approval, admin-created subscriptions whose key the
admin never sees, and revoking existing subscriptions when access gets stricter, with retries
when Kong fails. Specs 020 (search) and 021 (`/llms.txt`) must reuse the same visibility rule.
Three product questions are still open (who may subscribe to a Manual product, what happens to
Pending requests when settings change, what cancelling a Manual subscription sends), so the
design has to make those defaults cheap to change.

## Decision
1. **One policy module decides access.** `apps/server/src/access-policy.ts` exports a `Viewer`
   (`anonymous`, or a user id with `isAdmin` and team ids) and pure functions over loaded rows:
   `canSeeProduct`, `visibleProductIds` (a single SQL filter for lists), `canSeeApi` (an API in
   no product, or in at least one visible product), `canSelfSubscribe` and `canRequest`. Every
   catalog, product, API reference, subscribe, request and plan endpoint calls it; specs 020 and
   021 call `visibleProductIds` with the anonymous or signed-in viewer. Invisible is answered as
   `404 /problems/not-found`, identical to a missing row. Portal admins see everything.
   Manual-product rules (`canSelfSubscribe` is false) and the Pending-request rules live only
   here and in `access-requests.ts`, so changing a provisional default is one function.
2. **Access requests are their own table, not a state of `apps`.** A request is Pending before
   any app or Kong object exists. `access_requests` holds `kind` (`subscribe` or `plan-change`),
   the team, plan, optional app, reason, status and decision. Partial unique indexes enforce one
   Pending `subscribe` request per team and plan, and one Pending `plan-change` request per app,
   so concurrent submits return `409` from the database, not from a race-prone read.
3. **Approval and admin assignment provision access but issue no key.** They create the Kong
   consumer, ACL groups and plan limits (rolled back on failure, as in `createApp`) and an app
   with `key_issued = false`. A team Admin or Member reveals the key with the existing
   `POST /v1/apps/{appId}/credentials`, which issues it and returns it once. The portal never
   stores, encrypts or shows a key to anyone else, and Kong holds no credential until the team
   asks for one.
4. **Revocation is a stored state with a retry loop.** `apps.status` is `active`,
   `revoke-pending` or `revoked`; revoked apps stay in Postgres so the team and admin see them.
   Restricting a product or plan with "Revoke them" marks the affected apps `revoke-pending` in
   the transaction that saves the setting, then calls `adapter.deleteConsumer` per app
   (idempotent; a missing consumer counts as done). A conditional update
   (`… where status = 'revoke-pending' returning`) moves each to `revoked` and is the only place
   the revocation email is enqueued, with pg-boss `singletonKey` `revoke-mail:<appId>`, so an
   email is sent at most once. Failures are retried by a pg-boss `access-revoke` queue (singleton,
   retry with backoff) and by every gateway reconcile run, which also treats non-active apps as
   not desired.

## Consequences
- The adapter interface does not change; `deleteConsumer` already tolerates a missing consumer,
  so AWS (spec 017) gets revocation for free.
- `apps` gains `status`, `origin`, `key_issued`, `revoked_at` and `revoke_reason`; the team-name
  unique index becomes partial (`status <> 'revoked'`) so a team can reuse a revoked name.
- Every list and detail query that touches products or APIs must take a `Viewer`. Forgetting it
  leaks a product, so the server keeps one integration test per endpoint for an invisible product.
- A Pending `subscribe` request does not reserve its name; approval re-checks it and returns `409`
  if the team took the name meanwhile.

## Alternatives considered
- **Store the approved key encrypted until revealed.** Rejected: a second secret store, and the
  admin's approval response would hold a key-bearing row. Issuing on reveal needs nothing new.
- **An app row with status `pending` for each request.** Rejected: plan-change requests belong to
  an existing app, and Pending apps would need filtering out of every app, key and reconcile path.
- **A visibility check in each route.** Rejected by the spec: 020 and 021 must reuse one rule.
