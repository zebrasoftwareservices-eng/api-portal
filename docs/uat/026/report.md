# UAT — 026 Trace waterfall for one API call on Kong

- Date: 2026-11-21
- Commit: `83cf246`; retest of rows 1 and keyboard at `8aa14f1` (fix `1a8648a`)
- Portal: http://localhost:3001 (worktree stack `portal-tracing-5334`, Kong proxy :18001)
- Viewports: desktop 1114×812; mobile 390×844 (`--mobile`)
- Browser: Orca built-in browser, seeded admin, plus a developer signed up through the UI

| User story / criterion | Result | What I saw |
| --- | --- | --- |
| 1 Turn tracing on for one API, developer or team | Pass (retest) | Kind API: the Target picker lists the published APIs ("Sample HTTP API", "Orders QA", …) and marks the traced one "Sample HTTP API — Already traced" (disabled). After "Stop tracing sample" I picked the quickstart Sample HTTP API and pressed Add: the table shows "Api · sample · Every call to this API". Kind → Developer reset the target to "Choose a developer…" with Add disabled; Kind → API reset it to "Search APIs…". Minor: the picker shows three options titled "Sample HTTP API" and two "Orders QA" with nothing to tell them apart. |
| 2 A call outside the selection keeps the shown trace | Pass | With only the developer selection, three calls to `/sample/get?token=abc123` (401). After 35 s the page still showed Trace ID `816e4c431ba1f1b0a8788db23396324d`, "Received 37 minutes ago". |
| 3 Turn-on dialog | Pass | "Kong only traces calls when tracing is on for the whole node. Set these two node settings … then restart the Kong node"; copy block `KONG_TRACING_INSTRUMENTATIONS=request,router,balancer,plugin_rewrite,plugin_access,plugin_header_filter` / `KONG_TRACING_SAMPLING_RATE=1`; "In kong.conf: tracing_instrumentations and tracing_sampling_rate"; endpoint prefilled `http://server:4000/api/v1/internal/traces/kong`, six instrumentation boxes checked, sampling rate 1. |
| 4 Test passes on the quickstart | Pass | "✓ Test passed — Kong delivered a test trace to the portal. Kong reports: instrumentations request, router, balancer, plugin_rewrite, plugin_access, plugin_header_filter" in about 1 s. Save then showed "✓ Applied to Kong". |
| 5 Test names the cause | Pass | Previous tester's unreachable endpoint showed "Kong can't reach the trace endpoint"; still on the page at start as "✕ Last test failed: Kong can't reach the trace endpoint". Endpoint restored to the default before the passing Test. |
| 6 Latest call waterfall | Pass | "GET /sample/get ⚠ 401 Unauthorized 14.3 ms total API: sample"; "⚠ Slowest: key-auth plugin — 9.76 ms, 68% of the call"; table rows Request (1.00 ms / 14.3 ms), Router, Plugin key-auth ⚠ Slowest, Plugin opentelemetry; no query string shown. |
| 9 Non-admin access | Pass | Developer signed up via "Create your developer account" landed on My apps with no Admin link; `/admin/tracing` showed "You don't have access to Tracing — Tracing is only for portal admins."; `GET /api/v1/admin/tracing/latest` → 403 `application/problem+json` "Administrator access is required." |
| Mobile pass (390×844) | Pass | No horizontal scroll (scrollWidth 390). Waterfall rows stack as cards with label, duration bar and "⚠ Slowest" badge. `success-mobile.png`. |
| Keyboard pass | Pass (retest) | Focus on Edit settings, Enter opens "Tracing settings" with focus inside the dialog, Escape closes it and focus returns to "Edit settings". |

Criteria 7, 8 and 10 have no user-visible surface beyond the above (QA covers them in the API and compose tests).

## Retest (after `1a8648a`)
Try-it check: from the Sample HTTP API reference, "Send Request" to `http://localhost:18001/sample/get`. The Tracing page then showed "Received 16 seconds ago", "GET /sample/get ⚠ 401 Unauthorized 4.23 ms total" and a new Trace ID `245ec73c8701770d2ea17aef4503ceb2` (was `0dfde3d18b51d9ac27b1b6fc23c8029b`).

## Findings
- **Fixed** — Tracing API picker lists no APIs (major): verified fixed on retest.
- **Fixed** — Escape from the Tracing settings dialog leaves focus on the page body (minor): verified fixed on retest.
- **Minor** — the API picker shows several APIs with the same title (three "Sample HTTP API", two "Orders QA") and no slug or gateway to tell them apart.
- **Cosmetic, minor** — the "Developer" kind badge in the selections table wraps as "Develop / er" at desktop width.

## Console
Retest: `orca console --limit 50` showed no errors.
`orca console --limit 50` showed no errors. Network: `404 GET /api/v1/admin/apis`, `404 POST /api/v1/admin/tracing/selections` (the stale-option Add).
