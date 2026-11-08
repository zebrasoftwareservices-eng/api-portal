---
id: 007
title: Email and account security
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-08
linear: JSO-235
linear_stages:     # stage issues — filled by linear-init
---

# 007 — Email delivery, verification, password reset and two-factor login

## Summary
The portal sends email, so developers and admins can verify their address, reset a forgotten
password, turn on two-factor login and delete their own account, and an admin can require a
verified address before anyone gets a key.

## Problem
Today a portal account is only an email and a password (spec 001 ships with no email at all).
That blocks real use:

- **A forgotten password is a dead end.** The developer has to ask an admin, and there is no
  admin tool for it either, so in practice they sign up again under another address and lose
  their apps and keys.
- **Anyone can get a key with an address they don't own.** A platform engineer can't tell
  who holds a key, which is a blocker for putting the portal in front of a real gateway, and
  for the public sign-up on the hosted demo (spec 006 deferred this here).
- **A password is the only thing guarding a key.** Security reviews expect optional
  two-factor login before a portal that issues gateway credentials goes to production.
- **People can't leave.** There is no way to delete an account, and nothing removes that
  person's consumers and keys from Kong.
- **Teams (spec 008) need email** to send invites, so this spec comes first.

We'll know it's solved when, on a fresh `docker compose up`, the sign-up email arrives in
Mailpit, a password reset works end to end, the sign-in after turning on two-factor login asks
for a code, and deleting an account makes its keys stop working in Kong.

## Users
- **API consumer (developer):** signs up, verifies, resets a password, protects and deletes
  their own account.
- **Portal admin:** configures how the portal sends mail and decides whether verification is
  required. Admins use the same account features as developers.
- **Platform engineer:** runs the install, sets SMTP through environment variables and needs
  every key to belong to a verified, removable person.

## User stories
- As a platform engineer, I want to set SMTP through environment variables and see every
  email in Mailpit in the quickstart, so that email works locally with no outside account.
- As a portal admin, I want to set SMTP in the admin UI and send a test email, so that I can
  fix mail delivery without redeploying.
- As a portal admin, I want to require a verified email address before a developer can create
  apps, so that every key belongs to an address someone owns.
- As a developer, I want a verification email when I sign up, and a way to send it again,
  so that I can prove my address.
- As a developer, I want to reset a forgotten password from the sign-in page, so that I don't
  lose my apps and keys.
- As a developer, I want to change my password while signed in, so that I can rotate it.
- As a developer, I want to turn on two-factor login with an authenticator app and get
  recovery codes, so that a stolen password alone can't reach my keys.
- As a developer, I want a profile page where I can change my name and email, so that my
  account stays current.
- As a developer, I want to delete my account and have my keys revoked in the gateway, so that
  nothing I leave behind keeps working.

## Acceptance criteria
QA runs these end to end against the docker compose stack (real Kong, Postgres and Mailpit),
reading every email from Mailpit's API. Wording for screens and emails comes from the ui-designer.

1. **Given** a fresh `docker compose -f deploy/docker-compose.yml up` with no SMTP settings
   changed **When** a visitor signs up **Then** within 30 seconds a verification email to that
   address appears in Mailpit, opening its link marks the address verified (the profile page
   shows it as verified), and the quickstart still reaches a working portal in under five minutes.
2. **Given** an admin on the mail settings page **When** they save SMTP settings and send a test
   email **Then** the test email is delivered to the address they entered, and the SMTP password
   is never shown again or returned by any API, nor written to logs. **If** the SMTP host can't
   be reached or rejects the login **Then** within 15 seconds the admin sees an error saying
   which (unreachable, or authentication failed) and the message contains no password.
3. **Given** an admin has turned on "Require a verified email" and a developer has not verified
   **When** that developer tries to create an app, in the UI or with `POST /v1/apps` **Then** it is
   refused with a 403 problem+json and a message offering to resend the verification email, no
   app or Kong consumer is created, and after they open a freshly sent link the same request
   succeeds. **If** no working SMTP settings exist **Then** the admin can't turn the setting on
   and is told to set up mail first.
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
7. **Given** a developer turning on two-factor login **When** they add the secret to an
   authenticator app (QR code or typed key) and confirm with a valid code **Then** they are shown
   10 recovery codes once, and their next sign-in asks for a code after the password and signs
   them in only with a valid code. **If** the confirmation code is wrong **Then** two-factor login
   stays off.
8. **Given** a developer with two-factor login on **When** they enter a wrong code at sign-in
   **Then** no session is created and they can try again. **When** they use a recovery code
   instead **Then** they are signed in, and that same recovery code is refused afterwards. **When**
   they turn two-factor login off **Then** they must confirm with their password and a current
   code, and the next sign-in asks for the password only.
9. **Given** a developer on the profile page **When** they change their name **Then** the new name
   shows across the portal. **When** they change their email **Then** a verification email goes to
   the new address, the account keeps the old address and can sign in with it until the link is
   opened, and afterwards it signs in only with the new address. **If** the new address already
   belongs to another account **Then** the change is refused without revealing more than that the
   address can't be used.
10. **Given** a developer with two apps that each have an active key **When** they delete their
    account, confirming with their password (and a two-factor code if it's on) **Then** both keys
    get 401 from Kong, no Kong consumer tagged with those apps remains, they are signed out and
    can't sign in, and the same email address can sign up again as a new account. **If** Kong's
    Admin API is unreachable **Then** deletion is refused with the "gateway unavailable, try
    again" error, nothing is deleted and the keys still work. **If** they are the only admin
    **Then** deletion is refused with a message saying another admin must exist first.

## Out of scope
- **Admin tools to manage other people's accounts** (reset someone's password or two-factor
  login, verify or delete another user). These belong with staff roles and the audit log in
  spec 015.
- **Making two-factor login mandatory** for everyone or for admins. Spec 015 (portal governance).
- **Passkeys, SMS or email codes as a second factor, and magic-link sign-in.** Authenticator
  apps (TOTP) cover the need with no outside service.
- **Social login and bring-your-own OIDC.** Later spec (see AGENTS.md).
- **Email providers other than SMTP** (SES, SendGrid and similar APIs). All of them offer SMTP.
- **Custom email templates edited in the admin UI.** The ui-designer designs fixed templates;
  editing belongs with the theme editor (spec 013).
- **Team invites and team-owned apps.** Spec 008. Until then, apps belong to one person, so
  deleting an account deletes that person's apps.
- **Notification emails** (key created, key revoked, access approved). Later specs add them on
  top of this mail transport.
- **Exporting account data** before deletion.

## Open questions
- [ ] **Should this ship as one pull request?** It touches mail transport, three auth flows,
  two-factor login, a profile page and gateway cleanup. If the tech lead judges it too big, I
  suggest splitting off two-factor login and account deletion (criteria 7, 8 and 10) into a
  second spec that ships right after. — Elango, with the tech lead's estimate
- [ ] **Is "Require a verified email" off or on by default?** I suggest off for the quickstart
  (Mailpit makes either work) and on for the hosted demo. — Elango
- [ ] **What happens to accounts that exist before the upgrade?** I suggest treating existing
  accounts and the bootstrap admin as verified, so turning the setting on doesn't lock out
  people who already have keys. — Elango
- [ ] **Which SMTP provider and sender address does the hosted demo use?** The roadmap lists
  this as Elango's job for sprint 3. — Elango
- [ ] **When both environment variables and admin UI settings exist, which wins?** I suggest the
  admin UI overrides the environment, and the UI shows when the environment is in use. — tech lead
- [ ] **Account deletion when Kong is down:** criterion 10 refuses deletion, matching how app
  creation behaves (specs 001 and 004), so a key never outlives its account. The alternative is
  to delete at once and let the reconcile job revoke the keys later. Confirm. — Elango
- [ ] **A developer who loses both the authenticator and the recovery codes** has no way back in
  this spec, because admin tools are out of scope. Is a documented operator command (or
  database step) for the platform engineer enough until spec 015? — Elango, then the tech lead
- [ ] **Rate limits** for sign-in, two-factor codes, and reset and verification emails: which
  limits, and does the hosted demo need stricter ones? — tech lead

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
