# UAT — 026 Trace waterfall for one API call on Kong

- Date: 2026-11-21
- Commit: `83cf246`
- Portal: http://localhost:3001 (worktree stack `portal-tracing-5334`, Kong proxy :18001)
- Viewports: desktop 1114×812; mobile 390×844 (`--mobile`)
- Browser: Orca built-in browser, seeded admin, plus a developer signed up through the UI

| User story / criterion | Result | What I saw |
| --- | --- | --- |
| 1 Turn tracing on for one API, developer or team | **Fail (major)** | Adding a developer worked ("Journey QA … No active apps yet; calls start being traced when they create one") and "Stop tracing sample" removed the API row, each followed by "✓ Applied to Kong". The API Target picker lists only "Search APIs…": the page's `GET /api/v1/admin/apis` returns 404. After switching Kind Developer → API, the API picker shows the developer accounts; picking one and pressing Add shows "That api no longer exists. Pick another." A reload brings back the empty list. An admin cannot add an API selection from the UI. Image: `selection-picker-fail.png`. |
| 2 A call outside the selection keeps the shown trace | Pass | With only the developer selection, three calls to `/sample/get?token=abc123` (401). After 35 s the page still showed Trace ID `816e4c431ba1f1b0a8788db23396324d`, "Received 37 minutes ago". |
| 3 Turn-on dialog | Pass | "Kong only traces calls when tracing is on for the whole node. Set these two node settings … then restart the Kong node"; copy block `KONG_TRACING_INSTRUMENTATIONS=request,router,balancer,plugin_rewrite,plugin_access,plugin_header_filter` / `KONG_TRACING_SAMPLING_RATE=1`; "In kong.conf: tracing_instrumentations and tracing_sampling_rate"; endpoint prefilled `http://server:4000/api/v1/internal/traces/kong`, six instrumentation boxes checked, sampling rate 1. |
| 4 Test passes on the quickstart | Pass | "✓ Test passed — Kong delivered a test trace to the portal. Kong reports: instrumentations request, router, balancer, plugin_rewrite, plugin_access, plugin_header_filter" in about 1 s. Save then showed "✓ Applied to Kong". |
| 5 Test names the cause | Pass | Previous tester's unreachable endpoint showed "Kong can't reach the trace endpoint"; still on the page at start as "✕ Last test failed: Kong can't reach the trace endpoint". Endpoint restored to the default before the passing Test. |
| 6 Latest call waterfall | Pass | "GET /sample/get ⚠ 401 Unauthorized 14.3 ms total API: sample"; "⚠ Slowest: key-auth plugin — 9.76 ms, 68% of the call"; table rows Request (1.00 ms / 14.3 ms), Router, Plugin key-auth ⚠ Slowest, Plugin opentelemetry; no query string shown. |
| 9 Non-admin access | Pass | Developer signed up via "Create your developer account" landed on My apps with no Admin link; `/admin/tracing` showed "You don't have access to Tracing — Tracing is only for portal admins."; `GET /api/v1/admin/tracing/latest` → 403 `application/problem+json` "Administrator access is required." |
| Mobile pass (390×844) | Pass | No horizontal scroll (scrollWidth 390). Waterfall rows stack as cards with label, duration bar and "⚠ Slowest" badge. `success-mobile.png`. |
| Keyboard pass | Pass, minor finding | Tab reaches Edit settings (18 stops), Enter opens the dialog, Tab reaches Test, Enter → "✓ Test passed", Escape closes. After Escape focus lands on the page body instead of returning to Edit settings (minor). |

Criteria 7, 8 and 10 have no user-visible surface beyond the above (QA covers them in the API and compose tests).

## Findings
- **Major** — Tracing API picker lists no APIs, so an API selection cannot be added (`GET /api/v1/admin/apis` 404; stale developer options after switching Kind). Recorded under Deferred Linear; Fix task added for frontend.
- **Minor** — Escape from the Tracing settings dialog leaves focus on the page body.
- **Cosmetic, minor** — the "Developer" kind badge in the selections table wraps as "Develop / er" at desktop width.

## Console
`orca console --limit 50` showed no errors. Network: `404 GET /api/v1/admin/apis`, `404 POST /api/v1/admin/tracing/selections` (the stale-option Add).
