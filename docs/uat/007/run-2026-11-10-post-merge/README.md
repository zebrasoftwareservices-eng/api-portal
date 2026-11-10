# Spec 007 post-merge user acceptance test

Date: 2026-11-10 UTC (local screenshots show Nov 10). HEAD: `c653c63`, following the
`ff5b773` merge. Tested manually through Orca's built-in browser at localhost:3000,
with real Kong 3.9.4, Postgres and Mailpit. No application code or tests changed.

## Setup and disposition

Started a new Compose project and volume with
`docker compose -p portal-007-uat-postmerge -f deploy/docker-compose.yml up -d --wait --build`.
All services became healthy in **125.74 seconds** (build layers partly reused); see
`quickstart.log`. The fresh portal opened setup, the admin was created in the browser,
the bundled Kong connection was tested/saved, and the optional sample API was published.
No existing volume was reset or removed. Both untracked Nov 9 evidence folders were left alone.

**All nine stories pass, with minor findings U2, U3 and U4. No blocker or major is open;
advance to review.** U2/U3 remain minor as directed by this dispatch. U4 is a new copy
finding recorded in the spec for this loop, without a separate stage/task issue.

## Story coverage

Screenshot names below are relative to this directory.

| Story | Browser walkthrough and result | Evidence |
| --- | --- | --- |
| Platform engineer: environment mail | Fresh setup; mail page identifies environment source. Signup, verification and reset mail arrive in Mailpit. Read the HTML messages and their expiry/recovery wording. PASS, with setup-copy minor U4. | `01-setup-stale-copy.png`, `02-environment-mail.png`, `09-verified-profile.png`, `43-environment-restored.png`, `mail-delivery-summary.json` |
| Admin: configure SMTP/test | Save mailpit:1, None, sender Post Merge UAT/uat007@example.com. Test immediately gives actionable unreachable error (under 15 s). Correct port to 1025; test delivers from saved sender. Remove saved source and confirm environment fallback. PASS with U3. | `03-u3-stale-error.png`, `04-smtp-success.png`, `05-u1-cleared.png`, `42-u3-full-page.png` |
| Admin: require verification | Default off; bootstrap admin Verified. Enable, save, then fresh developer cannot submit Create app. Follow verification email; refresh and create two apps with keys. PASS. | `06-policy-defaults.png`, `08-mobile-verification-gate.png`, `09-verified-profile.png`, `35-mobile-create-gate-scale1.png`, `39-mobile-create-ready-scale1.png` |
| Admin: limits | Defaults 10/15, 3/60, 3/60. Change sign-in/reset maxima to 2; subsequent third sign-in/reset request gets 429. Reset retains neutral confirmation. Default fourth verification resend gets 429 and a countdown. Invalid maximum 0 gets “Enter a number from 1 to 1000.” Restore all defaults. PASS. | `28-verification-rate-limit.png`, `30-signin-rate-limit.png`, `31-reset-limited-confirmation.png`, `41-policy-restored.png`, `health-signin-limit.json`, `health-reset-limit.json`, `health-resend.json` |
| Developer: signup/verify/resend | First signup at 390×844 uses typed keys, Tab and Enter. Unverified banner and blocked Create app are readable. Resend shows Sent and delivers. Verification marks profile Verified. Recreated account verifies from a signed-out browser state and automatically signs in. PASS. | `09-verified-profile.png`, `27-mobile-recreated-account.png`, `28a-verification-resend-success.png`, `34-mobile-gate-scale1.png` |
| Developer: forgot password | Open recovery; known/unknown addresses get matching confirmation wording apart from supplied email. Fresh new-address email link opens reset form; submit new password and see success. Existing session is sent to sign-in. Old password refused; new password accepted. PASS. | `17-reset-known-confirmation.png`, `18-reset-unknown-confirmation.png`, `19-reset-success.png`, `20-prior-session-signed-out.png`, `22-old-password-refused.png` |
| Developer: change password | Wrong current password is refused with unchanged-password explanation. Correct current password succeeds, clears fields and reports other sessions signed out. Rotated password signs in before later reset. PASS. | `12-password-refusal.png`, `13-name-header-password-success.png` |
| Developer: name/email | Name save immediately appears inside header account menu. Taken admin address refused with neutral copy. New address remains pending while old address still signs in. Email link opened signed out shows explicit Confirm button; GET alone does not change address. Confirm changes email, old-address login fails. An already-open old-mailbox reset form becomes expired, preserving password. PASS. | `13-name-header-password-success.png`, `14-email-pending.png`, `15-email-confirmed.png`, `16-old-mailbox-reset-refused.png`, `21-old-address-refused.png` |
| Developer: delete account | Two apps each have a live key. Dialog names two apps; Escape safely cancels. Wrong password refused. Stop real Kong, retry with correct password: gateway refusal, account retained, U2 visible. Restart Kong: both keys still 200. Successful deletion signs out, both keys become 401 and both consumers disappear. Deleted login refused; same address can sign up again. Only-admin deletion is refused. PASS with U2. | `07-last-admin.png`, `23-delete-wrong-password.png`, `24-u2-gateway-refusal-stale-password.png`, `25-account-deleted.png`, `26-deleted-login-refused.png`, `27-mobile-recreated-account.png`, `gateway-results.json` |

The merged app journey was also walked beyond account security: open the sample reference
from app detail, paste the UI-issued key into Authentication, select GET /get and Send.
The real request returned **200 OK in 154 ms** (`11-reference-request.png`). The two-app
key checks use the keys shown once by the UI; only response statuses and consumer names
are retained in `gateway-results.json`, never keys. Developer access to the admin mail
URL is refused with Page not found (`38-developer-admin-refusal.png`).

## Findings and regression checks

- **U2, still open, minor:** wrong deletion password, then correct password with real Kong
  stopped. Old “This password is incorrect” remains beside Gateway unavailable. The account
  and keys are preserved; retry works after restart. Evidence `24-u2-gateway-refusal-stale-password.png`,
  default desktop viewport 806×812. Expected: clear stale field error on retry.
- **U3, still open, minor:** save mailpit:1/None and test, then save corrected port 1025.
  Old connection error remains despite corrected settings. It also remains after removing
  saved settings; a new successful test clears it. Evidence `42-u3-full-page.png`, 1280×2200
  tall-viewport capture. Expected: clear previous test error when effective settings change.
- **U4, new, minor:** first-admin setup still says “the portal can't reset passwords yet.”
  This contradicts the shipped password-recovery journey. Expected: remove/update the stale
  hint. Evidence `01-setup-stale-copy.png`, 806×812. Does not stop setup or recovery.
- **U1/R3 remains fixed:** successful saved-settings test followed by Remove settings clears
  the old success result and restores the environment banner (`05-u1-cleared.png`).
- **R2 remains fixed:** open a valid old-address reset form before email confirmation;
  submit it after confirmation and receive the expired recovery state (`16-old-mailbox-reset-refused.png`).
- Closed B1/B2/B3/R1 internal log, literal-path and concurrency regressions retain post-merge
  QA's passing evidence; no internal claim is inferred from a browser screenshot.

## Mobile, keyboard, health and limitations

The main signup and app flow used 390×844 mobile emulation with scale 3 as the role requests.
Visual inspection found Orca's scale-3 screenshots tile portions of the page; they are retained
as raw capture evidence, not classified as a product layout defect. Repeated the sign-in,
unverified Create app, header Profile/Sign out, profile and verified Create app/detail views
at the same 390×844 viewport with scale 1. These capture cleanly (`32`–`40`); document and
body width both measure 390 px, without horizontal overflow. `34` supersedes its earlier
capture after the intentionally lowered sign-in budget was exhausted: restoring default 10
lets the recreated account sign in successfully. Header Profile is reachable inside the
mobile account disclosure. Screenshots without explicit viewport setup use Orca's 806×812
default desktop; full navigations reset viewport. These are not claimed as 1280 px captures.

Keyboard typed signup with Tab/Enter, focused form submission, visible field validation,
and Escape to dismiss the delete dialog/menu were exercised. Some offscreen Orca clicks
reported unchanged; focus plus Enter consistently completed the same controls. Mailpit's
back-to-inbox navigation was used when direct URL navigation restored an older selected
message. These are automation observations, not inferred application defects.

`health-*.json` records bounded last-50 request/console windows after the journeys. All
captured consoles have zero error entries. Non-2xx requests are intentional negative cases:
wrong passwords, taken email, invalidated reset, rate limits, gateway outage, SMTP failure
and protected admin navigation. Link query tokens, bearer reset paths and key strings are
redacted. `mail-delivery-summary.json` retains only sender/recipient/subject/date metadata;
no unknown-address reset email was delivered. Default verification signup plus three resends
were delivered, and the fourth resend was refused. Changed reset maximum 2 produced two
new-address reset deliveries and a third-request 429 with the same confirmation.

This UAT directly verifies user-facing results. SMTP authentication failure, encryption/log
redaction, exact Retry-After/problem structure, elapsed one-hour expiry, independent-device
session revocation, upgrade fixtures and no-mail-server configuration retain QA evidence.
Links were tested signed out in the same Orca default profile; an independent second browser
profile was not provisioned. No claim of an exhaustive device/accessibility audit is made.

The initial full-page Orca capture also had a compositor artifact (`42a`); it is retained.
Briefly resumed the same volume to replace it with a clean 1280×2200 viewport screenshot
(`42-u3-full-page.png`) and a text snapshot (`u3-after-corrected-save.txt`), then restored
environment mail and stopped the stack again.

Final cleanup: deleted the recreated developer and its supplemental mobile evidence app,
restored verification off and 10/15, 3/60, 3/60 limits, removed saved SMTP settings and sent a
successful environment-source test (`43-environment-restored.png`). Stopped the dedicated
Compose project with `down`, preserving its volume. No approval or merge gate was passed.
