# ADR 0009 — Plans map to one consumer-scoped Kong rate-limiting plugin per subscription

- Status: Proposed (accept by merging)
- Date: 2026-11-11
- Spec: 009-api-products-and-plans
- Builds on: [ADR 0005](0005-per-api-access-control-kong-acl.md) (ACL groups),
  [ADR 0008](0008-teams-own-apps.md) (teams own apps)

## Context
Spec 009 adds products and free plans. A plan has one rate limit (per second or per minute), one
monthly quota and a set of APIs. Kong has to enforce all three without the operator touching it.
Elango decided that every subscription is a new app with one key and one plan, that apps from
before this spec move to a built-in plan with no limits, and that APIs in no product keep the
spec 004 per-API flow. Two questions were left to the tech lead: how the monthly quota's window
works, and which rate-limiting policy the quickstart uses.

## Decision
1. **A subscription is an app.** `apps.plan_id` is required. A product plan's APIs come from
   `plan_apis`; a built-in-plan app's APIs stay in the spec 004 `subscriptions` table. One server
   helper returns an app's APIs, and create, key, plan change and reconcile all use it. The
   ACL design from ADR 0005 doesn't change: an app's consumer is in `portal-svc-<serviceId>` for
   each of those APIs.
2. **One consumer-scoped `rate-limiting` plugin per subscription.** The plugin is scoped to the
   app's consumer only (no service, no route), with `config.second` or `config.minute` set to the
   rate limit, `config.month` set to the quota and `limit_by: consumer`. Its ID is the adapter's
   `stableId('rate-limiting', appId)`, so `PUT /plugins/{id}` creates or replaces it idempotently.
   It is tagged `portalTags(instanceId, app)`. One counter covers all of the plan's APIs together.
   ACL (priority 950) runs before rate-limiting (910), so calls to APIs outside the plan are
   refused and not counted. Built-in-plan apps get no plugin.
3. **The quota is the calendar month in UTC.** Kong's fixed `month` window starts at 00:00 UTC on
   the 1st. The plan table says so (`quotaPeriod: calendar-month-utc`). A rolling 30-day window
   would need a custom plugin.
4. **Changing a plan keeps the counters.** Kong keys counters by consumer, period and the plugin's
   scope, not by plugin ID or config. Replacing the plugin's config doesn't reset the month's
   count.
5. **The policy is `cluster` by default, set by `PORTAL_RATE_LIMIT_POLICY` (`cluster` | `local`).**
   The portal only accepts a database-backed Kong, which `cluster` needs, and so does the
   quickstart. `cluster` counts across every Kong node in Kong's own database and survives a Kong
   restart, which a monthly quota needs. `local` is for operators who want no database write per
   request. It counts per node, so N nodes allow up to N times the limit, and a restart resets the
   counts. Redis (`redis`) is a follow-up. A Kong hybrid control plane refuses `cluster`; those
   operators set `local`.
6. **Order of Kong writes.** Subscribe: consumer, ACL groups, rate limit, then the key, so a key
   never exists without its limit. Change plan: new rate limit, new groups, then drop old groups.
   Cancel: delete the consumer; Kong cascades its keys, groups and plugin. Regenerate: new key,
   then delete the old one. A failed write is undone in Kong before the request fails, and
   reconcile repairs anything the undo misses.
7. **The adapter takes limits as desired state.** `GatewayAdapter` gains
   `applyPlanLimits(app, limits | null)`. `AccessPolicy.apps[]` gains `limits`, and
   `applyAccessPolicy` makes the portal's rate-limiting plugins match: create, update, or delete
   one with a `portal-app-*` tag whose app has no limits. `capabilities().plans` becomes true for
   Kong. Plugin names and policies stay inside the Kong adapter, so AWS (spec 017) can map the same
   calls to usage plans.
8. **Editing a plan reaches subscribers through reconcile.** The admin's save writes Postgres and
   sends the `gateway-reconcile` job right away. The request makes no Kong call per subscriber.

## Consequences
- Kong picks the most specific plugin of a kind. An operator's `rate-limiting` plugin scoped to a
  route and service together, or to a consumer with a service or route, outranks the portal's for
  that traffic. Plugins scoped to a service only, a route only, or globally do not. Reconcile logs a
  `foreign-rate-limit` finding naming the service. The portal never edits that plugin.
- With `cluster`, every proxied request with a portal key writes Kong's database. That's a cost on
  busy gateways, and the upgrade notes must say how to switch to `local`.
- After a plan edit, subscribers keep the old limits until the reconcile run finishes, usually a
  few seconds. A failed run is retried by the five-minute schedule.
- Apps from before this spec keep unlimited access, including to APIs an admin later adds to a
  product. Moving them onto a plan is a follow-up.
- `GatewayAdapter` and the conformance suite grow by one method. Spec 017 implements it with usage
  plans.
