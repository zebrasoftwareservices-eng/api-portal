# 027 — Trace inside Try it: UX design

Spec: [027-trace-inside-try-it](../specs/027-trace-inside-try-it.md). Builds on
[026 — Trace waterfall](026-trace-waterfall-kong.md), whose `TraceWaterfall`, summary line,
number format, status badges and slowest line this design reuses unchanged.

Contract used (nothing else):
- Every `/v1/try-it` response carries `X-Portal-Trace-State` (`traced | off | signed-out | unreachable`);
  a `traced` response also carries `X-Portal-Trace-Id` (32 hex).
- `GET /v1/try-it/traces/{traceId}` (`getTryItTrace`) → `TryItTrace { traceId, state: waiting|ready|missing, issuedAt, trace: Trace|null }`;
  errors 400, 401, 404 (problem+json). For non-admins `plugin` is `null` and `name` equals `label`.
- The panel learns about a response from Scalar's API-client plugin hook `onResponseReceived`.

## 0. Where it lives

The API page (`/apis/{slug}`) embeds Scalar. When Try it returns, Scalar shows the response. The
**Trace** panel (`TryItTracePanel`) renders directly under Scalar's response block, inside the same
Try it client, so the user never scrolls away from the response to find it. One panel per Try it
client; each new response replaces its content.

The panel is a portal React component mounted through the plugin, styled with portal tokens. Its
Scalar mapping (tokens.md) means it matches the reference in light, dark and customer themes.

## 1. User flows

### 1.1 Developer sees the trace of their call (AC 1, 4)
1. Signed-in developer opens an operation on `/apis/{slug}`, picks their key, clicks **Send**.
2. Scalar shows the response as today. Under it the **Trace** panel appears in **Waiting** state:
   "Waiting for the trace from Kong…" with the elapsed seconds.
3. Within a few seconds (polled every 2 s) the panel shows the summary line — method, path (no
   query string), status, "{ms} ms total" — then the slowest line and the waterfall. Plugin rows
   read "Plugin" with no plugin name.
4. The developer reads "Slowest: Upstream try — 184 ms, 82% of the call". Done.

### 1.2 Admin sees plugin names (AC 5)
Same as 1.1. Plugin rows show the plugin name (`key-auth`), and the panel footer has a link
**Open tracing page** (`/admin/tracing`), where the same call is now the latest trace.

### 1.3 Tracing is off (AC 7)
1. User clicks **Send**; the response header says `off`.
2. The panel shows the **Off** message straight away, no spinner, no polling.
3. Admin variant adds **Open tracing settings** → `/admin/tracing`.

### 1.4 No trace arrives (AC 8)
1. State `traced`; panel shows **Waiting** and polls.
2. At 30 s after `issuedAt` the server answers `missing`; the panel shows **No trace arrived**.
3. Admin variant names `tracing_instrumentations` and links to the tracing page to run **Test**.
4. If a late root span arrives, the user can click **Check again** and gets the trace (server turns
   `missing` into `ready`).

### 1.5 Gateway didn't answer (AC 9)
Scalar shows its call error as today. The panel shows **Didn't reach the gateway** straight away.

### 1.6 Signed out (open question 6)
A visitor using Try it with a pasted key sees the response; the panel shows **Sign in to see
traces** with a **Sign in** link that returns to this operation.

### 1.7 Second call (AC 6)
Clicking **Send** again clears the panel to **Waiting** for the new trace id; any in-flight poll
for the old id is cancelled and its result ignored. No history, no list.

## 2. Screen: Trace panel under the Try it response

### Layout — 1280px (trace shown, admin)

```
┌ Response ─────────────────────────────── 200 OK · 212 ms ┐   ← Scalar, unchanged
│ { "id": 42, ... }                                        │
└──────────────────────────────────────────────────────────┘
┌ Trace ───────────────────────────────── Your call only ⓘ ┐
│ GET  /orders/42      ✓ 200 OK    224 ms total            │
│ Trace ID 4bf92f3577b34da6a3ce929d0e0e4736  [⧉]           │
│ ⚠ Slowest: Upstream try — 184 ms, 82% of the call        │
│                                                          │
│ Step                    Start    Duration  0   56  112 168 224 │
│ [Request] Request        0 ms     224 ms   ████████████████    │
│  [Router] Router        0.42 ms   1.20 ms  ▏                   │
│  [Plugin] key-auth      1.80 ms   21.0 ms  ██                  │
│  [Upstream] Upstream try 26.0 ms  184 ms ⚠Slowest  ███████████ │
│                                                          │
│ Only your latest Try it call is kept.  Open tracing page │  ← link admin only
└──────────────────────────────────────────────────────────┘
```

Developer variant: the plugin row reads `[Plugin] Plugin`, and the footer has no link.

### Layout — 375px (trace shown, developer)

```
┌ Trace ──────────── Your call only ⓘ┐
│ GET /orders/42                     │
│ ✓ 200 OK · 224 ms total            │
│ Trace ID 4bf92f35…0e4736 [⧉]       │
│ ⚠ Slowest: Upstream try —          │
│   184 ms, 82% of the call          │
│ Step               0 ──────── 224ms│
│ [Request] Request                  │
│   0 ms · 224 ms   ████████████████ │
│ [Plugin] Plugin                    │
│   1.80 ms · 21.0 ms  ██            │
│ [Upstream] Upstream try ⚠Slowest   │
│   26.0 ms · 184 ms     ███████████ │
│ Only your latest Try it call is    │
│ kept.                              │
└────────────────────────────────────┘
```

### Content
- **Header:** h3 "Trace" (`--portal-text-lg`). Right side: muted "Your call only" with an `Info`
  icon button opening a `Tooltip`/`Popover`: "Only you can see the traces of your Try it calls.
  Each new call replaces the last one."
- **Summary, slowest line, trace ID Copy, waterfall:** exactly spec 026 §6 (status badge words and
  icons, number format, label words, 200-row cap with **Show all {n} spans**). Data: `trace` from
  `TryItTrace`. The API link from 026's summary is omitted (the user is already on that API page).
- **Raw span name** under the display name: admins only (it may contain the plugin name). For
  developers `name` equals `label`, so 026's "hide when equal" rule already hides it.
- **Footer:** muted "Only your latest Try it call is kept." Admin: link **Open tracing page**.
- **Primary action:** none; the panel is read-only. Secondary: **Copy** trace ID.

## 3. States

Panel state comes from `X-Portal-Trace-State`, then from `TryItTrace.state`. Every state keeps the
"Trace" heading so the panel's position doesn't jump.

| State | Trigger | Shown (developer) | Admin difference |
| --- | --- | --- | --- |
| Hidden | No Try it response yet | Nothing rendered | — |
| Off | header `off` | `Info` icon, "Tracing is off for this API", "Your call worked as usual. Calls to this API aren't traced for your account." No spinner, no polling | Body: "Calls to this API aren't in a tracing selection." + link **Open tracing settings** (`/admin/tracing`) |
| Signed out | header `signed-out` | `LogIn` icon, "Sign in to see traces", "Traces are shown only to the person who made the call." Link **Sign in** (`/sign-in?next=` current URL incl. hash) | — |
| Unreachable | header `unreachable` | `XCircle` `--destructive`, "The call didn't reach the gateway", "Kong didn't answer, so there's no trace for this call. Try again in a moment." | Adds "Check that the gateway is running." + link **Open Gateways** (`/admin/gateways`) |
| Waiting | header `traced`, or `state: waiting` | `Clock` icon (static), "Waiting for the trace from Kong… {n} s" (n from `issuedAt`, updated each second visually; not announced). 3 skeleton rows below | — |
| Partial | `state: waiting` with `trace` non-null (spans but no root yet) | 026 summary with what's known + muted "Kong is still sending this trace." Waterfall on fallback axis; polling continues | — |
| Ready | `state: ready` | §2 layout. Polling stops | Plugin names + **Open tracing page** |
| No trace arrived | `state: missing` | `AlertTriangle` `--portal-warning` on `--portal-warning-subtle`, "No trace arrived for this call", "Your call worked, but Kong didn't send its trace within 30 seconds." Button **Check again** (secondary) | Body: "Kong didn't send spans within 30 seconds. Check that `tracing_instrumentations` is set on the Kong node, then run **Test** in the tracing settings." Link **Open tracing page** |
| Gone | 404 from `getTryItTrace` (replaced from another tab) | `Info`, "This trace was replaced", "You made a newer Try it call. Only the latest one is kept." | — |
| Session expired | 401 from `getTryItTrace` | Same as Signed out | — |
| Poll error | network/5xx on a poll | Keep current content; muted warning line "Can't reach the portal right now. Retrying." Retries at 2 s; after 30 s total switch to error | — |
| Error | 400, or poll errors for 30 s | `XCircle` destructive alert "Couldn't load the trace." Button **Try again** (restarts polling for the same id) | — |
| Timed-out call (504) | header `traced` | Scalar shows its 504 as today; panel goes through Waiting normally (Kong may still export spans) | — |

Polling: every 2 s while `waiting`, paused when the tab is hidden, resumed at once when visible.
Stop on `ready`, `missing`, 401, 404, error, or a new response. **Check again** makes one fetch;
if still `missing`, the message stays and a polite "Still no trace." is announced.

## 4. Components

| Component | Source | Notes |
| --- | --- | --- |
| `TryItTracePanel` | new, `apps/portal` | Props: `traceState: 'traced'|'off'|'signed-out'|'unreachable'`, `traceId?: string`, `isAdmin: boolean`, `signInHref: string`. Owns polling and the states above |
| `TraceWaterfall` | spec 026, reused | `trace`, `maxRows = 200`. New prop `variant: 'admin'|'try-it'` only changes the caption text (§6). No other change |
| `TraceSummary` | spec 026 summary block, extract if not already a component | New prop `showApi = false` here |
| `Card`, `Badge`, `Button`, `Skeleton`, `Tooltip`, `Alert` | shadcn/ui | Card uses `--card`, `--border`, `--portal-shadow-card` |
| Icons | lucide | `Info`, `LogIn`, `XCircle`, `Clock`, `AlertTriangle`, `CheckCircle2`, `Copy` |

No new tokens. All colours come from tokens.md; the panel renders correctly under a customer theme
and in dark mode via the existing variables.

## 5. Copy reference

| Key | Text |
| --- | --- |
| Heading | Trace |
| Scope hint | Your call only |
| Scope tooltip | Only you can see the traces of your Try it calls. Each new call replaces the last one. |
| Footer | Only your latest Try it call is kept. |
| Admin footer link | Open tracing page |
| Off title | Tracing is off for this API |
| Off body (dev) | Your call worked as usual. Calls to this API aren't traced for your account. |
| Off body (admin) | Calls to this API aren't in a tracing selection. |
| Off link (admin) | Open tracing settings |
| Signed-out title | Sign in to see traces |
| Signed-out body | Traces are shown only to the person who made the call. |
| Signed-out link | Sign in |
| Unreachable title | The call didn't reach the gateway |
| Unreachable body | Kong didn't answer, so there's no trace for this call. Try again in a moment. |
| Unreachable admin extra | Check that the gateway is running. · Open Gateways |
| Waiting | Waiting for the trace from Kong… {n} s |
| Partial | Kong is still sending this trace. |
| Missing title | No trace arrived for this call |
| Missing body (dev) | Your call worked, but Kong didn't send its trace within 30 seconds. |
| Missing body (admin) | Kong didn't send spans within 30 seconds. Check that `tracing_instrumentations` is set on the Kong node, then run Test in the tracing settings. |
| Missing button | Check again |
| Still missing (SR) | Still no trace. |
| Gone title | This trace was replaced |
| Gone body | You made a newer Try it call. Only the latest one is kept. |
| Poll warning | Can't reach the portal right now. Retrying. |
| Error | Couldn't load the trace. · Try again |
| Copy button label | Copy trace ID (toast "Trace ID copied") |
| Ready (SR) | Trace ready: {method} {path}, {status}, {total} milliseconds. Slowest: {display name}, {ms} milliseconds. |

"Missing body (dev)" says "Your call worked" only when the response status is < 500; otherwise it
reads "Kong didn't send the trace for this call within 30 seconds." The developer copy never names
a Kong setting (AC 8).

## 6. Accessibility (WCAG 2.2 AA)

- **Landmark:** the panel is a `<section aria-labelledby>` on its "Trace" h3, placed in DOM order
  right after Scalar's response, so reading order is response → trace.
- **Keyboard path:** Scalar **Send** → Scalar response → scope `Info` button → trace ID **Copy** →
  **Show all** (if any) → state action (**Check again** / **Try again** / **Sign in** / links) →
  **Open tracing page** (admin). Focus never moves on its own when the trace arrives.
- **Live region:** one `role="status"` (`aria-live="polite"`) per panel. Announced once each:
  "Waiting for the trace" on start, the Ready sentence, "No trace arrived for this call",
  "Tracing is off for this API", "The call didn't reach the gateway", "Sign in to see traces".
  The seconds counter is `aria-hidden`. Error alert uses `role="alert"`.
- **Waterfall:** 026 §11 table rules. Caption (visually hidden) for this variant: "Spans of your
  Try it call, in start order". Timeline cell `aria-hidden`; start and duration are text.
- **Status never by colour:** every state has an icon and words; Slowest and Error are badge words.
- **Contrast:** token pairs from tokens.md (warning on warning-subtle 6.8:1 light / 9.0:1 dark;
  muted-foreground on card 7.6:1). Bars meet 3:1 on `--muted` as in 026.
- **Targets:** Copy, Info, Check again ≥ 24×24 px (2.5.8).
- **Reduced motion:** no spinner; static `Clock` icon; skeletons don't pulse.

## 7. Responsive behaviour

| | 375px | 1280px |
| --- | --- | --- |
| Position | Full width under Scalar's response (Scalar stacks request over response) | Under the response in Scalar's response column |
| Summary | Method + path on line 1; status · total on line 2 | One line |
| Trace ID | Middle-truncated (`4bf92f35…0e4736`), full value in `aria-label` and copied by **Copy** | Full |
| Waterfall | 026 two-line rows, axis 0 and total, depth capped at 2 | 026 four columns, 5 ticks |
| State messages | Icon above text; actions full width | Icon left of text; actions inline |
| Long paths | `overflow-wrap: anywhere`; no horizontal page scroll | Same |

If Scalar's response column is narrower than 640px at desktop (side-by-side client), the panel uses
the 375px layout by container query, not viewport width.
