---
id: 008
title: Teams and roles
status: uat   # draft → ready → designed → building → testing → uat → review → approved → done
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
Decision record: [ADR 0008](../adr/0008-teams-own-apps.md). Teams are portal tables, not Better
Auth's organization plugin. An app belongs to one team. Kong consumers stay one per app, so
membership changes never call Kong.

**Answers to the open questions.** The Elango questions are designed on the recommended answers.
Changing one later changes only `deleteAccount` or one constant.
- *Last Admin deletes their account while others remain:* refused with 409
  `/problems/team-needs-admin`, and the problem names the teams. Nothing is deleted.
- *Last remaining member of a non-personal team deletes their account:* the team's apps are
  deleted through Kong, then the team, the same as a personal team.
- *Invitation lifetime:* 7 days, a server constant (`INVITATION_TTL_DAYS = 7`), not configurable.
- *Does accepting an invitation verify the address (tech-lead):* yes. The token was emailed to
  that address. Accept sets `user.emailVerified = true` when the session's email matches.
- *Already a member or already invited (ui-designer):* the API refuses with 409
  `/problems/already-member` or `/problems/invitation-pending`. The ui-designer writes the copy.
- *Kong consumers per person or per app (tech-lead):* per app already (`ensureConsumer({ id:
  appId })`; username and tags come from the app ID). The migration needs no Kong re-tagging.
- *New, not in the spec:* a personal team is single-member. It takes no invitations (409
  `/problems/personal-team`), so deleting an account deletes only apps nobody else uses (AC 8).

### Components
- `packages/db`: the new tables, `apps.team_id`, and migration `0004_teams.sql` with the backfill.
- `apps/server`: new `teams.ts` (teams, members, invitations, access helpers). `apps.ts` checks
  access by team instead of by owner. `account.ts` changes `deleteAccount`. `auth.ts` creates the
  personal team after sign-up. The mail queue gets a `team-invitation` template.
- `packages/sdk`: regenerate from `openapi.yaml`.
- `apps/portal`: team switcher in the dashboard header; team pages (create, members,
  invitations); invitation accept page `/invitations/accept?token=…`; role-aware app pages.
- No adapter changes. `packages/adapter-kong` and the conformance suite are untouched.

### API contract (`apps/server/openapi.yaml`, tag `teams`)
| Method and path | Who | Result |
| --- | --- | --- |
| `GET /v1/teams` | signed in | `{ items: TeamSummary[], currentTeamId }`, personal team first, then by name |
| `POST /v1/teams` `{ name }` | signed in | 201 `TeamSummary`. Caller is Admin, and the team becomes current |
| `GET /v1/teams/{teamId}` | member | `TeamDetail`: summary, `members[]`, `invitations[]` (pending only; `null` unless Admin) |
| `PUT /v1/me/current-team` `{ teamId }` | member | 204. Sets `selected_at` on that membership |
| `POST /v1/teams/{teamId}/invitations` `{ email, role }` | Admin | 201 `Invitation`, email queued |
| `DELETE /v1/teams/{teamId}/invitations/{invitationId}` | Admin | 204, idempotent if already cancelled |
| `PATCH /v1/teams/{teamId}/members/{userId}` `{ role }` | Admin | 200 `TeamMember` |
| `DELETE /v1/teams/{teamId}/members/{userId}` | Admin, or self (leave) | 204 |
| `POST /v1/invitations/preview` `{ token }` | anyone | 200 `InvitationPreview` with `state`. Unknown token is 404 |
| `POST /v1/invitations/accept` `{ token }` | signed in | 200 `TeamSummary`. Membership is created and becomes current |

Changed endpoints:
- `GET /v1/apps?teamId=` lists that team's apps. Without `teamId`, it lists the current team's.
  The portal always sends `teamId`.
- `POST /v1/apps` takes an optional `teamId` in the body (default: the current team).
  Read-only gets 403. Name uniqueness is per team (`/problems/app-name-taken`).
- `GET /v1/apps/{appId}`, `POST …/credentials` and `DELETE …/credentials/{id}` use team access.
  A non-member gets 404 (AC 7). Read-only gets 403 on create and revoke (AC 4). The role is
  checked before `requireVerified` and before any gateway call.
- `App` gains `teamId` and `role` (the caller's role in that team), so the UI hides controls
  without a second call. `User` gains `currentTeamId`.
- `DELETE /v1/me` gains 409 `/problems/team-needs-admin`, with a `teams: [{id, name}]` extension.

Access rule, in one helper (`teamAccess(tx, teamId, userId, need)` and `appAccess(tx, appId,
userId, need)`, where `need` is `read`, `write` or `admin`). Not a member is 404 `not-found`, never
403, so team and app IDs don't leak. Not enough role is 403 `/problems/team-role-forbidden`. Write
paths lock the membership row `FOR SHARE`, so a removal waits for an in-flight key create.

New problem types (title and detail copy in `security-problems.ts` style; the ui-designer may edit
the copy, not the types):
| type | status | when |
| --- | --- | --- |
| `team-role-forbidden` | 403 | Read-only creates or revokes, or a non-Admin manages members or invitations |
| `team-needs-admin` | 409 | The last Admin demotes, removes or leaves themselves, or deletes their account while others remain |
| `personal-team` | 409 | An invitation to a personal team |
| `already-member` | 409 | The invited address belongs to a current member |
| `invitation-pending` | 409 | That address already has a pending, unexpired invitation to this team |
| `invitation-wrong-account` | 409 | Accept while signed in with another address. Nothing changes, and the invitation stays pending |
| `invitation-expired` · `invitation-cancelled` · `invitation-used` | 409 | Accept, and cancel for `used` |
| `mail-not-configured` (existing) | 409 | Invite when there are no effective mail settings, so nothing is stored |
| `rate-limited` (existing) | 429 | More than 20 invitations an hour from one user |

The order of checks for invite: validation, access (404/403), personal team, mail settings, rate
limit, already member, pending invitation. Emails are trimmed and lowercased before every
comparison.

### Data model (`packages/db/src/schema.ts`, migration `0004_teams.sql`)
- `teams`: `id` uuid pk; `name` text not null (1–80, trimmed; personal teams store `Personal`);
  `personal_owner_id` uuid unique, references `user`, on delete cascade, null for shared teams;
  `created_by` uuid, references `user`, on delete set null; `created_at`, `updated_at`.
- `team_members`: pk (`team_id`, `user_id`); `team_id` on delete cascade; `user_id` on delete
  cascade; `role` text, check in (`admin`, `member`, `read-only`); `selected_at` timestamptz not null
  default now(); `created_at`. Index on (`user_id`, `selected_at` desc).
- `team_invitations`: `id` uuid pk; `team_id` on delete cascade; `email` text not null (lowercased);
  `role` with the same check; `token_hash` text unique (SHA-256 of 32 random bytes, base64url);
  `invited_by` on delete set null; `created_at`; `expires_at`; `accepted_at`; `accepted_by` (on delete
  set null); `cancelled_at`. Partial unique index on (`team_id`, `email`) where `accepted_at` and
  `cancelled_at` are both null. Before inserting, the invite transaction deletes that address's
  expired pending rows for the team.
- `apps`: add `team_id` uuid not null, references `teams`, on delete **restrict**; add
  `created_by` uuid, references `user`, on delete set null; drop `owner_id` and
  `app_owner_name_unique`; add unique (`team_id`, `name`).
- `rate_limit_hits.bucket` check gains `team-invitation`.
- Current team = the caller's membership with the latest `selected_at`. `ensurePersonalTeam(userId)`
  is idempotent (`insert … on conflict (personal_owner_id) do nothing`, then insert the Admin
  membership on conflict do nothing). It runs in Better Auth's `user.create.after` hook and again
  at the start of `GET /v1/me`, `GET /v1/teams` and `GET/POST /v1/apps`.
- **Migration backfill**, one transaction, run by `migrate()` at server start: create
  `pg_temp.uuidv7(ts)`; for every `user` insert a personal team (`created_at` = the user's) and an
  Admin membership; add `apps.team_id` nullable, set it from `owner_id` through
  `personal_owner_id`, set `created_by = owner_id`, then `set not null`, swap the indexes and drop
  `owner_id`. `credentials` and `gateway_consumers` are untouched, so every key keeps working (AC 1).
  Add `packages/db/src/teams-migration.test.ts` in the style of `versions-migration.test.ts`.

### Flows
- **Invite:** in one transaction, lock the team row `FOR UPDATE`, run the checks above, insert the
  invitation and a rate-limit hit, then enqueue mail. Mail payload: `{ template: 'team-invitation',
  invitationId, to, link }`, with the link encrypted as today. `processMail` loads the invitation,
  skips it if it isn't pending, and renders with the team name, the inviter's name, the role and
  the expiry. Link: `${PORTAL_PUBLIC_URL}/invitations/accept?token=…`. Make `MailPayload` a union.
  The `userId` variants stay as they are.
- **Accept:** lock the invitation `FOR UPDATE` by `token_hash`. Check state (cancelled, then used,
  then expired), then email match. Insert the membership (on conflict do nothing, for someone who
  joined meanwhile) with `selected_at = now()`. Set `accepted_at` and `accepted_by`, and
  `emailVerified = true`. A failed check writes nothing (AC 6).
- **Role change, remove, leave:** lock the team row `FOR UPDATE`, then count Admins. If the
  change would leave zero, return `team-needs-admin`. Removing a member deletes only the
  `team_members` row (AC 7). Their keys and Kong stay as they are.
- **Account deletion (`deleteAccount`):** before the gateway health check, find teams where the user
  is the only Admin and other members exist, and refuse with `team-needs-admin` naming them. Then
  pick the teams where the user is the only member (the personal team, plus any shared team they
  are alone in). Delete each of those teams' apps through Kong one at a time, exactly as today,
  then delete those teams. Finally delete the user, which cascades their other memberships, and
  `created_by` becomes null. The final transaction re-runs both checks under the existing
  `71833004` lock. The `restrict` FK makes a missed app fail loudly instead of leaving a Kong
  consumer behind.

### Adapter calls
None new. Create app, create key and revoke key make the same calls as today, keyed by app ID,
after the team access check. Membership changes make no gateway call, so they work while Kong is
down. Account deletion calls `deleteConsumer` only for apps of teams it deletes, with the existing
health check, 503 and retry behaviour.

### Risks and how to test them
- **Upgrade loses keys (AC 1).** Migration test on a 0003 database seeded with users, apps, keys and
  consumers. Integration test: a key issued before the migration still gets 200 through a real Kong.
- **Access leaks across teams (AC 4, 5, 7).** Table-driven API test: every app and team endpoint ×
  {Admin, Member, Read-only, non-member, removed member}, checking 200/403/404 and that Kong and
  Postgres are unchanged after each 403.
- **Zero-Admin team under concurrency (AC 9).** Two Admins demoting each other in parallel: exactly one
  succeeds.
- **Invitation token misuse (AC 6).** Wrong account, cancelled, expired (clock moved 7 days) and
  reused tokens. No membership is created, and the preview shows the right state. Tokens never
  appear in logs, since they go in POST bodies only.
- **Account deletion deletes shared apps (AC 8).** A member of a shared team with another Admin
  deletes their account. The shared app's key still gets 200 through Kong, and the personal app's
  key gets 401.
- **Invitation spam.** 20/hour/user limit, and refused when mail isn't configured.
- **Quickstart.** The e2e invite flow runs against Mailpit in `docker compose up`.

### Tasks
- [x] [backend] Schema and `0004_teams.sql`: tables, `apps.team_id`/`created_by`, backfill with temporary UUIDv7 function, rate-limit bucket; `teams-migration.test.ts`
- [x] [backend] `ensurePersonalTeam`, wired into Better Auth `user.create.after` and the first-use endpoints; `currentTeamId` on `GET /v1/me`
- [x] [backend] `teams.ts`: `teamAccess`/`appAccess`, `GET/POST /v1/teams`, `GET /v1/teams/{teamId}`, `PUT /v1/me/current-team`
- [x] [backend] Members: `PATCH` and `DELETE /v1/teams/{teamId}/members/{userId}` with the team-row lock and last-Admin rule
- [x] [backend] Invitations: create (checks, rate limit, mail), cancel, preview, accept (verifies email); `team-invitation` mail template and `MailPayload` union
- [x] [backend] `apps.ts`: team access on every app route, `teamId` on list and create, per-team name lock and uniqueness, `teamId` and `role` on `App`
- [x] [backend] `deleteAccount`: `team-needs-admin` refusal, delete sole-member teams' apps through Kong, then the teams; update spec 007 tests for the new ownership
- [x] [backend] New problem types and copy; regenerate `packages/sdk`
- [x] [frontend] Team switcher in the dashboard header (personal team first); switching calls `PUT /v1/me/current-team` and reloads My apps with `teamId`
- [x] [frontend] Create team form; team page with members, roles, pending invitations; invite, cancel, change role, remove, leave, all hidden by role
- [x] [frontend] `/invitations/accept?token=` page: preview states, sign in or sign up with the invited address and return, accept, and every refusal message
- [x] [frontend] App pages read `app.role`: Read-only sees keys' metadata without create or revoke controls; create app goes to the current team
- [x] [frontend] Account deletion shows `team-needs-admin` with the named teams
- [x] [qa] Upgrade test (AC 1): pre-008 data, a key still works through real Kong after migrating; a new sign-up gets a current personal team
- [x] [qa] Role matrix API test (AC 4, 5, 7) with Kong and Postgres unchanged after every 403/404
- [x] [qa] Invitation e2e against Mailpit (AC 3) and the refusal cases (AC 6)
- [x] [qa] Removal and account deletion keep shared keys working through Kong (AC 7, 8); last-Admin guards and concurrent demotion (AC 9); switcher e2e (AC 2)

## UX  _(ui-designer)_
Design: [docs/design/008-teams-and-roles.md](../design/008-teams-and-roles.md). No new tokens.
- **Team switcher** above the `h1` on every `/dashboard/*` page ("Team: Personal ▾"), personal team
  first, with **Team settings** and **Create team**. Working alone looks as it does today.
- **New pages:** create team (`/dashboard/teams/new`); team page (`/dashboard/teams/{id}`) with
  invite form, members, pending invitations and leave; accept invitation (`/invitations/accept`)
  with a view for each preview state, signed out, signed in, and signed in with the wrong address.
- **Dialogs:** change role, remove member, leave team. Only-Admin cases show the "needs another
  Admin" message before calling the server, and the 409 shows the same copy.
- **Role-aware UI:** controls a role can't use are hidden, not disabled, with one line saying who
  can. Read-only sees key metadata with no New key or Revoke. The App page names the app's team and
  your role. A non-member gets "We can't find this…", never "no access".
- **Delete account (007)** now lists sole-member teams that go with the account and shared teams
  that stay, and shows `team-needs-admin` with links to the named teams.
- Copy for the invitation email and every new problem type is in design §3.12 and §5.2.
  Sign-up and sign-in read an optional `email` query parameter to prefill the invited address.

## Build notes  _(backend-developer, frontend-developer)_

Frontend: implemented the dashboard team switcher, team creation and member/invitation management, public invitation acceptance with all refusal states and auth email prefill, role-aware app controls, and account-deletion team summaries/links. All five frontend tasks are ticked; portal lint/typecheck and 249 package tests pass, plus the final 23-test team regression run after ensuring settings remount on team switches; UI lint/typecheck/test pass (UI has no standalone tests). The portal test run needs local sockets for the existing ingress tests; browser, full workspace suite, and quickstart remain for QA.

- Backend (2026-11-10): Implemented migration/backfill, personal teams and selection, team/member/invitation endpoints, hashed invitation tokens with encrypted queued links, role-based app access, per-team app names, and account deletion that preserves shared apps. Membership writes and app/key writes coordinate with the final account-deletion lock; last-Admin checks serialize on the team row. Regenerated SDK types from the existing contract. Validation: server lint/typecheck and 198 tests passed; database lint/typecheck and 6 tests passed; SDK lint/typecheck/test passed (no SDK tests). QA still owns the real-Kong upgrade/shared-key checks, full suite, browser, and quickstart.

## Test report  _(qa-tester)_
Commit tested: `33d1b186d076cc2db719aa0ee23b39e7a75571b1` (application unchanged from `6b97107f35756aae341fdb468203ebf3c6f10a07`; QA-only commits) · Portal: **http://localhost:3013**

| Criterion | Test file | Result |
| --- | --- | --- |
| AC 1 — upgrade preserves ownership and live keys; signup selects personal Admin team | `packages/db/src/teams-migration.test.ts`; `apps/portal/e2e/teams.test.ts` (personal signup) | Pass: real Postgres upgrade, real Kong key-auth returns 200 before/after migration, invalid key 401; signup personal team is current |
| AC 2 — create team, switch and isolate apps | `apps/server/src/teams.test.ts` (personal teams/current selection); `apps/portal/e2e/teams.test.ts` (switcher isolation) | Pass: Payments is current, apps belong to it, personal/shared lists remain separate |
| AC 3 — pending Member invitation, Mailpit delivery, signup/accept and live shared key | `apps/portal/e2e/teams.test.ts` (Mailpit invitation); `apps/server/src/teams.test.ts` (normalization/acceptance) | Pass: actual emailed link, pending role, signup return, acceptance and Member-created Kong key |
| AC 4 — Read-only metadata, hidden controls and forbidden key writes | `apps/server/src/teams.test.ts` (app role access); `apps/portal/e2e/teams.test.ts` (role/removal access) | Pass: APIs/key hints visible, controls absent, 403 problem+json, unchanged Kong credentials and active keys |
| AC 5 — non-Admins cannot manage invitations/members | `apps/server/src/teams.test.ts` (every non-admin management operation); `apps/portal/e2e/teams.test.ts` (Member/Read-only controls) | Pass: invite/cancel/change/remove denied with unchanged DB snapshots and no gateway mutation; UI controls absent |
| AC 6 — wrong-account, cancelled, expired and used invitations | `apps/server/src/teams.test.ts` (invitation refusal cases); `apps/portal/e2e/teams.test.ts` (refusal pages) | Pass: all four API refusals and explanatory pages, unchanged membership, no app access |
| AC 7 — removal hides teams/apps while the removed member's key survives | `apps/server/src/teams.test.ts` (member mutation/removal); `apps/portal/e2e/teams.test.ts` (role/removal access) | Pass: team absent, APIs 404, app page unavailable, shared key still returns 200 through Kong |
| AC 8 — account deletion preserves shared apps/keys | `apps/server/src/teams.test.ts` (account deletion); `apps/portal/e2e/teams.test.ts` (deleting member account) | Pass: personal key becomes 401, shared original and member-created keys remain 200 |
| AC 9 — last-Admin guards, concurrent demotion and refreshed role controls | `apps/server/src/teams.test.ts` (last-admin refusal/concurrent demotions); `apps/portal/e2e/teams.test.ts` (last-admin dialog/role change) | Pass: 409 on self-demotion/removal, only one concurrent demotion succeeds, UI explains another Admin is needed, refreshed Read-only controls disappear |

Validation: `pnpm lint` passed; `pnpm typecheck` passed after resolving a concurrent generated-output read; `pnpm test` passed **511 tests**. The one full `pnpm test:e2e` pass ran **71 tests**: 66 passed, five failed due to setup preconditions/test fixtures; all five failures and affected adjacent tests passed in a **10-test targeted recheck** after fixture corrections. Three existing expected gateway UI failures (JSO-399/405/406) remain expected; no new product finding was identified.

Quickstart: `node scripts/worktree-compose.mjs up -d --build --wait` succeeded, and its real-Kong/Mailpit smoke and fresh-setup journey passed. Project `portal-008-teams-and-roles-2-0ed0` remains up at the URL above for UAT. No open bugs existed at intake; there are no blocker/major findings and all four QA tasks are complete. Details: [QA log](log/008.md).

### Bugs
No open QA findings.

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
