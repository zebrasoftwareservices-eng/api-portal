# 026 — Trace waterfall for one API call on Kong: UX design

Spec: [026-trace-waterfall-kong](../specs/026-trace-waterfall-kong.md). Contract: tag `tracing` in
`apps/server/openapi.yaml` (`Tracing`, `TracingSettingsInput`, `TracingTestResult`,
`TracingSelection`, `TracingDeveloper`, `Trace`, `TraceSpan`). Tokens: [tokens.md](tokens.md).
No new tokens.

One surface: a new admin page **Tracing** (`/admin/tracing`), a tab in the admin section nav
right after **Insights**, shown only to `role === 'admin'` (same rule as Insights and Theme). It
holds three cards, top to bottom:

1. **Kong settings**: what the Kong node needs, the last Test and the apply status.
   **Turn on tracing** / **Edit settings** opens the settings dialog.
2. **What's traced**: the selections (APIs, developers, teams), add and remove.
3. **Latest traced call**: the summary line and the waterfall, polled every 3 s.

Span labels come from the server's `TraceSpan.label`, which `classifySpan` derives from Kong 3.9
names (`kong` → request, `kong.router` → router, `kong.<phase>.plugin.<name>` → plugin,
`kong.balancer` → upstream, anything else → other). The UI never parses span names to decide a
label. It shows the raw `name` only as secondary text.

## 1. User flows

### 1.1 Admin turns tracing on and sees a first trace (AC 1, 3, 4, 6)
1. Admin opens **Admin** → **Tracing**.
2. The page loads `GET /v1/admin/tracing`. `configured: false`, so the Kong settings card shows
   "Tracing is off" with **Turn on tracing**; the other two cards explain they wait for it.
3. Admin clicks **Turn on tracing**. The dialog opens with the two Kong node settings named
   (`tracing_instrumentations`, `tracing_sampling_rate`), their `KONG_TRACING_*` variables, the
   restart note, and three fields prefilled from `Tracing.settings` (the quickstart values).
4. Admin clicks **Test**. Within 15 s the dialog shows "Test passed" with the values Kong reports.
5. Admin clicks **Save and turn on** (`PUT /v1/admin/tracing`). The dialog closes; a toast says
   "Tracing settings saved". The Kong settings card now shows the settings summary and
   "Test passed".
6. In **What's traced**, admin picks **API** → "Sample API" → **Add**
   (`POST /v1/admin/tracing/selections`). The row appears; the Kong settings card shows
   "Applying to Kong…", then "Applied to Kong".
7. A developer (or the admin) makes a try-it call to the sample API.
8. Within a few seconds, **Latest traced call** fills in: `GET /orders`, `200 OK`, `38.4 ms`,
   and the waterfall with the slowest step marked. A screen reader hears
   "New traced call: GET /orders, 200, 38.4 milliseconds".

### 1.2 Test fails, admin fixes Kong (AC 5)
1. In the dialog, admin clicks **Test**. Within 15 s a failure alert names the cause
   (§4.4) and what to do.
2. Admin fixes the cause (sets the variable and restarts Kong, or corrects the endpoint) and clicks
   **Test** again until it passes.
3. If the admin needs to save first (for example to restart Kong next), **Save** stays enabled
   with a warning (default 3, §7).

### 1.3 Admin narrows or widens what's traced (AC 1)
1. In **What's traced**, admin chooses a kind (**API**, **Developer**, **Team**), picks a target in
   the search box and clicks **Add**.
2. To stop tracing one, admin clicks **Stop tracing** on its row
   (`DELETE /v1/admin/tracing/selections/{id}`). The row disappears at once and the apply status
   shows "Applying to Kong…".

### 1.4 Admin reads a slow call (AC 6)
1. Admin looks at **Latest traced call**. The line above the waterfall says which step was slowest
   and its share of the call: "Slowest: key-auth plugin — 21.0 ms, 55% of the call".
2. The bars show where it sits in time. Plugin rows show the plugin name; upstream rows say
   "Upstream try".
3. The next traced call replaces the view. The card says so, so nobody hunts for history.

### 1.5 Non-admin reaches `/admin/tracing` (AC 9)
1. A developer types the URL. Their header has no Admin link; the admin nav renders no Tracing tab.
2. The server answers 403. The page shows the no-permission state and requests nothing else.
3. A signed-out visitor (401) is sent to sign-in and returned to `/admin/tracing` after.

## 2. Screen: Tracing page (`/admin/tracing`)

### Purpose
Turn Kong tracing on for exactly the calls the admin cares about, and see where the time of the
latest such call went.

### Layout — 1280px (configured, with a trace)

```
┌ Admin ─ APIs  Products  Requests  Insights  [Tracing]  Gateways  Mail  Accounts  Theme ─────┐

 Tracing                                                                              (h1)
 See where the time of one API call goes: Kong, each plugin, or your upstream.

┌ Kong settings ──────────────────────────────────────────────────────── [Edit settings] ┐
│ Trace endpoint   http://server:4000/api/v1/internal/traces/kong                        │
│ Instrumentations request, router, balancer, plugin_rewrite, plugin_access,             │
│                  plugin_header_filter                                                  │
│ Sampling rate    1 (every call)                                                        │
│                                                                                        │
│ ✓ Test passed · 2 min ago            ✓ Applied to Kong · 1 min ago                     │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌ What's traced ─────────────────────────────────────────────────────────────────────────┐
│ Calls that match any of these are traced. A call that matches more than one is traced  │
│ once.                                                                                  │
│                                                                                        │
│ [ API       ▾ ] [ Search APIs…                              ▾ ]  [ Add ]               │
│                                                                                        │
│  Kind        Name                               Covers                                 │
│  API         Sample API                         Every call to this API    [Stop tracing]│
│  Developer   Ada Lovelace · ada@example.com     2 apps they created       [Stop tracing]│
│  Team        Payments                           3 team apps               [Stop tracing]│
└────────────────────────────────────────────────────────────────────────────────────────┘

┌ Latest traced call ─────────────────────────────────────── Received 12 seconds ago ┐
│ Only the latest call is kept. The next traced call replaces this one.              │
│                                                                                    │
│ GET  /orders/42        ✓ 200 OK        38.4 ms total      API: Sample API          │
│ Trace ID 4bf92f3577b34da6a3ce929d0e0e4736  [Copy]                                  │
│                                                                                    │
│ ⚠ Slowest: key-auth plugin — 21.0 ms, 55% of the call                              │
│                                                                                    │
│ Step                         Start     Duration  0 ms     10      20      30   38.4│
│ ────────────────────────────────────────────────────────────────────────────────── │
│ Request          kong          0.0 ms   38.4 ms  ████████████████████████████████ │
│  Router    kong.router         0.2 ms    0.3 ms  ▏                                 │
│  Plugin    key-auth            0.6 ms   21.0 ms   ██████████████████  ⚠ Slowest    │
│            kong.access.plugin.key-auth                                             │
│  Plugin    rate-limiting      21.7 ms    2.1 ms                    ██              │
│            kong.access.plugin.rate-limiting                                        │
│  Upstream  Upstream try       24.0 ms   13.9 ms                      ████████████  │
│            kong.balancer                                                           │
│  Plugin    cors               37.9 ms    0.2 ms                                 ▏  │
│            kong.header_filter.plugin.cors                                          │
│                                                                                    │
│ Checks for a new call every 3 seconds.                                             │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Content column is `--portal-page-max-width`. Cards stack with 24px between them.

### Layout — 375px

```
┌──────────────────────────────┐
│ Tracing                 (h1) │
│ See where the time of one    │
│ API call goes…               │
│ ┌ Kong settings ───────────┐ │
│ │ Trace endpoint           │ │
│ │ http://server:4000/api/… │ │  (mono, wraps at any character)
│ │ Instrumentations         │ │
│ │ request, router, …       │ │
│ │ Sampling rate            │ │
│ │ 1 (every call)           │ │
│ │ ✓ Test passed · 2 min ago│ │
│ │ ✓ Applied to Kong        │ │
│ │ [ Edit settings        ] │ │  (full width)
│ └──────────────────────────┘ │
│ ┌ What's traced ───────────┐ │
│ │ [ API              ▾ ]   │ │
│ │ [ Search APIs…     ▾ ]   │ │
│ │ [ Add                  ] │ │
│ │ ─────────────────────────│ │
│ │ API                      │ │
│ │ Sample API               │ │
│ │ Every call to this API   │ │
│ │ [ Stop tracing ]         │ │
│ │ ─────────────────────────│ │
│ │ Developer …              │ │
│ └──────────────────────────┘ │
│ ┌ Latest traced call ──────┐ │
│ │ Received 12 seconds ago  │ │
│ │ Only the latest call is  │ │
│ │ kept…                    │ │
│ │ GET /orders/42           │ │
│ │ ✓ 200 OK · 38.4 ms total │ │
│ │ API: Sample API          │ │
│ │ ⚠ Slowest: key-auth      │ │
│ │ plugin — 21.0 ms, 55%    │ │
│ │ 0 ms            38.4 ms  │ │
│ │ Request          38.4 ms │ │
│ │ ████████████████████████ │ │
│ │ Plugin key-auth  21.0 ms │ │
│ │ ⚠ Slowest · starts 0.6 ms│ │
│ │  ███████████████         │ │
│ │ Upstream try     13.9 ms │ │
│ │ starts 24.0 ms           │ │
│ │               ██████████ │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

Below 768px each span is two lines: label, display name and duration on the first; the bar on a
full-width track on the second. The start offset moves into the first line's metadata
("starts 0.6 ms"). The raw Kong span name is hidden (still in the row's accessible name). Indent
for depth is 8px per level, capped at 2 levels. The axis shows only `0 ms` and the total.

## 3. Card: Kong settings

### Purpose
Show what tracing is set to, whether the last Test passed and whether Kong has the plugins.

### Content
- Definition list: **Trace endpoint** (`settings.traceEndpoint`, mono), **Instrumentations**
  (`settings.instrumentations` joined with ", ", mono), **Sampling rate** (`settings.samplingRate`
  plus a plain gloss: `1` → "(every call)", `0` → "(no calls)", otherwise "(about N% of calls)").
- Status line, two items, each icon + word (never colour alone):
  - Last Test from `lastTest`: passed → `CheckCircle2` `--portal-success` "Test passed · {relative
    at}"; failed → `XCircle` `--destructive` "Last test failed: {short cause} · {relative at}"
    (short causes in §4.4); null → `CircleDashed` `--muted-foreground` "Not tested yet".
  - Apply from `apply`: `pending` → `Loader2` (spins unless reduced motion) "Applying to Kong…";
    `applied` → `CheckCircle2` "Applied to Kong · {relative at}"; `failed` → `Alert` (destructive)
    below the status line: title "Kong didn't take the tracing plugins", body `apply.message`
    as given, then "The portal retries automatically. Fix the cause, then wait a minute or
    change a selection to retry now."
- Primary action: **Edit settings** (secondary button) when configured; **Turn on tracing**
  (primary button) when not.
- While `apply.status === 'pending'`, refetch `GET /v1/admin/tracing` every 3 s; stop when it
  changes.

### Not configured
Card body: "Tracing is off. Kong sends the portal a trace of each selected call once its node
has tracing turned on and the portal has the address Kong can reach it at." Button
**Turn on tracing**.

## 4. Dialog: Turn on tracing / Tracing settings

shadcn `Dialog` (max width `--portal-form-max-width`), full-screen below 768px with a sticky
footer. Title **Turn on tracing** when `configured: false`, **Tracing settings** otherwise.

### Layout — 1280px

```
┌ Turn on tracing ─────────────────────────────────────────────── [×] ┐
│ Kong only traces calls when tracing is on for the whole node. Set    │
│ these two node settings to match the fields below, then restart the  │
│ Kong node — Kong reads them only at start.                           │
│                                                                      │
│ ┌ muted code block ────────────────────────────────────── [Copy] ┐  │
│ │ KONG_TRACING_INSTRUMENTATIONS=request,router,balancer,...       │  │
│ │ KONG_TRACING_SAMPLING_RATE=1                                    │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│ In kong.conf: tracing_instrumentations and tracing_sampling_rate.    │
│                                                                      │
│ Trace endpoint                                                       │
│ [ http://server:4000/api/v1/internal/traces/kong                 ]   │
│ The portal's trace address as Kong reaches it. Inside Docker this is │
│ the server's service name, not localhost.                            │
│                                                                      │
│ Instrumentations                                                     │
│ [x] request (required)  [x] router         [x] balancer              │
│ [x] plugin_rewrite      [x] plugin_access  [x] plugin_header_filter  │
│ ▸ More options (all, db_query, dns_query, http_client, off)          │
│ db_query, dns_query and http_client add many spans; leave them off   │
│ unless you need them.                                                │
│                                                                      │
│ Sampling rate                                                        │
│ [ 1      ]  Share of calls Kong traces, 0 to 1. Use 1 to trace every │
│             selected call.                                           │
│                                                                      │
│ ┌ test result region (§4.3, §4.4) ────────────────────────────────┐ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│                       [ Cancel ]  [ Test ]  [ Save and turn on ]     │
└──────────────────────────────────────────────────────────────────────┘
```

### Fields (`TracingSettingsInput`)
| Field | Control | Prefill | Validation (client mirrors 400 field errors) |
| --- | --- | --- | --- |
| `traceEndpoint` | `Input type="url"`, mono, 16px | `settings.traceEndpoint` | Required; http(s); no credentials, query or fragment. "Enter an http or https address without a query string, for example http://server:4000/api/v1/internal/traces/kong." |
| `instrumentations` | `Checkbox` group (fieldset + legend). Six default boxes visible; `all`, `db_query`, `dns_query`, `http_client`, `off` under a `Collapsible` "More options" | `settings.instrumentations` | At least one. Checking `off` or `all` clears and disables the others (Kong treats them as whole-node values). If `request` and `all` are both unchecked, inline warning: "Without request, Kong records no root span and the Test will fail." |
| `samplingRate` | `Input type="number"` min 0 max 1 step 0.01, `inputmode="decimal"` | `settings.samplingRate` | 0–1. "Enter a number from 0 to 1." Below 1, hint: "Kong will trace about {N}% of selected calls, so a single test call may not show up." |

The code block is generated from the current field values and updates as they change. **Copy**
copies both lines; its label changes to "Copied" for 2 s and `aria-live` announces "Copied".

### 4.1 Actions
- **Test** (secondary) → `POST /v1/admin/tracing/test` with the current field values. Does not
  save.
- **Save and turn on** (first save) / **Save** (later) (primary) → `PUT /v1/admin/tracing`. On 200:
  close, toast "Tracing settings saved", refetch `Tracing`. If the endpoint changed, the card shows
  "Applying to Kong…".
- **Cancel** / `×` / Esc: close without saving. If a Test is running, it is abandoned (the result is
  ignored).

### 4.2 Testing
Button reads "Testing…" with a spinner and `aria-busy`; all fields and **Save** are disabled.
Result region shows `role="status"`: "Checking Kong. This can take up to 15 seconds."

### 4.3 Test passed (200 `TracingTestResult`)
`Alert` success, `CheckCircle2`:
- Title: "Test passed"
- Body: "Kong delivered a test trace to the portal."
- "Kong reports: instrumentations {node.instrumentations joined}, sampling rate
  {node.samplingRate ?? 'not reported'}." (mono values)
- Each `warnings[]` item, as given, in a list under a `--portal-warning` `AlertTriangle` "Note".

If any field changes after a result, the region adds a muted line: "You changed a value since this
test. Test again to check the new values." (The stale result stays visible.)

### 4.4 Test failed (422 `tracing-check-failed`)
`Alert` destructive, `XCircle`, `role="alert"`. Title "Test failed: {short cause}". Body per
`cause` (one distinct message each, AC 5). `{endpoint}` is the entered value, mono.

| `cause` | Short cause | Body |
| --- | --- | --- |
| `tracing-off` | tracing is off on the Kong node | "The Kong node reports tracing_instrumentations as {node.instrumentations or 'off'}. Set KONG_TRACING_INSTRUMENTATIONS to include request (the block above has the full line), restart the Kong node, then test again." |
| `endpoint-unreachable` | Kong can't reach the trace endpoint | "Kong took the test call but no trace reached {endpoint} within 10 seconds. Check that Kong can reach this address. From a Kong container, localhost means Kong itself; use the portal server's service name." |
| `gateway-unreachable` | the portal can't reach Kong | "The Kong Admin API didn't answer. Check that Kong is running and that the address on the Gateways page is right." Link **Open Gateways** (`/admin/gateways`). |
| `proxy-unreachable` | the portal can't reach Kong's proxy | "The portal couldn't send a test call through Kong's proxy. Check KONG_PROXY_INTERNAL_URL on the portal server." |
| `gateway-rejected` | Kong refused the test plugin | "Kong refused the opentelemetry plugin. Make sure KONG_PLUGINS includes it (bundled does), then test again." |
| other / missing | the check didn't finish | "{problem.detail}" if present, else "Something went wrong on the portal server. Try again." |

Other Test responses:
- 409 `tracing-unsupported`: destructive alert "Tracing works only with a Kong gateway. The
  connected gateway doesn't support it." **Test** and **Save** disabled.
- 429: warning alert "Too many tests in a short time. Wait a minute, then test again." **Test**
  disabled for 60 s with a visible countdown "Test (52 s)".
- Network failure / 5xx: destructive alert "The portal server didn't answer. Check your connection
  and try again."

### 4.5 Saving after a failed or missing Test (default 3)
When the last Test in this dialog failed (or none ran), a `--portal-warning` notice sits right above
the footer: "The test hasn't passed with these values. You can still save, for example to restart
Kong next, but no traces will arrive until the test passes." **Save** stays enabled.

If the server enforces a passing Test (`TRACING_REQUIRE_PASSING_TEST = true`), `PUT` answers 409
`tracing-test-required`; the notice turns destructive: "Run a test that passes with these values
before saving." The same component renders both; only the copy and tone change.

Other save errors: 400 → field-level messages from the problem's field pointer, focus moves to
the first invalid field; network/5xx → destructive alert in the result region "Couldn't save the
settings. Try again." Dialog stays open with values kept.

## 5. Card: What's traced

### Content
- Intro: "Calls that match any of these are traced. A call that matches more than one is traced
  once."
- Add row: **Kind** `Select` (API, Developer, Team) + **Target** combobox (`Popover` + `Command`) +
  **Add** (primary, disabled until a target is chosen).
  - API: options from `GET /v1/admin/apis` (name, slug in mono beneath). Placeholder "Search APIs…".
  - Developer: `GET /v1/admin/tracing/developers?q=` debounced 250 ms, from the first character;
    option "name · email". Placeholder "Search by name or email…". Empty: "No developer matches
    '{q}'."
  - Team: options from `GET /v1/admin/teams`. Placeholder "Search teams…".
  - Targets already selected show as disabled options with "Already traced".
- List: shadcn `Table` at ≥768px (Kind, Name, Covers, action); a stacked list below.
  - Kind: `Badge` outline "API" / "Developer" / "Team".
  - Name: `selection.label`.
  - Covers (from `kind` and `apps`): API → "Every call to this API"; developer → "{apps} app(s) they
    created" (0 → "No active apps yet; calls start being traced when they create one");
    team → "{apps} team app(s)" (0 → "No active apps yet").
  - Action: **Stop tracing** (ghost button), `aria-label="Stop tracing {label}"`. No confirm
    dialog: re-adding is one step. Toast "Stopped tracing {label}" on 204.

### States
| State | Shown |
| --- | --- |
| Not configured | Add row disabled; body "Turn on tracing first. Then choose the APIs, developers or teams to trace." |
| Configured, no selections | Add row; body "Nothing is traced yet. Add an API, a developer or a team." |
| Adding | **Add** shows spinner; on 201 the row appears at the top and the combobox clears; focus returns to the combobox |
| 200 (already existed) | Toast "{label} is already traced." No duplicate row |
| 404 | Inline error under the add row: "That {API/developer/team} no longer exists. Pick another." Options refetch |
| 409 `tracing-not-configured` | Inline error "Turn on tracing first." with **Turn on tracing** link opening the dialog |
| Remove 404 | Row removed anyway; no error (it was already gone) |
| Remove / add network failure | Inline destructive text under the add row: "Couldn't update what's traced. Try again." Removed row is restored |

The developer "Covers" copy is the one place default 2 shows (§7).

## 6. Card: Latest traced call

### Data
`GET /v1/admin/tracing/latest` → `{trace}`. Poll every 3 s while the document is visible; pause on
`visibilitychange` hidden; fetch at once when visible again. Only re-render the waterfall when
`traceId` or `receivedAt` changes.

### Summary block
- Header right: "Received {relative receivedAt}" (`<time datetime>` with the absolute UTC time in a
  `Tooltip`), refreshed every 10 s.
- Note (muted): "Only the latest call is kept. The next traced call replaces this one."
- Request line: method (`Badge` mono) + `request.path` (mono, wraps), status badge, total, API.
  - Status: 2xx `CheckCircle2` success "200 OK"; 3xx neutral "304 Not Modified"; 4xx
    `AlertTriangle` warning "404 Not Found"; 5xx `XCircle` destructive "502 Bad Gateway". The
    reason phrase comes from a static table; unknown codes show the number only. `statusCode`
    null → "No status".
  - Total: "{durationMs} ms total"; null → "Total not known yet".
  - API: "API: {api.name}" linking to `/admin/apis/{api.slug}`; null → "API: not matched".
- Trace ID: mono, with **Copy** (icon button, `aria-label="Copy trace ID"`).
- Slowest line, only when a span has `slowest: true`: `AlertTriangle` `--portal-warning`
  "Slowest: {display name} {label word} — {durationMs} ms, {pct}% of the call". `pct` is
  `span.durationMs / trace.durationMs`, rounded; omitted when `durationMs` is null. Label words:
  plugin → "plugin", upstream → "" (display name is already "Upstream try"), router → "", other → "step".

### Waterfall (`TraceWaterfall`)
Rows are `spans` in the order the server sends (start, then depth). Depth is computed from
`parentSpanId` for indentation only.

| Column | Content |
| --- | --- |
| Step | Label word (`Badge` secondary: Request, Router, Plugin, Upstream, Other), then the display name: request → "Request", router → "Router", plugin → `plugin`, upstream → "Upstream try", other → `name`. Raw `name` in mono `--muted-foreground` beneath (≥768px), except when it equals the display name |
| Start | `startOffsetMs` formatted (below) |
| Duration | `durationMs` formatted |
| Timeline | A track (`--muted`) the full column width; bar left = `startOffsetMs / axisMs`, width = `durationMs / axisMs`, min 2px. `aria-hidden` |

- `axisMs` = `trace.durationMs`, else (root not arrived) the max of `startOffsetMs + durationMs`.
- Axis header: 5 ticks at 0, 25, 50, 75, 100% of `axisMs` (≥768px); 2 ticks at 375px. Thin
  `--border` gridlines behind the bars.
- Bar fill: root `--muted-foreground`; other spans `--primary`; slowest `--portal-warning`, and the
  row gets a `Badge` "Slowest" with `AlertTriangle` (word + icon). Span `status: 'error'` adds a
  destructive `XCircle` "Error" badge; the bar keeps its fill.
- Number format: < 10 ms → 2 decimals ("0.42 ms"), < 100 ms → 1 decimal ("21.0 ms"), else whole
  ("184 ms"). Same format in the summary, the slowest line and the axis.
- More than 200 spans: show the first 200 and a button **Show all {n} spans**.
- Hover/focus on a row: `--accent` background; a `Tooltip` on the bar repeats
  "{display name}: starts {start}, takes {duration}" for pointer users.
- No animation on bars; new data swaps in place.

### States
| State | Shown |
| --- | --- |
| Loading (first fetch) | `Skeleton` summary line + 5 skeleton rows; no pulse under reduced motion |
| Not configured | Body "Turn on tracing and choose what to trace to see calls here." No polling |
| No selections | Body "Add an API, developer or team above, then make a call." Polling continues |
| Configured, `trace: null` | `Activity` icon, "No traced call yet", "Make a call to a traced API, for example with Try it on the API page. It shows up here within a few seconds." If an API selection exists, link **Open {first API label}** (`/apis/{slug}` when known from the APIs list). Polling continues |
| Partial (`request` or `durationMs` null) | Summary shows what's known; muted line "Kong is still sending this trace. The rest appears in a few seconds." Waterfall uses the fallback axis |
| Trace shown | §6 summary + waterfall; footer "Checks for a new call every 3 seconds." |
| Replaced by a new call | Swaps in place. Polite live region: "New traced call: {method} {path}, {status}, {total} milliseconds." Never announced on unchanged polls |
| Poll error with a trace shown | Keep the trace; warning line in the footer "Can't check for new calls right now. Retrying." Clears on the next success |
| First-fetch error | Destructive alert "Couldn't load the latest trace." + **Try again** |
| Not supported (`supported: false`) | Whole page: §8 |

## 7. Elango's open defaults: where each lives

Each default touches one component, so changing it is a copy or prop change, not a redesign.

1. **One latest trace for the whole portal.** `LatestTraceCard` takes an optional `apiId`. Today
   it is unset. Per-API traces would add an API `Select` ("Show the latest call to: All APIs ▾")
   in the card header's reserved left slot, pass `?apiId=`, and change the note to "Only the
   latest call to each API is kept." The waterfall is unchanged.
2. **A developer account covers the apps that developer created.** Only the "Covers" text in
   §5 and the developer picker hint say so (`coversCopy(kind, apps)`). Switching to team
   membership changes that one function's wording to "{apps} app(s) in their teams".
3. **Saving after a failing Test is allowed.** `SaveGuardNotice` (§4.5) has two tones: warning
   (save allowed) and destructive (409 from the server). The dialog reads the server's answer,
   so flipping `TRACING_REQUIRE_PASSING_TEST` needs no UI change. Optionally the frontend can
   pre-disable **Save** when it sees the 409, with the same copy.

## 8. Page-level states

| State | Trigger | Shown |
| --- | --- | --- |
| Loading | first `GET /v1/admin/tracing` | h1 + three `Skeleton` cards |
| No permission | 403 | No admin nav, no data. `Card` with `Lock` icon, h1 "You don't have access to Tracing", text "Tracing is only for portal admins.", button **Go to My apps** (`/dashboard`) |
| Signed out | 401 | Redirect to `/sign-in?returnTo=/admin/tracing` |
| Not supported | `supported: false` | h1 + one card, `Info` icon, "Tracing isn't available for this gateway", "Trace waterfalls work with Kong gateways. The connected gateway doesn't offer tracing yet." Link **Open Gateways** |
| No gateway connected | `GET` answers the existing no-gateway problem | Same card as other admin pages: "Connect a gateway first" + **Go to Gateways** |
| Load error | network / 5xx | Destructive alert "Couldn't load tracing settings." + **Try again** |
| Demo mode (spec 002) | static demo | Admin nav is hidden in demo mode; the route shows the no-permission state |

## 9. Components

Reused shadcn/ui: `Card`, `Button`, `Dialog` (`Sheet`-like full screen below 768px via the
existing dialog responsive class), `Input`, `Label`, `Checkbox`, `Collapsible`, `Select`,
`Popover` + `Command` (combobox), `Badge`, `Alert`, `Table`, `Skeleton`, `Tooltip`, toast (the
portal's existing toaster). Icons: lucide (`CheckCircle2`, `XCircle`, `AlertTriangle`, `Loader2`,
`CircleDashed`, `Activity`, `Lock`, `Info`, `Copy`).

New:
| Component | Props | Notes |
| --- | --- | --- |
| `TracingSettingsCard` | `tracing: Tracing`, `onEdit()` | §3 |
| `TracingSettingsDialog` | `open`, `tracing: Tracing`, `onOpenChange`, `onSaved()` | §4; owns Test state |
| `TracingTestResult` | `state: idle \| running \| passed(TracingTestResult) \| failed(cause, node, detail) \| rateLimited(retryAt) \| unsupported \| error`, `stale: boolean` | §4.2–4.4 |
| `SaveGuardNotice` | `tone: 'warning' \| 'destructive'` | §4.5 |
| `TracingSelections` | `selections: TracingSelection[]`, `configured: boolean`, `onChange()` | §5 |
| `LatestTraceCard` | `enabled: boolean`, `hasSelections: boolean`, `apiId?: string` | §6; owns polling |
| `TraceWaterfall` | `trace: Trace`, `maxRows = 200` | §6; pure, testable with fixtures |
| `SpanBar` | `offsetPct`, `widthPct`, `variant: 'root' \| 'span' \| 'slowest'` | `aria-hidden`; colours via tokens only |

Admin nav: add `['/admin/tracing', 'Tracing']` after Insights, filtered to admins like Insights
and Theme.

## 10. Copy reference

| Where | Text |
| --- | --- |
| Nav tab | Tracing |
| h1 / lead | Tracing / See where the time of one API call goes: Kong, each plugin, or your upstream. |
| Card titles | Kong settings · What's traced · Latest traced call |
| Buttons | Turn on tracing · Edit settings · Test · Testing… · Save and turn on · Save · Cancel · Copy · Copied · Add · Stop tracing · Show all {n} spans · Try again · Open Gateways · Go to My apps |
| Toasts | Tracing settings saved · Stopped tracing {label} · {label} is already traced. |
| Dialog lead | Kong only traces calls when tracing is on for the whole node. Set these two node settings to match the fields below, then restart the Kong node — Kong reads them only at start. |

All other copy is inline in §3–§8.

## 11. Accessibility (WCAG 2.2 AA)

- **Keyboard path:** tabs → h1 → Kong settings (**Edit settings**) → kind select → target combobox
  → **Add** → each **Stop tracing** → trace ID **Copy** → API link → waterfall rows (each row is
  not focusable; the table is reachable by screen-reader table navigation) → **Show all**.
- **Dialog:** focus trap; initial focus on the Trace endpoint field; order endpoint → Copy →
  checkboxes → More options → sampling rate → Cancel → Test → Save. Esc closes. On close, focus
  returns to the button that opened it. Instrumentations are a `fieldset` with `legend`
  "Instrumentations"; hints tie to fields with `aria-describedby`; errors use `aria-invalid` and
  are in the description.
- **Test results:** running and passed in `role="status"`; failures in `role="alert"`; the
  countdown on 429 is not announced each second (only "You can test again now" when it ends).
- **Waterfall:** a real `<table>` with `<caption>` "Spans of the latest traced call, in start
  order" (visually hidden), `scope="col"` headers. The timeline cell is `aria-hidden`; start and
  duration are real text cells, so nothing is conveyed by bar length alone. Slowest and Error are
  words in badges. Each row's step cell includes the raw span name in visually hidden text at
  375px. Indentation also adds visually hidden "inside {parent display name}" for non-root rows.
- **Live region:** one polite region per page for "New traced call…" and apply changes
  ("Applied to Kong", "Kong didn't take the tracing plugins").
- **Contrast:** bars on `--muted` track: `--primary` and `--muted-foreground` meet 3:1 as
  non-text UI; `--portal-warning` on `--muted` meets 3:1. Badges and status text use the listed
  token pairs. Bars are never the only carrier of information.
- **Targets:** all buttons ≥ 24×24 CSS px (2.5.8); the bar tooltip is supplementary.
- **Reduced motion:** no spinner rotation (static icon + text), no skeleton pulse.

## 12. Responsive summary

| | 375px | 1280px |
| --- | --- | --- |
| Page | Single column, `--portal-page-gutter` 16px | Single column in `--portal-page-max-width` |
| Settings card | Definition list stacks label over value; button full width | Two-column definition list; button in header |
| Dialog | Full screen, sticky footer: Save full width, Test and Cancel above it | Centred, `--portal-form-max-width`, footer right-aligned |
| Selections | Kind, Target, Add stacked full width; rows stacked | Inline add row; table |
| Waterfall | Two lines per span, axis 0 and total, depth capped at 2 | Four columns, 5 ticks, timeline ≈ 55% of the card width |
| Long paths / endpoints | Wrap at any character (`overflow-wrap: anywhere`) | Same; no horizontal page scroll at either width |
