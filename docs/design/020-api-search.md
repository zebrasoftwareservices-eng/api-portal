# 020 — Search across APIs and endpoints: UX design

Spec: [020-api-search](../specs/020-api-search.md). Contract: `GET /v1/search` (spec Technical
design). Tokens: [tokens.md](tokens.md). No new tokens.

## 1. Decisions

The spec left one open question for design: header box, command palette, or both, and whether
results appear as you type.

- **A search box in the site header plus a `/search?q=` results page.** No ⌘K palette and no
  search-as-you-type in this slice.
- **Why:** a header box is where developers look first, and it is a plain `<form method="get">`,
  so it works before JavaScript loads and in demo mode. The results URL can be shared and
  bookmarked, and Back works. Search-as-you-type would send one request per keystroke against a
  60/min anonymous limit and would need a live-region listbox (combobox pattern). A palette is a
  second entry point to the same results. Both can be added later without changing the results
  page. They're recorded as follow-ups, not built.
- **Results are one ranked list.** The server orders API and operation results together, so the
  page keeps that order. It doesn't group them, so the best match is always first.
- **No match highlighting.** Results don't bold the matched words. The server doesn't return match
  positions, and re-tokenising in the browser would duplicate the matcher.

## 2. User flow

**Find an operation by path (AC 1)**
1. On any page, the developer types `orders/{id}` into **Search APIs and endpoints** in the header
   and presses Enter (or selects the search icon button at narrow widths, then types).
2. The browser goes to `/search?q=orders%2F%7Bid%7D`. The page shows a summary line, "3 results
   for "orders/{id}"", and the ranked list.
3. The first result reads **GET** `/orders/{id}` · Get an order · Orders API.
4. The developer selects it and lands on `/apis/orders#<operationAnchor>`, with the operation
   heading in view under the sticky header.

**Find an API by title, or an operation by what it does (AC 2)**
1. They search `orders api`. The result is the API, labelled **API**, Orders API · Version 2.0.0.
   Selecting it opens `/apis/orders`.
2. They change the box on the results page to `cancel order` and press Enter. The list shows the
   operation **POST** `/orders/{id}/cancel` · Cancel an order · Orders API.

**Nothing matched (AC 6)**
1. They search `invoices`. The page shows **Nothing matched "invoices"** and a **Browse all APIs**
   button to the catalog `/`.

APIs the visitor can't see in the catalog never appear (AC 3, 4, 5). The UI never mentions hidden
or unpublished APIs, and there is no "some results are hidden" message.

## 3. Screens

### 3.1 Site header search — all pages

**Purpose:** search from anywhere. **Primary action:** submit the term.

```
1280px (from 1024px)
┌────────────────────────────────────────────────────────────────────────────────┐
│ Developer Portal   APIs  My apps   [⌕ Search APIs and endpoints     ]  ana@ex ▸│
└────────────────────────────────────────────────────────────────────────────────┘
375px – 1023px
┌───────────────────────────────────┐
│ Developer Portal          [⌕] [☰] │
└───────────────────────────────────┘
```

- **From 1024px:** an inline `<form role="search" action="/search" method="get">` holding one
  `Input` (`type="search"`, `name="q"`, `maxLength={100}`, `autocomplete="off"`,
  `enterKeyHint="search"`). It is 280px wide and sits between the nav links and the account area.
  A `Search` (lucide) icon sits inside the input on the left and is decorative. There is no visible
  submit button. Enter submits, and a visually hidden **Search** submit button keeps the form
  operable for assistive tech.
- **Below 1024px:** an icon button (ghost `Button`, 44×44, `Search` icon, `aria-label="Search"`)
  left of the menu button. It is a link to `/search`, and that page focuses its input on load.
- **On `/search`** the header box is hidden at every width. The page has its own larger box, and
  two boxes would confuse.
- **Empty or blank submit** from the header: the client prevents the submit and keeps focus in the
  box, with no message, because nothing was asked. Without JavaScript, the browser goes to
  `/search?q=`, which shows the start state (3.2), not an error.
- **Static demo:** the same box. Results come from the in-browser matcher (§6).
- `aria-current`: no header link is current on `/search`.

### 3.2 Search results — `/search?q=<term>`

**Purpose:** list what matched, each result one click from its reference.
**Primary action:** open a result.

```
1280px
┌────────────────────────────────────────────────────────────────────────────────┐
│ header (no search box on this page)                                            │
├────────────────────────────────────────────────────────────────────────────────┤
│  Search                                                                        │
│  ┌───────────────────────────────────────────────────────┐ [  Search  ]        │
│  │⌕ orders/{id}                                          │                     │
│  └───────────────────────────────────────────────────────┘                     │
│  3 results for "orders/{id}"                                                    │
│ ┌────────────────────────────────────────────────────────────────────────────┐ │
│ │ [GET]    /orders/{id}                                                      │ │
│ │          Get an order · Orders API                                         │ │
│ ├────────────────────────────────────────────────────────────────────────────┤ │
│ │ [DELETE] /orders/{id}                                                      │ │
│ │          Delete an order · Orders API                                      │ │
│ ├────────────────────────────────────────────────────────────────────────────┤ │
│ │ [POST]   /orders/{id}/cancel                                               │ │
│ │          Cancel an order · Orders API                                      │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘

375px
┌───────────────────────────────────┐
│ Developer Portal          [⌕] [☰] │
├───────────────────────────────────┤
│ Search                            │
│ ┌───────────────────────────────┐ │
│ │⌕ orders api                   │ │
│ └───────────────────────────────┘ │
│ [            Search             ] │
│ 2 results for "orders api"        │
│ ┌───────────────────────────────┐ │
│ │ [API]                         │ │
│ │ Orders API                    │ │
│ │ Version 2.0.0                 │ │
│ ├───────────────────────────────┤ │
│ │ [GET]                         │ │
│ │ /orders/{orderId}/line-items/ │ │
│ │ {lineId}                      │ │
│ │ Get a line item · Orders API  │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

**Layout**
- `PageHeader` with h1 **Search**, no description.
- Search form: `<form role="search" method="get" action="/search">` holding a `Label`
  ("Search APIs and endpoints", visually hidden), an `Input` (`type="search"`, `name="q"`,
  `maxLength={100}`, 16px text, full width up to 640px, `--portal-form-max-width`) and a primary
  `Button` **Search**. From 768px they sit on one row. Below that the button goes full width
  under the input.
- The input is prefilled with `q` as typed (trimmed). On load it is focused only when `q` is
  absent (the start state, or arriving from the header icon button). With a term, focus starts at
  the top of the page as usual, so screen readers read the result summary.
- Submitting navigates to `/search?q=<term>`, a history push, so Back returns to the previous
  search.
- Summary line (`--portal-text-sm`, `--muted-foreground`) in a `role="status"` region.
- Results: an `<ol>` in one `Card` with `--border` dividers between rows. Each row is one link
  (the whole row is the target, hover `--accent`). Order is exactly the server's.

**Operation result** (`kind: 'operation'`)
- Line 1: `MethodBadge` (§5) + `path` in `--portal-font-mono`, `--foreground`, weight 600.
  The path wraps with `overflow-wrap: anywhere`, never truncated.
- Line 2 (`--portal-text-sm`, `--muted-foreground`): `summary` · `api.title`. If `summary` is
  absent, use `operationId`. If both are absent, show only `api.title`. Line 2 is indented to
  start under the path from 768px. Below 768px the badge sits on its own line and everything is
  flush left.
- Link: `/apis/{api.slug}#{operationAnchor({ method, path, tags })}`.

**API result** (`kind: 'api'`)
- Line 1: `Badge` (outline) with the word **API** + `api.title` (`--portal-text-base`, weight 600).
- Line 2 (`--portal-text-sm`, `--muted-foreground`): "Version {api.version}".
- Link: `/apis/{api.slug}`.

**Truncated** (`truncated: true`): the summary line reads "Showing the top {n} results for
"{term}". Add a word or part of a path to narrow them." No pagination in this slice. The
frontend requests the default limit (20).

## 4. States — results page

| State | UI |
| --- | --- |
| **Start** (no `q`, or `q` blank) | h1, focused empty input, and the hint below it (`--muted-foreground`): "Search API names, paths like /orders/{id}, or what an operation does." No request is sent. |
| **Loading** | The form stays usable. The summary line reads "Searching…", and the list shows three `Skeleton` rows (badge 48×20, line 60% width, line 40% width) in the result card. `aria-busy="true"` on the list. Skeletons don't pulse under reduced motion. If the page renders on the server, users see results directly and no loading state. |
| **Success** | Summary "1 result for "{term}"" / "{n} results for "{term}"", then the list. |
| **Success, truncated** | As above with the truncated summary copy (§3.2). |
| **Empty** (200, `items: []`) | Summary line "No results for "{term}"". Below it, `EmptyState` (icon `SearchX`): title **Nothing matched "{term}"**, body "Check the spelling, use fewer words, or search for part of a path such as /orders.", button **Browse all APIs** (secondary) → `/`. Not an error style (AC 6). |
| **Invalid term** (400 `/problems/validation`) | No alert. The input gets `aria-invalid="true"` and the `--destructive` field message below it shows the problem's `detail` verbatim ("Enter a search term." / "Search terms can be at most 100 characters."), linked by `aria-describedby`. Focus moves to the input. The list is hidden. The client checks the same rules first (blank → "Enter a search term."; `maxLength` stops typing past 100), so users rarely see this from the server. |
| **Rate limited** (429) | `ProblemAlert` with `title` "Too many searches", message "You've searched a lot in the last minute. Try again in {n}s.", `retryAfterSeconds` from `Retry-After`, `onRetry` re-runs the same term. The form stays usable. The previous results are cleared. |
| **Network or server error** (fetch fails, or any 5xx) | `ProblemAlert`: title **Search didn't load**, message "Check your connection and try again.", `onRetry` **Try again** re-runs the search. Never shows `instance` or stack data. |
| **No permission** | Not applicable. Search is public (`security: []`), and visibility only narrows the results. Hidden or unpublished APIs simply aren't listed (AC 3, 4). |
| **Signed in vs visitor** | Same screen. A signed-in member may see more results, with no label explaining why. |
| **Stale link** (an API removed or unpublished after the results loaded) | The link opens the reference's existing not-found page. Search adds no special handling (AC 5 is satisfied on the next search). |

## 5. Components

Reuse (shadcn/ui and `packages/ui`): `Input`, `Label`, `Button`, `Badge`, `Card`, `Skeleton`,
`PageHeader`, `EmptyState`, `ProblemAlert`. Icons from lucide: `Search`, `SearchX`.

**New: `MethodBadge`** (`packages/ui`)
- Props: `method: 'get'|'put'|'post'|'delete'|'options'|'head'|'patch'|'trace'` (any case).
- Renders the method in upper case in an outline `Badge`: `--portal-font-mono`,
  `--portal-text-xs`, `--foreground` text, `--input` border, `--muted` fill, min-width 56px,
  centred text, so paths line up in a list.
- One variant. No per-method colours: the word carries the meaning, and the token set stays
  themeable with no new tokens. 012's changelog rows can use the same component.
- Accessible name is the method word. No `aria-label` and no extra text.

**New: `SearchResultRow`** (`apps/portal`)
- Props: `result: SearchResult` (generated client type), `href: string`.
- Renders the layout in §3.2 for `kind` `api` or `operation`, inside an `<li>` holding one `<a>`.
  Min height 56px. Padding 12px 16px. `scroll-margin-top: calc(var(--portal-header-height) + 16px)`.

**New: `HeaderSearch`** (`apps/portal`)
- Props: `variant: 'inline' | 'icon'`. Behaviour in §3.1. Hidden on `/search`.

**Shared helper:** `operationAnchor({ method, path, tags })` (technical design). The frontend
uses it for both Scalar's operation slug and the result link.

## 6. Demo mode

Same header box, results page, copy and states. Results come from `searchCatalog` in
`@portal/sdk` over the sample API in the browser, with no request. Loading, 400 (except the client
blank check) and 429 can't happen, so the page shows success or empty only.

## 7. Copy

| Where | Text |
| --- | --- |
| Header input placeholder | Search APIs and endpoints |
| Header input label (visually hidden) and page input label (visually hidden) | Search APIs and endpoints |
| Header icon button `aria-label` | Search |
| Page `<title>` | `Search` with no term; `Search: {term}` with a term (followed by the portal's usual title suffix) |
| h1 | Search |
| Submit button | Search |
| Start hint | Search API names, paths like /orders/{id}, or what an operation does. |
| Loading summary | Searching… |
| Summary, one | 1 result for "{term}" |
| Summary, many | {n} results for "{term}" |
| Summary, truncated | Showing the top {n} results for "{term}". Add a word or part of a path to narrow them. |
| Summary, none | No results for "{term}" |
| Empty title | Nothing matched "{term}" |
| Empty body | Check the spelling, use fewer words, or search for part of a path such as /orders. |
| Empty button | Browse all APIs |
| API result badge | API |
| API result line 2 | Version {version} |
| Operation line 2 | {summary or operationId} · {API title} |
| Blank term | Enter a search term. (server `detail`; the client uses the same text) |
| Over-long term | Search terms can be at most 100 characters. (server `detail`) |
| 429 title / message | Too many searches / You've searched a lot in the last minute. Try again in {n}s. |
| Error title / message / button | Search didn't load / Check your connection and try again. / Try again |

`{term}` is the trimmed term as typed, shown as text (React escaping), never as HTML. Curly quotes
in the copy are typographic (“ ”).

## 8. Accessibility (WCAG 2.2 AA)

- **Landmarks:** both forms are `role="search"`. Results are an ordered list in `<main id="main">`.
- **Labels:** every input has a `Label` (visually hidden). The placeholder is a hint, not the label.
  The icon button has `aria-label="Search"`.
- **Link names:** each result's accessible name is its visible text in reading order, for example
  "GET /orders/{id} Get an order · Orders API" or "API Orders API Version 2.0.0". No `title`
  attributes, and no duplicate "View" links.
- **Announcements:** the summary line is `role="status"` (polite), so a new search announces
  "{n} results for …" or "No results for …". Errors use `ProblemAlert` (`role="alert"`, focused).
  A 400 focuses the invalid input, whose message is in `aria-describedby`.
- **Keyboard path (1280px):** Skip to content → header links → header search box (type, Enter)
  → on `/search`: Skip to content → header links → page input → **Search** → first result →
  … → last result → footer. In the empty state: page input → **Search** → **Browse all APIs**.
  Below 1024px the header icon button comes after the brand and before the menu button.
- **Focus:** `:focus-visible` ring from tokens on rows, input, buttons. Result rows show the ring
  on the whole row. Following an operation link lands with the heading clear of the sticky header
  (`scroll-margin-top`, WCAG 2.4.11). That's the anchor-mismatch risk QA checks.
- **Contrast:** path and title `--foreground` 17.9:1. Line 2 `--muted-foreground` 7.6:1 on
  `--background` and 6.9:1 on `--accent` hover (above 4.5:1). `MethodBadge` text 16.3:1 on
  `--muted`, border `--input` 4.8:1. Field error `--destructive` 6.5:1.
- **Targets:** rows ≥56px high, icon button 44×44, buttons ≥40px (44px below 768px).
- **Not colour alone:** method and kind are words, and errors have an icon and text.
- **Zoom/reflow:** at 320 CSS px (1280 at 400%) the 375px layout applies with no horizontal
  scroll. Long paths wrap.
- **Reduced motion:** skeletons don't pulse, and hover uses `--portal-duration` (0ms).

## 9. Responsive behaviour

| Element | 375px | 1280px |
| --- | --- | --- |
| Header search | Icon button → `/search` (also 768–1023px) | 280px inline box between nav and account |
| Results form | Input full width, **Search** button full width below | Input (max 640px) and button on one row (from 768px) |
| Operation row | Badge on line 1, path on line 2 (wraps), summary · API on line 3 | Badge and path on line 1, summary · API indented below the path |
| API row | Badge, title, version stacked | Badge and title on line 1, version below |
| Empty state | Full width, button full width | Centred in the container, button fits its label |
| Alerts | Full width, **Try again** full width | Full width in the container, button fits its label |

## 10. Follow-ups (not in this slice)

- ⌘K / `/` command palette that reuses `SearchResultRow`.
- Suggestions as you type, once a rate-limit budget for it is agreed.
- "Show more" past 20 results (`limit` up to 50).
