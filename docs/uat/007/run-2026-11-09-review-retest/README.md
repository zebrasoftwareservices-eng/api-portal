# Spec 007 UAT — review-fix re-test, 2026-11-09

Browser: Orca built-in browser. Stack: QA's isolated `qa007r3` Compose project with real
Postgres, Kong and Mailpit (portal `localhost:13000`, server `:14000`, proxy `:18000`, Mailpit
`:18025`). QA had already completed a fresh-volume quickstart in 249.19 seconds and left this
healthy stack for the focused UAT re-test.

## Result

- Quickstart admin sign-in succeeded and reached My apps. The browser showed a 200 sign-in
  request, no console errors and normal follow-up app loading.
- For disposable address `burst-user-20261109@example.test`, ten quick wrong-password submissions
  returned 401 and the next returned 429 `application/problem+json`. The page cleared the password
  and explained: "Too many sign-in attempts for this address. Try again in 15 minutes."
- A correct admin sign-in immediately afterward succeeded, confirming the burst did not starve the
  database pool or make the portal unresponsive. QA's real-Postgres regression separately covers
  simultaneous batches larger than the ten-connection pool and noncanonical sign-in paths.
- Smoked the Admin Accounts screen (verification off; 10/15, 3/60 and 3/60 defaults), verified
  profile screen, unknown-address password-reset confirmation, and the saved SMTP test/removal
  journey. The reset copy did not reveal whether the disposable address has an account.
- Restored environment SMTP fallback after the saved-settings test. Final browser console was
  clean; observed failed requests were the expected 401/429 refusal responses.
- The complete pre-fix UAT walkthrough and mobile/keyboard journey remain in
  `../run-2026-11-09-final/`; these review fixes were backend-only and this run focused on their
  affected sign-in behavior plus smoke coverage of the other journeys.

## Finding re-test

U1 remains reproducible (minor, frontend): after a successful test using saved Mailpit settings,
removing them correctly restores the environment-settings banner but leaves the old status saying
the message used the saved settings. Evidence: `04-u1-still-reproducible.png`. No blocker or major
was found.

## Evidence

- `01-sign-in-success.png` — successful quickstart admin sign-in / responsive My apps screen.
- `02-failed-sign-in-rate-limited.png` — designed 429 message after ten failed attempts.
- `03-saved-smtp-test-success.png` — successful test through temporarily saved Mailpit settings.
- `04-u1-still-reproducible.png` — environment fallback restored while stale saved-source result remains.
- `05-profile-smoke.png` — verified admin profile and account controls after the sign-in burst.
- `06-unknown-reset-confirmation.png` — privacy-preserving reset confirmation for an unknown address.
