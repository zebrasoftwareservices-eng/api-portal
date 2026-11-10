# Spec 007 UAT after re-review

Date: 2026-11-09. Repository HEAD: `37ed904`. Tested in Orca's built-in browser at
`http://localhost:3000`, with real Kong/Postgres/Mailpit from the default Compose quickstart.
`docker compose -f deploy/docker-compose.yml up -d --wait` found the existing containers
running and confirmed all services healthy. This was a reused stack, not a fresh timing run;
QA's fresh 107.19-second build/start is retained in the spec's Test report.

## Story coverage and evidence

| Story | Walkthrough and result | Evidence |
| --- | --- | --- |
| Platform engineer: environment mail | Signup and resend delivered to Mailpit. Read the HTML message, its 24-hour copy and verification link; follow link; profile becomes Verified. Reset messages also delivered. PASS. | 03, 05, 08, 16 |
| Admin: SMTP | Save Mailpit:1025, None, sender UAT Portal/uat@example.com. Successful test mail arrives with saved sender; source banner switches to saved. Save mailpit:1 and test: actionable unreachable error arrives immediately (under 15 seconds). Restore settings and remove saved source. PASS. | 01, 15, 16 |
| Admin: verification required | Default off visible. Turn on and save. Fresh developer sees banner, resend action, disabled Create app and explanation. After following verification link, create two apps with active keys. Restore off. PASS. | 02, 03, 05, 10 |
| Admin: limits | Read 10/15, 3/60, 3/60 defaults. Save reset maximum 2 without restart; revisit later and confirm it persisted. Restore 3. Browser rate-limit enforcement previously walked in review-retest; raw-path and concurrency regressions remain QA evidence. PASS. | 02; previous review-retest/03-sign-in-rate-limited.png |
| Developer: signup/verification/resend | At 390×844, focus Name, type name, Tab, email, Tab, password, Enter. Dashboard arrives. Resend reports Sent; two emails visible in Mailpit. Open newest verification email and follow link. PASS. | 03, 05 |
| Developer: forgot password | Request known and unknown addresses; identical confirmation wording apart from entered address. Read reset email, use fresh link, set new password. Existing session redirects to sign-in. Old password shows incorrect-credentials error; reset password returns to profile. PASS. | 08, 09 |
| Developer: password rotation | Wrong current password gives unchanged-password error. Correct current password succeeds with other-sessions-signed-out status. PASS. | 04, 05 |
| Developer: name/email | Change name to Current Updated. Send confirmation to new email; profile retains old address pending explicit confirmation. Open confirmation link: GET alone does not change address; click Confirm new email for success. PASS. | 05, 06 |
| Developer: delete account | Create two apps/keys; API reference GET via Scalar succeeds. Both keys separately return Kong 200. Delete dialog names two apps. Escape cancels. Wrong password refuses. Stop local Kong; correct password refuses with gateway-unavailable message; restart Kong and both keys still return 200. Retry with correct password deletes account and signs out; both keys return 401. Re-register same address successfully. Only-admin deletion refused. PASS with minor U2. | 10, 11, 12, 13, 14 |

Supplemental real-Kong key checks used the keys shown once by the UI. No key or bearer token
is saved in this report. Before refusal: app one 200, app two 200; after refused deletion and
Kong restart: 200, 200; after successful account deletion: 401, 401.

## Regression checks

- U1/R3: successful saved-settings test followed by Remove saved settings → Remove settings
  immediately clears the saved-settings success result and restores the environment banner.
  PASS, screenshot 16. Earlier reports saying U1 remained open are superseded.
- R2: request a reset to the old address while email change is pending; open the reset form
  and confirm it is initially usable. In another tab confirm the new address. Submit the old
  reset form: expired-link recovery state appears and password remains unchanged. Fresh new
  mailbox reset subsequently works. PASS, screenshots 06–09.
- Previously closed backend findings B1/B2/B3/R1 remain covered by QA's passing log,
  concurrency and literal-path HTTP tests. UAT did not reclassify those internal tests as
  browser observations. No previously open durable issue exists to move in Linear.

## New minor finding U2

1. Profile → Delete account; enter a wrong password and submit.
2. Replace it with the correct password. Stop local Kong and submit again.
3. Gateway refusal is correct, but the old “This password is incorrect” text remains beside it.

Expected: clear the stale field error when retrying or after password validation succeeds.
Actual: contradictory reasons remain visible together; screenshot 11. The account and keys
are preserved, and successful deletion works after Kong restarts. Transient minor; recorded
in the spec without a durable Linear issue. Main mobile journey used 390×844; screenshot 11
uses the default browser viewport following navigation.

## New minor finding U3

Save mailpit:1 / None and send a test to receive the unreachable error. Correct the port to
1025 and save; the old error remains without being labeled as a previous test result.
Expected: clear errors on settings change, consistently with cleared success results.
Actual: screenshot 17 (1280 px desktop). The old error also persists after removing saved
settings and restoring the environment source. A new successful test clears it. Transient minor
recorded in the spec; no durable issue required.

## Browser health and limits

`browser-health.json` contains the last 50 requests and console records from the main journey,
reset and confirmation tabs. Consoles contain no errors; negative cases intentionally return
401/409/422/503. Requests have query strings and reset bearer paths redacted. Network history
is bounded, so this is not a complete traffic recording.

Signup was completed with keyboard input on mobile. Escape safely cancels deletion. Desktop
checks used 1280 px after navigation; Orca resets viewport on each full navigation, so default
viewport screenshots are labeled as such rather than claimed as 1280 px. Some offscreen Orca
clicks reported no change; focus plus Space/Enter completed the same controls. This is retained
as an automation observation, not assumed to be a product defect.

Security internals (encryption, secrets in logs, raw-path normalization, exact rate-limit
counts), SMTP authentication failure, and elapsed token expiry retain QA/earlier UAT evidence;
this pass directly exercised ordinary links, invalidated old-mailbox reset, wrong passwords,
SMTP connectivity failure and gateway refusal. No application code or tests were edited.

Final disposition: no blocker or major; spec status `review`. Account policy defaults and
SMTP environment fallback restored. Stop the default Compose stack after the run, preserving
its volumes. Existing untracked evidence directories from other workers were left untouched.
