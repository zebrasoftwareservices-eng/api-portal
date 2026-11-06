---
id: 004
title: Per-API access control on Kong
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
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
- **New designed screens.** UI work here is error copy only.
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
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/NNN-*.md`

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
