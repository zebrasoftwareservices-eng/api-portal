---
id: 008
title: Teams and roles
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-10
linear: JSO-236
---

# 008 — Teams and roles

## Summary
Apps and keys belong to a team instead of one person, so a developer can invite colleagues by
email as Admin, Member or Read-only, and the team's keys keep working when someone leaves.

## Problem
Today every app belongs to the developer who created it (spec 001), and deleting that account
deletes the app and its keys (spec 007). A company that builds on its own APIs works as a group:
several engineers share one integration, people join and leave, and a contractor or auditor
should see an app without being able to touch its keys. With one-person ownership, a colleague
leaving takes production keys with them, and the only way to share an app is to share a login.

It is solved when a developer can invite a teammate who then uses the team's app, a Read-only
member can see but not change keys, and removing a member or deleting their account leaves the
team's apps and keys working against Kong.

## Users
- **API consumer (developer):** creates teams, invites teammates, works in the team they switch to.
- **Team admin:** a developer with the Admin role in a team; manages members and invitations.
- **Platform engineer:** upgrades an existing portal and expects existing apps and keys to keep working.

Portal staff roles (the portal admin who connects gateways and publishes APIs) are a separate
thing and do not change here; see Out of scope.

## User stories
- As a developer, I want a personal team created when I sign up, so that I can keep working alone with no extra setup.
- As a developer, I want to create a team and switch between my teams, so that I see the apps of the team I'm working for.
- As a team admin, I want to invite a colleague by email with a role, so that they can use our app without sharing my login.
- As an invited colleague, I want to accept the invitation from the email, so that I join the team in one step.
- As a team admin, I want to give someone Read-only access, so that they can see our apps and keys without creating or revoking keys.
- As a team admin, I want to remove a member or change their role, so that access matches who is on the team today.
- As a team admin, I want removing a member to leave our keys working, so that nobody leaving breaks production.
- As a platform engineer, I want existing apps moved to their owner's personal team on upgrade, so that nobody's keys stop working.

### Roles
| Action | Admin | Member | Read-only |
| --- | --- | --- | --- |
| See the team's apps, their APIs and key metadata (name, prefix, created, status; never the secret) | ✓ | ✓ | ✓ |
| Create apps and keys, revoke keys | ✓ | ✓ | — |
| Invite, cancel invitations, remove members, change roles | ✓ | — | — |

Whoever creates a team becomes its Admin. A team always has at least one Admin.
Every member can leave a team, except its last Admin.

## Acceptance criteria
1. **Given** a portal with apps created before this change **When** it is upgraded and the
   server starts **Then** each existing developer has a personal team where they are Admin, each
   of their apps belongs to that team, and every key issued before the upgrade still returns a
   successful response through Kong. **And Given** a new developer signs up **Then** they get a
   personal team where they are Admin, and it is the current team.
2. **Given** a signed-in developer **When** they create a team named "Payments" and pick it in
   the team switcher **Then** they are its Admin, My apps lists only that team's apps (empty at
   first), an app they create there belongs to "Payments", and switching back to the personal team
   shows only the personal team's apps.
3. **Given** an Admin of "Payments" **When** they invite `dev2@example.com` as Member **Then** an
   invitation email reaches that address (Mailpit in the quickstart), the team page lists the
   invitation as pending with its role, and **When** dev2 opens the link, signs up or signs in with
   that address and accepts **Then** dev2 can switch to "Payments", sees its apps, creates a key on
   one of them, and a call with that key returns a successful response through Kong.
4. **Given** a Read-only member of "Payments" **When** they open the team's app **Then** they see
   the app, its APIs and its keys' metadata but no create or revoke key controls, **and When** they
   call the create-key or revoke-key endpoint directly **Then** the server answers 403 with a
   problem+json body, and the app's keys and Kong credentials are unchanged.
5. **Given** a Member or Read-only member of "Payments" **When** they try to invite someone,
   cancel an invitation, remove a member or change a role, in the UI or by calling the API
   **Then** the UI offers no such control, the API answers 403 with problem+json, and nothing changes.
6. **Given** an invitation for `dev2@example.com` **When** someone accepts it while signed in with
   a different address, or after the Admin cancelled it, or after it expired or was already used
   **Then** the portal shows why it can't be accepted, no membership is created, and the person
   does not see the team's apps.
7. **Given** dev2 is a Member of "Payments" and created a key on the team's app **When** an Admin
   removes dev2 from the team **Then** dev2 no longer sees "Payments" or its apps (its app URLs
   and API endpoints return 404 to dev2), and the key dev2 created still returns a successful
   response through Kong.
8. **Given** a member of "Payments" with another Admin in the team **When** that member deletes
   their account (spec 007) **Then** the apps and keys of "Payments" keep working through Kong,
   and only the apps of their personal team are deleted.
9. **Given** a team with exactly one Admin **When** that Admin tries to change their own role,
   remove themselves or leave the team **Then** it is refused with a message saying the team needs
   another Admin first, and **When** an Admin changes another member from Member to Read-only
   **Then** that member loses the create and revoke key controls on their next page load.

## Out of scope
- **Deleting, renaming or transferring teams, and moving apps between teams.** Cut to keep this to
  one pull request; deleting a team raises its own questions about its keys. Follow-up.
- **A separate Owner role, custom roles or per-app permissions.** Three fixed roles prove the value.
- **Portal staff roles** (who can connect gateways, publish APIs, configure SMTP), **audit log**
  and **mandatory two-factor login.** Spec 015. Team roles here never grant portal admin access.
- **Admin screens listing every team on the install.** Spec 015, with staff roles.
- **Plans, quotas, approvals or catalog visibility per team.** Specs 009 and 010; they can build
  on team ownership later.
- **Joining by shareable link, by email domain, or through SSO / SCIM group sync.** Invitations
  go to one email address only. SSO is a later spec (AGENTS.md).
- **Resending an invitation or editing its role.** The Admin cancels it and invites again.
- **Notification emails** besides the invitation (member removed, role changed). Later specs.

## Open questions
- [ ] When the last Admin of a team that has other members deletes their account, do we refuse
  the deletion until they make someone else Admin (recommended, matches criterion 9), or promote
  the longest-standing member automatically? — Elango
- [ ] When the last remaining member of a non-personal team deletes their account, are the team's
  apps and keys deleted with it (recommended, same as personal teams in spec 007)? — Elango
- [ ] How long does an invitation stay valid: 7 days (recommended) or configurable by the
  portal admin? — Elango
- [ ] When the portal requires a verified address before keys (spec 007), does accepting an
  invitation sent to that address count as verifying it? — tech-lead
- [ ] Should the invite form refuse an address that is already a member or has a pending
  invitation, or quietly do nothing? — ui-designer
- [ ] Are apps' Kong consumers already per app rather than per person, so removing a person
  never touches Kong, or does the migration need to re-tag them with the team? — tech-lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/008-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/008.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/008.md`. The full report is `docs/uat/008/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/008.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
