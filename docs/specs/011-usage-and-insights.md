---
id: 011
title: Usage meter per app and admin insights
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-14
linear: JSO-239
---

# 011 — Usage meter per app and admin insights

## Summary
Developers see how much of its plan's monthly quota each of their apps has used, and portal admins see
adoption (sign-ups, active apps, top APIs and each new developer's time to first API call),
from request counts the portal collects from Kong.

## Problem
Spec 009 gives every plan a monthly quota that Kong enforces, but nobody can see it coming.
A developer learns they are near the limit only when Kong starts answering 429, and has no way to
tell whether their failures are their own 4xx errors or the API's 5xx errors. The admin running
the portal can't tell whether anyone uses it: how many developers signed up, which apps make calls,
which APIs matter, and how long it takes a new developer to make a first call. Time to first call
is the portal's main promise (target under 10 minutes), and today it is unmeasured.

It is solved when, after 20 calls through Kong, the app's usage bar shows 20 against the plan's
quota within a minute, and the admin can read each new developer's time to first call
(roadmap Sprint 5 demo).

## Users
- **API consumer (developer):** any member of the team that owns the app, including Read-only.
- **Portal admin:** reads the insights page.
- **Hosted demo visitor (spec 006):** a developer on the public live demo; sees the same usage
  meter as in any install.
- **Platform engineer:** runs the quickstart; collection must work against the bundled Kong with
  no extra setup.

## User stories
- As a developer, I want to see my app's calls this month against its plan's quota, so that I
  can act before Kong starts rejecting my requests.
- As a developer, I want my calls split into success, client errors and server errors, so that I
  can tell whether a problem is in my code or in the API.
- As a portal admin, I want to see sign-ups, active apps and the most-called APIs, so that I know
  whether the portal is being adopted and which APIs matter.
- As a portal admin, I want each new developer's time from sign-up to first successful API
  call, so that I can tell whether onboarding (including waiting on email verification) meets
  the under-10-minutes target and spot developers who got stuck.
- As a visitor to the hosted live demo, I want my app's usage meter to work as it would in a
  real install, so that I can judge the product by trying it.
- As a platform engineer, I want usage collected from the Kong I already connected, with nothing
  extra to install, so that the quickstart still works in under five minutes.

## Acceptance criteria
1. **Given** an app subscribed to a plan with a monthly quota of 1,000 and no calls this month
   **When** the developer makes 20 calls through Kong with that subscription's key
   **Then** when the app page is loaded or reloaded within 60 seconds of the last call, it shows a
   usage bar reading 20 of 1,000 calls, with no one starting a collection job by hand.
   (Since spec 009 each subscription is its own app with one plan and one key, there is one bar
   per app.)
2. **Given** an app whose calls this month returned 12 responses in 2xx, 5 in 4xx (including any
   429 rejections from Kong) and 3 in 5xx
   **When** a member of the owning team opens the app page
   **Then** it shows those three counts labelled by status class (2xx, 4xx, 5xx), and their sum
   equals the usage bar's count.
3. **Given** requests sent to a Kong route with no key, an unknown key or a revoked key
   **When** usage is collected
   **Then** no app's counts change, and no stored usage record contains a key value, a request
   header, or a request or response body.
4. **Given** an app with calls on the last day of the previous month (UTC) and calls this month
   **When** the developer opens the app page
   **Then** the usage bar counts only this month's calls and shows the reset date as the first
   day of next month at 00:00 UTC (for example "Resets 1 Dec 2026, 00:00 UTC").
5. **Given** a signed-in developer who is not a member of the team that owns an app, or a
   signed-out visitor
   **When** they request that app's usage from the portal or the server API
   **Then** the server answers with RFC 9457 problem+json (404 for the non-member, 401 for the
   signed-out visitor) and returns no counts. A Read-only member of the owning team does see them.
6. **Given** usage collection has failed for more than 5 minutes (for example Kong can't reach
   the portal)
   **When** a developer opens the app page
   **Then** it shows the last count it has, the time of the last update, and a notice that usage
   may be behind. It never shows the count as 0 because data is missing.
7. **Given** a portal with developer sign-ups, apps and calls across several APIs
   **When** a portal admin opens the insights page
   **Then** it shows, for the last 30 days (rolling, UTC): the number of new sign-ups, the number
   of active apps (apps with at least one call in those 30 days), and up to five APIs with the
   most calls, each with its call count, highest first. Fewer than five APIs with calls shows only
   those. **And given** a portal with no calls in the last 30 days, the page shows 0 active apps
   and "No calls yet" in place of the top APIs, not an error.
8. **Given** developers who signed up in the last 30 days, some of whom have made a successful
   (2xx) call through Kong with a key they created themselves and some of whom have not
   **When** a portal admin opens the insights page
   **Then** it lists each of them, newest sign-up first, with sign-up time (account creation, not
   email verification), first successful call time and the time between them, and shows
   "No call yet" for those without one. Above the list it shows the median time to first call,
   computed over the developers who have made one, next to the 10-minute target and the count of
   developers it covers (for example "4 of 7 developers"); with none, it shows "No calls yet"
   instead of a median. A 2xx try-it call from the portal counts as the first call; a 4xx or 5xx
   call does not. **And given** a developer who joins a team whose apps already make calls
   **When** a teammate's key makes a 2xx call **Then** that developer still shows "No call yet"
   until a key they created or regenerated makes a 2xx call.
9. **Given** a signed-in developer who is not a portal admin
   **When** they request the insights page or its server API
   **Then** the server answers 403 with RFC 9457 problem+json, the page shows no insight data,
   and the developer's navigation shows no link to it.
10. **Given** the adapter conformance suite in `packages/adapter-sdk`
    **When** it runs against the Kong adapter and a real Kong
    **Then** its usage test passes. **And given** a connected adapter that reports usage as
    unsupported (a test adapter in the suite, since only Kong implements usage in this spec),
    the app page and insights page say usage is not available for this gateway instead of
    showing zero.
11. **Given** the hosted live demo (spec 006) with a visitor who has made calls through Kong
    with their app's key
    **When** the visitor opens their app page, then requests the insights page
    **Then** the app page shows that app's usage exactly as in criterion 1, the insights page
    answers 403 as in criterion 9 (only the seeded demo admin sees it, and there is no public
    insights view), **and after** the daily demo reset the visitor's usage records are gone
    along with the rest of the visitor data, so the insights page no longer counts them.

## Out of scope
- **Error spikes per team** (in JSO-239's scope list). Cut to keep this to one pull request
  (Elango, 2026-11-14): alerting on it overlaps with notifications. The app page's status-class
  counts (criterion 2) cover the developer side. Tracked as a follow-up below; the starting
  threshold to evaluate then is a team's 5xx rate over 5% across 15 minutes with at least 50
  requests.
- **Charts over time, daily breakdowns, date-range pickers and CSV export.** One monthly number
  per plan and fixed 30-day admin totals prove the value.
- **Per-operation or per-route usage, latency and response-size metrics.**
- **Usage alerts and emails** (for example at 80% of quota). Later spec on top of spec 007's mail.
- **Usage on AWS API Gateway.** Spec 017 implements the adapter's usage call with usage plans.
- **Usage in the static Vercel demo (spec 002).** It has no backend, so these screens don't
  appear there. The hosted live demo (spec 006) is in scope (criterion 11).
- **A public insights view on the hosted live demo.** The demo behaves like any install: insights
  stay admin-only.
- **Billing or overage of any kind.** Plans are free access tiers (AGENTS.md).
- **Changing how Kong enforces quotas.** The portal displays usage; Kong still decides rejections.
- **Insights per team or per developer beyond time to first call, and staff roles that limit who
  sees insights.** Every portal admin sees insights until spec 015.

## Open questions
- [ ] How long are raw and aggregated usage records kept, and is retention configurable? — tech-lead (ADR)
- [ ] Which collection mechanism (Kong http-log plugin, Prometheus plugin, or polling), and does it
      need any change to the quickstart's Kong config? — tech-lead (ADR)
- [ ] Does the portal's monthly count match Kong's quota counter exactly (Kong's quota period is
      a UTC calendar month, and whether 429-rejected requests count toward it)? If they can differ,
      which one does the usage bar show? — tech-lead
- [ ] Can a spec 009 plan have no monthly quota, and what do built-in-plan apps from spec 004
      show? If a plan has no quota, the bar shows the count with "No monthly limit". — tech-lead,
      from spec 009's data model
- [ ] When a developer changes plan or regenerates the key mid-month (spec 009), does the app's
      count carry on, or restart to match what Kong's quota counter does? — tech-lead, with the
      collection ADR
- [x] Time to first call with team-owned apps (spec 008): a developer invited to a team whose apps
      already make calls would get a near-zero or negative time. — Elango: **follow industry
      practice.** Time to first call is measured per developer, from that person's sign-up to
      their own first successful call
      ([Postman](https://blog.postman.com/the-most-important-api-metric-is-time-to-first-call/),
      [Nordic APIs](https://nordicapis.com/why-time-to-first-call-is-a-vital-api-metric/)), so only
      calls made with a key the developer created or regenerated count; teammates' keys don't.
      (Criterion 8.)
- [ ] Is this one pull request? It covers collection, the app usage bar, the insights page and the
      hosted demo. If the tech lead's design says it won't fit, the cut is the insights list and
      median (criterion 8) into a follow-up spec, but the Sprint 5 demo needs both halves, so the
      recommendation is to keep it whole. — tech-lead, then Elango
- [x] Does "time to first API call" start at sign-up or at email verification, and does a try-it
      call count? — Elango: **starts at sign-up** (account creation), because waiting on
      verification is onboarding friction admins want to see. **Ends at the first 2xx call**
      through Kong with a key the developer created (narrowed for team apps, see below); **try-it calls count**, since
      they are real calls through Kong. (Criterion 8.)
- [x] Do we want error spikes per team, and with what threshold? — Elango: **not in this spec.**
      Follow-up below; evaluate starting at a team's 5xx rate over 5% across 15 minutes with at
      least 50 requests.
- [x] Should the hosted live demo (spec 006) show the insights page publicly? — Elango: **no.**
      The demo behaves like a real product: visitors see their own app usage, insights stay
      admin-only (the seeded admin), and the daily reset clears visitor usage with the rest of
      the visitor data. (Criterion 11.)

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/011-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/011.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/011.md`. The full report is `docs/uat/011/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/011.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR

### Follow-ups
- Error spikes per team — evaluate alerting when a team's 5xx rate is over 5% across 15 minutes with at least 50 requests.
