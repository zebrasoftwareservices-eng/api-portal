---
id: 009
title: API products and free plans with rate limits
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
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
- [ ] Is a subscription a new kind of app (one key, one plan), or does an existing app subscribe
      to a plan? This decides the data model and the My apps screen. — tech-lead, then Elango
- [ ] What happens to apps created before this spec, which call APIs with no plan (spec 004)?
      Options: move them to a default unlimited plan, or leave them as they are until the
      developer subscribes. — Elango
- [ ] Does the catalog list only products, or products plus APIs that are in no product? And can
      a developer still get a key for an API that is in no product? — Elango
- [ ] Can a team hold two subscriptions to the same product (for example staging and production)?
      — Elango
- [ ] Does a monthly quota reset on the first of the calendar month in UTC, or on a rolling
      30-day window? Kong's `month` window decides what is cheap; the plan table must say which.
      — tech-lead
- [ ] Which Kong rate-limiting policy (`local`, `cluster` or `redis`) the quickstart uses, and
      what we tell operators running several Kong nodes, where `local` counts per node. — tech-lead,
      in the plan → Kong mapping ADR

Kong evidence for scope: the open-source rate-limiting plugin supports per-second, per-minute and
per-month limits in one plugin and can be scoped to a consumer and a service together
(<https://developer.konghq.com/plugins/rate-limiting/>, plugin scoping:
<https://developer.konghq.com/gateway/entities/plugin/#scoping-plugins>). Access to a plan's APIs
reuses spec 004's ACL groups.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/009-*.md`

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
