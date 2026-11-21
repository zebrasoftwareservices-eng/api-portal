# 024 — Admin sidebar shell

Spec: [`docs/specs/024-admin-sidebar-shell.md`](../specs/024-admin-sidebar-shell.md).
Decision: [ADR 0017](../adr/0017-portal-admin-is-not-a-developer.md). Tokens: [`tokens.md`](tokens.md).
One new token: `--portal-sidebar-width`.

This is the approved shell the Technical design points to. A portal admin runs the install and
does not use the portal as a developer. The shell shows that: the admin's pages sit in one left
sidebar, and the developer actions are gone. Developers and anonymous visitors see no change.

## Who sees what

| Session | Shell |
| --- | --- |
| `user.role === 'admin'` | Top bar (brand, search, theme toggle, account menu) + admin sidebar + page |
| Developer (`role: developer`), any team role | Current header, unchanged |
| Anonymous | Current header, unchanged |
| Session still loading (`sessionState === 'unknown'`) | Top bar only, no sidebar and no header links (same as today's header), so nothing flashes and then disappears |

## Data the screens use

No new fields. Every value comes from the contract in the spec.

| Need | Source |
| --- | --- |
| Which shell | `GET /v1/me` → `user.role` |
| Requests count | `GET /v1/admin/access-requests?status=pending` → `items.length` (as `AdminNav` does today), refreshed on the `access-requests-changed` event |
| APIs page | `GET /v1/apis` → `items[]` (`title`, `slug`, `description`, version if shown today) |
| Apps list | `GET /v1/admin/apps?limit=50&cursor=…` → `items: AdminApp[]`, `nextCursor` |
| App page | `GET /v1/admin/apps/{appId}` → `AdminAppDetail` |
| "Manage access" link | `AdminAppDetail.plan` → its product slug, when the plan has a product |
| Accounts limits | existing `AccountSettings.rateLimits.{signInFailures,passwordResetEmails,verificationEmails}` `{ max, windowMinutes }` |

## User flows

**A. Find an admin job (AC 1–2)**
1. Admin signs in. Any page shows the sidebar on the left.
2. They pick an everyday page (**APIs**, **Products**, **Apps**, **Requests**, **Insights**) or open
   the **Admin** group.
3. Choosing **Admin** expands the group and goes to `/admin/gateways`. **Gateways** is marked current.
4. From the group they reach **APIs** (import and publish), **Mail**, **Accounts** or **Theme**.

**B. Who holds a key for this product? (AC 4–5)**
1. Admin opens **Apps**. One row per app: team, app, owner, plan, key hints, status, **View**.
2. They scan the Plan column, or press **View** on a row.
3. The app page shows status, plan, APIs and each key's hint and status. Nothing can be changed here.
4. To stop the team's access they press **Manage access**, which opens the product's access screen
   (`/admin/products/{slug}`), and use **Revoke** there (spec 010).

**C. An admin tries to act as a developer (AC 6–7)**
1. On the catalog, a product page or an API page, the admin sees the docs and plans but no
   **Subscribe**, **Request access** or **Create app**. A one-line note says why (see Copy).
2. A visit to `/dashboard`, `/dashboard/apps/**` or `/dashboard/teams/**` redirects to `/admin/apps`.
3. A direct API call gets 403 `/problems/admin-not-developer`; the UI never offers that call, so
   it has no screen. If a stale tab does send it, the existing `ProblemAlert` shows the server's
   `title` and `detail`.

**D. Set a rate limit (AC 9)**
1. Admin opens **Admin → Accounts**.
2. Each limit is one row: `[ 10 ] attempts in [ 15 ] minutes`.
3. They edit a number and press **Save account settings**. Invalid values show inline under the
   field and nothing is sent.

## Screen 1 — Admin shell (every page in an admin session)

**Purpose:** one place for every admin job. **Primary action:** none; it is navigation.

### Layout at 1280px

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Portal name        [ Search APIs…            ⌘K ]   ◐   admin@acme ▾ │  top bar, 64px
├────────────────┬─────────────────────────────────────────────────────────────┤
│ APIs           │                                                             │
│ Products       │  Page heading                                               │
│▌Apps           │                                                             │
│ Requests   (3) │  Page content (max 1200px, gutter 32px)                     │
│ Insights       │                                                             │
│ ────────────── │                                                             │
│ Admin        ⌄ │                                                             │
│   APIs         │                                                             │
│   Gateways     │                                                             │
│   Mail         │                                                             │
│   Accounts     │                                                             │
│   Theme        │                                                             │
│                │                                                             │
└────────────────┴─────────────────────────────────────────────────────────────┘
  240px sidebar, sticky below the top bar, scrolls on its own if taller than the viewport
```

- **Top bar:** brand link (`/`), the existing `HeaderSearch` (inline), the theme toggle, the
  account menu. No **My apps**, **Admin** or other links in the top bar.
- **Account menu** (existing `DropdownMenu`): label = email, separator, **Profile**, **Sign out**.
  No My apps or Teams. Trigger shows the email and the `Chevron` (down closed, up open).
- **Sidebar** (`<nav aria-label="Admin">`), top to bottom:
  1. **APIs** → `/apis`
  2. **Products** → `/admin/products`
  3. **Apps** → `/admin/apps`
  4. **Requests** → `/admin/requests`, with the pending count badge when > 0
  5. **Insights** → `/admin/insights`
  6. Divider (`--border`, decorative)
  7. **Admin** group button with `Chevron` (right closed, down open). Children, indented 12px:
     **APIs** → `/admin/apis`, **Gateways** → `/admin/gateways`, **Mail** →
     `/admin/settings/mail`, **Accounts** → `/admin/settings/accounts`, **Theme** → `/admin/theme`.
- No Profile or Sign out in the sidebar.

### Current page and group rules

- Current item: path equals the href or starts with `href + '/'`. Longest match wins, so
  `/admin/apis/x` marks **Admin → APIs**, not top-level **APIs** (`/apis`), and `/apis/payments`
  marks top-level **APIs**. `/admin/products/**` marks **Products**; `/admin/apps/**` marks **Apps**.
- Pages that match no item (catalog `/`, `/products/{slug}`, `/profile`, search) mark nothing.
- The group is expanded whenever the current page is one of its children; it cannot be collapsed
  then (pressing the button navigates to Gateways and keeps it open). On any other page it starts
  collapsed; pressing **Admin** goes to `/admin/gateways`, which opens it (AC 2). The chevron
  points down whenever the group is expanded.
- Links into and out of `/admin` are full page loads (ADR 0016). The sidebar must show the same
  open/current state on first paint after the load (computed from the path on render, no effect).

### Visual spec (built-in tokens only)

The sidebar is part of the admin area: it always uses the built-in token values, even on a
themed page such as `/apis` or the catalog. Render it inside a wrapper that re-declares the
built-in values (the same values `/admin` uses), so a custom theme or custom CSS that restyles
`nav`, `a` or `--primary` cannot hide or recolour it. In dark mode it uses the built-in dark defaults.

| Part | Style |
| --- | --- |
| Sidebar surface | `--background`, right border 1px `--border`, width `--portal-sidebar-width` (240px), padding 12px |
| Item | 40px tall, 12px horizontal padding, `--radius` corners, `--portal-text-sm` weight 500, `--foreground` |
| Item hover | background `--accent`, text `--accent-foreground` |
| Current item | background `--accent`, text `--accent-foreground`, weight 600, 3px left bar `--primary` (shape, not colour alone, marks it; `aria-current="page"` for AT) |
| Group button | same as item; chevron 16px at the right, `--muted-foreground` |
| Child items | 36px tall, 24px left padding |
| Requests badge | existing `.badge`, `--primary` background, `--primary-foreground` text, `--portal-text-xs`, pushed right |
| Focus | `outline: 2px solid var(--ring); outline-offset: -2px` (inset so it isn't clipped by the sidebar's overflow) |

"Light" means a plain surface with a hairline border, not a dark rail: same background as the page.

### States

| State | What shows |
| --- | --- |
| Loading session | Top bar only (brand, search). No sidebar, no account menu, no header links. Page content renders as it does today |
| Requests count loading | Requests shows no badge until the count arrives (no spinner) |
| Requests count fails | No badge; no error in the sidebar (the Requests page shows its own error) |
| Requests count 0 | No badge |
| Requests count > 99 | Badge reads `99+`; accessible name still has the real number |
| Session ends (401 on a later call) | Existing behaviour: redirect to sign-in. Sidebar is not shown to a signed-out user |
| No permission | A developer never gets the sidebar; `/admin/**` keeps today's refusal (AC 8) |

### Components

- `PortalShell` (new, client): props `{ children }`; reads `usePortal().user`. Admin → top bar +
  `AdminSidebar` + `<main id="main">`. Otherwise → today's `Header` + main.
- `AdminSidebar` (new): props `{ pathname: string }` (from `usePathname`), `variant: 'rail' | 'drawer'`.
  Uses `Chevron`. Reuses the pending-count fetch from `AdminNav`.
- `Chevron` (new, `packages/ui`): props `{ variant?: 'disclosure' | 'menu'; className? }`.
  Inline SVG 16×16, `stroke="currentColor"`, `aria-hidden="true"`, `focusable="false"`.
  `disclosure`: points right, rotates 90° (down) when its control is open. `menu`: points down,
  rotates 180° (up) when open. Rotation uses `transform` with `transition: transform var(--portal-duration)`;
  reduced motion → instant. Open state is read from the nearest `[open]`, `[aria-expanded="true"]`
  or `[data-open]` ancestor, as the Technical design says.
- Existing: `DropdownMenu` (account menu), `Sheet`/dialog used by today's mobile menu (for the drawer),
  `HeaderSearch`, theme toggle, `.badge`.

## Screen 2 — APIs (`/apis`) (AC 3)

**Purpose:** published APIs and their reference docs, nothing else. **Primary action:** open an
API's reference. Public page; admins see it inside the shell, everyone else inside the header.

```
APIs
Published APIs and their reference documentation.

┌──────────────────────────────────────────────────────────────┐
│ Payments API                                    View reference│
│ Take card payments and issue refunds.                        │
├──────────────────────────────────────────────────────────────┤
│ Orders API                                      View reference│
│ Create, track and cancel orders.                             │
└──────────────────────────────────────────────────────────────┘
```

- One row per item from `GET /v1/apis`, in server order. Title is the link to `/apis/{slug}`
  (whole title clickable); **View reference** is the same link styled as a secondary button
  (`aria-hidden` duplicate is avoided: use one link containing the title, and render "View
  reference" as visual text inside the same row link, or give the button
  `aria-label="View reference for {title}"`).
- No product names, plan counts or Subscribe buttons. No "Create app".

| State | What shows |
| --- | --- |
| Loading | 3 skeleton rows (`--muted`), `aria-busy="true"` on the list |
| Empty, admin | "No published APIs yet." + link **Import an API** → `/admin/apis` |
| Empty, others | "No APIs are published yet." |
| Error | `ProblemAlert` with the problem title, plus **Try again** |
| Success | List as above |

## Screen 3 — Apps (`/admin/apps`) (AC 4)

**Purpose:** see every team's apps and who holds a key. **Primary action:** **View** an app.

### 1280px

```
Apps
Every app in every team. Keys are shown by their last four characters only.

┌────────────────┬──────────────┬──────────────────────┬──────────────┬─────────────┬──────────┬──────┐
│ Team           │ App          │ Owner                │ Plan         │ Keys        │ Status   │      │
├────────────────┼──────────────┼──────────────────────┼──────────────┼─────────────┼──────────┼──────┤
│ Checkout       │ web-store    │ Ana Ruiz             │ Payments ·   │ …9fQa       │ ✓ Active │ View │
│                │              │ ana@acme.dev         │ Standard     │ …k21B       │          │      │
│ Personal       │ cli-tool     │ dev@acme.dev         │ —            │ —           │ ⊘ Revoked│ View │
│ (dev@acme.dev) │              │                      │              │             │          │      │
│ Platform       │ ops-bot      │ Sam Lee              │ Orders · Free│ …77Xc       │ ✓ Active │ View │
│                │              │ sam@acme.dev  [Portal admin]        │             │          │      │
└────────────────┴──────────────┴──────────────────────┴──────────────┴─────────────┴──────────┴──────┘
                                       [ Load more ]
```

Columns and content:

| Column | Content |
| --- | --- |
| Team | `team.name`; personal team → "Personal" with `(owner email)` on a second line in `--muted-foreground` |
| App | `name` (plain text, not a link; **View** is the one action) |
| Owner | `owner.name` (or email if no name) and email below in `--muted-foreground`. `owner.role === 'admin'` → badge **Portal admin**. `owner === null` → "—" with `title`/sr text "Owner account deleted" |
| Plan | Product name · plan name when the plan has a product; plan name alone otherwise; "—" when no plan |
| Keys | One line per `activeKeyHints[]` entry: `…` + hint, in `--portal-font-mono`. None → "—" (sr: "No active keys") |
| Status | `AccessStatus` badge (icon + word): Active, Revoke pending, Revoked |
| (action) | **View** — secondary small button, link to `/admin/apps/{id}`, `aria-label="View {app name} ({team name})"` |

- Sorted newest first (server order). No search or filters in this spec.
- **Load more** appears while `nextCursor` is not null; it appends the next page and moves focus
  to the first new row's **View**. It reads "Loading…" and is disabled while fetching.
- Never render a full key; the page only ever has hints.

### States

| State | What shows |
| --- | --- |
| Loading | Table header + 5 skeleton rows, `aria-busy="true"` |
| Empty | "No apps yet. Apps appear here when developers create them or subscribe to a product." No button (admins can't create apps) |
| Error | `ProblemAlert` (title + detail) + **Try again** |
| Load more fails | Inline `ProblemAlert` under the table + **Try again** (retries the same cursor); rows already loaded stay |
| Success | Table |
| No permission | Developers never reach it (admin layout refuses); a 403 from the API shows the same refusal the other admin pages show |

## Screen 4 — App (`/admin/apps/{appId}`) (AC 5)

**Purpose:** read one app's status and keys. **Primary action:** **Manage access** (goes elsewhere).
Read-only: no reveal, regenerate, create key, plan change, delete or **Cancel subscription**.

```
← Apps

web-store                                               [ ✓ Active ]
Checkout · Owner Ana Ruiz (ana@acme.dev) · Created 12 Nov 2026
Card checkout for the web store.

┌ Plan ──────────────────────────────────────────────────────────┐
│ Payments · Standard                                            │
│ APIs: Payments API, Refunds API                                │
│                                          [ Manage access → ]   │
└────────────────────────────────────────────────────────────────┘

┌ Keys ──────────────────────────────────────────────────────────┐
│ Key        Status        Created          Revoked              │
│ …9fQa      ✓ Active      12 Nov 2026      —                    │
│ …k21B      ✓ Active      14 Nov 2026      —                    │
│ …p0Zt      ⊘ Revoked     2 Nov 2026       10 Nov 2026          │
│                                                                │
│ ⓘ Only the team can see or change a key. To stop this app's    │
│   access, revoke it on the product's access screen.            │
└────────────────────────────────────────────────────────────────┘
```

- Back link **← Apps** → `/admin/apps`.
- Heading `name` (h1). Status badge (`AccessStatus`). Meta line: team (personal → "Personal"),
  owner (with **Portal admin** badge when `owner.role === 'admin'`), created date (existing `date.tsx`).
  `description` below if present. `revokedAt` → "Revoked {date}" added to the meta line.
- **Plan** card: product · plan, the APIs from `subscriptions[]`. **Manage access** is a secondary
  button linking to `/admin/products/{product slug}`, shown only when the plan has a product.
  No product → the card says "This app's plan is not part of a product." and no button. No plan →
  card reads "No plan." with no button.
- **Keys** card: one row per `credentials[]`: hint (`…` + `key_hint`, mono), `AccessStatus`, created,
  revoked (or "—"). Revoked keys are listed with no hint ("—") if the server returns none.
  No credentials → "This app has no keys."
- Info note (`--muted` background, ⓘ icon + text) as in the wireframe. It is not a control.

| State | What shows |
| --- | --- |
| Loading | Heading skeleton + two card skeletons, `aria-busy="true"` |
| Not found (404) | h1 "App not found", text "This app doesn't exist or was deleted.", link **Back to Apps** |
| Error | `ProblemAlert` + **Try again** |
| Revoke pending | Status badge "Revoke pending" + warning alert "Access is being removed from the gateway." |
| Revoked | Badge "Revoked"; Plan card still shows, **Manage access** still offered |
| Success | As wireframe |
| No permission | As Screen 3 |

## Screen 5 — Developer actions hidden for admins (AC 6)

Where an admin would see **Subscribe**, **Request access** or **Create app** (catalog product cards,
`/products/{slug}` plan table, API page access panel), show nothing in that slot except, on the
product page plan table and the API page access panel, one muted line:

> Portal admins can't subscribe. Use a developer account to get a key.

Plans, prices/limits and docs still show so the admin can check what developers see. The catalog
card shows no button and no note (keeps the grid clean). **My apps** and **Teams** never appear.

## Screen 6 — Admin → Accounts rate limits (AC 9)

```
Rate limits

Failed sign-ins, per email address
[  10  ] attempts   in   [  15  ] minutes

Password reset emails, per email address
[   3  ] emails     in   [  60  ] minutes

Verification emails, per account
[   3  ] emails     in   [  60  ] minutes
         ⚠ Enter minutes from 1 to 1440 (24 hours).      ← inline error under its field

[ Save account settings ]                                 ← bottom left, after all fields
```

- Each limit is a `<fieldset>` with `<legend>` = the existing legend text ("Failed sign-ins, per
  email address", …). Two inputs side by side, each followed by its unit text: "attempts" or
  "emails" after the max, "minutes" after the window; "in" sits between them.
- Inputs: `type="text" inputmode="numeric"`, width 6ch + padding, 16px text. Accessible names
  (sr-only labels, as today): "{Label}: maximum attempts" / "maximum emails" and
  "{Label}: window in minutes". Unit text is `aria-hidden` because the label already says it.
- Validation on **Save** (client, before any request): integer from 1 to 1000 for max, 1 to 1440
  for window. Empty, 0, negative, decimal or non-number all fail.
- Errors: `--destructive` text + ⚠ icon under the field it belongs to, `aria-invalid="true"`,
  `aria-describedby` → error id. Focus moves to the first invalid field (existing `focusInvalid`).
  Server 400 `errors[].pointer` maps to the same spots.
- **Save account settings** is the form's last element, left aligned. While saving: "Saving…",
  disabled. Success: existing success notice "Account settings saved." Failure: `ProblemAlert`
  above the button; values stay as typed.

Error copy (keep today's strings):
- Max: "Enter a number from 1 to 1000."
- Window: "Enter minutes from 1 to 1440 (24 hours)."

## Chevron everywhere (AC 10)

| Control | Closed | Open |
| --- | --- | --- |
| Admin group button | › (right) | ⌄ (down) |
| `<details>` summary | › | ⌄ |
| `SelectField` (native select) | › | ⌄ while the list is open |
| Account menu trigger | ⌄ (down) | ⌃ (up) |

- One SVG, 16px, `currentColor`, placed at the end of the control (start of the summary text for
  `<details>`, before the label). Replaces every `⌄`, `▾`, `▸` and native `summary` marker
  (`list-style: none; ::-webkit-details-marker { display: none }`).
- Native select: hide the platform arrow (`appearance: none`) and draw the `Chevron` in the
  wrapper with `pointer-events: none`. Keep 40px min height and the `--input` border.

## Copy

| Where | Text |
| --- | --- |
| Sidebar `aria-label` | Admin |
| Sidebar items | APIs · Products · Apps · Requests · Insights · Admin · APIs · Gateways · Mail · Accounts · Theme |
| Requests accessible name with count | "Requests, 3 pending" |
| Mobile menu button | Open menu / Close menu |
| APIs page | h1 "APIs"; intro "Published APIs and their reference documentation."; link "View reference" |
| APIs empty (admin) | "No published APIs yet." · "Import an API" |
| APIs empty (others) | "No APIs are published yet." |
| Apps page | h1 "Apps"; intro "Every app in every team. Keys are shown by their last four characters only." |
| Apps empty | "No apps yet. Apps appear here when developers create them or subscribe to a product." |
| Apps button | View · Load more · Loading… |
| Owner badge | Portal admin |
| No owner (sr text) | Owner account deleted |
| No keys (sr text) | No active keys |
| App page back link | ← Apps |
| App page cards | "Plan" · "Keys" · "Manage access" |
| App page no product | "This app's plan is not part of a product." |
| App page no plan | "No plan." |
| App page no keys | "This app has no keys." |
| App page note | "Only the team can see or change a key. To stop this app's access, revoke it on the product's access screen." |
| App page revoke pending | "Access is being removed from the gateway." |
| App not found | h1 "App not found" · "This app doesn't exist or was deleted." · "Back to Apps" |
| Admin on product/API page | "Portal admins can't subscribe. Use a developer account to get a key." |
| Server 403 (shown by `ProblemAlert` if ever reached) | Title "A portal admin is not a developer" · detail "Use a developer account to create apps, request access or hold API keys." |
| Retry | Try again |

## Accessibility (WCAG 2.2 AA)

- **Landmarks:** top bar `<header>`, sidebar `<nav aria-label="Admin">`, page `<main id="main">`.
  Keep the existing "Skip to content" link as the first focusable element; it targets `#main`.
- **Focus order (1280px):** Skip link → brand → search → theme toggle → account menu → sidebar
  items top to bottom (group button, then its children when expanded) → main content.
- **Keyboard:** Tab/Shift+Tab move through sidebar links (plain links, no roving tabindex).
  Enter on a link navigates. Enter/Space on **Admin** navigates to Gateways (it is a
  `<button aria-expanded aria-controls="admin-group">` whose action is navigation, per the
  Technical design). Account menu: Radix keyboard behaviour (Enter/Space/↓ opens, Esc closes and
  returns focus to the trigger).
- **Current page:** `aria-current="page"` plus the left bar and weight, never colour alone.
- **Drawer (375px):** opens as a modal dialog (`role="dialog" aria-modal="true" aria-label="Admin menu"`),
  focus moves to the first link, Tab is trapped, Esc or **Close menu** closes it and returns focus
  to **Open menu**. Choosing a link closes it.
- **Tables:** `<table>` with `<caption class="sr-only">Apps</caption>`, `<th scope="col">`;
  the action column header is sr-only "Actions". Key hints read as "ending in 9 f Q a" via
  `aria-label="Key ending in 9fQa"` on each hint.
- **Busy and live:** lists use `aria-busy` while loading; after **Load more**, a polite live region
  says "{n} more apps loaded." Save success uses the existing status region.
- **Forms:** every input has a label, errors are linked with `aria-describedby`, `aria-invalid`
  set, focus to the first error. Unit text never replaces the label.
- **Contrast:** all pairs come from `tokens.md` (current item `--accent-foreground` on `--accent`
  9.5:1; badge `--primary-foreground` on `--primary` 6.7:1; muted meta 7.6:1). Chevron uses
  `--muted-foreground` (≥3:1 for a non-text graphic).
- **Target size:** sidebar items 40px (children 36px), buttons ≥ 24×24 (2.5.8).
- **Motion:** chevron rotation and drawer slide use `--portal-duration`; 0ms under reduced motion.

## Responsive behaviour

| Width | Shell | Apps list | App page | Accounts |
| --- | --- | --- | --- | --- |
| ≥ 1024px (incl. 1280px) | Sidebar always visible, 240px, sticky; content beside it | Full table | Two cards stacked, full width of content | Fields side by side as wireframe |
| 768–1023px | Sidebar hidden; **Open menu** button at the left of the top bar opens the drawer | Table scrolls horizontally inside its card (Team and App columns stay readable) | Same | Same |
| 375px | Top bar 56px: **Open menu** (☰), brand, search icon, account menu (email hidden, icon + chevron only, accessible name keeps the email). Drawer 280px (max 85vw) from the left over `--portal-overlay` | Table becomes a stacked card per app: App name (bold) + status badge on one line; Team, Owner, Plan, Keys as label/value rows; **View** full-width secondary button | Meta line wraps; Keys card becomes a stacked list per key | Each fieldset: max + unit on one line, "in" + window + "minutes" on the next line if they don't fit; Save full width at the bottom |

No horizontal page scroll at 375px. Page gutter follows `--portal-page-gutter`.
