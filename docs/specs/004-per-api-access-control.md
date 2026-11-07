---
id: 004
title: Per-API access control on Kong
status: review   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-06
linear: JSO-233
linear_stages: requirements=JSO-247 design=JSO-248 ux=JSO-249 backend=JSO-250 frontend=JSO-251 test=JSO-252 uat=JSO-253 review=JSO-254 release=JSO-255
---

# 004 — Per-API access control on Kong: ACL groups and hidden credentials

## Summary
A portal-issued key works only on the APIs its app is subscribed to and never reaches the
upstream service, so a platform engineer can safely connect the portal to a real Kong.

## Problem
Platform engineers can't safely connect the portal to a Kong that carries anything else.
Today anyone who signs up gets a key that Kong accepts on every key-auth route, including
internal APIs that were never published in the portal. Spec 001 recorded this gap in
[ADR 0002](../adr/0002-gateway-adapter-contract-v0.md). Kong also forwards the full key to the
upstream, where it can leak into access logs ([JSO-165](https://linear.app/zebraprojects/issue/JSO-165)).

We'll know it's solved when a key for API A gets 200 on A and 403 on API B and on a key-auth
route the portal doesn't manage, the upstream never receives the key, and keys issued before
the upgrade still work on their own API.

## Users
- **Platform engineer:** connects the portal to a Kong and is accountable for what portal keys can reach.
- **API consumer (developer):** holds a key and needs it to keep working on the APIs they chose.
- **Portal admin:** publishes APIs by linking them to Kong services.

## User stories
- As a platform engineer, I want a portal key to work only on the APIs its app is subscribed
  to, so that signing up doesn't give anyone access to my internal APIs.
- As a platform engineer, I want my upstream services never to receive portal keys, so that
  keys can't leak through upstream logs.
- As a platform engineer, I want traffic that has nothing to do with the portal to keep working
  after I connect it, so that adopting the portal doesn't cause an outage.
- As a platform engineer, I want access rules that someone changes in Kong to be put back
  automatically, so that drift can't silently widen access.
- As a developer with an existing key, I want it to keep working on my API after an upgrade,
  so that my integration doesn't break.
- As a developer, I want a clear explanation when my key is refused on an API, so that I know
  what to do next.

## Access rules
These rules apply to every criterion below.

| Request through Kong | Result |
| --- | --- |
| Active key, app subscribed to this API | Reaches the upstream, without the key |
| Active key, app not subscribed to this API | 403 from Kong |
| Active portal key on a key-auth route the portal doesn't manage | 403 from Kong |
| Missing, unknown or revoked key on a portal-managed API | 401 from Kong (unchanged from spec 001) |
| Non-portal consumer or anonymous request on a route the portal doesn't manage | Unchanged |

- A subscription is the only thing that grants access. It's stored in Postgres, which remains
  the source of truth, and Kong is repaired to match it.
- Access belongs to the app. All of an app's active keys reach the same APIs.
- "Portal-managed" means a Kong service linked to a published API in `apis`.

## Acceptance criteria
QA runs these against a real Kong in Testcontainers.

1. **Given** published APIs A and B on separate Kong services, and an app subscribed only to A
   **When** its key calls each API **Then** A returns 200 and B returns 403.
2. **Given** a developer's key belongs to an app that isn't subscribed to the API they are viewing
   **When** they send a request from that API's try-it console **Then** they see the 403 and a
   message saying this key's app doesn't have access to this API and what to do next
   (wording from the ui-designer).
3. **Given** a Kong service with key-auth that isn't linked to any published API, a public route
   with no auth plugin, and a non-portal consumer with its own key **When** each is called
   **Then** a portal key on the key-auth service gets 403, the non-portal consumer's key still
   succeeds there, and an anonymous request to the public route still succeeds.
4. **Given** a key with access to a portal-managed API **When** it calls an echoing upstream, once
   with the key in the `apikey` header and once in the `apikey` query parameter **Then** the
   upstream receives the key in neither place and still receives `X-Consumer-Custom-Id`.
5. **Given** a v0.1 install with apps, active keys and subscriptions **When** it's upgraded to this
   version **Then** each existing key gets 200 on every API its app is subscribed to and 403 on
   the others, no request from a subscribed key is refused during the upgrade, and restarting
   the server afterwards changes nothing in Kong.
6. **Given** Kong's Admin API is unreachable when the upgraded server starts **When** the server
   boots **Then** it starts and logs a warning without any secret, no subscription or key is
   changed, and once Kong is reachable the next reconcile run reaches the same result as criterion 5.
7. **Given** a healthy install **When** someone in Kong (a) removes a subscribed app's group,
   (b) adds a portal consumer to a portal group it has no subscription for, (c) deletes the ACL
   plugin from a portal-managed service, or (d) turns `hide_credentials` off on one, and the
   reconcile job then runs **Then** each change is put back in that one run, and groups or
   objects without the portal instance tag on consumers the portal doesn't own are left untouched.
8. **Given** Kong fails or times out while the portal grants an app's access **When** a developer
   creates that app **Then** they see the "gateway unavailable, try again" error, no key is shown,
   no app row remains, and a retry succeeds with one Kong consumer and no duplicate groups.
9. **Given** an admin links an API to a Kong service with key-auth **When** they publish it **Then**
   existing keys get 403 on it, and a key from an app later subscribed to it gets 200. **If** the
   service already has an ACL plugin the portal didn't create **Then** the import is refused with
   a problem+json naming the service, nothing is published, and the service's plugins are unchanged.
10. **Given** the adapter conformance suite **When** it runs against the Kong adapter **Then** the new
    grant and revoke access calls are covered as follows: a repeated grant leaves one membership,
    revoking a missing grant succeeds, an unreachable gateway raises `GatewayUnavailableError`,
    and every object created carries the portal tags.

## Out of scope
- **Adding or removing APIs on an existing app.** The server has no endpoint for this today, so a
  developer who needs another API creates another app. Cut because spec 009 redesigns
  subscribing around products and plans. Grant and revoke ship in the adapter now, ready for it.
- **Plans, rate limits and quotas** (spec 009), **approval workflows and catalog visibility** (spec 010).
- **Admin screens for viewing or editing groups.** Postgres and reconcile own them.
- **Route-level or per-operation access within one API.** Access is per API.
- **The AWS adapter** (spec 017). It implements the same calls then.
- **New designed screens.** UI work here is error copy only, plus the three hints Elango approved in JSO-276.
- **Auditing or alerting on access changes** (spec 015). Reconcile logs what it repairs.

## Open questions
Elango answered the product questions on 2026-11-06. The unanswered ones are for the tech lead to
settle in the technical design.

- [x] **How do portal keys get a 403 on services the portal doesn't manage?** — Elango: **option A,
  a per-service `deny` ACL.** The tech lead confirms it on a live Kong during design, since the
  analysis below comes from reading source.
  ACL groups on published services can't do this alone. Kong's key-auth credentials aren't tied to
  a service, and an unmanaged service has no ACL to refuse them. The [ACL plugin schema](https://github.com/Kong/kong/blob/3.9.0/kong/plugins/acl/schema.lua)
  also rules out scoping an ACL to a consumer. The options below come from reading Kong 3.9
  source and haven't been run against a live Kong:
  - **A (recommended): the portal adds a `deny` ACL for a shared portal group to every key-auth
    service it doesn't manage.** This meets criterion 3 and leaves other consumers alone. The
    costs: the portal writes to services the operator owns, a new service stays exposed until the
    next reconcile run (up to 5 minutes), and services with their own ACL plugin need a rule,
    because Kong allows one per scope.
  - **B: a global `deny` ACL.** Rejected unless someone finds a way around this: the [ACL handler](https://github.com/Kong/kong/blob/3.9.0/kong/plugins/acl/handler.lua)
    returns 401 when there's no consumer or credential, so public routes in the operator's Kong would break.
  - **C: narrow the requirement, so the portal only finds and warns about these services and the
    operator protects them.** This is simplest and never writes to their services, but it drops
    a stated "Done when" of JSO-233 and leaves the sign-up exposure open by default.
- [x] **Should linking a service lock out its existing non-portal consumers?** — Elango: **yes, with
  the risk stated in the upgrade notes.** An `allow` ACL returns 403 for any consumer not in the
  group, so internal callers on a newly linked service stop working until the operator adds them
  to it. JSO-233 asks for an allow group on each service. At upgrade this can affect services that
  are already linked.
- [x] **May the portal change an operator's existing key-auth plugin to set `hide_credentials`?** —
  Elango: **yes, on portal-managed services only.** JSO-165 warns this could surprise operators, and
  an upstream that reads the key would break, so the upgrade notes must say so.
- [ ] **What happens when key-auth is global or on a route rather than on the service?** — tech-lead.
  `listServices` counts these as key-auth on. Changing a global plugin would hide credentials on
  services the portal doesn't manage, which breaks the access rules above.
- [ ] **What if two published APIs link to the same Kong service?** — tech-lead. Import allows it today,
  and an ACL on the service can't tell them apart, so a key for one would work on both. Either
  refuse it (and decide what happens to existing rows) or document one shared group per service.
- [x] **Should import still allow a service without key-auth?** — Elango: **yes, with no ACL and a
  warning that says the API is public.** Spec 001 allows it with a warning. An ACL there would return
  401 to everyone, because nothing identifies the consumer.
- [ ] **What happens at upgrade if an already-linked service has its own ACL plugin?** — tech-lead. Criterion 9
  covers new imports only. An `allow` list there already refuses portal keys, which fails safe,
  but a `deny` list wouldn't. Suggested answer: leave it alone, and have reconcile log a warning naming the service.
- [ ] **Should upstreams see group names in `X-Consumer-Groups`?** — tech-lead. Kong sends this header
  unless `hide_groups_header` is on. Suggested answer: turn it on, since nothing needs the header.

### Notes for the tech lead
- This delivers per-API scoping sooner than ADR 0002 planned ("belongs to the rate-limit plans
  spec"), so the new ADR should supersede that line. Spec 009 (JSO-237) is blocked on this work.
- Upgrade notes must say that keys lose access to APIs their app isn't subscribed to. That's the
  point of this change, but developers relying on the old behaviour will notice.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Decisions and their reasons are in [ADR 0005](../adr/0005-per-api-access-control-kong-acl.md).

### Decisions on the open questions
| Question | Decision |
| --- | --- |
| Option A, deny ACL on unmanaged services | **Confirmed on a live Kong 3.9.4** (see Verified on a live Kong). |
| Key-auth global or on a route | The ACL goes where key-auth is. Global or service key-auth gets a service ACL. Route-only key-auth gets one ACL per such route, so open sibling routes stay open. A global plugin is never edited: a managed service gets a service-scoped copy with `hide_credentials` on. |
| Two published APIs on one service | **Refuse new links** with `/problems/gateway-service-already-linked`. Existing pairs stay published and share one group, so a subscription to either grants both. Reconcile warns naming both. A unique index would fail the migration on those rows, so the check is in the handler. |
| Already-linked service with its own ACL at upgrade | **Leave it alone and warn** naming the service, as suggested. Memberships are still granted and credentials still hidden. An `allow` list keeps refusing portal keys. A `deny` list keeps letting them through until the operator fixes it. |
| `X-Consumer-Groups` | **Hidden.** Every portal ACL sets `hide_groups_header: true`. On unmanaged services this also keeps the upstream's headers unchanged. |

**Three choices the spec didn't ask about; Elango may want to look at these:**
- An operator-owned `deny` ACL on an unmanaged service leaves portal keys working there, which
  breaks the third access rule. The portal warns but doesn't edit the plugin (ADR 0005, decision 4).
- Reconcile removes *every* group not backed by a subscription from consumers the portal owns, not
  only groups named `portal-*`. That follows "a subscription is the only thing that grants access",
  but an operator's hand-added group on a portal consumer won't last.
- Refusing a second API on a service means there's no way to publish a new version of an API until
  spec 012. Today that's only possible by importing it under a new slug.

### Components
| Component | Change | Why |
| --- | --- | --- |
| `packages/adapter-sdk` | New calls, types, error, conformance cases | Gateway-neutral contract (AC 10) |
| `packages/adapter-kong` | Implements them, with all group and plugin logic | Keeps Kong's vocabulary out of the server |
| `apps/server/src/reconcile.ts` | Reads desired state from Postgres, applies it, logs repairs | AC 5, 6, 7 |
| `apps/server/src/apps.ts` | Grants access before issuing the key | AC 1, 8 |
| `apps/server/src/import.ts` | Refusals, then protects the service in the publish transaction | AC 9 |
| `apps/server/src/seed.ts` | Protects the sample service, and sends `hide_credentials: true` | Its PUT runs on every boot and would otherwise turn hiding back off |
| `apps/server/src/proxy.ts` | Rewrites Kong's ACL 403 | AC 2. Scalar has no response hook, so the message goes in the body it already shows |
| `apps/portal/components/admin-apis.tsx` | Copy for the new errors and warnings | Error copy only, per scope |
| `packages/sdk` | Regenerated | Contract changed |

### API contract
`apps/server/openapi.yaml` is updated. There are no new paths. Nothing changes on `/v1/apps`
except its description, and its existing 502 and 503 now also cover a failed grant.

| Operation | Change |
| --- | --- |
| `POST /v1/admin/apis` 201 | Body is now `ImportedApi`: `ApiDetail` plus `warnings: [{ code, message }]`. Codes are `api-public` (no key-auth) and `partial-key-auth` (key-auth on only some routes, so the others stay open). |
| `POST /v1/admin/apis` 422 | New `type` `/problems/gateway-service-has-acl`, whose `detail` names the service (AC 9). |
| `POST /v1/admin/apis` 422 | New `type` `/problems/gateway-service-already-linked`, whose `detail` names the linked API's slug. |
| `/v1/try-it` (all methods) 403 | New `TryItAccessDenied`: `/problems/api-access-denied`, with `title` and `detail` from the UX design. Status stays 403 and gateway headers pass through. |

Import checks run in this order, so existing errors keep their meaning: document validation, service
exists, route exists, slug free, service not linked, no foreign ACL. Only then does it write to Kong.

### Data model
**No tables, columns or migrations.** Desired state is `subscriptions` joined to
`apis.gateway_service_id`. Group names are derived from it. That also keeps criterion 6 simple:
there's nothing to roll back if Kong is down during the upgrade.

### Adapter calls
Added to `GatewayAdapter`; `capabilities()` gains `accessControl: true`:

```ts
interface ServiceRef { id: string }
interface AccessFinding { code: string; serviceId: string; serviceName: string; message: string }
interface AccessRepair { action: 'added' | 'removed' | 'updated'; object: 'membership' | 'plugin';
                         appId?: string; serviceId?: string; detail: string }
interface ServiceProtection { keyAuth: boolean; findings: AccessFinding[] }
interface AccessPolicy { services: ServiceRef[]; apps: { app: AppRef; services: ServiceRef[] }[] }
interface AccessReport { repairs: AccessRepair[]; findings: AccessFinding[] }

grantAccess(app: AppRef, service: ServiceRef): Promise<void>;    // repeat = one membership
revokeAccess(app: AppRef, service: ServiceRef): Promise<void>;   // missing = ok
protectService(service: ServiceRef): Promise<ServiceProtection>; // throws GatewayServiceConflictError
applyAccessPolicy(policy: AccessPolicy): Promise<AccessReport>;  // reconcile; writes only on drift
isAccessDenied(response: { status: number; headers: Headers; body: Uint8Array }): boolean;
```

`GatewayServiceConflictError(serviceName)` is new and isn't mapped globally; `import.ts` turns it into
the 422. `ensureConsumer` now also adds `portal-consumer`, so a consumer can't hold a key without it.

| Call | Kong Admin API | Idempotency and failure |
| --- | --- | --- |
| Membership add | `PUT /consumers/{username}/acls/{group}` with `{ tags }` | Upsert by group name; repeats keep one row and the same ID. Tags are the usual portal tags. |
| Membership remove | `DELETE /consumers/{username}/acls/{group}` | 404 counts as success. |
| ACL plugin | `PUT /plugins/{stable id}` with `{ name: 'acl', service or route, config: { allow or deny, hide_groups_header: true }, tags }` | Stable ID is a UUIDv5-style SHA-1 of `instanceId:acl:scopeId` using `node:crypto`, no new dependency. The same ID converts deny to allow with no gap. A conflicting ACL gets Kong's 409, so it fails closed. |
| Key-auth copy (global only) | `PUT /plugins/{stable id}` with the global plugin's `config` plus `hide_credentials: true` | Reconcile keeps it equal to the global config. |
| Hide on existing key-auth | `PATCH /plugins/{id}` with `{ config: { hide_credentials: true } }` | Merges, so other config and tags stay. Sent only when off. |
| Reads | `/services`, `/routes`, `/plugins`, `/consumers?tags=`, `/key-auths?tags=`, `/acls` (all paged) | All reads finish before any write. |
| Unmanaged clean-up | `DELETE /plugins/{id}` for a portal deny ACL at a scope no longer needing one | Otherwise a service that drops key-auth would answer 401 to anonymous callers. |

**`applyAccessPolicy` order:**
1. Read everything. A failed read throws before any write, so nothing changes (AC 6).
2. For each owned consumer in the policy, add missing memberships and remove extra ones. Desired is
   `portal-consumer` plus `portal-svc-<id>` per subscribed service. Other consumers are never touched.
3. If step 2 added memberships and step 4 will create or convert a plugin, wait 6 seconds.
4. For each Kong service, compute desired plugins using the scope rule, and write only what differs:
   - **Managed, key-auth present:** `allow` ACL, and `hide_credentials` on service and route key-auth.
     A foreign ACL at any scope: skip the ACL and report a finding, but still hide.
   - **Managed, key-auth gone:** keep an existing portal ACL, because it fails closed, and report a
     finding. Don't delete it: that would turn a published API public without anyone deciding to.
   - **Unmanaged, key-auth present:** `deny` ACL. A foreign ACL at the same scope or globally: skip it.
     Report a finding if that ACL is a `deny` list without `portal-consumer`, or if a route has one.
   - **Unmanaged, no key-auth:** delete any portal deny ACL.
5. Report linked services missing from Kong, and services linked by more than one API.

A `GatewayRejectedError` on one object is recorded as a finding and the run continues. A
`GatewayUnavailableError` ends the run; the next run converges. "Key-auth present" means an enabled
plugin. Compare only the fields the portal sets, so the run makes no writes when there's no drift.

**Server flows:**
- **Create app:** `ensureConsumer`, `grantAccess` for each distinct service, `issueCredential`, then
  the existing Postgres writes. Any failure reaches the existing `deleteConsumer` compensation, which
  cascades memberships (verified), and no key is shown.
- **Import:** in a transaction, take `pg_advisory_xact_lock(hashtextextended('service:' || id, 0))` to
  serialize imports of one service, then the shared `71833002` lock so reconcile can't see a protected
  service with no row. Check the link, call `protectService`, insert. If the insert fails, reconcile
  turns the ACL back to `deny` within 5 minutes.
- **Reconcile:** the existing orphan and credential clean-up runs first, then `applyAccessPolicy`.
  Log each repair and finding at `warn`, with IDs and names only. Reports contain no key values.
- **Proxy:** `registerProxy` takes the adapter. After reading the gateway's response, if
  `isAccessDenied` is true, send the problem body with the same status and headers, and
  `content-type: application/problem+json`.

### Verified on a live Kong
Run during design against `kong:3.9` (3.9.4) with Postgres and go-httpbin. 36 of 36 checks passed.
The first run failed 12 because the script allowed too little time for propagation, then passed after
it waited longer; that's why the first risk below is there.

| Behaviour | Result |
| --- | --- |
| Deny ACL: portal key, operator key, no key, public route | 403, 200, 401, 200 (AC 3) |
| Route-only key-auth with route deny: portal key, operator key, open sibling route | 403, 200, 200 |
| Service deny on a route-only service, open sibling route | **401**, which is why the scope rule exists |
| Allow ACL with hiding: key in header and in query | 200, key in neither place, `X-Consumer-Custom-Id` kept, no `X-Consumer-Groups` (AC 4) |
| Non-portal consumer on a managed service, before and after joining the group | 403, then 200 |
| Route-scoped foreign `deny` under a service-scoped `allow` | Portal key gets **200**, which is why any foreign ACL refuses an import |
| Second ACL at one scope | Kong answers 409 |
| Service-scoped key-auth copy under a global plugin | Key hidden there, still visible on other services, global plugin unchanged |
| Deny with key-auth `anonymous` set: no key, portal key | 200, 403 |
| ACL 403 compared with an upstream 403 | Only the upstream one has `X-Kong-Upstream-Latency`. ACL body: `{"message":"You cannot consume this service"}` |
| Time to take effect, one node | Membership or new key: under 15 ms in repeated runs. New plugin: about 4 s in one measurement. New routes needed more than 1.5 s. |
| ACL 403 body by `Accept` (added in review, Kong 3.9.4) | Kong follows the header: JSON for none, `*/*` or `application/json`; plain text, XML or HTML for those types. The design's "ACL body" row above holds only for JSON. See JSO-287. |
| Reading ACLs at scale (added in review, Kong 3.9.4, Postgres `max_connections` 100) | One concurrent read per consumer: 100 consumers succeed, 200 or more exhaust Kong's Postgres connections. One paged `/acls` read: 6001 rows in 383 ms. See JSO-286. |

### Risks
| Risk | Mitigation and test |
| --- | --- |
| Plugin and route changes take seconds to apply, even on one node, so tests that check at once will flake. | QA polls for up to 10 s after any plugin write. Membership and key checks need no polling. |
| A subscribed key is refused during the upgrade (AC 5). | Memberships first, plus the settle wait. QA calls with a subscribed key in a loop throughout the upgrade and fails on any 403. Multi-node isn't tested: the wait assumes the default `db_update_frequency` of 5 s, and the upgrade notes must say so. |
| Linking locks out internal callers, and `hide_credentials` breaks upstreams that read the key. | Accepted by Elango. The upgrade notes state both, and how to add a consumer to the group. |
| Global key-auth means a deny ACL on every service in the operator's Kong. | Each is tagged and removable by tag. QA covers global key-auth with a non-portal consumer. |
| The first reconcile holds the advisory lock across many writes, so app creation waits. | Writes take milliseconds and the wait is once only. Steady-state runs only read. |
| Kong's `headers` setting can remove the latency header that `isAccessDenied` checks. | The fixed message is still checked, so the worst case is an upstream 403 whose body contains Kong's exact text getting the portal's copy. Low impact. |
| The portal's plugins outlive the portal. | The upgrade notes give the removal commands, by the `portal-instance-<id>` tag. |
| Existing tests assume more than one API per service. | `journeys.ts` publishes twice to one service, and `app.test.ts` imports repeatedly. Both need updating; see tasks. |

**Restart check (AC 5):** compare Kong objects by ID and config, ignoring `created_at` and
`updated_at`. With `SEED_SAMPLE` on, the seed re-PUTs its own objects on every boot, and Kong's PUT
resets both fields. Corrected in review; see JSO-282 and the Review section.

### Tasks
- [x] [backend] JSO-256 adapter-sdk: add `grantAccess`, `revokeAccess`, `protectService`, `applyAccessPolicy`, `isAccessDenied`, their types, `GatewayServiceConflictError` and the `accessControl` capability; add the AC 10 conformance cases.
- [x] [backend] JSO-257 adapter-kong: have `ensureConsumer` add `portal-consumer`, and implement `grantAccess` and `revokeAccess` with upsert and delete by group name, tagged.
- [x] [backend] JSO-258 adapter-kong: implement `protectService` with the scope rule, foreign-ACL check before any write, stable plugin IDs, hiding on service and route plugins, the global key-auth copy, and `isAccessDenied`.
- [x] [backend] JSO-259 adapter-kong: implement `applyAccessPolicy` in the design's order, with the settle wait and no writes when there's no drift.
- [x] [backend] JSO-260 server: extend `reconcile.ts` to build the policy from Postgres, call `applyAccessPolicy` after the existing clean-up, and log repairs and findings with no secrets.
- [x] [backend] JSO-261 server: grant access in `POST /v1/apps` before issuing the key, inside the existing compensation.
- [x] [backend] JSO-262 server: add the import locks, `gateway-service-already-linked` and `gateway-service-has-acl` refusals, `protectService` and `warnings`; update `seed.ts` to protect the sample service and send `hide_credentials: true`.
- [x] [backend] JSO-263 server: pass the adapter to `registerProxy` and rewrite Kong's ACL 403 to `/problems/api-access-denied` using the UX copy.
- [x] [backend] JSO-264 Regenerate `packages/sdk`, update the fake adapter in `app.test.ts`, and fix unit tests that import twice onto one service.
- [x] [backend] JSO-265 Docs: add upgrade notes (keys lose unsubscribed APIs, internal callers locked out and how to add them to `portal-svc-<serviceId>`, `hide_credentials`, foreign ACL warnings, one API per service, multi-node assumption, removing plugins by tag) and update `docs/engineering-conventions.md`.
- [x] [frontend] JSO-266 Admin import: map `gateway-service-has-acl` and `gateway-service-already-linked` to `gatewayServiceId` field errors, using the UX copy.
- [x] [frontend] JSO-267 Admin import: replace the key-auth-off warning with copy saying the API is public, show `warnings` from the import response, and reword the already-linked note to say the import will be refused.
- [x] [frontend] JSO-276 Copy additions approved by Elango: API reference info line, Create-app hint and Kong service hint, matching §4.4 of the UX design with the accessibility wiring in §5.
- [x] [qa] JSO-268 AC 1, 3, 4: access-rule suite on real Kong and Postgres in Testcontainers, covering all five access-rule rows, plus route-only and global key-auth variants.
- [x] [qa] JSO-269 AC 2: Playwright, try-it with an unsubscribed key shows the 403 and the UX message; an upstream 403 stays unchanged.
- [x] [qa] JSO-270 AC 5, 6: upgrade from a v0.1 state with a call loop that fails on any refused subscribed key; restart compare ignoring `updated_at`; Kong down at boot, then converging on the next run with no secret in logs.
- [x] [qa] JSO-271 AC 7: all four drift cases repaired in one run, with untagged groups on non-portal consumers and their membership of `portal-svc-*` left alone.
- [x] [qa] JSO-272 AC 8: Kong failing or timing out during the grant gives the gateway error, no key, no app row, and a retry with one consumer and no duplicate groups.
- [x] [qa] JSO-273 AC 9, 10: publish and subscribe flow; foreign ACL refused at service, route and global scope with plugins unchanged; second link refused; conformance suite passes against Kong.
- [x] [qa] JSO-274 Update `apps/portal/e2e/journeys.ts` to publish to separate Kong services, and run the `docker compose` quickstart and smoke scripts with hiding on.
- [x] [backend] Fix JSO-286: read ACLs in `applyAccessPolicy` with one paged `/acls` request grouped by consumer, and add a real-Kong case with at least 500 owned consumers plus a unit case asserting no per-consumer read.
- [x] [backend] Fix JSO-287: make `isAccessDenied` recognise Kong's refusal in every `Accept` format while upstream 403s still pass through, and add unit cases per format plus a server test with `Accept: application/xml`.
- [x] [backend] Fix JSO-277: on a catalog miss in `apps/server/src/proxy.ts`, reload the published APIs once before refusing, so a just-published API works in try-it at once and an unpublished target is still refused; turn the `it.fails` regression in `apps/server/src/app.test.ts` into a normal passing test. Approved by Elango on 2026-11-07.
- [x] [backend] Fix JSO-291, changeset only: add a `.changeset/` file for this breaking change that points to `docs/upgrade-004-access-control.md`. The README link stays open, so leave JSO-291 in Backlog and comment what was done. Approved by Elango on 2026-11-07.
- [x] [frontend] Fix JSO-281: make the API reference info line match the JSO-281 wording in §4.4 of the UX design, so it's correct when security is set per operation, with a test. Approved by Elango on 2026-11-07.

## UX  _(ui-designer)_
Full design: [docs/design/004-per-api-access-control.md](../design/004-per-api-access-control.md).

There are no new screens, components or tokens. The design changes copy and states on three screens from spec 001:
- **API reference:** a refused key shows `403` in Scalar's response panel, with the title "This key
  doesn't have access to this API" and a next step: select **Get an API key** and create an app that
  includes this API (AC 2). The server's problem body holds this text. The page's info line repeats
  the next step, because Scalar's panel can't hold a link and appears not to wrap long lines. That
  comes from reading Scalar's source and hasn't been checked in a browser, so the user-tester checks
  it at 1280px and 375px.
- **Create app:** a new hint says the app's keys work only on the APIs chosen and that using another
  API means creating another app. A failed grant uses the existing gateway errors (AC 8).
- **Admin: APIs:** new field errors and alerts for both import refusals (AC 9), a warning that a service
  with no key-auth makes the API public, post-publish warnings from `warnings[]`, and a note that a
  linked service's import will be refused.

**Approved by Elango on 2026-11-06:** the spec scopes UI work to error copy, and these three additions
go slightly beyond it. They're tracked in JSO-276:
- the API reference info line
- the Create-app hint
- a Kong service hint warning that publishing locks out other Kong consumers and hides keys from the
  upstream. Elango accepted that risk with the upgrade notes as the place to state it, but an admin
  publishing a new API after the upgrade might never read them.

## Build notes  _(backend-developer, frontend-developer)_

- Backend follow-ups (2026-11-07): JSO-277 is fixed in `939beaf`; try-it refreshes the published catalog once on a target miss before refusing. Its former expected-failure test now passes normally against real Postgres and checks immediate publication visibility plus unpublished/external target refusal without gateway calls. JSO-291 changeset-only work is committed in `c7dae83`: `.changeset/per-api-access-control.md` records breaking backend package changes and links `docs/upgrade-004-access-control.md`; JSO-291 stays Backlog because its README link remains open.
- Validation for this round: `pnpm lint`, `pnpm typecheck`, `pnpm test --force` all pass (148 tests: 70 portal, 39 Kong adapter, 38 server, 1 database), and `pnpm exec changeset status` validates the release metadata. The first sandboxed full test attempt could not access Docker; the successful uncached run used Docker access. QA should verify immediate try-it use after publishing; e2e/quickstart were not rerun in this backend round. JSO-277 is In Review for independent verification; its Bugs checkbox remains open.

- Frontend JSO-281 (2026-11-07; commit `4683804`): the live API reference info line now matches UX §4.4, naming Scalar's Value field and explaining Select Auth Type for documents with operation-level security. A server-rendered page regression checks the complete copy and the Get an API key destination; it failed against the old wording and passes with the fix. Fresh `pnpm lint --force`, `pnpm typecheck --force` and `pnpm test --force` pass, including all 70 portal tests. QA/UAT should verify the guidance against a per-operation-security document in Scalar; the bug remains open for independent verification, and demo copy is unchanged.

- Backend review fixes (JSO-286, JSO-287, 2026-11-06): reconcile now takes one paged `/acls` snapshot and groups memberships by owned consumer ID before any write, avoiding the per-consumer request burst and ignoring other consumers' memberships. Unit coverage asserts pagination, exact membership repair, foreign-consumer preservation and no per-consumer reads; the real-Kong regression reconciles 501 owned consumers with 1,002 memberships and no repairs (5.8 seconds including setup and cleanup).
- ACL refusal detection now matches Kong's fixed message across JSON, plain text, XML and HTML while retaining the status and upstream-latency checks. Format-specific unit tests and real negotiated Kong responses pass; the server regression sends `Accept: application/xml`, checks the UX problem response and verifies XML upstream 403 pass-through. Validation: `pnpm lint`, `pnpm typecheck` and `pnpm test --force` pass (147 tests: 69 portal, 39 Kong adapter, 38 server, 1 database; includes the existing expected-failure JSO-277 regression). QA should rerun quickstart/e2e, and UAT should check AC 2 on an XML or plain-text operation; those browser checks were not rerun in this backend round. No API contract change was needed.

- Backend (JSO-256–JSO-265, 2026-11-06): added the gateway-neutral access contract, tagged Kong memberships, stable scoped ACLs, managed credential hiding and global key-auth copies. Reconcile snapshots reads before writes, repairs exact owned-consumer memberships before plugins, waits six seconds when new memberships precede plugin creation/conversion, and logs findings without key values. Foreign ACLs are preserved; shared legacy services warn with API slugs.
- App creation grants each distinct subscribed service before issuing credentials, using the existing compensation. Import serializes service links with advisory locks, refuses duplicate links and foreign ACLs, protects before publishing, and returns UX warning messages. The proxy rewrites Kong ACL 403s with the exact UX copy while preserving upstream refusals. Regenerated the SDK and added [upgrade notes](../upgrade-004-access-control.md); no schema migration is needed.
- QA: fresh sample installs protect the sample immediately; existing installs defer its first allow ACL to startup reconciliation so existing subscriptions receive memberships first. Seed always enables credential hiding. The later full-workspace run supersedes the earlier frontend build note about backend test failures: `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass. Backend coverage includes 34 server tests with real Postgres, 12 policy unit cases, three transport cases, and three real-Kong cases (conformance plus deny-to-allow conversion with stable ID and a no-repair second run). QA still owns the full access-rule, upgrade traffic-loop, propagation, quickstart and browser acceptance suites in JSO-268–JSO-274.

- Frontend (JSO-266, JSO-267, JSO-276): admin import maps both new refusals to the Kong service field, retains values and focus, and clears stale refusals when the service changes. Public and linked-service warnings use the UX copy; successful imports keep all server warning messages in response order after the form resets and associate them with the focused success alert. Existing alert styles now wrap long names.
- Added the approved API reference info line, API-choice hint and key-auth service effects hint with accessible descriptions. Component coverage checks refusal focus and recovery, warning persistence and future warning codes, conditional service notes, and the API-choice hint during loading, validation and empty states. Validation: workspace lint and typecheck pass, and the full portal suite passes 68 tests. The full workspace suite currently fails only in backend app tests while the adapter fake and repeated imports are being updated; QA should verify the live Scalar 403 body at desktop and mobile sizes, supplied by the proxy.

- Frontend UAT fixes (JSO-279, JSO-280, JSO-278, 2026-11-06; commit `90a3b87`): renamed the portal catalog/loading layout class to `portal-grid`, removing the desktop column rules that leaked into Scalar's response grids. AC 2 now measures the response body scroller at 1280px, 1920px and 375px (minimum widths 400px desktop / 280px mobile), in addition to checking the real refusal and upstream pass-through.
- Import validation now focuses invalid fields from a post-commit effect after the fieldset is enabled; the alert is focused first, then the Kong service select. Existing focus assertions remain intact. A delayed-response component regression blocks animation frames and asserts that focus order; real-browser regressions repeat both refusals twice at 1280px and 375px and check focus after two further paints. Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test` (136 tests, including 69 portal), and `pnpm test:e2e` (21/21) pass with default test concurrency. Compose builds and starts healthy. QA/UAT should independently retest the three bugs; their Bugs checkboxes stay open pending verification.

## Test report  _(qa-tester)_

QA rerun after the approved JSO-277/JSO-281 fixes: 2026-11-07 (dispatch base `c2737c1`; backend fix `939beaf`, frontend fix `4683804`). Real Kong 3.9 and Postgres 17 run in Testcontainers; browser and startup/outage journeys run against the built Docker Compose quickstart. Tests change no application code.

| Criterion | Test file | Result |
| --- | --- | --- |
| AC 1 — subscribed A succeeds, unsubscribed B is refused | `packages/adapter-kong/src/conformance.test.ts`, “AC 1/3/4” | PASS: 200 on A, 403 on B; missing, unknown and revoked keys return 401. |
| AC 2 — try-it shows the 403, exact title and next step; upstream 403 stays unchanged | `apps/portal/e2e/journeys.ts`, “AC 2”; `apps/server/src/app.test.ts`, “rewrites only gateway ACL 403s” | PASS against real Kong in Scalar for JSON, XML, plain text and HTML operations, asserting Scalar actually forwards the declared Accept header and renders the response title and next-step problem body; actual body scroller exceeds 400px at 1280/1920 and 280px at 375, with a visible Body region. The JSON fixture has operation-level security and a scheme named `key`: the test follows Select Auth Type → key → Value before sending. A warm catalog accepts each newly published target on the first proxy request, without the old 30-second polling workaround (JSO-277). |
| AC 3 — unmanaged key-auth refuses portal keys, operator keys and public traffic preserved | `packages/adapter-kong/src/conformance.test.ts`, “AC 1/3/4”, “AC 3: route-only”, “AC 3/4: global” | PASS: service, route-only and global key-auth; public sibling remains open; operator consumer succeeds on unmanaged service. |
| AC 4 — header and query key hidden; consumer identity retained | `packages/adapter-kong/src/conformance.test.ts`, “AC 1/3/4”, “AC 3/4: global” | PASS: echo contains neither key; `X-Consumer-Custom-Id` matches app; global key-auth unchanged outside managed services. |
| AC 5 — legacy keys upgrade without interruption and restart converges | `packages/adapter-kong/src/conformance.test.ts`, “AC 5/7” and “JSO-286”; `apps/portal/e2e/gateway.ts`, “sample seed converges”; `apps/server/src/app.test.ts`, reconcile policy assertion | PASS under the documented review ruling: uninterrupted subscribed traffic returns 200 during upgrade; B becomes 403; a fresh adapter makes no repairs. Real server restart preserves complete sample service, route and plugin IDs/configuration, ignoring `created_at` and `updated_at`. The 501-consumer / 1,002-membership case exercises paged ACL reads. Single-node Kong only. |
| AC 6 — boot with Kong down, no persisted access/key changes, next run repairs | `apps/portal/e2e/gateway.ts`, “AC 6”; `apps/server/src/app.test.ts`, “AC 6”; `apps/server/src/startup.test.ts`, “AC 6” | PASS: real server starts while Kong is stopped, logs unavailability without key/password; persisted app/key/subscription detail is unchanged; same reconcile job body after recovery restores the removed membership and key returns 200. Real-Postgres test also compares subscription and credential rows. |
| AC 7 — all four drift cases repaired in one run; operator memberships preserved | `packages/adapter-kong/src/conformance.test.ts`, “AC 5/7”; `packages/adapter-kong/src/access.test.ts` | PASS, including the 501-consumer paged snapshot regression and unit assertion forbidding per-consumer ACL reads: missing subscribed group, extra unsubscribed group, deleted ACL and disabled hiding repaired together; operator's untagged group and `portal-svc-*` membership unchanged; next run reports no repairs. |
| AC 8 — failed or timed-out grant compensates; clean retry without duplicates | `apps/server/src/app.test.ts`, “compensates failed grants”; `packages/adapter-kong/src/kong.test.ts`, grant transport cases; `packages/adapter-kong/src/conformance.test.ts`, “AC 8”; `apps/portal/e2e/gateway.ts`, outage retry | PASS: 503/problem with no key or app row, issueCredential not called after grant rejection; retry leaves one consumer/credential; real partial-grant compensation cascades memberships and retry has one membership per group; timeout/connection failures expose no transport secret. |
| AC 9 — publish denies existing keys, subscribe grants; foreign ACL and duplicate link refused | `packages/adapter-kong/src/conformance.test.ts`, “AC 9” cases; `apps/server/src/app.test.ts`, import conflict and simultaneous import cases; `apps/portal/e2e/journeys.ts`, admin imports | PASS: real gateway 403 then 200 after grant; service/route/global foreign ACL snapshots unchanged; server returns 422 problem naming service with no published row; concurrent duplicate links yield one 201 and one 422. Admin fixtures use separate services. |
| AC 10 — tagged idempotent grant/revoke conformance and unreachable gateway | `packages/adapter-kong/src/conformance.test.ts` invoking `packages/adapter-sdk/src/conformance.ts` | PASS: repeated grant keeps one membership and same ID, missing revoke succeeds, unavailable grant/revoke throws `GatewayUnavailableError`, created consumers/keys/memberships/plugins carry ownership tags. |

Validation for this rerun (supersedes earlier QA results):

- `pnpm lint` and `pnpm typecheck`: **PASS**. Standalone strict TypeScript checking of the journey and gateway Playwright files also passes.
- `pnpm test --force`: **PASS, 148 ordinary passes** (70 portal, 39 Kong adapter, 38 server, 1 database); all 12 workspace tasks execute without cache. No skipped or expected-failure tests remain.
- `pnpm test:e2e`: **PASS, 24/24 ordinary passes in 1.1 minutes**, no browser expected failures. Includes four negotiated response formats, 1280/1920/375px body-width checks, repeated import-refusal focus, gateway outage and startup/reconcile recovery.
- `node deploy/quickstart-smoke.mjs`: **PASS, 98.7 seconds**, including image builds, Compose startup and seeded home page against the worktree Compose stack (cached image layers and existing volumes; no volume reset).
- `node deploy/smoke.mjs`: **PASS** (signup, app/key creation, real Kong auth, try-it, one-time key and revocation). `node deploy/outage-smoke.mjs`: **PASS** (Kong outage returns 503 with no partial app, retry creates one consumer/key, server outage shows the error page and recovers).
- Failure paths cover invalid input, missing permission, real session expiry before creating an app (no consumer/grant/key side effects), duplicate requests, refused imports, unreachable gateway, grant timeout and compensation. This rerun adds operation-level security/Value-field recovery and removes publication-cache polling; all four negotiated-format refusals retain upstream 403 pass-through checks. Existing invalid-input, session, permission, timeout and compensation tests pass without modification.
- Local evidence: `/tmp/004-qa4-{lint,typecheck,test,e2e-types,e2e,quickstart,smoke,outage}.log`.

Known limitations and flakiness:

- JSO-277 now passes as an ordinary server regression, including unpublished and external target failure paths; browser coverage warms the catalog before publishing and checks the first proxy request without retries.
- Per the tech-lead's AC 5 ruling, the ordinary restart check compares complete object configuration, excluding both timestamp fields. JSO-282 stays Backlog pending Elango's interpretation of literal AC 5 wording; this is not an application fix.
- Existing minor issues JSO-282, JSO-283, JSO-284 and JSO-292 remain Backlog. No claim is made that they are fixed.
- The first browser attempt exposed incorrect locators in the new test (a hidden input remains mounted; the option name includes its Delete button), which were corrected without application changes. An immediate rerun then exhausted the existing 60/minute proxy budget and returned 429s; `/tmp/004-qa4-e2e-rate-limit-attempt.log` preserves that evidence. The final full run starts after a server restart clears that in-memory budget; repeated runs need a fresh rate window or server restart.
- Kong propagation is asynchronous; tests poll observable responses. The existing six-second production membership settle wait remains real. Multi-node Kong remains untested.

Disposition: **uat**. All ten criteria have passing automated coverage under the documented AC 5 timestamp ruling. No new bug or open blocker/major Bug issue was found; JSO-277 and JSO-281 are independently verified and closed. Four known minor Backlog bugs remain open; prior Code Review findings JSO-286/287 are already Done.

Bug retest audit: queried all direct Bug children of JSO-233 without a limit: **nine issues, `truncated: false`, `hasMore: false`**. The two In Review issues, JSO-277 and JSO-281, pass independent regression tests and move to Done; JSO-278/279/280 remain Done. JSO-282/283/284/292 remain Backlog (all minor). Existing QA task issues JSO-268–JSO-274 were already Done and remain Done; JSO-252 was explicitly reopened for this rerun.

### Bugs
- [x] JSO-277 Newly published APIs are rejected by try-it until its 30-second catalog cache expires (minor)
- [x] JSO-278 Admin service-refusal focus assertion intermittently fails under test load (minor)
- [x] JSO-279 Try-it response body is about 116px wide on desktop, so the 403 message can't be read (major)
- [x] JSO-280 After an import refusal, focus stays on the alert instead of the Kong service field (minor)
- [x] JSO-281 API reference info line points to an apikey field that isn't there when security is set per operation (minor)
- [ ] JSO-282 Restarting the server resets `created_at` on the sample's Kong objects (minor)
- [ ] JSO-283 Keyboard users can't scroll Scalar's response body to read the end of the 403 message (minor)
- [ ] JSO-284 Kong service hint says "See the upgrade notes" but gives no link to them (minor)
- [ ] JSO-292 After publishing, the Kong service list doesn't mark that service as linked until the page reloads (minor)
- [ ] JSO-294 App page's "Try your key" still says to paste into the apikey field, which gives a 401 (minor)
- [ ] JSO-295 Info line says "Select Auth Type" and "key scheme", but the screen shows "Auth Type" and bare scheme names (minor)
- [x] [frontend] Fix JSO-279: make the try-it response body readable at desktop widths, and assert it in the AC 2 browser test
- [x] [frontend] Fix JSO-280 and JSO-278: after an import refusal, focus reliably moves to the Kong service field in a real browser and under test load, keeping the existing focus assertion unrelaxed

## User testing  _(user-tester)_
Fourth run, on 2026-11-07, after the JSO-277 and JSO-281 fixes, in Orca's built-in browser. The stack was the Compose install QA left running, built from this worktree at `c2737c1` with Kong 3.9.4; only tests and this spec changed after that build. It kept QA's data, so this wasn't a clean install. Screenshots are in `docs/uat/004/retest3/`. App code changed only in `apps/server/src/proxy.ts` and the info line since the third run, which follows below.

**Disposition: `review`.** No blocker or major bug is open. Both fixes work in the browser, so JSO-277 and JSO-281 stay Done. Six minor bugs are open: JSO-294 and JSO-295, which are new, plus JSO-282, JSO-283, JSO-284 and JSO-292 from earlier runs.

**JSO-277: try-it straight after publishing. Pass.** I waited out the 30-second cache so the warm request was sure to reload it, then published through the admin screen and sent the first request 11 seconds after the warm one.

| Step | Time | Result |
| --- | --- | --- |
| Warm request on an existing API | +0.9 s | 200 through Kong. [21](../uat/004/retest3/21-jso277-warm-request-200-1280.png) |
| Publish a new API from the admin screen | +3.6 s | Published and in the catalog |
| First send on the new API, key's app not subscribed | +11.1 s | Kong's real 403 with the portal's message, and no `try-it-target-not-allowed`. [23](../uat/004/retest3/23-jso277-new-api-sent-inside-window-1280.png) |
| Get an API key, then send with the new app's key | Next | 200. [24](../uat/004/retest3/24-jso277-subscribed-new-app-200-1280.png) |
| Target with no published API, and an external URL | Same page | Both 400 `try-it-target-not-allowed`, so neither is forwarded |

My first attempt took 43 seconds, so the cache had already expired and it proved nothing. The timings above are from the second attempt, which replaced it.

**JSO-281: following the info line literally. Pass, with a new minor bug on its wording (JSO-295).**

| Document | What the Authentication panel shows | Following the line | Screenshot |
| --- | --- | --- | --- |
| Sample API (top-level security) | Scheme already chosen, Name `apikey`, Value empty | Paste into Value, send: **200** | [08](../uat/004/retest3/08-sample-reference-auth-1280.png), [13](../uat/004/retest3/13-sample-send-200-1280.png) |
| Per-operation `apiKey` in a header | "No authentication selected" and a control reading **Auth Type** | Open it, choose `key`, Value appears, paste, send: **200**, key not at the upstream, `X-Consumer-Custom-Id` present | [01](../uat/004/retest3/01-perop-reference-select-auth-type-1280.png), [04](../uat/004/retest3/04-perop-select-auth-type-open-1280.png), [05](../uat/004/retest3/05-perop-key-scheme-chosen-1280.png), [07](../uat/004/retest3/07-perop-send-result-1280.png) |
| Per-operation `apiKey` in the query | Same, with the key sent as `?apikey=` | **200**, key not at the upstream | [25](../uat/004/retest3/25-query-key-subscribed-200-key-hidden-1280.png) |
| Two `apiKey` schemes | List shows `key` and `partnerToken` | `key`: **200**. `partnerToken`: 401 "No API key found in request", then a retry with `key` works | [09](../uat/004/retest3/09-two-schemes-auth-type-list-1280.png), [14](../uat/004/retest3/14-two-schemes-key-200-1280.png), [15](../uat/004/retest3/15-two-schemes-wrong-scheme-401-1280.png) |
| Bearer only | The portal adds `portalApiKey` and preselects it, so Value shows and no choice is needed | Paste, send: **200** | [10](../uat/004/retest3/10-bearer-auth-type-list-1280.png), [12](../uat/004/retest3/12-bearer-send-result-1280.png) |
| Bearer and `apiKey` together | List shows `key` and `token` | `key`: **200**. `token` shows a **Bearer Token** field, not Value, and gets 401 | [16](../uat/004/retest3/16-mixed-auth-type-list-1280.png), [17](../uat/004/retest3/17-mixed-bearer-chosen-field-1280.png), [18](../uat/004/retest3/18-mixed-bearer-send-1280.png), [26](../uat/004/retest3/26-mixed-key-subscribed-200-1280.png) |

The bearer answer the coordinator asked about: Scalar does show a different field for a bearer scheme. That only matters when a document has both kinds of scheme and the developer picks the bearer one, and the line's "key scheme" points them the right way. [27](../uat/004/retest3/27-closed-control-reads-auth-type-1280.png) shows the closed control.

| User story | Result | Evidence |
| --- | --- | --- |
| Platform engineer: a portal key works only on subscribed APIs | **Pass.** Browser: subscribed 200, unsubscribed 403. Kong calls: unknown and missing keys 401. | [07](../uat/004/retest3/07-perop-send-result-1280.png), [23](../uat/004/retest3/23-jso277-new-api-sent-inside-window-1280.png), [24](../uat/004/retest3/24-jso277-subscribed-new-app-200-1280.png) |
| Platform engineer: upstreams never receive portal keys | **Pass.** The upstream's echo, read on screen, has no key from a header or a query parameter, and has `X-Consumer-Custom-Id`. | [07](../uat/004/retest3/07-perop-send-result-1280.png), [25](../uat/004/retest3/25-query-key-subscribed-200-key-hidden-1280.png) |
| Platform engineer: non-portal traffic keeps working | **Pass.** No screen covers this, so it's real calls through Kong. Unmanaged key-auth service: portal key 403, operator key 200, anonymous 401. Public route: anonymous 200. | Kong calls only |
| Platform engineer: changes in Kong are put back automatically | **Pass.** No screen covers this either. All four drift cases were repaired in one scheduled run, 221 seconds after I made them. The restored ACL kept its plugin ID, and logs held no keys. | Kong calls and server log |
| Developer: an existing key keeps working after an upgrade | **Pass, partly carried forward.** I didn't repeat the upgrade from `main`, because nothing it depends on changed: see the third run and QA's rerun. On this build, a server restart left Kong's services, routes and plugins identical apart from timestamps, and an existing key still got 200 and 403 correctly. | [34](../uat/004/retest3/34-dashboard-app-after-restart-1280.png) |
| Developer: a clear explanation when a key is refused | **Pass.** The panel shows `403 Forbidden` and "This key doesn't have access to this API". The body reads: "This key's app doesn't have access to this API. Select Get an API key on this page, create an app that includes this API, and send the request with the new key. If this key's app should already have access, tell the portal admin." **Get an API key** opened Create app with the API ticked, and the new key got 200. | [20](../uat/004/retest3/20-mixed-key-unsubscribed-403-1280.png), [23](../uat/004/retest3/23-jso277-new-api-sent-inside-window-1280.png), [24](../uat/004/retest3/24-jso277-subscribed-new-app-200-1280.png) |

Other checks on this journey:

| Check | Result | Screenshot |
| --- | --- | --- |
| 375px: info line, Auth Type list, Value, Send | Pass. 200, and no sideways page scroll. | [29](../uat/004/retest3/29-reference-info-line-375.png), [30](../uat/004/retest3/30-select-auth-type-open-375.png), [31](../uat/004/retest3/31-key-in-value-375.png), [32](../uat/004/retest3/32-send-200-375.png) |
| Keyboard: Auth Type control | Pass. Enter opens it, Down and Enter choose the scheme, Escape closes it with focus back on the control, and Tab reaches Value. | [28](../uat/004/retest3/28-keyboard-scheme-chosen-1280.png) |
| Browser health | No console errors or warnings on the reference or dashboard pages I checked. The only failed requests were the expected 403s. | None |

Notes:
- **New, minor, JSO-294:** the app page's "Try your key" card still says "the apikey field". Taken literally on the sample API, the key replaces the header name, and the call gets a 401 with the key visible in plain text. The info line on the API reference gives the correct steps, so the developer can recover. It's the first instruction after a key is created, and the fix looks like one sentence of copy. [03](../uat/004/retest3/03-app-page-try-your-key-apikey-field.png), [35](../uat/004/retest3/35-sample-key-pasted-into-apikey-name-field-401-1280.png), where I blurred the key.
- **New, minor, JSO-295:** the line says "Select Auth Type", but "Select" is screen-reader text, so the screen shows "Auth Type". It also says "key scheme", while the list shows only the document's own names.
- **Follow-up, JSO-296, not a bug in this spec:** Kong's own access log records the key when it's sent as a query parameter. The upstream and portal logs don't.
- **Bug re-tests:** no Bug issue was In Review, because QA had already moved JSO-277 and JSO-281 to Done. I re-tested both anyway and they stay Done.
- **Not re-tested, code unchanged:** JSO-282, JSO-283, JSO-284 and JSO-292. Also not repeated: sign-up and sign-in mistakes, Kong down during Create app, import refusals, the full v0.1 upgrade and non-JSON operations. See the third run and QA's rerun.
- **Not tested:** multi-node Kong, and how a brand-new key-auth service behaves in the seconds before Kong applies its plugins.
- **Test tool quirk, not a portal bug:** Orca's `click` and mouse commands didn't trigger Scalar's Send button, while Enter and a script-triggered click did. QA's Playwright test sends with a real click, so I used Enter throughout.
- **Screenshots:** the refusal's full body is quoted above because Orca's capture came out blank after scrolling inside the client. [23](../uat/004/retest3/23-jso277-new-api-sent-inside-window-1280.png) shows its title. Earlier, [02](../uat/004/retest2/02-xml-refused-403-1200.png) showed the same message in full. [19](../uat/004/retest3/19-query-send-1280.png) is the query document's 403 with an unsubscribed key.
- **Time to start:** not measured, because the stack was already running. QA's latest quickstart run took 98.7 seconds.
- **Test data left behind:** my `uat5-*` services, APIs, consumer and test accounts remain in the local Compose volume alongside QA's data. The stack is stopped, and I didn't delete the volume.

### Third run, carried forward
Third run, on 2026-11-06, after the JSO-286 and JSO-287 fixes, in Orca's built-in browser on a clean Docker Compose install of `4148d99` (application code at `4e97c56`) with Kong 3.9.4. Access results come from real calls through Kong. The Admin API only set up operator fixtures and drift. Screenshots are in `docs/uat/004/retest2/`; earlier runs are in `docs/uat/004/` and `docs/uat/004/retest/`.

**AC 2 on non-JSON operations (the check the review asked for).** Each API was published through the admin screen on its own Kong service, with a small test upstream that returns its own 403 body in the operation's format. All of this was read on screen in Scalar's response panel:

| Case | XML operation | Plain-text operation |
| --- | --- | --- |
| Refused key, about 1200px | **Pass.** Sent `Accept: application/xml`, shows `403 Forbidden`, `application/problem+json`, the full title and the next step: "Select Get an API key on this page, create an app that includes this API". No Kong message. [02](../uat/004/retest2/02-xml-refused-403-1200.png) | **Pass.** Same, with `Accept: text/plain`. [06](../uat/004/retest2/06-text-refused-403-1200.png) |
| Refused key, 1280px | Not repeated; the panel is the same. | **Pass.** Same text on one line. [11](../uat/004/retest2/11-text-refused-403-1280.png) |
| Refused key, 375px | **Pass, as designed.** `403 Forbidden` shows, but the title and message are cut at the panel's edge ("This key doesn't have ac…"). Scrolling the panel sideways reaches "Select Get an API key on this page". The page's info line also gives the next step. [09](../uat/004/retest2/09-xml-refused-403-375.png), [10](../uat/004/retest2/10-xml-refused-403-375-scrolled.png), [15](../uat/004/retest2/15-api-reference-375.png) | Not repeated; the panel is the same. |
| Upstream's own 403 | **Pass.** The upstream's XML body with its own type and no portal message. [03](../uat/004/retest2/03-xml-upstream-own-403-1200.png) | **Pass.** The upstream's text body, unchanged. [07](../uat/004/retest2/07-text-upstream-own-403-1200.png) |
| Subscribed key | **Pass.** 200. [04](../uat/004/retest2/04-xml-subscribed-200-1200.png) | **Pass.** 200. [08](../uat/004/retest2/08-text-subscribed-200-1200.png) |
| Unknown or revoked key | **Pass.** Kong's own 401, in XML. [12](../uat/004/retest2/12-xml-unknown-key-401-1200.png), [13](../uat/004/retest2/13-xml-revoked-key-401-1200.png) | Not repeated. |

| User story | Result | Screenshot |
| --- | --- | --- |
| Platform engineer: a portal key works only on subscribed APIs | **Pass.** Subscribed 200; unsubscribed 403; missing and revoked keys 401. Publishing a new API took an existing key from 200 to 403 within about a second, and an app created for it got 200. A second key reached the same API, and revoking it left the first working. | [01](../uat/004/retest2/01-admin-xml-published.png), [04](../uat/004/retest2/04-xml-subscribed-200-1200.png), [13](../uat/004/retest2/13-xml-revoked-key-401-1200.png) |
| Platform engineer: upstreams never receive portal keys | **Pass.** The test upstream's reply, shown on screen, reported no key and no groups, with `X-Consumer-Custom-Id` present. A key in the query parameter was also hidden (checked by curl). | [04](../uat/004/retest2/04-xml-subscribed-200-1200.png), [08](../uat/004/retest2/08-text-subscribed-200-1200.png) |
| Platform engineer: non-portal traffic keeps working | **Pass, after the first reconcile.** On an unmanaged key-auth service the operator's key got 200 and still reached the upstream, anonymous got 401 as before, and a public route got 200. A portal key got 200 there until the scheduled run and 403 after it, the window of up to 5 minutes accepted in the design. | Kong calls only |
| Platform engineer: changes in Kong are put back automatically | **Pass.** All four drift cases were repaired in one scheduled run, and the restored ACL kept its plugin ID. The operator consumer's own group and its added `portal-svc-*` membership stayed, and a foreign ACL service wasn't touched. Logs held no key values. | Kong calls only |
| Developer: an existing key keeps working after an upgrade | **Pass.** Real upgrade from `main` images (`89e0430`): 442 of 442 calls returned 200 throughout. Afterwards the key got 200 on its API and 403 on the internal service (200 before), the upstream stopped receiving it, and the existing app still showed on the dashboard. A server restart left Kong's objects identical, ignoring `created_at` and `updated_at` as the review ruled. | [21](../uat/004/retest2/21-upgrade-dashboard-existing-app.png) |
| Developer: a clear explanation when a key is refused | **Pass, with known minor JSO-283 not re-tested.** See the table above. **Get an API key** opened Create app with the API ticked, and the new key got 200. | [02](../uat/004/retest2/02-xml-refused-403-1200.png), [06](../uat/004/retest2/06-text-refused-403-1200.png), [04](../uat/004/retest2/04-xml-subscribed-200-1200.png) |

Other visible criteria and states:

| Check | Result | Screenshot |
| --- | --- | --- |
| AC 8: Kong down during Create app | Pass. Gateway error, values kept, no key dialog. After Kong returned, the retry gave one app row and one new consumer. | [20](../uat/004/retest2/20-create-app-kong-down.png) |
| AC 6: server boots with Kong down | Pass. The server was healthy after 2 seconds and logged the gateway as unavailable, logs held no key or admin password, and app, subscription and key counts didn't change. The next scheduled run restored a removed membership, taking the key from 403 to 200. | Server logs only |
| AC 9: refused imports and public warning | Pass. Copy matches the design, focus lands on the Kong service field, choosing another service clears the refusal, the foreign ACL's plugins didn't change, and the public warning stays after publishing. The service list isn't marked linked right after publishing (new, JSO-292). | [16](../uat/004/retest2/16-admin-refused-foreign-acl-1200.png), [17](../uat/004/retest2/17-admin-linked-warning-1200.png), [18](../uat/004/retest2/18-admin-refused-already-linked-1200.png), [19](../uat/004/retest2/19-admin-public-published.png), [05](../uat/004/retest2/05-admin-just-published-service-not-marked-linked.png) |
| Mistakes: empty app form, non-admin on `/admin/apis` | Pass. "Give your app a name." and "Choose at least one API."; non-admins get Page not found. | None |
| Keyboard: refused try-it on a plain-text operation | Pass. Enter on **Test Request**, Tab to the key field, type the key, Shift+Tab to **Send**, Enter; the 403 message shows. Escape closes the client and returns focus to **Test Request**. | [14](../uat/004/retest2/14-text-refused-403-keyboard-1200.png) |
| 375px and 320px | Pass. Home, reference, dashboard and Create app don't scroll sideways at either width. | [15](../uat/004/retest2/15-api-reference-375.png) |
| Browser health | No console errors after the try-it, keyboard or Kong-outage journeys, and no failed requests on the dashboard after the upgrade. Network wasn't checked after every journey. | None |

Notes:
- **Time to start:** clean install 17 seconds and upgrade 15 seconds, both with image layers cached. QA's 125.5-second quickstart run, which includes image builds, is the better measure of a first install.
- **Bug re-tests:** no Bug issue was In Review. JSO-286 and JSO-287 are Code Review findings, so the tech lead closes them. The browser confirms JSO-287's behaviour; JSO-286's scale can't be judged from a browser, so that rests on QA's 501-consumer test.
- **Known minors, not re-tested here:** JSO-277, JSO-281, JSO-282 and JSO-283. JSO-284 is still present: the hint still says "See the upgrade notes" with no link ([16](../uat/004/retest2/16-admin-refused-foreign-acl-1200.png)).
- **Fixture naming:** the "UAT foreign API" in [19](../uat/004/retest2/19-admin-public-published.png) and [20](../uat/004/retest2/20-create-app-kong-down.png) is my document reused on the public service `uat-public`. It isn't a portal fault.
- **Not repeated, because no portal screen code changed since the last run:** sign-up and sign-in by keyboard, wrong password, double submit, refresh after the key dialog, expired session, and the full phone journey.
- **Not tested:** HTML operations in this run (QA covers them), the portal's 502 state, the `partial-key-auth` warning, and multi-node Kong.
- **Measured rather than pictured:** at 375px the sideways scroll in [10](../uat/004/retest2/10-xml-refused-403-375-scrolled.png) was set by script, not a touch gesture; the previous run confirmed touch and mouse scrolling. The second column at the right edge of [11](../uat/004/retest2/11-text-refused-403-1280.png) is Orca's viewport capture, not the page. With `--scale 1`, phone captures don't tile.

**Disposition: `review`.** No blocker or major bug is open. Six minor bugs remain: JSO-277, JSO-281, JSO-282, JSO-283, JSO-284 and JSO-292.

## Review  _(tech-lead)_
Re-reviewed on 2026-11-06 at `c864c38`. **Result: no blocking findings, so the status goes to `approved`.** Both findings from the first review (at `14af7de`) are fixed and closed. Elango's merge gate and the decisions listed below are still open.

### Checks
| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` | Pass |
| `pnpm test --force` | Pass, with no cache: 147 tests (69 portal, 39 Kong adapter, 38 server, 1 database), including the expected failure for JSO-277, the only skip or expected-failure marker in the unit, integration or e2e code |
| `packages/sdk` against `openapi.yaml` | No drift after regenerating |
| Quickstart and `pnpm test:e2e` | Not re-run here. QA ran both at `4148d99` (24 of 24 e2e tests, quickstart smoke in 125.5 seconds), and UAT did clean installs of the same commit. Only docs changed after it, and no application code changed after `4e97c56`. |
| Multi-node Kong | Not tested by anyone. The upgrade notes say so. |
| CI | **No evidence.** The branch has no PR and isn't on `origin`, so the Definition of Done's CI item stays open until a PR runs. |

### Blocking
None.

### Fixed since the first review
Both are moved to Done.

- **JSO-286: reconcile failed above about 100 apps.** `packages/adapter-kong/src/index.ts:452` now takes one paged `/acls` read before any write, as the design says. It reads without a tag filter on purpose, because AC 7(b) needs to see hand-added memberships that have no portal tag, and memberships of consumers the portal doesn't own are ignored. A real-Kong test reconciles 501 consumers with 1,002 memberships, which passes the first 1,000-row page (`packages/adapter-kong/src/conformance.test.ts:137`), and a unit test forbids per-consumer reads (`packages/adapter-kong/src/access.test.ts`). That test covers the no-drift run. Writes on a first upgrade are sequential, so they don't bring back the connection burst.
- **JSO-287: AC 2 failed for operations that aren't JSON.** `packages/adapter-kong/src/index.ts:603` now looks for Kong's fixed message in any format, still only on a 403 with no `X-Kong-Upstream-Latency`. The real-Kong test checks all four negotiated formats, the server test covers an XML refusal and an XML upstream 403, and QA and UAT confirmed it in Scalar. I updated the design's `headers` risk to match: an upstream 403 now only has to contain Kong's text, and only when the operator has also removed the latency header. It's still low impact.

### Suggestions
None of these need to hold the merge.

- **JSO-288** `apps/portal/components/admin-apis.tsx:40`: the focus effect runs on every `errors` change, so changing the Kong service while a file error shows moves focus to the file input. From reading the code; not reproduced.
- **JSO-289** `packages/adapter-kong/src/index.ts:358`: a disabled service key-auth under a global plugin makes `protectService` fail with Kong's 409. Reproduced.
- **JSO-290** `packages/adapter-kong/src/index.ts:473`: a rejected membership doesn't stop plugin writes, and its finding names no service. From reading the code; not reproduced.
- **JSO-291**: no changeset for a change that breaks existing behaviour, and the README doesn't link the upgrade notes.

These four are still open in Backlog, unchanged since the first review. The JSO-282 clean-up from that review is done: the restart test now compares whole objects apart from the two timestamps (`apps/portal/e2e/gateway.ts:104`), and the upgrade notes mention both.

### Rulings on open bugs
| Topic | Ruling | Why |
| --- | --- | --- |
| Sample API on existing installs | **Not blocking.** | Fresh installs protect it before the row exists (`apps/server/src/seed.ts:42`). On upgrade it stays as open as it was until the first reconcile, which is queued at startup, so seconds plus the 6-second wait and propagation. I read this from the startup order and didn't time it. With Kong down at boot, it lasts until Kong is back and the next scheduled run, up to 5 minutes later. Turning `SEED_SAMPLE` on later, on an install with other APIs, gets the same short gap. |
| JSO-282, `created_at` on restart | **Correct the restart check; don't change the seed.** | IDs and config don't change, and access doesn't depend on these timestamps. Comparing before each PUT would add code for a cosmetic field on sample objects. The design's check is corrected above. AC 5's wording is Elango's, so this reading is listed below for him. |
| JSO-277, try-it 400 after publishing | **Not blocking; I'd fix it now.** | The cache is on `main` too, so this isn't a regression, it clears within 30 seconds, and no criterion covers it. It's still a confusing first experience and the fix is small: reload the catalog once on a miss before refusing (`apps/server/src/proxy.ts:101`). |
| JSO-281, info line and missing field | **Not blocking; I'd fix it now.** | The developer can recover through the selector, and the next step in AC 2 isn't affected. It's a copy change to `apps/portal/app/apis/[slug]/page.tsx`, with wording from the ui-designer. |
| JSO-283, keyboard scrolling | **Not blocking; keep it open.** | The status, title and start of the message are readable, and the info line repeats the next step, so keyboard users still get it. Scalar owns the panel, so the fix likely needs a Scalar upgrade. |
| JSO-284, unlinked upgrade notes | **Not blocking.** | The hint still states the effects. Fix it along with JSO-291, once the notes have a public URL. |
| JSO-292, service not marked linked until reload (new) | **Not blocking.** | An admin who tries the same service again still gets the `gateway-service-already-linked` refusal, which AC 9's design requires, so nothing is published twice. Only the advance note is late. From UAT's report and the server check; I didn't reproduce it. |

### For Elango at merge
My three design choices stand as built, and I'd keep all of them. These are decisions for you, not findings:

1. **Operator `deny` ACLs:** one that doesn't list `portal-consumer` on an unmanaged service leaves portal keys working there, and the portal only warns. This is a known exception to the third access rule, and the alternative is editing a plugin we don't own.
2. **Hand-added groups:** reconcile removes any group not backed by a subscription from consumers the portal owns. This is the choice most likely to surprise an operator, and the upgrade notes state it.
3. **One API per service:** there's no way to publish a new version of an API on the same service until spec 012. The workaround is a separate Kong service.
4. **AC 5's wording:** "changes nothing in Kong" now excludes `created_at` and `updated_at` on the sample's objects. If you want it literal, JSO-282 becomes a backend fix to the seed.
5. **JSO-277 and JSO-281:** do you want these in this build round? They have no Fix tasks unless you say so.
6. **Multi-node Kong** is still untested. The upgrade notes say so.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
