# ADR 0005 — Per-API access control: Kong ACL groups, a deny group, and one API per service

- Status: Proposed (accept by merging)
- Date: 2026-11-06
- Spec: 004-per-api-access-control
- Supersedes: the last consequence of [ADR 0002](0002-gateway-adapter-contract-v0.md), which left
  per-API scoping to the rate-limit plans spec

## Context
Kong key-auth credentials aren't tied to a service, so any portal key works on every key-auth
service in that Kong, including ones the portal has never heard of. Kong also forwards the key to
the upstream. The portal shares this Kong with traffic it doesn't own, so whatever it writes must
leave that traffic alone. Later adapters (spec 017 first) need the same promise without Kong's
vocabulary. Every Kong behaviour below was checked on a live Kong 3.9.4 during design; spec 004
records the results.

## Decision
1. **Two kinds of group, both derived, neither stored.** Each app's consumer is in
   `portal-consumer` and in `portal-svc-<serviceId>` for each Kong service it is subscribed to.
   Postgres `subscriptions` and `apis` are the only source of truth, so there's no new table.
   Group names use Kong's service ID, so renaming a service changes nothing.
2. **Managed services get an `allow` ACL; unmanaged key-auth services get a `deny` ACL.** This is
   option A from the spec. Only `portal-consumer` is denied, so non-portal consumers and anonymous
   traffic carry on as before. `portal-consumer` has no instance ID in it, so two portals sharing
   one Kong protect each other's consumers with one plugin.
3. **The ACL goes where key-auth is.** Service-scoped or global key-auth gets a service-scoped ACL.
   Key-auth on routes only gets one ACL per such route, because an ACL on the service would return
   401 to anonymous callers on the service's open routes. A service with no key-auth gets no ACL.
4. **The portal never overwrites an ACL it didn't create.** Kong allows one per scope, and a route's
   ACL overrides the service's. New imports are refused if a foreign ACL applies. Services already
   in place are left alone and reconcile logs a warning naming them. Portal ACLs are identified by
   the `portal-instance-<id>` tag.
5. **Hide credentials without touching global plugins.** On managed services the portal sets
   `hide_credentials` on service and route key-auth plugins, including operators' plugins (Elango,
   2026-11-06). Where only a global plugin applies, it adds a service-scoped copy with
   `hide_credentials` on, which overrides the global plugin for that one service. ACLs always set
   `hide_groups_header`, so upstreams see no new header.
6. **One published API per Kong service from now on.** An ACL can't tell two APIs on one service
   apart, so import refuses a second link. Existing pairs stay published and share one group, so a
   subscription to either grants both; reconcile warns about them.
7. **Reconcile makes a portal consumer's memberships exactly match its subscriptions.** Any other
   group on a consumer the portal owns is removed, tagged or not, whatever its name. Consumers the
   portal doesn't own are never touched, even when they're in a `portal-svc-*` group: that's how
   operators let internal callers back in.
8. **Memberships first, plugins second.** A subscribed key must never hit an ACL that doesn't know
   it yet. If a run adds memberships and then has to create or convert a plugin, it waits 6 seconds
   in between, which covers Kong's 5-second default propagation between nodes.
9. **The adapter takes desired state, not groups.** The server passes "these services are managed,
   these apps reach these services". Groups and plugins stay inside the Kong adapter, so AWS can map
   the same calls to usage plans.
10. **The try-it proxy rewrites exactly one response.** Kong's own ACL 403 becomes a problem+json
    with next steps. The adapter recognises it: 403, Kong's fixed message, and no
    `X-Kong-Upstream-Latency` header. Everything else still passes through unchanged (ADR 0003).

## Consequences
- The portal now writes to services operators own. That's a cost Elango accepted; the upgrade notes
  must say so, and must list the commands to remove the portal's plugins by tag.
- A new key-auth service stays reachable by portal keys until the next reconcile, up to 5 minutes.
- An operator-owned `deny` ACL that doesn't list `portal-consumer` leaves portal keys working on that
  service. The access rules are not met there; the portal only warns, because rule 4 outranks them.
- Linking a service locks out its non-portal consumers until the operator adds them to
  `portal-svc-<serviceId>`. Group membership an operator gives a portal consumer by hand doesn't
  last: reconcile removes it within 5 minutes.
- Spec 012 (versions) has to publish a new version as part of the same API, because a second API on
  the same service is now refused.
- Removing the portal doesn't remove its plugins; `allow` ACLs would keep refusing traffic.
- Adding `grantAccess`, `revokeAccess`, `protectService`, `applyAccessPolicy` and `isAccessDenied` to
  `GatewayAdapter` means every later adapter implements them; `capabilities()` gains `accessControl`.
- `docs/engineering-conventions.md` should pick up the interface change.
