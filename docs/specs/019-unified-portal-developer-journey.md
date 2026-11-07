---
id: 019
title: Unified portal — developer journey
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-07
linear: JSO-316
linear_stages: requirements=JSO-353 design=JSO-354 ux=JSO-355 backend=JSO-356 frontend=JSO-357 test=JSO-358 uat=JSO-359 review=JSO-360 release=JSO-361
---

# 019 — Unified portal: developer journey

## Summary
Developers get consistent navigation and an API page that shows the right next step for their
access, the first shippable slice of the
[unified portal UX](../design/jso-316-unified-api-portal.md).

## Problem
A developer moving from reading an API to making a first request has to work out the next step
alone. Every signed-in developer sees **Get an API key** on an API page, even when one of their
apps already has access, so the obvious action leads them to create an app they don't need. The
try-it instruction repeats that advice. The navigation says **Dashboard**, the page says **Your
apps**, and My apps is an unadapted table on a phone. A faster first successful request is what
adoption depends on.

JSO-316 asked for implementation-ready UX, and its design document is committed (f6a782a). That
document covers far more than one pull request, and much of it depends on features that don't
exist yet (specs 005, 009, 010, 012). This spec ships only the part that works on today's API, with
no server or contract change. It is also the migration the design document requires: the shipped
001/004 screens stay authoritative except for the changes the criteria below name.

We'll know it's solved when a developer who already has access is sent to their app instead of
being told to create another, and the journey from the catalog to a successful request works at
375 px with no outside help.

## Users
- **API consumer (developer):** the main audience, from first visit to first request.
- **Visitor:** reads APIs before signing up.
- **Portal admin:** sees the same navigation, plus **Admin**.

## User stories
- As a developer, I want an API page to show the next step for my access, so that I don't create
  an app I don't need.
- As a visitor, I want to go from an API to a key without losing my place, so that signing up
  doesn't interrupt me.
- As a developer, I want to go from an app to making a call in one step, so that I can test
  my new key straight away.
- As a developer on a phone, I want navigation and My apps to work at my screen width, so that I
  can check my apps without zooming or scrolling sideways.
- As a developer, I want the portal to say when it can't confirm my access, so that a temporary
  failure doesn't send me off to create a duplicate app.

## Acceptance criteria
"Has access" means an app in `GET /v1/apps` has this API in its `subscriptions`, whether or not it
has an active key. Plans and approval don't exist yet, so this is the only access state. The access
check has failed when `GET /v1/apps` returns anything other than 200 or 401, or the request fails
at the network level.

| Person on `/apis/{slug}` | Action shown | Goes to |
| --- | --- | --- |
| Signed out | **Get an API key** | Sign-up, then create app with this API selected |
| Signed in, access check running | No access action; see criterion 6 | — |
| Signed in, no app has access | **Get an API key** | Create app with this API selected |
| Signed in, one app has access | **Open in {app name}** | That app's page |
| Signed in, several apps have access | **View your apps** | My apps, with those apps indicated |
| Signed in, access check failed | No access action; see criterion 7 | — |

1. **Given** a visitor, a developer and an admin at 1280 px **When** each opens `/` **Then** the
   navigation links read, in order: visitor APIs, Sign in, Sign up; developer APIs, My apps; admin APIs,
   My apps, Admin. The word Dashboard appears nowhere in the header and `/dashboard` still loads.
   **And** exactly one link has `aria-current="page"`: APIs on `/` and `/apis/{slug}`, My apps on
   `/dashboard` and `/dashboard/apps/{id}`, and Admin on `/admin/apis`.
2. **Given** a signed-in developer at 375 px **When** they open the menu by keyboard, press Tab past
   the last item and close it with **Close menu** or Escape **Then** focus starts on the close
   button, stays inside the menu while it is open, and returns to the menu button. **When** they
   reopen it and select My apps **Then** My apps loads with the menu closed.
3. **Given** a signed-out visitor on an API page **When** they select **Get an API key** and sign up
   **Then** they arrive at create app with that API's checkbox checked and focus in the app name
   field. **Given** a signed-in developer whose apps have no access to that API **When** they select
   **Get an API key** **Then** they reach the same screen in the same state.
4. **Given** a developer with access through exactly one app, including an app whose keys are all
   revoked **When** they open that API's page **Then** the action is **Open in {app name}** and opens
   `/dashboard/apps/{id}`, and "Get an API key" appears nowhere on the page. With an 80-character app
   name at 375 px, the page doesn't scroll sideways.
5. **Given** a developer with access through two apps and a third app without access **When** they
   select **View your apps** **Then** My apps shows text naming the API on both apps with access, not
   color alone, and doesn't show that text on the third. **When** a My apps link names an API none of
   their apps can reach **Then** the normal list loads with no error.
6. **Given** a signed-in developer and `GET /v1/apps` delayed by 5 seconds **When** they open an API
   page **Then** the title, base URL and reference render before the response arrives, and no access
   action is shown. **When** the response arrives **Then** the action from the table appears.
7. **Failure path. Given** a signed-in developer and an access check that fails with 500, 503 or a
   network error **When** they open an API page **Then** the title, base URL and reference still
   render, the page says "Access status couldn't be confirmed" with **Try again**, no access action
   is shown, and no status code or problem detail appears. **When** the check then succeeds and they
   select **Try again** **Then**, without a page reload, the action from the table replaces the
   message and takes keyboard focus, and a value typed into the reference's Authentication Value
   field is still there. **When** the check fails again **Then** the message stays.
8. **Given** each row of the table above **When** the try-it instruction renders **Then** its 403
   recovery step names the action on the page and no other: **Get an API key** when signed out or
   without access, **Open in {app name}** with one app, **View your apps** with several, and no
   action while the check is running or after it has failed.
9. **Given** a developer with three apps, one with an unbroken 80-character name and one with 10 APIs
   **When** they open My apps at 1280 px **Then** the table columns are Name, APIs, Active keys and
   Created. **When** they open it at 375 px **Then** the apps are a list of cards, each with its name,
   APIs, active key count, created date and **Open app**, which opens that app. **And** at 375 px and
   at 640 px (1280 px at 200% zoom), the page's scroll width doesn't exceed its viewport width.
10. **Given** an app with three APIs, tested with and without an active key **When** the developer
    opens its page **Then** every row of its APIs list has **Try this API**, and selecting one opens
    `/apis/{slug}` for that API. The **Try your key** card behaves as it does today.
11. **Given** the static demo build (spec 002) **When** a visitor opens `/` and `/apis/sample` **Then**
    the navigation offers only APIs and **Run the quickstart**, no My apps or access action appears, and
    the browser makes no request to `/api/v1/apps`.

## Out of scope
What we cut from the design document, and where it belongs:

- **Admin overview and local navigation:** only one admin screen exists, so tabs would have a single
  entry. Comes with 005; the **Admin** link keeps pointing at `/admin/apis`.
- **Gateway list, health, sync and secret replacement:** 005 and later; they need new contracts.
- **Access requests, approval states, tier labels and the Request access action:** 009 and 010.
- **"No key required" access state:** the API contract can't tell us an API is public.
- **Key rotation:** no contract yet; 009 owns regenerating keys.
- **Catalog search and filters:** 012. The design says to omit controls until they work.
- **Account settings in the account menu:** 007.
- **Overview / API reference / Access tabs on the API page:** there's no content for Overview or
  Access yet, and tabs risk losing Scalar's request state.
- **Access, Credentials and Updated columns on My apps:** every app has at least one API
  (`CreateAppRequest.apiIds` has `minItems: 1`, and no endpoint removes one), so **No API access**
  can't occur, and "{n} active" would replace the API names shown today. Apps also have no updated
  time. The shipped columns stay until access has more states (JSO-363, with 010).
- **Changes to key handling:** this spec doesn't touch the key reveal or credential API, so the
  checks from 001 and 004 still apply and it adds no new secret criterion.
- **Server, contract and database changes:** none. This is a frontend-only pull request, so the
  backend stage (JSO-356) has no work.
- **New shared component library:** only build what these screens use. `ResponsiveCollection` and
  the other components in design §11.2 are added when their first feature needs them.

## Open questions
- [ ] Is this the right scope for JSO-316? The issue's own criteria are about the design document,
  already committed. This spec adds the first build on top. The alternative is to close JSO-316 on
  the document alone and open a new issue for this slice. — Elango
  - **Recommended:** Keep this slice on JSO-316 and add it to the issue's description.
  - **Reason:** The worktree and all nine stage issues already hang off JSO-316, and a new issue would redo that setup for no benefit.
- [ ] The issue calls `work/api-portal-wireframes.html` the approved direction, but it isn't in the
  repo or its history, and the design document was written without it. Does the document match what
  was approved? Without the file, nobody can check. — Elango
  - **Recommended:** Treat the design document as the source of truth, and add the file to the repo only if you still want it compared.
  - **Reason:** This slice comes from the shipped screens and the document, so the missing file doesn't block it.
- [ ] Should spec 019 get a sprint in `docs/roadmap.md`? It isn't in the reserved table, so `next`
  won't list it. I left the roadmap unchanged because scheduling it would move sprint plans. — Elango
  - **Recommended:** Add it to Sprint 1 as an extra feature, started when 003 reaches testing.
  - **Reason:** Later sprints don't move, and 003's frontend fixes may touch the same screens, so running them side by side risks conflicts.
- [ ] A signed-out developer who already has an app can select **Get an API key**, follow **Sign in**
  from the sign-up page and land on create app, because the sign-in link keeps the same return path.
  Should sign-in return to the API page instead? — Elango
  - **Recommended:** Yes, return to the API page after sign-in, and add this to criterion 3.
  - **Reason:** Otherwise existing developers can still be led to create the duplicate app this spec exists to prevent.
- [ ] How long should the portal wait for the access check? The portal's API client has no request
  timeout today, so a stalled call would leave the page with no action and no message. — Elango
  - **Recommended:** Treat 10 seconds with no response as a failed check, and add this to criterion 7.
  - **Reason:** The failure message already gives developers a way to recover, and the reference stays usable during the wait.
- [ ] What should the API page do if the session has ended and `GET /v1/apps` returns 401? — Elango
  - **Recommended:** Show the signed-out row of the table.
  - **Reason:** A 401 is a definite answer that the session has ended, so there's no failure to report and the signed-out action still works.
- [ ] Should **View your apps** filter My apps or highlight the matching apps? Design §6.2 says
  "filtered/highlighted"; criterion 5 accepts either. — Elango, with the ui-designer
  - **Recommended:** Highlight, with text on the matching apps, and keep every app in the list.
  - **Reason:** A filter also needs a clear control and its own states, which is more to build for very little gain.
- [ ] Should the My apps heading and breadcrumbs become "My apps"? The design's route map says My apps
  but its wireframes still say "Your apps". This spec changes only the navigation label until
  this is decided. — Elango, with the ui-designer
  - **Recommended:** Yes, rename the headings, breadcrumbs and page title, and keep the action label **View your apps**.
  - **Reason:** The Problem section names this mismatch, and changing only the navigation label would leave it in place.
- [ ] What is the exact 403 recovery copy for each row of the access table? Design §6.2 gives one
  sentence, written before these variants. — Elango, with the ui-designer
  - **Recommended:** Without access: "If you get a 403, select Get an API key to create an app that includes this API." One app: "If you get a 403, select Open in {app name} and use one of its active keys." Several apps: "If you get a 403, select View your apps and use a key from an app with access." Check running or failed: "If you get a 403, use a key from an app that includes this API."
  - **Reason:** Each sentence names only what's on the page, as criterion 8 requires.
- [ ] Design §7.2 (gateway setup: page or dialog) and §7.4 (where import lives) still defer to a
  feature spec, although the issue asks for no unresolved UX decisions. They don't affect this slice
  but must be settled in 005. — Elango, with the ui-designer and the 005 product manager
  - **Recommended:** Settle both in spec 005, tracked in JSO-362, and don't hold 019 for them.
  - **Reason:** 005 is the first feature that needs these screens, and nothing in this slice depends on them.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/NNN-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
| Criterion | Test file | Result |
| --- | --- | --- |

### Bugs
<!-- One line per bug, each with its Linear issue: - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Screenshot |
| --- | --- | --- |

## Review  _(tech-lead)_

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
