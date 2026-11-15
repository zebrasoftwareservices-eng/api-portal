# 021 — Agent-ready docs: UX design

Spec: [021-agent-ready-docs](../specs/021-agent-ready-docs.md).
Contract: `apps/server/openapi.yaml` (`getLlmsTxt`, `getApiMarkdown`, `getApiVersionMarkdown`,
`downloadApiSpec`, `downloadApiVersionSpec`; `ApiDetail.markdownUrl` / `downloadUrl` and the same
two fields on `ApiVersionSummary`). Decisions: ADR 0013.

This spec changes **two screens** and adds **three plain-text surfaces**. It adds no new pages:

| Surface | Route | New / changed |
| --- | --- | --- |
| API reference, latest | `/apis/[slug]` | Changed: **View as Markdown** link and **Download spec** button in the version row (§3.1) |
| API reference, one version | `/apis/[slug]/versions/[version]` | Changed: the same two controls, for that version (§3.2) |
| Code samples in the reference | inside Scalar | Changed: six clients, curl first (§3.3) |
| `/llms.txt` | portal route | New, `text/plain` (§4.1) |
| Markdown reference | `/api/v1/apis/{slug}[/versions/{v}]/reference.md` | New, `text/markdown` (§4.2) |
| Spec download | `/api/v1/apis/{slug}[/versions/{v}]/spec` | New, file download (§4.3) |

Everything else stays as [001](001-kong-quickstart-slice.md), [012](012-docs-versions-search-agents.md)
and [019](019-unified-portal-developer-journey.md) specify. **No new tokens. No new components.**

## 0. Principles for this change
- **The text versions are a quiet extra, not a second product.** Humans come to read the reference
  and get a key. The access action from 019 stays the only primary button in the header. The new
  controls sit in the version row, next to **Changelog**, because they're more ways of reading the
  version you're looking at.
- **What you see is what you download.** On a version page, both controls point at that version.
  On the latest page, they point at the latest. The accessible name says which version.
- **Plain links, no JavaScript.** Both controls are ordinary `<a>` elements with the URLs from the
  contract. They work without client JS, open in a new tab with the normal browser gestures, and
  agents can follow them in the HTML.
- **Never a real key.** Code samples and Markdown show the header name and a placeholder only.

## 1. User flows

### Flow A — Developer downloads the spec for the version they use (AC 4, 7)
1. Developer opens `/apis/orders` (latest, 2.0.0) from the catalog or search.
2. Uses the version switcher to open `/apis/orders/versions/1.0.0` (012, unchanged).
3. Selects **Download spec** in the version row.
4. Browser saves `orders-1.0.0.yaml` (or `.json`) exactly as imported. Success: the file is in
   their downloads; the page doesn't change.

### Flow B — Developer hands the API to an AI coding agent (AC 3, 7)
1. Developer opens `/apis/orders`.
2. Selects **View as Markdown** (or copies its link with right-click → Copy link).
3. The browser shows the Markdown reference as plain text at
   `/api/v1/apis/orders/reference.md`. Success: they paste that URL or the text into their agent.

### Flow C — AI agent discovers the portal (AC 1, 2)
1. Agent requests `https://portal.example.com/llms.txt`.
2. Reads the list of APIs, follows a Markdown link for the API it needs.
3. Follows the `OpenAPI document:` line to fetch the raw spec if it needs to generate a client.
   Success: every link returns 200.

### Flow D — Developer copies a working call (AC 6)
1. Developer opens an operation in the reference.
2. The request example shows **curl** by default with method, gateway URL, path, the key header
   with a placeholder, and an example body when the operation takes one.
3. Picks JavaScript, Node.js, Python, Go or Java from Scalar's client picker; copies the sample with
   Scalar's copy button. Success: the copied code runs once they replace the placeholder with their key.

## 2. Components
All existing; none added.

| Use | Component |
| --- | --- |
| **View as Markdown** | Plain text link (`<a>`, `--primary`), same style as **Changelog** |
| **Download spec** | `Button variant="secondary" size="sm" asChild` wrapping `<a href={downloadUrl} download>`, with a 16px download icon (`lucide-react` `Download`, `aria-hidden`) before the label |
| Version row layout | Existing `.version-row` (`apps/portal/components/version-row.tsx`) |
| Code samples | Scalar's request example and client picker, themed by the existing token mapping |

`VersionRow` gains two props, `markdownUrl` and `downloadUrl`, taken from the `ApiVersionSummary`
of the version being viewed (latest page: `ApiDetail.markdownUrl` / `downloadUrl`). Both are
relative `/api/v1/...` paths; use them as-is, don't rebuild them.

## 3. Screens

### 3.1 API reference, latest — `/apis/[slug]` (AC 7)
**Purpose (unchanged):** read the API and make a call. **Primary action (unchanged):** the access
action from 019. **New:** two controls at the end of the version row.

```
1280px — several versions
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API                                                            │
│ Orders API                                              [ Get an API key ]   │
│ [ Version 2.0.0  Latest ▾ ]  Changelog  View as Markdown   [⤓ Download spec] │  changed row
│ Base URL  http://localhost:8000/orders                               [Copy]  │
│ ⓘ To try a request, go to Authentication …                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Scalar reference                                                             │
└──────────────────────────────────────────────────────────────────────────────┘

1280px — one version
│ [v2.0.0]  Changelog  View as Markdown                     [⤓ Download spec]  │
```

```
375px
┌───────────────────────────────────┐
│ APIs / Orders API                 │
│ Orders API                        │
│ [        Get an API key         ] │
│ [ Version 2.0.0  Latest       ▾ ] │
│ Changelog · View as Markdown      │  links share one line, wrap if needed
│ [       ⤓ Download spec         ] │  full width, secondary
│ Base URL                          │
│ http://localhost:8000/orders [⧉]  │
├───────────────────────────────────┤
│ Scalar (its own mobile layout)    │
└───────────────────────────────────┘
```

- Order in the row (and in tab order): switcher or badge → **Changelog** → **View as Markdown** →
  **Download spec**. At 1280px the button is pushed to the right end of the row
  (`margin-inline-start: auto`); the links stay next to **Changelog** with the existing gap.
- **View as Markdown** has no `target` and no `download`: it opens in the same tab, like any link,
  so the browser's back button returns to the reference. Ctrl/Cmd-click opens a new tab as usual.
- **Download spec** has the `download` attribute; the server's `Content-Disposition` sets the file
  name. The page doesn't navigate, show a toast or change state.
- The format (YAML or JSON) isn't shown: the contract has no format field, and the file name tells
  the developer once saved.

| State | UI |
| --- | --- |
| Loading | Existing `loading.tsx`. The version-row skeleton bar (012) grows from 200px to 360px wide at 1280px; at 375px add one more full-width 36px bar for the button. |
| Empty | Not applicable: a published API always has a latest version, so both URLs exist. |
| Error | Unchanged (001 §3.2). If the API page can't load, neither control renders. |
| Success | Both controls shown, pointing at the latest. |
| Download fails (rare: API unpublished between page load and click) | The browser receives the 404 problem+json. No portal UI; reloading the page shows the existing API not found page. Acceptable for a race this narrow. |
| No permission | Not applicable as a state: the page and both URLs use the same viewer check (ADR 0013). If a developer can see this page, both links work for them. |
| Static demo | Both controls **hidden** (no server to serve them). The row is exactly as 012 §4 shows. |

### 3.2 API reference, one version — `/apis/[slug]/versions/[version]` (AC 4, 7)
Same as §3.1, with the URLs from that version's `ApiVersionSummary`.

```
1280px — older version
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API / 1.0.0                                                    │
│ Orders API                                              [ Get an API key ]   │
│ [ Version 1.0.0 ▾ ]  Changelog  View as Markdown           [⤓ Download spec] │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ⓘ You're reading version 1.0.0. The latest is 2.0.0.                     │ │
│ │   [ View latest version ]                                                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ Base URL …                                                                   │
└──────────────────────────────────────────────────────────────────────────────┘

375px
│ [ Version 1.0.0               ▾ ] │
│ Changelog · View as Markdown      │
│ [       ⤓ Download spec         ] │
│ ┌───────────────────────────────┐ │
│ │ ⓘ You're reading version …    │ │
```

- A version page whose URL names the latest version (012 §3.2) uses that version's own URLs
  (`/versions/2.0.0/spec`). Both return the same document as the latest URLs, so either is right;
  the page shouldn't special-case it.
- The controls sit above the older-version notice, so the notice still reads as being about the
  reference body.

| State | UI |
| --- | --- |
| Loading | Same as §3.1 plus the notice bar (012). |
| Empty | Not applicable. |
| Error, document | Unchanged (012 §3.2). The controls still render: they come from `ApiDetail`, not from the document fetch, and the download may work when the rendered reference doesn't. |
| Unknown version | Existing version not found page (012). No controls. |
| No permission | As §3.1. |
| Static demo | Hidden, as §3.1. |

### 3.3 Code samples in the reference (AC 6)
**Purpose:** copy a working call. No portal layout change: Scalar renders the request example
beside (1280px) or below (375px) each operation, themed through the token mapping in `tokens.md`.

- **Clients, in picker order:** curl (Shell), JavaScript (fetch), Node.js (fetch),
  Python (requests), Go, Java (java.net.http). Labels are Scalar's own; don't rename them.
- **Default:** curl, on every page load. Scalar may remember the reader's last choice; that's fine.
- **Key placeholder:** the key header shows Scalar's placeholder (for example `YOUR_SECRET_TOKEN`),
  never empty and never a real key. If Scalar prints an empty value, frontend sets the scheme's
  example per the technical design so a placeholder appears. Pasting a key into Try it may fill the
  sample, as today; that's the reader's own key, in their own browser.
- **Body:** operations with a request body show Scalar's example body from the schema or example.

| State | UI |
| --- | --- |
| Loading | Scalar's own, inside the existing reference skeleton. |
| Empty | An operation with no body shows no body in the sample (Scalar default). A document with no operations shows the existing empty reference (001). |
| Error | Unchanged reference error (001 §3.2). |
| Success | Sample in curl; picker lists the six clients. |
| No permission | Not applicable. |
| Static demo | Same six clients on the demo reference: they're set in `referenceOptions`, which demo shares. |

## 4. Plain-text surfaces
No HTML, so no layout. The "design" is the words. The technical design fixes the structure; the
copy below fills its gaps. Frontend and backend use these strings exactly.

### 4.1 `/llms.txt` (AC 1, 2)
```
# Developer Portal

> Reference docs for every API on this portal, as Markdown, with a link to each API's OpenAPI document.

## APIs

- [Orders API](http://localhost:3000/api/v1/apis/orders/reference.md): Create and track orders. OpenAPI: http://localhost:3000/api/v1/apis/orders/spec
- [Payments API](http://localhost:3000/api/v1/apis/payments/reference.md) OpenAPI: http://localhost:3000/api/v1/apis/payments/spec
```
- Summary line (exact): `> Reference docs for every API on this portal, as Markdown, with a link to each API's OpenAPI document.`
- When an API has no description, the item has no `: <description>`; the format in the technical
  design already leaves a space before `OpenAPI:`.
- No APIs (exact, under `## APIs`): `No APIs are published yet.`
- Server unreachable (portal route, 503, exact): `The portal is starting or unavailable.`
- Demo builds: 404 (the portal's default not found).

### 4.2 Markdown reference (AC 3, 5)
The technical design gives the layout. Exact words for the fixed lines:

```
# Orders API 2.0.0

Create and track orders.

- Base URL: http://localhost:8000/orders
- Authentication: send your API key in the `apikey` header
- OpenAPI document: http://localhost:3000/api/v1/apis/orders/spec
- Reference: http://localhost:3000/apis/orders

## Operations

### GET /orders/{id}

Get one order.

Parameters

| Name | In | Required | Type |
| --- | --- | --- | --- |
| id | path | yes | string |

Responses: 200, 404
```
- **Required** column: `yes` / `no`.
- Header names, paths and parameter names in the Authentication line appear in backticks.
  `<in>` reads as `header`, `query parameter` or `cookie`
  (`send your API key in the \`api_key\` query parameter`).
- No `apiKey` scheme applied: leave the Authentication line out (don't write "none": the API
  might use a scheme the portal doesn't apply).
- No operations: under `## Operations`, the line `This version has no operations.`
- Deprecated operation: `Deprecated.` on its own line after the summary.
- Request body: `Request body: application/json (required)` or `(optional)`; several media types
  comma-separated.
- 404 details (problem+json, exact, from the technical design):
  `No published API with slug '<slug>'.` and `API '<slug>' has no version '<version>'.`

### 4.3 Spec download (AC 4, 5)
- File name: `<slug>-<version>.<json|yaml>` (server sets it). No portal copy.
- 404s use the same two details as §4.2.

## 5. Copy

| Where | Text |
| --- | --- |
| Version row link | **View as Markdown** |
| Version row button | **Download spec** |
| Link accessible name (screen readers) | "View as Markdown" + visually hidden " (version 1.0.0)" |
| Button accessible name | "Download spec" + visually hidden " (version 1.0.0)" |
| `title` attribute | None (don't duplicate the name in a tooltip) |

The visible text begins the accessible name, so voice users can say "click Download spec"
(WCAG 2.5.3). The version comes from the version being viewed; on the latest page it's the latest
version number, not the word "latest".

## 6. Accessibility (WCAG 2.2 AA)
- **Keyboard:** Tab order in the header is breadcrumb → access action → switcher → **Changelog** →
  **View as Markdown** → **Download spec** → base URL **Copy** → reference. Both new controls are
  native links: Enter activates; no custom key handling.
- **Focus:** the standard ring (`outline: 2px solid var(--ring); outline-offset: 2px`). After a
  download, focus stays on the button.
- **Roles:** the download control is a link styled as a button. Keep it an `<a>` (it navigates to a
  resource); don't add `role="button"`, which would promise Space to activate.
- **Icon:** `aria-hidden="true"`; the text carries the meaning.
- **Target size:** button 36px high at 1280px, 44px high full width at 375px. The text link has at
  least 24px of hit area height (WCAG 2.5.8) via the row's line height and padding.
- **Contrast:** link `--primary` on `--background` 6.7:1; button `--secondary-foreground` on
  `--secondary` 16.3:1. A theme that overrides them keeps 4.5:1.
- **Code samples:** Scalar's picker and copy button are keyboard reachable; QA checks Tab reaches
  the picker and the copy button, and the copy button has an accessible name.
- **Plain-text surfaces** are text, readable by any assistive tech or agent; no further work.

## 7. Responsive behaviour
| Element | 375px | 1280px |
| --- | --- | --- |
| Version switcher / badge | Full width (012) | Auto width, start of row |
| **Changelog** · **View as Markdown** | One line below the switcher, separated by a `·` (`aria-hidden`); wraps to two lines if a theme's font is wider | Inline after the switcher, existing gap |
| **Download spec** | Own line, full width, 44px high | End of the same row, auto width, 36px high |
| Code samples | Scalar's mobile layout: sample below the operation, picker scrolls horizontally | Scalar's two-column layout: sample to the right |

Between 768px and 1279px the row behaves as at 1280px and wraps: the button drops to the next line,
left-aligned, if the row runs out of room. Never truncate a label.

## 8. Changes to earlier designs
- 012 §3.1 / §3.2: the version row gains **View as Markdown** and **Download spec** (this doc
  §3.1–3.2). The skeleton bar grows (§3.1 states table).
- 012 §4 (static demo): unchanged; the new controls are hidden in demo.

## 9. Notes for frontend, QA and the user-tester
- Frontend: get both URLs from the API detail; never build `/api/v1/...` paths by hand. For a
  version page, find the version in `ApiDetail.versions` and use its `markdownUrl` / `downloadUrl`.
- Frontend: hide both controls when `isDemo()`; keep the row identical to today in demo.
- QA (AC 7): on `/apis/{slug}` and `/apis/{slug}/versions/1.0.0`, find links by role and name
  `View as Markdown` and `Download spec`; assert their `href`s point at that version's URLs, and the
  download link has a `download` attribute.
- QA (AC 6): the curl sample shows a placeholder in the key header (assert it's non-empty and not
  any real key from the test fixtures).
- User-tester: download a spec from an older version page and confirm the file name names that
  version; open **View as Markdown** and use Back to return to the reference.
- Follow-up idea (not this spec): a `<link rel="alternate" type="text/markdown">` in the page head
  so agents reading the HTML find the Markdown without parsing the body.
