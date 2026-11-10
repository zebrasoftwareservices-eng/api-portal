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
Migration `0003_email_and_account_security` (Drizzle, generated then checked by hand):

| Table | Columns | Notes |
| --- | --- | --- |
| `mail_settings` | `id smallint pk default 1 check (id = 1)`, `host text`, `port integer check 1–65535`, `security text check in ('none','starttls','tls')`, `username text null`, `password_ciphertext text null`, `sender_name text`, `sender_address text`, `updated_by uuid null → user on delete set null`, `updated_at` | No row means nothing is saved. The ciphertext uses `crypto.ts` `encrypt` |
| `account_settings` | `id smallint pk default 1 check (id = 1)`, `require_verified_email boolean default false`, `sign_in_failure_max int default 10`, `sign_in_failure_window_minutes int default 15`, `reset_email_max int default 3`, `reset_email_window_minutes int default 60`, `verification_email_max int default 3`, `verification_email_window_minutes int default 60`, `updated_at` | The migration inserts the row. Checks: max 1–1000, window 1–1440 |
| `email_change_requests` | `id uuid pk`, `user_id uuid unique → user on delete cascade`, `new_email text`, `token_hash text unique`, `expires_at`, `created_at` | One per user; a new request replaces it. Deleted on confirm |
| `rate_limit_hits` | `id uuid pk`, `bucket text check in ('sign-in-failure','password-reset','verification-email')`, `subject_hash text`, `created_at` | Index `(bucket, subject_hash, created_at)`. `subject_hash` is SHA-256 hex of the lower-cased, trimmed email, or of the user ID for `verification-email` |

The same migration also:
- runs `update "user" set email_verified = true`, so accounts from before the upgrade count as
  verified (AC 3);
- changes `apis.created_by` and the API-version author reference added on main to `on delete set null`, preserving published versions after account deletion.

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
- [x] [backend] db: add `mail_settings`, `account_settings` (row inserted), `email_change_requests` and `rate_limit_hits` with the checks and index in the design; migration also marks existing users verified and sets `apis.created_by` to `on delete set null`; migration test on a v0.2 database.
- [x] [backend] config and compose: add the `SMTP_*` variables with defaults and validation; add the pinned `mailpit` service to `deploy/docker-compose.yml` and point the server at it; document the variables in the README and `.env` example.
- [x] [backend] mail: add nodemailer; implement effective settings (saved, then environment, then none), the transport with security modes, timeouts and error mapping, the four templates with UX copy, and the `send-email` queue and worker (encrypted link, drop rules, no secrets in logs).
- [x] [backend] auth: configure Better Auth verification and reset (enqueue, 24 h and 1 h expiry, `revokeSessionsOnPasswordReset`, `autoSignInAfterVerification`); create the bootstrap admin verified, through `auth.$context`, with no email queued.
- [x] [backend] auth-limits: rate limits and route rules for `sign-in/email`, `request-password-reset`, `send-verification-email`, `change-password` (force `revokeOtherSessions`) and `forget-password` (404), with transactional count and insert, `Retry-After`, and the hourly housekeeping job.
- [x] [backend] account: `GET`/`PATCH`/`DELETE /v1/me`, `POST /v1/me/email` and `/v1/me/email/confirm`, as in Server flows; problem titles in `problem.ts`; log redaction additions.
- [x] [backend] admin settings: `/v1/admin/settings/mail` (GET, PUT keeping or removing the password, DELETE with the `mail-required` check), `/mail/test` (15 s, error mapping), `/v1/admin/settings/accounts` (GET, PUT with the `mail-not-configured` check).
- [x] [backend] apps: `email-not-verified` 403 on `POST /v1/apps` and `POST /v1/apps/{id}/credentials`, before any lock or Kong call.
- [x] [backend] Regenerate `packages/sdk`; unit tests for the transport error mapping, the limit window and `Retry-After`, the delete flow's ordering (fake adapter: health down, failure part way, concurrent app, last admin), and the email-change token (expired, replaced, reused, address taken meanwhile).
- [x] [frontend] Sign-in: "Forgot password?" link; `/forgot-password` shows the same confirmation on 200 and 429; `/reset-password` handles valid, expired (`INVALID_TOKEN` from the redirect or the POST) and the new-password form.
- [x] [frontend] Verification: banner for unverified users with a resend action (`send-verification-email`, with a 429 message); `/profile?verified=1` success and `error=invalid_token` states; Create app and New key handle 403 `email-not-verified` with the resend offer, and are disabled up front when `verificationRequired && !emailVerified`.
- [x] [frontend] Profile page: name, email with verified badge and pending-change state, change email (409 and 429 states), `/confirm-email` page, change password (wrong current password and 429 states, "other sessions signed out" note), delete account with password confirmation and the `invalid-password`, `last-admin` and `gateway-unavailable` states.
- [x] [frontend] Admin mail settings page: source banner ("environment settings in use", read-only environment values), form with write-only password, save, remove saved settings, and a test email with the three SMTP error states and no password echoed.
- [x] [frontend] Admin account settings page: "Require a verified email" switch (disabled, with a link to mail settings, when `mailConfigured` is false; handles 409) and the three limits with validation.
- [x] [backend] Fix: redact password-reset bearer tokens from request URL paths before logging (major; Linear Bug creation pending due to workspace free issue limit).
- [x] [backend] Fix: normalize `/api/auth/*` paths before applying rate-limit rules, so `/api/auth/sign-in//email` and `/api/auth//sign-in/email` can't skip the sign-in failure limit; add regression tests (Review blocking 1).
- [x] [backend] Fix: don't hold a database transaction while calling Better Auth in `limitedAuth`; reserve the hit in a short locked transaction, then call Better Auth; add a test with more parallel sign-ins than the pool size (Review blocking 2).
- [x] [backend] Fix: match `/api/auth/*` limit rules on the same resolved path Better Auth receives (pass `url.pathname` from `app.ts`), so `/./`, `/x/../` and `%2e` segments can't skip the limits; add regression tests over real HTTP, not `inject` (Re-review R1).
- [x] [backend] Fix: confirming an email change deletes the user's `reset-password:%` verification rows (`value` = user ID), so old-address reset links stop working; add a test (Re-review R2).
- [x] [frontend] Fix: clear the mail-settings test result when the saved settings change or are removed (U1; Re-review R3).
- [x] [qa] AC 1, 2: quickstart under 5 minutes with Mailpit; sign-up email within 30 s through the environment settings, and the verify link; saved settings win, with a test email through a second Mailpit or a Mailpit SMTP-auth configuration; unreachable host and bad credentials give their errors within 15 s; the password is absent from every API response, the logs and `pgboss.job`.
- [x] [qa] AC 3: setting off by default; a pre-upgrade user and the bootstrap admin are verified after migrating a v0.2 database; with it on, an unverified user gets 403 on `POST /v1/apps` and the key route, with no Kong consumer; succeeds after verifying; can't be turned on with no mail.
- [x] [qa] AC 4, 5, 6: reset end to end with other sessions signed out; unknown address gives the same response and no email; used and over-one-hour links give the expired state (move the clock or edit `verification.expires_at`) with the password unchanged; change password with right and wrong current password.
- [x] [qa] AC 7: name change shows in the header; email change keeps the old address until confirmed, then only the new one signs in; an address that's taken gives 409 with copy that doesn't say why.
- [x] [qa] AC 8: 10 failed sign-ins then 429 with `Retry-After`; fourth reset and fourth verification request give 429 with no extra Mailpit message, and the reset page still confirms; an admin change applies to the next request.
- [x] [qa] AC 9: two apps with live keys → delete → both keys 401 in Kong, no consumer tagged with those apps, signed out, can't sign in, same address can sign up again; Kong stopped → 503 with keys still working; only admin → 409.
- [x] [qa] Playwright journeys for forgot/reset password, profile and admin settings; update existing e2e helpers that sign up and create apps (users are unverified by default but the setting is off, so they should still pass).
- [x] [backend] Merge `origin/main` into this branch (108 commits behind, 26 conflicting files) with a merge commit, no rebase. Resolve every conflict, frontend files included, keeping both sides' behaviour: renumber this spec's migration after main's and regenerate its snapshot and journal, merge `openapi.yaml` and regenerate `packages/sdk`, merge compose/env, and regenerate `pnpm-lock.yaml` with `pnpm install`. Then `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and `node scripts/factory.mjs` still works after main's factory changes. Push the branch.

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

### Backend merge from main — 2026-11-10
- Resolved the 26 conflicting files from `origin/main`, retaining account-security behavior alongside first-admin setup, dynamic gateway connections, API versions and import linting. Where defaults conflicted, kept main's explicit setup flow (no default admin credentials or auto-connected gateway); declarative `ADMIN_*` / `KONG_*` configuration still works and Mailpit remains the SMTP fallback. Frontend conflict resolution preserves verification gates, account errors and profile protection alongside setup redirects, gateway refusals and version components.
- Regenerated migration `0003_email_and_account_security`, its snapshot/journal, the SDK from the merged OpenAPI contract, and `pnpm-lock.yaml` using `pnpm install`. Main's applied migrations are unchanged. Both API and API-version authors now become null on account deletion; the upgrade regression preserves their published documents. QA should use a fresh volume for databases from the unmerged branch's former `0001_email_and_account_security` migration.
- Account deletion resolves the current gateway configuration for cleanup and still permits revocation while new apps/keys are disabled. Added a real-Postgres regression for a changed gateway URL; first-admin setup creates verified admins without sending verification mail. Adapted account-security fixtures to the setup prerequisite and fixed auto-merged portal mock cleanup without removing either side's assertions.
- Validation: `pnpm lint` (7 tasks), `pnpm typecheck` (12 tasks), and `pnpm test` (12 tasks; 185 server, 212 portal, 55 adapter-kong and 5 database tests) pass. `node scripts/factory.mjs` and `node scripts/factory.mjs plan 007 --json` work with main's factory configuration. Evidence: `/tmp/007-merge-lint.log`, `/tmp/007-merge-typecheck.log`, `/tmp/007-merge-test.log`, `/tmp/007-merge-factory-plan.json`. Docker tests required sandbox escalation; the frontend test merge resolution was accepted after presenting Elango's explicit exception to automatic approval review.
- Fresh isolated Compose smoke passed in 221.4 seconds (build/start/setup), then the environment-configured path seeded the sample. A live HTTP/Mailpit check confirmed the bootstrap admin is verified, mail reports the environment source, and a signup verification email arrived in 1,143 ms. Evidence: `/tmp/007-merge-quickstart.log`, `/tmp/007-merge-mail-smoke.log`. The isolated `spec007-merge` stack was removed afterward; the two pre-existing untracked UAT folders were left untouched. No spec status, Bugs checkbox or approval gate changed; coordinator owns QA/review after this merge.

### Backend re-review fixes — 2026-11-09
- R1: `app.ts` passes the already-resolved `url.pathname` to `limitedAuth`, which drops empty segments before matching rules. The limiter and Better Auth now share dot-segment resolution. Eleven new regressions use `server.listen()` and `node:http` raw paths (not `inject`): sign-in/reset limits for `/./`, `/x/../`, `%2e` and `%2E%2E`, plus the disabled reset alias. Canonical and noncanonical requests share one hit, return 429 problem+json with `Retry-After`, and don't send extra mail.
- R2: email confirmation deletes all `verification` rows with `identifier like 'reset-password:%'` and `value` equal to the user ID in the email-update transaction. The regression issues two old-address links and confirms both return `INVALID_TOKEN`, the password stays unchanged, another account's link still works, and a fresh link to the changed address works.
- Validation: `pnpm lint` (7 tasks), `pnpm typecheck` (12 tasks), `pnpm test` (12 tasks, all 93 server tests) and the focused account-security integration suite (38/38) pass. Evidence: `/tmp/007-backend-rereview-lint.log`, `/tmp/007-backend-rereview-typecheck.log`, `/tmp/007-backend-rereview-tests.log`, `/tmp/007-backend-rereview-focused.log`. Docker-dependent tests needed execution outside the sandbox after the initial run could not find its container runtime.
- Both Fix tasks are unkeyed; no durable issue was created or moved. QA/tech lead should verify R1 and R2; no spec status, Bugs checkbox or approval gate changed.

### Frontend review fix R3 / U1 — 2026-11-09
- Clear the previous successful test-email result whenever the mail settings response changes, including saving within the same source and removing saved settings to environment fallback or no mail. The page no longer pairs the new source banner with an old saved-settings result.
- Added three component regressions for those transitions; fresh tests still display the current source afterward. Removed the known-failure marker from the existing `007 U1` Playwright regression so QA now requires the result to disappear.
- `pnpm lint` (7 tasks), `pnpm typecheck` (12 tasks), and `pnpm test` (12 tasks, including 137 portal tests and 93 server tests) pass. Portal coverage includes all 18 account-security cases. Validation evidence: `/tmp/007-frontend-r3-lint-final.log`, `/tmp/007-frontend-r3-typecheck-final.log`, `/tmp/007-frontend-r3-test-final.log`. The full test suite needs Docker access outside the sandbox; the initial sandbox run could not reach its container runtime.
- The Fix task is unkeyed; QA/tech lead must verify U1/R3 before closing the finding. The Bugs checkbox and spec status remain unchanged; QA owns the updated Compose/browser regression.

### Backend review fixes — 2026-11-09
- Normalized auth paths by dropping empty segments before matching whole routes, matching Better Auth's routing. Doubled slashes and trailing slashes now share the canonical sign-in failure limit; the disabled reset alias remains blocked.
- `limitedAuth` now reserves each attempt in a short advisory-locked transaction, commits, and calls Better Auth outside the transaction. Password failures retain the reservation; successful sign-in clears the address's failures, and non-password refusals release only their own reservation. Email requests keep their existing pre-dispatch counting. This removes nested pool usage without allowing concurrent failure attempts to overshoot the limit.
- Added seven real-Postgres regression cases: canonical/doubled/trailing-slash paths, 12 simultaneous sign-ins for one address and for distinct addresses against the 10-connection pool, and reservation release/success clearing. Both concurrent batches finish within a 20 s test deadline and leave the pool usable; the shared-address batch admits exactly 10 attempts and rejects two with 429.
- Validation: `pnpm lint` (7 tasks), `pnpm typecheck` (12 tasks), and `pnpm test` (12 tasks, including all 78 server tests) pass. Focused account-security integration suite passes 23/23. Evidence: `/tmp/007-backend-lint.log`, `/tmp/007-backend-typecheck.log`, `/tmp/007-backend-tests.log`, `/tmp/007-backend-focused.log`. Integration tests required Docker access outside the sandbox; the initial sandbox-only run could not reach the container runtime.
- Both review Fix tasks are unkeyed, so findings and evidence stay in this spec. QA/tech lead should verify both blocking findings; no Bugs checkbox, spec status, or approval gate changed. The other review suggestions remain for the coordinator's follow-up/re-review decision.

### Backend B1 fix — 2026-11-08
- Request logging now replaces the entire suffix after `/api/auth/reset-password/` with `[REDACTED]`, before Pino receives the request URL. Query stripping still protects verification and email-change links; the original URL reaches Better Auth unchanged.
- Added four request-log regressions covering reset links, encoded/extra path segments, verification tokens and email-change tokens. They inspect actual Fastify incoming/completed log records and check that the auth handler still receives the original path.
- Validation: `pnpm lint` (7 tasks), `pnpm typecheck` (12 tasks), and `pnpm test` (12 tasks, including 70 server tests) pass. The focused `review-fixes.test.ts` suite passes all 7 tests. Full tests required Docker access outside the sandbox; the initial sandbox-only attempt could not connect to the container runtime.
- QA must rerun the existing Compose/browser token-log regression before closing B1; its Bugs checkbox is intentionally left open. B1 still has no durable key because Linear rejected creation at its free issue limit; the existing pending-issue record remains applicable. No spec status or approval gate changed.

### Frontend — 2026-11-08
- Implemented forgot/reset password, explicit email confirmation, profile editing and password-confirmed account deletion, with the designed refusal states and token removal from the address bar. The header now exposes Profile and reflects name changes immediately.
- Added dashboard verification banners and resend controls; app/key creation stays focusable with an accessible reason while blocked, handles a late `email-not-verified` 403 inline, and refreshes the current user. Generic 403 redirects now preserve these expected account refusals.
- Added admin Mail/Accounts pages and responsive navigation, environment/source banners, write-only SMTP password replacement/removal, saved-settings removal, test-email refusals, verification prerequisites and numeric limit validation. Static demo builds route all new live-only pages to quickstart guidance.
- Added 15 account-security component cases plus app/key verification-gate coverage; updated navigation/auth assertions and browser API shims. Portal tests use two workers to avoid CPU-related timeouts alongside gateway containers. `pnpm lint`, `pnpm typecheck` and full `pnpm test` pass (all 12 workspace tasks; 134 portal tests, 63 server tests, database and adapter suites). QA still owns the full compose/Mailpit/browser journeys and acceptance-criteria evidence.

### Backend — 2026-11-08
- Added forward migration 0001, singleton mail/account settings, hashed email-change tokens and rate-limit hits. The v0.2 upgrade test verifies existing accounts, validates checks, and confirms an author's API survives account deletion.
- Added encrypted SMTP settings with environment fallback, fixed text/HTML templates, bounded SMTP errors, encrypted pg-boss mail payloads and stale-job drops. Mailpit is pinned to v1.27.10; SMTP variables and local mail instructions are in README and deploy/.env.example.
- Configured Better Auth verification/reset expiry and session revocation, verified bootstrap without sign-up hooks, serialized live-configured auth limits and housekeeping. Added account/profile, email-change and admin settings routes, verification gates before app/key gateway writes, and regenerated SDK types. Account deletion removes gateway consumers first, retains already-completed app removals on partial failures, and locks the owner for the final sweep and concurrent last-admin check.
- Validation: all 63 server tests and both database tests pass; backend lint/typecheck pass, and full-workspace lint passes. The real startup/Postgres/Mailpit smoke test confirms verified bootstrap, active housekeeping/reconcile schedules, queued signup email within 30 seconds and successful link verification. Full-workspace test/typecheck currently fail in frontend-owned files; the coordinator has routed those findings to the frontend worker.
- QA: run the full compose/Kong journeys and log/job secret checks from the acceptance criteria. pg-boss 10 exposes deleteAfterSeconds on the constructor rather than send options: archive retention is 3600 seconds, send-email jobs use retentionSeconds 3600 and retries 5/backoff/5 seconds, and archive intervals stay at 60 seconds because shorter intervals disable cron processing. No spec status or approval gate changed.

## Test report  _(qa-tester)_

QA re-test date: 2026-11-09, after re-review fixes `325dafe` (backend) and `ef62b2b`
(frontend). The current fresh Compose project `qa007r4` uses Postgres 17, Kong 3.9 and
Mailpit v1.27.10, with separate host ports (portal 13000, server 14000, proxy 18000,
Kong Admin 18001, Mailpit 18025) to keep this run isolated from default-port stacks.
Only tests and this spec changed; application code was not modified.

| Criterion | Automated test file / case | Result |
| --- | --- | --- |
| AC 1 — fresh quickstart, environment SMTP, signup delivery within 30 s, verify link/profile and source banner | `apps/portal/e2e/account-security.test.ts`: `007 AC1/3`, `007 admin settings browser`; `deploy/e2e/quickstart.spec.ts` | PASS. Current fresh-volume build/start and healthy portal completed in 107.19 s; Mailpit is polled with a 30 s deadline. |
| AC 2 — saved settings precedence/sender, encrypted write-only password, bounded SMTP unreachable/auth errors, no secrets | `apps/portal/e2e/account-security.test.ts`: `007 AC2/8`, `007 security`; `apps/server/src/account-security.test.ts`: encrypted SMTP and queue cases; `apps/server/src/mail/transport.test.ts` | PASS. B1 reset-token log regression now passes against the rebuilt server; real SMTP auth/unreachable errors, saved sender precedence, encryption and queue/log SMTP-password checks pass. |
| AC 3 — default-off, upgrade/bootstrap verified, UI/API gate and no app writes, succeeds after verification, no-mail refusal | `apps/portal/e2e/account-security.test.ts`: `007 AC1/3`; `apps/server/src/account-security.test.ts`: app/key guards and mail-less prerequisite; `packages/db/src/migrate.test.ts`: v0.2 upgrade | PASS. Real gated creation returns 403 problem+json and no app; verified creation succeeds against Kong. |
| AC 4 — browser reset, new/old password, other sessions revoked, unknown-address parity/no email | `apps/portal/e2e/account-security.test.ts`: `007 AC4/5/6/7`, `007 AC4/5`; `apps/server/src/account-security.test.ts`: reset revocation and known/unknown parity | PASS. Lifecycle, session revocation, unknown-address parity/no mail and reset-token log confidentiality all pass. |
| AC 5 — single-use/over-one-hour reset rejected, expired screen/recovery link, password unchanged | `apps/portal/e2e/account-security.test.ts`: `007 AC4/5/6/7`, `007 AC4/5`; `apps/server/src/account-security.test.ts`: expired reset/password unchanged; `apps/portal/components/account-security.test.tsx`: INVALID_TOKEN | PASS in Compose/browser and Postgres integration: over-one-hour and reused links are refused with password unchanged. |
| AC 6 — correct/wrong current password and other-session revocation | `apps/portal/e2e/account-security.test.ts`: `007 AC4/5/6/7`; `apps/server/src/account-security.test.ts`: forced revokeOtherSessions | PASS. Real browser wrong-password refusal, subsequent valid change, old password failure and remote-session 401. |
| AC 7 — name in header, pending old email retained, confirmed new address sign-in, neutral taken-address refusal | `apps/portal/e2e/account-security.test.ts`: `007 AC4/5/6/7`; `apps/server/src/account-security.test.ts`: neutral taken-address response and expired/replaced/reused/concurrently taken tokens | PASS. Browser name/menu, old-address retention and new-only sign-in; integration covers duplicate and token races. The browser also proves a fresh old-mailbox reset link is invalidated on email confirmation. |
| AC 8 — default 10 failures, fourth reset/verification 429, Retry-After, no extra email, reset confirmation, live admin changes | `apps/portal/e2e/account-security.test.ts`: `007 AC2/8`, `007 admin settings browser`; `apps/server/src/account-security.test.ts`: unknown reset counting, concurrent requests and live limits; `apps/server/src/mail/transport.test.ts`: Retry-After boundary | PASS. Exactly 3 reset and 4 verification emails (signup + 3 resends) reach Mailpit; fourth requests are refused, and live UI/API changes apply without restart. |
| AC 9 — two keys revoked/consumers removed, account/session gone, address reusable, Admin API outage retains live keys, last admin refused | `apps/portal/e2e/account-security.test.ts`: `007 AC9`; `apps/server/src/account-security.test.ts`: partial-failure retry, late-app sweep, concurrent last-admin deletes | PASS. Both keys 200 before and during Admin listener outage, deletion refused with 503, then deletion 204 and both keys 401 with no tagged consumers. |

### Commands and evidence

- `pnpm lint`: PASS (7 workspace tasks), rerun after adding the expired-session regression.
- `pnpm typecheck`: PASS (12 workspace tasks), rerun after the test change.
- `pnpm test --force`: final uncached full run PASS (12/12 tasks; 71 server, 134 portal,
  39 Kong adapter and 2 database tests; 1m26s). The new Postgres integration test
  `expired sessions cannot queue email, change settings or delete an account` checks four
  write routes return 401 problem+json without queuing mail, changing settings/email,
  deleting the account or calling Kong. Existing tests cover malformed inputs, missing
  permissions, duplicate/replaced/reused tokens, expired reset links and gateway failures.
- Fresh Compose command (timed with `/usr/bin/time -p`):
  `PORTAL_PUBLIC_URL=http://localhost:13000 KONG_PROXY_PUBLIC_URL=http://localhost:18000
  docker compose -p qa007r2 -f deploy/docker-compose.yml -f /tmp/007-compose.yaml up --build -d --wait`.
  PASS: **109.80 seconds**, new project/network/database volume, real Kong/Postgres/Mailpit.
  The override changes only image names and exposed host ports, preserving service behavior.
  The prior isolated `qa007` stack was stopped with its volumes preserved to release those ports;
  no default-port stack was modified. The rebuilt `qa007r2` stack remains available for UAT.
- Browser command: `PORTAL_PUBLIC_URL=http://localhost:13000 KONG_PROXY_PUBLIC_URL=http://localhost:18000
  KONG_ADMIN_URL=http://localhost:18001 SERVER_URL=http://localhost:14000 MAILPIT_URL=http://localhost:18025
  QA_COMPOSE_PROJECT=qa007r2 QA_COMPOSE_OVERRIDE=/tmp/007-compose.yaml pnpm test:e2e`.
  PASS: **49/49 tests (1.8m)**, including every spec 007 journey, B1, the seeded catalog/first-call
  journey and the previously intermittent Scalar HTML case.
- B1 re-test: `007 security: opening a reset link never writes the bearer token to server logs`
  passes on the rebuilt Compose server. Four backend request-log regressions also pass, covering
  reset paths (including encoded/extra segments), verification queries and email-change queries,
  without changing the path delivered to auth. Boolean secret assertions avoid printing tokens.
- Intermittent evidence retained: the first uncached unit/integration run failed in
  `packages/adapter-kong/src/conformance.test.ts:245` (an Accept-variant denied proxy request
  returned 200 instead of 403); **the complete second uncached run passed all 39 adapter tests**.
  This was observed while Docker images were also building; that is context, not an established
  cause. No retry configuration or application change was added. The previous QA run also saw
  an intermittent Scalar HTML first-call 404 instead of 403, followed by 3/3 clean focused repeats;
  the current full browser run passes that case. These observations remain test reliability
  evidence, with no confirmed reproducible account-security defect.
- Historical QA baseline: before `eb27aea`, e2e was 47 passed/2 failed, including B1 and the
  intermittent Scalar case. SMTP authentication/unreachable cases enforce a 15 s deadline,
  Mailpit polling a 30 s deadline, and queue-drained counts prove no fourth email was sent.
  The SMTP-auth case starts an authenticated listener in Mailpit and removes it afterwards.
- Evidence: `/tmp/007-qa-retest-lint.log`, `/tmp/007-qa-retest-types.log`,
  `/tmp/007-qa-retest-tests.log` (initial failure), `/tmp/007-qa-retest-tests-clean.log` (full pass),
  `/tmp/007-qa-retest-compose.log` (rebuild), `/tmp/007-qa-retest-fresh-compose.log` (timed fresh
  quickstart), `/tmp/007-qa-retest-e2e.log` (browser suite). No application code changed.

### Review-fix QA re-test — 2026-11-09

- `pnpm lint`: PASS (7 tasks); `pnpm typecheck`: PASS (12 tasks).
- `pnpm test --force`: PASS, 12/12 tasks, no cache, 2m26.679s; 81 server,
  134 portal, 39 Kong adapter and 2 database tests. The first resumed run failed only because
  the new QA session-preservation assertion used `/v1/me` instead of `/api/v1/me`;
  the test route was corrected and the complete uncached suite rerun successfully.
- `pnpm test:e2e`: exit 0, **51 passed (2.1m)** as classified by Playwright: 50 normal
  passes plus the known U1 expected failure. Every AC 1–9 journey, both review-blocker HTTP
  regressions, the first-call journey and all Scalar response variants pass. Command:
  `PORTAL_PUBLIC_URL=http://localhost:13000 KONG_PROXY_PUBLIC_URL=http://localhost:18000
  KONG_ADMIN_URL=http://localhost:18001 SERVER_URL=http://localhost:14000
  MAILPIT_URL=http://localhost:18025 QA_COMPOSE_PROJECT=qa007r3
  QA_COMPOSE_OVERRIDE=/tmp/007-qa-r3-compose.yaml pnpm test:e2e`.
  No retry was needed and no new intermittent failure was observed in this run.
- Review blocking 1: PASS in real-Postgres integration for canonical, doubled-slash (both
  placements) and trailing-slash sign-ins. Each variant consumes the same canonical limiter,
  and the next request returns 429 problem+json with positive `Retry-After`.
- Review blocking 2: PASS in real-Postgres integration for 12 simultaneous sign-ins sharing
  an address and for 12 distinct addresses against the 10-connection pool. Each batch completes
  within 20 seconds and a subsequent `select 1` succeeds. Added QA coverage for 12 concurrent
  reset, verification and incorrect change-password requests: exactly 3 email requests are
  admitted per batch (9 refused), and exactly 10 incorrect changes are admitted (2 refused).
  The password-change batch preserves the session and original password.
- Fresh quickstart: PASS, **249.19 seconds**, including `--build`, new `qa007r3` network and
  database volume, all services healthy. Command:
  `PORTAL_PUBLIC_URL=http://localhost:13000 KONG_PROXY_PUBLIC_URL=http://localhost:18000
  /usr/bin/time -p docker compose -p qa007r3 -f deploy/docker-compose.yml
  -f /tmp/007-qa-r3-compose.yaml up --build -d --wait`.
  The override changes only image names and exposed host ports. No other stack was modified.
- Evidence: `/tmp/007-qa-resume-lint.log`, `/tmp/007-qa-resume-types.log`,
  `/tmp/007-qa-resume-tests.log` (test typo), `/tmp/007-qa-resume-tests-final.log` (full pass),
  `/tmp/007-qa-resume-compose.log`, `/tmp/007-qa-resume-e2e.log`.
  Existing commands/evidence above are retained as historical QA runs.
- B1 re-test: PASS on the rebuilt server; opening the Mailpit reset link does not place its
  bearer token in request logs. B2/B3 (the two review blockers) are verified fixed below.
- U1 re-test: still reproducible in the browser. The added `007 U1` regression marks only its
  final stale-result assertion as an expected failure; setup, test-mail delivery and settings
  removal must succeed normally. This is an open minor, not an acceptance-criterion failure.
- No blocker or major remains open, so status is `uat`. The remaining tech-lead suggestions
  stay in Review for the coordinator/re-review decision; this QA pass does not approve them.

### Re-review QA verification — 2026-11-09 (`325dafe`, `ef62b2b`)

- AC 1–9 remain mapped to automated tests in the table above. No application code was changed.
- `pnpm lint`: PASS (7 tasks); `pnpm typecheck`: PASS (12 tasks), including the added tests.
- `pnpm test --force`: final uncached PASS, 12/12 tasks in 1m47.02s: **95 server,
  137 portal, 39 Kong adapter and 2 database tests**. The focused account-security suite
  also passed 40/40. R1 literal raw paths now cover verification and change-password in
  addition to sign-in/reset, without `inject` or client URL normalization hiding the input.
- `pnpm test:e2e`: final PASS, **51/51 normal passes (1.9m)**, no expected failures or
  configured retries. This includes AC 1–9, the first-call journey, all secret/log checks,
  U1, concurrency and the extended old-mailbox reset-link regression. Command:
  `PORTAL_PUBLIC_URL=http://localhost:13000 KONG_PROXY_PUBLIC_URL=http://localhost:18000
  KONG_ADMIN_URL=http://localhost:18001 SERVER_URL=http://localhost:14000
  MAILPIT_URL=http://localhost:18025 QA_COMPOSE_PROJECT=qa007r4
  QA_COMPOSE_OVERRIDE=/tmp/007-qa-r4-compose.yaml pnpm test:e2e`.
- Fresh quickstart: PASS, **107.19 seconds**, `--build`, new `qa007r4` network and database
  volume; Postgres 17, Kong 3.9 and Mailpit v1.27.10, all services healthy. Command:
  `PORTAL_PUBLIC_URL=http://localhost:13000 KONG_PROXY_PUBLIC_URL=http://localhost:18000
  /usr/bin/time -p docker compose -p qa007r4 -f deploy/docker-compose.yml
  -f /tmp/007-qa-r4-compose.yaml up --build -d --wait`.
  The override changes only image names and host ports. No pre-existing stack was modified.
- Re-tested open U1/R3: normal Compose/browser regression passes; its expected-failure marker
  was removed by the frontend fix. Re-tested R1 and R2: raw HTTP/Postgres cases and the
  extended Mailpit/profile email-change journey pass. Existing B1/B2/B3 regressions pass.
- Reliability evidence retained: the first uncached full suite hit the previously observed
  Kong conformance Accept-variant mismatch at `conformance.test.ts:245` (404 instead of 403);
  the complete second uncached suite passes all 39 adapter tests. The initial browser run
  had 48 passes and three failures: the concurrency test's 30-second total deadline (T2),
  SMTP fixture readiness (T1), and the existing spec-019 fake-clock timeout assertion not
  seeing its expected alert. T1/T2 were corrected in tests; per-request 20-second bounds and
  SMTP error 15-second bounds remain enforced. The spec-019 timeout case passes in the
  complete rerun without changes to that test/application; its initial failure is retained
  as a reliability observation, not a confirmed reproducible product defect. No retry
  configuration was added.
- No blocker, major or minor remains open in this spec's Bugs list, so status is **uat**.
  No new open durable issue was found or created. The three pre-existing Backlog review
  suggestions remain recorded in Review for the coordinator to reconcile when Linear
  capacity permits. This QA result does not approve the feature or pass a release gate.
- Evidence: `/tmp/007-qa-r4-lint-final.log`, `/tmp/007-qa-r4-types-final.log`,
  `/tmp/007-qa-r4-tests.log` (initial conformance failure), `/tmp/007-qa-r4-tests-final.log`,
  `/tmp/007-qa-r4-added-tests.log`, `/tmp/007-qa-r4-compose.log`,
  `/tmp/007-qa-r4-e2e.log` (initial browser failures), `/tmp/007-qa-r4-e2e-final.log`.

### Bugs

- [x] **B2 — Noncanonical sign-in paths bypass the failure limit (Review blocking 1, backend).**
  Fixed in `3ce5597`. QA verified canonical, both doubled-slash placements and trailing-slash
  paths consume the same limit in Postgres integration and through the Compose portal HTTP
  routes; each variant returns 429 problem+json with `Retry-After` after the shared budget.
- [x] **B3 — Concurrent auth requests exhaust the database pool (Review blocking 2, backend).**
  Fixed in `3ce5597`. QA verified batches larger than the 10-connection pool complete for shared
  and distinct sign-in addresses, followed by a successful pool query and Compose health check.
  Added reset, verification and wrong-current-password concurrency coverage also passes.

- [x] **B1 — Password-reset bearer token is written to server request logs (major, backend).**
  Sign up, request a reset, read the email from Mailpit and open its link without submitting a
  password. The Fastify incoming-request record logs `/api/auth/reset-password/<bearer-token>`:
  query stripping does not redact the token in the path. A log reader can redeem the still-valid
  token to take over the account. The automated `007 security: opening a reset link never writes
  the bearer token to server logs` failed before the fix (`logs.includes(token)` was true). Expected: no reset,
  verification or email-change bearer token appears in logs. Do not paste real tokens into reports.
  **Durable Bug creation attempted:** parent JSO-235, team JSO, label Bug, priority High, title
  “Bug: password-reset bearer token is written to server request logs”. Linear rejected it with
  `linear_write_failed: Usage limit exceeded` while the bug was open. The Fix task
  was completed in `eb27aea`. QA verified the Compose/browser regression and all four backend
  log cases on 2026-11-08; B1 is closed and no longer blocks UAT. No keyed issue was created
  while the bug was open because Linear rejected it; no open durable bug remains.

- [x] **U1 — Removing saved SMTP settings leaves a stale saved-settings test result (minor, frontend).**
  In Admin → Mail, save Mailpit as an admin-configured SMTP source, send a successful test email,
  then choose **Remove saved settings** → **Remove settings**. The source banner correctly returns
  to "Portal email uses the server's environment settings", but the result below **Send test email**
  still says the message used the saved settings. Expected: clear the old result when the effective
  source changes, or update it so the page does not present contradictory current states. Evidence:
  `docs/uat/007/run-2026-11-09-final/23-stale-saved-test-result.png`. This does not block a journey;
  it remains a transient in-spec minor finding with no Linear issue. QA reproduced it on
  2026-11-09 against rebuilt `qa007r3`; automated case `007 U1` fails its final zero-stale-result
  assertion as expected while the preceding successful send and source/removal assertions pass.
  UAT re-tested it after the review fixes on 2026-11-09 and it remains reproducible; updated
  evidence: `docs/uat/007/run-2026-11-09-review-retest/04-u1-still-reproducible.png`.
  **QA closure, 2026-11-09:** fixed in `ef62b2b`; the normal (no expected-failure marker)
  `007 U1` Compose/browser regression passes. Three component regressions cover saved-to-saved,
  saved-to-environment and saved-to-unconfigured changes. The completed R3 Fix task is verified.

- [x] **R1 — Dot segments bypass auth rate limits (blocking security finding, backend).**
  Fixed in `325dafe`. Real listening-server/`node:http` regressions send literal `/./`, `/x/../`,
  `%2e` and `%2E%2E` paths and verify canonical/shared 429 budgets, problem+json, Retry-After,
  exact database hit counts and no extra queued mail. QA added signed-in verification and
  change-password raw-path cases; both pass, and the original sign-in/reset/disabled-alias
  regressions pass. This closes the recorded finding after its existing Fix task passed; no
  new open durable bug was discovered.
- [x] **R2 — Old-mailbox reset links survive email confirmation (blocking security finding, backend).**
  Fixed in `325dafe`. Postgres integration invalidates two existing links, preserves another
  account's link and accepts a fresh new-address link. QA extended the Compose/browser profile
  journey to wait for a distinct fresh old-address Mailpit link, verify it is valid before
  confirmation, then prove reset returns INVALID_TOKEN after confirmation while the changed
  account still signs in with its unchanged password. The existing Fix task is verified.
- [x] **T1 — SMTP-auth browser fixture starts asynchronously (minor, QA tests).**
  The first browser run expected smtp-auth-failed but received smtp-unreachable because the
  detached authenticated Mailpit listener was not ready. Added a bounded `/livez` readiness
  poll before sending the test mail; no application code changed.
- [x] **T2 — Concurrency browser regression has an insufficient total deadline (minor, QA tests).**
  Its two sequential batches each allow 20 seconds per request, plus path-limit setup, but the
  entire test inherited a 30-second deadline. The first browser run exhausted that total
  deadline. Set the test budget to 90 seconds, keeping each batch request timeout at 20 seconds.

- [ ] **U2 — Delete dialog retains the wrong-password error after a correct-password retry (minor, frontend).**
  In Profile → Delete account, submit a wrong password, then enter the correct password. Stop
  local Kong and submit again. The gateway-unavailable refusal correctly preserves the account,
  but the prior “This password is incorrect” message remains beside the new error even though
  password validation succeeded. Expected: clear the previous field error on retry or when
  validation succeeds. Both keys still returned 200 after Kong restarted, and the same correct
  password then deleted the account successfully (both keys became 401). Evidence:
  `docs/uat/007/run-2026-11-09-current/11-gateway-refusal-stale-password.png`; default browser
  viewport at the refusal, main mobile journey 390×844. Transient in-spec finding; no durable
  issue or blocking Fix task required.

- [ ] **U3 — SMTP test error persists after corrected settings are saved (minor, frontend).**
  Save `mailpit:1` with None security and send a test, producing the unreachable error.
  Change port to `1025` and save. The old “Can't reach the mail server” error remains under
  the test form without indicating that it belongs to the previous settings. Expected:
  clear the test error when effective settings change, consistently with U1's success-result
  clearing. The error also persists after removing saved settings; a new test clears it, so no journey
  is blocked. Evidence:
  `docs/uat/007/run-2026-11-09-current/17-smtp-error-after-save.png`, 1280 px desktop.
  Transient in-spec minor; no durable Linear issue required.

## User testing  _(user-tester)_

Current UAT: 2026-11-09, after QA re-review at `37ed904`. Browser: Orca built-in browser;
full notes and evidence: `docs/uat/007/run-2026-11-09-current/README.md`.

| User story | Result | Screenshot |
| --- | --- | --- |
| Quickstart sends email to Mailpit | PASS — reused healthy quickstart; signup, resend and reset delivered through environment fallback | `docs/uat/007/run-2026-11-09-current/03-mobile-signup-gate.png` |
| Admin configures SMTP and sends test mail | PASS — saved sender/source delivered; unreachable port showed actionable error immediately; removed saved settings | `docs/uat/007/run-2026-11-09-current/01-saved-smtp.png`, `docs/uat/007/run-2026-11-09-current/15-smtp-unreachable.png` |
| Admin requires verified email before app creation | PASS — enabled policy; unverified Create app disabled; verified account created two apps | `docs/uat/007/run-2026-11-09-current/03-mobile-signup-gate.png` |
| Admin sets sign-in/reset/verification limits | PASS — defaults readable; reset maximum saved as 2, persisted across navigation, restored to 3 | `docs/uat/007/run-2026-11-09-current/02-policy.png` |
| Developer signs up, verifies and resends | PASS — keyboard mobile signup, resend email and verification link worked; profile showed Verified | `docs/uat/007/run-2026-11-09-current/03-mobile-signup-gate.png`, `docs/uat/007/run-2026-11-09-current/05-email-pending-password-success.png` |
| Developer resets forgotten password | PASS — matching known/unknown confirmation copy; fresh link worked, prior session signed out, old password refused and new password accepted | `docs/uat/007/run-2026-11-09-current/08-reset-confirmation.png`, `docs/uat/007/run-2026-11-09-current/09-reset-success.png` |
| Developer changes password while signed in | PASS — wrong current password refused, correct current password succeeded | `docs/uat/007/run-2026-11-09-current/04-name-password.png`, `docs/uat/007/run-2026-11-09-current/05-email-pending-password-success.png` |
| Developer updates name and email | PASS — name saved, old email remained pending, explicit confirmation changed address; old-mailbox reset rejected | `docs/uat/007/run-2026-11-09-current/05-email-pending-password-success.png`, `docs/uat/007/run-2026-11-09-current/06-email-confirmed.png`, `docs/uat/007/run-2026-11-09-current/07-old-mailbox-reset-rejected.png` |
| Developer deletes account and revokes keys | PASS with minor U2 — two apps named; wrong password and unavailable Kong refused; deletion signed out; keys 200→401; address registered again; last admin protected | `docs/uat/007/run-2026-11-09-current/10-delete-wrong-password.png`, `docs/uat/007/run-2026-11-09-current/11-gateway-refusal-stale-password.png`, `docs/uat/007/run-2026-11-09-current/12-account-deleted.png`, `docs/uat/007/run-2026-11-09-current/13-recreated-address.png`, `docs/uat/007/run-2026-11-09-current/14-last-admin.png` |

All nine stories were walked again. U1/R3 is now verified fixed by a successful saved-settings
send followed by removal: the environment banner returns and the success result disappears
(`docs/uat/007/run-2026-11-09-current/16-u1-result-cleared.png`). R2 was also re-tested in the
browser using a valid old-mailbox reset form opened before confirmation; submitting it after
confirmation shows expiry and leaves the password unchanged. No blocker or major is open;
status advances to `review`. U2 and U3 are transient minors and need no durable issues.

The main signup journey used 390×844 mobile emulation with typed keys, Tab and Enter; Escape
closed the deletion dialog safely. Desktop profile/reference/admin checks used 1280 px. Consoles
were clean; observed failed requests were intentional negative cases. This run reused the healthy
stack, so the fresh-build quickstart timing remains QA's 107.19 seconds. SMTP/API secret storage,
raw-path rate-limit bypasses and concurrency retain QA's passing evidence; these internal checks
were not inferred from browser screenshots. Settings were restored and the stack was stopped.

Earlier UAT evidence remains in `run-2026-11-09-final/` and
`run-2026-11-09-review-retest/`; their statements that U1 remained open are historical and are
superseded by this re-test and QA's closure above.

## Review  _(tech-lead)_
### Second re-review — 2026-11-09 at `e02128f`
**Result: nothing is blocking, so the status is `approved`.** R1, R2 and R3 are all fixed, and
their tests would catch a regression. U2 and U3 are minor UI issues with no security impact and
don't block a journey. They become Backlog follow-ups, with the three suggestions from the last
round. Merging is Elango's call.

#### Checks
| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` | Pass (7 and 12 tasks) |
| `pnpm test --force` | Pass, 12 of 12 tasks: 95 server, 137 portal, 39 adapter-kong and 2 database tests |
| Quickstart and `pnpm test:e2e` | Not re-run here. QA's results at `37ed904` stand: fresh compose healthy in 107.19 s, and e2e 51 of 51. Only UAT docs changed since then |
| R1 (`app.ts:94`–`111`, `auth-limits.ts:96`–`102`) | **Fixed.** `app.ts` builds the `URL` once and passes `url.pathname` to `limitedAuth`, which drops empty segments. I checked the router: better-call 1.0.19 takes `url.pathname` from that same `Request`, strips the base path, and rou3 0.5.1 matches it case-sensitively with no percent-decoding, splitting on `/` and dropping empty segments. So the limiter and Better Auth now match the same route. The new tests use `server.listen()` and `node:http` with literal `/./`, `/x/../`, `%2e` and `%2E%2E` paths on all four limited routes and on the `forget-password` 404 |
| R2 (`account.ts:305`–`312`) | **Fixed.** Confirming the change deletes `reset-password:%` rows whose `value` is the user's ID, in the same transaction as the email update. The test checks that two old links are refused with `INVALID_TOKEN`, another account's link still works, and a fresh link to the new address works |
| R3 / U1 (`mail-settings.tsx:61`) | **Fixed.** `setTestResult('')` runs whenever `resource.data` changes. Three component tests cover it, and the U1 e2e case no longer has its expected-failure marker |
| UAT | Pass (`docs/uat/007/run-2026-11-09-current/README.md`). Every story passes; U2 and U3 are open minors |

#### Blocking
None.

#### Suggestions (Backlog follow-ups, no parent)
Linear refused new issues again today (`linear_write_failed`: free issue limit exceeded), so none
of these exist yet. Once there's room, create each one in team JSO, project API Portal, state
Backlog, priority Low, **no parent**. Use label **Bug** for U2 and U3 and **Code Review** for the rest.
- **U2:** `apps/portal/components/profile.tsx:134` delete-account dialog. A wrong-password error stays on screen
  after a retry with the correct password fails for another reason (gateway unavailable). Clear the
  field error on each submit.
- **U3:** `apps/portal/components/mail-settings.tsx:61`. The `useEffect` that clears `testResult`
  should also call `setTestProblem(undefined)`. Otherwise an old SMTP test error stays visible after
  the settings change, which is U1 again for errors.
- Carried over from the last re-review: *count email-change attempts before the address-taken
  check* (`account.ts:218`); *make the last-admin check exact when two admins delete at once*
  (`account.ts:108`, `:134`, `:157`); *require a shared enqueue in `mailQueue`* (`mail/queue.ts:19`).

### Re-review — 2026-11-09 at `1eefe69`
**Result: three blocking findings, so the status goes back to `building`.** Blocking 2 (pool
deadlock) is fixed. Blocking 1 (the sign-in limit bypass) is only partly fixed: dot segments still
get past every `/api/auth/*` limit, and I reproduced it over real HTTP. My first-review fix
(`split('/').filter(Boolean)`) didn't go far enough, which is my mistake. Two earlier items are
now blocking: one is a security gap and one is a single-line UI fix, and the spec is going back to
`building` anyway. The other three suggestions become Backlog follow-ups.

#### Checks
| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` | Pass |
| `pnpm test --force` | Pass, 12 of 12 tasks: 81 server, 134 portal, 39 adapter-kong and 2 database tests |
| Earlier blocking 2 (`auth-limits.ts:141`–`174`) | **Fixed.** The reservation commits before `run()`. Release after a non-password refusal and clear after success both take the advisory lock. New tests send 12 parallel requests (pool `max: 10`) to sign-in (same and different addresses), reset, verification and change-password. All finish, the counts are exact and the pool still answers `select 1` |
| Earlier blocking 1 (`auth-limits.ts:100`) | **Not fixed.** See R1 |
| UAT re-test | Pass (`docs/uat/007/run-2026-11-09-review-retest/README.md`). U1 is still reproducible |

#### Blocking
- **R1. Dot segments still get past every `/api/auth/*` limit** (`apps/server/src/auth-limits.ts:100`,
  `apps/server/src/app.ts:94`). `limitedAuth` builds its route from the raw `request.url`.
  `app.ts:94` sends Better Auth `new URL(request.url, …)`, and that call resolves `.`, `..`,
  `%2e` and `%2E%2E` segments. Fastify routes raw paths such as `/api/auth/sign-in/./email`,
  `/api/auth/x/../sign-in/email` and `/api/auth/sign-in/%2e/email` to `/api/auth/*`. The limiter
  doesn't recognise them, and Better Auth receives `/api/auth/sign-in/email`. Reproduced with a
  real listening server and `signInFailureMax: 2`: six wrong passwords got
  `[401,401,429,429,429,429]` on the canonical path. On each dot path they got six 401s and wrote
  no `rate_limit_hits` rows. The same gap opens the reset, verification and change-password limits
  and the `forget-password` 404. The new regression tests can't catch this: they use
  `app.inject`, which normalizes the URL before Fastify sees it.
  *Fix:* in `app.ts`, build the `URL` once and pass `url.pathname` into `limitedAuth`. Normalize
  that (`split('/').filter(Boolean)`) and use it for rule matching, so the limiter and Better Auth
  always see the same route. Optionally, refuse any `/api/auth/*` request whose raw path differs
  from its normalized form with 404. Add regression tests against `server.listen()` with
  `node:http` (not `inject`) for `/./`, `/x/../` and `%2e`, on sign-in and on reset.
- **R2. Changing your email address doesn't cancel reset links sent to the old address**
  (`apps/server/src/account.ts:305`). This was a suggestion in the first review. The Technical
  design (Server flows, email change) says to delete every `verification` row for the old
  address. The code deletes `identifier = <old email>`, which Better Auth 1.3.34 never writes.
  Reset rows are `reset-password:<token>` with `value` = user ID. So whoever controls the old
  mailbox can still reset the password for up to an hour after the change.
  *Fix:* delete `verification` rows where `identifier like 'reset-password:%' and value = <user id>`
  in the same transaction. Add a test: request a reset, confirm an email change, then expect the
  reset token to be refused.
- **R3. U1: after you remove saved mail settings, the old test result still says the saved settings were used**
  (`apps/portal/components/mail-settings.tsx:45`–`61`, shown at `:400`). QA and UAT still
  reproduce it, and the fix is one line.
  *Fix:* call `setTestResult('')` in the `useEffect` that runs when `resource.data` changes, or
  whenever `settings.source` changes. Add a component or e2e check.

#### Carried over as Backlog follow-ups (not blocking)
Linear refused all three with "free issue limit exceeded", so they aren't created yet. Create each
one once capacity returns: team JSO, project API Portal, state Backlog, label **Code Review**,
priority Low, **no parent**.
- *Count email-change attempts before the address-taken check:* `account.ts:218` can tell a
  signed-in user whether an address has an account, with no limit. Sign-up already reveals this.
- *Make the last-admin check exact when two admins delete their accounts at once:*
  `account.ts:108`, `:134`, `:157`. Take the `71833004` lock and re-check before removing apps.
- *Require a shared enqueue in `mailQueue`:* `mail/queue.ts:19` starts a pg-boss instance for
  every email when `enqueueMail` isn't passed.

### First review — 2026-11-09 at `0deb8a6`
**Result: two blocking findings, so the status goes back to
`building`.** Both are in the `/api/auth/*` rate-limit wrapper, and I reproduced both against real
Postgres. Everything else matches the design, and each acceptance criterion has a passing test.

#### Checks
| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` | Pass (7 and 12 tasks) |
| `pnpm test` | Pass, 12 of 12 tasks. Rerun with no cache for server, db and portal: 71 server, 2 database and 134 portal tests pass |
| `packages/sdk` against `openapi.yaml` | No drift after regenerating |
| Contract and data model | `openapi.yaml` paths, error codes and migration `0001` match the Technical design. Problem titles and details come from `security-problems.ts`, with no SMTP reply text, username or password in them |
| Secrets | SMTP password encrypted and write-only. Mail links encrypted in job payloads. Reset-token path redacted from request logs (B1 fix). Email-change tokens stored only as hashes. HTML email escapes user data |
| AC coverage | Each of AC 1–9 has automated tests (see Test report); UAT passed every story |
| Quickstart and `pnpm test:e2e` | Not re-run here. QA's results stand: fresh compose with Mailpit healthy in 109.8 s, and e2e 49 of 49 at `dd768c7`. Only UAT docs changed since then |
| Code read | Every server, db and mail change in `main...HEAD`, plus the portal's password-recovery, profile and mail-settings components. I skimmed the remaining portal UI and tests |

#### Blocking
1. **Brute force can skip the sign-in limit with a doubled slash** (`apps/server/src/auth-limits.ts:109`,
   `:131`). The sign-in rule matches the exact string `/api/auth/sign-in/email`. Fastify's
   `/api/auth/*` route also sends `/api/auth/sign-in//email` and `/api/auth//sign-in/email` to the
   handler. Better Auth's router (rou3 `splitPath` drops empty segments) treats both as
   `sign-in/email`. Those requests reach Better Auth without being counted. Reproduced: 13 wrong
   passwords sent to `/api/auth/sign-in//email` all got 401, with no 429 and no `rate_limit_hits`
   rows. That defeats AC 8's sign-in limit, and the endpoint needs no sign-in. The other rules match
   only the last path segment, so `//request-password-reset` is still counted.
   *Fix:* normalize the path the way Better Auth does (`split('/').filter(Boolean)`, trailing slash
   dropped) before applying any rule, and match the whole normalized route. If you prefer, refuse
   non-canonical `/api/auth/*` paths with 404 instead. Add regression tests for the doubled slashes,
   a trailing slash and the canonical path.
2. **About ten simultaneous sign-ins deadlock the server's database pool**
   (`apps/server/src/auth-limits.ts:149`–`163`). `limitedAuth` opens a transaction and holds that
   connection, plus the advisory lock, while `run()` calls Better Auth. Better Auth runs its own
   queries on the same `postgres` client (`max: 10`, `packages/db/src/index.ts:10`). Once ten such
   requests are in flight, every connection is held by a transaction that waits for a free
   connection, and nothing times out. The same happens with 10 requests for *one* address: nine
   hold connections while they wait on the advisory lock. Reproduced: 12 parallel wrong-password
   sign-ins for different addresses never returned within 20 s, and afterwards a plain `select 1`
   on the pool hung too. Anyone can send these requests unauthenticated, so this takes the whole
   portal down. The same applies to `request-password-reset`, `send-verification-email` and
   `change-password`. `checkPassword` and `POST /v1/me/email` (`account.ts`) use only their own
   transaction, so they're safe.
   *Fix:* never call `auth.handler` inside the transaction. Check and reserve in a short locked
   transaction, then commit and call Better Auth outside it. For sign-in, insert the failure hit up
   front and delete it after a 200 (or clear the address's hits as now). Concurrent attempts then
   still can't overshoot. Reset and verification already insert before the call. Add an integration
   test that sends more parallel sign-ins than the pool size and expects them all to finish.

#### Suggestions
Fix these in this loop while the spec is back in `building`, if they're cheap. On re-review I'll
file a Backlog issue for any that stay open.
- `apps/server/src/account.ts:305`: confirming an email change deletes `verification` rows where
  `identifier = <old email>`. Better Auth 1.3.34 never writes those: reset rows are
  `reset-password:<token>` with `value` = user ID, and verification links are JWTs. So a reset
  link sent to the old address still works for up to an hour after the change, for whoever controls
  that mailbox. Delete `identifier like 'reset-password:%' and value = <user id>` instead, and add a
  test for it.
- `apps/server/src/account.ts:218`: the "address taken" check runs before the verification-email
  limit, so a signed-in account can test whether any address has an account, with no limit. Sign-up
  already reveals this through Better Auth, so this isn't a new exposure. Counting the attempt
  before the check would still close it here.
- `apps/server/src/account.ts:108`, `:134`, `:157`: if two admins delete their accounts at the same
  moment, both pass the first last-admin check and both have their apps removed from Kong. Then the
  second gets 409 `last-admin` in the final transaction, with its apps and keys already gone while
  the copy says "Your account was not deleted". This is rare. Taking the `71833004` lock and
  re-checking before removing apps would make it exact.
- `apps/server/src/mail/queue.ts:19`: without a shared `PgBoss`, `mailQueue` starts and stops a
  whole pg-boss instance for every email. Only callers that don't pass `enqueueMail` take this path
  (tests or embedding). Consider making the enqueue a required argument.
- **U1** (QA, frontend, `apps/portal/components/mail-settings.tsx`): after removing the saved
  settings, the old test result still says the saved settings were used. Clear it when `source`
  changes.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
