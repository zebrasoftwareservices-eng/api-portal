---
id: 023
title: Create an app shows products first
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-15
linear:            # the one feature issue, e.g. JSO-117 — filled by `node scripts/factory.mjs linear-init 023`
---

# 023 — Create an app shows products first

## Summary
On **Create an app**, developers see the products they can subscribe to first, each with a
**Subscribe** link, and below them only the APIs that are in no product, all unchecked until the
developer picks one, so the form never hands out a plan-free key for an API a product governs.

## Problem
Since spec 009, an API can be reached two ways: through a product plan (rate limit, quota,
approval) or, if it is in no product, through spec 004's per-API key flow. The **Create an app**
form still lists APIs as checkboxes, so a developer can be steered to the per-API flow for an API
that belongs to a product, which would issue a key that skips the plan's limits and any approval
(spec 010). The form also pre-checks the Sample HTTP API when it is the only row, so a developer
can create an app without making a choice. This costs admins control over who calls their APIs
and how much, and leaves developers unsure whether they should subscribe or create an app.

We'll know it's solved when, on the quickstart with one product and the loose Sample HTTP API,
the form shows the product with a **Subscribe** link that leads to its plans, shows the Sample
HTTP API unchecked, and the server refuses any attempt to create an app that names a product's
API.

## Users
- **API consumer (developer):** creates an app or follows a product's Subscribe link.
- **Portal admin:** sees which products can't be subscribed to because they have no plan.

## User stories
- As a developer, I want Create an app to show products first with a Subscribe link, so that I
  get a key on a plan when an API is offered as a product.
- As a developer, I want APIs that are in no product to start unchecked, so that I choose what my
  app can call instead of accepting a default.
- As a portal admin, I want an API in a product never to get a plan-free key from this form, so
  that the product's rate limit, quota and approval always apply.
- As a portal admin, I want a product with no plans to tell me it needs a plan, so that I notice
  before developers get stuck.

## Acceptance criteria
1. **Given** a signed-in developer, a public product "Payments" with a plan, and a published API
   in no product **When** they open Create an app **Then** a Products section comes before the
   APIs section, "Payments" is listed with a **Subscribe** link to its product page (spec 009's
   plan table), and the product has no checkbox and no plan picker on this form.
2. **Given** an API that belongs to any product **When** a developer opens Create an app **Then**
   that API does not appear as a checkbox in the APIs section, and it is shown only under its
   product(s).
3. **Given** the quickstart, where the Sample HTTP API is the only API in no product **When** a
   developer opens Create an app **Then** the Sample HTTP API is listed with its checkbox
   unchecked, and the form can be submitted only after the developer checks it.
4. **Given** the Create an app form with no API checked **When** the developer submits it **Then**
   nothing is created, and the form shows a message beside the APIs section saying to choose at
   least one API or subscribe to a product.
5. **Given** a developer checks the Sample HTTP API and names the app **When** they submit **Then**
   the app is created with spec 004's per-API key flow, the key is shown once, and a call through
   Kong with it to the Sample HTTP API returns the upstream's response.
6. **Given** an API that belongs to a product **When** a client calls the create-app endpoint
   directly with that API's ID (alone or with a loose API), or with any plan field **Then** the
   server returns `409` problem+json naming the API (or `400` problem+json naming the plan field), no app, key or Kong credential is
   created, and the response points to subscribing to the product.
7. **Given** a public product with no plans **When** a developer opens Create an app **Then** the
   product is listed as not available yet, with no working Subscribe link; **and When** a portal
   admin opens the same form **Then** the product shows a message that it needs a plan, with a
   link to add one in the admin products screen.
8. **Given** a product the developer can't see under spec 010's visibility check (Hidden while
   signed out, Internal, or Manual without assignment) **When** they open Create an app **Then**
   that product is not listed, and its APIs are not listed as checkboxes either.
9. **Given** a developer follows a product's **Subscribe** link and subscribes **When** the
   subscription is created **Then** it is a new app with one key and one plan, exactly as spec 009
   decided, and it appears in My apps beside apps created from this form.

## Out of scope
- **Choosing a plan or subscribing on this form.** Subscribing stays on the product page (spec
  009, with spec 010's request flow for approval plans). Cut to keep one subscribe flow.
- **Changing what a subscription is.** A subscription remains a new app with one key and one plan
  (spec 009, decided 2026-11-11). No multi-plan or multi-product apps.
- **Existing apps that already hold a plan-free key for an API now in a product**, including those
  spec 009's migration moved to the built-in default plan. This spec changes only what new apps
  can choose. Follow-up if admins ask for a cleanup.
- **Changing the catalog page.** The catalog already lists products and loose APIs (spec 009).
- **Adding an API to an existing app.** Still not supported (spec 004).
- **Creating plans from this form.** The admin link goes to the existing admin products screen.
- **New gateway behaviour.** No Kong changes beyond refusing the request before any gateway call.

## Open questions
- [x] Should a developer see a product with no plans at all? — Elango
      **Decided:** yes. It stays listed as "Not available yet" with no working Subscribe link, as
      criterion 7 says, so developers know it exists and admins see the prompt to add a plan.
- [x] When no API is outside a product, should the APIs section and the Create button disappear?
      — ui-designer, then Elango
      **Decided:** yes. Hide the APIs checkboxes and the Create button, and show one line under the
      products: every API here is offered as a product, so subscribe to one above. The page stays
      reachable from My apps.
- [x] For a plan behind approval (spec 010), should the Subscribe link read **Request access**?
      — ui-designer
      **Decided:** the link reads **Request access** when every plan of the product needs approval,
      and **Subscribe** otherwise. It goes to the same product page either way.
- [x] Is `400` the right status for a product API on the create-app endpoint? — tech-lead
      **Decided:** `409` problem+json when a named API belongs to a product, because the request is
      valid but conflicts with the API's current product membership (the contract already uses 409
      for state conflicts). A plan field stays a `400` validation error. Criterion 6 is updated.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_

**Shape.** No new endpoint, table or gateway call. The form reads two lists it can already
fetch, `GET /v1/products` (the products the caller can see) and `GET /v1/apis` (published APIs
with their visible `products`). It shows the products first and only the APIs whose `products`
list is empty as checkboxes. The server enforces the same rule on `POST /v1/apps`, so a direct
client gets nothing the form wouldn't give it. No ADR: this applies spec 009's "an API in a
product is reached only through a plan" and spec 010's visibility rule (ADR 0010). It makes no
new lasting choice.

### Components
- `apps/server/src/apps.ts` (`POST /api/v1/apps`): the existing product-membership check moves
  from `400 /problems/validation` to `409 /problems/api-in-product` and gains the `products`
  extension. It stays before `provisionApp`, so no Kong call happens on refusal. Request
  validation names `/planId` when `apiIds` and `planId` arrive together.
- `apps/server/src/products.ts` (`GET /api/v1/products`): the list adds `allPlansRequireApproval`
  and `selfService` to each item. `detail()` already loads the plans and `canSelfSubscribe`.
- `apps/server/src/problem.ts`: `Problem.fields` gains `products?: { id; slug; name }[]`, and the
  handler serialises it like the other extension fields.
- `packages/sdk`: regenerate `src/schema.d.ts` (`pnpm --filter @portal/sdk generate`).
- `apps/portal/components/create-app.tsx` and `app/dashboard/apps/new/page.tsx`: a Products
  section above the APIs section. No pre-checked row unless `?api=<slug>` names a loose API.
  The empty-selection message and the "every API is offered as a product" state are new.
- No change in `packages/db`, `packages/adapter-*` or `deploy/`.

### API contract (`apps/server/openapi.yaml`, updated)
- `GET /v1/products`: `ProductSummary` adds two required fields.
  - `allPlansRequireApproval: boolean`. True when `planCount > 0` and every product plan has
    `requiresApproval`. False when there are no plans.
  - `selfService: boolean`. Moved up from `ProductDetail`, so `ProductDetail` still has it
    through `allOf` and the change is additive.
  - Visibility is unchanged. A developer gets `open`, plus `hidden` when signed in, plus
    `internal` and `manual` products that the team can see. A portal admin gets every product.
- The form derives each product row from those fields. ui-designer owns the copy:

  | Condition | Developer sees | Portal admin sees |
  | --- | --- | --- |
  | `planCount == 0` | "Not available yet", no link (AC 7) | "Needs a plan" + link to `/admin/products/{slug}` |
  | `selfService == false` (manual, assigned) | link to `/products/{slug}`, label from UX | same |
  | `allPlansRequireApproval` | **Request access** → `/products/{slug}` | same |
  | otherwise | **Subscribe** → `/products/{slug}` | same |

  "Portal admin" is `GET /v1/me` `user.role === 'admin'`, which the form already loads.
- `GET /v1/apis`: unchanged. `products` already lists only the products the caller can see, and
  an API whose every product is hidden from the caller is not returned at all
  (`canSeeApi`). So `products.length === 0` is exactly "loose API". That covers AC 2 and AC 8 with
  no extra call.
- `POST /v1/apps` (`createApp`):
  - `apiIds` containing any API that is in a product, alone or mixed with loose APIs, returns
    **409** `application/problem+json`. Shape:
    ```json
    { "type": "/problems/api-in-product", "title": "API offered in a product", "status": 409,
      "detail": "Payments API is offered in a product. Subscribe to Payments instead.",
      "errors": [{ "pointer": "/apiIds/0", "message": "Payments API is in Payments." }],
      "products": [{ "id": "…", "slug": "payments", "name": "Payments" }] }
    ```
    `errors` has one entry per refused API, with its index in `apiIds`. `products` is the
    distinct products, visible to the caller's team, that include those APIs, by name.
  - Check order inside the transaction: name taken → APIs exist (404) → `canSeeApi` (404, so a
    hidden product's API is never named) → product membership (409) → `provisionApp`. The
    membership query is `product_apis` by `api_id`, with no visibility filter, so any product
    blocks the per-API flow. Only the names returned in `products` are filtered.
  - `apiIds` plus `planId`, or any unknown property, returns **400** `/problems/validation` with
    `errors[].pointer` naming the property (`/planId`, `/plan`, …). The schema already has
    `additionalProperties: false` and `oneOf`. The backend makes sure the mapped Ajv error points
    at the offending property, not at `/` or a generic oneOf message.
  - `planId` alone is spec 009's subscribe flow, unchanged. AC 9 relies on it.

### Data model
No changes. `product_apis` (membership), `plans.requires_approval` and `products.visibility`
already hold everything. No migration.

### Gateway adapter calls
None added. Every refusal (409, 400, 404) happens before `provisionApp`, so `upsertConsumer`,
ACL grants and `issueCredential` never run and there is nothing to roll back. The loose-API
success path (AC 5) is the existing spec 004 provisioning, idempotent and tagged as before.

### Risks and how to test them
- **Form and server disagree on what is loose.** Both derive it from `product_apis`. The
  integration test sends the form's exact request for every row the form renders, and expects
  201 for the loose rows and 409 for each product API.
- **Leaking hidden products through the 409.** The visibility check runs before membership, and
  `products` is filtered. Test an API in one visible product and one Internal product: the 409
  names only the visible one. Test an API only in an Internal product: 404.
- **Race with an admin adding the API to a product mid-request.** The check and the inserts share
  one transaction, but the membership row can still commit between them. The window is
  milliseconds and the outcome equals an existing app created a moment earlier, which is out of
  scope. Accepted, not tested.
- **Contract break for callers expecting 400.** Only the portal calls this today. The SDK is
  regenerated in this spec, and the old 400 test in `apps.test.ts` is updated, not deleted.
- **N+1 on `GET /v1/products`.** `detail()` per product already loads plans. The form makes one
  call. Fine at portal scale. No change.
- **Quickstart.** The seeded Sample HTTP API is in no product. Its checkbox now starts unchecked,
  so the quickstart e2e and the demo e2e must check it before submitting. QA runs
  `docker compose up` to confirm AC 5 end to end.

### Tasks
- [ ] [backend] `POST /api/v1/apps`: replace the 400 product-API refusal with 409 `api-in-product`, `errors[]` per refused API (`/apiIds/<i>`, message naming the API title and product), and the `products` extension filtered to the team's visible products; keep the check after `canSeeApi` and before `provisionApp`
- [ ] [backend] `problem.ts`: add `products` to `Problem.fields` and serialise it
- [ ] [backend] Make `apiIds` + `planId`, and any unknown property, return 400 `/problems/validation` whose `errors[].pointer` names that property (`/planId`)
- [ ] [backend] `GET /api/v1/products`: add `allPlansRequireApproval` and `selfService` to each item
- [ ] [backend] Regenerate `packages/sdk/src/schema.d.ts` from `openapi.yaml`
- [ ] [backend] Unit/integration tests in `apps/server`: 409 for a product API alone and mixed with a loose API (no app, key or Kong consumer created); 404 for an API whose only product is hidden; 400 naming `/planId`; `allPlansRequireApproval` true/false/no-plans; update the existing 400 test
- [x] [frontend] Create an app: Products section first (`GET /v1/products`), one row per product with no checkbox and no plan picker, link to `/products/{slug}` labelled per the table above
- [x] [frontend] Products with `planCount == 0`: "Not available yet" with no link for developers; "Needs a plan" with a link to `/admin/products/{slug}` for portal admins
- [x] [frontend] APIs section lists only APIs with empty `products`, all unchecked; drop the single-row pre-check; keep `?api=<slug>` pre-check only for a loose API
- [x] [frontend] Submitting with no API checked creates nothing and shows the message beside the APIs section ("Choose at least one API, or subscribe to a product above"), focus moves to it
- [x] [frontend] No loose APIs: hide the checkboxes and the Create button, show the one-line note under the products
- [x] [frontend] Handle a 409 `api-in-product` (stale page) by showing the detail with links to the returned `products`, and refetching the lists
- [x] [frontend] Component tests in `apps/portal` for the row states, empty-selection message and no-loose-APIs state
- [ ] [qa] Integration: AC 6, a direct `POST /v1/apps` with a product API (alone, mixed) → 409 naming the API, with a plan field → 400 naming it; assert Kong has no new consumer
- [ ] [qa] e2e on the quickstart stack: AC 1–5, Products before APIs, Subscribe link reaches the plan table, Sample HTTP API unchecked, empty submit message, create + key + call through Kong returns upstream response
- [ ] [qa] e2e: AC 7 (no-plan product as developer and as admin), AC 8 (Internal/Manual-unassigned product and its API absent), AC 9 (subscribe via the link creates a new one-plan app listed in My apps); approval-only product shows **Request access**
- [ ] [qa] Update existing quickstart and demo e2e flows that relied on the pre-checked Sample HTTP API

## UX  _(ui-designer)_
Design: [`docs/design/023-create-app-products-first.md`](../design/023-create-app-products-first.md).
The form opens with a **Products** card: one row per visible product with its name, description,
the APIs it includes (from `GET /v1/apis` `products[]`) and one link styled as a secondary button:
**Subscribe**, **Request access** (all plans need approval), **View product** (manual), or, with no
plans, a "Not available yet" badge for developers and "Needs a plan" + **Add a plan** for admins.
Below, "Or create an app for APIs that aren't in a product" keeps today's name/description fields
and lists only loose APIs, all unchecked; an empty submit shows "Choose at least one API, or
subscribe to a product above." When every API is in a product the app form is replaced by a one-line
note; with no products the page is today's form. A stale-page 409 shows the server detail with
"Subscribe to {name}" links and refetches both lists. No new tokens.

## Build notes  _(backend-developer, frontend-developer)_

- Frontend: Products appear before the loose-API form with Subscribe, Request access, View product and role-aware no-plan states; loose APIs start unchecked except a matching `?api=`. Empty selection focuses the invalid checkbox, and stale `api-in-product` refusals keep their product links visible while both lists refresh and refused selections disappear. Portal lint, typecheck and all 393 tests (45 files, including 19 create-app tests) pass; SDK build was required locally before typechecking. QA should explicitly check Sample HTTP API in quickstart/demo journeys; browser and quickstart validation are left to QA.

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/023.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/023.md`. The full report is `docs/uat/023/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/023.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
