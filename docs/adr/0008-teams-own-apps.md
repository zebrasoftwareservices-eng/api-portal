# ADR 0008 — Teams own apps: portal tables, not Better Auth organizations; Kong stays per app

- Status: Proposed (accept by merging)
- Date: 2026-11-10
- Spec: 008-teams-and-roles

## Context
Spec 008 moves app ownership from a person to a team, with three fixed roles (Admin, Member,
Read-only), invitations by email, a personal team per developer and a current team picked in a
switcher. Existing installs must upgrade without any key stopping working.

Better Auth 1.3.34, which already handles sign-in, ships an `organization` plugin with members,
invitations and an active organization on the session. It doesn't fit as shipped:
- Its endpoints live under `/api/auth/organization/*`, outside `openapi.yaml`, so the contract
  and the generated SDK would not describe half of the feature (AGENTS.md: OpenAPI-first).
- Its built-in roles are owner/admin/member with an Owner that can't be removed. The spec has no
  Owner role and needs Read-only.
- Deleting a user or removing a member knows nothing about Kong, our "last Admin" rule or our
  account deletion order (spec 007, ADR 0007).
- Its active organization lives on the session, so it resets on every new sign-in and differs
  between devices.

Kong consumers are already one per app (`ensureConsumer({ id: appId })`, username and tags from
the app ID). No Kong object names a person.

## Decision
1. **Teams are portal tables in `packages/db`:** `teams`, `team_members`, `team_invitations`.
   Handlers are Fastify routes described in `openapi.yaml`. The Better Auth `organization` plugin
   is not used.
2. **An app belongs to exactly one team** (`apps.team_id`, `on delete restrict`). `apps.owner_id`
   is replaced by `team_id` plus `created_by` (`on delete set null`), which is history only and
   never grants access. Access to an app is membership in its team, checked on every request, so
   a role change applies on the next request with no session refresh.
3. **Kong is not touched by membership.** Inviting, removing, changing roles and leaving are
   Postgres-only. The consumer stays per app, so a member leaving never revokes a key, and the
   upgrade needs no Kong re-tagging. Kong is called only where it is today: creating apps and
   keys, revoking keys, and deleting an app when its last team member's account is deleted.
4. **Every developer has one personal team** (`teams.personal_owner_id`, unique). It is single-member:
   it takes no invitations. It is created by the upgrade migration for existing users and, for new
   users, by an idempotent `ensurePersonalTeam` the server calls on first use, so a failed sign-up
   hook can't leave a user without a team.
5. **The current team is the membership selected most recently** (`team_members.selected_at`).
   It is stored server-side, survives sign-out and works across devices, needs no column on
   Better Auth's `user` table, and falls back to the next team automatically when the person is
   removed. API calls still name the team explicitly (`teamId`), so two tabs never write to the
   wrong team.
6. **Invitation tokens are 32 random bytes, stored as a SHA-256 hash**, single use, valid 7 days,
   bound to one lowercased email address. Accepting one while signed in with that address marks
   the address verified, because the token reached that inbox.
7. **The upgrade is one SQL migration** that creates a personal team per existing user, makes them
   Admin, and moves each app to its owner's personal team. It generates UUIDv7 IDs with a
   temporary `pg_temp` function, since Postgres 17 has no built-in `uuidv7()`.

## Consequences
- Plans, quotas and approvals (specs 009, 010) can attach to `teams` later.
- `on delete restrict` from `apps` to `teams` means a team can never be deleted while it still has
  apps, so no code path can drop an app without first deleting its Kong consumer.
- Team deletion, renaming and moving apps between teams need their own spec.
- A future SSO/SCIM spec maps groups onto `team_members`; nothing here depends on Better Auth's
  organization model.
