# Spec 011 user acceptance report

Date: 15 November 2026 (UTC). Tested revision: `3aa4f9db07da966ad2ecf30d37fc3200ea938798`; application revision recorded by QA: `4f935de0cdf800db4900fe1359871276d5447921`.
Portal: http://localhost:3006. Reused QA's `portal-011-usage-and-insights-1491` Compose stack.
Browser: Orca built-in browser; desktop 1440 × 1000, mobile 390 × 844, scale 1.

Result: no blocker or major product failure observed; review. This is a browser UAT report, with unexercised conditional cases identified below rather than counted as manual passes. No application code, tests, prior UAT rounds, or saved browser logs were read.

| User story / AC | Result | What was observed |
| --- | --- | --- |
| Developer: monthly quota (1) | Pass | Created a product and 1,000-call plan in admin UI, subscribed `Usage quota app` in a shared team, then made 20 actual Kong requests. Reload showed “20 of 1,000 calls”, 2%, and meter value 20 within approximately 20 seconds of the final request; no collection job was started. |
| Developer: status split (2) | Pass, scoped | Controlled requests returned twelve 200, five 404 and three 500 responses. The UI showed “2xx Success” 12, “4xx Client errors” 5, “5xx Server errors” 3, summing to 20. The 429-specific variant remains QA coverage. |
| Developer: rejected credentials (3) | Pass, scoped | No-key, unknown-key and UI-revoked-key requests each returned 401. Subsequent quota-app view remained 20 until a deliberately added teammate success made it 21; legacy usage stayed 20 after revocation. Stored-data redaction is covered by QA, not browser inspection. |
| Developer: month/reset (4) | Pass for visible label; boundary not exercised | “Resets 1 Dec 2026, 00:00 UTC” appeared on both apps. No prior-month fixture or clock change was used; previous-month exclusion remains QA coverage. |
| Team access/privacy (5) | Pass | Signed-out usage API returned 401 and non-member returned 404, both `application/problem+json`, with no counts. Accepted a local emailed invitation as a second test developer: “You're a Read-only member” and “20 of 1,000 calls” were visible, with no key mutation controls. |
| Developer: collection behind (6) | Pass | Stopped only this worktree's Kong for over five minutes. App showed “Usage may be behind”, “Last updated 5 minutes ago” and the exact last-received UTC time while retaining 20 calls, then recovered after Kong restarted. |
| Admin: adoption/top APIs (7) | Pass for populated view; empty not exercised | Initially one signup, one active app and Sample HTTP API with 20 calls. Later “New sign-ups” 2, “Active apps” 2 and one top API with 41 calls; no blank extra APIs. Rolling UTC range read “Last 30 days · 17 Oct – 15 Nov 2026 (UTC)”. Empty/top-five ordering variants remain QA coverage. |
| Admin: onboarding (8) | Pass | First app made 20 requests using the reference's actual Send button; first response was “200 OK”. Insights attributed that own-key first call, showing signup 16:06 UTC, first success 16:19 UTC, “12 min 36 s”, “Over target”, target 10 min. Newer Usage Reader appeared first with “No call yet”, even after joining the shared team and a subsequent successful teammate-key request; coverage read “1 of 2 developers”. 4xx/5xx-only and regenerated-key variants remain QA coverage. |
| Developer: private Insights (9) | Pass | Developer menu contained APIs, My apps, Profile and Sign out, with no Insights/Admin link. `/admin/insights` showed “You don't have access to Insights” and “Go to My apps”; browser API request returned 403 problem+json with no insight data. |
| Platform engineer: Kong/no extra collector (10) | Pass for connected Kong; unsupported not exercised | Existing QA stack collected both browser try-it and direct Kong requests automatically. Unsupported gateway cannot be selected in this install without changing code; QA's component and conformance tests cover it. |
| Hosted-demo visitor/reset (11) | Not exercised on hosted demo | This is the ordinary local quickstart, not a hosted-demo deployment. Local usage and Insights privacy were walked above; demo mode and daily reset remain QA automated coverage and were not represented as a browser pass. |
| Mobile main journey | Pass | App usage at 390 × 844 fit the viewport, with stacked 12/5/3 status tiles, visible count/meter/reset text and usable Try this API link. Insights used stacked statistics and a developer card rather than the desktop table; document width was 390. |
| Keyboard main journey | Pass, scoped | From My apps, seven Tab presses reached Open app; Enter opened it and focused the app heading. Tab reached the team link and then Open Sample HTTP API reference; Enter opened the reference. Escape dismissed the team switcher. This pass covered navigation to usage/reference, not re-entry of credentials and a second keyboard-only Send flow. |

Test data: two synthetic developer accounts, personal `Usage UAT app`, shared `Usage UAT team`, `Usage quota app`, and `Usage UAT product`/`UAT quota`. The first app received 20 browser Send calls; the quota app received 20 controlled status requests via Python HTTP and one later teammate success. The legacy key was revoked through UI. Full keys/passwords are excluded from evidence images and this report.

Console check: `orca console --limit 50 --json` returned no error entries; the final admin result was `"entries": []`. There is no console error line to quote. A reference informational line was `"loadDocument: 13 ms"`; this was not an error. No console/network dumps were saved.

Evidence: local `success-desktop.png` and `success-mobile.png` show the quota app with 20/1,000 and the 12/5/3 split. Two PNGs in this flat folder, no round directories; PNGs are not committed. No failure image or new Linear bug was warranted.

Open finding: retained the existing deployment-smoke integration gap as minor with `linear bug 011 open "Deployment smoke does not invoke"`. It cannot be verified from a browser and application/test code was outside this role's read scope. No blocker or major was opened, and this minor does not return the spec to building.

Coverage limitation: the conditional cases explicitly marked above were not manually walked, so the requested complete per-criterion UAT is incomplete despite the successful main journeys. Review should use this report alongside QA's evidence; no hosted deployment, daily cron, clock manipulation, unsupported adapter or destructive empty-data reset was performed. Stack stopped at completion.
