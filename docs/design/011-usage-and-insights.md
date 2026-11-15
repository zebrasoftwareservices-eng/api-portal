# 011 — Usage meter per app and admin insights: UX design

Spec: [011-usage-and-insights](../specs/011-usage-and-insights.md). Contract: `GET /api/v1/apps/{appId}/usage`
(`AppUsage`) and `GET /api/v1/admin/insights` (`AdminInsights`) in `apps/server/openapi.yaml`.
Tokens: [tokens.md](tokens.md). No new tokens.

Two surfaces:
1. A **Usage this month** card on the app page (`/dashboard/apps/{appId}`), for every role in the
   owning team, including Read-only and hosted-demo visitors.
2. A new admin page **Insights** (`/admin/insights`), a tab in the existing admin section nav,
   for portal admins only.

## 1. User flows

### 1.1 Developer checks an app's usage (AC 1, 2, 4, 6, 10, 11)
1. Developer signs in and opens **My apps** → an app.
2. The app page loads. The **Usage this month** card sits directly above the **APIs** card
   (after the Plan card), so the quota sits next to the plan that sets it.
3. The card shows a skeleton, then "20 of 1,000 calls", the bar, the 2xx/4xx/5xx counts, the
   reset date and "Updated less than a minute ago".
4. The developer makes more calls with the key (curl, try-it). Within a minute, reloading the page
   or returning to the tab shows the new count. While the tab is visible, the card also refetches
   every 60 seconds without a spinner.
5. If the count reaches 80% of the quota, the bar and a line of text warn; at 100% the card says
   Kong may answer 429 until the reset date.

### 1.2 Admin reads adoption (AC 7, 8, 9)
1. Admin opens **Admin** in the header → the **Insights** tab (after Requests).
2. The page shows three numbers for the last 30 days (new sign-ups, active apps, median time to
   first call against the 10-minute target), the top APIs, and the list of new developers with
   their time to first call.
3. The admin scans the list for "No call yet" and over-target rows to spot developers who got stuck.

### 1.3 Non-admin reaches `/admin/insights` by URL (AC 9, 11)
1. A developer or a demo visitor types the URL. Their header has no Admin link (unchanged
   behaviour: the link renders only for `role === 'admin'`, and never in demo mode).
2. The server answers 403; the page shows the no-permission state with no insight data.

## 2. Screen: app page — Usage this month card

### Purpose
Let any team member see, at a glance, how close the app is to its monthly quota and whether its
failures are client (4xx) or server (5xx) errors.

### Layout

```
1280px (card spans the content column, same width as the APIs card)
┌──────────────────────────────────────────────────────────────────────────┐
│ Usage this month                          Updated less than a minute ago │
│                                                                          │
│ 20 of 1,000 calls                                                    2%  │
│ ▕██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▏   │
│ Resets 1 Dec 2026, 00:00 UTC                                             │
│                                                                          │
│ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐     │
│ │ 2xx  Success       │ │ 4xx  Client errors │ │ 5xx  Server errors │     │
│ │ 12                 │ │ 5                  │ │ 3                  │     │
│ └────────────────────┘ └────────────────────┘ └────────────────────┘     │
│ 4xx includes 429 answers from Kong when a limit is reached.              │
└──────────────────────────────────────────────────────────────────────────┘

375px
┌───────────────────────────────┐
│ Usage this month              │
│ Updated less than a minute ago│
│                               │
│ 20 of 1,000 calls          2% │
│ ▕██░░░░░░░░░░░░░░░░░░░░░░░░░▏ │
│ Resets 1 Dec 2026, 00:00 UTC  │
│                               │
│ 2xx  Success             12   │
│ 4xx  Client errors        5   │
│ 5xx  Server errors        3   │
│ 4xx includes 429 answers from │
│ Kong when a limit is reached. │
└───────────────────────────────┘
```

### Content and rules
- Heading (h2): **Usage this month**.
- Updated line, right of the heading at ≥768px, below it at 375px: "Updated {relative}" from
  `collection.lastUpdatedAt`, wrapped in `<time datetime="…">` with `title` set to the absolute time
  ("14 Nov 2026, 09:42 UTC"). Relative steps: "less than a minute ago", "{n} minutes ago",
  "{n} hours ago", then the absolute date.
- Count line: "**{total}** of {quota} calls" with thousands separators (`Intl.NumberFormat('en-US')`).
  The percentage, `floor(total / quota * 100)`, sits right-aligned on the same line ("2%"); it can
  pass 100% ("105%").
- Bar: fill width `min(total / quota, 1)`. Track `--muted` with a 1px `--input` border (3:1
  boundary). Fill colour by level:
  - below 80%: `--primary`;
  - 80–99%: `--portal-warning`, plus the line below the bar;
  - 100% and over: `--destructive`, plus the line below the bar.
- Level lines (icon + text, never colour alone), shown between the bar and the reset line:
  - 80–99%: `AlertTriangle` in `--portal-warning`: "{pct}% of this month's quota used. Kong starts
    rejecting calls at {quota}."
  - ≥100%: `AlertOctagon` in `--destructive`: "This app has reached its monthly quota. Kong may
    answer calls with 429 until 1 Dec 2026, 00:00 UTC."
- Reset line (`--muted-foreground`, `--portal-text-sm`): "Resets {d Mon yyyy}, 00:00 UTC" from
  `period.resetsAt`, always formatted in UTC.
- Status counts: a `<dl>` of three tiles (`Card` inside the card, `--muted` background, no shadow).
  Term: the class in `--portal-font-mono` plus a word — "2xx Success", "4xx Client errors",
  "5xx Server errors". Value: the count, `--portal-text-lg`, weight 600.
  A fourth tile "Other (1xx, 3xx)" appears only when `byStatus.other > 0`. Tiles never use colour
  to signal good/bad; they are neutral.
- Hint under the tiles: "4xx includes 429 answers from Kong when a limit is reached."
- No quota (`quota: null`): count line reads "**{total}** calls"; no bar, no percentage. Badge
  `variant="secondary"`: "No monthly limit". Reset line still shows (the count still resets).
- Primary action: none. The card is read-only for every role.

### States

| State | Condition | What shows |
| --- | --- | --- |
| Loading | First fetch pending | Card with heading, a `Skeleton` line for the count, a skeleton bar and three skeleton tiles. `aria-busy="true"` on the card. Never "0". |
| Success | `status: ok` | As in the wireframe. |
| Empty (no calls) | `ok`, `total: 0` | "0 of 1,000 calls", empty bar, tiles at 0, and below the reset line: "No calls yet this month. Calls made with this app's key show up here within a minute." |
| Near limit | `ok`/`behind`, 80–99% | Warning fill and line (above). |
| Over limit | `ok`/`behind`, ≥100% | Destructive fill at 100% width and line (above). The count keeps rising past the quota. |
| No monthly limit | `quota: null` | Count, "No monthly limit" badge, no bar. |
| Behind, with data | `status: behind`, `lastUpdatedAt` set | Counts, bar and tiles exactly as stored, plus an `Alert` (warning: `--portal-warning-subtle` background, `--portal-warning` icon `Clock` and title) above the count: title "Usage may be behind"; text "The portal last received usage from Kong {relative} ({absolute UTC}). These are the last counts it has. New calls will show up when Kong reconnects." The updated line reads "Last updated {relative}". |
| Behind, never received | `status: behind`, `lastUpdatedAt: null` | Same alert with text "The portal hasn't received any usage from Kong yet. Calls will show up here once Kong starts reporting them." No count, no percentage and no tiles (the stored zero is missing data, AC 6); the bar shows the empty track only with `aria-valuetext="Usage not received yet"`. Reset line stays. |
| Unavailable: gateway | `status: unsupported` | Card heading, then `Info` icon + "Usage isn't available for this gateway." and hint "The connected gateway doesn't report calls to the portal." No bar, no numbers, no "0". |
| Unavailable: not set up | `status: not-configured` | Same first line "Usage isn't available for this gateway." with hint "Usage collection isn't set up on this portal. Ask your portal admin." |
| Error | Network error or 5xx on the usage request | `Alert` (destructive) inside the card: "Couldn't load usage. Your calls are still counted." Button **Try again** (`variant="outline"`). The rest of the app page works. |
| No permission | 404 / 401 | The usage request uses the same membership rule as the app itself, so the app page already shows its own not-found or sign-in redirect; the card never renders with counts. If only the usage call returns 404 (race with removal from the team), the card shows "You no longer have access to this app." with a link **Back to My apps**. |

Background refetches (60 s interval, window focus) keep the current numbers on screen while
loading and replace them silently. A failed background refetch keeps the last numbers and adds
nothing unless it fails three times in a row, then shows the Error alert above the numbers (the
numbers stay).

## 3. Screen: Admin — Insights `/admin/insights`

### Purpose
Show the admin whether the portal is adopted and whether onboarding meets the under-10-minutes
time-to-first-call promise.

### Navigation
- New tab **Insights** in `AdminNav` items, after **Requests**:
  `['/admin/insights', 'Insights']`. It also appears in the narrow-screen "Admin section" select.
- The admin section is reached through the header's **Admin** link, which only admins see, so
  developers have no link to Insights (AC 9).

### Layout

```
1280px
Insights
Last 30 days · 16 Oct – 14 Nov 2026 (UTC)

┌──────────────────────┐ ┌──────────────────────┐ ┌────────────────────────────────┐
│ New sign-ups         │ │ Active apps          │ │ Median time to first call      │
│ 7                    │ │ 12                   │ │ 6 min 12 s   ✓ Within target   │
│ Developer accounts   │ │ With at least one    │ │ Target 10 min · 4 of 7         │
│ created              │ │ call                 │ │ developers                     │
└──────────────────────┘ └──────────────────────┘ └────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────┐
│ Top APIs                                                                         │
│ 1  Payments API   payments          ███████████████████████████████   12,480     │
│ 2  Orders API     orders            ██████████████████                 7,031     │
│ 3  Weather API    weather           ████                               1,204     │
└──────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────┐
│ Time to first call                                                               │
│ New developers, newest first. A first call is a 2xx response with a key the      │
│ developer created.                                                               │
│ ┌──────────────────────┬─────────────────────┬─────────────────────┬───────────┐ │
│ │ Developer            │ Signed up           │ First successful    │ Time to   │ │
│ │                      │                     │ call                │ first call│ │
│ ├──────────────────────┼─────────────────────┼─────────────────────┼───────────┤ │
│ │ Dana Lee             │ 14 Nov 2026, 09:12  │ 14 Nov 2026, 09:18  │ 6 min 4 s │ │
│ │ dana@acme.test       │ UTC                 │ UTC                 │           │ │
│ │ Sam Ortiz            │ 13 Nov 2026, 16:40  │ No call yet         │ —         │ │
│ │ Lee Park             │ 12 Nov 2026, 08:02  │ 12 Nov 2026, 08:31  │ ⚠ 29 min  │ │
│ │                      │                     │                     │ 10 s      │ │
│ └──────────────────────┴─────────────────────┴─────────────────────┴───────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘

375px
Insights
Last 30 days · 16 Oct – 14 Nov 2026 (UTC)
┌───────────────────────────────┐
│ New sign-ups               7  │
├───────────────────────────────┤
│ Active apps               12  │
├───────────────────────────────┤
│ Median time to first call     │
│ 6 min 12 s  ✓ Within target   │
│ Target 10 min · 4 of 7 devs…  │
└───────────────────────────────┘
Top APIs
 1 Payments API        12,480
   payments
 2 Orders API           7,031
   orders
Time to first call
┌───────────────────────────────┐
│ Dana Lee                      │
│ dana@acme.test                │
│ Signed up  14 Nov 2026, 09:12 │
│ First call 14 Nov 2026, 09:18 │
│ Time       6 min 4 s          │
└───────────────────────────────┘
┌───────────────────────────────┐
│ Sam Ortiz …   No call yet     │
└───────────────────────────────┘
```

### Content and rules
- h1 **Insights**. Subtitle (`--muted-foreground`): "Last 30 days · {window.from d Mon} – {window.to
  d Mon yyyy} (UTC)".
- **Stat cards** (`Card`, a `<dl>` row; 3 columns at ≥1024px, 1 column below 768px, 2+1 between):
  - "New sign-ups": `signups`; caption "Developer accounts created".
  - "Active apps": `activeApps`; caption "With at least one call".
  - "Median time to first call": `medianSeconds` formatted as a duration (§3.1), then a `Badge`:
    - median ≤ `targetSeconds`: success badge, `CheckCircle`, "Within target";
    - median > target: warning badge (`--portal-warning-subtle` / `--portal-warning`),
      `AlertTriangle`, "Over target".
    Caption: "Target {targetSeconds as duration} · {covered} of {total} developers". With
    `medianSeconds: null`: value "No calls yet", no badge, caption "Target 10 min · 0 of {total}
    developers".
- **Top APIs** card (h2): an `<ol>`, up to five rows. Each row: rank, `name` (link to
  `/admin/apis/{slug}`), `slug` in mono `--muted-foreground`, a relative bar (`calls / topApis[0].calls`,
  `--primary` fill on `--muted`, `aria-hidden="true"`, decorative only), and `calls` right-aligned
  with thousands separators and the word "calls" visually hidden ("12,480 calls" for screen readers).
  Empty (`topApis` is `[]`): `BarChart3` icon + "No calls yet" + hint "APIs appear here once
  developers call them through Kong."
- **Time to first call** card (h2) with the intro text in the wireframe. `Table` columns:
  Developer (`name`, then `email` in `--muted-foreground` on the next line), Signed up
  (`signedUpAt`), First successful call (`firstCallAt` or "No call yet" in `--muted-foreground`),
  Time to first call (duration, or "—" with a visually hidden "No call yet").
  - Over-target rows (`secondsToFirstCall > targetSeconds`): `AlertTriangle` in
    `--portal-warning` before the duration and a visually hidden "over the 10-minute target".
  - Times: "d Mon yyyy, HH:mm UTC" in `<time datetime>`.
  - Order as returned (newest sign-up first); no client-side sorting in this spec.
  - When `developers.length < total`: footnote "Showing the {developers.length} newest of {total}
    developers."
  - Empty (`total: 0`): `UserPlus` icon + "No developers signed up in the last 30 days."
- Primary action: none (read-only page).

### 3.1 Duration format
Floor to whole units, show at most two:
- under 60 s: "45 s";
- under 1 h: "6 min 12 s" ("6 min" when seconds are 0);
- under 24 h: "3 h 5 min";
- otherwise: "2 d 4 h".
Wrap in `<time datetime="PT6M12S">` (ISO 8601 duration). The same formatter is used for the
median and the target ("10 min").

### States

| State | Condition | What shows |
| --- | --- | --- |
| Loading | Fetch pending | h1 and subtitle skeleton, three skeleton stat cards, a skeleton list of 5 rows, a skeleton table of 5 rows. `aria-busy="true"` on `<main>`. |
| Success | 200, `status: ok` | As in the wireframe. |
| No calls | `activeApps: 0`, `topApis: []` | Active apps "0"; Top APIs "No calls yet"; median "No calls yet"; developer rows show "No call yet". Not an error (AC 7). |
| No sign-ups | `total: 0` | Sign-ups "0", median "No calls yet", table empty state. Top APIs may still list calls from older developers. |
| Behind | `status: behind` | Everything as returned, plus a warning `Alert` under the subtitle: `Clock` icon, title "Usage may be behind", text "The portal last received usage from Kong {relative} ({absolute UTC}). Check that Kong can reach the server at `PORTAL_USAGE_INGEST_URL`." With `lastUpdatedAt: null`: "The portal hasn't received any usage from Kong yet. Check that Kong can reach the server at `PORTAL_USAGE_INGEST_URL`." |
| Unavailable: gateway | `status: unsupported` | Info `Alert` under the subtitle: "Usage isn't available for this gateway." / "The connected gateway doesn't report calls, so active apps, top APIs and time to first call can't be shown." Sign-ups card shows `signups`; Active apps and Median cards show "Not available" (`--muted-foreground`), not 0; Top APIs card body "Not available for this gateway."; table rows show name, email and Signed up, with First call and Time cells "Not available". |
| Unavailable: not set up | `status: not-configured` | Same as above with text "Usage collection isn't set up. Connect a Kong gateway and set `PORTAL_USAGE_INGEST_URL` on the server." and a link **Go to Gateways** (`/admin/gateways`). |
| Error | Network error or 5xx | Destructive `Alert`: "Couldn't load insights." Button **Try again**. No stale numbers. |
| No permission | 403 | No admin nav, no data. `Card` with `Lock` icon, h1 "You don't have access to Insights", text "Insights are only for portal admins.", button **Go to My apps** (`/dashboard`). In demo mode the button reads **Back to the APIs** (`/`). |
| Signed out | 401 | Existing redirect to `/sign-in?next=/admin/insights`. |

The page fetches once on load; there is no auto-refresh. A **Refresh** is the browser reload.

## 4. Components
Reuse shadcn/ui: `Card`, `Badge`, `Alert`, `Skeleton`, `Table`, `Button`. Icons from
`lucide-react`: `AlertTriangle`, `AlertOctagon`, `Clock`, `Info`, `CheckCircle`, `BarChart3`,
`UserPlus`, `Lock`.

New components (in `apps/portal`, not `packages/ui`, until a second screen needs them):

### `UsageMeter`
| Prop | Type | Notes |
| --- | --- | --- |
| `value` | `number` | Calls this month (`total`). |
| `max` | `number` | `quota`. Not rendered when the quota is null. |
| `label` | `string` | Accessible name, "Calls this month". |

- Renders a `div role="meter"` with `aria-label`, `aria-valuemin="0"`, `aria-valuemax={max}`,
  `aria-valuenow={min(value, max)}` and `aria-valuetext`: "{value} of {max} calls, {pct}%" or,
  at ≥100%, "{value} of {max} calls, monthly quota reached".
- Variants by level: `default` (<80%), `warning` (80–99%), `danger` (≥100%) → fill
  `--primary`, `--portal-warning`, `--destructive`. Height 8px, radius `--radius`, track
  `--muted` with 1px `--input` border.
- Width transitions use `--portal-duration` (0 ms under reduced motion).

### `StatTile`
| Prop | Type | Notes |
| --- | --- | --- |
| `term` | `ReactNode` | "4xx Client errors", "New sign-ups". |
| `value` | `ReactNode` | Number, duration or "Not available". |
| `caption` | `ReactNode?` | Optional line under the value. |
| `badge` | `ReactNode?` | Optional `Badge` next to the value. |

Renders a `<div>` containing `<dt>` and `<dd>` (inside a parent `<dl>`). Used by the usage card
(neutral, `--muted` surface) and the Insights stat cards (`Card` surface).

### `formatDuration(seconds)` and `formatUtc(date)`
Shared helpers for §3.1 and "d Mon yyyy, HH:mm UTC". Always format in UTC, never the browser zone.

## 5. Copy (exact)

| Where | Copy |
| --- | --- |
| Usage card heading | Usage this month |
| Updated | Updated {relative} / Last updated {relative} (behind) |
| Count | {total} of {quota} calls · {total} calls |
| No limit badge | No monthly limit |
| Reset | Resets {d Mon yyyy}, 00:00 UTC |
| Status terms | 2xx Success · 4xx Client errors · 5xx Server errors · Other (1xx, 3xx) |
| Hint | 4xx includes 429 answers from Kong when a limit is reached. |
| No calls | No calls yet this month. Calls made with this app's key show up here within a minute. |
| 80% | {pct}% of this month's quota used. Kong starts rejecting calls at {quota}. |
| 100% | This app has reached its monthly quota. Kong may answer calls with 429 until {d Mon yyyy}, 00:00 UTC. |
| Behind title | Usage may be behind |
| Behind text (dev) | The portal last received usage from Kong {relative} ({absolute}). These are the last counts it has. New calls will show up when Kong reconnects. |
| Behind, never (dev) | The portal hasn't received any usage from Kong yet. Calls will show up here once Kong starts reporting them. |
| Unavailable | Usage isn't available for this gateway. |
| Unsupported hint (dev) | The connected gateway doesn't report calls to the portal. |
| Not set up hint (dev) | Usage collection isn't set up on this portal. Ask your portal admin. |
| Card error | Couldn't load usage. Your calls are still counted. · **Try again** |
| Lost access | You no longer have access to this app. · **Back to My apps** |
| Admin tab / h1 | Insights |
| Subtitle | Last 30 days · {from} – {to} (UTC) |
| Stat terms | New sign-ups · Active apps · Median time to first call |
| Stat captions | Developer accounts created · With at least one call · Target 10 min · {covered} of {total} developers |
| Median badges | Within target · Over target |
| Top APIs | Top APIs · No calls yet · APIs appear here once developers call them through Kong. |
| Table heading | Time to first call |
| Table intro | New developers, newest first. A first call is a 2xx response with a key the developer created. |
| Table columns | Developer · Signed up · First successful call · Time to first call |
| No first call | No call yet |
| Cap footnote | Showing the {n} newest of {total} developers. |
| No sign-ups | No developers signed up in the last 30 days. |
| Behind (admin) | The portal last received usage from Kong {relative} ({absolute}). Check that Kong can reach the server at `PORTAL_USAGE_INGEST_URL`. |
| Unsupported (admin) | The connected gateway doesn't report calls, so active apps, top APIs and time to first call can't be shown. |
| Not set up (admin) | Usage collection isn't set up. Connect a Kong gateway and set `PORTAL_USAGE_INGEST_URL` on the server. · **Go to Gateways** |
| Not available value | Not available |
| Insights error | Couldn't load insights. · **Try again** |
| 403 | You don't have access to Insights · Insights are only for portal admins. · **Go to My apps** |

## 6. Accessibility (WCAG 2.2 AA)
- **Usage card**: a `<section aria-labelledby>` on its h2. Reading order: heading → updated
  time → alert (if any) → count line → meter → level line → reset line → status `<dl>` → hint.
  No focusable elements except **Try again** / links in error states. The meter is not focusable.
- Background refetches do not move focus and are not announced. A change of level (crossing 80%
  or 100%) or entering `behind` is announced once through a polite live region on the level/alert
  line. Initial load announces nothing.
- **Insights**: landmarks — admin nav (`aria-label="Admin section"`, Insights tab has
  `aria-current="page"`), `<main>` with h1, three h2 sections. Keyboard path: header → admin tabs →
  Top API links → (table has no controls) → Try again / Go to Gateways when present.
- Table: real `<table>` with `<caption>` "Time to first call" (visually hidden, the h2 is visible)
  and `<th scope="col">`; the developer cell is `<th scope="row">`. At 375px each row is an
  `<article>` with a `<dl>`; same content order.
- Status never by colour alone: level lines, badges and over-target rows all carry an icon and
  words (or visually hidden words). Icons are `aria-hidden="true"`.
- Contrast: text tokens as listed in tokens.md (all ≥4.5:1). Meter fills (`--primary` 6.7:1,
  `--portal-warning` 7.1:1, `--destructive` 6.5:1) and the track's `--input` border (4.8:1) meet
  3:1 against `--card`. The Top APIs bars are decorative (the number is the content).
- Numbers and percentages are text, so they zoom to 200% and reflow without loss.
- The 403 state moves focus to its h1 on render.
- Reduced motion: no meter width animation, skeletons don't pulse.

## 7. Responsive behaviour
| | 375px | 1280px |
| --- | --- | --- |
| Usage card | Full width; updated line under the heading; status counts as a stacked list (term left, value right); level and behind text wrap | Updated line right of the heading; status counts as 3–4 tiles in a row |
| Insights stats | One column, a single `Card` with dividers | Three cards in a row |
| Top APIs | Name and calls on one line, slug below; relative bar hidden | Rank, name, slug, bar and calls on one row |
| Developer list | One `Card` per developer with a `<dl>` | Four-column table |
| Admin nav | Existing "Admin section" select (includes Insights) | Existing tabs (Insights after Requests) |

Long names and emails wrap (`overflow-wrap: anywhere`); no horizontal scroll at 375px.

## 8. Demo mode (AC 11)
No demo-specific UI. The visitor's app page shows the same usage card. The visitor has no Admin
link, and `/admin/insights` shows the 403 state with **Back to the APIs**.
