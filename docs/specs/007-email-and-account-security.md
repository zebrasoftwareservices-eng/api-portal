---
id: 007
title: Email and account security
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-08
linear: JSO-235
linear_stages: 
---

# 007 — Email delivery, verification, password reset and account deletion

## Summary
The portal sends email through SMTP the admin configures, so developers and admins can verify
their address, reset a forgotten password and delete their own account, and an admin can
require a verified address before anyone gets a key.

## Problem
Today a portal account is only an email and a password (spec 001 ships with no email at all).
That blocks real use:

- **A forgotten password is a dead end.** The developer has to ask an admin, and there is no
  admin tool for it either, so in practice they sign up again under another address and lose
  their apps and keys.
- **Anyone can get a key with an address they don't own.** A platform engineer can't tell
  who holds a key, which is a blocker for putting the portal in front of a real gateway, and
  for the public sign-up on the hosted demo (spec 006 deferred this here).
- **People can't leave.** There is no way to delete an account, and nothing removes that
  person's consumers and keys from Kong.
- **Teams (spec 008) need email** to send invites, so this spec comes first.

We'll know it's solved when, on a fresh `docker compose up`, the sign-up email arrives in
Mailpit, a password reset works end to end, and deleting an account makes its keys stop
working in Kong.

## Users
- **API consumer (developer):** signs up, verifies, resets a password, edits and deletes their
  own account.
- **Portal admin:** configures how the portal sends mail, decides whether verification is
  required and sets the rate limits. Admins use the same account features as developers.
- **Platform engineer:** runs the install, can set SMTP through environment variables as a
  fallback, and needs every key to belong to a verified, removable person.

## Decisions (Elango, 2026-11-08)
- **SMTP is configured per install in the admin UI:** host, port, security (none, STARTTLS or
  TLS), username, password, sender name and sender address, plus a "Send test email" action.
  Each company uses its own provider; the portal has no built-in provider, and the hosted demo
  gets none either. The SMTP password is encrypted at rest and never returned by any API.
- **Precedence:** once SMTP settings are saved in the admin UI they win. Environment variables
  are the fallback, which is how the quickstart reaches Mailpit. While the environment settings
  are in use, the admin mail form says so.
- **"Require a verified email"** is an admin-UI setting, **off by default**.
- **Accounts that exist before the upgrade, including the bootstrap admin, count as verified**,
  so turning the setting on never locks out someone who already has keys.
- **Account deletion is refused while Kong is unreachable.** The gateway holds the state and
  the portal is a view of it, so the portal must not delete an account whose keys it can't yet
  remove from Kong (same rule as app creation in specs 001 and 004).
- **Rate limits are set by the admin in the admin UI.** Defaults:

  | Limit | Default | Counted per |
  | --- | --- | --- |
  | Failed sign-in attempts | 10 in 15 minutes | email address |
  | Password reset emails | 3 per hour | email address |
  | Verification emails (resend and email change) | 3 per hour | account |

  Over a limit the request gets a 429 problem+json with a `Retry-After` header. The reset page
  still shows its usual confirmation, so a limit never reveals whether an address has an account.

## User stories
- As a platform engineer, I want the quickstart to send every email to Mailpit from
  environment settings, so that email works locally with no outside account.
- As a portal admin, I want to set SMTP in the admin UI and send a test email, so that my
  company's own mail provider sends portal email without a redeploy.
- As a portal admin, I want to require a verified email address before a developer can create
  apps, so that every key belongs to an address someone owns.
- As a portal admin, I want to set limits on sign-in attempts and on reset and verification
  emails, so that the portal can't be used to guess passwords or flood an inbox.
- As a developer, I want a verification email when I sign up, and a way to send it again,
  so that I can prove my address.
- As a developer, I want to reset a forgotten password from the sign-in page, so that I don't
  lose my apps and keys.
- As a developer, I want to change my password while signed in, so that I can rotate it.
- As a developer, I want a profile page where I can change my name and email, so that my
  account stays current.
- As a developer, I want to delete my account and have my keys revoked in the gateway, so that
  nothing I leave behind keeps working.

## Acceptance criteria
QA runs these end to end against the docker compose stack (real Kong, Postgres and Mailpit),
reading every email from Mailpit's API. Wording for screens and emails comes from the ui-designer.

1. **Given** a fresh `docker compose -f deploy/docker-compose.yml up` with no SMTP saved in the
   admin UI **When** a visitor signs up **Then** within 30 seconds a verification email to that
   address appears in Mailpit (sent through the environment SMTP settings), opening its link marks
   the address verified (the profile page shows it as verified), the admin mail form says the
   environment settings are in use, and the quickstart still reaches a working portal in under
   five minutes.
2. **Given** an admin on the mail settings page **When** they save host, port, security, username,
   password, sender name and sender address and send a test email **Then** the test email arrives
   at the address they entered from that sender, later portal email uses these settings instead of
   the environment ones, and the SMTP password is stored encrypted, never shown again, never
   returned by any API and never written to logs. **If** the SMTP host can't be reached or rejects
   the login **Then** within 15 seconds the admin sees an error saying which (unreachable, or
   authentication failed) and the message contains no password.
3. **Given** a fresh install **When** an admin opens the account settings **Then** "Require a
   verified email" is off, and accounts created before the upgrade (including the bootstrap
   admin) show as verified. **Given** the admin has turned it on and a developer has not verified
   **When** that developer tries to create an app, in the UI or with `POST /v1/apps` **Then** it is
   refused with a 403 problem+json and a message offering to resend the verification email, no app
   or Kong consumer is created, and after they open a freshly sent link the same request succeeds.
   **If** no working SMTP settings exist (neither saved nor from the environment) **Then** the
   admin can't turn the setting on and is told to set up mail first.
4. **Given** a developer who forgot their password **When** they request a reset from the
   sign-in page, open the link from Mailpit and set a new password **Then** they can sign in
   with the new password, not with the old one, and their other signed-in sessions are signed
   out. **When** the reset is requested for an address with no account **Then** the page shows
   the same confirmation and no email is sent.
5. **Given** a password reset link that has already been used, or is more than one hour old
   **When** someone opens it and submits a new password **Then** they see that the link has
   expired with a way to request a new one, and the password is unchanged.
6. **Given** a signed-in developer on the profile page **When** they change their password with
   the correct current password **Then** the new password works, the old one doesn't, and their
   other sessions are signed out. **If** the current password is wrong **Then** the change is
   refused and the password is unchanged.
7. **Given** a developer on the profile page **When** they change their name **Then** the new name
   shows across the portal. **When** they change their email **Then** a verification email goes to
   the new address, the account keeps the old address and can sign in with it until the link is
   opened, and afterwards it signs in only with the new address. **If** the new address already
   belongs to another account **Then** the change is refused without revealing more than that the
   address can't be used.
8. **Given** the default rate limits **When** someone fails to sign in to one address 10 times in
   15 minutes, or requests a fourth reset email (or a fourth verification email) for one address
   within an hour **Then** the next attempt gets a 429 problem+json with `Retry-After`, no further
   email reaches Mailpit, and the reset page shows its usual confirmation. **When** the admin
   changes a limit in the admin UI **Then** the new value applies to the next request without a
   restart.
9. **Given** a developer with two apps that each have an active key **When** they delete their
   account, confirming with their password **Then** both keys get 401 from Kong, no Kong consumer
   tagged with those apps remains, they are signed out and can't sign in, and the same email
   address can sign up again as a new account. **If** Kong's Admin API is unreachable **Then**
   deletion is refused with the "gateway unavailable, try again" error, nothing is deleted and the
   keys still work. **If** they are the only admin **Then** deletion is refused with a message
   saying another admin must exist first.

## Out of scope
- **Two-factor login and recovery codes** — moved to a follow-up spec in the backlog (listed
  in `docs/roadmap.md`, number not yet reserved). It covers turning on an authenticator app (TOTP) with a QR code
  or typed key, one-time recovery codes, the code step at sign-in, turning it off, and asking for
  a code when deleting an account. **Decided for that spec:** a developer who loses both the
  authenticator and the recovery codes recovers access by email (a link to their verified
  address), so it builds on this spec's mail transport. Making two-factor login mandatory stays
  with spec 015.
  **Linear issue pending:** "Two-factor login and recovery codes (follow-up to spec 007)":
  Backlog, label Feature, priority Medium, project API Portal. Linear's free-plan limit
  rejected it on 2026-11-08; create it once there is room.
- **Admin tools to manage other people's accounts** (reset someone's password, verify or delete
  another user). These belong with staff roles and the audit log in spec 015.
- **Passkeys, SMS codes and magic-link sign-in.**
- **Social login and bring-your-own OIDC.** Later spec (see AGENTS.md).
- **A built-in or bundled mail provider**, including for the hosted demo. Each install brings its
  own SMTP account; the quickstart uses Mailpit.
- **Email providers other than SMTP** (SES, SendGrid and similar APIs). All of them offer SMTP.
- **Custom email templates edited in the admin UI.** The ui-designer designs fixed templates;
  editing belongs with the theme editor (spec 013).
- **Team invites and team-owned apps.** Spec 008. Until then, apps belong to one person, so
  deleting an account deletes that person's apps.
- **Notification emails** (key created, key revoked, access approved). Later specs add them on
  top of this mail transport.
- **Exporting account data** before deletion.

## Open questions
All answered by Elango on 2026-11-08 (see Decisions above).
- [x] **Should this ship as one pull request?** Yes, after the first scope cut listed under
  Out of scope. Account deletion stays in 007.
- [x] **Is "Require a verified email" off or on by default?** An admin-UI setting, off by default.
- [x] **What happens to accounts that exist before the upgrade?** They, and the bootstrap admin,
  count as verified.
- [x] **Which SMTP provider does the hosted demo use?** None built in: each install's admin sets
  their own SMTP in the admin UI.
- [x] **When both environment variables and admin UI settings exist, which wins?** Saved admin-UI
  settings win; the environment is the fallback, and the form shows when it is in use.
- [x] **Account deletion when Kong is down?** Refused (criterion 9): the gateway holds the state
  and the portal is a view of it.
- [x] **Account recovery when a second sign-in factor is lost?** By email; recorded with the
  follow-up under Out of scope.
- [x] **Rate limits?** Set by the admin in the admin UI, with the defaults in Decisions.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Lasting choices and their reasons are in [ADR 0007](../adr/0007-account-email-and-security.md).
Contract: `apps/server/openapi.yaml` (updated in this stage).

### Choices the spec didn't make; Elango may want to look at these
- **Keys as well as apps.** With "Require a verified email" on, an unverified user can't create apps
  (AC 3) or issue new keys on an app they already have (`POST /v1/apps/{id}/credentials`). The
  Summary says "before anyone gets a key", so both are gated. Keys they already hold keep working.
- **The sign-up email doesn't count** toward the verification limit. Only resends and email
  changes do ("requests a fourth verification email" in AC 8).
- **Verification and email-change links last 24 hours.** Reset links last 1 hour (AC 5).
- **A wrong password counts as a failed sign-in** when changing the password or deleting the
  account. Otherwise a stolen session could be used to guess the password without limit.
- **A successful sign-in clears that address's failed-sign-in count.**
- **"Working SMTP settings" (AC 3) means configured**: saved in the admin UI, or `SMTP_HOST` and
  `SMTP_SENDER_ADDRESS` set. The server doesn't contact the SMTP server when the setting is turned
  on; the test email is the check. Removing the saved settings is refused if that would leave
  verification required with no mail.
- **Email change and account deletion are the portal's own endpoints**, not Better Auth's: its
  `change-email` switches an unverified user's address at once, which breaks AC 7 (ADR 0007).

### Components
| Component | Change | Why |
| --- | --- | --- |
| `packages/db` | New tables `mail_settings`, `account_settings`, `email_change_requests`, `rate_limit_hits`; migration marks existing users verified and makes `apis.created_by` `ON DELETE SET NULL` | Settings, AC 3, AC 7, AC 8; deleting an admin who imported APIs must not fail the foreign key |
| `apps/server/src/config.ts` | `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURITY` (`none`/`starttls`/`tls`, default `starttls`), `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_SENDER_NAME` (default `API Portal`), `SMTP_SENDER_ADDRESS` | Environment fallback (AC 1) |
| `apps/server/src/mail/` (new) | `settings.ts` (effective settings, encrypt and decrypt), `transport.ts` (nodemailer, timeouts, error mapping), `templates.ts` (fixed text and HTML from the UX design), `queue.ts` (`send-email` pg-boss queue and worker) | AC 1, 2 |
| `apps/server/src/auth.ts` | Better Auth options: `emailVerification` (`sendOnSignUp`, `autoSignInAfterVerification`, `expiresIn: 86400`, `sendVerificationEmail` enqueues), `emailAndPassword` (`sendResetPassword` enqueues, `resetPasswordTokenExpiresIn: 3600`, `revokeSessionsOnPasswordReset: true`). `requireEmailVerification` stays false. `requireUser` gains `requireVerified` | AC 1, 3, 4, 5 |
| `apps/server/src/auth-limits.ts` (new) | Rate limits and route rules in front of `/api/auth/*` (see Rate limits) | AC 6, 8 |
| `apps/server/src/account.ts` (new) | `PATCH /v1/me`, `POST /v1/me/email`, `POST /v1/me/email/confirm`, `DELETE /v1/me`; `GET /v1/me` moves here and gains fields | AC 1, 6, 7, 9 |
| `apps/server/src/admin-settings.ts` (new) | `/v1/admin/settings/mail` (GET, PUT, DELETE), `/v1/admin/settings/mail/test`, `/v1/admin/settings/accounts` (GET, PUT) | AC 2, 3, 8 |
| `apps/server/src/apps.ts` | `requireUser(..., { requireVerified: true })` on `POST /v1/apps` and `POST /v1/apps/{id}/credentials`, before any Kong call | AC 3 |
| `apps/server/src/startup.ts` | Create the `send-email` and hourly `auth-housekeeping` queues; create the bootstrap admin already verified, without Better Auth's sign-up hooks | AC 1, 3, 8 |
| `apps/server/src/app.ts` | Register the new routes; route `/api/auth/*` through `auth-limits`; add log redaction for `newPassword`, `currentPassword`, `token`, `smtpPassword` | No secrets in logs (AC 2) |
| `deploy/docker-compose.yml` | Add a `mailpit` service (`axllent/mailpit`, pinned to an exact v1 tag) with SMTP on 1025 and the UI and API on `127.0.0.1:8025`; set the server's `SMTP_*` to it. The server starts without waiting for it | AC 1 |
| `apps/portal` | Forgot and reset password pages, verify-email result, email-change confirm page, profile page, admin mail and account settings pages, verification banner and 403 handling on Create app and New key | Screens in the UX stage |
| `packages/sdk` | Regenerated | Contract changed |

New dependency: **nodemailer** (plus `@types/nodemailer`), the standard Node SMTP client with
STARTTLS and TLS support and no native code. No adapter-sdk or adapter-kong changes.

### API contract
All in `apps/server/openapi.yaml`. Error `type`s are listed per operation there.

| Operation | Purpose | Errors |
| --- | --- | --- |
| `GET /v1/me` | Adds `emailVerified`, `pendingEmail`, `verificationRequired` | 401 |
| `PATCH /v1/me` | Change name (AC 7) | 400, 401 |
| `DELETE /v1/me` `{ password }` | Delete account (AC 9); 204 clears the session cookie | 403 `invalid-password`, 409 `last-admin`, 429, 502, 503 `gateway-unavailable` |
| `POST /v1/me/email` `{ newEmail }` | Start email change; 202 with the updated `User` | 409 `email-unavailable`, 429 |
| `POST /v1/me/email/confirm` `{ token }` | Finish email change, no session needed | 400 `link-expired`, 409 `email-unavailable` |
| `POST /v1/apps`, `POST /v1/apps/{id}/credentials` | New 403 when verification is required and missing | 403 `email-not-verified` |
| `GET/PUT/DELETE /v1/admin/settings/mail` | SMTP settings; `source` is `saved`, `environment` or `none`; password write-only | DELETE 409 `mail-required` |
| `POST /v1/admin/settings/mail/test` `{ to }` | Synchronous test email, 15 s limit (AC 2) | 409 `mail-not-configured`, 422 `smtp-unreachable` / `smtp-auth-failed` / `smtp-rejected` |
| `GET/PUT /v1/admin/settings/accounts` | `requireVerifiedEmail`, `rateLimits`, read-only `mailConfigured` | PUT 409 `mail-not-configured` |

**Better Auth routes** (documented in the contract's description, not as paths). The portal uses
`sign-up/email`, `sign-in/email`, `sign-out`, `get-session`, `send-verification-email`,
`verify-email`, `request-password-reset`, `reset-password` (GET `/reset-password/{token}` and POST)
and `change-password`. `change-email` and `delete-user` stay disabled (their default).

**Links in emails** all point at `PORTAL_PUBLIC_URL`:
- Verify: Better Auth's `/api/auth/verify-email?token=…&callbackURL=/profile?verified=1`. A bad
  token redirects to the callback with `error=invalid_token`.
- Reset: `/api/auth/reset-password/{token}?callbackURL=/reset-password`, which Better Auth
  redirects to `/reset-password?token=…` (or `?error=INVALID_TOKEN`). The page POSTs
  `reset-password`, and an `INVALID_TOKEN` 400 shows the expired state (AC 5).
- Email change: `/confirm-email?token=…`. The page POSTs `/v1/me/email/confirm`.

Problem titles for the new codes go in `problem.ts`'s title map. Every `detail` is fixed copy from
the UX design. SMTP errors never include the server's reply, the username or the password.

### Data model
Migration `0001_email_and_account_security` (Drizzle, generated then checked by hand):

| Table | Columns | Notes |
| --- | --- | --- |
| `mail_settings` | `id smallint pk default 1 check (id = 1)`, `host text`, `port integer check 1–65535`, `security text check in ('none','starttls','tls')`, `username text null`, `password_ciphertext text null`, `sender_name text`, `sender_address text`, `updated_by uuid null → user on delete set null`, `updated_at` | No row means nothing is saved. The ciphertext uses `crypto.ts` `encrypt` |
| `account_settings` | `id smallint pk default 1 check (id = 1)`, `require_verified_email boolean default false`, `sign_in_failure_max int default 10`, `sign_in_failure_window_minutes int default 15`, `reset_email_max int default 3`, `reset_email_window_minutes int default 60`, `verification_email_max int default 3`, `verification_email_window_minutes int default 60`, `updated_at` | The migration inserts the row. Checks: max 1–1000, window 1–1440 |
| `email_change_requests` | `id uuid pk`, `user_id uuid unique → user on delete cascade`, `new_email text`, `token_hash text unique`, `expires_at`, `created_at` | One per user; a new request replaces it. Deleted on confirm |
| `rate_limit_hits` | `id uuid pk`, `bucket text check in ('sign-in-failure','password-reset','verification-email')`, `subject_hash text`, `created_at` | Index `(bucket, subject_hash, created_at)`. `subject_hash` is SHA-256 hex of the lower-cased, trimmed email, or of the user ID for `verification-email` |

The same migration also:
- runs `update "user" set email_verified = true`, so accounts from before the upgrade count as
  verified (AC 3);
- changes `apis.created_by` to `on delete set null`.

Nothing else changes: `user.email_verified` already exists, and sessions, accounts, apps, keys and
consumers already cascade from `user`.

### Mail
- **Effective settings** are resolved on every send: the `mail_settings` row if there is one, else
  the environment if `SMTP_HOST` and `SMTP_SENDER_ADDRESS` are set, else none.
- **Transport** (nodemailer `createTransport` per send):
  - `none`: `secure: false, ignoreTLS: true`
  - `starttls`: `secure: false, requireTLS: true`
  - `tls`: `secure: true`
  - Timeouts: `connectionTimeout` 10 s, `greetingTimeout` 5 s, `socketTimeout` 15 s, and an
    overall 15 s `AbortSignal` around the test send. `logger: false`, `debug: false`.
  - Error mapping by nodemailer `code`: `ECONNECTION`, `ETIMEDOUT`, `EDNS`, `ESOCKET`, `ETLS` and
    the abort give `smtp-unreachable`; `EAUTH` gives `smtp-auth-failed`; `EENVELOPE`, `EMESSAGE`
    and other SMTP replies give `smtp-rejected`.
- **Queue:** `send-email` in pg-boss, with `retryLimit: 5`, `retryBackoff: true`, `retryDelay: 5`
  and `deleteAfterSeconds: 3600`.
  - Payload: `{ template, userId, to, link }`, with `link` encrypted with `PORTAL_ENCRYPTION_KEY`.
  - The worker re-reads the user and drops a `verify` job if the user is missing or already
    verified, and a `confirm-email` job if the request was replaced.
  - With no effective settings it logs `warn` "mail not configured" and completes without
    retrying.
  - Logs carry the job ID, the template and the recipient's domain only. pg-boss polls every 2 s,
    well inside the 30 s of AC 1.
- **Templates:** `verify`, `reset-password`, `confirm-email` and `test`, each with a text and an HTML
  part. Fixed copy from the UX design. No remote images.

### Rate limits and Better Auth routes (`auth-limits.ts`)
Runs in the `/api/auth/*` handler before `auth.handler`, reading `account_settings` on each request.
A count is `select count(*) … where bucket = $1 and subject_hash = $2 and created_at > now() - window`.
Over the limit it returns 429 `/problems/rate-limited` with `Retry-After` set to the seconds until
the oldest counted hit leaves the window (at least 1).

| Path | Rule |
| --- | --- |
| `POST sign-in/email` | Over the limit → 429 without calling Better Auth. A 401 from Better Auth inserts a `sign-in-failure` hit; a 200 deletes that address's hits. |
| `POST request-password-reset` | Over the limit → 429 and no email; otherwise insert a `password-reset` hit, then call Better Auth. Counted for every address, with or without an account. The reset page shows its confirmation on 200 and on 429. |
| `POST send-verification-email` | Look up the user by email. If there is one and they're over the limit → 429; otherwise insert a `verification-email` hit keyed by user ID. With no user, call Better Auth, which sends nothing. |
| `POST change-password` | Force `revokeOtherSessions: true` in the body. If Better Auth answers `INVALID_PASSWORD`, insert a `sign-in-failure` hit for the session's email. Over the limit → 429 before calling. |
| `POST forget-password` | 404 (an old alias of the reset route that would bypass the limit). |

`POST /v1/me/email` checks and inserts `verification-email` hits the same way, and `DELETE /v1/me`
counts and checks `sign-in-failure`. Each check and insert runs in one transaction holding
`pg_advisory_xact_lock(hashtextextended(bucket || subject_hash, 0))`, so concurrent requests can't
overshoot. The hourly `auth-housekeeping` job deletes hits older than 24 hours and expired
`email_change_requests`.

### Server flows
- **Sign-up (AC 1):** Better Auth creates the user unverified and calls `sendVerificationEmail`,
  which enqueues `verify`. Opening the link sets `email_verified` and signs the user in.
- **Bootstrap admin:** create it with `auth.$context`: `password.hash`, then
  `internalAdapter.createUser({ email, name, role: 'admin', emailVerified: true })` and `linkAccount`
  (`providerId: 'credential'`), so no verification email is queued. The rest of the existing
  bootstrap stays.
- **Verified gate (AC 3):** after `requireUser`, if `account_settings.require_verified_email` and
  not `user.emailVerified`, throw 403 `email-not-verified`. This runs before the advisory locks, so
  no Kong consumer is created. Read the setting per request.
- **Email change (AC 7):**
  1. Normalize `newEmail`. If it equals the current address or belongs to any user → 409
     `email-unavailable`, with the same copy for both.
  2. Check the limit, upsert `email_change_requests` with a new token, and enqueue `confirm-email`
     to the new address.
  3. Confirm: hash the token and find an unexpired row → in a transaction, update
     `user.email = new_email, email_verified = true` (a unique violation gives 409), delete the
     row, and delete every `verification` row for the old address.
  4. Sessions stay; sign-in works only with the new address because the email column changed.
- **Name (AC 7):** `PATCH /v1/me` trims and updates `user.name`. Better Auth reads the user on each
  `getSession` (no cookie cache is configured), so the new name shows at once.
- **Delete account (AC 9):**
  1. Check the `sign-in-failure` limit, then verify the password against the `credential` account
     with `(await auth.$context).password.verify`. Wrong → insert a hit, 403.
  2. If the user is an admin and no other admin exists → 409 `last-admin`.
  3. `adapter.health()`; if it isn't reachable → 503 `gateway-unavailable` with "Your account was
     not deleted" copy. Nothing has changed yet.
  4. For each app, in its own transaction holding `pg_advisory_xact_lock_shared(71833002)`:
     `adapter.deleteConsumer`, then delete the app (keys, subscriptions and consumer rows cascade).
     A gateway error here → 503 or 502. Apps already removed stay removed; nothing shows as active
     while Kong refuses it.
  5. In a final transaction, lock the user row and all admin rows `for update` and re-check the
     last-admin rule. Delete the consumers and rows of any app created since step 4 (the row lock
     blocks new app inserts through the foreign key). Delete the user, which cascades sessions,
     accounts and `email_change_requests`.
  6. Reply 204 with the Better Auth session cookie expired. The address can sign up again because
     the row is gone.

### Adapter calls
None new. Account deletion uses the existing `health()` and `deleteConsumer(app)`. Kong's
`DELETE /consumers/{username}` also removes the consumer's key-auth credentials and ACL memberships,
a 404 counts as success, and a retry is safe. Reconcile's existing orphan clean-up removes any
consumer left behind if the server dies between the Kong delete and the row delete.

### Risks
| Risk | Mitigation and test |
| --- | --- |
| SMTP password or reset token leaks through logs, job rows or error text. | Redaction paths added. Link encrypted in the job payload, and jobs deleted after an hour. Fixed error copy. QA greps server logs and `pgboss.job` after AC 2, 4 and 7 for the password and tokens. |
| The reset flow reveals whether an address has an account, through the response, its timing or a 429. | Same 200 either way, emails sent from the queue, and limits counted for every address. QA compares responses for a known and an unknown address, and checks a 429 still shows the confirmation. |
| A Better Auth upgrade changes route names or behaviour (`forget-password`, `revokeSessionsOnPasswordReset`, `INVALID_PASSWORD`). | Version stays pinned at 1.3.34. Integration tests cover each route the limits touch, and ADR 0007 asks for a re-check on upgrade. |
| Account deletion fails part way through Kong. | Apps go one at a time, Kong first, and the retry finishes the job. QA stops Kong after the first consumer delete, using a fake adapter in an integration test. |
| Concurrent app creation during deletion leaves a live key. | The final transaction locks the user row and sweeps late apps; reconcile catches the rest. Unit test with two concurrent requests. |
| Mailpit makes the quickstart slower or fragile. | Small image, `depends_on` only `service_started`, and mail is queued, so the portal works even if Mailpit is down. QA times the quickstart (AC 1). |
| Two people deleting the last two admin accounts at the same time. | Admin rows are locked `for update` in the final transaction, and the rule is checked again. Unit test. |
| Rate-limit rows grow without bound. | Hourly housekeeping job. Unit test for the delete. |
| Spec 019 is changing the same portal navigation and screens at the same time. | The frontend rebases on 019 if it merges first. The new pages are separate routes; only the header account menu and Create app are shared. |

### Tasks
- [ ] [backend] db: add `mail_settings`, `account_settings` (row inserted), `email_change_requests` and `rate_limit_hits` with the checks and index in the design; migration also marks existing users verified and sets `apis.created_by` to `on delete set null`; migration test on a v0.2 database.
- [ ] [backend] config and compose: add the `SMTP_*` variables with defaults and validation; add the pinned `mailpit` service to `deploy/docker-compose.yml` and point the server at it; document the variables in the README and `.env` example.
- [ ] [backend] mail: add nodemailer; implement effective settings (saved, then environment, then none), the transport with security modes, timeouts and error mapping, the four templates with UX copy, and the `send-email` queue and worker (encrypted link, drop rules, no secrets in logs).
- [ ] [backend] auth: configure Better Auth verification and reset (enqueue, 24 h and 1 h expiry, `revokeSessionsOnPasswordReset`, `autoSignInAfterVerification`); create the bootstrap admin verified, through `auth.$context`, with no email queued.
- [ ] [backend] auth-limits: rate limits and route rules for `sign-in/email`, `request-password-reset`, `send-verification-email`, `change-password` (force `revokeOtherSessions`) and `forget-password` (404), with transactional count and insert, `Retry-After`, and the hourly housekeeping job.
- [ ] [backend] account: `GET`/`PATCH`/`DELETE /v1/me`, `POST /v1/me/email` and `/v1/me/email/confirm`, as in Server flows; problem titles in `problem.ts`; log redaction additions.
- [ ] [backend] admin settings: `/v1/admin/settings/mail` (GET, PUT keeping or removing the password, DELETE with the `mail-required` check), `/mail/test` (15 s, error mapping), `/v1/admin/settings/accounts` (GET, PUT with the `mail-not-configured` check).
- [ ] [backend] apps: `email-not-verified` 403 on `POST /v1/apps` and `POST /v1/apps/{id}/credentials`, before any lock or Kong call.
- [ ] [backend] Regenerate `packages/sdk`; unit tests for the transport error mapping, the limit window and `Retry-After`, the delete flow's ordering (fake adapter: health down, failure part way, concurrent app, last admin), and the email-change token (expired, replaced, reused, address taken meanwhile).
- [ ] [frontend] Sign-in: "Forgot password?" link; `/forgot-password` shows the same confirmation on 200 and 429; `/reset-password` handles valid, expired (`INVALID_TOKEN` from the redirect or the POST) and the new-password form.
- [ ] [frontend] Verification: banner for unverified users with a resend action (`send-verification-email`, with a 429 message); `/profile?verified=1` success and `error=invalid_token` states; Create app and New key handle 403 `email-not-verified` with the resend offer, and are disabled up front when `verificationRequired && !emailVerified`.
- [ ] [frontend] Profile page: name, email with verified badge and pending-change state, change email (409 and 429 states), `/confirm-email` page, change password (wrong current password and 429 states, "other sessions signed out" note), delete account with password confirmation and the `invalid-password`, `last-admin` and `gateway-unavailable` states.
- [ ] [frontend] Admin mail settings page: source banner ("environment settings in use", read-only environment values), form with write-only password, save, remove saved settings, and a test email with the three SMTP error states and no password echoed.
- [ ] [frontend] Admin account settings page: "Require a verified email" switch (disabled, with a link to mail settings, when `mailConfigured` is false; handles 409) and the three limits with validation.
- [ ] [qa] AC 1, 2: quickstart under 5 minutes with Mailpit; sign-up email within 30 s through the environment settings, and the verify link; saved settings win, with a test email through a second Mailpit or a Mailpit SMTP-auth configuration; unreachable host and bad credentials give their errors within 15 s; the password is absent from every API response, the logs and `pgboss.job`.
- [ ] [qa] AC 3: setting off by default; a pre-upgrade user and the bootstrap admin are verified after migrating a v0.2 database; with it on, an unverified user gets 403 on `POST /v1/apps` and the key route, with no Kong consumer; succeeds after verifying; can't be turned on with no mail.
- [ ] [qa] AC 4, 5, 6: reset end to end with other sessions signed out; unknown address gives the same response and no email; used and over-one-hour links give the expired state (move the clock or edit `verification.expires_at`) with the password unchanged; change password with right and wrong current password.
- [ ] [qa] AC 7: name change shows in the header; email change keeps the old address until confirmed, then only the new one signs in; an address that's taken gives 409 with copy that doesn't say why.
- [ ] [qa] AC 8: 10 failed sign-ins then 429 with `Retry-After`; fourth reset and fourth verification request give 429 with no extra Mailpit message, and the reset page still confirms; an admin change applies to the next request.
- [ ] [qa] AC 9: two apps with live keys → delete → both keys 401 in Kong, no consumer tagged with those apps, signed out, can't sign in, same address can sign up again; Kong stopped → 503 with keys still working; only admin → 409.
- [ ] [qa] Playwright journeys for forgot/reset password, profile and admin settings; update existing e2e helpers that sign up and create apps (users are unverified by default but the setting is off, so they should still pass).

## UX  _(ui-designer)_
Design: [docs/design/007-email-and-account-security.md](../design/007-email-and-account-security.md).
No new tokens; one shadcn component (`Switch`) and a few small portal components (`PasswordInput`,
`ResendVerification`, `SecretReplacementField`, `AdminNav`).

- **Auth pages:** sign-in gains **Forgot password?**, a reset-success alert and a rate-limit message
  that uses `Retry-After`. The new `/forgot-password` shows the same "Check your email" view after a 200
  and after a 429. `/reset-password` has one new-password field and an expired view with **Send a new
  link**. `/confirm-email` needs a click on **Confirm new email**, so mail scanners can't use the token.
  Tokens are removed from the address bar once they're read.
- **Profile (`/profile`, linked from the header account menu):** separate cards for name, email
  (Verified or Not verified badge, resend, pending change), password (other sessions signed out) and
  delete account. Deleting uses a dialog that confirms with the password and names the apps and keys
  that go. Every refusal says what didn't change.
- **Verification gate:** a warning banner on My apps pages only when the admin requires
  verification. Create app and Create key are `aria-disabled` with a visible reason. A 403
  `email-not-verified` shows a `ProblemAlert` with a resend action.
- **Admin:** `AdminNav` (APIs · Mail · Accounts). Mail settings show a banner for the source in use
  (saved, environment with its values read-only, or none), a write-only password field, a test email
  with a separate message for each SMTP error, and a remove action that handles `mail-required`. Account
  settings have the **Require a verified email** switch, disabled with a link to Mail when no mail is
  configured, and the three limits.
- **Copy:** exact `title` and `detail` strings for every new problem type (design §5.2), which the
  backend's `problem.ts` should use, and the four email templates (§6).
- Accessibility (focus moves to result views and alerts, a safe default focus in the delete dialog,
  `autocomplete` values, no per-second announcements) and the 375px and 1280px layouts are in §7–§8.

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
| Criterion | Test file | Result |
| --- | --- | --- |

### Bugs
<!-- One line per bug, each with its Linear issue: - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Screenshot |
| --- | --- | --- |

## Review  _(tech-lead)_

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
