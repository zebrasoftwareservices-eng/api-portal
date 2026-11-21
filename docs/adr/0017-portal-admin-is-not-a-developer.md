# ADR 0017 — A portal admin is not a developer

- Status: Proposed (accept by merging)
- Date: 2026-11-18
- Spec: 024 Admin sidebar shell

## Context
Until now a portal admin was a developer with extra rights. Every account gets a personal team
(spec 008), so an admin could create apps, subscribe, send access requests and hold gateway keys.
Those keys then showed up as developer traffic in Insights, and the admin UI mixed developer
actions (My apps, Teams, Create app, Subscribe) into the operator's screens. Admins already have
an operator path for every developer outcome: `createAdminSubscription` gives a team access
without the admin seeing its key (spec 010), and Revoke on product access removes it.

## Decision
1. **Two separate jobs, two accounts.** The portal role `admin` is an operator role only. A
   person who also calls APIs uses a separate developer account. There is no act-as-developer or
   impersonation mode.
2. **The server enforces it.** Every developer endpoint that creates a gateway key or a pending
   request refuses a caller whose portal role is `admin` with 403
   `/problems/admin-not-developer` (problem+json, title "A portal admin is not a developer"):
   `POST /v1/apps`, `POST /v1/access-requests`, `PUT /v1/apps/{appId}/plan`,
   `POST /v1/apps/{appId}/credentials` and `POST /v1/apps/{appId}/credentials/{credentialId}/regenerate`.
   The check is one shared guard (`requireDeveloper`) that runs first in the handler, right after
   the session is read and before the personal team is ensured, any row is written or any
   gateway call is made. The UI hiding these actions is a convenience, not the control.
3. **Reads and removals stay open.** An admin may still list and delete apps it already holds and
   revoke their keys, so accounts that created apps before this change can clean up. Admins see
   every team's apps through read-only admin endpoints (`/v1/admin/apps`) that return key hints
   only.
4. **Team roles and portal role stay independent** (spec 008): a team role never grants portal
   admin, and portal admin never grants team access.

## Consequences
- Insights and gateway consumers carry no new admin-owned traffic.
- Promoting a developer to admin (spec 015) blocks their future key writes; their existing apps
  keep working until deleted or revoked. Demoting restores developer writes.
- Apps and keys an admin account holds from before this change are not migrated or revoked here;
  they are listed on the admin Apps page with an owner whose role is `admin`.
- Tests and the demo seed can no longer create apps as the admin; they use a developer account.
- Any future developer write endpoint must call `requireDeveloper`; the review checklist covers it.
