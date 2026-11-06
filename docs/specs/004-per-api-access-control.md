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
- [ ] [backend] JSO-256 adapter-sdk: add `grantAccess`, `revokeAccess`, `protectService`, `applyAccessPolicy`, `isAccessDenied`, their types, `GatewayServiceConflictError` and the `accessControl` capability; add the AC 10 conformance cases.
- [ ] [backend] JSO-257 adapter-kong: have `ensureConsumer` add `portal-consumer`, and implement `grantAccess` and `revokeAccess` with upsert and delete by group name, tagged.
- [ ] [backend] JSO-258 adapter-kong: implement `protectService` with the scope rule, foreign-ACL check before any write, stable plugin IDs, hiding on service and route plugins, the global key-auth copy, and `isAccessDenied`.
- [ ] [backend] JSO-259 adapter-kong: implement `applyAccessPolicy` in the design's order, with the settle wait and no writes when there's no drift.
- [ ] [backend] JSO-260 server: extend `reconcile.ts` to build the policy from Postgres, call `applyAccessPolicy` after the existing clean-up, and log repairs and findings with no secrets.
- [ ] [backend] JSO-261 server: grant access in `POST /v1/apps` before issuing the key, inside the existing compensation.
- [ ] [backend] JSO-262 server: add the import locks, `gateway-service-already-linked` and `gateway-service-has-acl` refusals, `protectService` and `warnings`; update `seed.ts` to protect the sample service and send `hide_credentials: true`.
- [ ] [backend] JSO-263 server: pass the adapter to `registerProxy` and rewrite Kong's ACL 403 to `/problems/api-access-denied` using the UX copy.
- [ ] [backend] JSO-264 Regenerate `packages/sdk`, update the fake adapter in `app.test.ts`, and fix unit tests that import twice onto one service.
- [ ] [backend] JSO-265 Docs: add upgrade notes (keys lose unsubscribed APIs, internal callers locked out and how to add them to `portal-svc-<serviceId>`, `hide_credentials`, foreign ACL warnings, one API per service, multi-node assumption, removing plugins by tag) and update `docs/engineering-conventions.md`.
- [ ] [frontend] JSO-266 Admin import: map `gateway-service-has-acl` and `gateway-service-already-linked` to `gatewayServiceId` field errors, using the UX copy.
- [ ] [frontend] JSO-267 Admin import: replace the key-auth-off warning with copy saying the API is public, show `warnings` from the import response, and reword the already-linked note to say the import will be refused.
- [ ] [frontend] JSO-276 Copy additions approved by Elango: API reference info line, Create-app hint and Kong service hint, matching §4.4 of the UX design with the accessibility wiring in §5.
- [ ] [qa] JSO-268 AC 1, 3, 4: access-rule suite on real Kong and Postgres in Testcontainers, covering all five access-rule rows, plus route-only and global key-auth variants.
- [ ] [qa] JSO-269 AC 2: Playwright, try-it with an unsubscribed key shows the 403 and the UX message; an upstream 403 stays unchanged.
- [ ] [qa] JSO-270 AC 5, 6: upgrade from a v0.1 state with a call loop that fails on any refused subscribed key; restart compare ignoring `updated_at`; Kong down at boot, then converging on the next run with no secret in logs.
- [ ] [qa] JSO-271 AC 7: all four drift cases repaired in one run, with untagged groups on non-portal consumers and their membership of `portal-svc-*` left alone.
- [ ] [qa] JSO-272 AC 8: Kong failing or timing out during the grant gives the gateway error, no key, no app row, and a retry with one consumer and no duplicate groups.
- [ ] [qa] JSO-273 AC 9, 10: publish and subscribe flow; foreign ACL refused at service, route and global scope with plugins unchanged; second link refused; conformance suite passes against Kong.
- [ ] [qa] JSO-274 Update `apps/portal/e2e/journeys.ts` to publish to separate Kong services, and run the `docker compose` quickstart and smoke scripts with hiding on.

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
