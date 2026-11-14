---
id: 010
title: Access requests and catalog visibility
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-14
linear: JSO-238
---

# 010 — Access requests and catalog visibility

## Summary
Admins can put a plan behind approval and give each product one of four visibility levels (Open,
Hidden, Internal, Manual), so developers request access with a reason and Kong only holds a
credential for access an admin allowed.

## Problem
Since spec 009, every plan is self-service and every product is listed for everyone. A platform
team can't offer a partner or internal tier through the portal: anyone who finds the product gets
a key straight away, and anyone, even signed out, can see that the product exists. Today they keep
those APIs out of the portal and hand out keys by hand, which is the work the portal is meant to
remove.

It is solved when an admin can put a plan behind approval and a product behind sign-in, behind a
list of named teams, or behind admin-only assignment, and Kong only ever holds a credential for
access the admin allowed (Sprint 4 demo step 3 in `docs/roadmap.md`: request a partner plan →
admin approves → key works; a Hidden product disappears when signed out).

## Users
- **API consumer (developer)**: requests access to an approval plan for their team, follows the
  request to a key or a reason, and reveals keys for products an admin assigned to the team.
- **Portal admin**: sets which plans need approval and who can see each product, works the queue
  of pending requests, assigns Manual products to teams, and decides what happens to existing
  subscriptions when access gets stricter.

## User stories
- As a portal admin, I want to mark a plan as "requires approval", so that I decide who gets a
  key for that tier.
- As a developer, I want to request access to an approval plan with a reason, so that the admin
  knows why my team needs it.
- As a portal admin, I want one queue of pending requests where I approve with an optional note
  or reject with a required note, so that I can answer requests without leaving the portal.
- As a developer, I want an email and a visible status, with the admin's note, when my request is
  decided, so that I get my key, or know why not, without asking anyone.
- As a developer, I want to move my team's subscription to an approval plan without losing the
  key that works today, so that our traffic keeps flowing while the admin decides.
- As a portal admin, I want to set a product's visibility to Open, Hidden, Internal or Manual, so
  that unreleased, internal or partner-only products aren't shown to people who shouldn't see them.
- As a portal admin, I want to give a team access to a Manual product without ever seeing its
  key, so that I can onboard a partner without handling their secret.
- As a developer on a team with access to an Internal or Manual product, I want to see and use it
  like any other product, so that private access doesn't need a separate process.
- As a portal admin, I want to choose, when I restrict a product or a plan, whether existing
  subscriptions keep working or are revoked, so that tightening access never breaks or keeps
  traffic by surprise.

## Acceptance criteria
Visibility levels used below: **Open** (listed for everyone, even signed out), **Hidden** (listed
for signed-in developers), **Internal** (listed and self-service only for teams the admin names),
**Manual** (listed to no one; the admin creates the subscription for a team). A product a viewer
can't see behaves, for that viewer, exactly like a product that doesn't exist: absent from the
catalog, its product and API reference pages return the not-found page with `404`, and its
subscribe, request and plan endpoints return `404` problem+json.

1. **Given** a plan "Partner" marked "requires approval" on a product the viewer can see, and a
   signed-in team Admin or Member (spec 008) **When** they choose "Partner", name the
   subscription, enter a reason and submit **Then** the request is listed under their team as
   Pending, no key is shown, Kong holds no credential for it, and it appears in the admin's
   request queue with product, plan, team, requester, reason and submitted time.
2. **Given** a developer requesting an approval plan **When** the reason is empty or longer than
   the maximum the tech lead sets, or their team already has a Pending request for that plan
   **Then** the server returns `400` (bad reason) or `409` (duplicate) problem+json, the dialog
   shows the message, and no request is created.
3. **Given** a Pending request **When** an admin approves it, with or without text in the field
   labelled "Note to the requester (included in the email)" **Then** the request becomes
   Approved, the requester receives an approval email (spec 007 mail transport) that contains the
   note when one was given, the note shows on the request in the portal, a team Admin or Member
   can reveal the key once, and a call through Kong with that key to each API in the plan returns
   the upstream's response within the plan's limits.
4. **Given** a Pending request **When** an admin rejects it with a note **Then** the request
   becomes Rejected, Kong holds no credential for it, the requester receives an email containing
   the note, the team sees the request as Rejected with the note, and they can submit a new
   request for the same plan; **and when** the admin rejects with an empty note **Then** the
   server returns `400` problem+json, the form shows the message, and the request stays Pending.
5. **Given** a signed-in developer who is not a portal admin **When** they call the approve,
   reject, product-visibility, team-assignment or Manual-subscription endpoints **Then** the
   server returns `403` problem+json and nothing changes in the portal or Kong; **and given** a
   Read-only team member **When** they submit a request or try to reveal a key **Then** the
   server returns `403` problem+json.
6. **Given** Kong is unreachable **When** an admin approves a request **Then** the portal shows an
   error that says the gateway is unavailable, the server returns problem+json, the request stays
   Pending, no email is sent and no key exists; approving again once Kong is back succeeds.
7. **Given** a team with an active subscription on self-service plan "Basic" **When** a team Admin
   or Member changes it (spec 009 plan change) to approval plan "Partner" with a reason **Then** a
   Pending request tied to that subscription appears in the admin queue, the subscription stays on
   "Basic" and its key keeps working at Basic's limits; a second plan-change request for the same
   subscription while one is Pending returns `409` problem+json.
8. **Given** the Pending plan-change request from criterion 7 **When** an admin approves it
   **Then** the subscription moves to "Partner" with the same key, and a call through Kong with
   that key is held to Partner's limits; **when** an admin rejects it instead **Then** the
   subscription stays on "Basic" with the same working key, the team sees the note, and they can
   request "Partner" again. **And given** a subscription on "Partner" **When** the team changes it
   to self-service "Basic" **Then** the change applies at once with no request.
9. **Given** a product with visibility Open (the default, and the value every product from spec
   009 keeps after upgrade) **When** a signed-out visitor opens the catalog **Then** it is listed
   exactly as before this spec; **and given** a product with visibility Hidden **When** a
   signed-out visitor opens the catalog, the product's page or one of its API reference pages
   **Then** it behaves as not existing (see above), while a signed-in developer sees it listed and
   can subscribe.
10. **Given** an Internal product whose admin named team A, with a self-service plan and a
    "requires approval" plan **When** a member of team A, a member of team B and a signed-out
    visitor each open the catalog and the product's URL **Then** team A's member sees it, can
    subscribe to the self-service plan and request the approval plan as in criterion 1, and for
    the other two it behaves as not existing.
11. **Given** a Manual product **When** an admin creates a subscription on one of its plans for
    team A **Then** the admin's screen and the server's response contain no key, team A's Admins
    and Members receive an email, a team A Admin or Member can reveal the key once in the portal
    and a call through Kong with it succeeds, team A now sees the product and its API reference,
    and for team B and a signed-out visitor it still behaves as not existing.
12. **Given** a product with active subscriptions held by 3 teams **When** an admin makes it more
    restricted (Open→Hidden/Internal/Manual, Hidden→Internal/Manual, or removes a team from
    Internal) or turns on "requires approval" for a plan with active subscriptions **Then** a
    confirmation names how many teams have active subscriptions and offers "Keep them working"
    (selected by default) or "Revoke them"; with Keep, every existing key still gets the upstream's
    response; with Revoke, Kong no longer holds those credentials (calls with them return `401`),
    the subscriptions show as revoked, and each affected team's Admins and Members receive an
    email. A change that affects no active subscription shows no confirmation.
13. **Given** Kong is unreachable, or fails for some credentials **When** an admin confirms
    "Revoke them" **Then** the new visibility or approval setting is saved, the admin sees which
    revocations are still pending and that they are being retried, those subscriptions show
    "Revoke pending" in the admin view, and no revocation email is sent for them yet; once Kong is
    reachable the retry deletes the remaining credentials (calls with them return `401`), sends
    the emails, and the pending notice clears. Repeating the retry never creates or deletes
    anything twice.

The criteria count is 13, above the usual 10, because four visibility levels, plan-change
approvals and revoke-on-restrict were all decided into this spec.

## Out of scope
- **A sandbox key straight away, then production access after approval** (optional per plan in
  JSO-238). Cut so this stays one pull request: it needs two keys per subscription and a way to
  tell sandbox from production traffic in Kong. Follow-up spec, built after this one.
- **A global or per-product setting for what happens to existing subscriptions.** The admin
  decides each time, in the confirmation (criterion 12).
- **Approval steps with several approvers, automatic approval rules, and request expiry.**
  One admin decision proves the value.
- **Withdrawing a pending request, and reopening a rejected one.** The team submits a new request.
- **Emails to admins when a request arrives.** Admins see the queue; notifying them is a follow-up.
- **Per-API visibility.** Visibility is per product, not per API.
- **Search results and `/llms.txt` themselves.** Specs 020 and 021 apply this spec's visibility
  check (see Constraints); this spec builds no search or `/llms.txt` output.
- **Portal staff roles** (which admins may approve). Every portal admin may approve until spec 015.
- **Audit log of approvals, assignments, visibility changes and revocations** (spec 015).
- **Plans and visibility on AWS API Gateway** (spec 017).

## Constraints for the technical design
- Visibility is one shared server-side check, "can this viewer see this product?", used by the
  catalog, product and API reference pages, and every subscribe, request and plan endpoint. Specs
  020 (search) and 021 (`/llms.txt`) reuse it rather than writing their own rules.
- `/llms.txt` is anonymous, so it lists Open products only.
- Revocation uses the same idempotent, retried and reconciled approach as other gateway calls;
  its pending state is stored and shown, never only logged.

## Open questions
- [x] Internal vs Manual — Elango: four levels, all in this spec. Open (everyone, even signed
  out), Hidden (signed-in developers), Internal (listed and self-service only for named teams),
  Manual (listed to no one; the admin creates the subscription for a team, never sees the key; the
  team is emailed and an Admin or Member reveals the key once; once assigned, the team sees the
  product and its docs). Internal and Manual products may still have approval plans.
- [x] Existing subscriptions when access gets stricter — Elango: decided at the moment of change,
  with no global or per-product setting. The confirmation names the number of teams with active
  subscriptions and offers "Keep them working" (default) or "Revoke them"; revoke is retried,
  emails each team, and partial failure is visible (criteria 12–13).
- [x] Plan change into an approval plan — Elango: creates a request tied to the subscription; the
  old plan and same key keep working while Pending; approved moves the subscription with the same
  key; rejected stays put with the note and may ask again; one Pending request per subscription
  (`409`); moving off an approval plan needs no approval (criteria 7–8).
- [x] Approval note — Elango: shown to the developer in the approval email and on the request;
  the field is labelled "Note to the requester (included in the email)" (criterion 3).
- [x] Search (020) and `/llms.txt` (021) — Elango accepted the proposal: one shared visibility
  check, `/llms.txt` lists Open products only (Constraints).
- [ ] Once a Manual product is assigned to team A, can team A create more subscriptions on it
  themselves, or does every subscription come from the admin? The criteria assume neither. — Elango
- [ ] What happens to a Pending request when the admin turns off "requires approval" for its
  plan, or the product becomes invisible to the requesting team? Proposed: turning approval off
  leaves Pending requests for the admin to decide; losing visibility rejects them with an
  automatic note. — Elango
- [ ] Does cancelling an admin-created Manual subscription (spec 009 cancel) count as revoking it,
  with the same email? — Elango
- [ ] Maximum length of a request reason and a decision note. — tech lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
ADR: [0010 — one visibility policy, access requests beside apps, keys issued on reveal](../adr/0010-visibility-policy-and-access-requests.md).
Contract: `apps/server/openapi.yaml` (spec 010 sections). No new dependency.

**Decided by the tech lead (open question 4):** a request reason is 1–1000 characters and a
decision note 0–1000 (reject needs 1–1000), both trimmed before checking, stored as plain text
and always rendered escaped, in the portal and the email.

**Provisional, pending Elango** (each lives in one function so changing it is a small diff):
- Manual subscriptions are admin-created only: `canSelfSubscribe()` is false for `manual`, so
  `createApp`, `createAccessRequest` and `changeAppPlan` on a Manual product answer 403
  `/problems/admin-assigned-only`, and `ProductDetail.selfService` is false.
- Turning "requires approval" off leaves Pending requests for the admin (`updatePlan` does nothing
  to them).
- Losing visibility auto-rejects the team's Pending requests for that product with the system
  note "This product is no longer available to your team." and emails the requester
  (`closeInvisibleRequests()` in `access-requests.ts`, called by `updateProductAccess`).
- Cancelling an `origin: admin` subscription (spec 009 `DELETE /v1/apps/{appId}`) sends the
  team the same `subscription-revoked` email as a revoke.

### Components
- `packages/db` — schema and one migration (below).
- `apps/server`
  - `access-policy.ts` (new): `Viewer`, `loadViewer(req)`, `canSeeProduct`, `visibleProductIds`
    (SQL condition for lists), `canSeeApi`, `canSelfSubscribe`, `requiresConfirmation` /
    `affectedSubscriptions(product|plan, before, after)`. Pure functions plus one query helper;
    unit-tested on their own. Specs 020/021 import it.
  - `catalog.ts`, `products.ts`, `versions.ts`, `changes.ts`, `proxy.ts` (try-it target check):
    take the viewer and filter or 404 through the policy. The product, API, OpenAPI document,
    version and changelog endpoints answer 404 for an invisible product or an API only in
    invisible products. Catalog/product GETs accept an optional session (admins see all).
  - `apps.ts`: `createApp` (visibility → 404, approval → 409, Manual → 403), `changeAppPlan`
    (approval → 202 + request, `reason`), `deleteApp` (revoked/revoke-pending, closes Pending
    plan-change with a system note, Manual email), `createCredential` (sets `key_issued`,
    refuses non-active apps), `App` mapping (`status`, `origin`, `keyIssued`, `pendingRequest`).
    Extract the Kong provisioning half of `createApp` (consumer + grants + limits, rollback)
    into `provisionApp()` so approval and admin assignment reuse it without issuing a key; reuse
    the existing plan-change Kong routine for plan-change approval.
  - `access-requests.ts` (new): developer list/create, admin queue, approve, reject,
    `closeInvisibleRequests()`.
  - `product-access.ts` (new): `GET/PUT /v1/admin/products/{id}/access`, `GET /v1/admin/teams`,
    `POST /v1/admin/subscriptions`; `products.ts` `updatePlan` gains `requiresApproval` and the
    same confirmation flow.
  - `revocation.ts` (new): `revokeApps(appIds)` and the `access-revoke` pg-boss worker; wired in
    `startup.ts` (`createQueue('access-revoke', { policy: 'singleton' })`, retryLimit 10,
    retryBackoff true). `reconcile.ts` calls `revokeApps` for every `revoke-pending` app and
    treats non-`active` apps as not desired (delete their consumer, never re-grant).
  - `mail/templates.ts`, `mail/queue.ts`: templates `access-approved`, `access-rejected`,
    `subscription-assigned`, `subscription-revoked`. Payloads carry ids
    (`{ template, requestId }`, `{ template, appId }`); the worker loads rows and recipients
    (requester for decisions; the team's `admin` and `member` users for assigned/revoked), so a
    retried job renders current data and no secret ever enters a job.
- `packages/sdk` — regenerate from the contract.
- `apps/portal`
  - Catalog, product page, API reference pages: no change in fetching (already `no-store` with
    the cookie); render `notFound()` on 404 for every product/API fetch.
  - Product page plan table: "Request access" for `requiresApproval` plans; no subscribe for
    `selfService: false`.
  - Request dialog (name, reason with 1000-char counter) → `createAccessRequest`; plan-change
    dialog gains a reason field when the target requires approval and shows the 202 Pending
    result.
  - Team dashboard: "Requests" list (status, note, plan, submitted); app page: status badge
    (`revoke-pending`, `revoked`), Pending plan-change banner, "Reveal key" while
    `keyIssued` is false (calls `createCredential`, shows the existing one-time key dialog;
    hidden for `read-only`).
  - Admin: `/admin/requests` queue (approve with "Note to the requester (included in the
    email)", reject with a required note; gateway-unavailable error keeps the row); product
    admin page gains an Access panel (visibility radio, team picker via `listAdminTeams`,
    confirmation dialog on `/problems/confirmation-required` with "Keep them working" default /
    "Revoke them", revoke-pending list with a "being retried" notice); plan form gains
    "Requires approval" with the same confirmation; "Assign to a team" on Manual products →
    `createAdminSubscription`.
  - Demo fixtures: every product `visibility: 'open'`, plans `requiresApproval: false`.

### API contract
All in `apps/server/openapi.yaml`; problem types are new unless noted.

| Operation | Change |
| --- | --- |
| `GET /v1/products`, `GET /v1/products/{slug}`, `GET /v1/apis*` | Optional session; filtered/404 by `access-policy`. `ProductSummary.visibility`, `ProductDetail.selfService`, `Plan.requiresApproval`. |
| `POST /v1/apps` | 404 invisible product; 409 `/problems/approval-required`; 403 `/problems/admin-assigned-only`. |
| `PUT /v1/apps/{id}/plan` | `reason` (1–1000). Approval plan → **202** `AccessRequest`; 409 `/problems/request-pending`, `/problems/app-revoked`; 403 `admin-assigned-only`. |
| `DELETE /v1/apps/{id}` | 409 `/problems/revoke-pending`; deletes a revoked app without Kong. |
| `POST /v1/apps/{id}/credentials` | Reveals the first key of approved/admin-created apps; 409 `/problems/app-revoked`. |
| `GET/POST /v1/access-requests` | Team list; create (`planId`, `teamId`, `name`, `reason`, `description`). 400 reason, 403 role/verify/Manual, 404, 409 `request-pending` / `approval-not-required` / `app-name-taken`. |
| `GET /v1/admin/access-requests` | Queue, `status` default `pending`, oldest first. |
| `POST /v1/admin/access-requests/{id}/approve` | Optional `note`. 409 `/problems/request-decided`, `app-name-taken`; 502/503 keep it Pending. |
| `POST /v1/admin/access-requests/{id}/reject` | Required `note`; 400 blank; 409 `request-decided`. |
| `GET/PUT /v1/admin/products/{id}/access` | `visibility`, `teamIds` (internal only), `existingSubscriptions` `keep`/`revoke`. 409 `/problems/confirmation-required` with `affectedTeams`, `affectedSubscriptions`. Response `ProductAccess` with `revocation.{revoked,pending}`. |
| `PUT /v1/admin/products/{id}/plans/{planId}` | `requiresApproval`, `existingSubscriptions`; same 409 confirmation. |
| `GET /v1/admin/teams` | Team picker (`q`, `limit`), `ownerEmail` for personal teams. |
| `POST /v1/admin/subscriptions` | `planId`, `teamId`, `name`; 201 `App` with no key; emails the team. |

Every admin endpoint is 403 `/problems/forbidden` for non-admins (existing `requireAdmin`), with
the check before any read or write (AC 5). Ordering on developer endpoints: session (401) →
team membership (404) → role (403) → visibility (404) → body (400) → state (409) → gateway.
"Affected" subscriptions (AC 12) = `active` apps on the product (or plan) whose team isn't named
by the new setting, excluding `origin: admin`. For Open→Hidden that is every active
subscription, matching AC 12's wording.

### Data model (one migration, generated with drizzle-kit)
- `products.visibility text not null default 'open'`, check in (`open`,`hidden`,`internal`,
  `manual`). Existing rows become `open` (AC 9).
- `product_teams (product_id → products cascade, team_id → teams cascade, created_at)`, PK both.
  Rows exist only while `visibility = 'internal'`; the PUT replaces them in its transaction.
- `plans.requires_approval boolean not null default false`.
- `apps.status text not null default 'active'` check (`active`,`revoke-pending`,`revoked`);
  `apps.origin text not null default 'self'` check (`self`,`request`,`admin`);
  `apps.key_issued boolean not null default true` (existing apps have keys; new
  `request`/`admin` apps insert false; `createCredential` sets true); `apps.revoked_at`;
  `apps.revoke_reason text` (`visibility`, `approval`). Replace `app_team_name_unique` with a
  partial unique index `where status <> 'revoked'`. Index `(status) where status = 'revoke-pending'`.
- `access_requests`: `id uuid pk`, `kind text` check (`subscribe`,`plan-change`), `team_id → teams
  restrict`, `plan_id → plans restrict`, `from_plan_id → plans` (plan-change), `app_id → apps set
  null` (plan-change: set at create; subscribe: set on approve), `name text` (1–80),
  `description text`, `reason text not null` check `length between 1 and 1000`, `status text`
  check (`pending`,`approved`,`rejected`), `requested_by → user set null`, `decided_by → user set
  null` (null + `decided_at` set = system), `decision_note text` check `length <= 1000`,
  `submitted_at`, `decided_at`. Partial unique indexes: `(team_id, plan_id) where status =
  'pending' and kind = 'subscribe'`; `(app_id) where status = 'pending' and kind = 'plan-change'`.
  Index `(status, submitted_at)` for the queue, `(team_id, submitted_at desc)` for the team list.
  A `23505` on either partial index maps to 409 `/problems/request-pending`.

### Adapter calls (Kong; no adapter interface change)
| Action | Calls | Failure |
| --- | --- | --- |
| Create request, reject, plan-change request | none | — |
| Approve `subscribe` / admin subscription | `ensureConsumer`, `grantAccess` per plan API, `applyPlanLimits` — no `issueCredential` | Roll back with `deleteConsumer`; nothing stored; 502/503; request stays Pending; no email (AC 6). Retry safe: consumer name is `portal-app-<appId>` and the app id is generated per attempt, the rollback removes the earlier attempt. |
| Approve `plan-change` | Existing plan-change routine (`applyPlanLimits`, `grantAccess`/`revokeAccess`) | Existing compensation puts the old plan back; request stays Pending. |
| Reveal key | Existing `createCredential` | Existing 502/503. |
| Revoke (restrict, `revoke`) | `deleteConsumer` per app (404 tolerated) | App stays `revoke-pending`; `access-revoke` job retries with backoff; reconcile retries every 5 min. Email enqueued only on the `revoke-pending → revoked` transition (`singletonKey revoke-mail:<appId>`). |
| Cancel (spec 009) | unchanged `deleteConsumer` | unchanged |

Every created Kong object keeps the existing portal tags (instance id + app id).
Reconcile change: an owned consumer whose app is missing **or not `active`** is deleted, and the
desired-state loop skips non-active apps, so a revoked key can never come back.

### Risks and how to test them
- **Leaking an invisible product** through one forgotten endpoint (APIs, OpenAPI JSON, versions,
  changelog, try-it, product page). Test: one integration table test that, for a Hidden,
  Internal and Manual product, calls every product/API/plan/subscribe/request endpoint as
  anonymous, outsider team and insider team and asserts 404 vs 200, plus a Playwright check of
  the 404 page.
- **Double decision / double email** when two admins click at once. Test: two concurrent
  approves → one 200, one 409 `request-decided`; one email.
- **Approval while Kong is down** (AC 6). Test with Testcontainers Kong stopped: 503, request
  Pending, no consumer, no mail job; start Kong, approve → 200.
- **Revoke partial failure and replay** (AC 13). Unit-test `revokeApps` with a fake adapter that
  fails for one app; integration with Kong stopped mid-way: setting saved, `revocation.pending`
  > 0, no email; restart Kong, run the job twice → keys 401, exactly one email per team.
- **Reconcile resurrecting revoked access.** Test: revoke, then run reconcile → consumer absent.
- **Name collision on approval.** Test: team creates an app named like the Pending request →
  approve 409 `app-name-taken`, request still Pending.
- **Upgrade from spec 009** (AC 9). Migration test: existing products `open`, plans
  `requires_approval = false`, apps `active` / `self` / `key_issued = true`; quickstart smoke.
- **Quickstart.** Seed data stays Open and self-service; `docker compose up` path unchanged.

### Tasks
- [x] [backend] Schema + migration: `products.visibility`, `product_teams`, `plans.requires_approval`, `apps.status/origin/key_issued/revoked_at/revoke_reason`, partial name index, `access_requests` with partial unique indexes; migration test for upgraded rows (AC 9)
- [x] [backend] `access-policy.ts` with unit tests; apply it to products, APIs, OpenAPI documents, versions, changelog and try-it target (AC 9–11)
- [x] [backend] `createApp` / `changeAppPlan` / `deleteApp` / `createCredential` changes: approval-required, admin-assigned-only, 202 plan-change request, revoke states, `key_issued`, Pending plan-change closed on cancel (AC 2, 7, 8)
- [x] [backend] Access requests: developer list/create, admin queue, approve (provisionApp without key; plan-change via existing routine; row lock), reject (AC 1–6, 8)
- [x] [backend] Product access + plan `requiresApproval`: confirmation-required flow, named teams, `closeInvisibleRequests`, `GET /v1/admin/teams`, `POST /v1/admin/subscriptions` (AC 10–12)
- [x] [backend] Revocation: `revokeApps`, `access-revoke` pg-boss queue with backoff, reconcile skips/deletes non-active apps, once-only revoke email (AC 12–13)
- [x] [backend] Mail templates and id-based payloads: access-approved (with note), access-rejected (with note), subscription-assigned, subscription-revoked; regenerate `packages/sdk`
- [x] [frontend] Product page: Request access dialog (name, reason counter, 400/409 messages), no subscribe for `selfService: false`, `notFound()` on 404 for product and API pages (AC 1, 2, 9–11)
- [x] [frontend] Team views: Requests list with status and note, app status badges, Pending plan-change banner, plan-change dialog reason + 202 result, Reveal key while `keyIssued` is false (AC 3, 4, 7, 8, 11)
- [x] [frontend] Admin request queue with approve note ("Note to the requester (included in the email)") and required reject note; gateway-unavailable error (AC 3, 4, 6)
- [x] [frontend] Admin product Access panel, plan "Requires approval" toggle, Keep/Revoke confirmation, revoke-pending notice, Assign to a team; demo fixtures stay Open (AC 10–13)
- [x] [qa] Integration: visibility matrix over every product/API/plan endpoint (anonymous, outsider, insider, admin), 403 matrix for admin endpoints and read-only (AC 5, 9–11)
- [x] [qa] Integration with real Kong: approve → key works within plan limits; reject; Kong down on approve; plan-change keep key and limits; concurrent approve (AC 1–4, 6–8)
- [x] [qa] Integration with real Kong: Manual assignment, keep vs revoke (401 after revoke), partial failure + retry idempotence + one email per team, reconcile doesn't resurrect (AC 11–13)
- [ ] [qa] Playwright e2e: Sprint 4 demo step 3 (request Partner → admin approves → reveal key → call works; Hidden product 404 when signed out); quickstart smoke
- [ ] [frontend] Fix: Invisible product and changelog pages return HTTP 200 instead of 404

## UX  _(ui-designer)_
Design: [docs/design/010-access-requests-and-visibility.md](../design/010-access-requests-and-visibility.md). No new tokens.

- **Developer**: the plan table labels each plan "Instant key" (**Subscribe**) or "Requires approval" (**Request access**). The request dialog takes team, name and a reason with a 1000-character counter. Requests show on the team dashboard as Pending, Approved or Rejected with the admin's note. An approved or admin-assigned subscription shows a "Your key is ready" card with **Reveal key** (not shown to Read-only members). Pending plan changes show a banner saying the current key keeps working.
- **Admin**: `/admin/requests` is a card queue, oldest first, with a pending count in the nav. Approve has the optional "Note to the requester (included in the email)", Reject needs a note, and a gateway error keeps the request Pending inside the dialog. The product page gets an Access panel (four visibility radios, a team combobox for Internal, Assign to a team for Manual) and a Keep/Revoke confirmation that defaults to "Keep them working". Revoke-pending subscriptions show a "retrying automatically" notice.
- An invisible product is the standard 404 page, never a locked card. Admins alone see Hidden/Internal/Manual badges in the catalog. New components: `StatusBadge`, `CountedTextarea`, `VisibilityBadge`, `TeamCombobox`. Exact copy, email text, every state, the keyboard path and the 375/1280px layouts are in the design file.

## Build notes  _(backend-developer, frontend-developer)_

### Backend — 2026-11-14
Implemented all backend tasks: the generated `0007_parallel_ravenous` migration, shared visibility policy across every public API surface, request/decision endpoints, admin access settings and assignment, deferred key issuance, plan-change requests, revocation retries/reconcile and SDK regeneration. Access mutations share an advisory transaction lock so approvals, cancellation and restrictions cannot cross; mail and revocation jobs are inserted into pg-boss in the same transaction as their state changes, with id-only access mail payloads and current-row recipient loading. Admin-origin cancellations retain a revoked app record for the id-based revocation email; all revoked apps reject key issuance and reconciliation never restores their consumers.

Validation: `@portal/db`, `@portal/server` and `@portal/sdk` lint and typecheck pass; database tests **9/9** and server tests **271/271** pass, and SDK tests exit successfully with no test files. Added migration-upgrade/index tests, policy tests, request/approval/rejection/concurrency/failure/plan-change/revocation tests, and real pg-boss/Postgres tests for atomic job rollback and current recipient lookup. Docker-dependent checks required sandbox escalation; no workspace suite, browser or quickstart was run. The ownership guard includes prior design-stage files and the frontend owner's files; Elango explicitly authorized a scoped backend-only commit and feature-branch push despite that guard limitation.

- Frontend: implemented approval requests, team request history, subscription reveal/revocation states, the admin request queue, and product visibility/assignment with Keep/Revoke confirmation. Existing product/API 404 handling is retained and changelog 404 handling is completed; the API-only demo remains unchanged. Portal lint/typecheck and all 329 package tests pass; generated SDK lint/typecheck/test pass (no SDK test files). The socket-based ingress tests require an escalated run because sandbox listening sockets fail with EPERM.

## Test report  _(qa-tester)_
Application commit tested: `005cd7d4e2b8a08c97f13b6ee05f914d5d8e4d3c`, with the QA tests in this worktree. Portal: `http://localhost:3019` (`node scripts/worktree-compose.mjs env`).

Test files below: **server** = `apps/server/src/access-requests.test.ts`; **browser** = `apps/portal/e2e/access-requests.test.ts`; **UI** = `apps/portal/components/access-flows.test.tsx`; **mail** = `apps/server/src/mail/access-mail.test.ts`.

| Criterion | Automated test file / case | Result |
| --- | --- | --- |
| 1 — Pending request, queue metadata, no credential | server: creates request without Kong; browser: request form → queue → no consumer change | Pass |
| 2 — Invalid reason and duplicate Pending | server: blank/whitespace/1001-character reasons, pending uniqueness; browser: validation and 409; UI: duplicate message preserves fields | Pass |
| 3 — Approval note, email, reveal and live limits | server: concurrent decisions and deferred reveal; browser: admin approves → Mailpit note → one-time reveal → Kong 200/429; mail: recipient loading | Pass |
| 4 — Required rejection note and resubmit | server: rejects blank note, trims note and allows a new subscription request; browser: blank 400 → reject → email note → repeat plan request; UI: rejection validation | Pass |
| 5 — Admin-only endpoints and team roles | server: admin route 403 matrix, read-only request/reveal 403, expired session 401; UI: read-only cannot reveal | Pass |
| 6 — Unreachable Kong approval | server: rollback, Pending, no mail, retry; browser: stop real Kong → 503 problem, Pending, no approval email → restart → approve | Pass |
| 7 — Pending plan change preserves Basic and key | server: Pending without adapter mutation; browser: Basic retained, original key 200, duplicate 409 | Pass |
| 8 — Approve/reject plan change and immediate downgrade | server: same credential, limits/grants, rejection; browser: Partner→Basic immediate, rejection/retry/approval with same key and Partner plugin + live limit | Pass |
| 9 — Open upgrade; Hidden audience and page 404 | `packages/db/src/access-migration.test.ts`; server: four-level visibility matrix; browser: Hidden anonymous page | **Fail**: product and changelog pages render not-found with HTTP 200; JSON/reference/version endpoints return 404 |
| 10 — Internal named team and outsider | server: anonymous/outsider/insider/admin matrix, insider Basic subscription + Partner request and excluded plan change 404 | API pass; page-status regression remains under the visibility bug |
| 11 — Manual assignment, email, reveal and audience | server: assignment and Manual self-service denial; browser: no admin key, assigned email, team reveal → real Kong 200, outsider product page | **Fail**: anonymous Manual product page returns 200; assignment/key/API policy pass |
| 12 — Restriction confirmation, Keep/Revoke | server: three affected teams, Keep and approval confirmation; UI: Keep default; browser: Keep key 200, Revoke key 401 and team mail | Pass |
| 13 — Saved restriction and revocation retry | server: partial adapter failure, replay twice, exactly-once enqueue, reconcile skips revoked; UI: retry notice; browser: real Kong down → persisted pending/no email → restart → revoked/401 and one mail | Pass (partial per-credential failure and reconcile use fake adapter + real Postgres; outage/retry uses real Kong) |

Validation: workspace lint and typecheck pass. One full workspace test pass: server **279/279**, portal **329/329**, database **9/9**, Kong adapter **60/60**; the two subsequent server coverage additions pass in the focused suite (**21/21**). The completed full browser pass reports **95 passed, 3 failed, 2 skipped** (7.8 minutes); two failures were stale navigation expectations missing the new Requests section, corrected in `apps/portal/e2e/account-security.test.ts` and passing **2/2** on focused retest. The remaining failure is the spec 010 invisible-page status regression; the new browser test keeps its 404 assertions failing rather than accepting 200.

Quickstart: `node scripts/worktree-compose.mjs up -d --build --wait` succeeds after the coordinator freed Mailpit port 8025; fresh `/setup` returned 200, the automated setup journey passed its five-minute assertion, and the seeded environment path started successfully. The isolated stack is left up for the next stage. There were no open bugs at intake; the new major was reproduced and kept open with `linear bug 010 open`. The ownership guard flags only earlier-stage committed application/design files; Elango authorized the explicit QA-only commit despite that limitation. At Elango’s direction, the bug and frontend Fix task are tracked only in this spec; no Linear issue will be created. Status is **building**.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
- [ ] Invisible product and changelog pages return HTTP 200 instead of 404 (major)
  - Current repro: signed-out `GET /products/access-d79f1b28-0612-43a7-9027-b072da0353a1` on the QA portal returns 200 with not-found content; the full browser run also reproduces Hidden product and changelog 200 responses. Expected 404.

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/010.md`. The full report is `docs/uat/010/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/010.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
