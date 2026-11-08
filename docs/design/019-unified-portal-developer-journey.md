# 019 — Unified portal, developer journey: UX design

Spec: [019-unified-portal-developer-journey](../specs/019-unified-portal-developer-journey.md).
North star: [unified portal UX](jso-316-unified-api-portal.md). Base screens:
[001](001-kong-quickstart-slice.md) and [004](004-per-api-access-control.md).

This spec adds **no new routes**. It changes five shipped screens: site header, API reference, My
apps, Create app and App page. It also changes where the sign-up and sign-in links lead. Anything
not mentioned here stays as 001 and 004 specify. There are no new tokens.

## 0. Principles for this change

- **Show one next step, and only one we know is true.** The page shows no access action until it has
  an answer. A wrong action is worse than a late one, because it creates a duplicate app.
- **The reference never waits.** The title, base URL and reference don't depend on the access check.
- **One name per place.** The label is **My apps** everywhere it names the page. Sentences and
  actions that say "your apps" stay, as the spec requires.
- **Wrap, never truncate.** App names and API titles appear in full, even at 80 unbroken characters.
- **One destination, one link.** Rows and cards have a single link, so keyboard users don't tab through
  the same destination twice.

## 1. User flows

### Flow A — Visitor: API page to first request (AC 3, 7)

1. The visitor opens `/apis/{slug}`. **Get an API key** is in the server-rendered page, and no access
   check runs.
2. They select **Get an API key** and arrive at `/sign-up?next=/dashboard/apps/new?api={slug}`.
3. They create an account and arrive at Create app with this API checked and focus in **App name**.
4. They select **Create app and get key**, then save the key in the reveal dialog.
5. On the App page they select **Try this API** beside this API, which opens `/apis/{slug}`.
6. They paste the key in Authentication, choose an operation and select **Send**.
7. **Success:** Scalar shows `200` and the upstream's body.

### Flow B — Existing developer sent to sign-up (AC 3)

| Start | Path | Ends at |
| --- | --- | --- |
| Signed out on `/apis/{slug}` with an account | **Get an API key**, then **Sign in** or **Sign in instead**, then sign in | `/apis/{slug}`, with the action for their access |
| The same sign-in page, but they have no account | **Create an account**, then sign up | Create app, with this API checked and focus in **App name** |
| Signed out, opens `/dashboard/apps/new?api={slug}` directly | Middleware sends them to sign-in, then they sign in | Create app, as today |

### Flow C — Developer who already has access (AC 4, 5)

1. A signed-in developer opens `/apis/{slug}`. The title, base URL and reference render, and the
   action area shows a placeholder.
2. `GET /v1/apps` returns. The action from §3.2's table replaces the placeholder. Focus doesn't move.
3. **One app:** **Open in {app name}** opens that app's page.
4. **Several apps:** **View your apps** opens `/dashboard?api={slug}`, where every app is listed and
   the apps with access carry a label (§3.3).

### Flow D — Access check fails, then recovers (AC 6)

1. The check fails with anything other than 200 or 401, a network error, or no response in 10 seconds.
2. The page shows "Access status couldn't be confirmed" with **Try again**, and no access action. The
   reference still works.
3. The developer selects **Try again**. The message stays and the button reads **Checking…**.
4. **Recovered:** the action replaces the message and takes focus. Anything typed in Scalar is kept.
5. **Failed again:** the message stays, the button reads **Try again** and focus stays on it.

### Flow E — Developer on a phone (AC 2, 8)

1. They select **Open menu**. Focus lands on **Close menu**.
2. They select **My apps**. It loads with the menu closed.
3. Each app is a card. They select **Open app** to reach that app.

## 2. Components

Reuse `PageHeader`, `Button`, `Card`, `Badge`, `Table`, `EmptyState`, `ProblemAlert`, `Dialog` and
`DateValue`. There is no new shared component.

| Portal component (from the technical design) | Renders |
| --- | --- |
| `ApiAccessAction` | The action link, the placeholder while checking, or nothing when the check failed. |
| `ApiAccessStatus` | The live region, and the failure message when the check failed (§3.2). |
| `TryItRecovery` | The 403 sentence for the current access state (§5.2). |

Don't use `ProblemAlert` for the failure message. It focuses itself, uses `role="alert"` and the error
style, and renders problem text. A failed check isn't an error in what the developer did, and the
reference still works, so this message must not take focus or show problem detail.

CSS goes in `packages/ui/src/styles.css`, using existing tokens only:

| Class (suggested) | Rule |
| --- | --- |
| `.access-action` | `overflow-wrap: anywhere; text-align: center; min-width: 0; scroll-margin-top: calc(var(--portal-header-height) + 16px)`. From 768 px: `max-width: 320px`. |
| `.access-action-placeholder` | `.skeleton`, `aria-hidden="true"`. Height 44 px below 768 px; 40 × 140 px from 768 px. Doesn't pulse. |
| `.page-header` changes | First `div`: `flex: 1; min-width: 0`. `h1`: `overflow-wrap: anywhere`. An empty `.page-header > div` is `display: none`, so a failed check leaves no gap. |
| `.badge` change | `max-width: 100%; overflow-wrap: anywhere`, so a long API title wraps inside the label. |
| `.app-cards`, `.app-table` | Cards show below 768 px and the table from 768 px, with `display: none` on the other. |
| `.app-apis` | The App page's API rows (§3.5). |

## 3. Screens

### 3.1 Site header — all pages (AC 1, 2, 10)

**Purpose:** the same places, in the same order, for every role. **Primary action:** none.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ Developer Portal   APIs                                  Sign in  [ Sign up ]│ visitor
│ Developer Portal   APIs  My apps                              ana@ex.com ▸   │ developer
│ Developer Portal   APIs  My apps  Admin                       ana@ex.com ▸   │ admin
│ Developer Portal   APIs                               [ Run the quickstart ] │ static demo
└──────────────────────────────────────────────────────────────────────────────┘
375px, closed                           375px, menu open (signed-in developer)
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│ Developer Portal              [☰] │   │ Menu                              │
└───────────────────────────────────┘   │ [         Close menu            ] │ ← focus starts
                                        │ APIs                              │
                                        │ My apps                           │
                                        │ ana@ex.com ▸                      │ ← last item
                                        └───────────────────────────────────┘
```

**Move Close menu above the links.** It's currently below them, so focus would start at the bottom
and then jump to the top. Above the links, the focus order matches what's on screen. The menu stays
the existing centred `Dialog`: the north star's right-side sheet isn't part of this slice.

| Route | `aria-current="page"` |
| --- | --- |
| `/`, `/apis/{slug}` | APIs |
| `/dashboard`, `/dashboard/apps/new`, `/dashboard/apps/{id}` | My apps |
| `/admin/apis` | Admin |
| `/sign-in`, `/sign-up`, not-found page | None |

| State | UI |
| --- | --- |
| Visitor, developer, admin | The links above. Links for other roles are left out, not disabled. |
| Static demo | APIs and **Run the quickstart** only. |
| Session ended after the page loaded | Signed-in links stay until the next page load; **My apps** goes through sign-in (accepted in the technical design). |
| Loading, empty, error, no permission | Not applicable: the header renders from the server's session state. |

### 3.2 API reference — `/apis/{slug}` (AC 4, 5, 6, 7, 10)

**Purpose:** read the API, get the right access and make a call. **Primary action:** the access
action in the page header.

```
1280px — one app has access
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API                                                            │
│ Orders API                                     [ Open in Fulfillment worker ]│
│ [v2.3.0]                                                                     │
│ Base URL  http://localhost:8000/orders                               [Copy]  │
│ ⓘ To try a request, go to Authentication … select Send. If you get a 403,    │
│   select Open in Fulfillment worker and use one of its active keys.          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Scalar reference                                                             │
└──────────────────────────────────────────────────────────────────────────────┘

1280px — check failed
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API                                                            │
│ Orders API                                                                   │
│ [v2.3.0]                                                                     │
│ Base URL  http://localhost:8000/orders                               [Copy]  │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚠ Access status couldn't be confirmed                                    │ │
│ │ You can still read the reference and send requests with a key you have.  │ │
│ │ [ Try again ]                                                            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ⓘ To try a request, go to Authentication … select Send. If you get a 403,    │
│   use a key from an app that includes this API.                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Scalar reference                                                             │
└──────────────────────────────────────────────────────────────────────────────┘

375px — one app, 80-character name            375px — check failed
┌───────────────────────────────────┐         ┌───────────────────────────────────┐
│ APIs / Orders API                 │         │ APIs / Orders API                 │
│ Orders API                        │         │ Orders API                        │
│ [ Open in A-very-long-unbroken-a ]│         │ [v2.3.0]                          │
│ [ pp-name-that-wraps-inside-the- ]│         │ Base URL                          │
│ [ button-and-never-scrolls       ]│         │ http://localhost:8000/orders [⧉]  │
│ [v2.3.0]                          │         │ ┌───────────────────────────────┐ │
│ Base URL                          │         │ │ ⚠ Access status couldn't be   │ │
│ http://localhost:8000/orders [⧉]  │         │ │   confirmed                   │ │
│ ⓘ To try a request, go to …       │         │ │ You can still read the …      │ │
├───────────────────────────────────┤         │ │ [         Try again         ] │ │
│ Scalar (its own mobile layout)    │         │ └───────────────────────────────┘ │
└───────────────────────────────────┘         │ ⓘ To try a request, go to …       │
                                              └───────────────────────────────────┘
```

| Person / access state | Action area | Message area | Goes to |
| --- | --- | --- | --- |
| Signed out, or the check returned 401 | **Get an API key** | None | Sign-up, then Create app with this API |
| Signed in, check running | Placeholder (no link) | None | — |
| Signed in, no app has access | **Get an API key** | None | Create app with this API |
| Signed in, one app has access, including one with only revoked keys | **Open in {app name}** | None | `/dashboard/apps/{id}` |
| Signed in, several apps have access | **View your apps** | None | `/dashboard?api={slug}` |
| Signed in, check failed (500, 503, 403, 429, network, 10 seconds, unreadable 200) | Nothing | Failure message with **Try again** | — |
| Signed in, retry running | Nothing | Failure message; button reads **Checking…** | — |
| Static demo | Nothing, and the check never runs | Read-only notice (unchanged) | — |

| Screen state | UI |
| --- | --- |
| Loading | `loading.tsx` as in 001 §3.2 until the server page renders. The access check then has its own states, above. |
| Empty | Not applicable: a published API always has a document. |
| Error, reference document | Unchanged (001 §3.2). The access check doesn't affect it. |
| Error, access check | The failure message. It shows no status code, problem detail or toast, and doesn't redirect. A response after 10 seconds changes nothing. |
| Success | The action for the row, and the matching 403 sentence. |
| No permission | Not applicable: the page is public. Unknown slugs get the API not found page. |

**Behaviour:**

- The placeholder keeps the page from jumping at 375 px when a full-width action arrives. If the check
  fails, the placeholder goes and the message appears below the base URL.
- The first check never moves focus. A successful retry moves focus to the action. This includes a
  retry that returns 401, which focuses **Get an API key**.
- The failure message has no retry countdown, even on a 429: it can't mention a status or problem
  detail, and a retry that fails again just leaves the message in place.

### 3.3 My apps — `/dashboard` (AC 1, 4, 8)

**Purpose:** find an app and open it. **Primary action:** **Create app**.

```
1280px — from View your apps on Orders API
┌──────────────────────────────────────────────────────────────────────────────┐
│ My apps (h1)                                                  [ Create app ] │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Name                         APIs              Active keys   Created     │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Fulfillment worker           Orders API,       2             2 Nov 2026  │ │ tinted row
│ │ [● Has access to Orders API] Returns API                                 │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Weather bot                  Sample HTTP API   None          1 Nov 2026  │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Reporting                    Orders API        1             30 Oct 2026 │ │ tinted row
│ │ [● Has access to Orders API]                                             │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

375px and 640px
┌───────────────────────────────────┐
│ My apps (h1)                      │
│ [          Create app           ] │
│ ┌───────────────────────────────┐ │
│ │ Fulfillment worker (h2)       │ │ tinted card
│ │ [● Has access to Orders API]  │ │
│ │ APIs                          │ │
│ │ Orders API, Returns API       │ │
│ │ Active keys                   │ │
│ │ 2                             │ │
│ │ Created                       │ │
│ │ 2 Nov 2026                    │ │
│ │ [          Open app         ] │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ Weather bot (h2)              │ │
│ │ …                             │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

- **Table (from 768 px):** columns stay Name, APIs, Active keys and Created. The name stays the link.
  The label sits under the name, in the same cell.
- **Cards (below 768 px):** a `<ul>` of `.card` items, one column. The order is identity, label,
  metadata, action. The name is an `h2` and isn't a link, because **Open app** is the card's one link.
  APIs, active keys and created date are a `<dl>` that reuses the table's column names.
- **Label:** `Badge` with the `active` class: "● Has access to {API title}". The title comes from the
  app's matching `subscriptions[].title`. The word carries the meaning, the tint is extra, and the
  label is separate from the APIs column.
- **Row tint:** rows and cards with the label also use the existing `.highlight` (`--accent`).
- The apps keep their usual order and every app stays listed. There's no filter, clear control or
  summary line.

| State | UI |
| --- | --- |
| Loading | h1 "My apps", title "My apps · Developer Portal", skeleton rows and "Loading your apps…" for screen readers. |
| Empty | Unchanged: `EmptyState` **Create your first app**, and the header button is hidden. A `?api=` value has no effect. |
| Error | Unchanged: `ProblemAlert` "We couldn't load your apps." with **Try again**. `?api=` stays in the URL. |
| Success, no `?api=` | Table or cards with no labels. |
| Success, `?api=` matches | The matching apps have the label and tint, and the others don't. |
| Success, `?api=` matches nothing, is empty or is repeated | The normal list, with no label and no error. |
| Active keys is 0 | "None", as today. Revoked keys don't count. |
| No permission | Unchanged: signed out goes to sign-in and keeps `?api`. |

### 3.4 Create app — `/dashboard/apps/new` (AC 1, 3)

**Purpose and primary action:** unchanged (**Create app and get key**).

```
1280px (form column, 640px)                375px
│ My apps / New app                   │    │ My apps / New app             │  changed
│ Create an app                       │    │ Create an app                 │
│ App name                            │    │ App name                      │
│ [|                                ] │    │ [|                          ] │  focus when ?api= is set
│ …                                   │    │ …                             │
│ ☑ Orders API  v2.3.0                │    │ ☑ Orders API  v2.3.0          │  checked from ?api=
```

| State | UI |
| --- | --- |
| Loading | Unchanged. **App name** already has focus, and focus stays there when the APIs load. |
| `?api=` set | The API's checkbox is checked and focus is in **App name**. |
| No `?api=` | Unchanged: focus isn't moved. |
| `?api=` names an unavailable API | Unchanged message, and focus is still in **App name**. |
| Empty (no published APIs) | Unchanged `EmptyState`. The form is gone, so move focus to the `h1` if **App name** had it. |
| Validation, 404, 409, 502, 503, API list failed | Unchanged (001 §3.6, 004 §2.2). |
| Success | Unchanged: the App page and the key dialog. |
| No permission | Unchanged: signed out goes to sign-in and keeps `?api`. |

### 3.5 App page — `/dashboard/apps/{id}` (AC 1, 9)

**Purpose:** unchanged. **Primary action:** unchanged. Only the breadcrumb and the APIs section change.

```
1280px
│ My apps / Fulfillment worker                                                 │  changed
│ Fulfillment worker (h1)                                                      │
│ ┌ Try your key ─ unchanged ──────────────────────────────────────────────┐   │
│ APIs (h2)                                                                    │
│ Orders API                                               [ Try this API ]    │  changed
│ ─────────────────────────────────────────────────────────────────────────    │
│ Returns API                                              [ Try this API ]    │
│ ─────────────────────────────────────────────────────────────────────────    │
│ Sample HTTP API                                          [ Try this API ]    │

375px
│ APIs (h2)                         │
│ Orders API                        │
│ [         Try this API          ] │
│ Returns API                       │
│ [         Try this API          ] │
```

The API title becomes plain text and "— View reference" goes away, so each row has one link. Each link
opens `/apis/{slug}`. Rows stay a `<ul>` with no bullets, and the links use the secondary button style.
From 768 px the title and link share a row. Below 768 px the link is full width and 44 px high.

| State | UI |
| --- | --- |
| Active key or none | **Try this API** shows on every row either way. The **Try your key** card still shows only with an active key. |
| One, two or three or more APIs | **Try this API** on every row. The **Try your key** card still shows buttons for up to two APIs and **Go to APIs** for three or more. |
| Loading, empty, error, not found, no permission | Unchanged (001 §3.8), including **Back to your apps**. |
| Success | As above. Key list, reveal dialog and revoke dialog are unchanged. |

### 3.6 Sign up and sign in — `/sign-up`, `/sign-in` (AC 3)

There's no visible change. Only the destination of **Sign in**, **Sign in instead** and **Create an
account** changes, as in Flow B. Headings, validation and error states stay as in 001 §3.3 and §3.4.

## 4. Static demo (AC 10)

`/` and `/apis/sample` keep their demo rendering. They don't mount the access components, so the page
has no placeholder, action or failure message, and the browser never requests `/api/v1/apps`.

## 5. Copy

Use these strings exactly. `{…}` is filled in at runtime.

### 5.1 Labels and messages

| Where | Text |
| --- | --- |
| Header link | My apps |
| My apps heading, table caption | My apps |
| My apps page title | My apps · Developer Portal |
| Breadcrumb, Create app | My apps / New app |
| Breadcrumb, App page | My apps / {app name} |
| Access action | Get an API key · Open in {app name} · View your apps |
| Failure message, first line | ⚠ Access status couldn't be confirmed |
| Failure message, second line | You can still read the reference and send requests with a key you have. |
| Failure message, button | Try again · Checking… (while retrying) |
| My apps label | ● Has access to {API title} |
| My apps card action | Open app |
| App page row action | Try this API |

**These stay as they are** (the spec keeps them, or they aren't the page's label): "We couldn't load your
apps.", "Loading your apps…", **Back to your apps**, **View your apps**, "Your app" as the App page's
fallback title, and the Create app heading "Create an app".

### 5.2 Try-it instruction

The start of the instruction doesn't change. Only its last sentence, the 403 step, depends on the state:

| Access state | Last sentence |
| --- | --- |
| Signed out, 401 or no app has access | If you get a 403, select Get an API key to create an app that includes this API. |
| One app | If you get a 403, select Open in {app name} and use one of its active keys. |
| Several apps | If you get a 403, select View your apps and use a key from an app with access. |
| Check running or failed | If you get a 403, use a key from an app that includes this API. |

### 5.3 Text only screen readers get

| When | Text in the live region |
| --- | --- |
| First check finishes with an action | Access checked. Your next step is at the top of the page. |
| A retry fails | We still couldn't confirm your access. |

The Open app and Try this API links add hidden text, so their names make sense out of context:
`Open app<span class="sr-only">: {app name}</span>` and `Try this API<span class="sr-only">: {API
title}</span>`. The visible words still start the accessible name (WCAG 2.5.3).

## 6. Accessibility (WCAG 2.2 AA)

**Keyboard paths**

- **API page:** Skip to content → header links → breadcrumb → access action → **Copy** (base URL) →
  **Try again** (if shown) → Scalar.
- **Mobile menu:** **Open menu** → focus on **Close menu** → each link in order → the account menu →
  back to **Close menu**. Escape or **Close menu** returns focus to **Open menu**. Selecting a link
  loads the page with the menu closed.
- **My apps:** Skip to content → header links → **Create app** → one link per app (the name in the
  table, **Open app** on a card).
- **App page:** breadcrumb → **Try your key** links if shown → one **Try this API** per row → key actions.

**Focus**

| Moment | Focus |
| --- | --- |
| API page, first check finishes | Doesn't move. |
| Retry succeeds, or returns 401 | Moves to the access action. `scroll-margin-top` keeps it clear of the sticky header (WCAG 2.4.11). |
| Retry running or failed | Stays on the button, which uses `aria-disabled` and `aria-busy` and never `disabled`. |
| Create app with `?api=` | **App name**, once. |
| Mobile menu opens | **Close menu**. |

**Live region and semantics**

- `ApiAccessStatus` keeps one `role="status"` element mounted from the first render, because a live
  region added at the same time as its text often isn't announced. Don't use `aria-atomic`.
- While there's no visible message the element has the `sr-only` class, so it takes no space in the
  page's grid. When the check fails it drops that class, and the failure message renders inside it. That
  announces the message, the **Checking…** label and the §5.3 text. Don't use `display: none` here.
- The placeholder is `aria-hidden`. Announcing a check on every page load would add noise.
- The 403 sentence isn't in a live region, because it isn't urgent and the action's arrival is covered.
- The My apps label is plain text inside the name cell or card, so it's read with the app. The ● is
  `aria-hidden`.
- Table: keep the real table with `scope="col"` and a hidden caption. Cards: `ul` > `li`, an `h2` and a
  `dl`. The hidden layout uses `display: none`, so screen readers get only one.
- Exactly one nav link has `aria-current="page"`, and its underline isn't colour alone.

**Contrast and targets:** no new colour pairs. Warning text is 6.8:1 on its subtle background, success
4.8:1, primary link 6.2:1 on `--accent`, and all come from `tokens.md`. Controls stay at least 40 px high,
and 44 px below 768 px. Status never depends on colour. Customer themes work by overriding the same
variables.

**Motion:** placeholders don't pulse, and nothing here animates.

## 7. Responsive behaviour

| Element | 375 px and 640 px (1280 px at 200% zoom) | 1280 px |
| --- | --- | --- |
| Navigation | Menu button and dialog | Links in the header |
| Access action | Full width below the title, 44 px high, wraps | Right of the title, at most 320 px wide, wraps |
| Failure message | Full width; **Try again** is full width | Full width in the container; **Try again** fits its label |
| Try-it instruction | Full width, wraps | Full width, wraps |
| My apps | Cards in one column; **Create app** and **Open app** are full width | Four-column table; **Create app** right of the heading |
| App page API rows | Title, then a full-width **Try this API** | Title and link on one row |
| Create app | One column | 640 px form column |

- The table/card switch is at 768 px, so the table never has to fit a width below that. Put the button
  in `.actions` on the API page and My apps: that class already makes it full width below 768 px.
- The page's scroll width must not exceed the viewport at 375 px or 640 px, on My apps or the API
  page, with 80-character unbroken names and 10 APIs on one app.
- Scalar owns its own layout. Don't target its private classes: if it overflows, file a bug (north star §9).

## 8. Changes to earlier designs

| Earlier design | Change |
| --- | --- |
| 001 §2 header, §3.5, §3.8, §5 | "Dashboard" and "Your apps" as a label become **My apps**. |
| 001 §3.5 mobile card | Replaced by the card in §3.3, because AC 8 requires **Open app** and all four values. |
| 001 §3.8 APIs list | "View reference →" becomes **Try this API**. |
| 001 §2 session rule (401 redirects with a toast) | Doesn't apply to the access check on the API page. Every other call keeps it. |
| 004 §2.1 instruction and primary action | The last sentence and the action now depend on access (§3.2, §5.2). |
| North star §6.4 and §6.5 wireframes | Breadcrumbs corrected to **My apps** in this change. |

## 9. Notes for frontend, QA and the user-tester

- **Frontend:** task keys are in the spec. The Close menu move (§3.1), the `.actions` wrappers and
  moving focus to the `h1` on an empty Create app (§3.4) are small additions to JSO-387, JSO-389 and JSO-386.
- **QA:** hidden link text doesn't break `getByRole('link', { name: 'Try this API' })`, because the name
  is matched as a substring unless `exact` is set. Use a regex or `within(row)` if you need `exact`.
- **QA, AC 4:** check the "Get an API key appears nowhere" part before sending a request. See the known
  gap below.
- **Known gap, JSO-397:** the server's 403 problem detail (`apps/server/src/proxy.ts`) still says
  "Select Get an API key on this page". On a page showing **Open in {app name}** or **View your apps**,
  Scalar's response panel can therefore name an action that isn't on the page. The spec rules out server
  changes, so this is a follow-up.
- **Already tracked:** the **Try your key** card's "apikey field" copy (JSO-293, JSO-294) and the wording
  of the start of the try-it instruction (JSO-295). AC 9 keeps the card as it is, and this design
  changes only the instruction's last sentence.
- **User-tester:** run Flows A, C, D and E at 1280 px and 375 px. Judge whether the action's arrival
  feels jumpy at 375 px, and whether a wrapped 80-character button is still clearly one button.
