# Spec 005 browser retest — 2026-11-08

Result: **review**, with no known open blocker or major. All seven stories were re-walked in Orca's built-in browser against this worktree's rebuilt images and real Kong 3.9.4. No application code or tests were changed.

## Runtime and method

Following the coordinator's Docker restart, no images or containers existed. Built the server and portal serially as `spec005-uat-server` and `spec005-uat-web`, using only Compose project `spec005uat`; reset only its volumes between environment scenarios. Test accounts used `example.com` addresses and disposable passwords. Browser actions followed snapshots, with focus + Enter when the native click command reported no page change and made no request. No product defect is inferred from that automation behavior.

| Command phase | Seconds |
| --- | ---: |
| `docker compose -p spec005uat -f deploy/docker-compose.yml -f /tmp/spec005-uat-images.yml build server` | 78.36 |
| Same, `build portal` | 26.84 |
| Same, fresh `up --no-build -d --wait` | 43.36 |
| Cumulative command time | **148.56** |
| Later admin-only fresh-volume startup, built images | 12.50 |

Builds used normal cache mode; this is not a new independent no-cache benchmark. These commands included required image downloads. The temporary image override changed only the two application image names. The first run added second DB-backed Kong and DB-less Kong services inside the same project for failure/repoint checks; both were removed before the next environment scenario. The database for the second Kong was isolated as `kong2`.

## Story walkthroughs

| Story | Observed result | Evidence |
| --- | --- | --- |
| Fresh install → first admin | Root redirects to setup; no development token field. Empty submit gives inline email/password errors. Valid admin creation signs in and opens gateway step. Production token details below | `01-setup-desktop.png`, `02-gateway-wizard.png`, `30`–`33` |
| Test then save Kong | Defaults are ready to use. Localhost fails with “Use an address the portal server can reach.” Correct Test names Kong 3.9.4 and explicitly says nothing is saved. Save connects without restart | `03-localhost-error.png`, `04-test-pass.png` |
| Edit/disable/remove | Unused connection removed through dialog and returns add form; no-gateway import points to Gateways. In-use removal names **2 APIs and 1 active key**. Disable hides import and service list. Existing sample/import keys still return 200. Re-enable while Kong is down fails and stays disabled; after Kong restarts it succeeds. Blank token Test passes using stored token; changed URL refuses until token/no-token decision; explicit no-token Save returns card with token **None**. Second Kong yields singular 1-key warning; Escape declines; Save anyway saves | `06-no-gateway.png`, `12-remove-in-use.png`, `13-enable-unreachable.png`, `17-changed-url-token-required.png`, `22`–`24`, `m04`–`m05` |
| Discover/import/use API | Provisioned disposable Kong service/route/key-auth outside portal. Picker showed `/uat, /uat-v2 — key-auth on`; selecting shows both routes. Uploaded `import-api.yaml`, published, created developer account/app covering both APIs, got key. Direct Kong `/sample/get` and `/uat/get` each 200; browser Scalar Send → try-it `/uat/get` **200**. Developer on `/admin/gateways` gets Page not found. Outage first-load difference and retry below | `07-import-services.png`, `08-import-published.png`, `09-key-issued.png`, `10-try-it-import-200.png`, `11-developer-no-admin.png`, `14-import-first-load-outage.png` |
| Sample is a choice | Publish from mobile wizard succeeds and key works. Separate fresh admin-only scenario declines with Tab/Enter; import list/catalog stays empty, `GET /services` has zero services. Reload bug reproduced | `05-reload-loses-choice.png`, `27-sample-declined.png`, `m01`–`m03`, `m06` |
| Environment configuration | Fresh admin-only install bypasses first-admin setup; signing in with no next reaches gateway wizard (**JSO-398 fixed**). Production admin+Kong with valid disposable secrets and SEED_SAMPLE=true bypasses wizard, shows sample and read-only environment card without Edit/Disable/Remove. Fresh Kong-only production requires first admin then lands on `/admin/apis`; `/setup/gateway` redirects to read-only card. Unsetting KONG_ADMIN_URL later preserves it and restores Edit/Disable/Remove | `26-admin-only-wizard.png`, `28-environment-managed.png`, `28-environment-managed.json`, `29-environment-desktop.png`, `30`–`33`, `m07-preserved-editable-card.png` |
| Safe Admin API guide | Executed `docs/connect-kong.md` protected-route curl commands in `curlimages/curl:8.11.1` sharing real Kong's network namespace, substituting only a disposable token and actual server source IP. Recipe exits 0. Browser wrong token refuses, correct passes; saved card shows Stored. Direct probes from server namespace: right **200**, wrong **401**, portal-issued key **403**. Right token from host outside allowlist: **403**. UI guidance matches the same-network/default evaluation warnings in the guide | `15-protected-wrong-token.png`, `16-protected-right-token.png` |

The recipe was applied to the isolated evaluation Kong, whose Admin API retained the compose network binding; this retest validates the documented curl-container commands and protected route, not a deployment of its loopback-listener hardening step. Historical UAT/QA remain the evidence for the complete listener/cleanup deployment recipe.

## Production setup and session checks

- Missing token: inline “Enter the setup token from the server’s logs.”
- Wrong token: “Setup token not accepted”; no admin created.
- Restart: token changes; old token refused; current token creates admin and goes directly to APIs because Kong exists.
- Replay current token after admin exists: **409**; independent DB count: **1 admin**.
- Expire the disposable session in its own database, reload protected page: `/sign-in?next=%2Fadmin%2Fgateways`, “Sign in to continue.” (`34-expired-session.png`).
- Wrong password: “Email or password is incorrect.” Empty setup errors, reload after saving, and Escape from confirmation dialogs were also walked.

## Open bug retests

### JSO-399 — minor, reproduced

Steps: save bundled gateway on `/setup/gateway`; see sample choice; reload. Expected: sample choice survives. Actual: redirects to `/admin/gateways`, no sample choice. Screenshot `05-reload-loses-choice.png`; desktop 1280×900 after reapplying viewport. Remains Backlog.

### JSO-405 — minor, reproduced

Steps: enabled connection; stop own Kong; navigate fresh to `/admin/apis`. Expected per design: source fields remain alongside unavailable alert. Actual: form replaced by unavailable alert; published APIs remain. Restart Kong and activate Try again: service form returns. Screenshot `14-import-first-load-outage.png`; native desktop 666px viewport after navigation reset. Remains Backlog.

### JSO-406 — minor, reproduced

Steps: open fresh gateway wizard. Expected: one step heading. Actual: “Connect your Kong” followed by “Connect a Kong”. Screenshot `02-gateway-wizard.png`; mobile `m01` also records this. Remains Backlog.

### Intermittent try-it 404 — minor, remains open; issue blocked by quota

Warm catalog through an earlier try-it request, create/import a new key-auth route `/uat-denied`, use an existing key that has no grant for that API. Direct Kong was **403** before first try-it; first browser Send also returned **403**, as expected (`25-try-it-new-route-403.png`). This one fresh browser scenario does not establish a fix, nor same-route recovery from a failing request. Current fixture uses JSON response metadata; QA's text/plain scenario and 1/18 incidence remain in the spec.

No matching durable issue was found by a non-truncated search for “intermittently”. Filing retried via `orca linear create` with parent JSO-234 / Bug / low priority and title “Bug: newly imported route intermittently returns 404 through try-it after Kong is ready”; Linear again returned **linear_write_failed: Usage limit exceeded**. Intended body: warm try-it catalog → import new key-auth route → sample-only key → wait for direct Kong 403 → first try-it request; expected 403, intermittent actual 404. Preserve QA reproduction/evidence from the spec and create once capacity returns.

No new product problem found. JSO-400 raw validation title, JSO-401 count/pluralization and JSO-402 localhost guidance fixes observed in current UI. Existing Backlog minors are not closed merely because the main journey succeeds.

## Layout, keyboard and health

- Desktop setup and environment card explicitly set to **1280×900** (`01`, `29`, `30`). Orca resets viewport on navigation; other desktop actions used its native **666px** browser width unless reapplied.
- Main mobile save/sample journey repeated at **390×844, mobile, scale 3**. Seven Tabs from the wizard arrival heading reach Save; Enter connects; Tab, Tab, Enter declines sample and leaves Kong empty. Escape declines missing-key and remove dialogs. No mouse needed for this keyboard gateway journey.
- Scale-3 screenshot capture repeats/crops pixels (`m01`–`m06`), also seen in historical UAT; don't use those pixels as proof of product overflow. Readable supplemental **390×844, mobile, scale 1** card/editor screenshots are `m07`–`m08`; these show correct single-column layout. `02` is an early full-page capture affected by scaling/cropping; its heading evidence is also present in snapshots and historical UAT.
- `console.json` contains Scalar informational timing messages only; no console error was observed. `network.json` is a bounded latest-request sample; failed statuses correspond to intentionally exercised refusals/outages. After the first import, try-it 200; after the new ungranted import, try-it 403.
- Test key screenshot `09` is taken after dismissing the one-time key dialog and shows only its last four characters. Try-it screenshots show a masked input and closed code snippet.

## Coverage boundary and cleanup

This UAT rewalk covers every story and the visible cases listed above. It does not claim another complete independent run of concurrent first-admin submissions, token encryption-at-rest inspection, reconcile repair/revoke under outage, tag cleanup, every timeout variant, or the actual baseline upgrade; current automated QA and historical UAT in the spec supply those branches. No new no-cache quickstart benchmark or human reading-time claim is made. The Test message is unambiguous about not saving, and the expanded changes notice stays visible, though reading it still takes substantial scrolling on mobile.

Only `spec005uat` containers, its owned database volume and the two uniquely named application images are removed after the run. Shared downloaded third-party images/caches are retained. No other worktree or project is touched.
