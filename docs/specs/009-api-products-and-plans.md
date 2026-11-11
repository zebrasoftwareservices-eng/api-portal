---
id: 009
title: API products and free plans with rate limits
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
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
- [ ] [backend] Schema and migration: `products`, `product_apis`, `plans`, `plan_apis`, `apps.plan_id`, the built-in plan and the backfill, `BUILTIN_PLAN_ID`; migration test
- [ ] [backend] Adapter SDK: `PlanLimits`, `applyPlanLimits`, `AccessPolicy.apps[].limits`, `capabilities().plans`, `foreign-rate-limit`; conformance cases for apply, replace and remove
- [ ] [backend] Kong adapter: consumer-scoped `rate-limiting` plugin with a stable ID and `rateLimitPolicy`; reconcile of portal rate-limit plugins in `applyAccessPolicy`; unit tests and a real-Kong test
- [ ] [backend] Config: `PORTAL_RATE_LIMIT_POLICY` (`cluster` default, `local`) passed to the Kong adapter; document it in `.env.example` and the README
- [ ] [backend] Products API: public list and detail, admin create and update product, create and update plan with per-field validation (AC 2), `api-in-plan`, reconcile job sent after a plan update
- [ ] [backend] Catalog: `ApiSummary.products` on `GET /v1/apis` and API detail
- [ ] [backend] Apps: `appApis` helper; `POST /v1/apps` with `planId`, and refusal of product APIs in `apiIds`; `App.plan`; one active key for product-plan apps; reconcile passes plan limits
- [ ] [backend] Apps: `PUT /v1/apps/{appId}/plan`, `DELETE /v1/apps/{appId}` and `POST …/credentials/{credentialId}/regenerate`, with compensation; unit tests for every failure point (AC 9) and role checks (AC 10)
- [ ] [backend] Regenerate `packages/sdk` from the contract
- [ ] [frontend] Catalog lists products and the APIs in no product; product page with description, APIs and the plan comparison table (rate limit, monthly quota "per calendar month, UTC", included APIs)
- [ ] [frontend] Subscribe on the product page: choose a plan, name the subscription, confirm, show the key once; gateway-unavailable and role errors
- [ ] [frontend] My apps: show each app's plan and limits; change plan (same product), cancel with confirmation, regenerate key with the key shown once; read-only members see no actions
- [ ] [frontend] Admin: product list, create and edit product (APIs from the catalog), add and edit plans with field errors beside each field
- [ ] [qa] Integration tests on real Kong and Postgres for AC 1–10, including the counter carry-over and the migration
- [ ] [qa] Playwright e2e: admin creates a product and plan; developer subscribes, gets 429 on the sixth call, changes plan, regenerates and cancels
- [ ] [qa] Quickstart `docker compose up` still works, with `cluster` policy, and the spec 004 per-API key flow still works for APIs in no product

## UX  _(ui-designer)_
Design: [docs/design/009-api-products-and-plans.md](../design/009-api-products-and-plans.md). No new tokens.
- **Catalog** gains a Products section (`ProductCard`: APIs and plan counts); the APIs section lists only APIs in no product.
- **Product page** `/products/{slug}`: description, APIs, and a `PlanTable` (plans as columns; rate limit, monthly quota, included APIs) that becomes one card per plan below 768px. Subscribe buttons per plan; visitors get **Sign in to subscribe**; Read-only members get a line instead.
- **Subscribe** `/products/{slug}/subscribe?plan=`: plan radios, subscription name, team shown; success opens the existing key dialog on the App page.
- **App page**: plan card with limits, **Change plan…** dialog (same key, warns about dropped APIs), **Regenerate…** per active key (new key shown once, old one revoked), **Cancel subscription…** in a danger zone; product-plan apps show **New key** only with no active key.
- **Admin**: `AdminNav` **Products**, product list, product form, product page with plans, and a plan form with an error summary and per-field messages for every AC 2 case (`inputmode="numeric"` text inputs so 2.5 and -1 reach validation).
- Every gateway error (AC 9) keeps the dialog or form open and says what didn't change; role refusals (AC 10) follow 008.

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/009.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/009.md`. The full report is `docs/uat/009/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/009.md`.

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
