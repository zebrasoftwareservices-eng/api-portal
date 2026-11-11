# 003 — Backlog fixes from specs 001 and 002: UX design

- Spec: [`docs/specs/003-backlog-fixes-001-002.md`](../specs/003-backlog-fixes-001-002.md)
- Builds on: [`001-kong-quickstart-slice.md`](001-kong-quickstart-slice.md) (layout, copy, states),
  [`007-email-and-account-security.md`](007-email-and-account-security.md) (account menu with **Profile**),
  [`019-unified-portal-developer-journey.md`](019-unified-portal-developer-journey.md) (My apps naming, breadcrumbs).
- Tokens: [`tokens.md`](tokens.md). **No new tokens.** Every colour, radius and shadow below is an existing variable.
- API: only the fields in the spec's Technical design (`Problem.errors[].line/column`, `/problems/slug-required`).
- Owner: ui-designer · 2026-11-11

This is a fix bundle. It adds one screen (**Portal server unavailable**) and changes behaviour
on existing screens. Anything not mentioned here stays as in design 001, 007 and 019. Where this
file disagrees with design 001, this file wins (called out as **Supersedes**).

---

## 1. User flows

### Flow A — Server outage and recovery (AC 7; JSO-189, 190, 191)
1. A signed-in developer opens `/`, `/apis/sample` or `/dashboard` while the portal server is down.
2. The portal renders **Portal server unavailable** (§2.1) inside the normal shell. The URL stays
   the same (`/dashboard` is a rewrite with HTTP 503, not a redirect). The header shows the brand
   and nav links but **no account area** — neither **Sign in / Sign up** nor the account menu —
   because the portal doesn't know whether they're signed in.
3. The server comes back. The developer selects **Try again**.
4. The button shows "Trying again…" while the page re-renders on the server.
5. **Success:** within 5 seconds the page shows its normal content, and the header shows the
   account menu again. No browser reload, no navigation.
6. **Still down:** the page stays; the status line under the button reads "Still can't reach
   the portal server. Try again in a moment." and the button is enabled again.

### Flow B — Get a key at 1280×800 and keep your place (AC 3; JSO-192, 182, 215, 161)
1. On the app page, developer selects **Create key**. The **Key reveal dialog** opens; focus on **Copy**.
2. The dialog fits the viewport; **I've saved it** is always visible in a fixed footer.
   On a short viewport the key, warning and header line scroll inside the dialog body.
3. Developer selects the header-line copy button. A polite live region says "Header line copied."
4. Developer selects **I've saved it**. The dialog closes and focus lands on the **Try your key**
   heading. The next Tab reaches **Open {API title} reference**.
5. Later, developer selects **Revoke** on a key, then **Cancel** (or presses Escape). Focus
   returns to that same **Revoke** button.

### Flow C — Session ended in another tab (AC 5; JSO-180)
1. Developer signs out in tab 1. In tab 2 (app page) they select **Create key**.
2. The call returns 401. The portal goes to `/sign-in?next=/dashboard/apps/{appId}` and shows the
   toast "Your session has ended. Sign in to continue."
3. They sign in and land back on the app page.

### Flow D — Admin import fails, fixes, succeeds (AC 6; JSO-176, 177, 184, 178, 188)
1. Admin imports a YAML file with a syntax error → alert "This isn't a valid OpenAPI document",
   body "Line 12, column 3: {reason}". Focus moves to the alert.
2. Admin fixes the file, chooses it again, selects **Import and publish**. The old alert clears
   **at submit**, before field validation runs.
3. If the API title has no letters or digits (e.g. "日本語 API" with nothing to slugify),
   **More options** opens and the Slug field shows "Enter a slug. The title has no letters or
   digits to make one from." Focus moves to the Slug field. No alert.
4. Admin enters a slug and submits → success alert, as in design 001.
5. Earlier, Kong was down and the Kong-down banner showed. After Kong is back, the admin selects
   **Refresh list**: services reload, health is re-checked, the banner disappears.

---

## 2. Screens

### 2.1 Portal server unavailable — new (`error.tsx`, `global-error.tsx`, `/unavailable`)
**Purpose:** tell the developer the portal itself is down, without claiming they're signed out
or that anything was lost, and recover in place.

One client component, `ServerUnavailable`, used in all three places.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◆ Developer Portal    APIs                                                   │  no account area
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ⚠ (icon, decorative)                                                       │
│   We can't reach the portal server                       (h1)                │
│   This page needs the portal server, and it isn't responding. It's usually   │
│   back within a minute. Your apps and keys are safe.                         │
│                                                                              │
│   [ Try again ]   Go to APIs                                                 │
│   (status line, role="status", empty until a retry fails)                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
375px
┌───────────────────────────────────┐
│ ◆ Developer Portal          [≡]   │  Sheet has nav links only
├───────────────────────────────────┤
│ We can't reach the portal server  │
│ This page needs the portal …      │
│ [          Try again           ]  │  full width, 44px
│ Go to APIs                        │
└───────────────────────────────────┘
```
- Layout: content column `--portal-form-max-width`, left-aligned, top padding 64px (32px at 375px).
- Icon: `AlertTriangle` in `--portal-warning`, `aria-hidden`. Heading `--portal-text-3xl`/`2xl`.
- **Try again** — primary `Button`. **Go to APIs** — `Button variant="link"` → `/`. On `/` itself,
  hide **Go to APIs** (it would loop to the same page).
- `global-error.tsx` renders its own `<html>`/`<body>`, the header markup (brand + **APIs** link,
  no account area), and `ServerUnavailable`. Tab title: `Developer Portal`.

| State | UI |
| --- | --- |
| Shown | As wireframe. Focus moves to the h1 (`tabIndex=-1`) on mount so screen readers read it. |
| Retrying | **Try again** → "Trying again…", `aria-busy="true"`, disabled. Status line empty. |
| Retry succeeded | Normal page content replaces the component. Header account area returns. Focus goes to the page's h1. |
| Retry failed | Button enabled again. Status line: "Still can't reach the portal server. Try again in a moment." |
| Non-outage error (any other exception caught by `error.tsx`) | Unchanged from design 001: "Something went wrong" + **Try again** + **Go to APIs**. Use `ServerUnavailable` only when the cause is the server being unreachable (network error or 5xx from the server). |

**Header with unknown session (JSO-191).** When `currentUser` is `unknown`, the right side of the
header is empty (no skeleton either — a permanent skeleton reads as "still loading"). Nav links
that need a session (**Dashboard**/**My apps**, **Admin**) are hidden. At 375px the Sheet lists
the public links only.

### 2.2 Catalog — `/` (AC 1; JSO-162, 222, 183)
Card bottom row becomes two block elements with an 8px gap; never one inline run:
```
┌ Sample HTTP API ─────────────────────┐
│ go-httpbin, served through Kong.     │
│ http://localhost:8000/sample         │  <p>, mono, --muted-foreground, wraps
│ View reference →                     │  <span> block, --primary
└──────────────────────────────────────┘
```
At 1280px they may sit on one line (`flex`, `gap: 8px 16px`, `flex-wrap: wrap`) as long as they
are separate elements. Tab title: `APIs · Developer Portal`.

### 2.3 API reference — `/apis/[slug]` (AC 2; JSO-172, 173, 174, 175, 188, 224, 225)
Header strip unchanged in content. Corrections:
- **Alignment (design 001 §3.2).** Title row and base-URL row are `display: flex;
  align-items: center`. The version badge centres on the title line; **Copy** centres on the
  base-URL line. At 375px when the URL wraps, **Copy** centres on the wrapped block.
- **One h1.** The portal `PageHeader` h1 is the only h1. Scalar's intro title is hidden. Scalar's
  description still shows.
- **No Scalar toolbar.** No Developer Tools, Configure, Share or Deploy.
- **Auth value.** The Authentication **Value** field starts empty with Scalar's placeholder; if
  we can set placeholder text, use "Paste your API key". Never an example key.
- **Operation order.** Sidebar follows the document's `paths` order.
- **Hint (JSO-175).** Keeps naming Authentication: "To try a request, paste your API key into the
  {headerName} field under Authentication, choose an operation and select Send." For imported
  APIs with operation-level security, the server now puts the scheme at the root, so the field
  appears under Authentication and the hint stays true.

| State | UI |
| --- | --- |
| Loading (JSO-228) | There is no route-level `loading.tsx` any more. The header strip renders with the API data (one fast lookup); only the reference area shows "Loading API reference…" (muted, `role="status"`, 480px min-height so the footer doesn't jump). |
| Not found | HTTP 404 with the design 001 "API not found" page. Tab title `Developer Portal`. |
| Server down | §2.1. |
| Other states | Unchanged (design 001 §3.2). |

### 2.4 Key reveal dialog (AC 3; JSO-192, 182, 215) — **Supersedes** 001 §3.7 "On close"
```
1280×800 (max-height: viewport − 32px)
┌──────────────────────────────────────────────┐
│ Your new API key                        (h2) │  header: fixed
│ For Weather bot                              │
├──────────────────────────────────────────────┤
│ ⚠ Copy this key now. We won't show it again. │  body: scrolls only if needed
│ API key  [pk_…full key…]  [ Copy ]           │
│ Send it in the apikey header:                │
│ [apikey: pk_…                      ] [⧉]     │
│ Header line copied.   ← status text, polite  │
│ Works with: Sample HTTP API                  │
├──────────────────────────────────────────────┤
│                             [ I've saved it ] │  footer: fixed, always visible
└──────────────────────────────────────────────┘
```
- Content: `max-height: calc(100dvh - 2rem)`, flex column; body `overflow-y: auto`; header and
  footer don't scroll. The scroll body is focusable only if it actually overflows (`tabIndex=0`,
  `aria-label="Key details"`), so keyboard users can scroll it.
- **Header-line copy button** (`CopyButton`, icon-only, `aria-label="Copy header line"`):
  - Success: icon → check for 2 s; live region (polite) says "Header line copied."; the same
    text shows visibly under the line in `--muted-foreground`, `--portal-text-sm`, for 2 s.
  - Failure (`writeText` rejects): no success text. Visible message in `--destructive` with
    `AlertCircle` icon: "Couldn't copy the header line. Select it and press Ctrl+C (⌘C on Mac)."
    The header line text is selected. Message is announced (polite) and stays until the next copy attempt.
- **On close** (after **I've saved it**): focus moves to the **Try your key** heading on the app
  page (`tabIndex=-1`, no visible focus ring needed beyond the default). The next Tab reaches
  its first button. The new key row still gets the 3 s `--accent` highlight.
- Main **Copy** button keeps design 001 behaviour and copy ("API key copied." / selected-key hint).

### 2.5 App detail and revoke dialog (AC 3; JSO-161, 166, 188)
- **Revoke → Cancel / Escape:** focus returns to the **Revoke** button that opened the dialog.
  (After a successful revoke the button no longer exists; focus goes to the row's key-hint cell,
  as in design 001.)
- **Revoke outage copy** (503 inside the dialog): title "Gateway unavailable", body "The gateway
  didn't respond, so the key is still active. Try again in a moment." Never "Nothing was
  created". Don't render the problem `detail` here.
- **Create key outage** (503): title "Gateway unavailable", body "The gateway didn't respond, so
  no key was created. Try again in a moment."
- **Dates (JSO-166):** app header "Created Nov 2, 2026", keys table, admin APIs table all use the
  browser's time zone, `dateStyle: 'medium'` in the browser's locale (en-US: "Nov 2, 2026").
  `<time datetime="{ISO UTC}">`. The first server render may print the UTC date and switch on
  hydration; no layout shift because the format is the same length class.

### 2.6 Header and dashboard (AC 4; JSO-163, 181, 214, 227)
Account menu is a `DropdownMenu` (no `<details>`, no disclosure triangle):
```
[ ana@ex.com ⌄ ]           trigger: ghost Button, ChevronDown icon (aria-hidden)
 ┌──────────────────────┐
 │ ana@ex.com    muted  │  DropdownMenuLabel, not focusable
 ├──────────────────────┤  DropdownMenuSeparator
 │ Profile              │  (design 007)
 │ Sign out             │
 └──────────────────────┘
```
- Trigger `aria-label="Account menu for {email}"`; `aria-haspopup="menu"`, `aria-expanded`.
  Enter/Space/ArrowDown opens with focus on the first item; Escape closes and returns focus to the trigger.
- **Sign-out failure** (request fails **or** its code can't load): menu closes, focus returns to
  the trigger, toast (error) "We couldn't sign you out. Try again." The user stays signed in.
- **Breadcrumb (JSO-214):** pages without breadcrumb items render no `nav` element at all.
- **My apps cards at 390px (JSO-181):** already fixed — `dl` with visible labels "APIs",
  "Active keys", "Created". No change.

### 2.7 Sign in (AC 5; JSO-179, 180)
Unchanged copy from design 001 §3.4; this fix makes it true:
- Wrong credentials: `Alert` "Email or password is incorrect."; password field cleared and focused
  (focus goes to the field, not the alert, so the user can retype at once; the alert is
  `role="alert"` so it is still announced).
- Session ended mid-use: redirect to `/sign-in?next=<current path>`, toast "Your session has
  ended. Sign in to continue." The sign-in subtitle "Sign in to continue." also shows.

### 2.8 Admin: APIs — `/admin/apis` (AC 6; JSO-176, 177, 178, 184, 188)
**Problem titles.** `ProblemAlert` never shows a raw code or a server `title` verbatim. Map:

| Problem | Where | Title | Body |
| --- | --- | --- | --- |
| `gateway-unavailable` (503) | Alert | Gateway unavailable | "Can't reach Kong's Admin API. Nothing was published. Try again in a moment." + Retry-After countdown |
| Any `502` | Alert | Gateway error | "Kong rejected the request. Nothing was published." + `detail` mono, muted |
| `invalid-openapi` with `line`/`column` | Alert | This isn't a valid OpenAPI document | "Line {line}, column {column}: {errors[0].message}" (fallback: `detail` verbatim), then "Nothing was published." |
| `invalid-openapi` without line | Alert | This isn't a valid OpenAPI document | As design 001 (`detail` + "Location: {pointer}") |
| `unsupported-openapi-version` | Alert | Unsupported OpenAPI version | As design 001 |
| `document-too-large` | Field (file / URL) | — | "This document is larger than 5 MiB, the import limit." |
| `spec-url-unreachable` | Field (Document URL) | — | As design 001 |
| `api-slug-taken` | Field (Slug) only | — | "Another API already uses this slug. Enter a different one." |
| `slug-required` (new) | Field (Slug) only | — | `errors[0].message`: "Enter a slug. The title has no letters or digits to make one from." |
| `validation` (400) | Fields only | — | Per pointer, as design 001. Only if no pointer maps to a field: alert "Check the form" / "Check the highlighted fields and try again." |
| `rate-limited` | Toast | — | "Too many requests. Wait a moment and try again." |
| Unknown code | Alert | Import failed | `detail` verbatim, then "Nothing was published." |

For field-only errors: open **More options** if the field is inside it, set `aria-invalid`,
focus the field. No alert at the same time.

**Clear on submit (JSO-177).** Selecting **Import and publish** first removes the previous
success alert, error alert and server-set field errors, then runs client validation. A
validation stop shows only the new field errors.

**Refresh list (JSO-178).** Re-fetches `GET /v1/admin/gateway/services` and `GET /v1/health`.
Pending: label "Refreshing…", `aria-busy`. Kong back → banner removed, services shown, polite
announcement "Kong services refreshed." Kong still down → banner stays, the services message
shows again.

**Service-picker outage copy (JSO-188):** "Can't reach Kong's Admin API, so the service list is
empty. Check that Kong is running, then refresh the list." Never "Nothing was created".

### 2.9 Try-it outage copy (JSO-188)
Where the portal itself renders a try-it outage message (the try-it proxy's
`gateway-unavailable` detail), it reads "The API gateway didn't respond. Try again in a moment."
(design 001 §6). It never says "Nothing was created".

### 2.10 Not-found pages and tab titles (AC 8; JSO-223, 183, 228)
| Route | Tab title | HTTP |
| --- | --- | --- |
| `/` | APIs · Developer Portal | 200 |
| `/apis/<unknown>`, `/apis/<slug>/versions/<unknown>` (live and demo) | Developer Portal | 404 |
| `/quickstart-required` | Developer Portal | — |
| `/admin/apis` as non-admin | Developer Portal | 404 |
| `/dashboard/apps/<unknown id>` | Developer Portal | 404 |
| Server unavailable (§2.1) | Developer Portal | 503 on rewrite |

Page content (h1, body, button) is unchanged from design 001.

---

## 3. Components

Reused from `@portal/ui` / shadcn: `DropdownMenu` (+ `Label`, `Separator`, `Item`), `AlertDialog`,
`Dialog`, `Alert`, `Button`, `Toast` (Sonner), `Skeleton`.

Changed:
- **`PageHeader`** — renders `<nav aria-label="Breadcrumb">` only when `breadcrumb` has at least one item.
- **`CopyButton`** — new props:
  | Prop | Type | Default | Use |
  | --- | --- | --- | --- |
  | `announce` | `string` | `"Copied."` | Polite live-region and visible text on success |
  | `failedMessage` | `string` | `"Couldn't copy. Select the text and press Ctrl+C (⌘C on Mac)."` | Visible, announced text on failure |
  | `onFailed` | `() => void` | — | Lets the caller select the text |
  Variants unchanged (icon-only, labelled). The live region is rendered once per button,
  visually adjacent, `aria-live="polite"`, `aria-atomic="true"`.
- **`ProblemAlert`** — takes a `titles` map (code → title) with the defaults in §2.8; never renders the code.
- **`DateValue`** — client component; output format per §2.5.

New (in `apps/portal`):
- **`ServerUnavailable`** — props `reset?: () => void`, `showHomeLink?: boolean` (default true).
  States per §2.1.

---

## 4. Copy reference (new and changed strings)
| Where | Text |
| --- | --- |
| Server unavailable h1 | We can't reach the portal server |
| Server unavailable body | This page needs the portal server, and it isn't responding. It's usually back within a minute. Your apps and keys are safe. |
| Server unavailable buttons | Try again · Trying again… · Go to APIs |
| Retry still failing | Still can't reach the portal server. Try again in a moment. |
| Header-line copied | Header line copied. |
| Header-line copy failed | Couldn't copy the header line. Select it and press Ctrl+C (⌘C on Mac). |
| Sign-out failed (toast) | We couldn't sign you out. Try again. |
| Session ended (toast) | Your session has ended. Sign in to continue. |
| Revoke 503 | Gateway unavailable — The gateway didn't respond, so the key is still active. Try again in a moment. |
| Create key 503 | Gateway unavailable — The gateway didn't respond, so no key was created. Try again in a moment. |
| Import YAML error | Line {line}, column {column}: {message} |
| Slug required | Enter a slug. The title has no letters or digits to make one from. |
| Refresh list | Refreshing… · Kong services refreshed. |
| Account menu trigger label | Account menu for {email} |
| Reference auth placeholder | Paste your API key |

Voice rules from design 001 §5 apply: sentence case, no codes, no blame, say what didn't happen.

---

## 5. Accessibility (WCAG 2.2 AA)
- **Focus targets.** Server unavailable → h1 on mount; key dialog close → **Try your key**
  heading; revoke cancel/Escape → its **Revoke** button; account menu Escape → trigger; sign-out
  failure → trigger; wrong password → password field; field-only import error → that field;
  alert-level import error → the alert.
- **Keyboard path, Flow B:** Create key → (dialog) Copy → Copy header line → [Key details scroll
  region, only if overflowing] → I've saved it → (closed) Try your key heading → Tab → Open
  {API title} reference.
- **Announcements.** Copy success/failure: polite live region per button. Retry failure and
  "Kong services refreshed.": `role="status"`. Import error alerts: `role="alert"`. Toasts: Sonner (polite).
- **Landmarks.** No empty Breadcrumb `nav`. One `h1` per page, including the reference page.
- **Menu.** `DropdownMenu` gives `role="menu"`/`menuitem`, arrow keys, typeahead and Escape.
  The email label is not a menu item.
- **Contrast.** All pairs are existing tokens (`--portal-warning` 7.1:1, `--destructive` 6.5:1,
  `--muted-foreground` 7.6:1). Status and errors always have an icon and words.
- **Motion.** Copy check-icon swap and row highlight follow `--portal-duration`
  (0ms under reduced motion).
- **Targets.** **Try again** 40px (44px at 375px); icon-only copy buttons ≥ 32×32.

## 6. Responsive behaviour
| Element | 375px | 1280px |
| --- | --- | --- |
| Server unavailable | Full-width **Try again** (44px), link below | Buttons inline, left-aligned, 640px column |
| Header, session unknown | Menu button; Sheet lists public links only | Brand + public links; right side empty |
| Catalog card bottom | URL and **View reference →** stacked | Same line allowed, separate elements, wraps |
| Reference header | Badge centred on title line; **Copy** centred on wrapped URL block | Badge and **Copy** centred on their lines |
| Key dialog | Width viewport − 32px; max-height `100dvh − 2rem`; footer fixed, button full width | 560px; same max-height; footer fixed, button right-aligned |
| Account menu | Inside the Sheet: email (muted), **Profile**, **Sign out** as stacked links | `DropdownMenu`, aligned to the trigger's end |
| Import errors | Same placement, single column | Same |

## 7. Notes for frontend and QA
- Test the key dialog at 1280×800 **and** 375×667: **I've saved it** inside the viewport with no page scroll.
- Outage test: header right side must be empty (no Sign in, no menu, no skeleton) while unknown.
- The "Try again" success path must not fire a navigation event (spec risk).
- Date test: `timezoneId` America/Los_Angeles → "Nov 2, 2026"; UTC → "Nov 3, 2026".
