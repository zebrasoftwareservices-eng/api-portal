# 009 — API products and free plans: UX design

Spec: [009-api-products-and-plans](../specs/009-api-products-and-plans.md).
Contract: `apps/server/openapi.yaml` (tag `products`, and `createApp`, `changeAppPlan`, `deleteApp`,
`regenerateCredential`). ADR: [0009](../adr/0009-plans-map-to-kong-rate-limiting.md).

This spec adds a product section to the catalog, a product page with a plan comparison table, a
subscribe page, plan details and three actions on the App page (change plan, cancel, regenerate a
key), and four admin screens (product list, product form, product page, plan form). The global
layout, shared states, voice and focus rules from [001](001-kong-quickstart-slice.md) §2, §5 and
§7, the header and My apps designs from [019](019-unified-portal-developer-journey.md) §3.1–§3.5,
the role rules from [008](008-teams-and-roles.md) §0 and §3.2–§3.4, and `AdminNav` from
[007](007-email-and-account-security.md) still apply. Anything not mentioned here stays as those
designs say. **No new tokens.**

## 0. Principles for this change
- **Plans are access tiers, never prices.** No currency, no "Buy", no "Upgrade". Plans are compared
  by limits. Buttons say **Subscribe**, **Change plan**, **Cancel subscription**.
- **Say what the limit is in words a developer can code against.** "5 requests per second",
  "10,000 requests per month". Each limit says it covers all of the plan's APIs together, and the
  quota says "Resets 00:00 UTC on the 1st".
- **Say what happens to the key.** Changing plan says "Your key stays the same". Regenerating says
  "The old key stops working at once". Cancelling says "Its key stops working at once".
- **Every refusal says what didn't change.** "Nothing changed." "Your key still works."
- **Hide what you can't do** (008 §0). Read-only members and non-admins see no write controls, with
  one line saying who can. The server still refuses (403).
- **Show the team.** Subscribing names the team the subscription will belong to, like Create app.

## 1. User flows

### Flow A — Admin creates a product with a Free plan (AC 1, 2)
1. Admin opens **Admin** → `AdminNav` **Products** → `/admin/products`. Empty: **Create product**.
2. `/admin/products/new`: enters **Name** "Orders", **Description**, checks Orders API and Returns
   API, selects **Create product**. → `/admin/products/orders` with a success alert and the empty
   **Plans** section, focus on the alert.
3. Selects **Add plan** → `/admin/products/orders/plans/new`. Enters **Name** "Free", **Rate limit**
   5, **per** second, **Monthly quota** 10000, keeps both APIs checked, selects **Create plan**.
4. If a field is wrong (AC 2), the form stays, each bad field shows its message beside it, and focus
   moves to the error summary. Nothing is saved.
5. Success → back to `/admin/products/orders`, the plan in the **Plans** table, success alert
   "Created plan Free." with **View product page** → `/products/orders`.

### Flow B — Developer compares and subscribes (AC 1, 3)
1. Developer opens `/` (catalog). **Products** section shows "Orders" with "2 APIs · 2 plans".
2. Opens `/products/orders`. Reads the description, the API list and the **Plans** table (one
   column per plan: rate limit, monthly quota, included APIs).
3. Selects **Subscribe to Free** (column footer). Signed out → `/sign-in?next=/products/orders/subscribe?plan={id}`.
4. `/products/orders/subscribe?plan={id}`: plan radio preselected, "This subscription will belong
   to **{team}**", enters **Subscription name** "staging", selects **Subscribe and get key**.
5. `POST /v1/apps { name, planId, teamId }` → App page `/dashboard/apps/{id}` with the existing
   `KeyRevealDialog` open (key shown once, 001 §3.7). After closing, the App page shows the plan.

### Flow C — Developer changes plan (AC 6)
1. App page → **Plan** card → **Change plan…** → dialog lists the product's plans as radios with
   their limits; current plan checked and marked "Current".
2. Picks "Standard", selects **Change to Standard**. `PUT /v1/apps/{id}/plan`.
3. Success: dialog closes, plan card updates, `role="status"` alert "Changed to Standard. Your key
   stays the same, and the new limits apply now." Focus moves to the alert.

### Flow D — Developer regenerates a key (AC 8)
1. App page → key row → **Regenerate…** → confirm dialog "Regenerate {key name}?".
2. **Regenerate key** → `POST …/credentials/{credentialId}/regenerate` → the existing
   `KeyRevealDialog` shows the new key once, with an extra line "The old key ({prefix}…) has stopped
   working." The key table shows the new key Active and the old one Revoked.

### Flow E — Developer cancels a subscription (AC 7)
1. App page → **Cancel subscription…** (bottom "Danger zone") → destructive dialog.
2. **Cancel subscription** → `DELETE /v1/apps/{id}` → `/dashboard` with a `role="status"` alert
   "Cancelled {name}. Its key has stopped working." The row is gone.

### Flow F — Gateway down (AC 9)
Any of B4, C2, D2, E2 gets 503 `gateway-unavailable`: the dialog or form stays open with a
`ProblemAlert` "The gateway is unavailable" and the flow's "nothing changed" line (§5.2). **Try
again** re-sends the same request. Focus moves to the alert.

### Flow G — Read-only member or non-admin (AC 10)
- Read-only member: product page shows the plans and "You have Read-only access to {team}. Ask a
  team Admin or Member to subscribe." instead of subscribe buttons. App page shows the plan with no
  **Change plan…**, **Regenerate…** or **Cancel subscription…**.
- Non-admin opening `/admin/products*`: the existing admin not-found (003 §2.8, 404).

## 2. Components

All from shadcn/ui unless marked new: `Card`, `Table`, `Badge`, `Button`, `Dialog`, `AlertDialog`,
`RadioGroup`, `Checkbox`, `Input`, `Textarea`, `Select` (native below 768px), `Alert`, `Skeleton`,
`Breadcrumb`, `Label`. Existing portal components: `ProblemAlert`, `KeyRevealDialog`, `EmptyState`,
`Field` (label + hint + error, `aria-describedby`), `AdminNav`, `TeamSwitcher`, `ApiCard`.

### 2.1 `PlanLimits` (new, `apps/portal`)
Renders one plan's limits the same way everywhere.

| Prop | Type | Notes |
| --- | --- | --- |
| `plan` | `Plan \| AppPlan` | Uses `rateLimit`, `rateLimitUnit`, `monthlyQuota`; `AppPlan.builtin` → unlimited text |
| `variant` | `'stacked' \| 'inline'` | `stacked`: two lines (table cell, plan card). `inline`: one line joined by " · " (My apps, radios) |

Text: "{rateLimit, grouped} requests per {second\|minute}" and "{monthlyQuota, grouped} requests per
month". Numbers use `Intl.NumberFormat` with the browser locale (10,000). Built-in: "No rate limit
or monthly quota". Rate unit always spelled out, never "req/s".

### 2.2 `PlanTable` (new)
The comparison table on the product page (§3.2). Props: `plans: Plan[]`, `apis: ApiSummary[]`,
`action: (plan) => ReactNode \| null` (the footer cell: subscribe button, sign-in link, or null).
A real `<table>`: plans are columns, rows are **Rate limit**, **Monthly quota**, then one row per
product API with ✓ "Included" or — "Not included" (icon + visually hidden word), then
**Description** (if any plan has one), then the action row. Row headers are `<th scope="row">`,
plan names are `<th scope="col">`. Caption (visible, `--portal-text-sm`, muted): "Limits cover all
of a plan's APIs together. Monthly quotas reset at 00:00 UTC on the 1st."

### 2.3 `PlanBadge` (new)
`Badge variant="secondary"` with the plan name: "Free". Built-in: "Unlimited". Used in My apps and
the App page heading area.

### 2.4 `ProductCard` (new)
Like `ApiCard` (001 §3.1): `name` (h3, stretched link to `/products/{slug}`), description as plain
text clamped to 3 lines, muted "{apiCount} APIs · {planCount} plans" ("1 API", "1 plan"), "View
plans" text. A product with `planCount` 0 shows "No plans yet" instead.

## 3. Screens

### 3.1 Catalog — `/` (changed, AC 1)

```
1280px
│ APIs (h1)                                                                    │
│ Read the reference, get a key and try a call from your browser.              │
│ Products (h2)                                                                │
│ Bundles of APIs with plans. Subscribe to a plan to get a key.                │
│ ┌ Orders ──────────────┐ ┌ Payments ────────────┐                            │
│ │ Order and returns…   │ │ …                    │                            │
│ │ 2 APIs · 2 plans     │ │ 1 API · 1 plan       │                            │
│ │ View plans →         │ │ View plans →         │                            │
│ └──────────────────────┘ └──────────────────────┘                            │
│ APIs (h2)                                                                    │
│ APIs you can get a key for on their own.                                     │
│ ┌ Sample HTTP API 1.0.0┐ …                                                   │
375px: one column; Products cards, then APIs cards.
```

- Data: `GET /v1/products` and `GET /v1/apis` in parallel. The **APIs** section shows only APIs
  whose `products` is empty. Products sorted by name.
- An API that is in a product is reached from its product page (and stays reachable by URL).

| State | UI |
| --- | --- |
| Loading | `h1`, intro; 2 product card skeletons, 3 API card skeletons. |
| Success, both | As above. |
| No products | **Products** section left out entirely; catalog is unchanged from 001. |
| No standalone APIs, some products | **APIs** section left out. |
| Neither | Existing 001 empty state. |
| Products failed, APIs loaded | In the Products section: destructive `Alert` "We couldn't load the products." + **Try again**. APIs still show. |
| APIs failed | Existing 001 error in the APIs section. |
| No permission | n/a (public). |

### 3.2 Product page — `/products/{slug}` (new, AC 1, 3, 10)

**Purpose:** choose a plan. **Primary action:** **Subscribe to {plan}**.

```
1280px
│ APIs / Orders                                                                │ breadcrumb
│ Orders (h1)                                                                  │
│ Order and returns APIs for partners. (Markdown description)                  │
│ APIs in this product (h2)                                                    │
│ • Orders API  v2.3.0  — View reference          • Returns API v1.0.0 — …     │
│ Plans (h2)                                                                   │
│ ┌──────────────────┬──────────────────────┬──────────────────────┐          │
│ │                  │ Free                 │ Standard             │          │
│ ├──────────────────┼──────────────────────┼──────────────────────┤          │
│ │ Rate limit       │ 5 requests per second│ 50 requests per secon│          │
│ │ Monthly quota    │ 10,000 requests      │ 1,000,000 requests   │          │
│ │ Orders API       │ ✓ Included           │ ✓ Included           │          │
│ │ Returns API      │ — Not included       │ ✓ Included           │          │
│ │ Description      │ For trying the API.  │ For production apps. │          │
│ │                  │ [ Subscribe to Free ]│ [Subscribe to Standa]│          │
│ └──────────────────┴──────────────────────┴──────────────────────┘          │
│ Limits cover all of a plan's APIs together. Monthly quotas reset 00:00 UTC…  │
│ ⓘ You have 1 subscription to Orders: staging (Free). [View]                  │ signed in, has one

375px — the table becomes one Card per plan, in the same order
│ Plans (h2)                        │
│ ┌ Free (h3) ─────────────────────┐│
│ │ Rate limit   5 requests per sec ││
│ │ Monthly quota 10,000 requests   ││
│ │ APIs  Orders API                ││
│ │ For trying the API.             ││
│ │ [      Subscribe to Free      ] ││
│ └─────────────────────────────────┘│
```

- Data: `GET /v1/products/{slug}`; signed in, also `GET /v1/apps?teamId={currentTeamId}` to find
  apps whose `plan.product.id` is this product (the "You have…" line, links to each App page).
- Plans oldest first (contract order). APIs by title; each links to `/apis/{slug}`.
- Below 768px the table is replaced by stacked plan cards (`dl` per card) with the same content, so
  nothing scrolls sideways. The caption text sits above the cards.

| State | UI |
| --- | --- |
| Loading | Breadcrumb, `h1` skeleton, 2-line description skeleton, table skeleton (3 rows). |
| Success, visitor | Footer action: **Sign in to subscribe** (secondary button, link to sign-in with `next`). |
| Success, Admin or Member | **Subscribe to {plan}** per plan (primary for every column; no "recommended" plan). |
| Success, Read-only | No buttons. Under the table: muted "You have Read-only access to {team}. Ask a team Admin or Member to subscribe." |
| Success, portal admin | As their team role, plus a link **Edit product** → `/admin/products/{slug}` beside the `h1`. |
| No plans | **Plans** section shows `EmptyState` "No plans yet", body "This product has no plans yet, so you can't subscribe. Check back soon." Admin: button **Add a plan** → `/admin/products/{slug}/plans/new`. |
| 404 | Existing not-found page, body "We can't find this product. It may have been renamed or removed." **Back to APIs**. |
| Error | Destructive `Alert` "We couldn't load this product." + **Try again**. |
| Static demo (002) | Buttons replaced by the existing **Run the quickstart** notice. |

### 3.3 Subscribe — `/products/{slug}/subscribe?plan={planId}` (new, AC 3, 9, 10)

**Purpose:** name the subscription and get a key. **Primary action:** **Subscribe and get key**.
Signed-in only (signed out → sign-in with `next`, keeps `?plan`). Uses `--portal-form-max-width`.

```
1280px (form column 640px)               375px: same, full width, button full width
│ [ Team: Payments ▾ ]                   │
│ Orders / Subscribe                     │ breadcrumb: Orders → /products/orders
│ Subscribe to Orders (h1)               │
│ This subscription will belong to **Payments**.
│ Plan (fieldset legend)                 │
│ (•) Free      5 requests per second · 10,000 requests per month
│               Orders API               │
│ ( ) Standard  50 requests per second · 1,000,000 requests per month
│               Orders API, Returns API  │
│ Subscription name                      │
│ [ staging                            ] │
│ A name for this key's use, such as staging or prod. Unique in Payments.
│ [ Subscribe and get key ]  Cancel      │
```

- `RadioGroup` of plans (`PlanLimits inline` + included API titles as each radio's description).
  `?plan` preselects; missing or unknown `?plan` preselects the first plan. Focus starts in
  **Subscription name** (the plan is already chosen).
- Name: `Input`, required, 1–80 characters, trimmed. No description field (optional in the
  contract; left out to keep the form short).
- Submit: `POST /v1/apps { name, planId, teamId: currentTeamId }`. The button shows a spinner and
  "Subscribing…" and is disabled while pending. **Cancel** is a link back to the product page.
- Success: `router.push('/dashboard/apps/{id}')` and the `KeyRevealDialog` opens with the key, as
  Create app does (019 §3.4).

| State | UI |
| --- | --- |
| Loading | Form skeleton; **Subscription name** already focusable. |
| Name empty | Field error "Enter a name for this subscription." |
| 409 `app-name-taken` | Field error "A subscription or app in {team} already has this name. Choose another name." |
| 400 with pointers | Each pointer's message beside its field (`/name`, `/planId` → under the radios: "This plan is no longer available. Choose another plan."). |
| 503 `gateway-unavailable` | `ProblemAlert` above the button: title "The gateway is unavailable", body "We couldn't reach the API gateway, so no subscription or key was created. Try again in a moment." **Try again**. |
| 502 `gateway-rejected` | `ProblemAlert` "The gateway rejected this change", body "No subscription or key was created. If this keeps happening, tell your portal admin." |
| 409 `gateway-disabled` / `gateway-not-connected` | `ProblemAlert` "Subscriptions are paused", body "The portal admin has paused the gateway connection, so new keys can't be issued. Nothing was created." |
| 403 `team-role-forbidden` | 008 §3.3 copy: "You can't subscribe in {team}" / "Your role in this team may have changed. Nothing was created." **Back to Orders**. |
| 403 `email-not-verified` | Existing 007 verify-email alert with **Resend email**. |
| Read-only (opened by URL) | No form: "You have Read-only access to {team}, so you can't subscribe here. Switch to another team or ask a team Admin." **Back to Orders**. |
| Product has no plans | No form; the §3.2 no-plans copy and **Back to Orders**. |
| 404 product | §3.2 404. |

### 3.4 My apps — `/dashboard` (changed, AC 3, 7)

Adds a **Plan** column after **Name**: `PlanBadge` then muted product name ("Free · Orders"), and
built-in apps show "Unlimited". The **APIs** column stays (from `App.subscriptions`).

| State | UI |
| --- | --- |
| After cancel (from §3.5) | `role="status"` success `Alert` above the table: "Cancelled {name}. Its key has stopped working." Focus on the alert. Dismissible. |
| Everything else | Unchanged (008 §3.2). The empty state adds a second line: "Or browse products to subscribe to a plan." linking to `/`. |

375px: the plan shows as a line under the app name in each stacked row.

### 3.5 App page — `/dashboard/apps/{id}` (changed, AC 6, 7, 8, 9, 10)

```
1280px
│ My apps / staging                                                            │
│ staging (h1)  [Free]                                                         │
│ Team: Payments · You're a Member                                             │
│ ┌ Plan (h2) ───────────────────────────────────────────────────────────────┐ │
│ │ Free · Orders                                         [ Change plan… ]   │ │
│ │ 5 requests per second                                                    │ │
│ │ 10,000 requests per month · resets 00:00 UTC on the 1st                  │ │
│ │ Covers Orders API together.                                              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ APIs (h2) … unchanged                                                        │
│ API keys (h2)                                                                │
│ Name       Prefix     Created      Status      Actions                       │
│ default    kp_3f9a…   2 Nov 2026   ● Active    [Regenerate…] [Revoke]        │
│ default    kp_11b2…   1 Nov 2026   ○ Revoked                                 │
│ Try your key … unchanged                                                     │
│ Danger zone (h2)                                                             │
│ Cancel this subscription. Its key stops working at once.  [Cancel subscription…]│
```

- **Plan card** (new, `Card`): `AppPlan.name` · product name (link `/products/{product.slug}`),
  `PlanLimits stacked`, then "Covers {API titles} together." from `App.subscriptions`. Built-in:
  "Unlimited" and "No rate limit or monthly quota. This app was made for APIs that are in no
  product." with no **Change plan…**.
- **New key** button: product-plan apps show it only when they have no active key (one active key
  allowed); built-in apps unchanged (limit 5). If shown and the server returns 409
  `credential-limit`: inline `ProblemAlert` "This subscription already has a key", body "A
  subscription has one active key. Regenerate it to get a new one." and re-fetch.
- **Regenerate…** on every active key row, for all apps. **Revoke** unchanged.
- **Danger zone**: product-plan apps say "Cancel subscription…"; built-in apps say "Delete app…"
  with the same dialog and copy using "app" instead of "subscription" (the endpoint works for any
  app).
- Read-only: no **Change plan…**, **Regenerate…**, **New key**, **Revoke** or Danger zone; the 008
  info alert now reads "You have Read-only access. Ask a team Admin or Member to change the plan
  or keys."

| State | UI |
| --- | --- |
| Loading | Plan card skeleton (3 lines) plus existing skeletons. |
| Success | As above. |
| After plan change | `role="status"` success `Alert` at the top: "Changed to {plan}. Your key stays the same, and the new limits apply now." |
| 403 `team-role-forbidden` on any action | 008 §3.4 alert, body "Your role in this team may have changed. Nothing changed." Close the dialog, re-fetch. |
| 404 | 008 §3.4 not-found. |
| Error | Unchanged. |

### 3.6 Change plan dialog (new, AC 6, 9)

```
┌ Change plan for staging ────────────────────────────┐
│ Your key stays the same. The new limits apply now, │
│ and this month's usage carries over.               │
│ (•) Free      Current                               │
│     5 requests per second · 10,000 requests per month
│     Orders API                                      │
│ ( ) Standard                                        │
│     50 requests per second · 1,000,000 requests per month
│     Orders API, Returns API                         │
│ ⚠ Standard doesn't include Returns API… (when the new plan drops an API)
│                         [ Cancel ] [ Change to Standard ]│
└─────────────────────────────────────────────────────┘
```

- `Dialog` with `RadioGroup`. Plans from `GET /v1/products/{plan.product.slug}` (fetched on open;
  skeleton radios while loading; on failure the body is "We couldn't load the plans." + **Try
  again**).
- Current plan checked with a `Badge` "Current". Primary button reads "Change to {selected}" and is
  disabled while the current plan is selected.
- If the selected plan leaves out an API the current plan has, a warning `Alert`
  (`--portal-warning-subtle`, icon + text): "{plan} doesn't include {API titles}. Calls to those
  APIs with this key will be refused."
- If the selected plan's quota is lower than the current one: muted line "This month's requests so
  far count toward the new quota."
- Pending: button "Changing…", disabled, radios disabled.
- 503: `ProblemAlert` in the dialog, "The gateway is unavailable" / "We couldn't reach the API
  gateway, so your plan didn't change. Your key still works on {current plan}." **Try again**.
  502, 409 gateway: §5.2 with the same "didn't change" line. 400 `/planId`: "This plan is no
  longer available. Choose another plan." and re-fetch the plans.
- Initial focus: the checked radio. Escape or **Cancel** returns focus to **Change plan…**.

### 3.7 Regenerate key dialog (new, AC 8, 9)

`AlertDialog`. Title "Regenerate {key name}?". Body: "You'll get a new key, shown once. The old key
({prefix}…) stops working at once, so update your code right after." Buttons **Cancel** (initial
focus), **Regenerate key** (primary, not destructive: it gives a working key back).
- Success: close, open `KeyRevealDialog` with the new key and one extra line above the key:
  "The old key ({prefix}…) has stopped working." On close, focus returns to the new key's row
  **Regenerate…** button; the table re-fetches.
- 503: stays open, `ProblemAlert` "The gateway is unavailable" / "We couldn't reach the API
  gateway, so no new key was made. Your current key still works." **Try again**.
- 409 `credential-revoked`: "This key is already revoked", "Nothing to replace. Create a new key
  instead." Close re-fetches.

### 3.8 Cancel subscription dialog (new, AC 7, 9)

`AlertDialog`. Title "Cancel {name}?". Body: "Its key stops working at once and calls through the
gateway are refused. This can't be undone. To use these APIs again, subscribe again and you'll get
a new key." Buttons **Keep subscription** (initial focus), **Cancel subscription** (destructive).
- Pending: "Cancelling…", both disabled.
- Success: `/dashboard` with the §3.4 alert.
- 503: stays open, `ProblemAlert` "The gateway is unavailable" / "We couldn't reach the API
  gateway, so the subscription wasn't cancelled. Its key still works." **Try again**.
- 404: treat as done (already gone): go to `/dashboard` with the same alert.

### 3.9 Admin: Products — `/admin/products` (new, AC 1, 10)

`AdminNav` gains **Products** after **APIs** (`current: 'products'`).

```
│ Admin  [APIs] [Products] [Gateways] [Mail] [Accounts]                        │
│ Products (h1)                                            [ Create product ]  │
│ Name        Slug       APIs   Plans   Created                                │
│ Orders      orders     2      2       11 Nov 2026                            │
375px: rows stack as cards: name (link), "orders · 2 APIs · 2 plans", created.
```

- Data: `GET /v1/products`. Name links to `/admin/products/{slug}`. Slug in mono.

| State | UI |
| --- | --- |
| Loading | Header, `AdminNav`, 3 skeleton rows. |
| Empty | `EmptyState` "No products yet", body "Group published APIs into a product, then add plans with rate limits and quotas.", button **Create product**. |
| Error | Destructive `Alert` "We couldn't load the products." + **Try again**. |
| No permission | Non-admin: existing admin 404 (003 §2.8). |

### 3.10 Admin: Create or edit product — `/admin/products/new`, `/admin/products/{slug}/edit` (new, AC 1, 2)

Form column `--portal-form-max-width`. Fields:
- **Name** (`Input`, required, ≤ 80).
- **Slug** (create only, `Input` mono, optional): hint "Used in the product's address,
  /products/{slug}. Leave empty to make one from the name. Can't be changed later." Edit shows the
  slug as read-only text.
- **Description** (`Textarea`, required, ≤ 2,000): hint "Markdown. Shown on the product page."
  Live count "{n} of 2,000" in muted text, announced only at 1,900+.
- **APIs** (fieldset, `Checkbox` per published API from `GET /v1/apis`, title + version): hint
  "Choose at least one. An API can be in more than one product." Select up to 50.
- Buttons **Create product** / **Save changes**, and **Cancel** link.

| State | UI |
| --- | --- |
| Loading | Form skeleton. |
| No published APIs | No form: `EmptyState` "Publish an API first", body "A product needs at least one published API.", button **Import an API** → `/admin/apis`. |
| Validation (client or 400) | Error summary at the top (`role="alert"`, "Fix {n} problems to save" with links to each field), each message beside its field (§5.3). Focus on the summary. Nothing saved. |
| 409 `product-slug-taken` | Field error on **Slug** (or **Name** when slug was empty): "Another product already uses /products/{slug}. Choose another slug." |
| 409 `api-in-plan` (edit, unchecked an API) | Field error on **APIs**: "{API title} is in a plan. Remove it from those plans first: {plan names}." Plan names from the loaded product. Nothing saved. |
| 404 API | Field error on **APIs**: "One of these APIs is no longer published. Reload to see the current list." |
| Saving | Button "Creating…" / "Saving…", disabled. |
| Success | → `/admin/products/{slug}` with `role="status"` alert "Created {name}." / "Saved {name}." Focus on the alert. |
| No permission | Admin 404; 403 `forbidden` on submit: `ProblemAlert` "Only portal admins can change products. Nothing was saved." |

### 3.11 Admin: Product — `/admin/products/{slug}` (new, AC 1)

```
│ Admin / Products / Orders                                                    │
│ Orders (h1)                     [ Edit product ]  View product page ↗        │
│ orders · 2 APIs                                                              │
│ APIs (h2)  Orders API v2.3.0 · Returns API v1.0.0                            │
│ Plans (h2)                                                   [ Add plan ]    │
│ Name       Rate limit              Monthly quota   APIs                      │
│ Free       5 requests per second   10,000          Orders API      [Edit]    │
│ Standard   50 requests per second  1,000,000       Orders API, Re… [Edit]    │
│ Changing a plan updates every subscription on it within a minute.            │ muted
```

- Data: `GET /v1/products/{slug}`. No delete for products or plans (not in the contract).
- Empty plans: inline `EmptyState` "No plans yet", body "Developers can't subscribe until the
  product has a plan.", **Add plan**.
- Loading, error, 404, no permission as §3.9 (404 body "We can't find this product.").
- 375px: plan rows stack as cards (name, `PlanLimits stacked`, APIs, **Edit** full width).

### 3.12 Admin: Plan form — `/admin/products/{slug}/plans/new`, `/admin/products/{slug}/plans/{planId}` (new, AC 2)

```
1280px (640px column)                   375px: same order, rate limit and unit stack
│ Admin / Products / Orders / New plan     │
│ Add a plan to Orders (h1)                │
│ ┌ ⚠ Fix 2 problems to save ──────────┐   │ error summary (only on error)
│ │ • Rate limit: Enter a whole number…│   │
│ │ • APIs: Choose at least one API.   │   │
│ └────────────────────────────────────┘   │
│ Name                                     │
│ [ Free                                 ] │
│ Description (optional)                   │
│ [                                      ] │ 0 of 280
│ Rate limit                               │
│ [ 5        ]  per [ second ▾ ]           │
│ Requests per second for all of this plan's APIs together.
│ Monthly quota                            │
│ [ 10000                                ] │
│ Requests per month. Resets at 00:00 UTC on the 1st. At least the rate limit.
│ APIs (fieldset)                          │
│ ☑ Orders API  ☑ Returns API             │
│ [ Create plan ]  Cancel                  │
```

- **Rate limit**: `Input type="text" inputmode="numeric"` (not `type=number`, so "2.5" and "-1" reach
  validation and get a clear message instead of being silently changed). Grouping commas allowed
  and stripped. **per**: `Select` `second` / `minute`, labelled "Rate limit unit", default
  `second`. The hint's unit word follows the selection.
- **Monthly quota**: same input style.
- **APIs**: checkboxes for the product's APIs only (`ProductDetail.apis`), all checked by default
  on create.
- Edit: title "Edit plan {name}", button **Save plan**, and an info `Alert` above the button:
  "Saving updates the limits for every subscription on this plan within a minute. Keys don't
  change."
- Validation runs on submit (client first, same rules as the server), not on every keystroke. Each
  field error sits under its field, linked with `aria-describedby` and `aria-invalid="true"`. The
  server's `errors[]` pointers map: `/name`, `/description`, `/rateLimit`, `/rateLimitUnit`,
  `/monthlyQuota`, `/apiIds` (and `/apiIds/{n}`) → the APIs fieldset. Unknown pointers go in the
  summary only.

| State | UI |
| --- | --- |
| Loading | Form skeleton. |
| Validation error (client or 400) | Error summary + field messages (§5.3). Focus on the summary. Values kept. Nothing saved. |
| 409 `plan-name-taken` | **Name**: "Orders already has a plan called {name}. Choose another name." |
| Saving | "Creating…" / "Saving…", disabled. |
| Success | → `/admin/products/{slug}` with `role="status"` alert "Created plan {name}." / "Saved plan {name}. Subscriptions get the new limits within a minute." and **View product page**. |
| 404 product or plan | §3.11 404. |
| No permission | As §3.10. |

## 4. Navigation

| Route | Header `aria-current` | Breadcrumb |
| --- | --- | --- |
| `/products/{slug}` | APIs | APIs / {product} |
| `/products/{slug}/subscribe` | APIs | {product} / Subscribe |
| `/admin/products*` | Admin (`AdminNav` Products) | Admin / Products / {product} / {plan or "New plan"} |

Page titles: "{product} · Developer Portal", "Subscribe to {product} · Developer Portal",
"Products · Admin · Developer Portal", "Add a plan to {product} · Admin · Developer Portal",
"Edit plan {name} · Admin · Developer Portal". On a validation error the title is prefixed
"Error: ".

## 5. Copy

### 5.1 Labels and messages

| Where | Copy |
| --- | --- |
| Catalog sections | "Products" / "Bundles of APIs with plans. Subscribe to a plan to get a key." · "APIs" / "APIs you can get a key for on their own." |
| Plan table rows | "Rate limit", "Monthly quota", "{API title}", "Description" |
| Plan table caption | "Limits cover all of a plan's APIs together. Monthly quotas reset at 00:00 UTC on the 1st." |
| Included / not | "Included" / "Not included" (with ✓ / — icons) |
| Limits | "{n} requests per second", "{n} requests per minute", "{n} requests per month", built-in "No rate limit or monthly quota" |
| Existing subscriptions line | "You have {count} subscription(s) to {product}: {name} ({plan})." + "View" |
| Buttons | "Subscribe to {plan}", "Sign in to subscribe", "Subscribe and get key", "Change plan…", "Change to {plan}", "Regenerate…", "Regenerate key", "Cancel subscription…", "Cancel subscription", "Keep subscription", "Delete app…", "Create product", "Save changes", "Edit product", "View product page", "Add plan", "Create plan", "Save plan", "Try again" |
| Pending | "Subscribing…", "Changing…", "Regenerating…", "Cancelling…", "Creating…", "Saving…" |
| Successes | "Changed to {plan}. Your key stays the same, and the new limits apply now." · "Cancelled {name}. Its key has stopped working." · "The old key ({prefix}…) has stopped working." · "Created {name}." · "Saved {name}." · "Created plan {name}." · "Saved plan {name}. Subscriptions get the new limits within a minute." |

### 5.2 Problem copy

The UI uses these titles and bodies; the "nothing changed" line depends on the action.

| type | Title | Body |
| --- | --- | --- |
| `gateway-unavailable` (503) | The gateway is unavailable | We couldn't reach the API gateway, so {nothing changed line}. Try again in a moment. |
| `gateway-rejected` (502) | The gateway rejected this change | {Nothing changed line}. If this keeps happening, tell your portal admin. |
| `gateway-disabled`, `gateway-not-connected` (409) | Changes are paused | The portal admin has paused the gateway connection. {Nothing changed line}. |
| `team-role-forbidden` | You can't change this in {team} | Your role in this team may have changed. Nothing changed. |
| `forbidden` (admin) | Only portal admins can change products | Nothing was saved. |
| `credential-limit` | This subscription already has a key | A subscription has one active key. Regenerate it to get a new one. |
| `credential-revoked` | This key is already revoked | Nothing to replace. Create a new key instead. |
| `plan-name-taken` | — (field) | {product} already has a plan called {name}. Choose another name. |
| `product-slug-taken` | — (field) | Another product already uses /products/{slug}. Choose another slug. |
| `api-in-plan` | — (field) | {API} is in a plan. Remove it from those plans first: {plans}. |

Nothing-changed lines: subscribe "no subscription or key was created"; change plan "your plan
didn't change. Your key still works on {plan}"; regenerate "no new key was made. Your current key
still works"; cancel "the subscription wasn't cancelled. Its key still works". The UI doesn't
show the 503 `Retry-After` value; **Try again** is enabled at once.

### 5.3 Field validation messages (AC 2)

| Field | Problem | Message |
| --- | --- | --- |
| Name (plan) | empty / > 40 | "Enter a plan name." / "Use 40 characters or fewer." |
| Description (plan) | > 280 | "Use 280 characters or fewer." |
| Rate limit | empty | "Enter a rate limit." |
| Rate limit | not a whole number (2.5, abc) | "Enter a whole number, such as 5." |
| Rate limit | 0 or negative | "Enter a rate limit of 1 or more." |
| Rate limit | > 1,000,000 | "Enter 1,000,000 or less." |
| Rate limit unit | other | "Choose per second or per minute." |
| Monthly quota | empty / not whole / ≤ 0 / > 2,000,000,000 | "Enter a monthly quota." / "Enter a whole number, such as 10000." / "Enter a monthly quota of 1 or more." / "Enter 2,000,000,000 or less." |
| Monthly quota | < rate limit | "Make the monthly quota at least the rate limit ({rateLimit})." |
| APIs (plan) | none | "Choose at least one API." |
| APIs (plan) | outside product | "{API} isn't in this product. Add it to the product first." |
| Name (product) | empty / > 80 | "Enter a product name." / "Use 80 characters or fewer." |
| Description (product) | empty / > 2,000 | "Enter a description." / "Use 2,000 characters or fewer." |
| APIs (product) | none | "Choose at least one API." |
| Subscription name | empty / > 80 | "Enter a name for this subscription." / "Use 80 characters or fewer." |

When the server sends a pointer the client didn't catch, show the server's `detail` beside the
field.

### 5.4 Text only screen readers get
- Plan table caption is visible. Included cells: "Included" / "Not included" as visually hidden
  text after the icon (icon `aria-hidden`).
- Subscribe buttons and **Edit** links carry the plan: "Subscribe to Free", "Edit plan Free".
- Key rows: "Regenerate {key name}", "Revoke {key name}".
- Radio descriptions linked with `aria-describedby` so the limits are read with the plan name.
- Pending buttons set `aria-busy="true"`; status alerts are polite live regions.

## 6. Accessibility (WCAG 2.2 AA)

- **Keyboard path, product page:** skip link → header → breadcrumb → `h1` → API links → each
  plan's subscribe button (left to right) → existing-subscription link.
- **Keyboard path, subscribe:** team switcher → breadcrumb → plan radios (one tab stop, arrows
  move) → **Subscription name** (initial focus) → **Subscribe and get key** → **Cancel**.
- **Keyboard path, plan form:** error summary (when present) → Name → Description → Rate limit →
  unit → Monthly quota → APIs → submit → Cancel. Summary links move focus to the field.
- **Dialogs:** focus trapped; initial focus as each section says (checked radio; **Cancel** /
  **Keep subscription** on destructive and regenerate). Escape closes unless a request is pending.
  Focus returns to the trigger; after cancel it goes to the My apps alert; after regenerate to the
  new key row.
- **Labels:** every input has a visible `Label`; rate limit and unit are grouped in a `fieldset`
  with legend "Rate limit" so "per" is not the only label. Hints and errors are in
  `aria-describedby`; errors set `aria-invalid`.
- **Contrast:** only existing tokens: `--muted-foreground` hints 7.6:1, `--destructive` errors
  6.5:1, warning alert 6.8:1, `--input` borders 4.8:1. ✓ / — are never the only signal.
- **Target size:** buttons and checkboxes' hit areas ≥ 24×24 px (2.5.8); table subscribe buttons
  are full cell width.
- **Reflow:** at 320 CSS px the plan table becomes cards, so no two-dimensional scrolling (1.4.10).
- **Reduced motion:** no new animation; skeletons follow the token rule.

## 7. Responsive behaviour

| Element | 375px | 1280px |
| --- | --- | --- |
| Catalog | Products cards then APIs cards, 1 column | 3 columns per section |
| Plan comparison | One `Card` per plan, stacked, `dl` rows; buttons full width | `<table>`, one column per plan; > 4 plans → table scrolls horizontally inside a labelled region (`role="region"`, `aria-label="Plans"`, `tabindex="0"`) with the row header column sticky |
| Subscribe form | Full width, button full width | 640px column |
| Plan radios | Limits wrap under the plan name | Limits on one line |
| App page plan card | **Change plan…** full width under the limits | Button right of the plan name |
| Key row actions | In the row's stacked card, buttons full width | Actions column |
| Admin product list / plans | Stacked cards | Tables |
| Plan form rate limit + unit | Stacked | Side by side |
| Dialogs | Full-width sheet-style `Dialog` with 16px gutter, buttons stacked (primary last on screen, first in focus after the radios) | 480px centred |

The table switches to cards below 768px.

## 8. Changes to earlier designs
- 001 §3.1 catalog: adds a **Products** section, and the **APIs** section lists only APIs in no
  product (§3.1).
- 019 §3.3 / 008 §3.2 My apps: adds the **Plan** column (§3.4).
- 001 §3.8 / 008 §3.4 App page: adds the plan card, **Regenerate…**, the danger zone, and the
  one-key rule for product plans (§3.5). The Read-only info alert copy changes.
- 007 `AdminNav`: adds `'products'`.
- 001 `KeyRevealDialog`: optional `notice` line ("The old key … has stopped working.").
