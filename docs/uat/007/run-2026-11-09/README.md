# Spec 007 UAT — 2026-11-09 UTC (in progress)

Tester: Codex, dispatched user-tester for JSO-235. Browser: Orca built-in browser, portal page `ba7741c8-057b-4d3b-b70b-02b2dd6eb7ff`, Mailpit page `89791e72-41ca-4497-8ea9-85f348a43532`.

The existing `qa007r2` isolated Compose stack was initially healthy (portal 13000, server 14000, proxy 18000, Mailpit 18025). It was reused; this run did not measure a fresh quickstart. Root-level screenshots in the parent directory predate this run and are not claimed as this tester's observations.

## Observed so far

- Signed out the retained Alice test account, created `uat007-nov9@example.test` through the signup form with disposable test credentials, and reached the empty My apps screen.
- Profile shows the new account as Not verified, with clear explanation, resend and change-email actions (`01-profile-unverified.png`).
- Opened the new verification message in Mailpit's HTML viewer: expected greeting, recipient, portal host, verification action and 24-hour expiry copy. No screenshot of the message is retained because it visibly includes its bearer link. The link has not been redeemed.
- Activated resend, but its success was not confirmed; `02-resend-success.png` is an action-time capture, **not evidence of successful resend** (filename retained for audit).
- Opened account navigation with keyboard Enter and signed out. Admin login with documented quickstart credentials stalled on Signing in. Browser network recorded `POST /api/auth/sign-in/email` status 500; console had no entries (`03-sign-in-stalled.png`, `03-runtime-health.json`).

## Runtime blocker — not established as an application defect

After sign-in stalled, `curl -I --max-time 5 http://localhost:13000/sign-in` timed out with zero bytes. Even `docker info --format '{{.ServerVersion}}'` timed out after 15 seconds; `docker compose ... ps` and `docker stats` also stopped responding. This prevents establishing an application-level cause or safely restarting/stopping the isolated stack. Coordinator assistance is required to restore the local container runtime, then the walkthrough must resume.

No acceptance criterion beyond the observations above is marked passed. Admin settings, verification gate/recovery, reset, password/name/email changes, deletion/revocation, mobile/keyboard complete journeys and their refusal states remain to walk. The spec has no open product bug at dispatch; B1 was already closed by QA, and no durable issue has been created for this unclassified local runtime failure.
