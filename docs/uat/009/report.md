# Spec 009 user acceptance report

Date: 2026-11-13. Commit: `d2c4d8727dc783d8525eec0b9c1bc1400c561dd8`.
Portal: http://localhost:3008. Kong proxy: http://localhost:18008.
Browser: Orca built-in browser. Desktop: default viewport for the initial pass; 1280 × 900 for the keyboard/role pass. Mobile: 390 × 844, mobile mode, device scale 1, reapplied after navigation.

Used QA's healthy stack without rebuilding it. Created a disposable two-API product, Free (5/second, 10,000/month), Expanded (20/second, 10,000/month), and Tiny (5/second, 10/month) plans through the admin UI; created two disposable developers and a team through the UI. No application code, automated tests, earlier UAT rounds, old screenshots or browser logs were read. Kong calls below used the keys revealed by the UI; no keys, passwords or invitation bearer links are retained in this report.

| User story / criterion | Result | What I saw |
| --- | --- | --- |
| Admin bundles two published APIs; catalog and comparison (AC1) | Pass on desktop | “Created UAT Weather bundle.” Catalog: “2 APIs · 3 plans”; product: “Two APIs for UAT developers”, “5 requests per second”, “10,000 requests per calendar month, UTC” and both API rows marked “✓ Included”. |
| Admin receives field validation (AC2) | Pass, visible form | Missing limits: “Enter a rate limit.” / “Enter a monthly quota.”; zero and negative values in each field: “Enter … of 1 or more.”; 2.5 in each field: “Enter a whole number, such as 5.” / “…10000.”; deselecting both APIs: “Choose at least one API.” The form stayed open and only the later valid save produced “Created plan Free.” Outside-product APIs were absent from the selector (“Only APIs in this product are available.”). |
| Developer subscribes and gets one-time key (AC3) | Pass | Signed up, chose Free, named `uat-desktop`, confirmed “Subscribe and get key”, and saw “Your API key” with the copy-now warning. My apps listed the plan and one active key; reloading showed only the key suffix. Both included APIs returned upstream HTTP 200. The API reference's Test Request → Send also displayed live “200 OK” with JSON from `/get` using the team subscription. |
| Five-per-second limit (AC4) | Pass | Six sequential live requests aligned to one second returned `[200, 200, 200, 200, 200, 429]` in 0.077 seconds; a request after 1.1 seconds returned 200. |
| Monthly quota ten (AC5) | Pass | New Tiny subscription: eleven live requests 0.55 seconds apart returned ten 200s followed by 429. |
| Change plan, same key (AC6) | Pass | Dialog: “Your key stays the same.” After selecting Expanded: “Changed to Expanded. Your key stays the same, and the new limits apply now.” Ten requests with the original key all returned 200 in 0.108 seconds. |
| Confirm cancellation (AC7) | Pass | “Cancel uat-desktop?” → “Cancel subscription” led to “Cancelled uat-desktop. Its key has stopped working.” My apps showed the empty first-app state; the cancelled key returned 401. |
| Regenerate key (AC8) | Pass | Confirmation warned that the old key stops working. Success: “Your new API key”; old key returned 401 and new key returned 200. Dismissing and reloading showed suffixes and Active/Revoked states, without revealing the new secret again. |
| Gateway outage preserves state (AC9) | Pass, visible behavior | Stopped only this worktree's Kong. Subscribe, change plan, cancel and regenerate each retained its form/dialog and displayed “⚠ The gateway is unavailable” with operation-specific unchanged-state text. After restoring Kong, My apps contained only the original subscription, still Expanded with one active key; its original key returned 200. |
| Read-only/non-admin refusal (AC10) | Pass, visible behavior | Invited the second developer with the UI's actual “Read-only” role and accepted the invitation. Product page: “Ask a team Admin or Member to subscribe”; direct subscribe URL: “you can't subscribe here”; app page: “Ask a team Admin or Member to change the plan or keys.” Change, regenerate, revoke and cancel controls were absent. A normal developer saw no Admin link and direct `/admin/products` showed “Page not found”. |
| Mobile main journey | Fail: minor layout; subscription completed | Plan cards stayed side by side rather than stacking. Client width was 390px, scroll width and innerWidth 593px; the third plan's Subscribe tap did not navigate. The first Subscribe link worked, and selecting Tiny in the form completed `uat-mobile-quota`, its one-time key reveal and app page at mobile size. Evidence: `mobile-plan-layout-fail.png`. |
| Keyboard main journey | Pass with test-name entry | Ten Tabs from the product page reached “Subscribe to Free”; Enter opened subscribe. Entered the disposable subscription name in its field, then Tab/Enter submitted and opened the key dialog. Tab cycled its controls and Tab/Enter activated “I've saved it”. Escape did not dismiss this one-time-key alert dialog. Navigation/activation used Tab, Enter and Escape; the test-name value was supplied with the browser fill command. |
| Existing catalog retry bug | Fail: minor, remains open | Stopped this worktree's server, opened `/`, saw “We couldn't load the products.” and “We couldn't load the APIs.”, restored server and chose product “Try again”. Catalog recovered, but document `performance.timeOrigin` changed from `1794604949986.4` to `1794604970985.6`, confirming a full document replacement. Reaffirmed with `linear bug 009 open`. |

Scope: this UAT walks user-visible behavior and live gateway responses. Server-only 400/403/503 problem+json payloads, database rollback internals, and deliberately forged outside-product API IDs remain covered by QA's Test report; they are not represented as independently inspected by this browser pass.

## Findings

- **Minor — mobile comparison overflow.** At 390 × 844, open `/products/uat-weather-bundle` with three plans. Expected one usable full-width card per plan; actual cards occupy one horizontal row and the page widens to 593px. Long API names also extend beyond the content width; a third-plan tap did not navigate. Workaround: open the first plan, then choose the desired plan radio on the subscription form. Screenshot stays local in this flat folder; no Linear issue or Fix task, because the journey can still finish.
- **Minor — catalog retry reload.** Reproduced as above; remains open, with no Linear issue or Fix task. Its failure is document replacement rather than a visual defect, so no screenshot was taken.

## Console and cleanup

Checked `orca console --limit 50 --json` after the main journey and after the outage/retry. It returned no error-level entries, so there is no observed console error to quote. The actual available console line was informational: “loadDocument: 28 ms”; no error was invented or deliberately injected to satisfy an evidence checkbox. No console/network dump was saved.

One local failure PNG, no success screenshots, no extra round directories. No blocker or major was found; current result is review with the two minor findings open. The worktree stack is stopped after the pass.

Validation: `git diff --check` passes. `factory guard user-tester` fails because it includes the feature branch’s earlier application/code/test files outside this role; this worker did not modify those files and did not restore or commit them. The three UAT documentation files are left uncommitted for the coordinator; Linear status synchronization succeeded (`JSO-237`: In Review). Documentation-only changes require no package typecheck or tests.
