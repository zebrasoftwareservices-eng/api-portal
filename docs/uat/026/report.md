# UAT — 026 Trace waterfall for one API call on Kong

- Date: 2026-11-21
- Commit: `83cf246`; retest of rows 1 and keyboard at `8aa14f1`; retest of row 6, mobile and keyboard (decision 6, one latest trace per API, and Review B1) at `f9bfe9e`
- Portal: http://localhost:3001 (worktree stack `portal-tracing-5334`, Kong proxy :18001)
- Viewports: desktop 1440×1000 (retest; earlier 1114×812); mobile 390×844 (`--mobile`)
- Browser: Orca built-in browser, seeded admin, plus a developer signed up through the UI

| User story / criterion | Result | What I saw |
| --- | --- | --- |
| 1 Turn tracing on for one API, developer or team | Pass (retest) | Kind API: the Target picker lists the published APIs ("Sample HTTP API", "Orders QA", …) and marks the traced one "Sample HTTP API — Already traced" (disabled). After "Stop tracing sample" I picked the quickstart Sample HTTP API and pressed Add: the table shows "Api · sample · Every call to this API". Kind → Developer reset the target to "Choose a developer…" with Add disabled; Kind → API reset it to "Search APIs…". Minor: the picker shows three options titled "Sample HTTP API" and two "Orders QA" with nothing to tell them apart. |
| 2 A call outside the selection keeps the shown trace | Pass | With only the developer selection, three calls to `/sample/get?token=abc123` (401). After 35 s the page still showed Trace ID `816e4c431ba1f1b0a8788db23396324d`, "Received 37 minutes ago". |
| 3 Turn-on dialog | Pass | "Kong only traces calls when tracing is on for the whole node. Set these two node settings … then restart the Kong node"; copy block `KONG_TRACING_INSTRUMENTATIONS=request,router,balancer,plugin_rewrite,plugin_access,plugin_header_filter` / `KONG_TRACING_SAMPLING_RATE=1`; "In kong.conf: tracing_instrumentations and tracing_sampling_rate"; endpoint prefilled `http://server:4000/api/v1/internal/traces/kong`, six instrumentation boxes checked, sampling rate 1. |
| 4 Test passes on the quickstart | Pass | "✓ Test passed — Kong delivered a test trace to the portal. Kong reports: instrumentations request, router, balancer, plugin_rewrite, plugin_access, plugin_header_filter" in about 1 s. Save then showed "✓ Applied to Kong". |
| 5 Test names the cause | Pass | Previous tester's unreachable endpoint showed "Kong can't reach the trace endpoint"; still on the page at start as "✕ Last test failed: Kong can't reach the trace endpoint". Endpoint restored to the default before the passing Test. |
| 6 Latest call waterfall, one per API | Pass (retest) | Traced Sample HTTP API (`sample`) and Duplicate Trace QA (`qa-duplicate-a`). After a try-it call to Sample and calls to qa-duplicate-a, the card shows "Show the latest call to:" with both APIs. Duplicate Trace QA: "GET /qa-duplicate-a/anything ✓ 200 OK 14.2 ms total", "⚠ Slowest: opentelemetry plugin — 2.65 ms, 19% of the call", rows Request, Router, Plugin opentelemetry ×2, Upstream try. Sample HTTP API: "GET /sample/get ⚠ 401 Unauthorized 7.63 ms total", "⚠ Slowest: key-auth plugin — 1.75 ms". A new `POST /sample/post?token=abc123` replaced only Sample ("POST /sample/post", no query string, Trace ID `97c45830…a9e3`); Duplicate Trace QA still showed Trace ID `7c854247…f554`. A new `GET /qa-duplicate-a/status/503` replaced only Duplicate ("✕ 503 Service Unavailable 45.4 ms"); Sample still showed `97c45830…a9e3`. Bars line up with the axis (`success-desktop.png`): Router starts at 2.82 of 14.2 ms, about 20% along the track; Upstream try at 13.4 ms ends at the right edge. |
| 9 Non-admin access | Pass | Developer signed up via "Create your developer account" landed on My apps with no Admin link; `/admin/tracing` showed "You don't have access to Tracing — Tracing is only for portal admins."; `GET /api/v1/admin/tracing/latest` → 403 `application/problem+json` "Administrator access is required." |
| Mobile pass (390×844) | Pass (retest) | scrollWidth 390. The API selector fills the width; switching to Sample HTTP API shows "POST /sample/post ⚠ 401 Unauthorized 5.85 ms total", the trace ID wraps, and waterfall rows stack as cards with aligned bars. `success-mobile.png`. |
| Keyboard pass | Pass (retest) | Tab reaches "Show the latest call to" after the Stop tracing buttons (23rd stop), with a solid focus outline; typing "s" switches it to Sample HTTP API and the card updates to Sample's trace; Tab moves on to the API link and Copy. Earlier: Enter opens "Tracing settings", Escape returns focus to "Edit settings". |

Criteria 7, 8 and 10 have no user-visible surface beyond the above (QA covers them in the API and compose tests).

## Retest at `f9bfe9e` (decision 6 and Review B1)
Sample HTTP API calls went through its reference try-it ("Send Request" to `http://localhost:18001/sample/get`). Duplicate Trace QA's reference has no operations, so its calls went straight to the Kong proxy (`curl http://localhost:18001/qa-duplicate-a/...`). Each API kept its own latest trace, and a new call to one never changed the other. The Slowest mark follows the longest non-root span even when that is the Router (3.48 ms against a 2.93 ms upstream try on the 503 call).

## Findings
- **Minor** — the card says "Received 1 minutes ago" (should be "1 minute ago"), and the live announcement reads "5.847296 milliseconds" unrounded while the screen shows 5.85 ms.
- **Minor** — Duplicate Trace QA's reference page has no operations, so try-it cannot reach it; QA test data, not a product bug.
- **Fixed** — Tracing API picker lists no APIs (major): verified fixed on retest.
- **Fixed** — Escape from the Tracing settings dialog leaves focus on the page body (minor): verified fixed on retest.
- **Minor** — the API picker shows several APIs with the same title (three "Sample HTTP API", two "Orders QA") and no slug or gateway to tell them apart.
- **Cosmetic, minor** — the "Developer" kind badge in the selections table wraps as "Develop / er" at desktop width.

## Console
Retest at `f9bfe9e`: `orca console --limit 50` showed no errors.
Retest: `orca console --limit 50` showed no errors.
`orca console --limit 50` showed no errors. Network: `404 GET /api/v1/admin/apis`, `404 POST /api/v1/admin/tracing/selections` (the stale-option Add).
