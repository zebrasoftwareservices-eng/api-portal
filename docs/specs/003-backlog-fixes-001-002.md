---
id: 003
title: Backlog fixes from specs 001 and 002
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
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
Frontend-led fix bundle on `main` at `bf1b1c9` (specs 008 and 019 merged). No new screens,
no new tables, no new dependencies, no gateway calls. Two small server changes back
criterion 6 and JSO-175. No ADR: nothing here is a lasting architecture choice.

**Answers to the tech-lead open questions**
- **019 on `main`.** JSO-181 is fixed by `36f6aa2` (My apps cards carry `<dt>` labels for
  APIs, Active keys and Created); close it with that commit after QA's regression test passes.
  JSO-163 is not fixed (`header.tsx` still uses `<details>`/`<summary>`), JSO-214 is not fixed
  (`PageHeader` always renders `<nav aria-label="Breadcrumb">`), JSO-182 is not fixed (the
  reveal dialog does not hand focus to **Try your key**). Those three get tasks.
- **JSO-172 / JSO-173.** JSO-172 is not fixed: `reference.tsx` doesn't set
  `showDeveloperTools`, and Scalar 1.46 defaults it to `'localhost'`, so the toolbar shows on
  the quickstart. JSO-221 fixed the badge width only; the vertical alignment in design 3.2 is
  still open. Both get tasks.
- **JSO-175.** Make the key field appear. The server already adds `portalApiKey` at the top
  level when a document has no `apiKey` scheme; it now also applies the document's first
  `apiKey` scheme at the top level when the document has one but no root `security`. Kong
  key-auth guards the whole service, so this is true of every operation. Operation-level
  `security` (including `security: []`) is unchanged. The hint keeps naming Authentication.
- **JSO-230.** Ignore them. Next 16 rewrites `next-env.d.ts` differently for `dev` and `build`
  and writes `apps/portal/AGENTS.md`; neither is source. Untrack `next-env.d.ts`, add both to
  `apps/portal/.gitignore`, and make the portal `typecheck` script `next typegen && tsc --noEmit`
  so a clean checkout still typechecks.
- **JSO-228.** Yes, live `/apis/<unknown>` (and `/apis/<slug>/versions/<unknown>`) also
  return 404. The cause is the same in both builds: the route's `loading.tsx` opens a Suspense
  boundary, the 200 shell streams, and `notFound()` arrives too late to set the status.

**Components**
- `apps/portal` — almost every fix (criteria 1–8): header, `PageHeader` use, reference page,
  key dialog, app detail, dashboard, auth form, admin import, error and not-found pages,
  `DateValue`, middleware, ingress, build hygiene.
- `packages/ui` — `PageHeader` renders the breadcrumb `nav` only when `breadcrumb` has items
  (JSO-214); `CopyButton` gets an `announce` / `failedMessage` pair and a live region (JSO-215).
- `apps/server` — `import.ts` (YAML line/column, slug-required) and `catalog.ts` (JSO-175).
- `packages/sdk` — regenerate from the contract (descriptions and one new problem type only).
- `.github/workflows/ci.yml`, `AGENTS.md`, `apps/portal/playwright.reference.config.ts`
  (deleted), `docs/specs/001-*.md` open-question ticks (JSO-229, JSO-188 tooling items).

**API contract** (`apps/server/openapi.yaml`, updated in this stage)
- `GET /v1/apis/{slug}/openapi.json` (and the version variant, which shares the transform):
  if the document has an `apiKey` scheme and no top-level `security`, the first `apiKey`
  scheme is applied at the top level. Response shape unchanged.
- `POST /v1/admin/apis` → `422 /problems/slug-required` when no `slug` is given and
  `info.title` yields no valid slug (fewer than 2 `[a-z0-9]` characters after slugifying).
  `title: "Slug required"`, `detail: "We can't make a slug from this API's title. Enter a slug."`,
  `errors: [{ pointer: "/slug", message: "Enter a slug. The title has no letters or digits to make one from." }]`.
  Today this escapes as a ZodError → generic 400.
- `POST /v1/admin/apis` and `POST /v1/admin/apis/{slug}/versions` → `422 /problems/invalid-openapi`
  for a YAML/JSON syntax error now carries `errors[0].line` and `errors[0].column` (1-based,
  from `YAMLParseError.linePos[0]`), and `detail` reads
  `Invalid OpenAPI document: <reason> at line <l>, column <c>`. `Problem.errors[].line/column`
  descriptions widened to cover this. Schema-level errors keep `pointer` only.

**Data model** — none. No migration.

**Adapter calls** — none. No Kong behaviour changes; key create/revoke code is not touched
except for the error *title* the portal shows.

**Design per issue (portal)**
- *Server outage (JSO-189, 190, 191).* `lib/server.ts#currentUser()` returns
  `{ state: 'signed-in', user } | { state: 'signed-out' } | { state: 'unknown' }`; network
  failure or 5xx from `/v1/me` is `unknown`, a 401 is `signed-out`. `Providers` carries the
  state; `Header` renders no account area (no Sign in/Sign up, no menu) when `unknown`.
  One client component `ServerUnavailable` (portal heading "We can't reach the portal server",
  copy per ui-designer, **Try again**) is used by `app/error.tsx`, a new `app/global-error.tsx`
  (renders its own `<html>`, header markup and the component, as the backstop when the layout
  throws), and a new `app/unavailable/page.tsx`. Middleware no longer returns the plain-text
  503: for a protected page with the server down it `NextResponse.rewrite`s to `/unavailable`
  with status 503, so the URL stays `/dashboard`. **Try again** does
  `startTransition(() => { router.refresh(); reset?.(); })` — `refresh` re-runs middleware and
  server components, so a recovered server renders the real page with no reload. The `/`
  and `/apis/[slug]` pages throw on a network error so they hit `error.tsx`.
- *"Nothing was created" (JSO-188 copy).* Revoke, the admin service picker and try-it use
  their own outage copy (ui-designer), never the create-flow sentence.
- *Reference page (JSO-172, 173, 174, 188, 224, 225).* Scalar configuration adds
  `showDeveloperTools: 'never'`, `operationsSorter` as a function that orders by the operation's index in
  `Object.keys(document.paths)` then method order in the path item, and an
  `authentication.securitySchemes[<scheme>]` entry with an empty value for each `apiKey` scheme
  so the Value field shows Scalar's placeholder, never a key-like example. Hide Scalar's
  intro `h1` (title) with a scoped `display: none` rule, so the portal `PageHeader` `h1` is the only
  one and the title isn't shown twice; prefer a Scalar option if 1.46 has one. Badge and
  **Copy** alignment is CSS in `VersionRow`/`CodeValue` (`align-items: center` on the title and
  base-URL rows). For the double document fetch: on a production build, find the second
  request (likely `ApiAccessProvider` or a remount of `Reference`) and make it one; the test
  counts requests to `/api/v1/apis/sample/openapi.json` per load.
- *Not found returns 404 (JSO-228).* Remove `app/apis/[slug]/loading.tsx` and
  `app/apis/[slug]/versions/[version]/loading.tsx` so `notFound()` runs before the first byte;
  keep a loading state inside the page with a Suspense boundary around `Reference` only,
  below the API lookup. Tab titles (JSO-183, 222, 223): catalog sets
  `metadata.title = 'APIs'`; not-found pages, `/quickstart-required` and an unknown app ID
  use the default `Developer Portal`.
- *Catalog card (JSO-162).* Base URL and **View reference →** become sibling block elements
  with a gap; no shared inline run.
- *Dates (JSO-166).* `DateValue` becomes a client component that formats with the browser's
  time zone (`Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })`, no `timeZone`); the
  server render prints the UTC date and the `<time>` has `suppressHydrationWarning`.
- *Key dialog and app page (JSO-161, 182, 192, 215).* Dialog content gets
  `max-height: calc(100dvh - 2rem)` with the body scrolling and the footer (**I've saved it**)
  outside the scroll area, so it is visible at 1280×800. On close after **I've saved it**,
  `onCloseAutoFocus` focuses the **Try your key** heading (`tabIndex={-1}`), so the next Tab
  reaches its first button. The revoke `AlertDialog` returns focus to the **Revoke** button
  that opened it (keep a ref per key id; `onCloseAutoFocus` → that button). `CopyButton` writes
  "Header line copied." to a polite live region; on a rejected `navigator.clipboard.writeText`
  it shows the ui-designer's failure message instead.
- *Header (JSO-163, 227).* Account menu becomes `DropdownMenu` from `@portal/ui` (trigger =
  email, items: email label, separator, Profile, **Sign out**). Sign-out wraps the dynamic
  `import('../lib/client')` and `signOut()` in one try/catch; any failure shows the toast.
- *Sign-in and session (JSO-179, 180).* Wrong password clears and focuses the password field.
  A 401 from create-key (and other app actions) sends the user to
  `/sign-in?next=<current path>` and shows "Your session has ended. Sign in to continue."
- *Admin import (JSO-176, 177, 178, 184, 188).* `ProblemAlert` maps codes to sentence-case
  titles (`gateway-unavailable` → "Gateway unavailable", etc.) and never shows the raw code.
  `validation`, `api-slug-taken` and `slug-required` errors render on the field only. Submit
  clears the previous success and error before validation. `invalid-openapi` with
  `line`/`column` shows "Line L, column C: <message>". **Refresh list** refetches gateway
  services and clears the Kong-down banner on success. Create-key and revoke-key outages use
  "Gateway unavailable".
- *Hygiene (JSO-188 tooling, 229, 230, 231, 226).* `ingress/start.ts` binds to
  `process.env.PORTAL_HOST || '0.0.0.0'`, not `HOSTNAME` (macOS and some shells export
  `HOSTNAME`); the Docker image keeps working because it doesn't rely on `HOSTNAME` for the
  ingress. CI adds a step `node deploy/server-image-smoke.mjs` in `compose-smoke`.

**Risks and how to test them**
- *Scalar options drift between minor versions.* Pin behaviour with e2e on visible text
  (JSO-226): fail if "Developer Tools", "Configure", "Share", "Deploy", a server card or an
  auth card is visible; check sidebar order and the single `h1`.
- *`router.refresh()` after an outage may serve a cached RSC payload.* QA test: stop the
  server, load each page, start it, select **Try again**, expect content within 5 s without a
  navigation event (`page.on('framenavigated')` count unchanged).
- *Middleware rewrite with status 503 must not break the healthy path.* `outage-smoke.mjs`
  plus a unit test of middleware for both states.
- *Removing route `loading.tsx` slows first paint on `/apis/[slug]`.* The API lookup is one
  fast call; the Suspense boundary around Scalar keeps its loading state. Assert 404 status
  for unknown slugs in both builds.
- *Hydration mismatch from local-time dates.* Covered by `suppressHydrationWarning` on the
  `<time>` only; test in `America/Los_Angeles` and `UTC` with Playwright `timezoneId`.
- *JSO-175 changes the served document.* Unit test in `catalog.test.ts`: op-level-only
  security gets a root `security`; a document with root security or `security: []` on an
  operation is unchanged there.
- *Commit messages.* No commit in this spec may name JSO-188 (it stays open for spec 022).

### Tasks
- [x] [backend] `import.ts`: return `422 /problems/slug-required` (pointer `/slug`) when no slug is given and the title yields none (JSO-188 slug item); unit test with a title like "日本語 API".
- [x] [backend] `import.ts`: YAML/JSON syntax errors return `invalid-openapi` with `errors[0].line`/`column` and "at line L, column C" in `detail` (JSO-184); unit test with malformed YAML.
- [x] [backend] `catalog.ts`: apply the first `apiKey` scheme at top level when the document has one but no root `security` (JSO-175); unit tests per the risk above.
- [x] [backend] Regenerate `packages/sdk` (`pnpm --filter @portal/sdk generate`) and typecheck it.
- [x] [frontend] Server outage: tri-state `currentUser`, header with no account state when unknown, `ServerUnavailable` in `error.tsx`, new `global-error.tsx` and `/unavailable`, middleware rewrite with 503, **Try again** = refresh + reset (JSO-189, 190, 191).
- [x] [frontend] Reference page: `showDeveloperTools: 'never'`, document-order `operationsSorter`, empty auth value, single `h1`, badge/Copy alignment, one document request per load (JSO-172, 173, 174, 224, 225; JSO-188 toolbar and fetch items).
- [x] [frontend] 404 status: remove route `loading.tsx` for `apis/[slug]` and its version route, Suspense around `Reference` only (JSO-228, demo and live).
- [x] [frontend] Tab titles: catalog `APIs · Developer Portal`; not-found, `/quickstart-required` and unknown app ID use `Developer Portal` (JSO-183, 222, 223).
- [x] [frontend] Catalog card: base URL and **View reference →** as separate, spaced elements (JSO-162).
- [x] [frontend] `DateValue` in the browser's time zone (JSO-166).
- [x] [frontend] Key dialog fits 1280×800 with **I've saved it** visible; focus to **Try your key** after close; revoke dialog returns focus to its **Revoke** button (JSO-192, 182, 161).
- [x] [frontend] `CopyButton` live-region announcement and clipboard-failure message (JSO-215; copy from ui-designer).
- [x] [frontend] `PageHeader` renders the Breadcrumb nav only with items (JSO-214).
- [x] [frontend] Account menu as `DropdownMenu`; sign-out failure toast covers import failure (JSO-163, 227).
- [x] [frontend] Sign-in wrong password clears and focuses the field; 401 on app actions → `/sign-in?next=…` with the session-ended toast (JSO-179, 180).
- [x] [frontend] Admin import: sentence-case titles, field-only slug/URL errors, clear on submit, line/column display, slug-required on the field, **Refresh list** clears the Kong banner, "Gateway unavailable" for key outages (JSO-176, 177, 178, 184; JSO-188 slug item).
- [x] [frontend] Outage copy: no "Nothing was created" on revoke, admin service picker or try-it (JSO-188 copy item).
- [x] [frontend] Hygiene: ingress binds `PORTAL_HOST || 0.0.0.0`; ignore `next-env.d.ts` and `apps/portal/AGENTS.md`, typecheck runs `next typegen` first; delete `playwright.reference.config.ts`; CI runs `deploy/server-image-smoke.mjs`; AGENTS.md lists `pnpm test:e2e:demo`; tick spec 001's answered open questions (JSO-188 tooling items, JSO-229, JSO-230).
- [x] [qa] One regression test per issue in scope (criteria 1–9), named by issue key; JSO-181 test confirms `36f6aa2` and closes it.
- [x] [qa] Demo e2e fails on visible Scalar server/auth card text (JSO-226); version-badge test waits for Scalar render and passes `--repeat-each=10` (JSO-231).
- [x] [qa] Outage e2e: stop server, check `/`, `/apis/sample`, `/dashboard` error page and header, restart, **Try again** recovers within 5 s with no navigation (JSO-189, 190, 191).
- [ ] [qa] Dates in `America/Los_Angeles` and `UTC` via `timezoneId` (JSO-166); 404 status for unknown slug in demo and live (JSO-228).
- [x] [qa] Clean-checkout `pnpm build` and `pnpm dev` start/stop leave `git status --porcelain` empty; `HOSTNAME=myhost pnpm dev` serves on `0.0.0.0` (JSO-230, JSO-188 tooling).
- [ ] [qa] Full suite plus clean-clone `docker compose up` serves the catalog with the sample API in under five minutes.
- [x] [backend] Fix: First try-it request returns 200 for an unsubscribed API key after import
## UX  _(ui-designer)_
Design: [`docs/design/003-backlog-fixes-001-002.md`](../design/003-backlog-fixes-001-002.md). No new tokens.
- One new screen, **Portal server unavailable** (`ServerUnavailable` in `error.tsx`, `global-error.tsx`
  and `/unavailable`): h1 "We can't reach the portal server", **Try again** recovers in place, and the
  header shows no account area while the session is unknown.
- Key dialog has a fixed footer so **I've saved it** is always visible; header-line copy announces
  "Header line copied." or shows "Couldn't copy the header line. Select it and press Ctrl+C (⌘C on Mac)."
- Focus targets for every fix (Try your key heading, Revoke button, password field, Slug field);
  account menu as `DropdownMenu`; no empty Breadcrumb `nav`.
- Admin import: code → sentence-case title map, field-only slug/URL errors, clear on submit,
  "Line L, column C: …", slug-required copy, **Refresh list** clears the Kong banner.
- Outage copy for revoke, create key, service picker and try-it never says "Nothing was created".

## Build notes  _(backend-developer, frontend-developer)_

- Backend: import now returns the contracted slug-required problem for generated slugs with fewer than two ASCII letters/digits, and syntax errors include the first YAML parser line/column for both API and version imports. `日本語 API` correctly derives `api`; the no-slug regression uses `日本語`, with mixed-title and explicit-slug coverage too.
- Backend: public documents without root security now apply their first existing apiKey scheme, preserving explicit root and operation security; the SDK was regenerated from the existing contract. All four backend tasks are complete; no Bugs lines or spec status changed.
- Backend validation: server and SDK lint/typecheck passed; server tests passed 211/211 across 15 files, including 11 new import/catalog regressions, and SDK test passed with no test files. Build dependency packages first on a clean worktree; local container tests needed Docker Desktop started and `DOCKER_HOST=unix:///Users/elangodhanasekaran/.docker/run/docker.sock` with sandbox access to Docker.

- Frontend: implemented tri-state sessions and shared outage screens/retry, reference ordering/auth/title and document reuse, route-local reference loading, default not-found titles, spaced catalog links, browser-zone dates, key-dialog scrolling/focus, accessible copy feedback, account menus/sign-out recovery, session-ended handoff and admin-import validation/refresh recovery.
- Frontend hygiene includes `PORTAL_HOST`, generated-file ignores and `next typegen`, removal of the obsolete reference Playwright config, plus coordinator-authorized minimal edits to `.github/workflows/ci.yml`, root `AGENTS.md` and spec 001's answered questions. No spec status or Bugs checkbox changed.
- Frontend validation: portal/UI lint and typecheck passed; portal tests passed 272/272 across 33 files, including copy, menu/import failures, retry, session state and key/revoke focus tests; UI test command passed with no package-local tests (shared UI behavior is covered by portal component tests). Portal ingress tests require sandbox permission to bind loopback; no browser, quickstart or workspace-wide suite was run.
- Backend outage copy: shared gateway errors and try-it now return "The API gateway didn't respond. Try again in a moment." with status 503 and type `gateway-unavailable`; the OpenAPI example matches, revoke/service-discovery/try-it regressions pass, and server lint, typecheck and all 212 tests passed with Docker socket access. The combined outage-copy task is ticked directly as authorized, without moving its linked issue; QA browser checks remain.

- Frontend task tracking: the factory helper rejected the three completed multi-key lines (Reference page, Admin import, Hygiene); the coordinator authorized ticking only their checkboxes directly, without moving those Linear issues.

## Test report  _(qa-tester)_
Application/image commit tested: `d234c5230e987e14d990ff5256016b60c0bcea46`; final QA tests: `4896235b74860a0542dc84b98df2febc03e31d60`. Portal: **http://localhost:3013** (`worktree-compose env`); worktree Compose stack is healthy and left running.

| Criterion | Automated tests | Current result |
| --- | --- | --- |
| 1 — catalog, title | `apps/portal/e2e/backlog-regressions.test.ts` (JSO-162/222/183) | **Fail** live/demo: geometry passes at 390/1280, but textContent has no separating whitespace and title is only `APIs`. |
| 2 — reference, auth | `backlog-regressions.test.ts`; `apps/portal/e2e/backlog-live.test.ts` (JSO-175); `apps/server/src/catalog.test.ts` | **Partial**: tools hidden, alignment, empty auth, one document fetch, and operation-only key reaching a real request pass. Duplicate visible H1 fails in both builds; authored sidebar order passes in demo but fails live (status operation last). |
| 3 — keys, focus, dates | `backlog-live.test.ts` (JSO-192/215/182/161/166); `apps/portal/components/shared-ui.test.tsx` | **Pass**: footer in viewport, success/error live announcements, next-Tab reference link, Cancel/Escape focus return, app/key/admin dates in LA and UTC. |
| 4 — header/dashboard | `backlog-live.test.ts` (JSO-163/181/214/227); `apps/portal/components/header.test.tsx` (import failure) | **Pass**: dropdown, mobile labels, no empty Breadcrumb landmark, sign-out network/import failure toast. JSO-181 verified and moved to Done. |
| 5 — sign-in/session | `backlog-live.test.ts` (JSO-179/180) | **Pass** wrong-password clearing/focus and expired-session redirect/toast. |
| 6 — import/key failures | `apps/portal/e2e/journeys.ts` (JSO-176/177/184); `apps/portal/components/admin-apis.test.tsx`, `problem-alert.test.tsx`, `app-detail.test.tsx`; `apps/server/src/import.test.ts`, `app.test.ts` | **Pass** after updating old alert assertions: malformed YAML coordinates, field-only validation, cleared previous feedback, non-ASCII slug refusal, gateway error titles and refresh recovery. |
| 7 — server outage | `backlog-live.test.ts` (JSO-189/190/191); `apps/server/src/app.test.ts` (gateway copy) | **Pass** all three routes with real stop/start: portal header/error, unknown account state, recovery within 5 seconds, no document request/reload and preserved page marker. Same-document history/hash events are recorded, not misclassified as reloads. |
| 8 — 404/title | `backlog-regressions.test.ts`; `backlog-live.test.ts`; `deploy/e2e-demo/demo.test.ts` | **Partial**: default titles and non-admin/unknown-app cases pass; unknown API returns HTTP **200** in live and demo. |
| 9 — tests/hygiene/quickstart | `backlog-regressions.test.ts` (JSO-226); `apps/portal/e2e/reference-snippets.test.ts` (JSO-231); `apps/portal/lib/backlog-hygiene.test.ts`; `tests/spec003-hygiene.test.ts`; `apps/portal/e2e/setup-gateways.test.ts`; `deploy/e2e/quickstart.spec.ts` | **Partial**: demo visible-text guards pass; badge **20/20** (`--repeat-each=10`, two viewports); CI/config/answered questions pass. Clean committed checkout `27882e6` build/dev stays clean and HOSTNAME=myhost binds wildcard/serves HTTP 200. Fresh wizard/sample-opt-in journey passes in **47.5s**; literal default catalog-with-sample criterion is unmet because current defaults open setup and require sample opt-in. |

One full pass: `pnpm lint`, `pnpm typecheck`, `pnpm test` **passed** (portal 272, server 212, Kong adapter 55, DB 6); `pnpm test:e2e` **77 passed / 9 failed** in 8.8 minutes; `pnpm test:e2e:demo` **31 passed / 5 failed**. Later focused reruns verified corrected legacy account-menu, import-error and demo-title assertions, all three added hygiene assertions, mobile keyboard trapping and the independent JSO-175 authenticated request; no second full pass was run. Badge measurements include border widths and wait for rendered Scalar; product failures remain asserted rather than marked expected.

A major first-request access refusal failure reproduced twice: try-it returned 200 for an unsubscribed key after direct Kong had returned 403; retry recovered to 403 (121ms in HTML case, 5.276s in JSON case). Backend Fix task and Deferred Linear evidence are preserved because Linear rejected creation at its free issue limit; **status is building**. No application code was changed, and minors have no Fix tasks. The helper rejects completed multi-key Demo/badge and Clean-checkout task lines; those checkboxes remain open for coordinator bookkeeping, while the dates/404 and full-pass tasks remain incomplete on their merits.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] First try-it request returns 200 for an unsubscribed API key after import (major)
- [ ] JSO-162 Catalog cards have separate non-overlapping blocks, but textContent still joins the base URL directly to View reference → at 390 and 1280 px (minor).
- [ ] JSO-222 Catalog tab title is APIs instead of APIs · Developer Portal in live and demo (minor).
- [ ] JSO-224 Scalar repeats the API title as a second visible H1 in live and demo (minor).
- [ ] JSO-225 Live sidebar lists /status/{code} after /uuid and /headers instead of the authored sample order (minor).
- [ ] JSO-228 Unknown API routes return HTTP 200 instead of 404 in live and demo (minor).
- [x] JSO-181 Mobile app cards label Active keys and Created at 390 px; regression confirms the existing dashboard fix (minor, verified).
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

- Backend first-request refusal: reproduced the imported target returning upstream HTTP 200 after a direct Kong 403; Kong 3.9 eventual worker consistency leaves a stale per-worker ACL plugin iterator, rather than a cached portal response or wrong proxy target. Bundled Kong now uses `KONG_WORKER_CONSISTENCY=strict`; external Kong operators must apply that setting on Kong itself (documented in deployment guidance).
- Backend regression validation: the real two-worker Kong test asserts the first request after protection is 403 across five imports, with no refusal retry; the old eventual setting fails that assertion with 200. Server coverage warms a 200 response, then checks the first newly published target returns 403 and forwards the exact internal URL and key; server and adapter lint/typecheck pass, with 212/212 server and 56/56 adapter tests passing. QA must recreate its existing Kong container with the updated Compose configuration before browser verification; temporary diagnosis objects were removed, and the Bugs line and spec status remain unchanged.

### Deferred Linear
- **Bug** — Bug: First try-it request returns 200 for an unsubscribed API key after import (major)
  - parent: JSO-232
  - priority: high
  - create when the Linear limit allows
  - body: During the spec 003 full browser pass on application commit d234c5230e987e14d990ff5256016b60c0bcea46, apps/portal/e2e/journeys.ts (text/html access-refusal case, JSO-277 first-request regression) returned HTTP 200 for the first same-origin try-it request using a key whose app subscribes only to sample, not the newly imported API. The test first polls the direct Kong target until it returns HTTP 403; the subsequent first /api/v1/try-it request must also return 403, but returned 200. A retry returned 403 after two requests in 121 ms. Reproduce: warm try-it with /sample/get; import a unique protected service/OpenAPI document; create an app subscribed only to sample; poll direct Kong /<new-api>/get with that key until 403; then issue one same-origin try-it GET for that target with the same key. Preserve the first-request assertion: a later retry must not hide an authorization failure. The observed full-suite log is /tmp/qa003-e2e.log and the test error is test-results/journeys-AC-2-Scalar-shows-531af-d-preserves-an-upstream-403/error-context.md. This is intermittent and the root cause is unconfirmed; investigate whether authorization is bypassed or the wrong target/response is served on the first request. It blocks a green security regression run and needs backend ownership; no application change was made by QA.
