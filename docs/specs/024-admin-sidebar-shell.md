---
id: 024
title: Admin sidebar shell
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-18
linear:            # the one feature issue, e.g. JSO-117 — filled by `node scripts/factory.mjs linear-init 024`
---

# 024 — Admin sidebar shell

## Summary
Signed-in portal admins get the approved portal shell: a light left sidebar (APIs, Products,
Apps, Requests, Insights, and an Admin group), a read-only list of every team's apps, and an
admin session that is not a developer. The admin can't create apps or request access, and the
server refuses both.

## Problem
Portal admins today move between developer screens and admin screens in one top bar. They see
developer actions (My apps, Teams, Create app, Subscribe) that make no sense for the person
running the install. They can't see every team's apps in one place, so to answer "who holds a
key for this product?" they have to go through each product's access list. An admin who clicks
Subscribe creates an app and a gateway credential under the admin account. That credential then
looks like developer traffic in Insights. Every disclosure control (menus, selects, details)
also uses a different arrow.

We'll know it's solved when an admin can do every admin job from the sidebar, can see every
team's app and its key hint without being able to read or change the key, and has no path, in
the UI or through the API, to create an app or request access as an admin.

## Users
- **Portal admin.** Runs the install: imports and publishes APIs, connects gateways, configures
  mail, accounts and theme, approves requests and reads Insights. Primary user.
- **API consumer (developer).** Should see no change to their navigation, apps or teams.
- **Platform engineer** who installs the portal and also calls its APIs. Uses a separate developer
  account for the second job.

## User stories
- As a portal admin, I want one sidebar with my everyday pages and an Admin group for settings,
  so that I can find any admin job without hunting through the top bar.
- As a portal admin, I want the APIs page to show only published APIs and their reference docs,
  with products only on Products, so that each page has one job.
- As a portal admin, I want to see every team's apps with team, owner, plan, key hint and status,
  so that I can tell who has access without opening each product.
- As a portal admin, I want an app page that shows status and the key hint but can't reveal,
  regenerate, create or cancel anything, so that I can't take over a team's key by mistake.
- As a portal admin, I want developer-only actions hidden and refused by the server, so that
  my admin account never holds a gateway credential.
- As a portal admin, I want each Accounts rate limit as a maximum and a window in minutes, side by
  side with their units, so that I can read and set a limit without guessing its unit.
- As a developer, I want My apps and my team apps to work as before, so that the admin change
  doesn't get in my way.
- As any user, I want one chevron that behaves the same everywhere, so that I can tell at a glance
  what is open and what is closed.

## Acceptance criteria
1. **Given** a signed-in portal admin on any portal page **When** the page loads **Then** a light
   left sidebar shows, in this order, **APIs**, **Products**, **Apps**, **Requests**, **Insights**,
   then an **Admin** group whose children are **APIs** (import and publish), **Gateways**, **Mail**,
   **Accounts** and **Theme**. The search box stays in the top bar. **Profile** and **Sign out**
   are in the account menu and not in the sidebar.
2. **Given** a signed-in portal admin **When** they open **Admin** in the sidebar (or go to `/admin`)
   **Then** they land on the Gateways page, the Admin group is expanded, and Gateways is marked as
   the current page.
3. **Given** published APIs and at least one product **When** the admin opens **APIs** in the
   sidebar **Then** the page lists each published API with a link to its reference docs and lists
   no products. **And When** they open **Products** **Then** the products are listed there.
4. **Given** apps owned by at least two teams, one app with two active keys, one with a revoked
   key, and one on a plan **When** the admin opens **Apps** **Then** one row per app shows team,
   app, owner, plan, the last four characters of each active key (none for a revoked key), and
   status, with a **View** button. The page never sends or shows a full key or a key secret.
5. **Given** the admin opens **View** on another team's app **When** the app page loads **Then** it
   shows the app's status and key hint, and has no reveal, regenerate, create-key or **Cancel
   subscription** control. **And Given** the admin wants to stop that team's access **Then**
   **Revoke** is on the product's access screen, not on the app page.
6. **Given** a signed-in portal admin **When** they browse the portal (catalog, product pages, API
   pages, account menu) **Then** **My apps**, **Teams**, **Create app** and **Subscribe** are not
   shown anywhere in the admin session.
7. **Given** a signed-in session whose portal role is admin **When** it calls the server to create
   an app or to submit an access request (bypassing the UI) **Then** the server responds 403 with
   an RFC 9457 problem+json body that says a portal admin is not a developer, no app, request or
   subscription row is written, and no gateway call is made.
8. **Given** a signed-in developer who is a member of a team **When** they use the portal **Then**
   they still see **My apps** with their own and their team's apps, can create an app, and can
   subscribe or request access as before. They see no **Admin** group, no admin **Apps** page and no
   **Insights**, and `/admin` routes still refuse them.
9. **Given** the admin is on **Admin → Accounts** **When** they look at any rate limit **Then** it is
   two fields side by side: the maximum with its unit beside the number (attempts or emails) and the
   window with "minutes" beside the number, and **Save** is at the bottom left of the form. **And
   When** they enter 0, a negative number or a non-number in either field and press **Save** **Then**
   the field shows an inline error, nothing is saved, and reloading the page shows the old values.
10. **Given** any closed disclosure (the Admin group, a select, a details summary) **When** it is
    opened **Then** the same chevron icon turns from pointing right to pointing down, and back when
    closed. The account menu's chevron points down while closed and up while the menu is open.

## Out of scope
- **Pages, articles and navigation managed in the admin UI.** Spec 014 (JSO-242).
- **Registration approval, private portal and audit log.** Spec 015 (JSO-243).
- **The first-run "Publish the sample API" offer.** It already appears only after the first Kong
  connection (spec 005). This spec doesn't move or change it.
- **An act-as-developer or impersonation mode.** A person who installs the portal and also calls
  APIs uses a separate developer account.
- **Adding the admin to every team, or any team membership for admins.** Team roles still never
  grant portal admin access (spec 008), and portal admin doesn't grant team access.
- **Revoking or regenerating a single key from the admin Apps pages.** The team that owns the app
  revokes a single key. Admins stop access with **Revoke** on product access (spec 010).
- **Filtering, sorting or exporting the admin Apps list.** We cut these to keep this to one pull
  request. Follow-up if admins ask.
- **A sidebar for developers.** Only signed-in admins get the sidebar here (see Open questions).
- **Cleaning up apps or credentials an admin account created before this change.** This spec
  only stops new ones (see Open questions).
- **Staff roles that limit which admins see which sidebar entries.** Spec 015.

## Open questions
- [ ] Which document is the "approved portal shell"? `docs/design/jso-316-unified-api-portal.md`
      is the nearest design, but it has no admin sidebar. Should the ui-designer write the sidebar
      into `docs/design/024-*.md`, or is there a mock to follow? Elango
- [ ] Do developers (and anonymous visitors) keep the current top-bar navigation, or should they
      also get the sidebar later as a separate spec? Elango
- [x] What should an admin see on a direct visit to a developer URL such as `/apps`, `/apps/new` or
      `/teams`: a redirect to the admin Apps page, or a page that says to use a developer account?
      Elango, ui-designer — **Decided (Elango, 2026-11-18):** redirect `/dashboard/**` to `/admin/apps`.
- [x] What happens to apps, subscriptions and keys an admin account already holds? Leave them, list
      them on the admin Apps page under a "portal admin" owner, or flag them for revocation? Elango
      — **Decided (Elango, 2026-11-18):** leave them; list them under their team with the owner
      marked "portal admin".
- [ ] Does the server already have an endpoint that lists every team's apps with owner, plan and key
      hints, or does this need a new admin endpoint in `openapi.yaml`? tech-lead
- [ ] Which Accounts rate limits exist today (for example sign-in attempts, password-reset emails,
      verification emails), and what are their units and current defaults? tech-lead
- [ ] This touches the shell, three pages, the Accounts form, a shared chevron and one server rule.
      If the design shows it won't fit one pull request, split it: the server refusal and hidden
      developer actions (criteria 6–8) first, then the sidebar, Apps pages, Accounts form and chevron.
      tech-lead

## Technical design  _(tech-lead)_

**Decision record:** [ADR 0017 — A portal admin is not a developer](../adr/0017-portal-admin-is-not-a-developer.md).
**Size:** one pull request. The server part is one guard and two read endpoints; the rest is
portal UI. Build order inside the PR: server refusal and hidden developer actions (AC 6–8) first,
then the sidebar, Apps pages, Accounts form and chevron. If review finds the PR too large, the
first half ships alone without changing the design.

**Answers to the tech-lead open questions.**
- *Admin apps endpoint:* none exists. `GET /v1/apps` is per team and needs membership;
  `/v1/admin/products/{productId}/access` is per product. This spec adds `GET /v1/admin/apps`
  and `GET /v1/admin/apps/{appId}`.
- *Accounts rate limits:* three exist, all `{ max, windowMinutes }` (`AccountRateLimits`,
  `max` 1–1000, `windowMinutes` 1–1440): `signInFailures` (attempts, default 10 in 15 minutes),
  `passwordResetEmails` (emails, default 3 in 60), `verificationEmails` (emails, default 3 in 60).
  The contract and server validation already fit AC 9; it is a form change only.
- *Split:* not needed (above).

**Provisional defaults for Elango's open questions** (the build follows these unless Elango
answers otherwise before `building`):
- *Developer URLs for an admin* (`/dashboard`, `/dashboard/apps/**`, `/dashboard/teams/**`):
  the page redirects to `/admin/apps`. No dead-end page to design.
- *Apps an admin account already holds:* left as they are, keys keep working. They appear on the
  admin Apps list under their team with the owner marked "portal admin" (`owner.role: admin`).
  The admin can no longer issue, regenerate or change plan on them (ADR 0017); it can still delete
  them through the API, and stops access with Revoke on product access.
- *Developers and anonymous visitors* keep the current top bar.
- *The approved shell* is whatever the ui-designer writes in `docs/design/024-*.md`.

### Components
- **apps/server**
  - `src/auth.ts` (beside `requireUser`): add `requireDeveloper(user)` that throws
    `new Problem(403, 'admin-not-developer', 'A portal admin is not a developer', 'Use a developer account to create apps, request access or hold API keys.')`
    when `user.role === 'admin'`.
  - `src/apps.ts`: call `requireDeveloper` as the first line after `requireUser` in
    `POST /api/v1/apps` (before `ensurePersonalTeam`), `PUT /api/v1/apps/:appId/plan`,
    `POST /api/v1/apps/:appId/credentials` and `POST …/credentials/:credentialId/regenerate`.
    Leave `GET`, `DELETE /apps/:appId` and `DELETE …/credentials/:credentialId` open.
  - `src/access-requests.ts`: same first-line guard in `POST /api/v1/access-requests`.
  - New `src/admin-apps.ts`, registered in `app.ts`: `GET /api/v1/admin/apps` and
    `GET /api/v1/admin/apps/:appId`, admin-only with the existing admin guard (403
    `/problems/forbidden`). Query `apps` join `teams`, left join `users` on `apps.created_by`,
    join `plans` (and product), plus active `credentials.key_hint` grouped per app (one query
    with `array_agg(key_hint order by created_at desc) filter (where status = 'active')`, not
    N+1). Keyset paging: `order by apps.created_at desc, apps.id desc`, cursor =
    base64url(`createdAt|id`), validated with zod; a malformed cursor is 400 `/problems/validation`
    pointer `/cursor`. Detail reuses the existing subscription and credential view helpers but
    selects only `id, kind, key_hint, status, created_at, revoked_at` from `credentials`; never
    select the gateway credential id or any key material into the response object.
- **apps/portal**
  - New `components/portal-shell.tsx` (client), used by `app/layout.tsx`: when
    `user.role === 'admin'` it renders the top bar (search, theme, account menu) plus
    `components/admin-sidebar.tsx` and the page; otherwise the current header layout unchanged.
  - `components/admin-sidebar.tsx` replaces `components/admin-nav.tsx` (delete it and its test;
    keep its pending-requests count on **Requests**). Entries and routes, in order:
    APIs → `/apis`, Products → `/admin/products`, Apps → `/admin/apps`, Requests →
    `/admin/requests` (with count), Insights → `/admin/insights`, then the Admin group:
    APIs → `/admin/apis`, Gateways → `/admin/gateways`, Mail → `/admin/settings/mail`,
    Accounts → `/admin/settings/accounts`, Theme → `/admin/theme`. Current page uses
    `aria-current="page"`; the group is a `<button aria-expanded>` that is expanded whenever the
    path is one of its children. Links into `/admin` stay full page loads (ADR 0016 admin
    isolation); the sidebar itself must not depend on custom theme CSS.
  - `app/admin/layout.tsx`: drop `AdminNav`; `app/admin/page.tsx` (new) redirects to
    `/admin/gateways` (AC 2).
  - `app/apis/page.tsx` (new): published APIs from `GET /v1/apis`, each linking to
    `/apis/[slug]`; no products (AC 3). Public, like the rest of `/apis`.
  - `app/admin/apps/page.tsx` + `components/admin-apps.tsx`: table Team · App · Owner · Plan ·
    Keys (`…9fQa` per active key, "—" if none) · Status · **View**, "Load more" on `nextCursor`.
    Personal teams show "Personal (owner email)".
  - `app/admin/apps/[appId]/page.tsx` + `components/admin-app-detail.tsx`: status, plan, APIs,
    key hints and statuses, and a link "Manage access" to the product's access screen
    (`/admin/products/[slug]`) when the plan has a product. No reveal, regenerate, create-key,
    plan change or Cancel control. Do not reuse `app-detail.tsx`'s action components.
  - Hide developer actions when `user.role === 'admin'`: **My apps** and **Teams** in the header
    and account menu, **Create app**, **Subscribe** and **Request access** on catalog, product and
    API pages (`create-app*.tsx`, `api-access.tsx`, `catalog-*`, `products/[slug]`). Admin visits
    to `/dashboard/**` redirect to `/admin/apps`.
  - `components/account-settings.tsx`: each limit is two inputs side by side — max with a unit
    suffix ("attempts" for sign-in failures, "emails" for the two email limits) and window with
    "minutes". Client validation: integer ≥ 1 (and ≤ the contract maximums); errors show inline
    under the field, and no request is sent. Server 400 `errors[].pointer`
    (`/rateLimits/signInFailures/max`, …) maps to the same inline errors. **Save** bottom left.
  - Chevron: one `Chevron` component in `packages/ui` (inline SVG, `currentColor`, rotates by
    CSS: 0° = right, 90° = down) used by the Admin group, every `<details>` summary and every
    `<select>` wrapper (`SelectField`), and by the account menu with its own rule (down closed,
    up open). Open state comes from `[open]` on details, `aria-expanded="true"` on buttons, and
    for native selects `select:open` with a small JS fallback that sets `data-open` on
    pointerdown/keydown and clears it on change/blur.
- **packages/sdk:** regenerate `src/schema.d.ts` from the contract.
- **packages/db, adapters:** no change.

### API contract (`apps/server/openapi.yaml`, updated)
- `GET /v1/admin/apps?limit=1..200 (default 50)&cursor=<opaque>` → 200
  `{ items: AdminApp[], nextCursor: string|null }`; 400 validation; 401; 403 `/problems/forbidden`.
- `GET /v1/admin/apps/{appId}` → 200 `AdminAppDetail`; 401; 403; 404 `/problems/not-found`.
- `AdminApp`: `id, name, status (active|revoke-pending|revoked), team {id,name,personal},
  owner {id,name,email,role}|null, plan: AppPlan, activeKeyHints: string[], createdAt`.
  `AdminAppDetail` adds `origin, keyIssued, revokedAt, description, subscriptions[], credentials: Credential[]`.
  No schema has a key, secret or gateway id.
- New 403 `/problems/admin-not-developer` on `createApp`, `createAccessRequest` (inline 403
  text) and on `changeAppPlan`, `createCredential`, `regenerateCredential` (through the shared
  `TeamForbiddenOrNotVerified` response, which only those three use). Checked before every other
  check; nothing written, no gateway call.

### Data model
No schema change and no migration. Owner comes from the existing `apps.created_by`; key hints
from `credentials.key_hint`. If the list query is slow, an index on `apps (created_at desc, id desc)`
is the only candidate; do not add it unless the integration test shows a sequential scan matters.

### Gateway adapter calls
None added. The refusal runs before any adapter call, so no Kong rollback path is involved. The
admin endpoints read Postgres only.

### Risks and how to test them
- **Refusal placed too late** (a row or Kong consumer written before the 403). Test: as an admin,
  call each of the five endpoints and assert 403 `/problems/admin-not-developer`, and that
  `apps`, `access_requests`, `subscriptions`, `credentials` and `teams` row counts are unchanged
  and the Kong consumer list is unchanged (Testcontainers Kong).
- **Key leak in the admin list or detail.** Test: create an app with two keys, revoke one; assert
  the JSON contains each active hint, no hint for the revoked key, and that the full key string
  appears nowhere in either response body.
- **Existing tests and demo seed that create apps as the admin** will now fail. Backend moves them
  to a developer user in the same PR; do not weaken the guard.
- **Developer regression (AC 8).** e2e: a developer in a team still sees My apps, creates an app,
  subscribes and requests access; `/admin`, `/admin/apps` and `GET /v1/admin/apps` refuse them.
- **Admin isolation (ADR 0016).** The shell now renders on themed pages. e2e: with custom CSS
  that hides `nav`, the admin sidebar is still visible on `/admin/*`.
- **Native select open state** varies by browser. Playwright on Chromium covers `select:open`;
  the fallback is unit-tested with the component.
- **Paging.** Integration test with 3 apps and `limit=2`: two pages, no duplicates, stable order.

### Tasks
- [x] [backend] Add `requireDeveloper` and call it first in createApp, createAccessRequest, changeAppPlan, createCredential and regenerateCredential; 403 `/problems/admin-not-developer`, no writes, no Kong call (AC 7)
- [x] [backend] Add `GET /v1/admin/apps` (keyset paging, active key hints, owner, plan, team) and `GET /v1/admin/apps/{appId}` in `src/admin-apps.ts`, admin-only, matching the contract (AC 4–5)
- [x] [backend] Move existing tests and any seed path that create apps or requests as a portal admin onto a developer user; integration tests for the refusal (row counts + Kong unchanged) and for both admin endpoints (no full key, revoked key has no hint, paging, developer gets 403)
- [x] [backend] Regenerate `packages/sdk/src/schema.d.ts` from the updated contract
- [ ] [frontend] Hide My apps, Teams, Create app, Subscribe and Request access for admins everywhere; redirect admin visits to `/dashboard/**` to `/admin/apps` (AC 6)
- [ ] [frontend] `PortalShell` + `AdminSidebar` (entries, order, Admin group, current page, Requests count); remove `AdminNav`; `/admin` redirects to `/admin/gateways` with the group expanded (AC 1–2)
- [ ] [frontend] `/apis` index of published APIs with reference links and no products; Products entry goes to `/admin/products` (AC 3)
- [ ] [frontend] Admin Apps list `/admin/apps` and read-only app page `/admin/apps/[appId]` with key hints only and a link to product access (AC 4–5)
- [ ] [frontend] Accounts form: max + unit and window + "minutes" side by side, inline validation for 0, negative and non-numbers, nothing sent on error, Save bottom left (AC 9)
- [ ] [frontend] Shared `Chevron` in `packages/ui` used by the Admin group, details, selects (`select:open` + fallback) and the account menu (AC 10)
- [ ] [qa] Integration: admin refusal on all five endpoints with unchanged rows and Kong; admin apps endpoints never return a full key; developer refused on admin endpoints (AC 4, 5, 7, 8)
- [ ] [qa] e2e (admin): sidebar order and Admin group, `/admin` lands on Gateways, APIs vs Products pages, Apps list and read-only app page, no developer actions anywhere, Accounts validation and reload keeps old values, chevron states (AC 1–6, 9, 10)
- [ ] [qa] e2e (developer): My apps, team apps, create app, subscribe and request access unchanged; no sidebar, no Admin, no Insights, `/admin` refused (AC 8); quickstart still works

### Build notes

- Backend: portal admins are refused before all five developer-only writes, and the new read-only admin Apps list/detail endpoints provide keyset paging, ownership, plan/team data, subscriptions and key hints without key material. Existing app/request fixtures now execute those writes as developers; server lint, typecheck and all 358 tests pass, and the generated SDK matches the OpenAPI contract. QA should retain the unchanged-row/Kong assertions and verify revoked hints appear only in detail credential history, never in the list's active hints.

## UX  _(ui-designer)_
Design: [`docs/design/024-admin-sidebar-shell.md`](../design/024-admin-sidebar-shell.md).
Admins get a top bar (brand, search, theme, account menu with Profile and Sign out only) and a
240px light sidebar: APIs, Products, Apps, Requests (pending count), Insights, then an Admin group
(APIs, Gateways, Mail, Accounts, Theme) that is expanded on its child pages; longest path match
marks the current item with `aria-current`, a left bar and weight. The sidebar always uses the
built-in tokens, even on themed pages. Below 1024px it becomes a modal drawer behind **Open menu**.
The Apps table (Team, App, Owner with a **Portal admin** badge, Plan, `…hint` keys, status, **View**,
**Load more**) stacks into cards at 375px; the read-only app page shows Plan and Keys cards and
**Manage access** to the product's access screen, with no key or plan controls. Product and API pages
show admins "Portal admins can't subscribe. Use a developer account to get a key." in place of the
buttons. Accounts limits read `[10] attempts in [15] minutes` with inline errors and **Save account
settings** bottom left. One `Chevron` (right→down; account menu down→up) replaces every arrow.
Every state, copy, keyboard path and responsive rule is in the design file. One new token:
`--portal-sidebar-width`.
