# Spec 007 final UAT

2026-11-10, HEAD `e76b0e6`. Result: PASS for all nine stories in this final browser pass;
M1, M2, M3/U4, U2 and U3 are confirmed fixed. No new product finding and no open
blocker/major. The spec moves to `review`; approval and merge remain Elango's gates.

Used Orca's built-in browser with the existing healthy `qa007verify` Compose stack at
localhost:3000 and Mailpit at localhost:8025, reusing `/tmp/007-final-compose.yaml` as directed.
The QA stack was already healthy, so this pass does not claim a fresh quickstart timing.
QA's fresh Compose and automated acceptance evidence in the spec remains applicable.

## Story walkthrough

| Story | Browser result | Evidence in this directory |
| --- | --- | --- |
| Platform engineer: environment mail | PASS. Environment source is shown; a separate fresh no-gateway install sends signup and resend through its environment Mailpit. Both messages have the default Developer Portal sender. | `01-environment-desktop.png`, `28-mail-fallback-restored.png`, `31-environment-resend.png`, `environment-mail.json` |
| Admin: SMTP settings/test | PASS. Save mailpit:1/None with sender Final UAT; test produces actionable unreachable error immediately. Save port 1025: old error disappears before sending again. Successful test arrives in Mailpit from Final UAT; remove saved settings restores environment fallback. | `04-smtp-error.png`, `05-smtp-error-cleared.png`, `06-smtp-test-success.png`, `28-mail-fallback-restored.png` |
| Admin: verification required | PASS. Default off and bootstrap admin Verified. Enable and save; mobile developer sees verification banner and disabled Create app. Following Mailpit link marks profile Verified; app creation succeeds and yields keys. Restore off. | `07-account-defaults.png`, `08-policy-saved.png`, `10-delete-error-cleared-last-admin.png`, `11-mobile-verification-gate.png`, `13-verified-profile.png` |
| Admin: rate limits | PASS. Read 10/15, 3/60, 3/60 defaults. Change reset maximum to 2 and save; revisit confirms it persisted without restart. Restore 3. A new account's fourth verification resend shows the 60-minute limit; response 429 is captured in network evidence. | `08-policy-saved.png`, `27-policy-restored.png`, `35-verification-limit.png`, `browser-health.json` |
| Developer: signup/verify/resend | PASS. At 390×844, type Name, Tab, Email, Tab, Password, Enter; signup succeeds. Read delivered verification mail and follow its link: Verified profile. Environment resend also reports Sent and delivers a second message. | `11-mobile-verification-gate.png`, `13-verified-profile.png`, `31-environment-resend.png`, `34-mobile-recreated-account.png` |
| Developer: forgotten password | PASS. Known/unknown requests show matching neutral confirmation. Read reset mail in Mailpit, open its link and set a new password. Prior session goes to sign-in; old password refused and new accepted. Reopening used link offers Send a new link. | `18-reset-known.png`, `19-reset-unknown.png`, `20-reset-success.png`, `21-prior-session-signed-out.png`, `22-old-password-refused.png`, `33-used-reset-link.png` |
| Developer: signed-in password rotation | PASS. Wrong current password shows unchanged-password refusal. Correct current password succeeds, clears fields and reports other sessions signed out. | `14-password-submit-pending.png` (pending capture only), `15-name-password-updated.png`; refusal directly read in browser snapshot |
| Developer: profile name/email | PASS. Name saves as Final Updated. New address remains pending while old address stays current. Open delivered confirmation link: explicit button required; submitting shows new address and next navigation uses it. | `15-name-password-updated.png`, `16-email-pending.png`, `17-email-confirmed.png` |
| Developer: delete/revoke | PASS. Two apps each issue a key. Wrong password refuses. Stop real Kong: correct retry refuses without stale password error. Restart: both keys still 200. Successful deletion signs out; both keys become 401; deleted credentials refuse; same email registers a new account. Last admin remains protected. Fresh no-gateway developer also deletes successfully. | `10-delete-error-cleared-last-admin.png`, `23-delete-wrong-password.png`, `24-gateway-refusal-error-cleared.png`, `25-account-deleted.png`, `26-deleted-login-refused.png`, `30-no-gateway.png`, `32-no-gateway-account-deleted.png`, `34-mobile-recreated-account.png`, `gateway-results.json` |

## Required regression confirmations

- **M1:** create fresh admin, skip gateway connection, confirm Gateways is empty, register a
  developer, delete with correct password. Browser returns to signed-out catalog with account
  deleted confirmation; no gateway-unavailable refusal. `30`, `32`.
- **M2:** at 1280×844 Mail has one Admin section with APIs, Gateways, Mail and Accounts.
  At 390×844 it becomes one native select with those four options. No stacked navigation.
  Accounts and the fresh install's APIs/Gateways also show the single shared navigation.
  `01`, `02`, `03`, `07`, `30`.
- **M3/U4:** fresh first-admin setup says exactly “At least 8 characters.” No claim that reset
  is unavailable. `29-setup-password-hint.png`.
- **U2:** wrong password, then correct password against a real stopped Kong: only Gateway
  unavailable remains. Correct-password retry as last admin also clears the wrong-password
  error before showing only the last-admin refusal. `10`, `23`, `24`.
- **U3:** unreachable mail test, correct port, save: previous error disappears before a new
  test. New test succeeds. Environment fallback is restored afterward. `04`, `05`, `06`, `28`.
- **U1/R3:** removing saved settings clears the saved-source test success result. `28`.

All Bugs checkboxes were already closed by QA. No keyed open bug required a Linear transition;
no new durable issue was warranted.

## Health, evidence limits and cleanup

`browser-health.json` is a bounded final capture (last 50 requests per page), with query strings,
reset bearer paths and key-like values redacted. All three captured consoles are empty. Failed
requests belong to intentional negative journeys, including verification 429; this capture is
not a complete traffic trace. The two UI-issued keys were checked by supplemental HTTP calls
against real Kong; `gateway-results.json` contains status codes only, never keys.

Mobile signup used 390×844, scale 3 initially; clean visual evidence repeats at scale 1.
Viewport is reapplied after navigation. Desktop navigation was explicitly checked at 1280 px;
other full-navigation screenshots retain Orca's default 806×812 unless a viewport was reapplied.
Keyboard Tab/Enter completed signup, Enter submitted offscreen form controls, and Escape
closed the admin delete dialog. Orca clicks on some offscreen controls returned unchanged;
focus plus Enter completed them, so those automation no-ops are not classified as product bugs.
Screenshots `09` and `14` capture pending states, not final refusal states.

The setup/no-gateway check used the same built QA images in a separate four-service install at
localhost:13000, with dedicated `uat007final` database/network and Mailpit on localhost:18025.
An initial generated Compose configuration retained the default volume/network names and
failed with an existing-table migration error; its four temporary containers were removed and
resource names corrected before the fresh check. This was a harness configuration error, not a
product regression; no existing volume was deleted. `isolated-start.log` records the successful
fresh start. This reduced install proves setup/no-gateway behavior, not the full Kong quickstart SLO.

SMTP authentication failure, encrypted storage/logging, exact rate-limit counts/headers,
raw-path/concurrency security, elapsed expiry, independent-device revocation and consumer-tag
removal retain QA evidence. This final pass directly checks ordinary links, used-link refusal,
password errors, connectivity failure and key 200→401 behavior; it does not claim to repeat every
internal assertion or the API-reference request browser flow from prior UAT.

Policy defaults and environment mail fallback were restored. The initial and recreated main
accounts and the isolated developer were deleted. Both Compose projects were stopped with
volumes preserved (`qa-stop.log`, `isolated-stop.log`). The two pre-existing untracked Nov 9
folders were left alone. No application code or automated tests were edited.
