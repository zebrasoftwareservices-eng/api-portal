---
id: 003
title: Backlog fixes from specs 001 and 002
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-11
linear: JSO-232
---

# 003 — Backlog fixes from specs 001 and 002

## Summary
Developers, admins and contributors get a portal with the open bugs and review findings from specs
001 and 002 fixed, so later features don't build on a broken base.

## Problem
Specs 001 and 002 shipped with 25 minor user-testing bugs and 9 review findings still open
(JSO-232 lists them). None of them stop the quickstart journey. Together they make the first run
look unfinished, and first impressions matter for adoption. Examples: the key dialog hides its
only close button at 1280×800, **Try again** never recovers after an outage, error titles show raw
codes such as "api slug taken", and dates are a day ahead for anyone west of UTC. A few
review findings also leave tests that rely on timing and server code that can leave stale state.

**Solved when** every issue below is Done, or moved out with a written reason, and the
quickstart still comes up in under five minutes with lint, typecheck, unit, integration and e2e
green (JSO-232 "Done when").

Issues in scope. Spec 001 UAT: JSO-161, 162, 163, 166, 172, 173, 174, 175, 176, 177, 178, 179,
180, 181, 182, 183, 184, 189, 190, 191, 192. Spec 002 UAT: JSO-222, 223, 224, 225. Reviews and
design findings: JSO-188, 214, 215, 226, 227, 228, 229, 230, 231.

## Users
- **API consumer (developer):** catalog, API reference, key dialog, dashboard, sign-in.
- **Portal admin:** API import screen and its gateway banner.
- **Platform engineer:** server robustness at boot and during Kong outages.
- **Contributor:** stable tests and a clean worktree after a build.

## User stories
- As a developer, I want the API page, key dialog and dashboard to look and behave as designed,
  so that I trust the portal and finish getting a key without guessing.
- As a keyboard or screen-reader user, I want focus and announcements to land where the design
  says, so that I don't lose my place.
- As a developer, I want the portal to recover on its own after a server outage and not claim I'm
  signed out, so that a short outage doesn't look like lost work.
- As an admin, I want import errors that say what went wrong and where, and that clear on the next
  submit, so that I can fix my document fast.
- As a platform engineer, I want Kong calls and boot steps that don't leave stuck state, so that a
  crash or outage heals without manual cleanup.
- As a contributor, I want tests that don't depend on timing and builds that don't dirty my
  worktree, so that CI failures mean something.

## Acceptance criteria
Grouped by screen. Each sub-item names the issue it closes, and QA writes one regression test per
issue. A fix closes its issue only when its sub-item passes.

1. **Catalog.** **Given** the quickstart or the demo build **When** a visitor opens `/` at 390 px
   and 1280 px **Then** each card shows the base URL and **View reference →** apart, with no text
   running together (JSO-162), and the tab title is `APIs · Developer Portal` (JSO-222, JSO-183).

2. **API reference page.** **Given** `/apis/sample` on the quickstart at 1280 px **When** it loads
   and Scalar has rendered **Then**:
   - the version badge sits beside the title and **Copy** on the base-URL line, as in design 3.2 (JSO-173);
   - the page has exactly one `h1` and the title isn't shown twice (JSO-224);
   - there is no Developer Tools, Configure, Share or Deploy toolbar (JSO-172, JSO-188);
   - the try-it Authentication **Value** field is empty or shows a hint such as "Paste your API key", never a key-like string (JSO-174);
   - the sidebar lists operations in the document's `paths` order: `/get`, `/post`, `/status/{code}`, `/uuid`, `/headers` (JSO-225);
   - the browser requests the OpenAPI document once per page load (JSO-188).
   **And given** an imported API with `security` on its operations only, **then** the portal's hint
   matches where the key field actually appears (JSO-175).

3. **Key dialog and app page.** **Given** a signed-in developer at 1280×800 **When** they create a
   key **Then** **I've saved it** is visible without scrolling (JSO-192); the header-line copy
   button announces "Header line copied." and shows a message if the copy fails (JSO-215); after
   **I've saved it**, the next Tab reaches the **Try your key** button (JSO-182). **And when** they
   cancel or press Escape on the revoke confirmation, focus returns to that **Revoke** button
   (JSO-161). **And given** a browser in America/Los_Angeles, an app created at 2026-11-03T05:24Z
   shows "Created Nov 2, 2026" in the header, the keys table and the admin APIs table (JSO-166).

4. **Header and dashboard.** **Given** a signed-in developer **When** they open `/dashboard`
   **Then** the account menu is the designed dropdown (email, separator, **Sign out**) with no
   disclosure triangle (JSO-163); at 390 px each app card labels its active-key count and created
   date (JSO-181); and a page with no breadcrumb has no "Breadcrumb" landmark (JSO-214). **And
   when** sign-out fails, including when its code can't load, the "We couldn't sign you out. Try
   again." toast shows (JSO-227).

5. **Sign-in and session.** **Given** `/sign-in` **When** a developer enters a wrong password
   **Then** the password field is cleared and focused (JSO-179). **Given** a developer whose
   session ended in another tab **When** they select **Create key** **Then** they reach
   `/sign-in?next=…` with the toast "Your session has ended. Sign in to continue." (JSO-180).

6. **Admin import (failure paths).** **Given** an admin on `/admin/apis` **When** an import fails
   **Then**:
   - alert titles use the design's sentence-case copy, such as "Gateway unavailable", and slug and URL errors appear on the field only, not also in an alert (JSO-176); create-key and revoke-key outages use the same title;
   - a new submit clears the previous success or error, even when it stops at field validation (JSO-177);
   - malformed YAML reports the line and column of the first error (JSO-184);
   - a title with no ASCII letters gives a message saying the slug can't be derived and asking for one, not a generic 400 (JSO-188).
   **And given** Kong was down and is back, **when** the admin selects **Refresh list**, **then** the
   Kong-down banner clears (JSO-178).

7. **Server outage (failure path).** **Given** a signed-in developer and the server stopped
   **When** they open `/`, `/apis/sample` or `/dashboard` **Then** each shows the styled portal
   error page with the header (JSO-190), the header shows neither Sign in/Sign up nor an account
   menu (JSO-191), and error copy never says "Nothing was created" for revoke, the admin service
   picker or try-it (JSO-188). **When** the server is healthy again and they select **Try again**
   **Then** the page loads without a manual reload (JSO-189).

8. **Not-found pages.** **Given** the quickstart **When** a visitor opens `/quickstart-required`,
   `/admin/apis` as a non-admin, or an unknown app ID **Then** each tab title follows design §5:
   `Developer Portal` for not-found pages, never "Quickstart required" or "Your app" (JSO-223,
   JSO-183). **Given** the demo build **When** a visitor requests `/apis/nope` **Then** the
   response is HTTP 404, not 200 (JSO-228).

9. **Server robustness (JSO-188).** **Given** the integration suite with real Kong and Postgres
   **Then**, each as its own test:
   - no database transaction stays open while a Kong call is in flight during app or key creation;
   - when the database update fails after a Kong revoke, the next reconcile clears the `drift` warning;
   - a failed compensation step logs the error object, with no `pk_` value;
   - restarting the server never overwrites an API an admin published at slug `sample`;
   - a crash during admin creation doesn't stop the next boot from completing;
   - listing the catalog and looking up a slug don't load every full OpenAPI document;
   - `pnpm dev` binds the portal to all interfaces even when `HOSTNAME` is exported.

10. **Tests and repo hygiene.** **Given** CI on the fix branch **Then**: the demo e2e fails if
    Scalar's server card or auth card becomes visible, checked by visible text (JSO-226); CI runs
    `deploy/server-image-smoke.mjs`, the duplicate `playwright.reference.config.ts` is gone, and
    AGENTS.md lists `pnpm test:e2e:demo` (JSO-229); the version badge test passes after waiting
    for Scalar to render (JSO-231); `pnpm dev` and `pnpm build` leave `git status` clean
    (JSO-230); spec 001's answered open questions are ticked (JSO-188); and the quickstart
    reaches a loaded home page in under five minutes.

## Out of scope
- **New features or new screens.** Fixes match the existing designs. Where a design gap exists, the
  ui-designer settles copy and focus order only.
- **Hosted live demo** (JSO-127, spec 006), **trusted reverse proxy** (JSO-187, spec 006) and
  **hiding credentials from upstreams** (JSO-165, spec 004). JSO-232 moves these out.
- **Navigation and API-page access redesign** (spec 019). 019 starts when this spec reaches
  testing and may restyle the same header and API page; this spec fixes them as designed today.
- **JSO-213**, spec 002's open Vercel preview check. It is a QA task, not a bug, and it waits for
  the repo to go public.
- **Issues found after this spec is written.** They go to the spec where they were found or to a
  new issue.

## Open questions
- [ ] Is 34 issues one pull request? If the tech lead thinks not, split the server items in
  criterion 9 (JSO-188) into their own spec, built after the frontend fixes. — tech-lead, Elango
- [ ] JSO-172 and JSO-173 may already be partly fixed (JSO-221 fixed the badge width; JSO-188
  names the Scalar toolbar option). Confirm what's left, and close the issue with a reason if
  nothing is. — tech-lead
- [ ] Spec 019 changes the header, account menu, API page action and responsive My apps. Should
  JSO-163 (account menu) and JSO-181 (mobile cards) move to 019 so the work isn't done twice?
  — Elango, tech-lead
- [ ] JSO-191: during an outage, should the header show no account state, or the last known one?
  The issue offers "neither" as an example. — ui-designer
- [ ] JSO-175: fix the hint copy, or make the key field appear for operation-level security?
  — tech-lead, ui-designer
- [ ] JSO-230: commit `apps/portal/AGENTS.md` and `next-env.d.ts` as Next writes them, or
  ignore them? — tech-lead
- [ ] JSO-228 asks only for the demo build. Should live `/apis/<unknown>` also return 404, since
  the same streaming applies? — tech-lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/003-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/003.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/003.md`. The full report is `docs/uat/003/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/003.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
