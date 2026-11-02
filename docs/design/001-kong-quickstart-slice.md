# 001 — Kong quickstart slice: UX design

- Spec: [`docs/specs/001-kong-quickstart-slice.md`](../specs/001-kong-quickstart-slice.md)
- Tokens: [`tokens.md`](tokens.md) (all colours, type, spacing and radius come from there)
- API: `apps/server/openapi.yaml`. This design uses only fields in that contract.
- Owner: ui-designer · 2026-11-02

## 0. Principles for this slice

1. **First successful call is the goal.** A new developer should get from the catalog to a
   `200` in the try-it console in under three minutes. Every screen points at the next step.
2. **The key is the only secret, and it's shown once.** The UI makes this obvious, makes
   copying easy, and never puts the key in a URL, local storage or a log.
3. **Errors say what happened, what didn't happen, and what to do.** "Nothing was created"
   matters as much as "it failed". No blame, no codes as the only message.
4. **Plain shadcn/ui.** No custom visual language; the default theme is tokens only, so
   customers can restyle it later without code.

Working product name in the UI: **Developer Portal** (one constant in `apps/portal`, renamed
with the project).

---

## 1. User flows

### Flow A — Developer: from catalog to first successful call (AC 5, 6, 7)
1. Visitor opens `http://localhost:3000/` → **Catalog**. Sees "Sample HTTP API".
2. Selects the card → **API reference** `/apis/sample`.
3. Selects **Get an API key**. Signed out → `/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dsample`.
4. **Sign up**: name, email, password → **Create account**. Better Auth signs them in
   (`autoSignIn`), then the portal sends them to `next`.
5. **Create app** `/dashboard/apps/new?api=sample`: "Sample HTTP API" is already ticked.
   Enters a name → **Create app and get key**.
6. Portal replaces the URL with `/dashboard/apps/{appId}` and opens the **Key reveal dialog**
   over the app page. Developer selects **Copy** → "Copied".
7. Selects **I've saved it**. The dialog closes; the **Try your key** panel on the app page
   links to the API reference.
8. Selects **Open Sample HTTP API reference** → `/apis/sample`. Pastes the key into the
   `apikey` field under Authentication, opens `GET /get`, selects **Send**.
9. Response panel shows `200` and go-httpbin's JSON. Done.

Branch 3a — already signed in: step 3 goes straight to step 5.
Branch 3b — has an account: on sign-up, selects **Sign in** (keeps `next`).
Branch 5a — Kong down: see Flow D.
Branch 8a — sends without a key: response panel shows Kong's `401` (AC 7).

### Flow B — Admin: import and publish an API (AC 3, 4)
1. Admin opens `/sign-in`, signs in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Header shows **Admin**. Selects it → `/admin/apis`.
3. In **Import an API**: picks **Upload a file** (or **From a URL**), chooses the document.
4. Picks a **Kong service** from the list (shows its route path and whether key-auth is on).
5. Optionally opens **More options** to set a slug or route path.
6. Selects **Import and publish**.
7. Success: a confirmation names the API and links to it; the new row appears in
   **Published APIs**; the API is in the public catalog.
8. Invalid document: an error names the first validation error and says nothing was
   published. The form keeps its values so the admin can fix and resubmit.

### Flow C — Developer: revoke a key (AC 9)
1. `/dashboard` → selects an app → `/dashboard/apps/{appId}`.
2. In **API keys**, selects **Revoke** on a key → **Revoke key dialog**.
3. Selects **Revoke key**. The row changes to **Revoked**; a toast confirms.
4. Any call with that key now gets Kong's `401`.

### Flow D — Gateway unavailable while creating an app (AC 8)
1. On **Create app**, developer submits. Server returns `503 /problems/gateway-unavailable`.
2. The form stays filled. An error alert appears above the form, takes focus, and says
   nothing was created. Its **Try again** button is disabled for `Retry-After` seconds
   (5) with a countdown, then enabled.
3. Developer selects **Try again** (or **Create app and get key** again) once Kong is back →
   success continues at Flow A step 6. Nothing duplicated: the server guarantees this; the
   UI guarantees it can't double-submit (button disabled while pending).

### Flow E — Additional key
1. App page → **Create key** → Key reveal dialog titled "Your new API key" → **I've saved it**.

---

## 2. Global layout

### Site header (all pages)
```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◆ Developer Portal    APIs                     [Sign in]  [ Sign up ]        │  signed out
│ ◆ Developer Portal    APIs   Dashboard  Admin*          [ ana@ex.com ▾ ]     │  signed in
└──────────────────────────────────────────────────────────────────────────────┘
                                                *only when role = admin
375px
┌───────────────────────────────────┐
│ ◆ Developer Portal          [≡]   │   ≡ opens a Sheet from the right with the
└───────────────────────────────────┘     same links stacked, then Sign in/Sign up
                                          or the email + Sign out
```
- Brand text links to `/`. Nav link for the current section has `aria-current="page"`
  and a 2px `--primary` underline.
- Account menu (`DropdownMenu`): email (muted, not a link), separator, **Sign out**.
  Signing out → `/` with toast "You're signed out."
- Header session state comes from `GET /v1/me` (role decides the **Admin** link). While it
  loads, the right side shows a 96×32 `Skeleton` so the header doesn't jump.
- First element in the page: a **Skip to content** link, visible on focus, targeting `<main id="main">`.

### Page shell
- `<header>`, `<main id="main">`, `<footer>`. Content container `--portal-page-max-width`,
  gutters `--portal-page-gutter`.
- Footer (muted, sm): "Powered by Developer Portal · Apache 2.0" — one line, no links needed in this slice.
- Each page has exactly one `h1` and a `<title>` of `<Page> · Developer Portal`.

### Shared states
| State | Behaviour |
| --- | --- |
| Page loading | `loading.tsx` per route: skeletons in the page's layout shape. No full-page spinners. |
| Unexpected error (500, network) | `error.tsx`: h1 "Something went wrong", body "The page didn't load. This is usually temporary.", buttons **Try again** (reset) and **Go to APIs**. |
| Not found | `not-found.tsx`: h1 "Page not found", body "We can't find that page. Check the address, or go back to the APIs.", button **Go to APIs**. Also used for non-admins on `/admin/*` (spec). |
| Signed out on a protected route | Middleware redirect to `/sign-in?next=<path+query>`. Sign-in shows the info line "Sign in to continue." |
| Session ends mid-use (any data call returns 401) | Redirect to `/sign-in?next=<current path>`, toast "Your session has ended. Sign in to continue." Unsaved form values are lost; acceptable for this slice. |
| Request never reached the server (fetch throws) | Toast (error) "Can't reach the portal server. Check your connection and try again." Pending buttons re-enable. |
| `429 /problems/rate-limited` on any portal call | Toast "Too many requests. Wait a moment and try again." |

`next` is only honoured when it's a same-origin path (starts with `/`, not `//`, no scheme).
Anything else falls back to `/dashboard`.

---

## 3. Screens

### 3.1 Catalog — `/` (AC 1, 2, 3)
**Purpose:** show what APIs exist and get the visitor to one in a click. It's also the page
the quickstart opens on, so it must say what to do.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ header                                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  APIs                                                              (h1)      │
│  Read the reference, get a key and try a call from your browser.             │
│                                                                              │
│  ┌ How it works (signed out only) ──────────────────────────────────────┐   │
│  │ ① Pick an API     ② Create a free account and get a key     ③ Try a  │   │
│  │                                                         call in the docs│
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│  │ Sample HTTP API  1.0.0│ │ …                    │ │ …                    │ │
│  │ A small HTTP API for  │ │                      │ │                      │ │
│  │ trying the portal…    │ │                      │ │                      │ │
│  │ http://localhost:8000/│ │                      │ │                      │ │
│  │ sample                │ │                      │ │                      │ │
│  │ View reference →      │ │                      │ │                      │ │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
375px: same order, one column, cards full width, "How it works" steps stacked.
```
**Content** (from `GET /v1/apis`, newest first): per `ApiCard` — `title` (h2, link),
`version` badge ("v1.0.0"), `description` rendered as plain text (Markdown stripped, first
paragraph, clamped to 3 lines; omitted when null), `gatewayBaseUrl` in mono, muted, "View
reference" text. The whole card is one link (title link with a stretched hit area) to
`/apis/{slug}`; no nested links.

**Primary action:** open an API.

| State | Content |
| --- | --- |
| Loading | h1 and intro render; 3 card skeletons. |
| Success | Cards grid: 3 columns ≥1024px, 2 columns ≥640px, 1 below. |
| Empty, visitor/developer | `EmptyState` — title "No APIs yet", body "No APIs have been published yet. Check back soon." |
| Empty, admin | Same title; body "Import an OpenAPI document to publish your first API."; button **Import an API** → `/admin/apis`. |
| Error | `Alert` (destructive) "We couldn't load the APIs." + **Try again** (re-fetch). |
| No permission | n/a (public). |

"How it works" is shown only to signed-out visitors; it's static text, not a stepper.

### 3.2 API reference — `/apis/[slug]` (AC 3, 7)
**Purpose:** read the API and make a real call. Scalar renders the reference and try-it;
the portal adds a header strip with the key CTA and one line of try-it guidance.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ header                                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ APIs / Sample HTTP API                                       (Breadcrumb)    │
│ Sample HTTP API  [v1.0.0]                                   [Get an API key] │
│ Base URL  http://localhost:8000/sample  [Copy]                               │
│ ⓘ To try a request, paste your API key into the apikey field under           │
│   Authentication, choose an operation and select Send.                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌────────────────────────────────────────────────────────┐ │
│ │ Scalar sidebar │ │ Scalar content: Authentication (apikey [_________])    │ │
│ │  GET  /get     │ │ GET /get … [Test Request] → request/response panel     │ │
│ │  POST /post    │ │                                                        │ │
│ │  …             │ │                                                        │ │
│ └───────────────┘ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
375px
┌───────────────────────────────────┐
│ APIs / Sample HTTP API            │
│ Sample HTTP API  [v1.0.0]         │
│ Base URL                          │
│ http://localhost:8000/sample [⧉]  │  wraps (break-all)
│ [      Get an API key       ]     │  full width
│ ⓘ To try a request, paste…        │
├───────────────────────────────────┤
│ Scalar (its own mobile layout:    │
│ menu button + single column)      │
└───────────────────────────────────┘
```
**Content:** `GET /v1/apis/{slug}` → `title`, `version`, `gatewayBaseUrl`. Scalar loads
`documentUrl` (`/api/v1/apis/{slug}/openapi.json`) with `proxyUrl: /api/v1/try-it`,
`hideDarkModeToggle: true`, `forceDarkModeState: 'light'`, theme from tokens
([tokens.md → Mapping to Scalar](tokens.md#mapping-to-scalar)). Don't render the API's
description in the portal header; Scalar already shows it.

**Primary action:** **Get an API key** (primary button).
- Signed out → `/sign-up?next=/dashboard/apps/new?api={slug}` (URL-encoded).
- Signed in → `/dashboard/apps/new?api={slug}`.

The info line is an `Alert` (default variant, `Info` icon), always visible; it's the only
instruction the developer needs for AC 7.

| State | Content |
| --- | --- |
| Loading | Breadcrumb + h1 skeleton (240×32) + button skeleton; reference area shows "Loading API reference…" (muted, `role="status"`). |
| Success | As wireframe. |
| Try-it: key valid | Scalar shows `200` and body. |
| Try-it: no key / revoked key | Scalar shows Kong's `401` and its body as-is (AC 7, 9). We don't intercept it. |
| Try-it: proxy problems | Scalar shows the problem+json body. The server's `detail` must be readable on its own — recommended strings in §6. |
| Not found (`404`) | Portal `not-found` with h1 "API not found", body "We can't find that API. It may have been unpublished, or the link is wrong.", button **Go to APIs**. |
| Document failed to load | `Alert` (destructive) in the reference area: "The API reference didn't load." + **Try again** (re-mount Scalar). Header strip still works. |
| No permission | n/a (public). |

### 3.3 Sign up — `/sign-up` (AC 5)
**Purpose:** create an account with the least friction. No email verification in this slice.

```
1280px (card centred, --portal-auth-max-width)      375px (card fills width, no border)
        ┌──────────────────────────────────┐        ┌───────────────────────────────┐
        │ Create your developer account (h1)│        │ Create your developer account │
        │ Get an API key in under a minute. │        │ Get an API key in under a     │
        │                                   │        │ minute.                       │
        │ Name                              │        │ Name                          │
        │ [______________________________]  │        │ [___________________________] │
        │ Email                             │        │ Email                         │
        │ [______________________________]  │        │ [___________________________] │
        │ Password                          │        │ Password                      │
        │ [__________________________][Show]│        │ [_______________________][Show│
        │ At least 8 characters.            │        │ At least 8 characters.        │
        │                                   │        │                               │
        │ [         Create account        ] │        │ [       Create account      ] │
        │                                   │        │                               │
        │ Already have an account? Sign in  │        │ Already have an account?      │
        └──────────────────────────────────┘        │ Sign in                       │
                                                     └───────────────────────────────┘
```
**Fields** (Better Auth `/sign-up/email`: `name`, `email`, `password`):
| Label | Input | Attributes | Validation message |
| --- | --- | --- | --- |
| Name | text | `autocomplete="name"`, required | empty → "Enter your name." |
| Email | email | `autocomplete="email"`, `inputmode="email"`, required | empty or invalid → "Enter an email address, like name@example.com." |
| Password | password + **Show**/**Hide** toggle button | `autocomplete="new-password"`, required, hint "At least 8 characters." | under 8 → "Use at least 8 characters." over 128 → "Use 128 characters or fewer." |

Validate on submit, then on blur/change for fields already shown as invalid.

**Primary action:** **Create account** (full width). Pending: "Creating account…", disabled,
spinner icon, fields `readOnly`.

| State | Content |
| --- | --- |
| Default | As wireframe. If `next` is set, the line "Sign up to get your API key." replaces the subtitle when `next` starts with `/dashboard/apps/new`. |
| Field errors | Inline under each field; focus moves to the first invalid field. |
| Email already registered (Better Auth `USER_ALREADY_EXISTS`) | Error under Email: "An account with this email already exists." followed by the link **Sign in instead** (keeps `next`). |
| Rate limited (429) | Form-level `Alert` (destructive): "Too many attempts. Wait a minute and try again." |
| Other failure | Form-level `Alert`: "We couldn't create your account. Try again." |
| Success | Redirect to `next` or `/dashboard`. No toast (the next page is the confirmation). |
| Already signed in | Redirect to `/dashboard`. |
| Loading | n/a (static form). |

### 3.4 Sign in — `/sign-in`
Same card layout as sign-up.
- h1 "Sign in". Subtitle: "Sign in to continue." when `next` is set, otherwise none.
- Email (`autocomplete="email"`), Password (`autocomplete="current-password"`, Show/Hide).
- Primary **Sign in** → pending "Signing in…".
- Footer: "New here? **Create an account**" (→ `/sign-up`, keeps `next`).
- No "Forgot password" link in this slice (no email delivery). Don't show a dead link.

| State | Content |
| --- | --- |
| Field errors | Email empty/invalid → "Enter an email address, like name@example.com."; password empty → "Enter your password." |
| Wrong credentials | Form-level `Alert` (destructive): "Email or password is incorrect." Password field is cleared and focused. Don't say which one was wrong. |
| Rate limited | "Too many attempts. Wait a minute and try again." |
| Other failure | "We couldn't sign you in. Try again." |
| Success | Redirect to `next` or `/dashboard`. |
| Already signed in | Redirect to `/dashboard`. |

### 3.5 Dashboard — `/dashboard` (AC 5, 6)
**Purpose:** a developer's home. Lists their apps; the empty state is the onboarding.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ Your apps (h1)                                                  [Create app] │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Name             APIs                      Active keys   Created         │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Weather bot      Sample HTTP API           1             2 Nov 2026      │ │
│ │ CLI prototype    Sample HTTP API, Orders   2             1 Nov 2026      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
375px: h1 then [Create app] full width below it; table becomes a list of cards:
┌───────────────────────────────────┐
│ Weather bot                    →  │
│ Sample HTTP API                   │
│ 1 active key · Created 2 Nov 2026 │
└───────────────────────────────────┘
```
**Content** (`GET /v1/apps`, newest first): `name` (link to `/dashboard/apps/{id}`),
subscription `title`s comma-separated, count of `credentials` with `status = active`,
`createdAt` as a date. Dates everywhere: `Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })`
in a `<time datetime="…">`.

**Primary action:** **Create app** → `/dashboard/apps/new`.

| State | Content |
| --- | --- |
| Loading | h1 + button; 3 skeleton rows (cards at 375px). |
| Empty | `EmptyState` (icon `KeyRound`) — title "Create your first app", body "An app holds your API keys. Create one, choose the APIs it uses, and you'll get a key straight away.", button **Create app**. The header button is hidden in this state so there is one primary action. |
| Success | Table / cards. "0" active keys is shown as "None" in muted text. |
| Error | `Alert` (destructive) "We couldn't load your apps." + **Try again**. |
| No permission | Signed out → sign-in redirect. |

### 3.6 Create app — `/dashboard/apps/new` (AC 6, 8)
**Purpose:** name an app, pick APIs, get a key — one form, one submit.

```
1280px (form column --portal-form-max-width, left-aligned in the container)
┌──────────────────────────────────────────────────────────────────────────────┐
│ Your apps / New app                                                          │
│ Create an app (h1)                                                           │
│ You'll get an API key as soon as it's created.                               │
│                                                                              │
│ ┌ ✕ Gateway unavailable ───────────────────────────────┐  (only after a 503) │
│ │ The API gateway didn't respond. Nothing was created.  │                     │
│ │ Try again in a moment.            [Try again in 5s]   │                     │
│ └───────────────────────────────────────────────────────┘                     │
│                                                                              │
│ App name                                                                     │
│ [____________________________________________]                               │
│ Up to 80 characters. Only you can see it.                                    │
│                                                                              │
│ Description (optional)                                                       │
│ [____________________________________________]                               │
│ [____________________________________________]                               │
│                                                                              │
│ APIs this app uses                                       (fieldset legend)   │
│ ☑ Sample HTTP API  v1.0.0                                                    │
│   http://localhost:8000/sample                                               │
│ ☐ Orders API  v2.3.0                                                         │
│   http://localhost:8000/orders                                               │
│                                                                              │
│ [ Create app and get key ]   Cancel                                          │
└──────────────────────────────────────────────────────────────────────────────┘
375px: single column; submit full width, Cancel below it as a centred text link.
```
**Data:** `GET /v1/apis` for the checkbox list. Submit `POST /v1/apps`
`{ name, description?, apiIds }`.

**Fields:**
| Label | Control | Rules | Message |
| --- | --- | --- | --- |
| App name | `Input`, `autocomplete="off"`, required | 1–80 chars, trimmed | empty → "Give your app a name."; >80 → "Use 80 characters or fewer." |
| Description (optional) | `Textarea`, 3 rows | ≤500 chars; counter "{n}/500" appears from 400 | >500 → "Use 500 characters or fewer." |
| APIs this app uses | `Checkbox` per API in a `fieldset` | 1–10 | none → "Choose at least one API."; at 10 the unchecked boxes disable and the hint "You can choose up to 10 APIs." shows |

Preselection:
- `?api={slug}` ticks that API.
- If the slug isn't in the list, show a muted note above the list: "The API you came from
  isn't available any more. Choose from the list below."
- If no `?api` and exactly one API is published, tick it.

**Primary action:** **Create app and get key**. Pending: "Creating app…", disabled, all
fields `disabled`/`readOnly`. Prevent double submit. **Cancel** → `/dashboard`.

On `201`: `router.replace('/dashboard/apps/{app.id}')` (Back won't return to a submitted
form) and open the Key reveal dialog with `credential` from the response. The credential is
passed through in-memory client state only and cleared when the dialog closes.

| State / response | UI |
| --- | --- |
| Loading API list | Fields render; the fieldset shows 2 skeleton checkbox rows; submit disabled. |
| No published APIs | Replace the form with `EmptyState`: title "No APIs to use yet", body "An app needs at least one API, and none have been published. Check back soon." button **Back to your apps**. |
| API list failed | `Alert` (destructive) in the fieldset: "We couldn't load the APIs." + **Try again**. Submit disabled. |
| `400 /problems/validation` | Map `errors[].pointer` (`/name`, `/description`, `/apiIds`) to fields with the messages above; unknown pointers → form alert "Check the highlighted fields and try again." |
| `404` (an API was unpublished meanwhile) | Form alert: "One of the APIs you chose is no longer available. We've refreshed the list — check your choices and try again." Re-fetch the list; keep other values. |
| `409 /problems/app-name-taken` | Error on App name: "You already have an app called “{name}”. Choose a different name." Focus App name. |
| `503 /problems/gateway-unavailable` (AC 8) | `ProblemAlert` above the form. Title "Gateway unavailable". Body: problem `detail` (contract text: "The API gateway didn't respond. Nothing was created. Try again in a moment."). Button **Try again** resubmits the same values; disabled for `Retry-After` seconds as "Try again in {n}s". Focus moves to the alert. Values kept. |
| `502 /problems/gateway-rejected` | `ProblemAlert` title "The gateway rejected the request". Body: "Nothing was created. Try again, and if it keeps happening, tell the portal admin." Then the problem `detail` in muted text if present. |
| Success | Navigate + Key reveal dialog (3.7). |
| No permission | Signed out → sign-in redirect (keeps `?api`). |

### 3.7 Key reveal dialog — component `KeyRevealDialog` (AC 6)
**Purpose:** hand over the key once, unmistakably, and make copying trivial.

```
1280px (dialog max-width 560px)                   375px (width = viewport − 32px)
┌──────────────────────────────────────────────┐  ┌─────────────────────────────────┐
│ Your API key                            (h2) │  │ Your API key                    │
│ For Weather bot                              │  │ For Weather bot                 │
│                                              │  │                                 │
│ ┌ ⚠ ─────────────────────────────────────────┐│  │ ┌ ⚠ ───────────────────────────┐│
│ │ Copy this key now. We won't show it again. ││  │ │ Copy this key now. We won't  ││
│ │ If you lose it, create a new key.          ││  │ │ show it again. If you lose   ││
│ └────────────────────────────────────────────┘│  │ │ it, create a new key.        ││
│                                              │  │ └──────────────────────────────┘│
│ API key                                      │  │ API key                         │
│ ┌─────────────────────────────────┐ [ Copy ] │  │ ┌─────────────────────────────┐ │
│ │ pk_3q2-7wErTn0Lk…full key…9fQa  │          │  │ │ pk_3q2-7wErTn0LkVb8yHq1Zc  │ │
│ └─────────────────────────────────┘          │  │ │ …wraps, never truncated…   │ │
│                                              │  │ └─────────────────────────────┘ │
│ Send it in the apikey header:                │  │ [            Copy           ]  │
│ ┌──────────────────────────────────────────┐ │  │ Send it in the apikey header:  │
│ │ apikey: pk_3q2-7wErTn0Lk…9fQa            │ │  │ ┌─────────────────────────────┐│
│ └──────────────────────────────────────────┘ │  │ │ apikey: pk_…                ││
│ Works with: Sample HTTP API                  │  │ └─────────────────────────────┘│
│                                              │  │ Works with: Sample HTTP API    │
│                             [ I've saved it ] │  │ [       I've saved it        ] │
└──────────────────────────────────────────────┘  └─────────────────────────────────┘
```
**Content:** `credential.key` (full, mono, wraps with `overflow-wrap: anywhere`, never
truncated), `credential.headerName` (in the copy and in the example line), app name,
subscription titles.

**Behaviour:**
- Built on shadcn `AlertDialog` (`role="alertdialog"`): no close ✕, `Escape` and backdrop
  click do **not** close it. The only exit is **I've saved it**. (Browser reload/navigation
  does lose the key — that's the "shown once" rule, and the warning says so.)
- Initial focus: **Copy**.
- **Copy** → `navigator.clipboard.writeText(key)`; label becomes "Copied" with a check icon
  for 2 s; a polite live region announces "API key copied." On failure the label stays
  "Copy", the key text is selected, and the hint "Couldn't copy automatically. The key is
  selected — press Ctrl+C (⌘C on Mac)." appears under the field.
- The example header line has its own small `CopyButton` (aria-label "Copy header line").
- Nothing about the key is written to the URL, `localStorage`, `sessionStorage`, analytics
  or console.
- On close: clear the key from memory; focus moves to the new key's row in **API keys**
  (its key-hint cell, `tabIndex=-1`); the row gets an `--accent` background for 3 s.

Variants: `title` = "Your API key" (after create app) or "Your new API key" (Create key).

### 3.8 App detail — `/dashboard/apps/[appId]` (AC 6, 9)
**Purpose:** see what the app can call, manage its keys, and get to try-it.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ Your apps / Weather bot                                                      │
│ Weather bot (h1)                                                             │
│ Polls the sample API every hour.            Created 2 Nov 2026               │
│                                                                              │
│ ┌ Try your key ─────────────────────────────────────────────────────────────┐│
│ │ Open an API reference, paste your key into the apikey field and select   ││
│ │ Send.   [Open Sample HTTP API reference]                                 ││
│ └───────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│ APIs (h2)                                                                    │
│ • Sample HTTP API                                       View reference →     │
│                                                                              │
│ API keys (h2)                                              [ Create key ]    │
│ Keys are shown once, when they're created. Up to 5 can be active.            │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Key        Status       Created        Revoked                           │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ …9fQa      ● Active     2 Nov 2026     —              [Revoke]           │ │
│ │ …x7Lm      ○ Revoked    1 Nov 2026     2 Nov 2026                        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
375px: table → one card per key:
┌───────────────────────────────────┐
│ …9fQa              ● Active       │
│ Created 2 Nov 2026                │
│ [            Revoke             ] │
└───────────────────────────────────┘
"Create key" goes full width under the API keys heading.
```
**Content** (`GET /v1/apps/{appId}`): `name`, `description` (omitted when null),
`createdAt`, `subscriptions[]` (`title`, link `/apis/{slug}`), `credentials[]`.
Keys are ordered active first, then revoked, each group newest first.
- Key cell: `KeyHint` — "…{keyHint}" in mono; accessible name "Key ending in {keyHint}".
- Status: `StatusBadge` — Active (`--portal-success` on `--portal-success-subtle`, dot icon)
  or Revoked (`--muted-foreground` on `--muted`, hollow-dot icon). Revoked rows use muted text.
- Revoked column: `revokedAt` date, "—" when null (with `aria-label="Not revoked"`).

**Try your key panel:** shown when the app has at least one active key. One button per
subscription when there are ≤2 ("Open {title} reference"); otherwise the sentence links to
the APIs section.

**Actions:**
- **Create key** (secondary button) → `POST /v1/apps/{appId}/credentials`. Pending:
  "Creating key…". On `201`, open `KeyRevealDialog` ("Your new API key") and add the row.
  Disabled when 5 keys are active, with the hint replacing the subtitle: "This app has 5
  active keys, the maximum. Revoke one to create another." (hint linked via `aria-describedby`;
  use `aria-disabled` so the button stays focusable and the reason is announced).
- **Revoke** (ghost, `--destructive` text) on active keys → Revoke key dialog (3.9).

| State / response | UI |
| --- | --- |
| Loading | Breadcrumb, h1 skeleton, two section skeletons. |
| Success | As wireframe. |
| No active keys | Try-your-key panel hidden; above the table: muted "This app has no active keys. Create one to call its APIs." |
| Create key `409 /problems/credential-limit` | Inline `ProblemAlert` above the table: "This app already has 5 active keys. Revoke one, then create a new key." Re-fetch the app. |
| Create key `503` | Inline `ProblemAlert` above the table: title "Gateway unavailable", body problem `detail` ("…Nothing was created…"), **Try again** with the `Retry-After` countdown. |
| Create key `502` | Inline `ProblemAlert`: "The gateway rejected the request. No key was created. Try again, and if it keeps happening, tell the portal admin." |
| Not found (`404`, including another developer's app) | `not-found` with h1 "App not found", body "We can't find that app. Check the link, or go back to your apps.", button **Back to your apps**. Don't hint that it belongs to someone else. |
| Error (other) | `Alert` "We couldn't load this app." + **Try again**. |
| No permission | Signed out → sign-in redirect. |

### 3.9 Revoke key dialog (AC 9)
```
┌──────────────────────────────────────────────┐
│ Revoke key …9fQa?                       (h2) │
│ Anything using this key will get 401 errors  │
│ from the gateway straight away. You can't    │
│ undo this.                                   │
│                                              │
│               [ Cancel ]  [ Revoke key ]     │  375px: buttons stacked, full width,
└──────────────────────────────────────────────┘          Revoke key on top
```
- shadcn `AlertDialog`. Initial focus: **Cancel** (safe default). `Escape` = Cancel.
- **Revoke key** (destructive) → `DELETE …/credentials/{id}`. Pending: "Revoking…", both
  buttons disabled, `Escape` ignored while pending.
- `204` → close, row becomes Revoked (re-fetch app), toast (success) "Key …9fQa revoked."
  Focus moves to that row's key-hint cell (the Revoke button no longer exists).
- `503` → dialog stays open; `ProblemAlert` inside it: "The gateway didn't respond, so the
  key is still active. Try again in a moment." **Revoke key** becomes **Try again** with the
  `Retry-After` countdown. The row stays Active (the contract guarantees it is).
- `502` → same placement: "The gateway rejected the request, so the key is still active.
  Try again, and if it keeps happening, tell the portal admin."
- `404` → close dialog, show the App not found page.

### 3.10 Admin: APIs — `/admin/apis` (AC 3, 4)
**Purpose:** publish an OpenAPI document on a Kong service and see what's published.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ header (Admin active)                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ APIs (h1)                                                                    │
│ Import an OpenAPI document, link it to a Kong service and publish it.        │
│                                                                              │
│ ┌ ⚠ Kong's Admin API isn't responding … ────────┐ (only if health says so)   │
│                                                                              │
│ ┌ Import an API (h2) ─────────────────── form, --portal-form-max-width ────┐ │
│ │ Source                                                                   │ │
│ │ (•) Upload a file   ( ) From a URL                                       │ │
│ │ ┌ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┐    │ │
│ │ │  Drop an OpenAPI file here or [Choose file]                       │    │ │
│ │ │  YAML or JSON, OpenAPI 3.0 or 3.1, up to 5 MiB                    │    │ │
│ │ └ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┘    │ │
│ │ orders.yaml · 48 KB                                     [Remove]         │ │
│ │                                                                          │ │
│ │ Kong service                                           [Refresh list]    │ │
│ │ [ orders-svc — /orders — key-auth on                              ▾ ]    │ │
│ │                                                                          │ │
│ │ ▸ More options                                                           │ │
│ │   Slug  [__________]  Used in the URL /apis/<slug>. Leave blank to …     │ │
│ │   Route path [__________]  Leave blank to use the service's first …      │ │
│ │                                                                          │ │
│ │ [ Import and publish ]                                                   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Published APIs (h2)                                                          │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Title            Slug     Version  Base URL                    Published │ │
│ │ Sample HTTP API  sample   1.0.0    http://localhost:8000/sample  2 Nov   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
375px: one column. Radio options stacked. Drop zone becomes just the "Choose file" button
plus the hint (no drag-and-drop text on touch). Published table → cards (title link,
slug · version, base URL wrapped, published date).
```
**Data:**
- `GET /v1/admin/gateway/services` for the picker.
- `GET /v1/apis` for the published list (there's no admin list endpoint; the public list is
  the published set).
- `GET /v1/health` for the Kong banner.
- Submit `POST /v1/admin/apis` with `{ spec: {content} | {url}, gatewayServiceId, slug?, routePath? }`.
  File uploads are read in the browser as text and sent as `content`.

**Fields:**
| Label | Control | Rules | Message |
| --- | --- | --- | --- |
| Source | `RadioGroup`: "Upload a file" (default), "From a URL" | — | — |
| OpenAPI file | file input (`accept=".yaml,.yml,.json,application/json,application/yaml"`) styled as a drop zone, plus **Choose file** button | required when Source = file; ≤ 5 MiB checked before upload | none → "Choose an OpenAPI file."; too big → "This file is {size}. The limit is 5 MiB." |
| Document URL | `Input type="url"`, placeholder `https://example.com/openapi.yaml` | required when Source = URL; `http(s)://` | "Enter a URL that starts with http:// or https://." Hint: "The portal server fetches it once, now. It must be reachable from the server." |
| Kong service | `Select` (switch to a `Command` combobox when there are more than 10 services) | required | "Choose a Kong service." |
| Slug (in More options) | `Input`, mono | optional; `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 2–64 | "Use 2–64 lowercase letters, numbers and single hyphens, like orders-api." Hint: "Used in the URL /apis/<slug>. Leave blank to make one from the API title." |
| Route path (in More options) | `Input`, mono | optional; starts with `/` | "Start the route path with /." Hint: "The path on Kong where this API is served. Leave blank to use the service's first route path." |

Switching Source keeps the other source's value but only the visible one is submitted.

**Kong service option** (`GatewayService`): `name` — first route's first path (or "no
route path") — "key-auth on" / "key-auth off". If `linkedApiSlug` is set, append
"· linked to /apis/{linkedApiSlug}". Text, not colour, carries all of this.

After a service is chosen, contextual notes appear under the select:
- `keyAuth = false` → warning `Alert`: "Key-auth isn't enabled on this service. Developers
  will get keys, but Kong won't check them. Enable the key-auth plugin on the service in
  Kong to protect it." (Import is still allowed.)
- No route has a path → warning: "This service has no route path. Enter one under More
  options, or add a route to the service in Kong." and **More options** opens.
- `linkedApiSlug` set → info: "This service already serves /apis/{linkedApiSlug}."

**Primary action:** **Import and publish**. Pending: "Validating and publishing…", form disabled.

| State / response | UI |
| --- | --- |
| Loading | h1, form skeleton; services select shows "Loading Kong services…" disabled; list skeleton rows. |
| Kong unreachable per `GET /v1/health` (`gateway.reachable = false`) | Warning `Alert` under the intro: "Kong's Admin API isn't responding. Imports, new apps and new keys will fail until it's back." |
| Services: none | Under the select: "Kong has no services yet. Create a service and a route in Kong, then refresh the list." + **Refresh list**. Submit disabled. |
| Services: `503` | Under the select: destructive "Can't reach Kong's Admin API, so the service list is empty. Check that Kong is running, then refresh the list." + **Refresh list**. |
| Published list: empty | Muted text: "Nothing published yet. Imported APIs appear here and in the public catalog." |
| `422 /problems/invalid-openapi` (AC 4) | `ProblemAlert` above the submit button. Title "This isn't a valid OpenAPI document". Body: problem `detail` verbatim (it names the first error and its location, e.g. "Invalid OpenAPI document: must have required property 'info' at /"). If `errors[0].pointer` exists, show "Location: {pointer}" in mono. Last line: "Nothing was published." Focus the alert. Keep the form values. |
| `422 /problems/unsupported-openapi-version` | Title "Unsupported OpenAPI version". Body: problem `detail`, then "Only OpenAPI 3.0 and 3.1 are supported. Convert Swagger 2.0 documents to OpenAPI 3 first. Nothing was published." |
| `422 /problems/spec-url-unreachable` | Error on Document URL: "We couldn't fetch this URL. Check that it's reachable from the portal server and responds within 10 seconds." |
| `422 /problems/gateway-service-not-found` | Error on Kong service: "This service no longer exists in Kong. Refresh the list and choose another." Re-fetch services. |
| `422 /problems/gateway-service-has-no-route` | Open More options; error on Route path: "This service has no route path. Enter the path Kong serves this API on." |
| `409 /problems/api-slug-taken` | Open More options; error on Slug: "Another API already uses this slug. Enter a different one." (If the slug field was blank, the server generated it from the title; the message still applies — the admin now types one.) Show problem `detail` under it if present. |
| `413 /problems/document-too-large` | Error on file/URL: "This document is larger than 5 MiB, the import limit." |
| `400 /problems/validation` | Map `errors[].pointer` (`/spec/url`, `/gatewayServiceId`, `/slug`, `/routePath`) to fields; else form alert "Check the highlighted fields and try again." |
| `503` | `ProblemAlert` "Can't reach Kong's Admin API. Nothing was published. Try again in a moment." with **Try again** and `Retry-After` countdown if given. |
| `502` | `ProblemAlert` "Kong rejected the request. Nothing was published." + problem `detail` in mono, muted. |
| Success (`201`) | Form resets to defaults. Success `Alert` (`role="status"`, `--portal-success`) above the form: "Published {title}. It's now in the public catalog." + link **View {title}** → `/apis/{slug}`. Focus moves to this alert. New row added at the top of Published APIs with `--accent` highlight for 3 s. |
| No permission | Signed out → sign-in redirect. Signed-in non-admin → 404 page (spec). API `403` in any other case → 404 page as well. |

---

## 4. Components

### Reused shadcn/ui components
`Button`, `Input`, `Label`, `Textarea`, `Checkbox`, `RadioGroup`, `Select`, `Command` +
`Popover` (service combobox), `Form` (react-hook-form + zod), `Card`, `Table`, `Badge`,
`Alert`, `AlertDialog`, `DropdownMenu`, `Sheet` (mobile nav), `Skeleton`, `Breadcrumb`,
`Collapsible` (More options), `Separator`, `Sonner` (toasts — shadcn's current toast
component; the spec's "toast" task means this).

Button variants used: `default` (primary), `secondary`, `ghost`, `destructive`, `link`.
Sizes: default 40px tall; on <768px form submit buttons are full width and 44px tall.

### New components (in `packages/ui` unless noted)

**`PageHeader`** — h1, optional description, optional actions slot, optional breadcrumb.
Props: `title: string`, `description?: ReactNode`, `actions?: ReactNode`,
`breadcrumb?: {label: string; href?: string}[]`. Below 640px actions wrap below and go full width.

**`EmptyState`** — centred block in a dashed `--border` card.
Props: `icon?: LucideIcon`, `title: string`, `description: string`, `action?: ReactNode`.
Title is an h2.

**`CopyButton`** — copies a string, shows "Copied" for 2 s, announces via its own polite
live region. Props: `value: string`, `label?: string` (default "Copy"),
`ariaLabel?: string`, `variant?: 'secondary' | 'ghost'`, `size?: 'default' | 'icon'`,
`onCopyError?: () => void`. Icon-only size must have `ariaLabel`.

**`CodeValue`** — read-only monospace value with an attached `CopyButton`.
Props: `value: string`, `label: string` (visible label, or `srOnly`), `wrap?: boolean`
(default true, `overflow-wrap:anywhere`), `selectOnFocus?: boolean`.
Used for the API key, the header line, and the base URL.

**`KeyRevealDialog`** (`apps/portal`) — see 3.7.
Props: `open: boolean`, `credential: IssuedCredential`, `appName: string`,
`apiTitles: string[]`, `variant: 'first' | 'additional'`, `onDone: () => void`.

**`KeyHint`** — renders "…{hint}" in mono with `aria-label="Key ending in {hint}"`.
Props: `hint: string`.

**`StatusBadge`** — Props: `status: 'active' | 'revoked'`. Word + icon + token colours from 3.8.

**`ProblemAlert`** (`apps/portal`) — turns an RFC 9457 problem into an `Alert`.
Props: `problem: Problem`, `title?: string` (override), `message?: ReactNode` (override
body; default shows `problem.detail`, falling back to `problem.title`), `onRetry?: () => void`,
`retryAfterSeconds?: number` (from the `Retry-After` header; shows "Try again in {n}s" and
enables at 0), `autoFocus?: boolean` (default true). Renders `role="alert"`, `tabIndex=-1`,
destructive variant with `CircleAlert` icon. Never renders `problem.instance` or stack data.

**`ApiCard`** (`apps/portal`) — Props: `api: ApiSummary`. Layout in 3.1.

**`GatewayServiceOption`** (`apps/portal`) — text for one `GatewayService` in the picker (3.10).

---

## 5. Copy reference

Voice: plain, short, second person, present tense. Say what happened, what didn't, and
what to do. Sentence case everywhere. No "Oops", no "Error:", no exclamation marks, no
blame ("you entered an invalid…" → "Enter a…").

### Page titles (`<title>`)
| Route | Title |
| --- | --- |
| `/` | APIs · Developer Portal |
| `/apis/[slug]` | {API title} · Developer Portal |
| `/sign-up` | Create account · Developer Portal |
| `/sign-in` | Sign in · Developer Portal |
| `/dashboard` | Your apps · Developer Portal |
| `/dashboard/apps/new` | Create an app · Developer Portal |
| `/dashboard/apps/[appId]` | {App name} · Developer Portal |
| `/admin/apis` | Manage APIs · Developer Portal |

### Buttons and links (exact labels)
Sign in · Sign up · Sign out · Create account · Sign in instead · Create an account ·
Get an API key · View reference · Open {API title} reference · Create app ·
Create app and get key · Cancel · Try again · Try again in {n}s · Copy · Copied ·
I've saved it · Create key · Revoke · Revoke key · Import and publish · Refresh list ·
Choose file · Remove · More options · Import an API · Go to APIs · Back to your apps ·
Skip to content · Show / Hide (password)

Pending labels: Creating account… · Signing in… · Creating app… · Creating key… ·
Revoking… · Validating and publishing…

### Toasts
| Event | Text |
| --- | --- |
| Signed out | You're signed out. |
| Key revoked | Key …{hint} revoked. |
| Session ended | Your session has ended. Sign in to continue. |
| Network failure | Can't reach the portal server. Check your connection and try again. |
| Rate limited | Too many requests. Wait a moment and try again. |

All other copy is inline in the screen sections above.

---

## 6. Recommended `detail` strings for try-it proxy problems

Scalar shows the proxy's problem+json body as the response, so its `detail` is the only
copy the developer sees. Recommended for the backend (the contract fixes only the
gateway-unavailable and invalid-openapi details):

| Problem | `detail` |
| --- | --- |
| `400` try-it target not allowed | "The try-it console can only call published APIs on this portal's gateway." |
| `413 /problems/payload-too-large` | "The request or response is larger than 1 MiB, the try-it limit. Use curl for large payloads." |
| `429 /problems/rate-limited` | "Too many try-it requests. Wait a minute and try again." |
| `504 /problems/try-it-timeout` | "The API didn't respond within 10 seconds." |
| `503 /problems/gateway-unavailable` | "The API gateway didn't respond. Try again in a moment." |

---

## 7. Accessibility (WCAG 2.2 AA)

### Keyboard path — Flow A without a mouse
1. `/`: Tab → Skip to content → (header links) → first API card link. Enter.
2. `/apis/sample`: Tab order: breadcrumb → **Copy** (base URL) → **Get an API key** →
   Scalar. Enter on Get an API key.
3. `/sign-up`: focus starts at the top of the page; Tab → Name → Email → Password → Show →
   Create account → Sign in link. Enter submits from any field.
4. `/dashboard/apps/new`: Tab → App name → Description → each API checkbox (Space toggles)
   → Create app and get key → Cancel.
5. Dialog opens with focus on **Copy**; Tab cycles Copy → Copy header line → I've saved it
   (trapped). Enter on I've saved it → focus on the new key row.
6. Tab → Try your key panel button → Enter → `/apis/sample`; Scalar's auth input and Send
   button are keyboard reachable (Scalar's own focus handling).

### Focus rules
- Visible focus ring on everything (tokens.md → Focus). Never `outline: none` without it.
- On client navigation, Next.js's route announcer reads the new title; we also move focus to
  the h1 (`tabIndex=-1`) on form-flow pages (`/dashboard/apps/new` → app detail).
- Form submit with errors → focus the first invalid field. Server/form-level error →
  focus the `ProblemAlert`. Success alerts → focus the alert.
- Dialogs: focus trapped; initial focus as specified (Copy / Cancel); focus returns to a
  sensible element on close (new or changed row; the trigger if it still exists).
- Focus never lands behind the sticky header (`scroll-margin-top: var(--portal-header-height)`).

### Labels and semantics
- Every input has a visible `<Label>`; hints and errors are linked with `aria-describedby`;
  invalid fields get `aria-invalid="true"`. Required fields use `required`; optional ones
  say "(optional)" in the label.
- Checkbox list and radio group are `fieldset` + `legend`.
- Error text has an icon and the word, never colour alone. Status badges include the word.
- Icon-only buttons (mobile menu, small copy buttons) have `aria-label`s:
  "Open menu", "Copy base URL", "Copy header line".
- Tables: `<caption>` (visually hidden) "Your apps", "API keys for {app}", "Published APIs";
  `<th scope="col">`. Card layouts at 375px use `<ul>`/`<li>`.
- Live regions: copy status (polite), toasts (Sonner, polite), `ProblemAlert` (`role="alert"`),
  loading text (`role="status"`). Pending buttons set `aria-busy="true"`.
- The key value is rendered as text in a read-only field labelled "API key", so screen
  readers can read it character by character.
- Dates are `<time datetime="ISO">`.

### Contrast, size, motion
- Colour pairs and ratios are in `tokens.md`; all text ≥4.5:1, UI boundaries and focus ≥3:1.
- Targets ≥24×24 CSS px (2.5.8); our buttons are 40px (44px on mobile forms). Inline text
  links in sentences are exempt but get 4px vertical padding where they stand alone.
- Body text 16px; content reflows at 320px wide with no horizontal scroll (except inside
  Scalar's code samples, which scroll in their own box).
- `prefers-reduced-motion` turns off transitions, skeleton pulse and the row highlight fade
  (the highlight shows statically for 3 s instead).
- Nothing times out on the user; the `Retry-After` countdown only delays a button.

---

## 8. Responsive behaviour

Breakpoints are Tailwind defaults (`sm` 640, `md` 768, `lg` 1024). Designs are specified at
**375px** and **1280px**; anything between follows the nearest rules below.

| Element | 375px | 1280px |
| --- | --- | --- |
| Page gutter | 16px | 32px, content capped at 1200px |
| Header | Brand + menu button; links in a right-side `Sheet` | Inline nav + account menu |
| h1 | 24px | 30px |
| Catalog grid | 1 column | 3 columns |
| API reference header strip | Stacked; base URL wraps; CTA full width | Title + CTA on one row |
| Scalar | Scalar's mobile layout (its menu button, single column) | Sidebar + content (+ request panel at its own breakpoint) |
| Auth cards | Full width, no card border/shadow | 400px card, centred |
| Forms (create app, import) | Full width; submit full width and 44px; secondary action below | 640px column; buttons inline, left-aligned |
| Tables (apps, keys, published APIs) | Cards in a list | Tables |
| `PageHeader` actions | Wrap below the title, full width | Right of the title |
| Dialogs | Width = viewport − 32px, buttons stacked full width, primary on top; max-height 90vh with body scroll | 560px (key) / 440px (revoke), buttons right-aligned |
| Import drop zone | "Choose file" button + hint only | Dashed drop zone with drag-and-drop |

No horizontal page scrolling at any width ≥320px. Long values (keys, URLs, slugs) wrap
with `overflow-wrap: anywhere`; they're never truncated where the user needs the whole value.

---

## 9. Notes for frontend and QA

- Stable test hooks: use roles and accessible names from this doc (e.g. button
  "Create app and get key", dialog "Your API key", button "I've saved it"); no `data-testid`
  is needed for the acceptance tests.
- AC 6 e2e: assert the dialog can't be dismissed with `Escape`, that **Copy** puts the exact
  key on the clipboard, and that after **I've saved it** the key text is gone from the DOM.
- AC 8 e2e: assert the 503 alert text, that the form keeps its values, and that the retry
  button is disabled during the countdown.
- AC 4 e2e: assert the alert contains the problem `detail` and "Nothing was published."
