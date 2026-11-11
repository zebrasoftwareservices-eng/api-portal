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
design findings: JSO-188 (portal, copy and tooling items only; see Out of scope), 214, 215, 226,
227, 228, 229, 230, 231. Spec 019 has merged since these were filed. An issue that is already
fixed on `main` is closed with the commit that fixed it, and its sub-item needs no new code.

## Users
- **API consumer (developer):** catalog, API reference, key dialog, dashboard, sign-in.
- **Portal admin:** API import screen and its gateway banner.
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
- As a contributor, I want tests that don't depend on timing and builds that don't dirty my
  worktree, so that CI failures mean something.

## Acceptance criteria
Grouped by screen. Each sub-item names the issue it closes, and QA writes one regression test per
issue. A fix closes its issue only when its sub-item passes. Viewport widths are CSS pixels in
Chromium; "visible" means inside the viewport without scrolling unless a criterion says otherwise.

1. **Catalog.** **Given** the quickstart or the demo build **When** a visitor opens `/` at 390 px
   and 1280 px **Then** on each card the base URL and **View reference →** are separate elements whose
   bounding boxes don't overlap, and the card's text content has whitespace between them (JSO-162), and the tab title is `APIs · Developer Portal` (JSO-222, JSO-183).

2. **API reference page.** **Given** `/apis/sample` on the quickstart at 1280 px **When** it loads
   and Scalar has rendered **Then**:
   - the version badge's vertical centre lies within the title's bounding box, and **Copy**'s lies within the base-URL line's (design 3.2) (JSO-173);
   - the page has exactly one `h1` and the title isn't shown twice (JSO-224);
   - there is no Developer Tools, Configure, Share or Deploy toolbar (JSO-172, JSO-188);
   - the try-it Authentication **Value** field is empty or shows a hint such as "Paste your API key", never a key-like string (JSO-174);
   - the sidebar lists operations in the document's `paths` order: `/get`, `/post`, `/status/{code}`, `/uuid`, `/headers` (JSO-225);
   - the browser requests the OpenAPI document once per page load (JSO-188).
   **And given** an imported API with `security` on its operations only and none at the document
   root, **when** a signed-in developer with a key opens it, **then** the hint text names the place
   where the key field is shown, and that field accepts a pasted key that reaches the request
   (JSO-175; which fix is an open question).

3. **Key dialog and app page.** **Given** a signed-in developer at 1280×800 **When** they create a
   key **Then** **I've saved it** is visible without scrolling (JSO-192); the header-line copy
   button announces "Header line copied." in a live region, and when the clipboard write is
   rejected it shows an error message in place of the success text (JSO-215; copy from the
   ui-designer); after
   **I've saved it**, the next Tab reaches the **Try your key** button (JSO-182). **And when** they
   cancel or press Escape on the revoke confirmation, focus returns to that **Revoke** button
   (JSO-161). **And given** a browser in America/Los_Angeles, an app and an API both created at
   2026-11-03T05:24Z show "Nov 2, 2026" on the app header, in the keys table and in the admin
   APIs table; in UTC the same records show "Nov 3, 2026" (JSO-166).

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
   **When** they open `/`, `/apis/sample` or `/dashboard` **Then** each shows the portal error
   page — the portal header, a heading and a **Try again** button, not Next.js's default error
   screen (JSO-190), the header shows neither Sign in/Sign up nor an account
   menu (JSO-191), and error copy never says "Nothing was created" for revoke, the admin service
   picker or try-it (JSO-188). **When** the server is healthy again and they select **Try again**
   **Then** within 5 seconds the page shows its normal content without a browser reload (JSO-189).

8. **Not-found pages.** **Given** the quickstart **When** a visitor opens `/quickstart-required`,
   `/admin/apis` as a non-admin, or an unknown app ID **Then** each tab title follows design §5:
   `Developer Portal` for not-found pages, never "Quickstart required" or "Your app" (JSO-223,
   JSO-183). **Given** the demo build **When** a visitor requests `/apis/nope` **Then** the
   response is HTTP 404, not 200 (JSO-228).

9. **Tests and repo hygiene.** **Given** CI on the fix branch **Then**:
   - the demo e2e fails if Scalar's server card or auth card becomes visible, checked by visible text (JSO-226);
   - CI runs `deploy/server-image-smoke.mjs`, the duplicate `playwright.reference.config.ts` is gone, and AGENTS.md lists `pnpm test:e2e:demo` (JSO-229);
   - the version badge test waits for Scalar to render instead of a fixed timeout, and passes 10 runs in a row with `--repeat-each=10` (JSO-231);
   - on a clean checkout, `pnpm build`, and `pnpm dev` started and stopped, leave `git status --porcelain` empty (JSO-230);
   - with `HOSTNAME=myhost` exported, `pnpm dev` serves the portal on `0.0.0.0` (JSO-188);
   - spec 001's answered open questions are ticked (JSO-188).

   **And given** a clean clone with no portal containers or volumes and the base images already
   pulled, **when** `docker compose -f deploy/docker-compose.yml up` runs, **then** `/` returns the
   catalog with the sample API in under five minutes.

## Out of scope
- **New features or new screens.** Fixes match the existing designs. Where a design gap exists, the
  ui-designer settles copy and focus order only.
- **Hosted live demo** (JSO-127, spec 006), **trusted reverse proxy** (JSO-187, spec 006) and
  **hiding credentials from upstreams** (JSO-165, spec 004). JSO-232 moves these out.
- **Navigation and API-page access redesign** (spec 019, merged). Fixes here target `main` as it
  is now, including 019's header, account menu and My apps cards; they don't reopen 019's design.
- **JSO-188's server robustness items**, cut so this stays one pull request and frontend-led:
  no open transaction during Kong calls in app and key creation; reconcile clearing `drift` after a
  failed database update following a Kong revoke; logging the error object (no `pk_` value) when
  compensation fails; boot never overwriting an admin-published API at slug `sample`; boot
  completing after a crash during admin creation; catalog list and slug lookup not loading every
  full OpenAPI document. They need real Kong and Postgres integration work and touch key handling,
  so they go to spec 022, built after 004. JSO-188 stays open until that spec ships,
  so no commit in this spec may name JSO-188 (a merged commit naming it would close it).
- **JSO-213**, spec 002's open Vercel preview check. It is a QA task, not a bug, and it waits for
  the repo to go public.
- **Issues found after this spec is written.** They go to the spec where they were found or to a
  new issue.

## Open questions
- [x] Confirm the cut: JSO-188's six server robustness items leave this spec for a follow-up
  spec after 003 (which number?), and JSO-188 stays open until then. — Elango
  **Answer (Elango, 2026-11-11):** cut confirmed. They become spec 022 (`server-robustness`),
  sprint 2, built after 004, because 004 rewrites the same app/key creation and reconcile code.
- [ ] Spec 019 merged with an account menu, My apps cards at 375 px and breadcrumb changes. Which
  of JSO-163, JSO-181, JSO-182 and JSO-214 does `main` already fix? Close those with the fixing
  commit. — tech-lead
- [ ] JSO-172 and JSO-173 may already be partly fixed (JSO-221 fixed the badge width; JSO-188
  names the Scalar toolbar option). Confirm what's left, and close the issue with a reason if
  nothing is. — tech-lead
- [x] JSO-191: during an outage, should the header show no account state, or the last known one?
  Criterion 7 assumes no account state. — ui-designer, Elango
  **Answer (Elango, 2026-11-11):** no account state. A last-known signed-in header would offer
  actions that fail while the server is down and could show a session that has since ended.
- [ ] JSO-175: fix the hint copy, or make the key field appear for operation-level security?
  — tech-lead, ui-designer
- [ ] JSO-215: what does the copy-failed message say? — ui-designer
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

### Follow-ups
- Follow-up spec: JSO-188 server robustness items cut from 003
  Six server robustness items from the spec 001 review: no open transaction during Kong calls, reconcile clears drift after a failed DB update, compensation logs without secrets, boot never overwrites admin slug sample, boot completes after a crash in admin creation, catalog/slug lookup avoid loading full OpenAPI documents. Cut from 003 to keep one PR.
