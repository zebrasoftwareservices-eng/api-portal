# Spec 007 UAT — final run, 2026-11-09

Browser: Orca built-in browser. Stack: fresh default `deploy/docker-compose.yml` quickstart with
real Postgres, Kong and Mailpit at `localhost:3000`, `:8000` and `:8025`.

## Result

- Fresh `docker compose up -d --build --wait` completed healthy in **163.52 seconds**, under the
  five-minute requirement.
- Walked all nine user stories at 1280 px. The primary signup journey was repeated at 390×844
  using Tab, typed keys and Enter only; Escape safely closed the delete dialog.
- Environment SMTP delivered signup, verification and reset mail to Mailpit. Saved Mailpit SMTP
  settings then took precedence, sent a test message, and were removed to restore the environment
  fallback.
- Enabled required verification and changed the reset limit from 3 to 2 without a restart. An
  unverified developer saw the banner and disabled Create app action; after opening the verification
  email, the same action succeeded. Settings were restored to required-verification off and reset
  limit 3 at the end.
- Changed the developer's name, password and email; verified wrong-password refusals, old-password
  failure, new-password success, neutral unknown-address reset confirmation and used-link expiry.
- Created two apps with one active key each. Both keys returned 200 through Kong before account
  deletion and 401 afterward. The deleted address then signed up again successfully in the mobile
  keyboard journey.
- The bootstrap admin's last-admin deletion was refused with the designed explanation.
- Browser console checks were clean. Network failures observed were expected refusal responses
  (401/403); no unexpected 5xx was seen.

## Finding

U1 (minor, frontend): after **Remove saved settings**, the source banner correctly changes back to
environment settings, but the old result line still says the last test email used the saved settings.
Screenshot: `23-stale-saved-test-result.png`. Expected: clear the test result when the effective mail
source changes, or update it so the page cannot present two contradictory current states. This is
confusing copy/state, not a blocked journey, and has no Linear issue under the durable-issue rules.

The earlier `run-2026-11-09/` directory documents an interrupted attempt when Docker Desktop stopped
responding. Docker was healthy for this final run; that interruption was not reproduced and is not
classified as a product defect.
