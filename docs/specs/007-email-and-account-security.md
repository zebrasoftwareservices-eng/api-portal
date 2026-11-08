---
id: 007
title: Email and account security
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-08
linear: JSO-235
linear_stages:     # stage issues — filled by linear-init
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
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/007-*.md`

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
