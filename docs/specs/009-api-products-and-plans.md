---
id: 009
title: API products and free plans with rate limits
status: done   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-11
linear: JSO-237
---

# 009 — API products and free plans with rate limits

## Summary
Admins bundle published APIs into products with free plans, and developers subscribe to a plan to
get a key whose rate limit and monthly quota Kong enforces.

## Problem
Today a portal key gives an app unlimited access to the APIs it chose (spec 004). A platform team
can't offer a "Free: 5 requests/second" tier and a "Standard: 50 requests/second" tier, so it has
to set limits in Kong by hand for each consumer, outside the portal, or skip limits entirely. That
blocks the main reason teams adopt a portal: self-service access that the gateway still controls.
Plans here are access tiers, not prices. This install has no billing (AGENTS.md).

We'll know it's solved when, against the quickstart Kong, a developer on a plan limited to 5
requests per second gets `429` on the sixth request in one second, a plan change raises that
limit without a new key, and cancelling or regenerating a key cuts off the old key. These are the
Sprint 4 demo steps in `docs/roadmap.md`.

## Users
- **Portal admin:** creates products and their plans.
- **API consumer (developer):** compares plans, subscribes, changes plan, cancels, regenerates a key.
- **Platform engineer:** relies on Kong, not the portal, to enforce the limits.

## User stories
- As a portal admin, I want to group published APIs into a product with a name and description,
  so that developers pick one offering instead of assembling APIs one by one.
- As a portal admin, I want to give each product one or more plans with a request rate (per second
  or per minute), a monthly quota and the APIs the plan includes, so that I can offer access
  tiers without editing Kong by hand.
- As a developer, I want to compare a product's plans in one table, so that I can choose the
  right tier before I subscribe.
- As a developer, I want to subscribe to a plan, name the subscription and get a key, so that I
  can start calling the APIs straight away.
- As a developer, I want to change my plan without changing my key, so that my running code
  keeps working with the new limit.
- As a developer, I want to cancel a subscription or regenerate its key, so that I can stop
  access I no longer need or replace a leaked key.

## Acceptance criteria
1. **Given** an admin and two published APIs **When** the admin creates a product with a name,
   a description, both APIs and a plan "Free" (5 requests per second, 10,000 requests per
   month, both APIs) **Then** the product appears in the catalog, and its product page shows a
   plan comparison table with each plan's rate limit, monthly quota and included APIs.
2. **Given** an admin creating or editing a plan **When** the rate limit or monthly quota is
   missing, zero, negative or not a whole number, or the plan includes no API or an API outside
   the product **Then** the server returns `400` problem+json naming the invalid field, the
   form shows that message beside the field, and nothing is saved.
3. **Given** a signed-in developer on the product page **When** they choose plan "Free", name the
   subscription and confirm **Then** the subscription is listed under their team with its plan,
   the key is shown once, and a call through Kong with that key to each API in the plan returns
   the upstream's response.
4. **Given** a key on a plan limited to 5 requests per second **When** the developer sends six
   requests through Kong to an included API within one second **Then** the sixth gets `429` from
   Kong, and a request in the next second succeeds.
5. **Given** a key on a plan with a monthly quota of 10 requests **When** the developer sends 11
   requests through Kong spaced to stay under the rate limit **Then** the eleventh gets `429`
   from Kong.
6. **Given** a subscription on the 5-per-second plan **When** the developer changes it to a plan
   allowing 20 requests per second **Then** the same key is kept, and ten requests within one
   second through Kong all succeed.
7. **Given** an active subscription **When** the developer cancels it and confirms **Then** the
   subscription leaves their list, and a call through Kong with its key is rejected (`401` or
   `403`) and never reaches the upstream.
8. **Given** an active subscription **When** the developer regenerates its key **Then** the new
   key is shown once and works through Kong, and the old key is rejected (`401`) on the next call.
9. **Given** Kong is unreachable **When** a developer subscribes, changes plan, cancels or
   regenerates a key **Then** the portal shows an error that says the gateway is unavailable, the
   server returns problem+json, and the subscription, its plan and its key stay exactly as they
   were before (no half-created subscription, no key that Kong doesn't know).
10. **Given** a Read-only member of a team (spec 008), or a developer who is not a portal admin
    **When** they try to subscribe, change plan, cancel or regenerate a key for that team, or to
    create or edit a product or plan, respectively **Then** the server returns `403`
    problem+json and nothing changes in the portal or in Kong.

## Out of scope
- **Prices, billing, invoices or paid plans.** Plans are free access tiers (AGENTS.md).
- **Approval before a plan's key works, and hidden or private products.** Spec 010 (JSO-238).
  Every plan in this spec is self-service and every product is public in the catalog.
- **Usage meters and admin insights** (requests used against the quota). Spec 011 (JSO-239).
- **Product images and tags.** Cut to keep this to one pull request; they matter once the catalog
  has search and filters (specs 012, 020). Follow-up.
- **Auth methods other than API key** (OAuth client credentials is spec 018). A plan's auth method
  is always API key here, so the admin form doesn't offer a choice.
- **Hourly or daily limits, burst settings, and limits per operation or route.** One rate limit
  (per second or per minute) and one monthly quota per plan prove the value.
- **Plans on AWS API Gateway.** Spec 017 maps plans to usage plans.
- **Deleting a product or plan that has subscribers, or moving all subscribers between plans.**
  Cut because it decides what happens to working keys. Follow-up.
- **Notification emails** (subscribed, plan changed, cancelled).

## Open questions
- [x] Is a subscription a new kind of app (one key, one plan), or does an existing app subscribe
      to a plan? This decides the data model and the My apps screen. — tech-lead, then Elango
      **Decided (Elango, 2026-11-11):** each subscription is a new app with one key and one plan.
- [x] What happens to apps created before this spec, which call APIs with no plan (spec 004)?
      Options: move them to a default unlimited plan, or leave them as they are until the
      developer subscribes. — Elango
      **Decided (Elango, 2026-11-11):** a migration moves them to a built-in default plan with no
      limits, so every app has a plan.
- [x] Does the catalog list only products, or products plus APIs that are in no product? And can
      a developer still get a key for an API that is in no product? — Elango
      **Decided (Elango, 2026-11-11):** the catalog lists products and APIs that are in no product;
      loose APIs keep spec 004's per-API key flow.
- [x] Can a team hold two subscriptions to the same product (for example staging and production)?
      — Elango
      **Decided (Elango, 2026-11-11):** yes; subscriptions are named (for example `staging`,
      `prod`), each with its own key and limits.
- [x] Does a monthly quota reset on the first of the calendar month in UTC, or on a rolling
      30-day window? Kong's `month` window decides what is cheap; the plan table must say which.
      — tech-lead
      **Decided (tech-lead, ADR 0009):** the calendar month in UTC, Kong's fixed `month` window.
- [x] Which Kong rate-limiting policy (`local`, `cluster` or `redis`) the quickstart uses, and
      what we tell operators running several Kong nodes, where `local` counts per node. — tech-lead,
      in the plan → Kong mapping ADR
      **Decided (tech-lead, ADR 0009):** `cluster` by default, counted in Kong's database across
      nodes; `PORTAL_RATE_LIMIT_POLICY=local` for operators who accept per-node counts.

Kong evidence for scope: the open-source rate-limiting plugin supports per-second, per-minute and
per-month limits in one plugin and can be scoped to a consumer and a service together
(<https://developer.konghq.com/plugins/rate-limiting/>, plugin scoping:
<https://developer.konghq.com/gateway/entities/plugin/#scoping-plugins>). Access to a plan's APIs
reuses spec 004's ACL groups.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Lasting choices are in [ADR 0009](../adr/0009-plans-map-to-kong-rate-limiting.md). The contract
is in `apps/server/openapi.yaml` (tag `products`, and the changed `apps` operations).

**Components**
- `packages/db`: tables `products`, `product_apis`, `plans`, `plan_apis`; `apps.plan_id`; one
  migration that also adds the built-in plan and moves every existing app onto it.
- `packages/adapter-sdk`: `PlanLimits`, `applyPlanLimits`, `limits` on `AccessPolicy.apps[]`,
  `capabilities().plans`, conformance cases.
- `packages/adapter-kong`: the consumer-scoped `rate-limiting` plugin, and its reconcile.
- `apps/server`: new `products.ts` (public and admin routes), changes to `apps.ts`, `catalog.ts`,
  `reconcile.ts` and `config.ts` (`PORTAL_RATE_LIMIT_POLICY`).
- `packages/sdk`: regenerate from the contract.
- `apps/portal`: catalog with products, product page with the plan table and subscribe, the
  subscription's plan, change plan, cancel and regenerate on My apps, admin product and plan forms.
- `deploy/docker-compose.yml`: no change. `cluster` is the default and the quickstart Kong uses
  Postgres.

**API contract** (all under `/api`; errors are problem+json)
| Method and path | Who | Success | Errors |
| --- | --- | --- | --- |
| `GET /v1/products` | public | 200 `ProductSummary[]` | — |
| `GET /v1/products/{productSlug}` | public | 200 `ProductDetail` (APIs, plans oldest first) | 404 |
| `POST /v1/admin/products` | admin | 201 `ProductDetail` | 400, 403 `forbidden`, 404 API, 409 `product-slug-taken` |
| `PATCH /v1/admin/products/{productId}` | admin | 200 `ProductDetail` | 400, 403, 404, 409 `api-in-plan` |
| `POST /v1/admin/products/{productId}/plans` | admin | 201 `Plan` | 400 (pointer per field), 403, 404, 409 `plan-name-taken` |
| `PUT /v1/admin/products/{productId}/plans/{planId}` | admin | 200 `Plan`, then reconcile | same as create |
| `POST /v1/apps` with `planId` | team admin or member | 201 `CreateAppResponse` | 400, 403, 404, 409, 502, 503 |
| `PUT /v1/apps/{appId}/plan` | team admin or member | 200 `App` | 400 `/planId`, 403, 404, 409, 502, 503 |
| `DELETE /v1/apps/{appId}` | team admin or member | 204 | 403, 404, 502, 503 |
| `POST /v1/apps/{appId}/credentials/{credentialId}/regenerate` | team admin or member | 201 `IssuedCredential` | 403, 404, 409 `credential-revoked`, 502, 503 |

- `CreateAppRequest` takes exactly one of `planId` or `apiIds`. `apiIds` with an API that is in a
  product is a 400 on `/apiIds`. Subscription names are app names, unique in the team.
- `PlanInput`: `name` (1–40, unique in the product), `description` (≤ 280), `rateLimit` (integer
  1–1,000,000), `rateLimitUnit` (`second` | `minute`), `monthlyQuota` (integer 1–2,000,000,000,
  ≥ `rateLimit`), `apiIds` (1–50, each in the product). Validation collects every failing field
  into `errors[]` with its JSON pointer (AC 2). Missing, `0`, negative and `2.5` are all 400.
- `ApiSummary.products` lists the products that include an API. The catalog shows products, plus
  APIs whose `products` is empty.
- `App.plan` is `AppPlan`: the built-in plan is `{ name: "Unlimited", builtin: true }` with null
  product and limits. `App.subscriptions` stays the list of APIs the key reaches.
- A subscription on a product plan has one active key: `POST /v1/apps/{appId}/credentials` returns
  409 `credential-limit` when it has one. Built-in-plan apps keep the limit of 5.
- `PUT /v1/apps/{appId}/plan` accepts only a plan of the app's product. A built-in-plan app gets
  400 on `/planId`.
- Roles: product and plan writes use the existing admin check (403 `/problems/forbidden`). App
  writes use `appAccess(…, 'write')` / `teamAccess(…, 'write')` (403 `team-role-forbidden` for
  read-only), checked before any Kong call (AC 10). Subscribe, change plan and regenerate also run
  `requireVerified`, like key creation.

**Data model** (Drizzle, `packages/db/src/schema.ts`; one generated migration)
- `products`: `id` uuid pk, `slug` text unique, `name` text (check 1–80 after trim), `description`
  text not null, `created_by` → user (set null), `created_at`, `updated_at`.
- `product_apis`: `product_id` → products (cascade), `api_id` → apis (restrict), pk
  (`product_id`, `api_id`). An API can be in more than one product.
- `plans`: `id` uuid pk, `product_id` → products (restrict, null only for the built-in plan),
  `name`, `description`, `rate_limit` int, `rate_limit_unit` text, `monthly_quota` int, `builtin`
  boolean default false, `created_at`, `updated_at`. Checks: `builtin = (product_id is null)`;
  `builtin or (rate_limit > 0 and rate_limit_unit in ('second','minute') and monthly_quota >=
  rate_limit)`; built-in has all three null. Unique (`product_id`, `name`); unique (`id`,
  `product_id`); partial unique index on `builtin` where `builtin` (only one built-in plan).
- `plan_apis`: `plan_id`, `product_id`, `api_id`, pk (`plan_id`, `api_id`). FK (`plan_id`,
  `product_id`) → plans (`id`, `product_id`) cascade; FK (`product_id`, `api_id`) →
  product_apis restrict. Postgres itself refuses an API outside the product, and refuses removing
  an API from a product while a plan includes it (the server maps that to 409 `api-in-plan`).
- `apps.plan_id` uuid not null → plans (restrict), index on it.
- Migration: generate with `pnpm --filter @portal/db exec drizzle-kit generate`, then hand-edit
  the SQL so it adds `apps.plan_id` as nullable, inserts the built-in plan with the fixed id
  `01937a00-0000-7000-8000-000000000009` and name `Unlimited`, sets every app's `plan_id` to it,
  then sets not null. Export the id as `BUILTIN_PLAN_ID` from `@portal/db`.
- The spec 004 `subscriptions` table (app ↔ API) is unchanged and is used only by built-in-plan
  apps. A server helper `appApis(tx, app)` returns `plan_apis` for a product plan and
  `subscriptions` otherwise. Every place that reads `subscriptions` today (`apps.ts` view and key
  creation, `reconcile.ts`) uses it.

**Gateway adapter calls** (ADR 0009)
- SDK: `interface PlanLimits { rate: { unit: 'second' | 'minute'; limit: number }; monthlyQuota:
  number }`; `applyPlanLimits(app: AppRef, limits: PlanLimits | null): Promise<void>`;
  `AccessPolicy.apps[]` gains `limits: PlanLimits | null`; `AccessFinding.code` may be
  `foreign-rate-limit`; `Capabilities.plans: boolean`.
- Kong `applyPlanLimits(app, limits)`: `PUT /plugins/{stableId('rate-limiting', app.id)}` with
  `{ name: 'rate-limiting', consumer: { id: <consumer id> }, config: { second|minute: limit,
  month: monthlyQuota, limit_by: 'consumer', policy }, tags: portalTags(instanceId, app) }`. Pass
  the unit's field only. `null` → `DELETE /plugins/{id}` (404 is fine). The consumer must exist,
  so call it after `ensureConsumer`. `policy` comes from `KongConfig.rateLimitPolicy`, set from
  `PORTAL_RATE_LIMIT_POLICY` (`cluster` default, or `local`).
- Kong `applyAccessPolicy`: after memberships and ACLs, list `/plugins?tags=portal-instance-<id>`
  filtered to `name = rate-limiting`; PUT any app's plugin whose config differs or is missing,
  DELETE one whose app is gone or has `limits: null`. Report each as a repair (`object:
  'plugin'`). Add a `foreign-rate-limit` finding for a managed service where a non-portal
  `rate-limiting` plugin is scoped to route+service, consumer+service or consumer+route.
- Server flows (inside the existing transaction and gateway shared lock 71833002):
  - Subscribe: `ensureConsumer` → `grantAccess` per plan service → `applyPlanLimits` →
    `issueCredential` → insert rows. On failure `deleteConsumer` (Kong cascades the plugin).
  - Built-in create (`apiIds`): as today. No plugin.
  - Change plan: `applyPlanLimits(new)` → `grantAccess` for new services → `revokeAccess` for
    dropped services → update `apps.plan_id`. On failure, best effort `applyPlanLimits(old)`,
    `grantAccess(old)`, `revokeAccess(new only)`, then rethrow; reconcile repairs the rest.
  - Cancel: `deleteConsumer` → delete the app (credentials, consumer rows and spec 004
    subscriptions cascade). Kong failing means rollback and 503. If the commit fails after Kong
    succeeded, the key is already dead (fails closed); reconcile logs the missing credentials.
  - Regenerate: active key check → `ensureConsumer` → `issueCredential(new)` →
    `revokeCredential(old)` → insert new row and mark old `revoked`, in one transaction. If the
    revoke or the insert fails, `revokeCredential(new)` and rethrow.
  - Plan PUT: update rows, commit, then `boss.send('gateway-reconcile', {}, { singletonKey:
    'gateway-reconcile' })`. Product and plan writes make no other Kong call.
- Every Kong error maps as today: unreachable or 5xx → 503 `gateway-unavailable` with
  `Retry-After: 5`; 4xx → 502 `gateway-rejected`; disabled → 409 `gateway-disabled`.

**Risks and how to test them**
- *Exact 429 on the sixth request (AC 4).* Kong's second window is fixed, so six requests can
  straddle a boundary. QA starts the burst right after a second boundary, and asserts that the
  sixth of six fired at once gets 429 and that a request 1.1 s later succeeds. Run on the real
  quickstart Kong (`cluster`).
- *Quota test (AC 5) without waiting a month.* Use a plan with quota 10 and rate 5/second, spaced
  at 300 ms.
- *Plan change visible at once (AC 6).* The quickstart Kong uses `KONG_WORKER_CONSISTENCY:
  strict`, so a plugin change applies on the next request. Multi-node Kong takes up to 5 s; the
  upgrade notes say so.
- *Counters survive a plan change.* Integration test on real Kong: use 8 of a 10 quota, change to a
  20-quota plan, and the next 12 succeed and the 13th gets 429.
- *Half-done Kong writes (AC 9).* Unit tests with a fake adapter that fails on each call in turn
  assert the database is unchanged and the compensation calls happened. One integration test stops
  Kong's admin port and checks every flow returns 503 and nothing changed.
- *Loose apps bypassing plans.* Test that `POST /v1/apps` with `apiIds` containing a product's API
  returns 400 and calls no adapter method.
- *Operator rate-limit plugins.* Unit test the `foreign-rate-limit` finding; the portal never edits
  a plugin it didn't tag.
- *Migration.* A migration test (like `teams-migration.test.ts`) seeds apps before the migration
  and asserts each is on the built-in plan afterwards with its subscriptions untouched.
- *`cluster` writes Kong's database on each request.* Accepted for the quickstart. The
  `PORTAL_RATE_LIMIT_POLICY` line in the README and `.env.example` explains `local`.

### Tasks
- [x] [backend] Schema and migration: `products`, `product_apis`, `plans`, `plan_apis`, `apps.plan_id`, the built-in plan and the backfill, `BUILTIN_PLAN_ID`; migration test
- [x] [backend] Adapter SDK: `PlanLimits`, `applyPlanLimits`, `AccessPolicy.apps[].limits`, `capabilities().plans`, `foreign-rate-limit`; conformance cases for apply, replace and remove
- [x] [backend] Kong adapter: consumer-scoped `rate-limiting` plugin with a stable ID and `rateLimitPolicy`; reconcile of portal rate-limit plugins in `applyAccessPolicy`; unit tests and a real-Kong test
- [x] [backend] Config: `PORTAL_RATE_LIMIT_POLICY` (`cluster` default, `local`) passed to the Kong adapter; document it in `.env.example` and the README
- [x] [backend] Products API: public list and detail, admin create and update product, create and update plan with per-field validation (AC 2), `api-in-plan`, reconcile job sent after a plan update
- [x] [backend] Catalog: `ApiSummary.products` on `GET /v1/apis` and API detail
- [x] [backend] Apps: `appApis` helper; `POST /v1/apps` with `planId`, and refusal of product APIs in `apiIds`; `App.plan`; one active key for product-plan apps; reconcile passes plan limits
- [x] [backend] Apps: `PUT /v1/apps/{appId}/plan`, `DELETE /v1/apps/{appId}` and `POST …/credentials/{credentialId}/regenerate`, with compensation; unit tests for every failure point (AC 9) and role checks (AC 10)
- [x] [backend] Regenerate `packages/sdk` from the contract
- [x] [frontend] Catalog lists products and the APIs in no product; product page with description, APIs and the plan comparison table (rate limit, monthly quota "per calendar month, UTC", included APIs)
- [x] [frontend] Subscribe on the product page: choose a plan, name the subscription, confirm, show the key once; gateway-unavailable and role errors
- [x] [frontend] My apps: show each app's plan and limits; change plan (same product), cancel with confirmation, regenerate key with the key shown once; read-only members see no actions
- [x] [frontend] Admin: product list, create and edit product (APIs from the catalog), add and edit plans with field errors beside each field
- [x] [qa] Integration tests on real Kong and Postgres for AC 1–10, including the counter carry-over and the migration
- [x] [qa] Playwright e2e: admin creates a product and plan; developer subscribes, gets 429 on the sixth call, changes plan, regenerates and cancels
- [x] [qa] Quickstart `docker compose up` still works, with `cluster` policy, and the spec 004 per-API key flow still works for APIs in no product
- [x] [backend] Fix: Monthly quota carry-over intermittently allows an extra request in the full suite
## UX  _(ui-designer)_
Design: [docs/design/009-api-products-and-plans.md](../design/009-api-products-and-plans.md). No new tokens.
- **Catalog** gains a Products section (`ProductCard`: APIs and plan counts); the APIs section lists only APIs in no product.
- **Product page** `/products/{slug}`: description, APIs, and a `PlanTable` (plans as columns; rate limit, monthly quota, included APIs) that becomes one card per plan below 768px. Subscribe buttons per plan; visitors get **Sign in to subscribe**; Read-only members get a line instead.
- **Subscribe** `/products/{slug}/subscribe?plan=`: plan radios, subscription name, team shown; success opens the existing key dialog on the App page.
- **App page**: plan card with limits, **Change plan…** dialog (same key, warns about dropped APIs), **Regenerate…** per active key (new key shown once, old one revoked), **Cancel subscription…** in a danger zone; product-plan apps show **New key** only with no active key.
- **Admin**: `AdminNav` **Products**, product list, product form, product page with plans, and a plan form with an error summary and per-field messages for every AC 2 case (`inputmode="numeric"` text inputs so 2.5 and -1 reach validation).
- Every gateway error (AC 9) keeps the dialog or form open and says what didn't change; role refusals (AC 10) follow 008.

## Build notes  _(backend-developer, frontend-developer)_

- Frontend: implemented the product catalog and server-rendered product pages, responsive plan comparison, team-scoped subscriptions with one-time key handover, My apps plan details, plan change/cancel/regenerate dialogs, and admin product/plan forms with collected field errors. Standalone app creation excludes product APIs; read-only members see no write controls. `@portal/portal` lint, typecheck and all 306 tests pass, including retries, dropped-API warnings, confirmations, catalog partial failures and numeric validation. The branch-wide ownership guard flags sibling backend/design files; the coordinator authorized checking and committing only frontend/spec/log paths instead.

### Backend — products, plans and subscriptions

Implemented the product/plan schema with a generated forward migration and Unlimited backfill, consumer-scoped Kong limits and reconcile repairs, product/catalog APIs, plan subscriptions, plan changes, cancellation, regeneration and the generated SDK. Validation collects all invalid plan fields (including product membership and quota errors), and gateway/database failure tests cover compensation and read-only role checks.

Validation: all changed packages pass lint and typecheck; `@portal/db` passes 7 tests, `@portal/server` passes 234 tests, and `@portal/adapter-kong` passes 60 tests including real-Kong quota counter carry-over. `@portal/adapter-sdk` and `@portal/sdk` test commands pass with no standalone tests; adapter SDK conformance runs in the Kong package. No workspace-wide suite, browser or quickstart was run.

`PORTAL_RATE_LIMIT_POLICY` is documented in `deploy/.env.example` and `deploy/README.md`; the coordinator leaves the root README addition for the tech lead. Existing test fixtures that truncate user-linked tables now restore the built-in plan. The coordinator authorized bypassing the broad guard using an explicit backend-only staged path list because frontend and earlier design changes share this branch; no other worker’s files were restored or included in the backend commit.

### Backend — quota carry-over regression

The real-Kong carry-over test now waits for each cluster-policy monthly counter to commit in Postgres instead of assuming the proxy response plus 300 ms guarantees persistence. It asserts the monthly limit and remaining count on every accepted request across both services, eight persisted uses across the plan replacement, and exactly 20 uses when request 21 returns 429. This is a test synchronization change: Kong 3.9 writes cluster counters on an asynchronous timer, so concurrent traffic can still overshoot; no gateway policy or production behavior changed. QA should repeat its full-workspace workload before closing the Bugs line.

Validation: `@portal/adapter-kong` lint, typecheck and package tests pass (60/60). The initial pre-change package run also exposed an unrelated intermittent shared-conformance assertion on ACL `created_at` changing across an idempotent PUT; the final package run passed it without changes. The broad backend guard flags existing sibling frontend/design files; the coordinator explicitly authorized a narrow staged path list, verified to include only this adapter test and this stage's spec/log changes, with sibling QA/e2e edits left untouched.

## Test report  _(qa-tester)_

Tested application commit: `9845cbfd87efb39e3e5e8ac8262d512fdb5bed73`, with the QA test changes in this worktree. No application code changed during QA. Portal URL from `node scripts/worktree-compose.mjs env`: **http://localhost:3008**; project `portal-009-api-products-and-plans-2-b317`, Kong proxy `http://localhost:18008`, Admin API `http://localhost:19008`.

| Acceptance criterion | Automated evidence | Result |
| --- | --- | --- |
| AC1 — two published APIs, product catalog and comparison table | `apps/server/src/products.test.ts` product/catalog case; `apps/portal/e2e/products.test.ts` AC1–8 creates the product and Free plan in the browser, then checks both APIs, 5/second and 10,000/month in the catalog and plan table | Pass |
| AC2 — missing, zero, negative, fractional limits; empty/outside APIs; field errors and no save | `apps/server/src/products.test.ts` POST/PUT validation matrix snapshots plans and plan APIs; `apps/portal/lib/plan-validation.test.ts`; `apps/portal/components/products.test.tsx` pointer rendering; `apps/portal/e2e/products.test.ts` invalid form then successful correction | Pass |
| AC3 — team subscription, plan, one-time key and upstream access to both APIs | `apps/server/src/products.test.ts` bounded subscription and single active credential; `apps/portal/e2e/products.test.ts` AC1–8 verifies the one-time reveal, reload secrecy and live upstream JSON from both APIs | Pass |
| AC4 — sixth request in one second is 429, next window succeeds | `apps/portal/e2e/products.test.ts` AC1–8 synchronizes to the second boundary, asserts `[200,200,200,200,200,429]` within 900 ms and 200 in the next window against real Kong | Pass |
| AC5 — eleventh request exceeds quota 10 while under the short rate limit | `apps/portal/e2e/products.test.ts` AC1–8 sends two calls per second across both APIs, then asserts request 11 is 429; `packages/adapter-kong/src/conformance.test.ts` checks persisted shared quota | Pass |
| AC6 — upgrade to 20/second retains the key and admits ten calls | `apps/server/src/products.test.ts` plan change; `apps/portal/e2e/products.test.ts` AC1–8 changes plan in the UI, sends ten live requests using the original key and verifies the active credential ID | Pass |
| AC7 — confirmed cancellation removes subscription and rejects key | `apps/server/src/products.test.ts` cancellation; `apps/portal/e2e/products.test.ts` AC1–8 confirms cancellation, checks list removal and Kong 401/403 | Pass |
| AC8 — regenerated key shown once, new key works, old key gets 401 | `apps/server/src/products.test.ts` regeneration and failure compensation; `apps/portal/e2e/products.test.ts` AC1–8 checks both live keys and secret absence after reload | Pass |
| AC9 — unreachable gateway shows problem+json and preserves subscription, plan and key | `apps/server/src/products.test.ts` every gateway-call failure and database/commit compensation; `apps/portal/components/products.test.tsx`; `apps/portal/e2e/products.test.ts` AC9–10 stops real Kong, checks 503 problem+json and all four UI errors, snapshots state, restarts Kong and verifies the original key | Pass |
| AC10 — read-only members and non-admins cannot mutate; no portal/Kong changes | `apps/server/src/products.test.ts` role/session cases snapshot database rows and assert no adapter calls; `apps/portal/e2e/products.test.ts` AC9–10 checks every denied endpoint, hidden write controls, unchanged state and continued original-key access | Pass |

Additional failure paths cover duplicate and simultaneous subscriptions (one 201, one 409, one consumer/key), expired/missing sessions (401), direct product-API bypass rejection, revoked credentials, and failures during subscription, plan changes, regeneration and cancellation. `packages/db/src/plans-migration.test.ts` verifies Unlimited backfill and retained subscriptions. The real-Kong counter regression checks eight persisted uses before replacement, exactly 20 total uses, and request 21 rejected; only the final limiter-removal check now waits for bounded proxy convergence after verifying the plugin is absent in the Admin API, matching the existing ACL/key removal checks without weakening quota assertions.

Validation on 2026-11-13:
- `pnpm lint` and `pnpm typecheck`: pass; changed packages were typechecked before their tests.
- `TURBO_FORCE=true pnpm test`: pass, **612 tests** (server 239, portal 306, Kong 60, database 7), no cached tasks. An earlier uncached run exposed the limiter-removal synchronization issue above; the focused regression and the final uncached workspace run pass after that test-only correction.
- Focused Playwright product run: **2 passed**, including the four real-gateway outage dialogs.
- Complete `pnpm test:e2e`: pass, **97 passed, 2 skipped** in 7.3 minutes; this includes four explicitly expected-failure regressions (three setup findings already tracked by their tests, plus the minor catalog retry finding). Both 009 browser tests pass in this complete run. The earlier misconfigured attempt was aborted, not counted as a successful pass.
- `node scripts/worktree-compose.mjs up -d --build --wait`: pass, real Postgres/Kong and portal healthy; leave the worktree stack running for UAT. The browser setup fixture uses explicit worktree project/image/port variables because it invokes Compose directly. The initial browser attempt omitted those variables and invoked default-project `down -v`/`up`; that runner and its orphan worker were stopped, and the corrected complete pass uses this worktree project throughout. The prior state of the default project was not recorded, so any prior default-project data impact is unknown; no default-project containers were running at the subsequent inspection.

Bug verification: the quota carry-over bug remains verified closed with `linear bug 009 done`; the catalog retry bug remains open with `linear bug 009 open` and is covered by its expected-failure regression. The catalog issue is minor, has no Fix task or Linear issue, and does not block UAT. No application code was changed.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [x] Monthly quota carry-over intermittently allows an extra request in the full suite (major)
- [ ] Catalog outage retry reloads the document and discards page state (minor). Repro: stop the server, open `/`, restart the server, and choose either catalog “Try again” link. The catalog recovers, but the request is a main-frame document navigation (observed count 1 instead of 0), unlike the existing API-detail and My apps retry flows. Automated regression: `apps/portal/e2e/backlog-live.test.ts`, server-outage `/` case; no Linear issue or Fix task.
- [ ] Mobile product plan cards remain side by side and overflow at 390 × 844 (minor). Product with three plans: document client width 390px, scroll width 593px; third-plan tap did not navigate. First Subscribe link then plan radio completes the journey. Evidence: local `docs/uat/009/mobile-plan-layout-fail.png`; no Linear issue or Fix task.

## User testing  _(user-tester)_

2026-11-13, commit `d2c4d8727dc783d8525eec0b9c1bc1400c561dd8`, Orca browser against QA's stack at http://localhost:3008. Full current evidence: [UAT report](../uat/009/report.md). Server-only payload/internals remain QA coverage; the rows below describe the visible walk and live Kong calls.

| User story / criterion | Result | Evidence |
| --- | --- | --- |
| AC1 — create product and compare plans | Pass, desktop | “Created UAT Weather bundle.”; “2 APIs · 3 plans”; Free shows 5/second, 10,000/calendar month UTC and both APIs included. |
| AC2 — invalid plan form | Pass, visible form | “Enter a rate limit.”, “Enter … of 1 or more.”, “Enter a whole number…” and “Choose at least one API.”; valid correction saved once. Outside-product APIs are not offered. |
| AC3 — subscription, one-time key and APIs | Pass | “Your API key”; My apps shows Free and one active key; reload shows only suffix; both APIs 200, docs Send shows “200 OK”. |
| AC4 — rate limit | Pass | Six requests in 0.077s: five 200s then 429; next second 200. |
| AC5 — monthly quota | Pass | Ten requests 0.55s apart returned 200; eleventh 429. |
| AC6 — plan change | Pass | “Changed to Expanded. Your key stays the same…”; original key: ten 200s in 0.108s. |
| AC7 — cancellation | Pass | “Cancelled uat-desktop. Its key has stopped working.”; app gone, key 401. |
| AC8 — regeneration | Pass | “Your new API key”; old 401, new 200, secret absent after reload. |
| AC9 — gateway outage | Pass, visible behavior | All four actions show “The gateway is unavailable” without closing; recovery keeps Expanded/original key, no partial subscription, original key 200. |
| AC10 — read-only/non-admin | Pass, visible behavior | “you can't subscribe here”; no plan/key/cancel controls; normal developer's admin URL shows “Page not found”. |
| Mobile main journey | Fail, minor layout; subscription completed | `mobile-plan-layout-fail.png`: three cards in a row, 593px content on 390px client; first plan → Tiny radio → key/app succeeds. |
| Keyboard main journey | Pass with name entry | Tab/Enter reached Free, submitted and completed key dialog; Escape kept one-time reveal open. Name supplied with browser fill; navigation/activation used Tab, Enter, Escape. |
| Catalog retry bug | Fail, minor | “Try again” recovers catalog but changes document time origin; existing bug reaffirmed open. |

Console check returned no error-level entries; the available line was informational: “loadDocument: 28 ms”. No browser logs or secrets were saved. One local failure image, no round directory; stack stopped. No blocker or major is open, so the result is review.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/009.md`.

Reviewed `git diff main...HEAD` at `d2c4d87`. That commit only adds QA tests on top of the tested application commit `9845cbf`, and the Test report shows a full uncached pass, so the suite was not re-run. All ten acceptance criteria have server, browser and real-Kong tests. The contract, data model, migration backfill, adapter calls, compensation paths, role checks and problem+json mapping match the Technical design and ADR 0009. Concurrent plan changes serialize on the `appAccess` row lock.

**Blocking:** none.

**Suggestions** (no Fix task):
- `apps/portal/app/products/[slug]/products.css:40`: `display: flex` overrides the `.stack` grid, so on screens 767px wide or narrower the plan cards sit side by side and overflow. This is the open mobile minor in Bugs. Use `display: grid`, or add `flex-direction: column`.
- `apps/server/src/products.ts:124` and `:94`: `GET /v1/products` builds the full detail for each product, and each detail calls `publishedApis(db)` again. Return the summaries from one grouped count query instead.
- `apps/server/src/reconcile.ts:54`: reconcile runs two or three queries for every app inside the locked transaction. Load plans and plan APIs once and group them in memory before installs reach thousands of apps.
- `apps/server/src/products.ts:52`: `checkApis` checks only that the APIs exist, so an admin can add an unpublished API to a product. Check against `publishedApis` so products match AC 1's "published APIs".
- `packages/adapter-kong/src/index.ts:303`: when the consumer is missing, `applyPlanLimits` throws `GatewayUnavailableError` (503 "gateway unavailable"), but Kong is reachable. A `gateway-rejected`/conflict error would describe the cause better.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR

### Follow-ups
- Redis rate-limiting policy for Kong hybrid and multi-node installs (ADR 0009)
- Move pre-009 apps on the built-in Unlimited plan onto a product plan

### Deferred Linear
- **Bug** — Bug: Monthly quota carry-over intermittently allows an extra request in the full suite (major)
  - parent: JSO-237
  - priority: high
  - create when the Linear limit allows
  - body: QA on commit 3508226efa8e01987f1f695534dfee4e90852b31, with only QA test changes in the working tree, found a failure in the required full `pnpm test` run.  Steps: run `pnpm test` with Docker available. In `packages/adapter-kong/src/conformance.test.ts`, the real Postgres/Kong test `enforces a shared monthly quota and preserves counters across a plan replacement on real Kong` sends eight calls on a quota-10 plan, replaces it with quota 20, sends twelve further calls, then asserts the next call is denied. At line 931 the next call returned HTTP 200 instead of 429; adapter-kong ended with 59 passed and one failed test, and Turbo aborted the still-running server suite.  An isolated rerun of that test and a rerun of the entire conformance file both passed. This is intermittent, and QA has not established whether the defect is gateway propagation, quota counting, suite state or the test itself; do not treat those reruns as a green full run. Investigate and make quota carry-over deterministic under the full-suite workload before release. The new quickstart browser test separately verifies a fresh quota-10 subscription denies its eleventh request.
