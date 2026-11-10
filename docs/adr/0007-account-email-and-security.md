# ADR 0007 — Account email and security: SMTP with nodemailer, settings in Postgres, limits in front of Better Auth

- Status: Proposed (accept by merging)
- Date: 2026-11-08
- Spec: 007-email-and-account-security

## Context
Spec 007 adds the portal's first outgoing email (verification, password reset, email change and a
test email) and the account features that depend on it. Each install brings its own SMTP account.
Saved admin-UI settings win over `SMTP_*` environment variables, which is how the quickstart reaches
Mailpit. The admin sets the rate limits in the UI, and they apply without a restart. Better Auth
1.3.34 already handles sign-in and sessions. It also has verification, reset, change-password,
change-email and delete-user flows, but three of them don't meet the spec as shipped:
- **Change email:** for an unverified user, `change-email` switches the address at once, before any
  link is opened (checked in the 1.3.34 source). AC 7 says the old address stays until the link is
  opened.
- **Delete user:** `delete-user` knows nothing about Kong, the last-admin rule or "refuse while the
  gateway is down".
- **Rate limits:** Better Auth's limiter counts per IP, its rules are fixed at start-up and it is off
  in development. The spec counts per email address or account, and the admin changes the limits at
  runtime.

## Decision
1. **SMTP only, through nodemailer.** It's the standard Node SMTP client, it handles STARTTLS and
   implicit TLS, and it has no native code. There's no provider abstraction: every provider offers
   SMTP (spec, Out of scope). A new transport is built for each send from the effective settings,
   so a change applies to the next email without a restart.
2. **Settings live in Postgres singletons, with the environment as fallback.** `mail_settings` holds
   the saved SMTP settings, with the password encrypted with AES-256-GCM using `PORTAL_ENCRYPTION_KEY`
   (the same scheme as gateway admin tokens). `account_settings` holds "Require a verified email" and
   the three limits. One row is read per request, so no cache needs invalidating. When
   `mail_settings` has no row and `SMTP_HOST` and `SMTP_SENDER_ADDRESS` are set, the environment is
   used. Otherwise mail isn't configured.
3. **Account email goes through a pg-boss queue; the test email doesn't.** Verification, reset and
   change emails are queued (`send-email`, retried with backoff), so a request takes the same time
   whether or not an address has an account, and an SMTP outage doesn't fail sign-up. The link in
   the job payload is encrypted, and completed jobs are deleted after an hour. The worker drops a
   verification email for a user who is missing or already verified. That also covers the bootstrap
   admin, whose sign-up would otherwise queue one. The admin's test email is sent in the request with
   a 15-second limit, so the admin sees the result straight away.
4. **Better Auth keeps sign-up, sign-in, verification, password reset and change password.** It is
   configured with `sendOnSignUp`, `autoSignInAfterVerification`, `revokeSessionsOnPasswordReset`
   and a one-hour reset token. Verification links last 24 hours. `requireEmailVerification` stays off:
   unverified users can sign in, and the server enforces the admin's rule at app and key creation.
5. **The portal owns email change and account deletion** (`/v1/me/email`, `/v1/me/email/confirm`,
   `DELETE /v1/me`). Better Auth's `change-email` and `delete-user` stay disabled. An email change is
   a row in `email_change_requests`: a 32-byte random token stored as a SHA-256 hash, single use,
   24 hours, one pending change per user. Deletion removes Kong consumers through the existing
   `deleteConsumer`, one app at a time, before any account row is deleted, and is refused if a
   gateway health check fails first.
6. **The limits are a Fastify layer in front of `/api/auth/*`, stored in Postgres.** Each counted
   event is a row in `rate_limit_hits`: the bucket, a SHA-256 of the normalized email or user ID,
   and a timestamp. Limits use a sliding window counted with one indexed query. Every server
   instance shares the same counts, and no Redis is needed. `Retry-After` is how long until the
   oldest hit in the window expires. Better Auth's old `forget-password` route is blocked so the reset
   limit can't be bypassed. A wrong password on `change-password` or `DELETE /v1/me` counts as a
   failed sign-in.

## Consequences
- One new runtime dependency (nodemailer) and one new compose service (Mailpit, for the quickstart
  only).
- The limits cost a Postgres insert and count per counted request. That's fine at portal scale.
  A housekeeping job deletes hits older than 24 hours (the longest window an admin can set).
- With no saved settings and no environment, account email isn't sent. Sign-up still works, and the
  admin can't require verification until mail is set up.
- Two-factor login (the follow-up spec) adds its recovery email to the same queue.
- Upgrading Better Auth needs a check that the routes the portal relies on, and the routes it
  blocks or disables, haven't changed.
