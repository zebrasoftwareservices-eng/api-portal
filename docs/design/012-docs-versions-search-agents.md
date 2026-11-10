# 012 — API versions, changelog and spec linting: UX design

Spec: [012-docs-versions-search-agents](../specs/012-docs-versions-search-agents.md).
Contract: `apps/server/openapi.yaml` (`getApi`, `getApiVersionDocument`, `getApiChangelog`,
`importApi`, `importApiVersion`, `setLatestApiVersion`, `getHealth`). Decisions: ADR 0007.

This spec adds **three screens** and changes two:

| Screen | Route | New / changed |
| --- | --- | --- |
| API reference, latest | `/apis/[slug]` | Changed: version switcher and **Changelog** link (§3.1) |
| API reference, one version | `/apis/[slug]/versions/[version]` | New (§3.2) |
| Changelog | `/apis/[slug]/changelog` | New (§3.3) |
| Admin: APIs | `/admin/apis` | Changed: lint results, release note, linked-service hand-off, **Manage versions** (§3.4) |
| Admin: API versions | `/admin/apis/[slug]` | New: versions table, **Set as latest**, **Add a version** form (§3.5) |

Anything not mentioned stays as [001](001-kong-quickstart-slice.md), [004](004-per-api-access-control.md)
and [019](019-unified-portal-developer-journey.md) specify. **No new tokens.** One new shared
component (`VersionSwitcher`) and two portal components (`LintFindings`, `ChangeList`), §2.

## 0. Principles for this change
- **One API, many versions.** Developers and admins always see one API with one name, one base URL
  and one access action. A version is a way of reading that API, not a separate thing to sign up for.
- **The latest is the default, and older pages say so.** `/apis/{slug}` always shows the latest
  version. Every older version page says which version it is and links to the latest, so nobody
  integrates against v1 by accident.
- **A lint refusal is a to-do list.** Each error shows the rule, what's wrong and where (pointer and
  line), in the order the admin will fix them. No error is hidden behind "invalid document".
- **Warnings never block, and never shout.** Warnings appear after publishing, collapsed under a
  count, so a spec with 40 style warnings still gets a clear "Published".
- **Changelog words come from the summary, not from Spectral or Kong.** Developers see "Added",
  "Removed", "Changed" and "Breaking"; never "baseline", "ruleset" or "ACL".

### Answer to the ui-designer open question
*Is "new version" a separate admin action, or does the import form detect an existing API linked to
the same Kong service?* **Both, with the separate action as the one place versions are published.**
- Each published API gets an admin page, `/admin/apis/{slug}`, with an **Add a version** form. That
  form has no Kong service, slug or route fields, because a version shares all of them — so an admin
  can't accidentally create a second API.
- The import form keeps detecting the conflict (`GatewayService.linkedApiSlug`) and, instead of a dead
  end, links straight to that API's **Add a version** form (§3.4). The 422
  `gateway-service-already-linked` refusal links there too.
- The import form doesn't silently switch into "add version" mode: the two operations take different
  fields and make different promises (one calls Kong, one never does), and a form that changes its
  meaning based on a dropdown is hard to follow with a screen reader.

## 1. User flows

### Flow A — Developer: switch to the version they use (AC 1, 2, 9)
1. The developer opens `/apis/orders`. The header shows **Version 2.0.0 · Latest** and **Changelog**.
2. They open the switcher. It lists every version in `ApiDetail.versions` order; `2.0.0` is checked
   and marked **Latest**.
3. They choose `1.0.0`. The browser goes to `/apis/orders/versions/1.0.0` (a real link: it can be
   bookmarked, shared and opened in a new tab).
4. **Success:** the v1 reference loads with the notice "You're reading version 1.0.0. The latest is
   2.0.0." and **View latest version**. Base URL, access action and try-it are unchanged.

### Flow B — Developer: read what changed (AC 3)
1. From any reference page the developer selects **Changelog**.
2. `/apis/orders/changelog` lists versions newest import first.
3. The `2.0.0` entry shows the import date, the admin's release note, a **Breaking changes** notice,
   and the lists: Added `POST /orders`; Removed `GET /orders` (**Breaking**).
4. **Success:** they select **View 2.0.0 reference** or **View 1.0.0 reference** to compare.

### Flow C — Admin: publish a new version (AC 1, 2, 3)
1. On `/admin/apis` the admin selects **Manage versions** on the Orders API row (or follows the link
   from the import form, Flow E).
2. `/admin/apis/orders` shows the versions table and the **Add a version** form.
3. The admin chooses the v2 file (or a URL), writes the release note "Orders can now be created", and
   leaves **Don't make this the default version** unticked.
4. They select **Publish version**. The button reads **Linting and publishing…**.
5. **Success:** "Published version 2.0.0. It's now the latest version, so developers see it first."
   with **View 2.0.0** and **View changelog**. The table gains `2.0.0` marked **Latest**, highlighted.
   Lint warnings, if any, appear collapsed under the success alert (§2.2).

### Flow D — Admin: publish an older patch without making it the default (AC 2)
1. As Flow C, with the `1.1.0` file and **Don't make this the default version** ticked.
2. The hint under the checkbox reads "Developers keep seeing 2.0.0 first. You can change this later
   with Set as latest."
3. **Success:** "Published version 1.1.0. Developers still see 2.0.0 first." The table shows `1.1.0`
   without the Latest badge.

### Flow E — Admin: tries to import v2 as a new API (detection)
1. On `/admin/apis` the admin chooses the v2 file and the Kong service already linked to `orders`.
2. A warning appears below the service field: "This service already serves /apis/orders. To publish
   a new version of that API, add a version to it instead." with the link **Add a version to Orders
   API** → `/admin/apis/orders#add-version`.
3. The admin follows the link. Their file choice doesn't carry over (browsers can't move a chosen file
   between pages); a URL source does, as `?url=` (§3.5).
4. **Success:** Flow C from step 3.

### Flow F — Admin: import refused by lint (AC 5, 7)
1. The admin submits either form with a document that has error-severity findings.
2. The server answers 422 `openapi-lint-failed`. The form keeps its values.
3. An error alert above the submit button, focused, reads "3 errors stop this document from being
   published" and lists each error with rule, message and location (§2.2). It ends "Nothing was
   published."
4. The admin fixes the file in their editor (the line numbers match it), chooses it again and
   resubmits.

### Flow G — Admin: publish with warnings (AC 6)
1. The admin submits a document with warnings only.
2. **Success:** the normal success alert, then a collapsed panel "12 lint warnings. The document was
   published; fix these when you can." Expanding it shows the same list layout as errors.
3. The warnings stay until the admin publishes again or leaves the page.

### Flow H — Admin: set a different version as latest (AC 9)
1. On `/admin/apis/orders` the admin selects **Set as latest** on the `2.0.0` row.
2. The button reads **Setting…**; other row buttons are disabled.
3. **Success:** "2.0.0 is now the latest version. Developers see it first on /apis/orders." The Latest
   badge moves to `2.0.0`; `2.0.0`'s **Set as latest** button disappears and `1.1.0` gains one.

### Flow I — Admin: the operator's ruleset failed to load (AC 8)
1. The admin opens `/admin/apis` or `/admin/apis/{slug}`. `GET /v1/health` reports
   `lint.status = error`.
2. A page-level error banner explains that imports are paused, shows the file path and reason from
   `health.lint.error`, and says what to do (fix the file, restart the server).
3. The forms stay usable (health can be stale), but a submit answered with 503
   `lint-ruleset-unavailable` shows the same explanation in the form, without a **Try again** button,
   because waiting won't fix it.

## 2. Components

Reuse from `packages/ui` without change: `Button`, `Input`, `Textarea`, `Label`, `Badge`, `Table`,
`PageHeader`, `CodeValue`, `EmptyState`, `Card`. Portal: `Field`, `ProblemAlert`, `DateValue`.

### 2.1 `VersionSwitcher` (new, `packages/ui`)
A shadcn **DropdownMenu** (Radix) whose items are links. Not a `<select>` that navigates on change:
that changes context on input (WCAG 3.2.2) and can't be middle-clicked.

| Prop | Type | Notes |
| --- | --- | --- |
| `versions` | `{ version: string; isLatest: boolean; href: string }[]` | Already in display order (`ApiDetail.versions` as given — never re-sort). |
| `current` | `string` | The version this page shows. |

- **Trigger:** `Button variant="outline"` reading **Version {current}** plus a **Latest** badge if
  `current` is latest, then a chevron icon (`aria-hidden`). Accessible name: "Version {current},
  latest" or "Version {current}"; Radix adds `aria-haspopup="menu"` and `aria-expanded`.
- **Menu:** `DropdownMenuRadioGroup`-style items, each `asChild` around `<a href>`; the current one has
  a check icon and `aria-current="page"`. Each item: version in `--portal-font-mono`, then **Latest**
  badge if `isLatest`, then the import date in `--muted-foreground` ("Published 8 Nov 2026" via
  `DateValue`). Menu `max-height: min(60vh, 400px)`, scrolls inside.
- **Footer item:** separator, then **View changelog** (link to `/apis/{slug}/changelog`).
- **One version:** don't render the switcher. Render the existing `Badge` "v{version}" instead
  (tech lead's default kept: a menu with one choice is noise). The **Changelog** link still shows.
- **Variant:** none. Width: auto at ≥768px; full width at 375px (§7).

### 2.2 `LintFindings` (new, `apps/portal/components`)
Lists lint findings. Used inside the error `ProblemAlert` (errors) and inside the warnings
`<details>` (warnings).

| Prop | Type | Notes |
| --- | --- | --- |
| `findings` | `{ rule: string; message: string; pointer?: string; line?: number; column?: number; source?: string \| null }[]` | `Problem.errors[]` on 422, `lintWarnings` on success. Shown in the order given (document order). |
| `total` | `number?` | `Problem.errorCount`. When greater than `findings.length`, show the "first N of M" line. |
| `severity` | `'error' \| 'warning'` | Sets the icon and the word in each row. |

Each finding is an `<li>` in an `<ol>` (order matters: it's document order):

```
⚠ Error  operation-operationId-unique                         Line 42, column 9
  Every operation must have a unique operationId. "getOrder" is used twice.
  /paths/~1orders~1{id}/get/operationId
  In https://example.com/schemas/common.yaml          ← only when source is not null
```

- Line 1: icon + the word **Error** or **Warning** (`--destructive` / `--portal-warning`, never colour
  alone), the rule in mono, and "Line {line}, column {column}" right-aligned at ≥768px (own line at
  375px). If `line` is missing, omit the location text.
- Line 2: `message` as plain text.
- Line 3: `pointer` in mono, `--muted-foreground`, `overflow-wrap: anywhere`. Human pointers are hard
  to read, but they're exact, and the line number is the friendly part.
- Line 4, only when `source` is not null: "In {source}" — the line number refers to that file.
- More than 10 findings: show the first 10 and a **Show all {n}** button (`Button variant="ghost"`)
  that reveals the rest in place and moves focus to the 11th item.
- `total > findings.length`: after the list, "Showing the first {findings.length} of {total} errors.
  Fix these and import again to see the rest."

### 2.3 `ChangeList` (new, `apps/portal/components`)
Renders one `ChangeSummary`. Used on the changelog page only.

| Prop | Type | Notes |
| --- | --- | --- |
| `changes` | `ChangeSummary` | `added`, `removed`, `changed`, `breaking`, `comparedTo`. |
| `headingLevel` | `3 \| 4` | Default 3 (the entry heading is h2). |

- Intro line: "Compared with {comparedTo}." (mono version).
- If `breaking`: a `.alert.error`-style notice (`--portal-destructive-subtle` background, `--destructive`
  icon and word) "⚠ Breaking changes. Calls that work on {comparedTo} may fail on {version}." — the
  only place colour fills a block on this page.
- Three groups, in this order, each an h3 with a count — **Added (1)**, **Removed (1)**, **Changed
  (2)** — and a `<ul>`. Empty groups are left out. If all three are empty: "No operations were added,
  removed or changed." (descriptions or schemas may still have changed; field-level diffs are out of
  scope).
- Each operation row: method `Badge` (neutral: `--muted` / `--foreground`, mono, fixed width 64px so
  paths line up), path in mono, `summary` in `--muted-foreground` if present, then a **Breaking**
  badge (`--portal-destructive-subtle` / `--destructive`, with ⚠ icon) if `breaking`.
- Under a changed row, its `reasons[].message` as a nested list, each breaking reason prefixed
  "Breaking:" in visually hidden text plus the ⚠ icon. Removed rows don't list `operation-removed`
  (the group heading already says it).
- `message` strings are server text that may contain backticks; render them as plain text with
  backtick spans as `<code>` (no Markdown, no HTML).

## 3. Screens

### 3.1 API reference, latest — `/apis/[slug]` (AC 1, 2, 9)
**Purpose (unchanged):** read the API and make a call. **Primary action (unchanged):** the access
action from 019. **New:** the version row under the title.

```
1280px — several versions
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API                                                            │
│ Orders API                                              [ Get an API key ]   │
│ [ Version 2.0.0  Latest  ▾ ]   Changelog                                     │  new row
│ Base URL  http://localhost:8000/orders                               [Copy]  │
│ ⓘ To try a request, go to Authentication …                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Scalar reference (latest document: ApiDetail.documentUrl)                    │
└──────────────────────────────────────────────────────────────────────────────┘

Switcher open
┌──────────────────────────────────────┐
│ ✓ 2.0.0   Latest   Published 8 Nov   │
│   1.1.0            Published 6 Nov   │
│   1.0.0            Published 2 Oct   │
│ ──────────────────────────────────── │
│   View changelog                     │
└──────────────────────────────────────┘

1280px — one version
│ Orders API                                              [ Get an API key ]   │
│ [v1.0.0]   Changelog                                                         │
```

```
375px
┌───────────────────────────────────┐
│ APIs / Orders API                 │
│ Orders API                        │
│ [        Get an API key         ] │
│ [ Version 2.0.0  Latest       ▾ ] │  full width
│ Changelog                         │
│ Base URL                          │
│ http://localhost:8000/orders [⧉]  │
│ ⓘ To try a request, …             │
├───────────────────────────────────┤
│ Scalar (its own mobile layout)    │
└───────────────────────────────────┘
```

- Menu hrefs: the latest version links to `/apis/{slug}` (canonical), every other to
  `/apis/{slug}/versions/{encodeURIComponent(version)}` (`+` → `%2B`, per the contract).
- **Changelog** is a plain text link (`--primary`), not a button.
- The `Badge` "v{version}" that 001/019 show is replaced by the switcher when there are ≥2 versions.

| State | UI |
| --- | --- |
| Loading | Existing `loading.tsx`; its skeleton gains one 36px-high, 200px-wide bar for the version row. |
| Empty | Not applicable: a published API always has at least one version. |
| Error | Unchanged (001 §3.2). |
| Success, one version | Badge + **Changelog**. |
| Success, several versions | Switcher + **Changelog**. |
| No permission | Not applicable: public page. Unknown slug → existing API not found page. |
| Static demo | One version (demo data has one): badge + **Changelog**, which works in demo (§4). |

### 3.2 API reference, one version — `/apis/[slug]/versions/[version]` (AC 1)
**Purpose:** read a specific version at a stable URL. **Primary action:** the same access action as
§3.1 (keys are per API, so v1 readers use the same app and key).

```
1280px — older version
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API / 1.0.0                                                    │
│ Orders API                                              [ Get an API key ]   │
│ [ Version 1.0.0  ▾ ]   Changelog                                             │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ⓘ You're reading version 1.0.0. The latest is 2.0.0.                     │ │
│ │   [ View latest version ]                                                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ Base URL  http://localhost:8000/orders                               [Copy]  │
│ ⓘ To try a request, go to Authentication …                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Scalar reference (getApiVersionDocument for 1.0.0)                           │
└──────────────────────────────────────────────────────────────────────────────┘

375px
┌───────────────────────────────────┐
│ APIs / Orders API / 1.0.0         │
│ Orders API                        │
│ [        Get an API key         ] │
│ [ Version 1.0.0               ▾ ] │
│ Changelog                         │
│ ┌───────────────────────────────┐ │
│ │ ⓘ You're reading version      │ │
│ │   1.0.0. The latest is 2.0.0. │ │
│ │ [   View latest version     ] │ │
│ └───────────────────────────────┘ │
│ Base URL …                        │
└───────────────────────────────────┘
```

- The notice is a neutral `.alert` (info, `ⓘ`), not a warning: an older version isn't a problem, and
  deprecation is out of scope. **View latest version** is `Button variant="secondary"` as a link to
  `/apis/{slug}`.
- The version is the one in the URL; the latest comes from `ApiDetail.versions` (`isLatest`).
- If the URL names the latest version (for example `/apis/orders/versions/2.0.0`), render it like
  §3.1 with no notice, breadcrumb `APIs / Orders API / 2.0.0`, and `<link rel="canonical">` to
  `/apis/{slug}`. Don't redirect: the URL must stay stable for people who bookmarked it while it
  was older.
- Title, base URL and access action come from the API (latest), so the page header is identical
  across versions; only the reference body and the switcher change. The `<title>` is
  "Orders API 1.0.0 · Developer Portal".

| State | UI |
| --- | --- |
| Loading | Same skeleton as §3.1 plus the notice bar. |
| Empty | Not applicable. |
| Error, document | Unchanged reference error from 001 §3.2, wording "We couldn't load the reference for version {version}. Try again in a moment." |
| Unknown version (404 from either `getApi` lookup or `getApiVersionDocument`) | Version not found page (below). |
| Unknown slug | Existing API not found page. |
| No permission | Not applicable: public. |
| Static demo | Only the demo's one version exists; any other version → version not found page. |

**Version not found** (`apps/portal/app/apis/[slug]/versions/[version]/not-found.tsx`): h1 "Version
not found", body "Orders API has no version {version}. It may have been mistyped, or the link is from
another portal." Buttons **View latest version** (primary, `/apis/{slug}`) and **View changelog**
(secondary). The version is shown in mono and truncated to 64 characters. HTTP status 404.

### 3.3 Changelog — `/apis/[slug]/changelog` (AC 3)
**Purpose:** see what changed in each version and decide whether to upgrade. **Primary action:**
**View {version} reference** on an entry.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API / Changelog                                                │
│ Orders API changelog                                                         │
│ Every version published in this portal, newest first.                        │
│                                                                              │
│ 2.0.0  [Latest]                                         Published 8 Nov 2026 │  h2
│ Orders can now be created                                                    │  release note
│ Compared with 1.0.0.                                                         │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚠ Breaking changes. Calls that work on 1.0.0 may fail on 2.0.0.          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ Added (1)                                                                    │  h3
│   [POST]   /orders            Create an order                                │
│ Removed (1)                                                                  │
│   [GET ]   /orders            List orders                    [⚠ Breaking]    │
│ Changed (1)                                                                  │
│   [GET ]   /orders/{id}       Get an order                   [⚠ Breaking]    │
│            • ⚠ New required query parameter `status`                         │
│ View 2.0.0 reference                                                         │
│ ──────────────────────────────────────────────────────────────────────────── │
│ 1.1.0                                                   Published 6 Nov 2026 │
│ No release note.                                                             │
│ Compared with 1.0.0.                                                         │
│ Changed (1) …                                                                │
│ View 1.1.0 reference                                                         │
│ ──────────────────────────────────────────────────────────────────────────── │
│ 1.0.0                                                   Published 2 Oct 2026 │
│ First version.                                                               │
│ View 1.0.0 reference                                                         │
└──────────────────────────────────────────────────────────────────────────────┘

375px — one entry
┌───────────────────────────────────┐
│ APIs / Orders API / Changelog     │
│ Orders API changelog              │
│ 2.0.0 [Latest]                    │
│ Published 8 Nov 2026              │
│ Orders can now be created         │
│ Compared with 1.0.0.              │
│ ┌───────────────────────────────┐ │
│ │ ⚠ Breaking changes. Calls …   │ │
│ └───────────────────────────────┘ │
│ Added (1)                         │
│ [POST] /orders                    │
│        Create an order            │
│ Removed (1)                       │
│ [GET ] /orders                    │
│        List orders                │
│        [⚠ Breaking]               │
│ View 2.0.0 reference              │
└───────────────────────────────────┘
```

- Data: `getApiChangelog` for entries (order as given: newest import first), `getApi` for the title
  and for which entry is **Latest** (`versions[].isLatest`). Fetch both on the server, in parallel.
- Each entry is an `<article aria-labelledby>` with an h2 of the version (mono) and a `<time>` with the
  date (`DateValue`, date only). Entries are separated by a `--border` divider.
- **Release note:** plain text with `white-space: pre-wrap` and `overflow-wrap: anywhere`; never Markdown
  or HTML. `releaseNote` null → "No release note." in `--muted-foreground`. Notes longer than 12
  lines are clamped with a **Show full note** button (`aria-expanded`); short notes aren't.
- `changes` null → "First version." if it's the last entry in the list; otherwise "No earlier version
  to compare with." (an older version uploaded with the lowest number — the contract's null case).
- **View {version} reference** links to §3.1 for the latest version, else §3.2.
- Each entry also has an anchor `id="v-{version}"` so `/apis/orders/changelog#v-2.0.0` deep-links; the
  switcher's **View changelog** links to the page top.

| State | UI |
| --- | --- |
| Loading | `loading.tsx`: breadcrumb and h1 skeletons, then two entry skeletons (heading bar, three text lines). |
| Empty | Not reachable (every API has ≥1 entry). If `items` is empty anyway: `EmptyState` "No versions yet" / "This API's versions will appear here when they're published." |
| Error | Same as the reference page error: h1 kept, `ProblemAlert` "We couldn't load the changelog. Try again in a moment." with **Try again** (reloads). |
| Success | Entries as above. |
| Unknown slug | Existing API not found page. |
| No permission | Not applicable: public. |
| Static demo | Renders the demo's one entry from `demoData()` (§4). |

### 3.4 Admin: APIs — `/admin/apis` (changed) (AC 5, 6, 7, 8)
Changes to the 001 §3.10 / 004 §2.3 screen. The rest is unchanged.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs                                                                         │
│ Import an OpenAPI document, link it to a Kong service and publish it.        │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚠ Imports are paused: the lint ruleset didn't load        (only on AC 8) │ │
│ │ /etc/portal/ruleset.yaml: file not found                                 │ │
│ │ Fix the file set in PORTAL_LINT_RULESET, then restart the server.        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ✓ Published Orders API. It's now in the public catalog.  View Orders API     │
│ ▸ 3 lint warnings. The document was published; fix these when you can.       │  new
│                                                                              │
│ Import an API                                                                │
│  Source  (•) Upload a file  ( ) From a URL                                   │
│  OpenAPI file  [Choose file]                                                 │
│  Kong service  [orders — /orders — key-auth on · linked to /apis/orders ▾]   │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠ This service already serves /apis/orders. To publish a new version   │  │  changed
│  │   of that API, add a version to it instead.                            │  │
│  │   Add a version to Orders API →                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ▸ More options   (Slug, Route path, Release note — new)                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠ 3 errors stop this document from being published                     │  │  on 422 lint
│  │ ⚠ Error operation-operationId-unique             Line 42, column 9     │  │
│  │   Every operation must have a unique operationId …                     │  │
│  │   /paths/~1orders~1{id}/get/operationId                                │  │
│  │ ⚠ Error invalid-ref                              Line 88, column 15    │  │
│  │   …                                                                    │  │
│  │ Fix these in the document and import it again. Nothing was published.  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  [ Import and publish ]                                                      │
│                                                                              │
│ Published APIs                                                               │
│ Title        Slug     Version  Base URL                Published   Versions  │
│ Orders API   orders   2.0.0    http://…:8000/orders    2 Oct 2026  Manage versions │
└──────────────────────────────────────────────────────────────────────────────┘
```

Changes:
1. **Ruleset banner (AC 8).** When `health.lint.status === 'error'`, a `.alert.error` banner under the
   page description (above the existing Kong-unreachable warning if both show). Title "Imports are
   paused: the lint ruleset didn't load"; then `health.lint.error` in mono; then "Fix the file set in
   PORTAL_LINT_RULESET, then restart the server. Until then, nothing can be imported or published as a
   new version." Not `role="alert"` (it's present on load); it's the first thing after the h1.
2. **Linked-service warning (detection).** Replaces 004's "…so this import will be refused. Choose
   another one." with the copy in §5 and a link **Add a version to {title}** →
   `/admin/apis/{linkedApiSlug}#add-version`, plus `?url={url}` when the source is a URL. `{title}`
   comes from the catalog list already loaded on this page; if the slug isn't in it, use
   "Add a version to /apis/{slug}". The submit button stays enabled (004 behaviour).
3. **422 `gateway-service-already-linked`.** Field error on Kong service: "This service already serves
   a published API. Choose another service, or add a version to that API." The alert body keeps
   `detail` and adds the same **Add a version to …** link when the selected service has
   `linkedApiSlug`.
4. **Release note** (new field under More options, last): `Textarea`, label "Release note
   (optional)", hint "Plain text shown in the API's changelog. Up to 5,000 characters." Live counter
   and over-limit error exactly as in §3.5. Sent as `releaseNote` only when not blank.
5. **Lint errors (422 `openapi-lint-failed`, AC 5 and 7).** `ProblemAlert` with title "{errorCount}
   error(s) stop this document from being published" and a body of `LintFindings severity="error"
   findings={problem.errors} total={problem.errorCount}`, then "Fix these in the document and import
   it again. Nothing was published." No field error is set (the problem is inside the document, not
   a form field), so focus stays on the alert.
6. **Lint warnings (success, AC 6).** After the success alert (and 004's gateway warnings): a
   `<details>` styled as `.alert.warning`, closed by default, summary "⚠ {n} lint warning(s). The
   document was published; fix these when you can." Content: `LintFindings severity="warning"`. If
   `lintWarnings.length === 200`: add "Showing the first 200 warnings." Empty `lintWarnings` → nothing.
7. **Other new 422s.** `invalid-api-version`: field error on the source field (file or URL) — copy in
   §5 — and the alert shows `detail` and "Location: /info/version". **503 `lint-ruleset-unavailable`:**
   `ProblemAlert` titled "Imports are paused: the lint ruleset didn't load", body `detail` plus "Fix the
   file set in PORTAL_LINT_RULESET, then restart the server. Nothing was published." **No Try again
   button** (unlike the Kong 503), and the page re-fetches health so the banner appears.
8. **Published APIs table.** New last column **Versions** with a link **Manage versions** (visually
   hidden suffix " for {title}") → `/admin/apis/{slug}`. Version column unchanged (latest).
9. **Pending label.** The submit button reads **Linting and publishing…** (was "Validating and
   publishing…").

States not listed are unchanged from 001 §3.10.

### 3.5 Admin: API versions — `/admin/apis/[slug]` (new) (AC 1, 2, 3, 4, 5, 6, 9)
**Purpose:** see every version of one API, choose the latest, and publish a new version.
**Primary action:** **Publish version**.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ Admin / APIs / Orders API                                                    │
│ Orders API versions                                         View public page │
│ Kong service orders · Base URL http://localhost:8000/orders                  │
│                                                                              │
│ ✓ 2.0.0 is now the latest version. Developers see it first on /apis/orders.  │  after Set as latest
│                                                                              │
│ Versions                                                                     │  h2
│ ┌─────────┬──────────┬──────────────┬─────────────────────────────────────┐  │
│ │ Version │ Status   │ Published    │                                     │  │
│ ├─────────┼──────────┼──────────────┼─────────────────────────────────────┤  │
│ │ 2.0.0   │ ✓ Latest │ 8 Nov 2026   │ View                                │  │
│ │ 1.1.0   │          │ 6 Nov 2026   │ View   [ Set as latest ]            │  │
│ │ 1.0.0   │          │ 2 Oct 2026   │ View   [ Set as latest ]            │  │
│ └─────────┴──────────┴──────────────┴─────────────────────────────────────┘  │
│ The latest version is what developers see first on /apis/orders. Older       │
│ versions stay readable at their own URLs.   View changelog                   │
│                                                                              │
│ Add a version                                              (id=add-version)  │  h2
│ Publishes a new OpenAPI document for this API. It uses the same Kong         │
│ service, route, apps and keys, so nothing changes in Kong.                   │
│  Source  (•) Upload a file  ( ) From a URL                                   │
│  OpenAPI file  [Choose file]                                                 │
│  YAML or JSON, OpenAPI 3.0 or 3.1, up to 5 MiB. The version number is read   │
│  from info.version and must be new for this API.                             │
│  Release note (optional)                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Orders can now be created                                              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  26 / 5,000                                                                  │
│  [ ] Don't make this the default version                                     │
│      Developers keep seeing 2.0.0 first. You can change this later with      │
│      Set as latest.                                                          │
│  [ Publish version ]                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
375px — versions as a list, not a table
┌───────────────────────────────────┐
│ Admin / APIs / Orders API         │
│ Orders API versions               │
│ View public page                  │
│ Versions                          │
│ ┌───────────────────────────────┐ │
│ │ 2.0.0              ✓ Latest   │ │
│ │ Published 8 Nov 2026          │ │
│ │ View                          │ │
│ ├───────────────────────────────┤ │
│ │ 1.1.0                         │ │
│ │ Published 6 Nov 2026          │ │
│ │ View                          │ │
│ │ [       Set as latest       ] │ │
│ └───────────────────────────────┘ │
│ Add a version                     │
│ … form fields full width …        │
│ [       Publish version         ] │
└───────────────────────────────────┘
```

**Content and data**
- `GET /v1/apis/{slug}` (`ApiDetail`) for the title, `gatewayService.name`, `gatewayBaseUrl` and
  `versions` (order and `isLatest` as given). Page guard as `/admin/apis`: signed out → sign-in with
  `next`, non-admin → 404.
- Status column: the **Latest** `Badge` (`--accent` / `--accent-foreground`, ✓ icon + word) on the
  latest row only; other rows are blank (no "Older" label — it isn't a state).
- **View** links to §3.1 (latest) or §3.2 (older), with visually hidden " version {version}".
- **Set as latest**: `Button variant="secondary" size="sm"` on every row except the latest; accessible
  name "Set {version} as latest". No confirmation dialog: it's instant to undo with another click and
  changes no keys or gateway state.
- 375px: the table becomes a `<ul>` of `Card`s (same content order: version, status, date, actions) —
  the same reflow pattern as 019's app list.

**Add a version form** (`<form aria-labelledby="add-version-heading">`, section `id="add-version"`)
- Source radio, file input / URL input: same component, validation and copy as the import form
  (001 §3.10), including drag-and-drop and the 5 MiB check. If the page URL has `?url=`, preselect
  **From a URL** and fill it.
- Release note: `Textarea`, 4 rows, auto-grows to 12. Counter "{n} / 5,000" under it,
  `aria-live="polite"` only when within 200 of the limit (so it doesn't announce every keystroke).
  Over the limit: field error "Shorten the release note to 5,000 characters or fewer. It's {n} now."
  and submit is blocked client-side.
- Checkbox **Don't make this the default version** (unchecked by default → `makeLatest: true`; checked
  → `makeLatest: false`). Hint names the current latest from `versions`.
- Submit **Publish version**; pending **Linting and publishing…** with `aria-busy`, fieldset disabled
  (same double-submit lock as the import form).

**After success (201 `ImportedApiVersion`)**
- Success alert (`role="status"`, focused) — copy in §5, varying by whether `version.version` is
  now latest (`api.versions[].isLatest`). Links **View {version}** and **View changelog**.
- Versions table re-renders from `api.versions`; the new row has the `highlight` class (as 001).
- Lint warnings: the same collapsed `<details>` as §3.4 item 6, after the success alert.
- The form resets (source to file, note empty, checkbox unticked).

**After Set as latest (200 `ApiDetail`)**
- Re-render the table from the response. A `role="status"` message above the table: "{version} is now
  the latest version. Developers see it first on /apis/{slug}." Focus moves to that message (the
  button the admin pressed no longer exists).
- Idempotent repeat (shouldn't be reachable in the UI) shows the same message.

| State | UI |
| --- | --- |
| Loading | `loading.tsx`: breadcrumb, h1 and a 3-row table skeleton; the form renders after data loads (it needs the latest version for its hint). |
| Empty | Not reachable (an API has ≥1 version). |
| Error, page data | h1 "API versions", `ProblemAlert` "We couldn't load this API. Try again in a moment." with **Try again**. |
| Unknown slug (404) | Existing not-found page ("Page not found"), as for other admin 404s. |
| No permission | Signed out → `/sign-in?next=/admin/apis/{slug}`. Non-admin → not-found page. API 401 mid-session → sign-in redirect; 403 → not-found page. |
| Ruleset failed (`health.lint.status = error`) | The §3.4 banner above **Versions**. Form still shown. |
| Publish pending | Button **Linting and publishing…**, fieldset disabled; **Set as latest** buttons disabled too. |
| Publish success | As above. |
| Publish refused — lint (422) | `ProblemAlert` with `LintFindings` as §3.4 item 5, above the submit button, focused. Values kept. |
| Publish refused — exists (409) | Field error on the source field: "This API already has version {version}." from `detail` when present, else "This API already has a version with this number." then "Change info.version in the document, then publish again." The table is unchanged. |
| Publish refused — other 422 | `invalid-openapi`, `unsupported-openapi-version`, `invalid-api-version`, `spec-url-unreachable`: same mapping and copy as the import form. |
| Publish refused — 413 | Field error "This document is larger than 5 MiB, the import limit." (as import). |
| Publish refused — 404 | The API was removed meanwhile: `ProblemAlert` "This API no longer exists. Nothing was published." with link **Back to APIs**. |
| Publish refused — 503 ruleset | As §3.4 item 7, no Try again. |
| Publish — network failure | Existing `networkProblem()` alert with **Try again**. Kong being down does **not** affect this form (no gateway call), so it shows no Kong warning. |
| Set as latest pending | That row's button reads **Setting…** (`aria-busy`); all row buttons and **Publish version** disabled. |
| Set as latest — 404 | `ProblemAlert` above the table "Version {version} no longer exists. Refresh the page to see the current versions." with **Refresh** (reloads data). |
| Set as latest — network / 5xx | `ProblemAlert` above the table "The latest version wasn't changed. Try again." with **Try again** (repeats the call; it's idempotent). |

## 4. Static demo (ADR 0004)
- `demoData()` gains `versions: [{ version: '1.0.0', isLatest: true, publishedAt, documentUrl }]` and
  one changelog entry `{ version: '1.0.0', releaseNote: 'First release of the sample API.', changes:
  null }`.
- `/apis/sample` shows the `v1.0.0` badge (one version) and the **Changelog** link.
  `/apis/sample/changelog` renders the one entry ("First version."). `/apis/sample/versions/1.0.0`
  renders like `/apis/sample` with the existing read-only notice. Other versions → version not found.
- No admin pages in demo (unchanged).

## 5. Copy

### 5.1 Developer pages
| Where | Text |
| --- | --- |
| Switcher trigger | Version {version} · badge **Latest** when latest |
| Switcher menu item meta | Published {date} |
| Switcher footer | View changelog |
| Version row link | Changelog |
| Older version notice | You're reading version {version}. The latest is {latest}. |
| Notice button | View latest version |
| Breadcrumb, version page | APIs / {title} / {version} |
| Version not found h1 / body | Version not found / {title} has no version {version}. It may have been mistyped, or the link is from another portal. |
| Changelog h1 / intro | {title} changelog / Every version published in this portal, newest first. |
| Changelog entry date | Published {date} |
| No note | No release note. |
| First entry, no changes | First version. |
| Later entry, no changes | No earlier version to compare with. |
| Comparison line | Compared with {comparedTo}. |
| Breaking notice | Breaking changes. Calls that work on {comparedTo} may fail on {version}. |
| Group headings | Added ({n}) · Removed ({n}) · Changed ({n}) |
| No operation changes | No operations were added, removed or changed. |
| Breaking badge | Breaking |
| Entry link | View {version} reference |
| Long note toggle | Show full note / Show less |
| Changelog error | We couldn't load the changelog. Try again in a moment. |

### 5.2 Admin pages
| Where | Text |
| --- | --- |
| Published APIs column / link | Versions / Manage versions |
| Versions page h1 | {title} versions |
| Versions page meta | Kong service {name} · Base URL {gatewayBaseUrl} |
| Header link | View public page |
| Table caption (visually hidden) | Versions of {title} |
| Table help | The latest version is what developers see first on /apis/{slug}. Older versions stay readable at their own URLs. |
| Row button | Set as latest (accessible name: Set {version} as latest) |
| Row button pending | Setting… |
| Set-as-latest success | {version} is now the latest version. Developers see it first on /apis/{slug}. |
| Form h2 / intro | Add a version / Publishes a new OpenAPI document for this API. It uses the same Kong service, route, apps and keys, so nothing changes in Kong. |
| File hint | YAML or JSON, OpenAPI 3.0 or 3.1, up to 5 MiB. The version number is read from info.version and must be new for this API. |
| Release note label / hint | Release note (optional) / Plain text shown in the API's changelog. Up to 5,000 characters. |
| Checkbox | Don't make this the default version |
| Checkbox hint | Developers keep seeing {latest} first. You can change this later with Set as latest. |
| Submit / pending | Publish version / Linting and publishing… |
| Success, made latest | ✓ Published version {version}. It's now the latest version, so developers see it first. |
| Success, not latest | ✓ Published version {version}. Developers still see {latest} first. |
| Success links | View {version} · View changelog |
| Import submit pending (changed) | Linting and publishing… |
| Linked-service warning (changed) | ⚠ This service already serves /apis/{slug}. To publish a new version of that API, add a version to it instead. |
| Linked-service link | Add a version to {title} |
| 422 already-linked field error (changed) | This service already serves a published API. Choose another service, or add a version to that API. |
| Lint error alert title | 1 error stops this document from being published / {n} errors stop this document from being published |
| Lint error alert footer | Fix these in the document and import it again. Nothing was published. (Add-version form: "…and publish it again. Nothing was published.") |
| Lint truncation | Showing the first {shown} of {total} errors. Fix these and import again to see the rest. |
| Lint warnings summary | ⚠ 1 lint warning. The document was published; fix it when you can. / ⚠ {n} lint warnings. The document was published; fix these when you can. |
| Warnings cap | Showing the first 200 warnings. |
| Finding location | Line {line}, column {column} |
| External source | In {source} |
| Show more findings | Show all {n} |
| `invalid-api-version` field error | The document's info.version is missing or can't be used in a URL. Use up to 64 letters, digits, dots, hyphens, underscores or plus signs, starting with a letter or digit — for example 2.0.0. |
| 409 version exists | This API already has version {version}. Change info.version in the document, then publish again. |
| Ruleset banner / 503 title | Imports are paused: the lint ruleset didn't load |
| Ruleset banner body | {health.lint.error} · Fix the file set in PORTAL_LINT_RULESET, then restart the server. Until then, nothing can be imported or published as a new version. |
| Set-as-latest 404 | Version {version} no longer exists. Refresh the page to see the current versions. |
| Set-as-latest failure | The latest version wasn't changed. Try again. |
| Add-version 404 | This API no longer exists. Nothing was published. |

Singular/plural: use the singular form when `n === 1` everywhere a count appears.

### 5.3 Text only screen readers get
| Element | Text |
| --- | --- |
| Breaking badge in a list row | (visible "Breaking" is enough; the ⚠ icon is `aria-hidden`) |
| Breaking reason prefix | "Breaking: " before the reason message |
| Method badge | Read as the method word; no extra text |
| View link in versions table | "View" + " version {version}" |
| Manage versions link | "Manage versions" + " for {title}" |
| Current item in switcher | `aria-current="page"` (screen readers say "current page") |

## 6. Accessibility (WCAG 2.2 AA)
- **Keyboard, Flow A:** Tab from the access action reaches the switcher trigger; Enter/Space/↓ opens
  the menu with focus on the current version; ↑/↓ move, Home/End jump, Enter follows the link, Esc
  closes and returns focus to the trigger. Type-ahead on version text works (Radix). Next Tab reaches
  **Changelog**, then the base URL **Copy**.
- **Focus on arrival:** navigating between versions is a full page navigation; focus goes to the top
  of the document as for any page (Next.js route announcer reads the new `<title>`, which includes
  the version). The older-version notice is not a live region — it's static page content right after
  the header and read in order.
- **Changelog structure:** h1 page → h2 per version → h3 per group. Lists are real `<ul>`s, so screen
  readers announce counts. The breaking notice is a static block (no `role="alert"`).
- **Admin focus order, publish refused:** the `ProblemAlert` focuses itself (existing behaviour);
  for 409/413/`invalid-api-version` the field error is also set and `focusInvalid` then moves focus
  to the source field, as in 004 §5. For lint 422s no field is invalid, so focus stays on the alert,
  whose first child is the title with the count.
- **Admin success:** the success alert is focused (`tabIndex=-1`, `role="status"`). The warnings
  `<details>` gets an `id` and is listed in the success alert's `aria-describedby`, so the count is
  read with it. Its `<summary>` is the next Tab stop.
- **Set as latest:** focus moves to the status message after success (the pressed button disappears).
  On failure, focus goes to the `ProblemAlert` (existing autofocus).
- **Show all {n} findings:** after expanding, focus moves to the first newly shown item (`tabIndex=-1`
  on the `<li>`).
- **Labels:** the release-note `Textarea` has a `<label>` and `aria-describedby` = hint + counter id
  (+ error id when present). The checkbox has a `<label>` and `aria-describedby` = its hint. Row
  buttons have unique accessible names (§5.3). Tables have a `<caption>` (visually hidden) and
  `scope="col"` headers.
- **Contrast:** no new colour pairs. Latest badge `--accent-foreground` on `--accent` 9.5:1; Breaking
  badge and notice `--destructive` on `--portal-destructive-subtle` 5.9:1; warning panel 6.8:1; muted
  meta text 7.6:1; switcher trigger border `--input` 4.8:1. Status is never colour alone: Latest,
  Breaking, Error and Warning always carry the word and an icon.
- **Target size (2.5.8):** switcher items, **Set as latest**, **Show all** and **Show full note** are at
  least 24×24px; buttons use the 36px/40px heights from 001.
- **Reflow (1.4.10):** at 320px nothing on the portal's own surfaces scrolls sideways. Long version
  names (up to 64 chars), pointers, URLs in `source` and release notes break with
  `overflow-wrap: anywhere`. Scalar's internal panels remain the documented exception (001 §7).
- **Motion:** the menu uses `--portal-duration`, which is 0ms under reduced motion.
- **Plain language:** messages say what happened and what to do; none blames the admin or developer.

## 7. Responsive behaviour
| Element | 375px | 1280px |
| --- | --- | --- |
| Version row (switcher + Changelog) | Switcher full width; **Changelog** link on its own line below | One row: switcher (auto width) then **Changelog** |
| Switcher menu | Full width of the gutter, max height 60vh, scrolls | Aligned to trigger start, min width 280px, max height 400px |
| Older version notice | Full width; button full width | Page width; button inline under the text |
| Changelog entry heading | Version + Latest on one line, date below | Version + Latest left, date right |
| Changelog operation rows | Method badge + path on line 1; summary and Breaking badge below, indented under the path | One row: method, path, summary, Breaking badge right-aligned |
| Admin versions list | Stacked cards; **Set as latest** full width | Table in the page container |
| Add-version form | Full width fields and button | In the 640px form column (`--portal-form-max-width`) |
| `LintFindings` row | Rule, then location, then message, then pointer — each on its own line | Rule left, location right on line 1; message and pointer below |
| Lint warnings `<details>` | Full width | Page content width |
| Ruleset banner | Full width, path wraps | Page content width |

## 8. Changes to earlier designs
- **001 §3.2 / 019 §3.2 (API reference):** the `v{version}` badge becomes the version row (§3.1) when
  there are two or more versions; a **Changelog** link is added in both cases.
- **001 §3.10 (Admin: APIs):** pending label → **Linting and publishing…**; More options gains
  **Release note**; Published APIs table gains **Versions / Manage versions**; lint errors, warnings
  and ruleset states added.
- **004 §2.3 (Kong service warning):** "…so this import will be refused. Choose another one." is
  replaced by the add-a-version hand-off (§3.4 item 2). 004 §7's note "nothing can be promised until
  spec 012" is resolved by this.

## 9. Notes for frontend, QA and the user-tester
- **Frontend:** everything here maps to the spec's `[frontend]` tasks; the "Handle
  `gateway-service-already-linked` per the UX decision" task is §3.4 items 2–3. The new admin route
  `/admin/apis/[slug]` is part of the "Add version / Set as latest" task. `VersionSwitcher` goes in
  `packages/ui` (it needs the shadcn DropdownMenu, which isn't exported yet); `LintFindings` and
  `ChangeList` stay in `apps/portal/components`. Never sort `versions` or changelog items client-side.
- **Encoding:** always build version URLs with `encodeURIComponent`; test a version with `+`
  (`1.0.0+build.1`) in the switcher, the versions table **View** link and the changelog link.
- **Tests (roles and accessible names):** switcher `getByRole('button', { name: /Version 2.0.0/ })`
  then `getByRole('menuitem', { name: /1.0.0/ })`; `getByRole('button', { name: 'Set 2.0.0 as latest' })`;
  lint errors via `getByRole('alert')` containing the rule name and "Line"; warnings via the
  `<summary>` text.
- **QA:** AC 1 asserts the switcher's items and the stable `/apis/orders/versions/1.0.0` URL; AC 3
  asserts the `2.0.0` entry's note, date, `POST /orders` under Added and `GET /orders` under Removed
  with **Breaking**; AC 5 asserts rule, message, pointer and "Line {n}" are visible for each case in
  both forms.
- **User-tester:** run Flows A, B, C, F and H at 1280px and 375px. Judge whether lint pointers are
  usable next to the line numbers, and whether the older-version notice is noticeable without being
  alarming. File a bug if the switcher menu is clipped by Scalar's sticky header.
