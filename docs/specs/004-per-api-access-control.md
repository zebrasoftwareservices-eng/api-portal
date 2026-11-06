---
id: 004
title: Per-API access control on Kong
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
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

### Risks
| Risk | Mitigation and test |
| --- | --- |
| Plugin and route changes take seconds to apply, even on one node, so tests that check at once will flake. | QA polls for up to 10 s after any plugin write. Membership and key checks need no polling. |
| A subscribed key is refused during the upgrade (AC 5). | Memberships first, plus the settle wait. QA calls with a subscribed key in a loop throughout the upgrade and fails on any 403. Multi-node isn't tested: the wait assumes the default `db_update_frequency` of 5 s, and the upgrade notes must say so. |
| Linking locks out internal callers, and `hide_credentials` breaks upstreams that read the key. | Accepted by Elango. The upgrade notes state both, and how to add a consumer to the group. |
| Global key-auth means a deny ACL on every service in the operator's Kong. | Each is tagged and removable by tag. QA covers global key-auth with a non-portal consumer. |
| The first reconcile holds the advisory lock across many writes, so app creation waits. | Writes take milliseconds and the wait is once only. Steady-state runs only read. |
| Kong's `headers` setting can remove the latency header that `isAccessDenied` checks. | The fixed message is still checked, so the worst case is an upstream 403 with Kong's exact text getting the portal's copy. Low impact. |
| The portal's plugins outlive the portal. | The upgrade notes give the removal commands, by the `portal-instance-<id>` tag. |
| Existing tests assume more than one API per service. | `journeys.ts` publishes twice to one service, and `app.test.ts` imports repeatedly. Both need updating; see tasks. |

**Restart check (AC 5):** compare Kong objects by ID and config, ignoring `updated_at`. With
`SEED_SAMPLE` on, the seed re-PUTs its own objects on every boot, which bumps that field.

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

- Backend (JSO-256–JSO-265, 2026-11-06): added the gateway-neutral access contract, tagged Kong memberships, stable scoped ACLs, managed credential hiding and global key-auth copies. Reconcile snapshots reads before writes, repairs exact owned-consumer memberships before plugins, waits six seconds when new memberships precede plugin creation/conversion, and logs findings without key values. Foreign ACLs are preserved; shared legacy services warn with API slugs.
- App creation grants each distinct subscribed service before issuing credentials, using the existing compensation. Import serializes service links with advisory locks, refuses duplicate links and foreign ACLs, protects before publishing, and returns UX warning messages. The proxy rewrites Kong ACL 403s with the exact UX copy while preserving upstream refusals. Regenerated the SDK and added [upgrade notes](../upgrade-004-access-control.md); no schema migration is needed.
- QA: fresh sample installs protect the sample immediately; existing installs defer its first allow ACL to startup reconciliation so existing subscriptions receive memberships first. Seed always enables credential hiding. The later full-workspace run supersedes the earlier frontend build note about backend test failures: `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass. Backend coverage includes 34 server tests with real Postgres, 12 policy unit cases, three transport cases, and three real-Kong cases (conformance plus deny-to-allow conversion with stable ID and a no-repair second run). QA still owns the full access-rule, upgrade traffic-loop, propagation, quickstart and browser acceptance suites in JSO-268–JSO-274.

- Frontend (JSO-266, JSO-267, JSO-276): admin import maps both new refusals to the Kong service field, retains values and focus, and clears stale refusals when the service changes. Public and linked-service warnings use the UX copy; successful imports keep all server warning messages in response order after the form resets and associate them with the focused success alert. Existing alert styles now wrap long names.
- Added the approved API reference info line, API-choice hint and key-auth service effects hint with accessible descriptions. Component coverage checks refusal focus and recovery, warning persistence and future warning codes, conditional service notes, and the API-choice hint during loading, validation and empty states. Validation: workspace lint and typecheck pass, and the full portal suite passes 68 tests. The full workspace suite currently fails only in backend app tests while the adapter fake and repeated imports are being updated; QA should verify the live Scalar 403 body at desktop and mobile sizes, supplied by the proxy.

- Frontend UAT fixes (JSO-279, JSO-280, JSO-278, 2026-11-06; commit `90a3b87`): renamed the portal catalog/loading layout class to `portal-grid`, removing the desktop column rules that leaked into Scalar's response grids. AC 2 now measures the response body scroller at 1280px, 1920px and 375px (minimum widths 400px desktop / 280px mobile), in addition to checking the real refusal and upstream pass-through.
- Import validation now focuses invalid fields from a post-commit effect after the fieldset is enabled; the alert is focused first, then the Kong service select. Existing focus assertions remain intact. A delayed-response component regression blocks animation frames and asserts that focus order; real-browser regressions repeat both refusals twice at 1280px and 375px and check focus after two further paints. Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test` (136 tests, including 69 portal), and `pnpm test:e2e` (21/21) pass with default test concurrency. Compose builds and starts healthy. QA/UAT should independently retest the three bugs; their Bugs checkboxes stay open pending verification.

## Test report  _(qa-tester)_

QA run: 2026-11-06. Real Kong 3.9 and Postgres 17 run in Testcontainers; browser and startup/outage journeys run against the built Docker Compose quickstart. Tests change no application code.

| Criterion | Test file | Result |
| --- | --- | --- |
| AC 1 — subscribed A succeeds, unsubscribed B is refused | `packages/adapter-kong/src/conformance.test.ts`, “AC 1/3/4” | PASS: 200 on A, 403 on B; missing, unknown and revoked keys return 401. |
| AC 2 — try-it shows the 403, exact title and next step; upstream 403 stays unchanged | `apps/portal/e2e/journeys.ts`, “AC 2”; `apps/server/src/app.test.ts`, “rewrites only gateway ACL 403s” | PASS against real Kong in Scalar, including visible response title and next-step problem body. The browser fixture waits for publication visibility because of JSO-277. |
| AC 3 — unmanaged key-auth refuses portal keys, operator keys and public traffic preserved | `packages/adapter-kong/src/conformance.test.ts`, “AC 1/3/4”, “AC 3: route-only”, “AC 3/4: global” | PASS: service, route-only and global key-auth; public sibling remains open; operator consumer succeeds on unmanaged service. |
| AC 4 — header and query key hidden; consumer identity retained | `packages/adapter-kong/src/conformance.test.ts`, “AC 1/3/4”, “AC 3/4: global” | PASS: echo contains neither key; `X-Consumer-Custom-Id` matches app; global key-auth unchanged outside managed services. |
| AC 5 — legacy keys upgrade without interruption and restart converges | `packages/adapter-kong/src/conformance.test.ts`, “AC 5/7”; `apps/portal/e2e/gateway.ts`, “sample seed converges”; `apps/server/src/app.test.ts`, reconcile policy assertion | PASS: v0.1 tagged consumer/key with no groups, continuous subscribed traffic all 200 during policy upgrade, B becomes 403, fresh adapter makes no repairs and object snapshots match ignoring `updated_at`; real server restart preserves seed IDs. Single-node Kong only, as designed. |
| AC 6 — boot with Kong down, no persisted access/key changes, next run repairs | `apps/portal/e2e/gateway.ts`, “AC 6”; `apps/server/src/app.test.ts`, “AC 6”; `apps/server/src/startup.test.ts`, “AC 6” | PASS: real server starts while Kong is stopped, logs unavailability without key/password; persisted app/key/subscription detail is unchanged; same reconcile job body after recovery restores the removed membership and key returns 200. Real-Postgres test also compares subscription and credential rows. |
| AC 7 — all four drift cases repaired in one run; operator memberships preserved | `packages/adapter-kong/src/conformance.test.ts`, “AC 5/7”; `packages/adapter-kong/src/access.test.ts` | PASS: missing subscribed group, extra unsubscribed group, deleted ACL and disabled hiding repaired together; operator's untagged group and `portal-svc-*` membership unchanged; next run reports no repairs. |
| AC 8 — failed or timed-out grant compensates; clean retry without duplicates | `apps/server/src/app.test.ts`, “compensates failed grants”; `packages/adapter-kong/src/kong.test.ts`, grant transport cases; `packages/adapter-kong/src/conformance.test.ts`, “AC 8”; `apps/portal/e2e/gateway.ts`, outage retry | PASS: 503/problem with no key or app row, issueCredential not called after grant rejection; retry leaves one consumer/credential; real partial-grant compensation cascades memberships and retry has one membership per group; timeout/connection failures expose no transport secret. |
| AC 9 — publish denies existing keys, subscribe grants; foreign ACL and duplicate link refused | `packages/adapter-kong/src/conformance.test.ts`, “AC 9” cases; `apps/server/src/app.test.ts`, import conflict and simultaneous import cases; `apps/portal/e2e/journeys.ts`, admin imports | PASS: real gateway 403 then 200 after grant; service/route/global foreign ACL snapshots unchanged; server returns 422 problem naming service with no published row; concurrent duplicate links yield one 201 and one 422. Admin fixtures use separate services. |
| AC 10 — tagged idempotent grant/revoke conformance and unreachable gateway | `packages/adapter-kong/src/conformance.test.ts` invoking `packages/adapter-sdk/src/conformance.ts` | PASS: repeated grant keeps one membership and same ID, missing revoke succeeds, unavailable grant/revoke throws `GatewayUnavailableError`, created consumers/keys/memberships/plugins carry ownership tags. |

Validation:

- `pnpm lint` and `pnpm typecheck`: PASS after QA changes.
- `pnpm test --force` and `pnpm test --force --concurrency=1`: FAIL on the existing admin-refusal focus assertion (JSO-278), including a package-serial run. The isolated admin-import file passes all 9 tests. No application fix or assertion relaxation was made.
- `pnpm test --force --concurrency=1 -- --maxWorkers=1`: **PASS, 135 tests** (68 portal, 29 Kong adapter, 37 server, 1 database), including the one explicitly expected-failure regression for JSO-277; all 12 workspace tasks executed without cache. Serializing Vitest files avoids the JSO-278 focus flake.
- `pnpm test:e2e`: **19/19 PASS**, including the real Scalar refusal and real outage-at-startup/recovery journeys.
- `node deploy/quickstart-smoke.mjs`: **PASS, 146.3 seconds** including image builds, Compose startup and seeded home page, under five minutes.
- `node deploy/smoke.mjs` and `node deploy/outage-smoke.mjs`: PASS (first call, one-time key, revoke, Kong retry and server error-page recovery).

Known failure and flakiness:

- JSO-277 has a deterministic `it.fails` regression in `apps/server/src/app.test.ts`: a warm try-it catalog cache rejects a newly published target until its 30-second expiry. This is an expected-failure test, **not a fixed bug**. AC 2 separately proves the browser response after the target is visible.
- JSO-278: admin-refusal service-field focus failed in three suite runs (including package-serial); the isolated file passes; error copy and `aria-invalid` were present while focus remained on submit. The existing assertion remains intact. One sandboxed standalone portal run also had ingress `listen EPERM` errors; those were environment restrictions, not product defects, and the full suite uses escalated local socket/Docker access.
- Kong route/plugin propagation is asynchronous. Tests poll observable responses for up to 15 seconds; the upgrade test first warms the legacy route across workers before starting its uninterrupted traffic loop. The application's existing six-second membership settle delay remains real.

Disposition: **uat**. All ten criteria have automated coverage; the two open findings are minor, with no blocker or major bug open. JSO-268–JSO-274 are Done in Linear; QA task checkboxes outside this report are left for the coordinator to reconcile within its ownership.

Bug retest audit: queried all direct Bug children of JSO-233 without a result limit; none existed at pickup, so there were no In Review bugs to close or reopen. JSO-165 is a related Backlog follow-up rather than an In Review bug; AC 4 now verifies its hiding behavior.

### Bugs
- [ ] JSO-277 Newly published APIs are rejected by try-it until its 30-second catalog cache expires (minor)
- [ ] JSO-278 Admin service-refusal focus assertion intermittently fails under test load (minor)
- [ ] JSO-279 Try-it response body is about 116px wide on desktop, so the 403 message can't be read (major)
- [ ] JSO-280 After an import refusal, focus stays on the alert instead of the Kong service field (minor)
- [ ] JSO-281 API reference info line points to an apikey field that isn't there when security is set per operation (minor)
- [ ] JSO-282 Restarting the server resets `created_at` on the sample's Kong objects (minor)
- [x] [frontend] Fix JSO-279: make the try-it response body readable at desktop widths, and assert it in the AC 2 browser test
- [x] [frontend] Fix JSO-280 and JSO-278: after an import refusal, focus reliably moves to the Kong service field in a real browser and under test load, keeping the existing focus assertion unrelaxed

## User testing  _(user-tester)_
Run on 2026-11-06 in Orca's built-in browser against clean Docker Compose installs of this branch, with Kong 3.9.4. Access results come from real calls through Kong; Admin API calls set up operator fixtures and drift. Screenshots are in `docs/uat/004/`.

| User story | Result | Screenshot |
| --- | --- | --- |
| Platform engineer: a portal key works only on subscribed APIs | **Pass.** Subscribed 200; unsubscribed API and unmanaged key-auth service 403; missing, unknown and revoked keys 401. A newly published API refused existing keys and accepted a new app's key. All of an app's active keys reached the same APIs. | [02](../uat/004/02-create-app-hint-1280.png), [10](../uat/004/10-admin-orders-published.png), [14](../uat/004/14-second-app-key-works-with-orders.png), [19](../uat/004/19-tryit-orders-key-200.png) |
| Platform engineer: upstreams never receive portal keys | **Pass.** The echo showed no key from the header or the query parameter, no `X-Consumer-Groups`, and `X-Consumer-Custom-Id` present. | [04](../uat/004/04-tryit-subscribed-200-1280.png) |
| Platform engineer: non-portal traffic keeps working | **Pass.** On the unmanaged service, the non-portal consumer got 200 and still reached the upstream with its key. Anonymous calls to a public route got 200. As accepted in the spec, the same consumer got 403 once its service was published, until added to the group. | Kong calls only |
| Platform engineer: changes in Kong are put back automatically | **Pass.** All four drift cases were repaired in one scheduled run, with the ACL's plugin ID unchanged. The operator consumer's own memberships stayed, and logs held no key values. | Kong calls only |
| Developer: an existing key keeps working after an upgrade | **Pass, one minor finding.** Real upgrade from `main` images: 415 of 415 calls returned 200 during the upgrade. Afterwards the key got 200 on its API and 403 on the internal service (200 before), and the upstream stopped receiving it. Restart changed only `created_at` on seed objects (JSO-282). | [20](../uat/004/20-upgrade-dashboard-existing-app.png), [21](../uat/004/21-upgrade-existing-key-200.png) |
| Developer: a clear explanation when a key is refused | **Fail on desktop (JSO-279).** The status and message text are correct, and the Get an API key flow then gives 200, but only `"title"` and `"detai"` are visible in a 116px box. At 375px the start of each line shows and the rest scrolls sideways, as designed. | [11](../uat/004/11-tryit-refused-403-1280.png), [13](../uat/004/13-tryit-refused-403-375.png) |

Other visible criteria and states:

| Check | Result | Screenshot |
| --- | --- | --- |
| AC 8: Kong down during Create app | Pass. Gateway error, values kept, no key dialog and no app row. Retry gave one app, one consumer and one membership per group. | [22](../uat/004/22-create-app-kong-down-error.png) |
| AC 6: server boots with Kong down | Partly walked. The server started, reported the gateway unreachable, and logs held no key or admin password. Recovery on the next run wasn't re-walked; QA's test covers it. | Server logs only |
| AC 9: refused imports and public warnings | Pass on copy and outcome: nothing was published and plugins were unchanged. Focus is wrong after a refusal (JSO-280). | [05](../uat/004/05-admin-linked-warning-before-submit.png), [06](../uat/004/06-admin-refused-already-linked.png), [07](../uat/004/07-admin-refused-foreign-acl.png), [08](../uat/004/08-admin-public-warning-before-submit.png), [09](../uat/004/09-admin-public-published-warning.png), [18](../uat/004/18-admin-refused-foreign-acl-375.png) |
| Try-it: revoked key and upstream's own 403 | Pass. The revoked key showed Kong's 401, and the upstream's 403 wasn't rewritten. | Results read from the page; captures came out blank |
| Mistakes: empty name, no API chosen, wrong password, refresh and back after the key dialog, non-admin on `/admin/apis` | Pass. Clear messages, the key isn't shown again, and non-admins get Page not found. | [03](../uat/004/03-key-dialog.png), [15](../uat/004/15-app-detail-after-refresh.png) |
| Expired session on submit | Pass. Goes to sign-in, keeps the return address and says "Sign in to continue." The typed form values aren't restored. | None |
| Keyboard: reference, sign-up, Create app, key dialog, try-it | Pass with Tab, Enter and Escape, ending in a 200. Escape doesn't close the key dialog; **I've saved it** does. Escape closes the try-it client and returns focus. | None |
| 375px | Portal pages don't scroll sideways. Try-it works. | [13](../uat/004/13-tryit-refused-403-375.png), [18](../uat/004/18-admin-refused-foreign-acl-375.png) |
| Browser health | No console errors on the last page checked. Console and network weren't checked after every journey. | None |

Notes:
- **Time to start:** clean install 14 seconds with images already built, and the upgrade 11 seconds. QA's 146-second quickstart run, which includes image builds, is the better measure of a first install.
- **Known bugs:** none were In Review, so nothing needed re-testing. I didn't re-observe JSO-277, because my try-it calls came after its 30-second window.
- **Not tested:** the portal's 502 state, double-clicking submit (the button disables at once), and multi-node Kong.
- **Screenshot artefacts:** Orca's viewport emulation sometimes captured blank or tiled pages. Blank ones were removed, 18, 19 and 21 were cropped, and the measurements above were read from the page. Keys visible in 03 and 14 are test keys from installs that have since been deleted.
- **Published service hint:** a consumer locked out at publish gets a plain 403 with no hint, which is the accepted risk stated in the Kong service hint and upgrade notes.

**Disposition: `building`**, because major bug JSO-279 is open.

## Review  _(tech-lead)_

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
