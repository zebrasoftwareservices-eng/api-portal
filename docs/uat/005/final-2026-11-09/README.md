# Spec 005 final browser smoke — 2026-11-09

Result: **review**. The narrow browser re-check after the packaging revert and QA wait fix passed; no new blocker, major, or minor was found. Tested commit `2b88c0f` in Orca’s built-in browser against newly built branch images and real Kong 3.9.4. No application code or automated tests changed.

The coordinator explicitly limited this run to a smoke path, since the preceding [full retest](../retest-2026-11-08/README.md) walked all seven stories and the intervening changes affected server packaging and an automated test wait. That report remains the detailed acceptance, mobile, keyboard, protected-route recipe, production-token, and open-bug evidence. This run does not claim a repeat of that matrix or a new cold-build benchmark.

## Story evidence

| Story | Final smoke result | Evidence |
| --- | --- | --- |
| First admin | Fresh volume redirects root to `/setup`; no token requested in development. Creating first admin signs in and opens `/setup/gateway` | `01-first-admin.png`, `02-test-pass.png` |
| Test then save Kong | Defaults work; Test reports Kong 3.9.4 and explicitly says nothing saved. Save confirms connected without restart | `02-test-pass.png`, `03-sample-choice.png` |
| Manage connection | Disable confirmation describes consequences; disabled card appears, then Enable reruns successfully and restores Connected | `05-disabled.png`, `06-reenabled.png` |
| Discover/import API | Disposable operator-owned `final-uat` service appears with route `/final-uat` and key-auth on. Uploaded prior retest OpenAPI YAML; published UAT Imported API. Developer signs up, creates app selecting imported and sample APIs, receives key; direct Kong and browser try-it both return 200 | `04-service-import.png`, `07-developer-key.png`, `08-try-it-200.png`, `network.json` |
| Optional sample | Save offers Publish or Continue without it. Explicit Publish succeeds; sample appears in catalog/app chooser and direct Kong call returns 200 with browser-issued key | `03-sample-choice.png`, `07-developer-key.png` |
| Environment setup | Separate fresh volume with only ADMIN_EMAIL/ADMIN_PASSWORD bypasses first-admin setup. Sign-in without next lands at `/setup/gateway`: JSO-398 remains fixed | `09-admin-only-wizard.png` |
| Safe Admin API documentation | Gateway wizard offers guide and explains server-side URL resolution and Kong writes. DOM link resolves to existing `docs/connect-kong.md`; same-network defaults used successfully. Protected-route execution remains covered by full retest | `02-test-pass.png`, `09-admin-only-wizard.png`; full retest `15`–`16` |

## Observations and limits

- Existing minors JSO-399, JSO-405, JSO-406 and the quota-blocked intermittent try-it 404 remain open. Duplicate wizard headings (JSO-406) are still visible. Other minor reproductions were not repeated in this narrow smoke; their full-retest results are retained without claiming fixes. The imported API first browser request returned 200, which does not establish resolution of the intermittent ungranted-key 404 case.
- No new product problem was found. Console has only Scalar info messages; the saved recent network window includes try-it HTTP 200. The browser’s native desktop viewport was 666px after navigation; the admin-only wizard screenshot reapplied 1280×900. Mobile/keyboard coverage is the full retest, not this smoke.
- Screenshots show only masked credentials or key suffixes. The disposable key was used for `GET /final-uat/get` and `/sample/get`, each HTTP 200; response bodies were not committed.
- Build and startup completed successfully using `docker compose -p spec005final -f deploy/docker-compose.yml -f /tmp/spec005-final-images.yml build server portal`, then `up --no-build -d --wait`. Image override names were `spec005-final-server` and `spec005-final-web`; admin-only override set only disposable admin credentials. Docker build metadata and Orca access needed sandbox escalation; both succeeded.
- Both scenarios used only the owned `spec005final` project. Its containers, network, database volume and uniquely named application images were removed after testing; shared third-party images and caches were retained. No other project was touched.
