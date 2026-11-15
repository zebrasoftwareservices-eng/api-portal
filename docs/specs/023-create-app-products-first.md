---
id: 023
title: Create an app shows products first
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
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
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/023-*.md`

## Build notes  _(backend-developer, frontend-developer)_

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
