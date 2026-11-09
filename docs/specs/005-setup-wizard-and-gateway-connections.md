---
id: 005
title: First-run setup and gateway connections
status: approved   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-07
linear: JSO-234
linear_stages: requirements=JSO-301 design=JSO-302 ux=JSO-303 backend=JSO-304 frontend=JSO-305 test=JSO-306 uat=JSO-307 review=JSO-308 release=JSO-309
---

# 005 — First-run setup and gateway connections in the admin UI

## Summary
A platform engineer starts a fresh portal with no gateway settings, creates the first admin in a
setup wizard, and connects a Kong from the admin screens with a Test button, without editing
environment variables or restarting anything.

## Problem
Platform engineers evaluating the portal can only point it at their own Kong by editing
environment variables and restarting the server. There's no way to tell whether a URL or token
is right before relying on it. Every install also starts with a known admin password
(`admin@example.com` / `change-me-now`) unless someone overrides it.

We'll know it's solved when `docker compose up` with no Kong settings leads through the wizard to
a connected Kong, an imported API and a developer with a working key, and when a wrong URL or token
fails the Test with a clear message and saves nothing.

## Users
- **Platform engineer:** installs the portal and connects it to a Kong. Some manage config by hand,
  others through GitOps.
- **Portal admin:** manages the gateway connection and imports APIs. Often the same person.
- **API consumer (developer):** isn't in the setup flow, but needs the resulting key to work.

## User stories
- As a platform engineer, I want a fresh install to walk me through creating the first admin, so
  that no install runs with a known default password.
- As a platform engineer, I want to test a Kong connection before saving it, so that a typo can't
  leave the portal broken.
- As a portal admin, I want to edit, disable and remove a gateway connection from the admin screens,
  so that I can change it without touching the server's environment.
- As a portal admin, I want to pick from the services Kong already has when I import an API, so that
  I don't have to look up service names.
- As a platform engineer evaluating the portal, I want the sample API to be my choice, so that a
  real install doesn't carry demo content.
- As a platform engineer using GitOps, I want environment variables to keep working, so that my
  installs stay declarative and never stop at a wizard.
- As a platform engineer, I want a documented safe way to reach the Kong Admin API, so that
  connecting the portal doesn't expose it.

## Acceptance criteria
QA runs these against a real Kong. "No settings" means the default compose file with no Kong or
admin environment variables set.

1. **Given** a clean install with no settings **When** the engineer runs
   `docker compose -f deploy/docker-compose.yml up` **Then** the server is healthy with no gateway
   and no admin, no sample API or Kong object is created, and every portal page leads to the setup
   screen within 5 minutes on a typical laptop. Public sign-up is refused until the first admin exists.
2. **Given** the setup screen **When** the engineer submits a valid email and password **Then** they
   are signed in as the admin and reach the gateway step, which they may skip until later. **When** a
   second submission arrives, at the same time or afterwards, **Then** it's refused, exactly one admin
   exists, and the setup screen never appears again. **Given** `NODE_ENV=production` and no admin
   **When** the server starts **Then** it writes a random, single-use setup token to its logs, and the
   setup screen requires it. Each start generates a new token until an admin exists, and nothing secret
   is stored. **When** the token is missing or wrong **Then** the submission is refused and no admin is
   created. **When** an admin exists **Then** the token stops working. **Given** the default compose file,
   which sets `NODE_ENV=development`, **Then** no token is asked for.
3. **Given** a signed-in admin on the gateway step or Admin → Gateways **When** they enter a Kong's
   Admin API URL, optional token and proxy URLs, press Test and see it pass with the Kong version,
   then save **Then** the portal uses that gateway without a restart, the token is encrypted at
   rest, and it never appears in an API response or log. Before saving, the screen says what the
   portal will change in this Kong (criterion 3 of spec 004). The default install shows the bundled
   Kong's values, so the engineer doesn't have to work them out. **Given** a gateway already exists,
   including one managed by environment, **When** an admin tries to add another **Then** it's refused
   with a message that a portal connects to one gateway, and the existing connection is unchanged.
4. **Given** each failing case below **When** the admin presses Test or saves **Then** they see the
   message for that case, nothing is saved or changed, any existing connection keeps working, and the
   message contains neither the token nor the response body. Saving runs the same checks on the server,
   so skipping Test can't save a bad connection.

   | Case | The message tells them |
   | --- | --- |
   | Admin URL unreachable, or it times out | The portal couldn't reach that address. For `localhost`, that the address is resolved from the server, not their machine |
   | Token wrong or missing on a protected Admin API (401 or 403) | Kong refused the token |
   | The URL answers but isn't a Kong Admin API | That address isn't a Kong Admin API |
   | Kong runs in DB-less mode | The portal can't work with it, because it needs to write consumers and keys |
   | Internal proxy URL unreachable | The Admin API passed, but the portal can't reach the proxy |
   | Malformed URL, or a scheme other than http(s) | Which field to fix |

5. **Given** a connected, enabled gateway **When** the admin starts an import **Then** they pick from the
   services Kong reports, each showing its routes and whether it has key-auth, and supply an OpenAPI
   file or URL. **Then** the API is published, and a developer who creates an app for it gets a key
   that returns 200 through Kong. **If** Kong is unreachable when services are listed, **then** they
   see the "gateway unavailable" message with a retry, and nothing is lost. **If** no gateway is
   connected, **then** they're pointed to Admin → Gateways. **If** it's disabled, criterion 7(b) applies.
6. **Given** the engineer connected the bundled Kong in the wizard **When** they opt in to the sample
   API **Then** it's published and a developer's key returns 200 on it. **When** they don't opt in
   **Then** the catalog stays empty and Kong has no sample objects. **Given** any other Kong **Then**
   the sample isn't offered, because its upstream exists only in the bundled compose network.
7. **Given** a gateway saved from the admin screens **When** the admin: (a) edits it and leaves the token
   blank, **Then** with the Admin API URL unchanged, the stored token is kept and the checks in criterion 4
   apply. With the URL changed and a token stored, Test and save are refused with a message to enter the
   token again, and the stored token is never sent to the new host. If they instead choose "this Kong needs
   no token" (`adminToken: null`), the checks in criterion 4 run with no token, and saving removes the stored
   token; (b) disables it, **Then** creating a new app or key on its APIs shows a clear error and leaves nothing
   partial. Starting an import on that gateway is refused with a clear error before the admin fills in a form, and
   the service list isn't offered. The server still checks on submit, so an import submitted anyway is refused and
   leaves nothing partial. Publishing the sample API on that gateway is blocked the same way. Key revoke and the
   reconcile job keep running, existing keys keep working through Kong and the docs stay published. If Kong can't
   be reached, revoke shows a clear error, and the reconcile job logs one. Re-enabling it reruns the checks in criterion 4: if one fails, they see that
   case's message and it stays disabled, so a connection to a dead Kong stays disabled until Kong answers;
   (c) removes it while APIs or active keys depend on it, **Then** removal is refused, naming how many;
   (d) removes it with nothing depending on it, **Then** the connection and its stored token are deleted,
   the portal's objects stay in Kong, including the `deny` ACLs from spec 004, traffic through Kong is
   unchanged, and adding a gateway is offered again; (e) edits it to point at a new Kong where any active
   key's consumer is missing, **Then** once the checks in criterion 4 pass, they see a warning that those
   keys won't work on that Kong, and a save without their explicit confirmation is refused. If they confirm,
   the new connection is saved. If they decline, nothing is saved and the existing connection keeps working.
   With no active keys, no warning appears.
8. **Given** `ADMIN_EMAIL`, `ADMIN_PASSWORD` and the `KONG_*` variables are set, including with
   `NODE_ENV=production` **When** the server starts **Then** no wizard appears, the admin and gateway
   exist as they do today, and `SEED_SAMPLE=true` still seeds the sample. The gateway is marked as
   managed by environment, and editing, disabling or removing it is refused with that reason. **Given**
   only the admin variables or only the `KONG_*` variables are set **Then** the wizard covers just the
   missing part. **Given** a v0.2 install with an admin and a gateway **When** it's upgraded using the new
   compose file **Then** no wizard appears, every existing key still works, and the gateway becomes
   editable in the admin screens.
9. **Given** a signed-out visitor or a signed-in developer **When** they call any gateway endpoint,
   including Test **Then** they get 401 or 403, and the portal makes no request to the supplied URL.
10. **Given** the new docs page on reaching the Kong Admin API **When** an engineer follows its
    protected-route recipe on a real Kong **Then** the Test passes with the right token and fails with a
    wrong one, a request from outside the IP allowlist is refused, and **a portal-issued key gets 403 on
    that route**. The page also covers the same-network option, and warns not to expose the default
    compose file to the internet, because it asks for no setup token. **When** an engineer follows its
    tag-based cleanup steps after removing a gateway **Then** the objects carrying this portal's tag are
    gone from Kong, including the `deny` ACLs from spec 004, and objects without the tag are untouched.

## Out of scope
- **Several connected gateways at once.** Cut because the roadmap puts several gateways in one catalog
  in Sprint 8 (spec 017). This spec allows one gateway per install, and a second add is refused (criterion 3).
- **Other gateway kinds.** AWS arrives in spec 017. Kong Konnect comes after v0.9.
- **Generating an API from a Kong service without an OpenAPI document.** Kong doesn't hold API docs, so
  the admin still supplies the document. Stub docs would publish an empty reference page.
- **Creating Kong services or routes from the portal.** Discovery reads what's there.
- **Showing access-control warnings to admins.** That's JSO-275. This spec shows only the connection
  status and the checks in criterion 4.
- **Rotating `PORTAL_ENCRYPTION_KEY`, or recovering a lost admin account.** Password reset is spec 007.
- **Audit log of gateway changes** (spec 015) and **production install hardening** (spec 016).
- **Setup token with several server replicas.** Spec 016 owns this. Follow-up: JSO-378.
- **Provisioning or securing the operator's Kong for them.** We document the recipe; they apply it.

## Open questions
- [x] **Who may claim a fresh install?** Decided: option (b). A one-time setup token from the server logs
  is required when `NODE_ENV=production`, with no token in the default quickstart. Criterion 2 has the
  failure path. — Elango, 2026-11-07.
- [x] **May the setup token appear in the logs?** Decided: yes, as an explicit, narrow exception to the
  "never log secrets" rule. It covers only this token, which is random and single-use and stops working
  once an admin exists. The exception is recorded here, not in `AGENTS.md` or the conventions doc, and the
  rule still applies to every other secret. — Elango, 2026-11-07.
- [x] **What happens to the setup token on a restart?** Decided: each start generates a new token until an
  admin exists, and nothing secret is stored (criterion 2). — Elango, 2026-11-07.
- [x] **Should the default compose file ask for a token?** Decided: no. It sets `NODE_ENV=development`, so it
  asks for none, and that's accepted. The docs page warns not to expose it to the internet (criterion 10).
  — Elango, 2026-11-07.
- [x] **What does a blank token mean on an edit?** Decided: it keeps the stored token only when the URL is
  unchanged. A changed URL requires the token to be entered again, and the stored token is never sent to the
  new host. A separate "this Kong needs no token" option (`adminToken: null`) removes a stored token
  (criterion 7(a)). — Elango, 2026-11-07.
- [x] **One gateway per install until spec 017?** Decided: yes, and a second add is refused (criterion 3).
  The server wires a single adapter at startup today, so this keeps the change to one pull request. JSO-245
  depends on this spec, and spec 017 would lift the limit. — Elango, 2026-11-07.
- [x] **Should an environment-managed gateway be read-only?** Decided: yes, as criterion 8 says. The server
  rewrites that gateway from the environment on each start, so an edit in the UI would silently vanish on
  restart. — Elango, 2026-11-07.
- [x] **What should happen when an edit points a gateway at a different Kong?** Decided: show a warning and
  require explicit confirmation when any active key's consumer is missing from the new Kong, and stay silent
  when there are no active keys. If the admin declines, nothing is saved and the existing connection keeps
  working (criterion 7(e)). The portal stores only a key's last four characters, so it can't recreate keys on
  another Kong. — Elango, 2026-11-07. The tech lead confirms feasibility in design.
- [x] **Does disabling mean what criterion 7(b) says?** Decided: yes. Disable blocks new apps, new keys and
  API import on that gateway, each with a clear error and nothing partial. Key revoke and the reconcile job
  keep running, and report a clear error if Kong can't be reached. Existing keys keep working through Kong and
  docs stay published. Revoking access would mean deleting keys that can't be recreated. Re-enabling reruns the
  checks in criterion 4, so a connection to a dead Kong stays disabled until Kong answers. — Elango, 2026-11-07.
- [x] **When is an import on a disabled gateway refused?** Decided: when the import starts, before the admin fills
  in a form, and the service list isn't offered. The server still checks on submit (criterion 7(b)). — Elango, 2026-11-07.
- [x] **Does the import block cover the sample API?** Decided: yes. Publishing the sample on a disabled gateway is
  blocked too (criterion 7(b)). — Elango, 2026-11-07.
- [x] **Where does the refusal for an environment-managed gateway go if the work is split?** Decided: criterion 8's
  refusal of edit, disable and remove moves to the second pull request, with criterion 7. — Elango, 2026-11-07.
- [x] **Should removing a gateway clean up the portal's objects in Kong?** Decided: no. Removal leaves them
  in Kong, including the `deny` ACLs from spec 004 on the operator's services, and the docs describe
  tag-based cleanup (criteria 7(d) and 10). A removal should never break traffic. — Elango, 2026-11-07. The
  tech lead confirms feasibility in design.
- [ ] **How does the wizard recognise the bundled Kong?** — tech lead. Criteria 3 and 6 need this. The
  default compose file can't set `KONG_ADMIN_URL`, or criterion 8 would treat that Kong as
  environment-managed, so it needs a separate non-secret hint. The server must use `http://kong:8001`,
  while the host's `localhost:8001` won't work from inside the container.
- [ ] **Does a read-only Kong need a stronger check?** — tech lead. DB-less mode should be detectable
  from a read. [Kong's DB-less docs](https://developer.konghq.com/gateway/db-less-mode/) confirm entity
  writes return 405 in this mode. An expired Enterprise license also makes the Admin API read-only from
  3.15 ([breaking changes](https://developer.konghq.com/gateway/breaking-changes/)). Decide whether Test
  needs a harmless write probe or whether that failure can surface later as `gateway-rejected`.
- [ ] **How should the docs recipe fit the adapter and spec 004?** — tech lead, confirmed on a live Kong.
  [Kong's guide](https://developer.konghq.com/gateway/secure-the-admin-api/) uses a loopback service and
  route with security plugins, and warns against binding to `0.0.0.0`. Three points follow:
  - The adapter sends only the `Kong-Admin-Token` header, so the recipe needs key-auth `key_names` set to it.
  - Key-auth alone isn't enough. Portal keys live on the same Kong, so a portal key could pass key-auth
    on the admin route. Spec 004's `deny` ACL takes up to 5 minutes to arrive, and Kong allows one ACL per
    scope, so the recipe needs its own ACL allow group from the start. Confirm reconcile leaves that ACL
    alone, and whether discovery should hide this service from import.
  - Kong OSS doesn't check the token on an open Admin API, so a wrong token passes there. Criterion 4's
    token case can only be tested against a protected route.
- [ ] **How should the Test call limit SSRF?** — tech lead. The admin-only exposure was accepted as a risk
  for spec import in spec 001. Criteria 4 and 9 already keep response bodies out of messages and limit Test
  to admins. Decide whether more is needed, such as blocking cloud metadata addresses.

**Notes for the tech lead**
- **The issue lists only an Admin URL and token.** Criterion 3 adds proxy URLs because `gateways.proxy_public_url`
  and `proxy_internal_url` are required: the catalog and try-it use them, and Kong's Admin API can't tell
  us the public address. The public URL can't be checked from the server. Propose which fields are required.
- **Dependency on spec 004.** It isn't merged (PR #4 is open). Design by reading its branch
  `origin/feat/jso-233-004-per-api-access-control` without merging it, and revisit if PR #4 changes before it merges.
- **Quickstart.** The default compose file changes, so CI smoke and e2e tests that rely on the seeded admin and
  sample API must change in the same pull request. Spec 006 relies on criterion 8.
- **If this won't fit one pull request:** ship criteria 1–6, 9 and 10 plus environment variables first, because
  they meet the issue's "Done when". Move edit, disable and remove (criterion 7) to a second pull request, along
  with criterion 8's "gateway becomes editable" part, criterion 8's refusal of edit, disable and remove on an
  environment-managed gateway, and criterion 10's tag-based cleanup docs.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Lasting decisions and their reasons are in [ADR 0006](../adr/0006-gateway-connection-is-stored-config.md).
Designed from the merged code, which includes spec 004, so the "isn't merged" note above no longer applies.
The whole scope fits one pull request, so the split suggested above isn't needed.

### Decisions on the open questions
| Question | Decision |
| --- | --- |
| How does the wizard recognise the bundled Kong? | The default compose file sets `PORTAL_BUNDLED_KONG_ADMIN_URL=http://kong:8001`. Only `KONG_ADMIN_URL` makes a gateway environment-managed, so this hint doesn't. The form is pre-filled from the hint plus `KONG_PROXY_INTERNAL_URL` and `KONG_PROXY_PUBLIC_URL`. The sample is offered only when the saved Admin API URL equals the hint. |
| Does a read-only Kong need a stronger check? | **No write probe.** A test must leave nothing in the operator's Kong. `GET /` shows `configuration.database: "off"` in DB-less mode (confirmed live, and writes return 405). The same check also refuses `configuration.role: "data_plane"`. An expired Enterprise license surfaces later as `/problems/gateway-rejected`, which is accepted. |
| How should the docs recipe fit the adapter and spec 004? | The recipe below, confirmed on a live Kong. Reconcile leaves its ACL alone as long as the ACL is **service-scoped**; a route-scoped one would log a `foreign-acl` finding every 5 minutes. Discovery hides the service by its `portal-internal` tag. Importing it is refused by spec 004 anyway, because a foreign ACL applies. |
| How should the Test call limit SSRF? | Block link-local and cloud metadata addresses, after resolving the name. Private addresses stay allowed, because Kongs live there. Redirects aren't followed, bodies never reach a message, and Test is limited to 30 requests per minute per admin. ADR 0006, decision 8. |
| Which fields are required? | `adminUrl`, `proxyInternalUrl` and `proxyPublicUrl`, because the catalog and try-it need them. The token is optional. The public URL's form is validated, but it isn't fetched. |
| Is 7(e) feasible? (Elango asked) | **Yes.** `listOwnedConsumers()` on a candidate adapter reads the new Kong by instance tag, and the server compares `custom_id` with the apps that have active keys. It only reads, so a declined save changes nothing. |
| Is 7(d) feasible? (Elango asked) | **Yes, with one migration.** Removal makes no Kong call, so traffic can't change. Revoked credentials and consumer mappings still reference the row today, so their foreign keys must change (see Data model). |
| How does `SEED_SAMPLE=true` behave on a disabled gateway? | **Startup skips the seed, logs a warning and still starts.** Elango's ruling blocks publishing the sample on a disabled gateway, and seeding publishes it, so nothing is written to Kong or Postgres. A sample that's already published stays published. Failing startup would lock the admin out of re-enabling. The flag isn't consumed, so the next start after a re-enable seeds. Criterion 8 isn't affected: when `KONG_ADMIN_URL` is set, the environment sync sets `enabled = true` before the seed, so only a gateway saved from the admin screens can be disabled here. |

**Two things Elango may want to look at:**
- **A gateway with a published API can't be removed.** The portal has no way to unpublish an API, so 7(c) always refuses once one exists, including the sample. Follow-up: JSO-310.
- **Pointing at a new Kong doesn't move published APIs.** They keep the old Kong's service IDs, and reconcile logs `service-missing`. Criterion 7(e) only asks for a warning about keys, and says none may appear when there are no active keys, so the warning follows that exactly. The docs page must say this. Follow-up: JSO-310.

### Verified on a live Kong
Kong 3.9.4, using the merged `KongAdapter` through the protected route. Each result below was observed.

| Check | Result |
| --- | --- |
| Right token: `GET /`, `GET /status` | 200, 200 |
| Wrong token, no token | 401, 401 |
| Portal-style key on the admin route, after reconcile | **403**, from the recipe's own `allow` ACL. Reconcile adds no `deny` there, so this ACL is the only protection and must exist from the start |
| Right token from outside the IP allowlist | 403 |
| `applyAccessPolicy` on that Kong | No findings; the recipe's ACL and consumer are unchanged; the operator's other key-auth service gets the `deny` ACL |
| Pagination through the route | `next` comes back as `/services?offset=…` without the route prefix. The adapter's relative URL handling still resolves it |
| Tag cleanup: plugins then consumers by `portal-instance-<id>` | Exactly one plugin (the portal's `deny` ACL) and one consumer deleted, and that consumer's memberships went with it. Recipe consumer and group remain. This run had no tagged routes or services (no sample was seeded), so QA covers those under AC 10 |
| DB-less Kong: `GET /` | 200 with `version`, `tagline: "Welcome to kong"`, `configuration.database: "off"`, `configuration.role: "traditional"` |
| DB-less Kong: `POST /consumers` | 405 |
| Kong's proxy port mistaken for the Admin API | 404 `no Route matched`, which maps to "isn't a Kong Admin API" |

**The recipe** (all objects tagged `portal-internal`):
1. Bind the Admin API to loopback with `KONG_ADMIN_LISTEN=127.0.0.1:8001`.
2. Create service `kong-admin-api` with `url: http://127.0.0.1:8001`, and a route with path `/admin-api` and `strip_path: true`.
3. On the **service**, add three plugins: `key-auth` with `key_names: [Kong-Admin-Token]` and `hide_credentials: true`, `acl` with `allow: [kong-admin]` and `hide_groups_header: true`, and `ip-restriction` with an `allow` list.
4. Create consumer `portal-admin-client`, with a key-auth credential (the token) and membership in group `kong-admin`.
5. Enter `http://<kong>:8000/admin-api` as the Admin API URL in the portal.

The allowlist must hold the portal server's address as Kong sees it. Behind a load balancer that needs Kong's `real_ip` settings.

**Cleanup steps for the docs:** list `plugins`, `consumers`, `routes`, then `services` with `?tags=portal-instance-<id>`, and delete each, in that order. Consumers take their keys and memberships with them. `hide_credentials` set on an operator's own key-auth plugin isn't undone, because the portal doesn't own that plugin; the page must say so. The instance ID comes from the `portal-instance-*` tag on any portal object.

### Components
| Component | Change | Why |
| --- | --- | --- |
| `packages/db` | Migration: `gateways` columns and singleton index, changed foreign keys | One gateway, managed-by, disable, removal |
| `packages/adapter-sdk` | `checkConnection`, `checkProxy`; conformance cases | Keeps Test gateway-neutral |
| `packages/adapter-kong` | Implements them; `listServices` leaves out `portal-internal` | AC 3, 4, 5 |
| `apps/server/src/config.ts` | Optional admin and `KONG_ADMIN_URL`; `''` means unset; `SEED_SAMPLE` defaults to false; new hint | AC 1, 8. Compose can't unset a variable it passes through |
| `apps/server/src/gateway-connection.ts` (new) | `loadGateway`, `requireGateway`, `requireEnabled`, URL normalising and SSRF check, and the checks shared by Test and save | ADR 0006, decisions 1 and 8 |
| `apps/server/src/gateways.ts` (new) | `/v1/admin/gateways*` | AC 3, 4, 6, 7, 9 |
| `apps/server/src/setup.ts` (new) | `/v1/setup*`, `createFirstAdmin`, setup token | AC 1, 2 |
| `apps/server/src/auth.ts` | `user.create.before` hook that refuses sign-up with no admin | AC 1 |
| `apps/server/src/startup.ts` | Environment sync, optional bootstrap, token, jobs load the gateway when they run, no seed on a disabled gateway | AC 1, 2, 7, 8 |
| `apps.ts`, `import.ts`, `proxy.ts`, `reconcile.ts`, `seed.ts`, `app.ts`, `problem.ts` | Load the gateway per request or job; new problem types and fields | AC 3, 5, 7 |
| `apps/portal/middleware.ts` | Sends every page to `/setup` until an admin exists | AC 1 |
| `apps/portal` pages | `/setup`, `/setup/gateway`, `/admin/gateways`, and import states | AC 2–7 |
| `deploy/docker-compose.yml`, `deploy/.env.example`, README, `docs/` | No default admin or gateway; new docs page | AC 1, 8, 10 |
| `deploy/*.mjs`, `deploy/e2e`, `apps/portal/e2e`, CI | Fresh-install path and environment path | Quickstart must stay green |
| `packages/sdk` | Regenerated | Contract changed. CI fails until this is done |

No new dependencies: `@fastify/rate-limit`, `node:net` `BlockList` and `node:dns` cover everything.

### API contract
`apps/server/openapi.yaml` is updated; it's the source for exact schemas.

| Operation | Success | Errors |
| --- | --- | --- |
| `GET /v1/setup` (public) | 200 `SetupStatus` | — |
| `POST /v1/setup/admin` (public, 10/min per IP) | 201 `User` + session cookie | 400; 403 `setup-token-invalid`; 409 `setup-complete`; 429 |
| `GET /v1/admin/gateways` | 200 `GatewayList` (`items`, `bundled`) | 401, 403 |
| `POST /v1/admin/gateways` | 201 `Gateway` | 400, 401, 403; 409 `gateway-exists`; 422 checks; 429 |
| `POST /v1/admin/gateways/test` (30/min per admin) | 200 `GatewayTestResult` (`version`, `warnings`) | 400, 401, 403, 404; 422 checks; 429 |
| `PATCH /v1/admin/gateways/{id}` | 200 `Gateway` | 400, 401, 403, 404; 409 `gateway-env-managed`, `gateway-keys-missing`; 422 checks, including on `enabled: true`; 429 |
| `DELETE /v1/admin/gateways/{id}` | 204 | 401, 403, 404; 409 `gateway-env-managed`, `gateway-in-use` (with `apis`, `activeKeys`) |
| `POST /v1/admin/gateways/{id}/sample` | 201 `ApiDetail` | 401, 403, 404; 409 `gateway-disabled`, `sample-not-available`; 502, 503 |

Changes to existing operations:
- `GET /v1/health`: `gateway` may be null, and the status stays 200.
- `GET /v1/admin/gateway/services`, `POST /v1/admin/apis`, `POST /v1/apps/{id}/credentials`: 409 `gateway-not-connected`.
- `POST /v1/apps`, `POST /v1/apps/{id}/credentials`, `POST /v1/admin/apis`: 409 `gateway-disabled`, before any Kong write.
- `GET /v1/admin/gateway/services`: 409 `gateway-disabled`, with no request to Kong, so the service list isn't offered. The import screen uses this to refuse before the form.
- `/api/auth/sign-up/email` refuses while no admin exists. Better Auth owns that route, so the refusal is its JSON error, not problem+json.

**AC 4 message map.** The `detail` strings are fixed in `gateway-connection.ts` and never interpolate anything Kong sent:

| Case | Result |
| --- | --- |
| Network error, 5 s timeout or 5xx | 422 `gateway-unreachable`. Adds the "resolved from the server" sentence when the host is `localhost`, `127.0.0.1` or `::1` |
| 401 or 403 | 422 `gateway-token-refused` |
| 3xx, other 4xx, non-JSON, oversized body, or `tagline`/`version` missing | 422 `gateway-not-kong` |
| `configuration.database` is `off`, or `configuration.role` is `data_plane` | 422 `gateway-read-only` |
| Internal proxy has a network error or times out. Any HTTP status counts as reachable, because Kong's proxy answers 404 with no route | 422 `gateway-proxy-unreachable` |
| Malformed URL, wrong scheme, credentials, query or fragment in the URL, or a blocked address | 400 `validation`, with `errors[].pointer` naming the field |
| URL changed, token blank, token stored | 422 `gateway-token-required`, with no request made |

**Order on every save and Test:** authorise → validate fields → resolve the token (7(a)) → SSRF check → `checkConnection` → `checkProxy` → if the URL changed, count active keys missing from the candidate Kong. A refused second add stops before any of the outbound steps.

**URL comparison for 7(a):** compare `origin + pathname` with the trailing slash removed, after `new URL()` normalises it. Anything else counts as changed, so the stored token stays home.

### Data model
Migration `0001` (the next free number):

```ts
// gateways
managedBy: text('managed_by').notNull().default('admin'), // check in ('admin','env')
enabled: boolean('enabled').notNull().default(true),
// unique index gateway_singleton on gateways ((1)). Spec 017 drops it.

// credentials.gateway_id: now nullable, ON DELETE SET NULL
// check credential_active_has_gateway: status <> 'active' or gateway_id is not null
// gateway_consumers.gateway_id: ON DELETE CASCADE
// apis.gateway_id: unchanged (restrict). 7(c) checks first, this is the backstop.
```

- **Why these foreign keys:** a developer's revoked keys must stay visible after a removal, so their rows stay with a null gateway. A consumer mapping means nothing once its gateway is gone.
- **Upgrade:** a v0.2 row takes the defaults, so it's editable unless `KONG_ADMIN_URL` is set. No v0.2 install has more than one row, because startup only ever wrote `name = 'default'`, so the index is safe.
- **Name:** the row keeps `name = 'default'` and the API doesn't expose it.
- **Nothing else is stored:** the setup token lives only in memory, and the token ciphertext uses the existing `encrypt()`.

### Startup and configuration
```
migrate → instance row
→ KONG_ADMIN_URL set?   yes: upsert row (managed_by = 'env', enabled = true)
                        no:  a row left as 'env' becomes 'admin'; otherwise leave it alone
→ ADMIN_EMAIL + ADMIN_PASSWORD set and no admin? createFirstAdmin
→ NODE_ENV=production and still no admin? generate the token and log it
→ SEED_SAMPLE and an enabled gateway exists? seed (no gateway, or disabled: log a warning and skip)
→ start jobs → listen
```
- `ADMIN_EMAIL` without `ADMIN_PASSWORD`, or the reverse, fails at startup with a clear message. `KONG_ADMIN_TOKEN` or `KONG_PROXY_*` without `KONG_ADMIN_URL` is only used as described above.
- The default compose file passes `KONG_ADMIN_URL`, `KONG_ADMIN_TOKEN`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` as `${VAR:-}`, `SEED_SAMPLE` as `${SEED_SAMPLE:-false}`, `KONG_PROXY_INTERNAL_URL` as `${KONG_PROXY_INTERNAL_URL:-http://kong:8000}`, `KONG_PROXY_PUBLIC_URL` as `${KONG_PROXY_PUBLIC_URL:-http://localhost:8000}`, and the fixed hint.
- **The setup token line:** written once per start as part of the log message string, so pino's redaction can't hide it. Add `setupToken`, `adminToken` and their `*.` forms to the redact paths, so no other log line can carry them.
- **Middleware:** after the demo check, `middleware.ts` asks `GET /v1/setup`, and caches `adminRequired: false` for the life of the process because it never goes back. If the server is down, public pages render as they do today, and protected pages keep their 503. Its matcher grows to every page except `_next` and static files, and `/api/*` never reaches it. `/setup` redirects to `/` once an admin exists.
- **The wizard when only admin variables are set:** after sign-in, an admin with no gateway and no `next` target lands on `/setup/gateway`, which has a skip link.

### Request flows
- **`loadGateway`:** selects the single row, decrypts the token and builds the adapter through an injected `adapterFor(row)`. That replaces `adapter` and `gatewayId` in `createApp`'s options, and tests pass a fake factory. A token that can't be decrypted logs an error without the value, and acts like an unavailable gateway: 503 on gateway calls and `reachable: false` on health, so a changed encryption key doesn't fail the compose health check.
- **Save:** runs the checks with no lock held. Then one transaction takes `pg_advisory_xact_lock(71833002)` exclusively, the lock app creation holds in shared mode and reconcile holds while it runs, re-reads the row, re-applies the `env`, exists and dependents rules, writes, and commits. A save may wait for a running reconcile. After the commit it queues `gateway-reconcile` through an injected `enqueueReconcile`, so new deny ACLs don't wait 5 minutes.
- **Remove:** same lock, then count `apis` and active `credentials`. Above zero is 409 with both counts.
- **Disable:** `requireEnabled` refuses with 409 `gateway-disabled` on app and key creation, discovery, import and the sample, before any Kong call. Revoke, reconcile, the catalog and try-it ignore it, so existing keys and docs carry on (7(b)). A change to only `enabled: false` makes no Kong call, so a dead Kong can still be disabled.
- **Re-enable:** `enabled: true` runs the normal save order, so the checks in criterion 4 run first. If one fails, the response is that case's 422 and the row stays disabled. With the URL unchanged there's no missing-key count.
- **Import start:** `GET /v1/admin/gateway/services` checks `enabled` right after the admin check and before any Kong call. The import screen waits for this response before it shows the form, and on `gateway-disabled` shows the disabled state instead of the form, with a link to Admin → Gateways.
- **Import submit:** `POST /v1/admin/apis` checks `enabled` right after the admin check, before it parses the body, fetches `spec.url` or calls Kong. A disabled gateway therefore answers 409 even for an invalid document. The transaction then re-reads `enabled` after taking the shared lock and before `protectService`, so a disable that commits mid-import can't be followed by a Kong write. An import already past that point finishes first, because the save waits for the lock.
- **Reconcile:** loads the gateway after it holds the lock, and returns at once if none exists. When Kong can't be reached it logs through the existing `backgroundJob` path.
- **`createCredential`:** adds `ensureConsumer` and `grantAccess` for the app's subscribed services before `issueCredential`, and upserts `gateway_consumers`. Without this, a new key on an existing app gets a 502 after repointing, because Kong has no such consumer. Both calls are idempotent. It uses the existing shared lock and compensation.
- **`createFirstAdmin`:** under `pg_advisory_xact_lock(71833003)`: if an admin exists, 409; check the token in constant time on SHA-256 digests; insert `user` with `role = 'admin'` and `account` with `providerId = 'credential'`, `accountId = user.id` and `password = await (await auth.$context).password.hash(...)`. After the commit, call `auth.api.signInEmail` with `returnHeaders: true` and copy `set-cookie`. If that sign-in fails, return 201 without a cookie; the portal sends them to `/sign-in`. If a user who predates this spec already has that email, the response is 400 `validation` on `/email`.
- **Sample:** `seedSample` takes the loaded adapter, unchanged otherwise. `sampleAvailable` is `enabled`, `adminUrl === hint` and no API has slug `sample`, so the wizard doesn't offer it on a disabled gateway and it can't overwrite an API an admin published under that slug. `POST …/sample` checks in this order: admin, the row exists, `gateway-disabled`, `sample-not-available`. It then takes the shared lock, re-reads `enabled` and seeds, and queues a reconcile afterwards.
- **Seed at startup:** reads `enabled` from the row and follows the decision above. The deferred `seed-sample` job loads the gateway when it runs. If the gateway has since been removed or disabled, the job logs a warning and returns without throwing, so its retries stop and it writes nothing.
- **Try-it:** `isAccessDenied` holds no connection state, so build the adapter from the `row.gateway` that `publishedApis` already joins.

### Adapter calls
```ts
type ConnectionCheck =
  | { outcome: 'ok'; version: string }
  | { outcome: 'unreachable' | 'refused' | 'not-gateway' | 'read-only' };
checkConnection(): Promise<ConnectionCheck>;      // never throws for gateway behaviour
checkProxy(url: string): Promise<boolean>;        // true on any HTTP response
```

| Call | Kong | Idempotency and failure |
| --- | --- | --- |
| `checkConnection` | `GET /`, with `Kong-Admin-Token` when a token is set | Read-only. 5 s timeout, `redirect: 'manual'`, body read up to 1 MiB and then discarded. Returns only the fields above, so a body can't reach a message |
| `checkProxy` | `GET <proxyInternalUrl>`, **without** the admin token | Read-only. Same limits. The body is cancelled unread |
| `listOwnedConsumers` (existing) | `GET /consumers?tags=portal-instance-<id>` on the candidate | Read-only. Failures use the AC 4 map |
| `listServices` (existing) | Filters services tagged `portal-internal` out of the result | `getService` uses it, so it hides them too. `topology()` reads services directly, so reconcile still sees them |
| Remove | None | The portal's objects stay in Kong |

The conformance suite gains `checkConnection` cases for a healthy gateway and a refused one.

### Risks
| Risk | How we handle and test it |
| --- | --- |
| The quickstart's default changes: no seeded admin or sample | CI runs the fresh-install path first, then `down -v` and the environment path for the existing smoke and e2e suites. Raise `compose-smoke`'s 10-minute timeout as needed. The 5-minute budget now also covers reaching `/setup`. |
| Two people race for the first admin | Advisory lock plus a transaction. Test: simultaneous `POST /v1/setup/admin` calls give one 201 and the rest 409, with one admin. |
| Sign-up gets around the gate | The hook sits on user creation, not a URL. Test: sign-up with odd paths and trailing slashes refused before the admin exists, and accepted after. |
| The first admin's direct insert drifts from Better Auth | A test signs in with the created admin, for both the wizard and environment paths. |
| The stored token reaches a new host | Test with a recording fake: a blank token and a changed URL make **no** outbound request. Also compare scheme, port and path changes. |
| A token or body leaks into a message or log | A test sends a unique token to a server that echoes it and returns a marked body, runs every failure case, and asserts neither appears in any response or log. |
| Test used to scan a network | Admin-only, rate-limited and no body shown, so the only signal is one of the fixed outcomes. Accepted. Test: `169.254.169.254`, `http://2852039166/` and a name resolving to link-local are refused with no request. |
| A key straddles two Kongs during a save | Exclusive advisory lock. Test: a save during a slow app creation waits, and the key ends up on one Kong. |
| Revoke on a new Kong reports success while the old Kong still accepts the key | After 7(e) the portal can't reach the old Kong, and a 404 on delete counts as success. The warning copy and docs must say to clean up the old Kong. |
| After repointing, reconcile writes ACLs to the new Kong | Intended, and it's why AC 3 tells the admin first. `service-missing` is only logged. |
| Downstream specs assume seeded defaults | Spec 006 uses the environment path, which `SEED_SAMPLE=true` keeps working. Test: AC 8 with `NODE_ENV=production`. |
| Local `pnpm dev` now starts with the wizard | Documented in the README. |
| A disable lands during an import or sample | The re-read under the shared lock, with the save holding the exclusive lock. Test: a disable during a slow import waits for it, and an import or sample that takes the lock after the disable is refused with no Kong write. |

### Tasks
- [x] [backend] Fix JSO-451: restore quiet cold Compose build/start below five minutes (branch 372.45s; main 280.20s).
- [x] [backend] JSO-312 `packages/db`: migration and schema for `managed_by`, `enabled`, the singleton index and the changed foreign keys, with an upgrade test from a v0.2 row and revoked credentials.
- [x] [backend] JSO-313 Regenerate `packages/sdk` from the updated `openapi.yaml` first, because CI's check job fails until it matches.
- [x] [backend] JSO-314 `config.ts`: optional admin and `KONG_ADMIN_URL`, empty string means unset, `SEED_SAMPLE` defaults to false, `PORTAL_BUNDLED_KONG_ADMIN_URL`, and a clear failure when only one admin variable is set.
- [x] [backend] JSO-315 `adapter-sdk` and `adapter-kong`: `checkConnection` and `checkProxy` per the design, `portal-internal` filter in `listServices`, and conformance cases.
- [x] [backend] JSO-317 `gateway-connection.ts`: `loadGateway` with `adapterFor`, `requireGateway`, `requireEnabled`, URL normalising, the SSRF check with `BlockList`, and the shared checks with the AC 4 message map.
- [x] [backend] JSO-318 Move `app.ts`, `apps.ts`, `import.ts`, `proxy.ts`, `reconcile.ts`, `seed.ts` and health to the per-request gateway, including null health, `gateway-not-connected`, an undecryptable token acting as unavailable, and `gateway-disabled` on app and key creation, on `GET /v1/admin/gateway/services` with no Kong call, and on `POST /v1/admin/apis` before the document or Kong is touched, re-checked under the shared lock before `protectService`.
- [x] [backend] JSO-319 `createCredential`: ensure the consumer and grant access before issuing, and upsert `gateway_consumers`, so a new key works after repointing.
- [x] [backend] JSO-320 `gateways.ts`: list, create, test, update and delete, with the exclusive lock, env-managed refusals, 7(a) token rules, 7(e) missing-key count and confirmation, 7(c) counts, a queued reconcile after each save, and re-enable: `enabled: true` runs the checks in criterion 4, and on failure returns that case's 422 and stays disabled, while a change to only `enabled: false` makes no Kong call.
- [x] [backend] JSO-321 `POST /v1/admin/gateways/{id}/sample` and `sampleAvailable`, so the sample is refused with `gateway-disabled` on a disabled gateway (`sampleAvailable` false, re-checked under the shared lock), is refused on any Kong but the bundled one, and can't overwrite an API with slug `sample`.
- [x] [backend] JSO-322 `setup.ts` and `auth.ts`: `GET /v1/setup`, `POST /v1/setup/admin` with direct atomic insert and sign-in cookie, setup token check, rate limit, and the `user.create.before` hook.
- [x] [backend] JSO-323 `startup.ts`: environment sync and `managed_by` handover, shared `createFirstAdmin`, setup token log line and redact paths, jobs that load the gateway when they run, and seeding only when an enabled gateway exists: with none or a disabled one, startup and the `seed-sample` job log a warning, write nothing and don't fail or retry.
- [x] [backend] JSO-324 `problem.ts`: new problem types, titles and the `apis`, `activeKeys` and `affectedKeys` fields.
- [x] [backend] JSO-325 `deploy/docker-compose.yml`, `deploy/.env.example` and README: no default admin or gateway, the bundled hint, and the new quickstart steps.
- [x] [backend] JSO-326 New docs page on reaching the Kong Admin API: same-network option, the protected-route recipe, the warning not to expose the default compose file, tag-based cleanup including the `hide_credentials` caveat, and what repointing does and doesn't move.
- [x] [backend] JSO-327 Update `apps/server/src/*.test.ts` and `deploy/*.mjs` for the new options, and run the existing suites on the environment path so they keep their seeded sample.
- [x] [backend] Fix JSO-380: try-it applies saved proxy URLs on the next request (2293bf4). QA closes the bug.
- [x] [backend] Fix JSO-402: the unreachable-address detail for localhost says what to enter instead, per design §5.2, and drops "check that Kong is running" (minor)
- [x] [backend] Fix JSO-403: the setup token log line reads `Setup token for the first admin: <token>`, per design §5.1, so the form hint matches (minor)
- [x] [backend] Fix JSO-404: the protected-route recipe in `docs/connect-kong.md` runs on the official Kong image, which has no `curl` (minor)
- [x] [frontend] JSO-328 `middleware.ts`: send every page to `/setup` until an admin exists, cache the answer once false, pass public pages through when the server is down, and keep demo builds unaffected.
- [x] [frontend] JSO-329 `/setup`: first admin form, the setup token field when `setupTokenRequired`, refusal messages, and sign-in on success.
- [x] [frontend] JSO-367 `/setup/gateway` and post-sign-in landing: pre-filled bundled values, Test, what the portal will change in this Kong, skip, and the sample opt-in only when `sampleAvailable`, showing the message if the sample call returns `gateway-disabled`.
- [x] [frontend] JSO-368 `/admin/gateways` and nav: add, edit, disable, re-enable and remove; read-only state when `managedBy` is `env`; blank token keeps the stored one; a "this Kong needs no token" option.
- [x] [frontend] JSO-369 Show every AC 4 message at the right field, including when a re-enable fails and the row stays disabled, the 7(a) re-enter-token message, the 7(e) warning with explicit confirmation and decline, and the 7(c) counts.
- [x] [frontend] JSO-370 Import screen (`admin-apis.tsx`): wait for the service list before showing the form, which today renders straight away. `gateway-disabled` shows the disabled state instead of the form and offers no service list, with a link to Admin → Gateways, while published APIs stay listed. The same refusal on submit shows the message and keeps what was entered. `gateway-not-connected` links to Admin → Gateways, and `gateway-unavailable` shows a retry that loses nothing, in place of today's one message for any error. Handle `gateway: null` wherever health is read. Handle `gateway-disabled` on Create app and New key.
- [x] [frontend] Fix JSO-379: portal component tests use jsdom storage on Node 25+ (0c5b10d). QA closes the bug.
- [x] [qa] JSO-371 AC 1, 2: fresh compose with no settings reaches `/setup` within 5 minutes, sign-up refused, no Kong objects; simultaneous submissions; production token right, wrong, missing and after an admin exists; a new token on each start.
- [x] [qa] JSO-372 AC 3, 4, 9: real Kong connect without restart, token encrypted and absent from responses and logs, second add refused; every failure case including real DB-less Kong; signed-out and developer callers get 401 or 403 with no outbound request.
- [x] [qa] JSO-373 AC 5, 6: pick a discovered service, import, and a developer's key returns 200; Kong down and no gateway states; sample opt-in, opt-out and non-bundled Kong.
- [x] [qa] JSO-374 AC 7: every path (a) to (e) on real Kongs, including two Kongs for (e), and removal leaving `deny` ACLs and traffic unchanged. For (b), also: new app and key refused; revoke and reconcile with Kong up and down; the import screen shows no form or service list; `GET /v1/admin/gateway/services` and an import submitted anyway get `gateway-disabled` with no new Kong objects or API row; a direct call to `POST /v1/admin/gateways/{id}/sample` gets `gateway-disabled` and leaves nothing, because the opt-in is only in the wizard; a restart with `SEED_SAMPLE=true` skips the seed and stays healthy; and re-enable against a dead Kong shows that case's message and stays disabled, then succeeds once Kong answers.
- [x] [qa] JSO-375 AC 8: full, admin-only and Kong-only environment variables, with `NODE_ENV=production`; env-managed refusals; a v0.2 upgrade using the new compose file keeps every key working and the gateway becomes editable.
- [x] [qa] JSO-376 AC 10: follow the docs page on a real Kong: right and wrong token, outside the allowlist, portal key 403, and tag-based cleanup leaving untagged objects untouched.
- [x] [qa] JSO-377 CI: fresh-install path first, then environment path for the existing smoke and e2e suites, and confirm the demo smoke is unaffected.
- [x] [backend] Fix: revert the JSO-451 packaging change (`b56d03d`): restore main's `apps/server/Dockerfile` (production-deps stage, runtime copies, `CMD ["node", "apps/server/dist/main.js"]`), remove `injectWorkspacePackages` and `syncInjectedDepsAfterScripts` from `pnpm-workspace.yaml` and the lockfile, drop the `files` lists added to `apps/server`, `packages/db`, `packages/adapter-sdk` and `packages/adapter-kong`, and point the reconcile import in `apps/portal/e2e/gateway.ts:246-249` back at `./packages/db/dist/index.js` and `./apps/server/dist/*.js`. Then run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `deploy/quickstart-smoke.mjs` and the live `gateway.ts` AC 6 case. Review finding B1.

## UX  _(ui-designer)_
Full design: [docs/design/005-setup-wizard-and-gateway-connections.md](../design/005-setup-wizard-and-gateway-connections.md). It adds no new tokens.

- **Screens:** `/setup` (first admin, with the setup token only when required), `/setup/gateway` (connect, then the sample choice on the bundled Kong) and `/admin/gateways` (one connection as a card, or the add form when there's none). A new `AdminNav` makes Gateways findable. The import, Create app and New key screens gain the disabled and not-connected states.
- **A passed Test says "Nothing has been saved yet."** Save is never blocked on Test, because the server runs the same checks. What saving changes in Kong stays visible next to the button.
- **Every criterion 4 case has fixed copy, a named field and a closing line** saying what didn't change. The design lists every server `title` and `detail`, including the setup token's log line.
- **No step count in the wizard.** `SetupStatus` can't say whether a gateway step follows.
- **No dead controls.** An environment-managed gateway shows an explanation and no actions.
- **Follow-ups:** JSO-365 (frontend additions the task list doesn't name, including `create-app.tsx` and `app-detail.tsx` treating every 409 as one case) and JSO-366 (no defined response when a stored token can't be decrypted).

## Build notes  _(backend-developer, frontend-developer)_

- Backend B1 diagnosis after checkpoint `87fce17`: a third unchanged AC 6 run fails at the same log assertion. Full timestamped logs show `Background job failed: gateway unavailable` at **06:04:10.720 UTC**, 3.230s after the Kong stop command completed (06:04:07.491), 2.764s after the server restart command completed (06:04:07.956), and 1.998s after the server began listening (06:04:08.722). The test read its 30-second log snapshot at **06:04:09.068–09.239**, at least 1.481s before the warning existed: the filter did not exclude an old warning; the assertion preceded asynchronous job completion. This proves the immediate failure mechanism, but does not establish whether the packaging revert changed its likelihood. Evidence: `/tmp/spec005-b1/{ac6-diagnostic,server-full}.log` and `lifecycle.jsonl`; no code or tests changed during diagnosis. The warning appeared, so the coordinator's conditional main comparison was not run (an unused `origin/main` archive exists at `/tmp/spec005-b1/main`; no main stack/images were created). All owned project containers, volumes, network and application images are removed; final Docker container inventory and `spec005-b1-*` image inventory are empty. B1 remains unticked for the tech lead/Elango decision.

- Backend B1 revert checkpoint (2026-11-08): reversed only the packaging paths from `b56d03d` and the four reconcile imports from `7106ceb`; `apps/server/Dockerfile`, both pnpm files and all four package manifests now match `origin/main` exactly. `CI=true pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass (322 tests); the unchanged fresh/environment quickstart smoke passes (fresh cached build/start 15.1s). The unchanged live AC 6 case failed twice at `gateway.ts:231` because its immediate server-log check lacked `gateway unavailable`, before executing the restored imports; cause remains unverified and B1 stays unticked. Evidence: `/tmp/spec005-b1/{install,lint,typecheck,test,quickstart-first,quickstart,ac6-first,ac6}.log`. Each runtime run used only the owned `spec005b1revert` project and unique images, built sequentially; project, volumes and images were removed after each run. No cold benchmark was run; further timestamped diagnosis is pending coordinator review.

- Backend quickstart completion (JSO-451; implementation `b56d03d`, baseline evidence `4f2df13`): final `pnpm lint` (7 tasks), `pnpm typecheck` (12 tasks), and `pnpm test` (275 tests: 95 server, 123 portal, 55 Kong adapter, 2 database) pass after `pnpm install --offline --frozen-lockfile`. Ran the complete `deploy/quickstart-smoke.mjs` with only its Compose invocation pointed at the owned `s005bffinal` project/image override: fresh setup in **21.1s with cached application layers**, followed by the environment-admin/Kong/sample path. Additional live-container checks verified database migration and sample/contract assets, adapter imports, no TypeScript runtime dependency, and UID 1000. `deploy/smoke.mjs` passed signup, app/key creation, real Kong auth, try-it, one-time key redaction and revocation. The two **uncached** final-variant totals remain **127.99s / 144.34s**; the cached smoke timing is separate. Logs: `/tmp/spec005-buildfix/{install,lint,typecheck,test,final-smoke}.log`; full verification driver `/tmp/spec005-buildfix/verify.py`. All owned stacks/volumes/images are removed; final Docker inventory is empty. Task is ticked and bug is ready for QA review; the Bugs checkbox and spec status remain unchanged. QA should repeat timing independently because the earlier regression did not reproduce and no causal speedup over today's baseline is claimed.

- Backend quickstart implementation (JSO-451): replaced the parallel delete-and-reinstall server production stage and seven runtime copies with `pnpm deploy --prod --offline` from the compiled server and one runtime copy. Package `files` lists retain server dist/seed/contract, adapter dist, and database dist/migrations. Enabled pnpm's injected-workspace deployment and post-build synchronization; the lockfile adds only that setting, with no dependency version changes. The runtime remains non-root with production dependencies only; no app/API behavior changed and no portal/UI files were edited. The standard deployment variant passed two quiet uncached builds: **107.37s build / 127.99s total**, **124.00s / 144.34s** (155.66s minimum margin below 300s). All fresh smoke assertions pass. This establishes current five-minute acceptance, but **does not demonstrate a speedup against today's unchanged-branch baseline** (102.99s / 126.29s); the earlier 372.45s slowdown was not reproduced.
- Rejected build experiments, retained for audit: legacy offline deploy failed before startup with `ERR_PNPM_NO_OFFLINE_META` (no complete timing); the lockfile-based deploy above replaces it. Explicit hardlink deployment passed functionally but took **201.75s build / 224.86s total** and **162.76s / 181.85s**; it was removed because it did not improve timings. Evidence is `/tmp/spec005-buildfix/after1{,b,c}.{json,log}` and `after2{b,c}.{json,log}` (the failed legacy attempt is `after1`). Same host, no other running containers, cached base/service images, no-cache application builds, unique owned projects and images, cleaned after each attempt. No timer or assertion was changed in the repository smoke test. Full smoke and repository checks follow before completion.

- Backend quickstart baseline (JSO-451, 2026-11-08): created the previously pending bug successfully; JSO-304 was already Done and was left unchanged. Exported branch `65facd1` and pre-005 main `f52870e` with `git archive` into `/tmp/spec005-buildfix/{before,main}`. Four quiet alternating runs on Docker Desktop (8 CPUs, 4,106,539,008 bytes RAM), each with `build --no-cache`, then `up --build -d --wait`, fresh volumes, unique `s005bf*` projects/images, and an empty initial container inventory: branch 1 **84.63s build / 102.99s total**, main 1 **84.57s / 101.85s**, branch 2 **102.70s / 126.29s**, main 2 **113.15s / 130.71s**. Branch runs execute all original fresh-setup smoke assertions (redirect, no gateway/catalog/Kong objects, signup refusal); main runs check its original seeded home and sample. These pass and do not reproduce the earlier regression; host/build variability is material, so no branch-specific slowdown is established. Base/service images remain cached, while every application build instruction runs uncached; no shared caches/images were cleared. Evidence: `/tmp/spec005-buildfix/measure.py`, `{before1,main1,before2,main2}.{json,log}`. Each run removed only its own containers, volumes and application images. Next: reduce duplicated server dependency work and repeat twice, preserving the five-minute check.

- Backend UAT fixes (JSO-402, JSO-403, JSO-404; `9727504`): loopback failures now use design §5.2's exact detail with the Compose service-name example; production setup logs use `Setup token for the first admin: <token>`. Regression tests cover localhost/IPv4/IPv6, unchanged non-loopback and token-refusal messages, API responses, token rotation and no token log after admin creation. The protected-route guide opens a separate `curlimages/curl:8.11.1` shell sharing Kong's network namespace, with no Admin API port exposure. The documented recipe passed on real `kong:3.9` and Postgres (right token 200, wrong token 401), and the image's interactive token prompt was checked. Final `pnpm lint`, `pnpm typecheck` and `pnpm test` pass (95 server, 123 portal, 55 adapter, 2 database tests); initial concurrent portal failures passed on a sequential package rerun. Bugs remain open for QA/UAT verification; spec status is unchanged.

- Backend (JSO-312–JSO-327): implemented migration 0001, optional bootstrap, bounded Kong checks, stored per-request gateway loading, admin gateway management, atomic first-admin setup, production setup tokens, environment handover, disabled-state guards, credential consumer/access upserts and sample opt-in. The API contract and SDK include JSO-366's safe 503 response: enter the token again or explicitly remove it when stored credentials cannot be decrypted. Core commits: 47ba153, e3d3f2e, af4459f, 986da40, ab0467d and 723cb8e; follow-ups: 2be07df, 2293bf4, ac0fdb9 and 5037320. Deployment and connection docs are in bbbdeb2.
- Backend validation: final `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, including 78 server tests, 52 Kong adapter tests (14 against real Kong) and the Postgres upgrade/removal tests. Fresh Compose reached `/setup` in 102.0 seconds, with no admin, gateway, API or Kong objects; the environment-seeded path, `deploy/smoke.mjs`, `deploy/outage-smoke.mjs` and all 24 `pnpm test:e2e` cases pass. The coordinator explicitly authorized updating only `apps/portal/e2e/gateway.ts` to use the new reconcile signature. An initial isolated text/plain proxy request returned 404 after direct Kong returned 403; it passed unchanged in isolation and in the full rerun, so QA should watch for Kong worker propagation timing. No browser test was weakened or skipped.
- Backend QA handoff: JSO-366 (stored-token recovery) and JSO-380 (try-it immediately uses saved proxy URLs) are fixed and In Review. Verify the real protected-route/allowlist/cleanup recipe, two-Kong repointing and production-token lifecycle against the acceptance criteria. The spec remains `building`; only the coordinator moves it.

- Frontend (JSO-328, JSO-329, JSO-367–JSO-370, JSO-365): added the first-admin wizard, setup-aware middleware and sign-in landing, shared Kong connection form, gateway management card and confirmation dialogs, sample opt-in, Admin navigation, and import/developer refusal states. Calls use the generated SDK; gateway tokens stay in component state and are cleared on successful save. Failed service refresh and stale import submissions preserve entries; environment-managed connections have no mutation controls.
- Frontend validation: `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed (the full suite needs Docker/network access outside the restricted sandbox); portal suite has 110 passing tests covering setup, connection checks, token semantics, missing-key confirmation, disable/remove refusals, sample eligibility, import states and developer messages. QA should verify keyboard/focus and responsive flows against a running portal, plus each real Kong failure case. JSO-379 fixes the Node 25+ test storage globals by using Vitest's jsdom realm.
- Frontend UAT fix (JSO-398): sign-in now reads the portal role from `/v1/me` through the SDK because Better Auth's sign-in response omits it, then sends admins without a gateway or explicit `next` to `/setup/gateway`, including admin-only installs. Regression tests use a sign-in response without a role and cover absent/present gateways, developer landing and explicit continuations; `pnpm lint`, `pnpm typecheck` and `pnpm test` pass (112 portal tests; unchanged integration suites cached). QA/UAT should recheck sign-in after skipping setup and on an admin-only install; the bug remains open for verification.

- Frontend UAT fixes (JSO-381, JSO-400, JSO-401, JSO-402), commit `bbe60c7`: corrected the Kong guide/repoint/cleanup links to existing headings, suppressed the redundant alert for 400 field errors, gave raw problem titles readable fallback copy (including Revoke), counted and pluralised missing-key warnings/dialogs, and selected loopback field guidance from the submitted URL. All 123 portal tests, `pnpm lint`, `pnpm typecheck` and the full `pnpm test` suite pass with Docker/network access; the initial sandbox run could not bind sockets or reach Docker, and two transient assertions in concurrent backend edits were corrected by their owner before the passing rerun. QA/UAT should verify the three guide links, field focus/value preservation after 400, singular/plural repoint copy, Revoke during an outage, and localhost/IPv4/IPv6 loopback guidance; bug checkboxes remain open for verification.

## Test report  _(qa-tester)_

**QA decision: `uat` after the fourth QA pass, 2026-11-08.** No blocker or major remains open. The B1 packaging revert matches `origin/main` for the server Dockerfile, workspace/lockfile settings and all four package manifests; the restored reconcile imports run successfully in the live AC 6 case. Five-minute acceptance follows tech-lead ruling 2: quiet unchanged-branch **103s / 126s** and main **102s / 131s** measurements show no regression; no further cold benchmark was required or run. Historical measurements below are retained as evidence of earlier passes, not measurements of the final reverted packaging.

**Fourth QA pass — B1 revert and asynchronous AC 6 log assertion.** The coordinator narrowed this pass to the packaging revert and the diagnosed test race; the existing acceptance-criterion map and previous upgrade/demo evidence stand. Updated only `apps/portal/e2e/gateway.ts`: poll the existing 30-second server-log view for `gateway unavailable` for at most 30 seconds before checking that the credential key and password are absent. All other assertions remain intact; the live AC 6 case passes in **12.0s**, including the restored `/app/packages/db` and `/app/apps/server` reconcile imports, unchanged database snapshot, repaired ACL membership and Kong 200.

Validation ran serially after spec 012 released the Docker host. `pnpm lint` passes **7/7 tasks** and `pnpm typecheck` passes **12/12 tasks**; the uncached full suite passes **322 tests** (170 portal, 95 server, 55 Kong adapter, 2 database), **12/12 tasks**, in **131.04s** with `NODE_OPTIONS=--no-experimental-webstorage pnpm test --force --concurrency=1 -- --maxWorkers=2`. An initial sandbox-restricted attempt could not access Docker and failed; the authorized Docker-access rerun is the passing result. Sequential server/portal image builds succeed. `pnpm test:e2e` completes **47 cases in 4.0m: 44 ordinary passes and 3 expected failures**, re-confirming open minors JSO-399/405/406. The first newly imported text/plain try-it refusal returns the expected 403 in this run; the intermittent 404 remains open, not established as fixed. No new product bug was found.

The unchanged `deploy/quickstart-smoke.mjs` passes from a fresh volume: **18.4s** for cached-image build/start and `/setup`, with no admin/gateway/catalog/Kong objects, public signup refused, then environment-admin/Kong/sample bootstrap verified. This is **not a cold benchmark**. `deploy/smoke.mjs` then passes signup, app/key creation, real Kong authorization, try-it, one-time-key redaction and revoke. Only Compose project `spec005qa4` and unique `spec005qa4-server` / `spec005qa4-web` images were used; a temporary Docker shim adds the owned image override to Compose calls, including the unchanged smoke and the older hardcoded restart helper. All owned containers, volume, network and application-image tags were removed; no other project or shared cache was changed. Logs: `/tmp/spec005-qa4/{lint,typecheck,test,build-server,build-portal,e2e,quickstart,first-call,cleanup,cleanup-images}.log`; final inventory: `/tmp/spec005-qa4/final-{containers,images,volumes,networks}.log`.


**Independent cold benchmarks: NOT RUN (deferred).** The coordinator explicitly deferred both runs after a quiet window could not be obtained for five hours. The earlier spec 012-contaminated attempt is excluded, and the later inventory guard refused to start while spec 007 was running. Final `docker ps --format '{{.Names}} {{.Image}} {{.Status}}'` evidence in `/tmp/spec005-qa3/deferred-docker-ps.log` shows:

```text
qa007r2-portal-1    portal-007-web          Up 5 hours (healthy)
qa007r2-server-1    portal-007-server       Up 5 hours (healthy)
qa007r2-kong-1      kong:3.9               Up 5 hours (healthy)
qa007r2-postgres-1  postgres:17-alpine      Up 5 hours (healthy)
qa007r2-httpbin-1   mccutchen/go-httpbin:v2.15.0  Up 5 hours
qa007r2-mailpit-1   axllent/mailpit:v1.27.10       Up 5 hours (healthy)
jovial_panini      postgres:17-alpine      Up 6 hours (healthy)
```

The unrelated idle `jovial_panini` had been explicitly permitted, but the active `qa007r2` stack prevented a quiet benchmark. No unrelated containers, images, volumes or caches were removed.

**Third QA pass, 2026-11-08 (after merge `1127289`):** running on Node 26.13.0 with `NODE_OPTIONS=--no-experimental-webstorage` (Node 22 is not installed locally). Added executable expected-failure browser regressions for open minor bugs JSO-399, JSO-405 and JSO-406; these keep their desired-behavior assertions and report unexpected passes when fixed. The existing criterion-to-test map below is retained.

Completed lightweight checks: `pnpm lint` **7/7 tasks pass** and `pnpm typecheck` **12/12 tasks pass**. The uncached `pnpm test --force` attempt under concurrent host load completed **170 portal tests** and **2 migration tests**, but the Kong suite finished **43 pass / 12 fail** (timeouts, gateway connectivity and Docker HTTP 500); Turbo then terminated the server suite before a final result. This is a **failed full-suite attempt**, not a pass. The demo suite failed before running browser cases because its unchanged 300s webServer startup deadline expired. `/tmp/spec005-qa3/{lint,typecheck,test,demo,build}.log` retain the evidence. Host memory was 8 GiB with approximately 56 MiB free; concurrent worktree jobs were observed. The coordinator requested a heavy-work hold until spec 012 finishes, so the remaining QA build was stopped; the functional suites were subsequently rerun successfully, while independent cold timing was ultimately deferred as recorded above.

The first reserved-host `pnpm test --force` rerun passed **321/322 tests**; the direct-Kong repoint conformance case returned one **404 instead of 401** for the old key after the new key had returned 200. Its earlier requests already use bounded polling. The final old-key refusal and original-Kong success assertions now independently poll their required outcomes for at most 15s, rather than treating another request's result as their readiness check. No status expectation was weakened, no sleep was added, and the separate try-it test still asserts its first response without retry. This is recorded as a test flake; its cause is not established. The next unbounded rerun hit the existing 15s key-dialog test deadline (169/170 portal tests passed); evidence is `/tmp/spec005-qa3/test-serial-retry.log`. The complete rerun **passes all 322 tests** (95 server, 170 portal, 55 adapter, 2 database) using `NODE_OPTIONS=--no-experimental-webstorage pnpm test --force --concurrency=1 -- --maxWorkers=2`; all 12 tasks executed uncached in 156.03s. It keeps all assertions and timeouts unchanged. Evidence: `/tmp/spec005-qa3/test-bounded.log`. Evidence: `/tmp/spec005-qa3/test-serial.log`.

The live runtime packaging check passes: non-root UID 1000; server dist, seed OpenAPI and API contract; deployed database migration files; adapter import; and absence of TypeScript, Vitest, ESLint, tsx and Testcontainers from runtime resolution. Fresh setup from built images takes **18.5s**, followed by the full environment-admin/Kong/sample smoke. First-call/revoke and both Kong/server outage checks pass. Evidence: `/tmp/spec005-qa3/{runtime-smoke,outage}.log`. This cached figure is not a cold benchmark.

The first 47-case browser run completed all **18 spec 019 cases** and both **JSO-398** regressions successfully. Its two failures were test harness defects: the new JSO-405 alert locator excluded the warning symbol, and the reconcile smoke imported the former `/app/packages` and `/app/apps/server` layout. The corrected tests locate the alert semantically and import `@portal/db` plus the deployed `./dist` server modules. The corrected full run **passes all 47 cases in 4.7m**, including all 18 spec 019 cases, both JSO-398 regressions and three expected failures reproducing JSO-399/405/406. The separate intermittent try-it 404 did not recur in either complete browser run and remains open. Evidence: `/tmp/spec005-qa3/e2e-corrected.log`. Evidence: `/tmp/spec005-qa3/e2e.log`.

The passing 47-case browser result comprises **44 ordinary passes and 3 expected failures**. These desired-behavior assertions reproduce existing minor bugs; they are not represented as fixes and do not block UAT by severity. All three issues remain Backlog and received QA re-test comments.

| Open minor bug | Expected-failure test in `apps/portal/e2e/setup-gateways.test.ts` | Observed result |
| --- | --- | --- |
| JSO-399 | `reloading the saved gateway retains the sample choice` | After a successful save shows the sample choice, reload redirects away and the panel is missing |
| JSO-405 | `first-load gateway outage retains import source fields` | Gateway unavailable alert appears, but the OpenAPI source fields are absent on first load |
| JSO-406 | `gateway wizard has a single connection heading` | Both “Connect your Kong” and the redundant “Connect a Kong” heading appear |

The real upgrade rerun **passes in 37.1s** using the same coordinator-approved pre-005 baseline `f52870e857e74ec9705a4dca7f03797eec07e3eb`, an owned `s005qa3upgrade` project and unique `s005qa3upgrade-*` image tags. The existing key returns Kong 200 before and after replacement, the developer session survives, the admin bypasses setup and can edit the gateway, and the documented curl-container protected-route recipe returns right-token 200 / wrong-token 401. All upgrade containers, volumes and image tags were removed. The test now accepts optional project/image-prefix environment overrides, avoiding shared-image collisions. Evidence: `/tmp/spec005-qa3/{upgrade.py,upgrade.log}`.

Standalone demo browser suite **passes all 32 cases in 28.7s**, including spec 019 AC10 (no live access checks). Final `pnpm lint` (**7/7 tasks**) and `pnpm typecheck` (**12/12 tasks**) pass after the test changes. The only generated source-file change from the demo build was quote formatting in `next-env.d.ts`; it was restored. Test changes are committed as `7106ceb`; first evidence stage is `e7d6bc2`. Evidence: `/tmp/spec005-qa3/{demo-serial,lint-final,typecheck-final}.log`.

After all functional checks, the first reserved quiet benchmark was **not started**: the inventory guard found a new `qa007` server/portal/Kong/Postgres/httpbin/mailpit stack alongside the permitted unrelated idle `jovial_panini` container. None of those containers was touched. The coordinator was notified and later explicitly deferred independent timing; no contaminated result is substituted. Evidence: `/tmp/spec005-qa3/quiet-summary.log`. All owned live/upgrade projects and volumes and their application-image tags are cleaned up.

The first independent no-cache attempt (`s005qa3cold1`, unique images) began with an empty Docker container inventory, but another worktree started Testcontainers, Vitest, typecheck and a Docker build during it. Process paths identified `012-docs-versions-search-agents`; the build attempt was stopped and only the owned QA project was torn down. This contaminated attempt supplies **no valid cold timing** and does not establish a branch regression. Independent timing was subsequently deferred by the coordinator, as recorded above. Evidence: `/tmp/spec005-qa3/cold1.log`.

Re-attempting creation of the durable intermittent proxy Bug with parent JSO-234, state Backlog, label Bug and low priority still returned `linear_write_failed: Usage limit exceeded`. The coordinator confirmed the deferred issue is recorded on JSO-234 and authorized retaining the pending-key line; no finding was dropped.

QA re-test: **2026-11-08**, macOS/Node 26.13.0, real PostgreSQL 17 and Kong 3.9. Isolated projects: `spec005qaretest` (browser/smoke), `spec005qaupgrade` (real upgrade), and `spec005qacoldb2ef` (quiet cold timing). Application images use unique `spec005qa-base-*` and `spec005qa-branch-*` tags; creation times and IDs were checked before deployed tests. No other worktree's containers, images, volumes or caches were removed.

| Criterion | Automated coverage | Result |
| --- | --- | --- |
| 1 — empty install, redirects, signup gate, five-minute startup | `deploy/quickstart-smoke.mjs`; `apps/portal/e2e/setup-gateways.test.ts`; `apps/server/src/setup-gateways.test.ts` | Pass: final reverted-packaging fresh setup, redirects, signup refusal and empty Kong/catalog in **18.4s** with cached layers. Five-minute acceptance uses tech-lead ruling 2 and quiet unchanged-branch **103s / 126s** versus main **102s / 131s**; no additional cold benchmark required. Earlier independent QA cold attempts were deferred and the historical 372.45s did not reproduce |
| 2 — atomic first admin, session, skip, production token lifecycle | `apps/server/src/setup-gateways.test.ts`; `apps/server/src/startup.test.ts`; `apps/portal/components/setup-form.test.tsx`; `apps/portal/e2e/setup-gateways.test.ts` | API/component tests pass, including concurrent duplicate submissions and missing/wrong/expired token; browser checks pass |
| 3 — live connection, encrypted/redacted token, singleton, defaults and warning | `apps/server/src/setup-gateways.test.ts`; `apps/portal/components/gateway-form.test.tsx`; `apps/portal/e2e/setup-gateways.test.ts` | API/component tests pass; browser checks pass |
| 4 — unreachable/timeout, 401/403, non-Kong, DB-less, proxy, malformed URLs, failed saves preserve connection | `apps/server/src/setup-gateways.test.ts`; `packages/adapter-kong/src/connection.test.ts`; `packages/adapter-kong/src/conformance.test.ts`; `apps/portal/components/gateway-form.test.tsx` | Pass, including real DB-less Kong and fixed responses without token/body leakage |
| 5 — service/routes/key-auth discovery, import, working key, unavailable retry and disconnected/disabled states | `apps/portal/e2e/journeys.ts`; `apps/server/src/app.test.ts`; `apps/server/src/setup-gateways.test.ts`; `apps/portal/components/admin-apis.test.tsx` | API/component tests pass; full browser import journey passes |
| 6 — bundled sample opt-in/out and other-Kong refusal | `apps/server/src/setup-gateways.test.ts`; `apps/portal/e2e/setup-gateways.test.ts` | Server eligibility/refusal tests pass; browser first-call journey passes |
| 7(a) — preserve blank token, changed URL refusal without forwarding, explicit null | `apps/server/src/setup-gateways.test.ts`; `apps/portal/components/gateway-form.test.tsx` | Pass, including scheme/port/path changes and unreadable-token recovery |
| 7(b) — disable guards, no partial import/app/key/sample, revoke/reconcile, failed re-enable and restart | `apps/server/src/setup-gateways.test.ts`; `apps/server/src/background-job.test.ts`; `apps/portal/components/admin-apis.test.tsx`; `apps/portal/e2e/setup-gateways.test.ts` | API/component tests pass; revoke outage preserves active key for retry; browser traffic/docs checks pass |
| 7(c,d) — dependency counts; deletion preserves Kong objects, deny ACLs and traffic | `apps/server/src/setup-gateways.test.ts`; `packages/db/src/migrate.test.ts`; `apps/portal/e2e/setup-gateways.test.ts` | Server/database checks pass; real Kong snapshot/removal journey passes |
| 7(e) — repoint warning/confirmation/decline, two Kongs, reprovisioned new key | `apps/server/src/setup-gateways.test.ts`; `packages/adapter-kong/src/conformance.test.ts`; `apps/portal/components/gateways.test.tsx` | Pass: new key works on second Kong, old key stays on first; no keys copied |
| 8 — environment combinations in production, read-only management, upgrade preservation | `apps/server/src/setup-gateways.test.ts`; `apps/server/src/startup.test.ts`; `packages/db/src/migrate.test.ts`; `deploy/quickstart-smoke.mjs`; `tests/spec005-upgrade.test.ts` | Pass: production admin-only/Kong-only/both and environment handover; real pre-005 main-to-branch upgrade preserves admin, API, active key (Kong 200) and session, bypasses wizard, and permits gateway edits |
| 9 — all gateway endpoints reject signed-out/developer/expired session before outbound calls | `apps/server/src/setup-gateways.test.ts` | Pass (401/403, no adapter/candidate calls) |
| 10 — real protected-route recipe, allowlist, portal key 403, exact-tag cleanup | `packages/adapter-kong/src/conformance.test.ts`; `tests/spec005-upgrade.test.ts`; `docs/connect-kong.md` | Pass against real Kong, including executing the documented curl-container recipe. UI help/repoint/cleanup anchors match the committed guide; same-network and unsafe-default warnings checked |

Previous QA pass validation (historical; current totals are 322 unit/integration, 47 live browser and 32 demo cases above): `pnpm lint` (7 tasks), `pnpm typecheck` (12 tasks), `pnpm test` (**275 tests: 95 server, 123 portal, 55 Kong adapter, 2 database**), `pnpm test:e2e` (**26 cases**, 2.1m), and `pnpm test:e2e:demo` (**31 cases**) pass. Added real browser regressions for signing back in after skipping setup and an admin-only install (JSO-398), correct help links, inline-only 400 errors with preserved value/focus, and actionable loopback guidance. Missing permissions, expired sessions, malformed inputs, duplicate requests, gateway outages and failed mutations remain covered by the mapped suites. First-call/revoke smoke and both outage smoke cases pass.

The initial uncached full suite had two adapter timeouts during concurrent image builds (global key-auth request and DB-less container `/status` startup). After builds ended, all **55 adapter tests passed uncached** in 99.9s; the full command also passes. Test-authoring corrections: scoped the no-form-alert check to `main` to exclude Next's route announcer, and waited for completed sign-in before navigating in the upgrade test. Neither correction changes product assertions. The quiet no-cache branch run took **337.91s to build and 372.45s through fresh `/setup`**, with setup/health checks passing after the timing limit. The original 300s concurrent build timeout and the 20.1s prebuilt fresh-volume startup are separate results. The same baseline measurement completed in **239.67s to build and 280.20s to the seeded home**. At that earlier stage, the coordinator classified the result as a branch blocker and returned the spec to `building`. That decision is superseded by the accepted backend repeats and final QA decision above. These are one measurement per revision, and the underlying cause is not established.

**Quiet quickstart timing:** no containers were running before the run, and no other QA builds or suites ran concurrently. Docker: 8 CPUs, 4,106,539,008 bytes of memory. Both application images were rebuilt with `--no-cache`; Node base and Postgres/Kong/httpbin images remained cached (no shared cache/image deletion). One Python monotonic timer covered `docker compose -p spec005qacoldb2ef -f deploy/docker-compose.yml -f /tmp/spec005-branch-images.yml build --no-cache` followed by the unchanged fresh setup assertions from `deploy/quickstart-smoke.mjs`, with only unique image-name overrides and the environment-path second half omitted. That check performs fresh `up --build -d --wait`, setup redirect, empty catalog/gateway/Kong and signup refusal. Evidence: `/tmp/spec005-cold.log`, `/tmp/spec005-cold-result.json`, `/tmp/spec005-cold-before-containers.log` (empty), `/tmp/spec005-cold-host.log`. The baseline was then measured alone using `docker compose -p spec005qabasecoldb2ef -f /tmp/spec005-upgrade-base/deploy/docker-compose.yml -f /tmp/spec005-base-images.yml build --no-cache`, followed by its original `up --build -d --wait` and seeded-home assertions. Pre-005 main has no setup screen, so its equivalent ready endpoint is its seeded home page. Same resources, cached base/service images, fresh volumes and empty initial container inventory; baseline images use the separate `spec005qa-base-*` tags. Baseline evidence: `/tmp/spec005-base-cold.log`, `/tmp/spec005-base-cold-result.json` and `/tmp/spec005-base-cold-before-containers.log` (empty).

| Quiet cold phase (seconds) | Branch | Pre-005 main |
| --- | ---: | ---: |
| Node base metadata; base/service image downloads | 2.7; none | 1.1; none |
| pnpm fetch | 33.0 | 39.9 |
| Workspace offline install | 12.0 | 4.5 |
| Server production dependency install/relink | 179.8 | 66.7 |
| Next build (compile, types, page generation) | 177.0 | 128.9 |
| Server TypeScript build | 51.2 | 42.6 |
| Server runtime node_modules copy | 19.7 | 27.6 |
| Server image export | 34.4 | 41.3 |
| Portal image export | 7.9 | 5.4 |
| **Build wall time** | **337.91** | **239.67** |
| Fresh `up --build`, health and page checks | 34.54 | 40.53 |
| **Total to ready portal** | **372.45 — FAIL** | **280.20 — PASS** |

BuildKit stages overlap, so phase durations do not add to total wall time; snapshot/materialization and Compose overhead are included in wall time. Dockerfiles and dependency lockfile are identical across the revisions. The branch is 92.25s slower in this comparison; dependency relinking and Next build are the largest observed differences, not a proven diagnosis. Both environments’ functional assertions pass after startup. Filing the blocker also hit the workspace issue quota; the coordinator will add its key and the corresponding task key. No timing assertion was weakened. All QA projects/volumes and the four uniquely named application images are removed after testing; shared images/caches remain untouched.

**Actual deployed upgrade:** no remote tags or GitHub releases exist (`git ls-remote --tags origin` and `gh release list --repo zebrasoftwareservices-eng/api-portal --json tagName,name` both returned empty); there is no image publishing workflow or versioned local v0.2 image. The coordinator explicitly selected pre-005 `origin/main` **`f52870e857e74ec9705a4dca7f03797eec07e3eb`** as the intended baseline, since spec 005 is part of v0.2 itself. Commands run:

```sh
mkdir -p /tmp/spec005-upgrade-base
git archive origin/main | tar -x -C /tmp/spec005-upgrade-base
docker compose -p spec005qaupgrade -f /tmp/spec005-upgrade-base/deploy/docker-compose.yml -f /tmp/spec005-base-images.yml build
docker compose -p spec005qaretest -f deploy/docker-compose.yml -f /tmp/spec005-branch-images.yml build
SPEC005_BASELINE_DIR=/tmp/spec005-upgrade-base SPEC005_PREBUILT=1 pnpm exec playwright test --config tests/spec005-upgrade.playwright.config.ts
```

Each image override changes only the server/portal image names to `spec005qa-base-server`/`spec005qa-base-web` or `spec005qa-branch-server`/`spec005qa-branch-web`. The automated test runs baseline `up --no-build -d --wait` in project `spec005qaupgrade` with its original compose defaults (admin, gateway and seeded published sample), creates a developer/app/active key, and verifies Kong 200. It then runs this branch's compose file in **the same project with the same volume**, with `KONG_ADMIN_URL` unset, and verifies the same key still returns 200, the developer session survives, the admin sign-in bypasses setup, and a gateway PATCH changing its public proxy URL succeeds. It also executes the guide's actual recipe through `curlimages/curl:8.11.1` sharing Kong's network namespace: Kong has no curl, right token returns 200, wrong token returns 401. **All checks pass in 36.8s**; the test tears down only its own project/volume. This is a real upgrade of the coordinator-approved pre-005 main baseline, not a claimed versioned release deployment.

**Intermittent bug / Linear quota:** the first try-it request for a newly imported route returned **404 instead of 403** after direct Kong had already returned 403, once in **18 valid import/proxy cases** (once in **12 text/plain cases**: two complete suites plus ten clean targeted repetitions). The complete 26-case rerun and all ten targeted repetitions passed. **Same-route user retry is unverified**: the sole failure was torn down before retry diagnostics were added; subsequent fresh scenarios pass, which does not prove that retry repairs the original request. The test now records bounded retry recovery only after a failure and still fails its original first-request assertion. This recurs from the earlier unproven Kong worker-propagation explanation; neither worker propagation nor catalog refresh is established as the cause. Five initial repetition attempts hit the rate-limit bucket intentionally exhausted by the suite's final test and are excluded; restarting only this QA server restored the expected precondition.

Reproduction: run the fresh isolated Compose suite; in `apps/portal/e2e/journeys.ts` the Scalar text/plain case warms the proxy catalog, imports a real route, creates a sample-only app, waits for direct Kong 403, then requests that new route through try-it once. Expected 403, intermittent actual 404. Evidence: `/tmp/spec005-e2e.log` (first failure), `/tmp/spec005-e2e-retry.log` (26 pass), `/tmp/spec005-proxy-repeat-clean.log` and `/tmp/spec005-proxy-repeat-clean2.log` (ten pass), `/tmp/spec005-kong-retry.log`, `/tmp/spec005-upgrade-retry.log`, `/tmp/spec005-images.log`. Filing the minor Bug under JSO-234 failed with `linear_write_failed: Usage limit exceeded`; the coordinator authorized the pending-key line below and will file it after quota is freed. **This minor error-status recurrence does not block UAT**; it remains open and is not represented as fixed.

### Bugs
- [x] AC 6 read server logs before the asynchronous reconcile warning existed (minor test race; fourth QA pass uses a bounded 30s log poll, retains key/password redaction assertions, and passes the live case in 12.0s).
- [x] Direct-Kong repoint test checked final key outcomes before independently waiting for them (minor test flake; bounded readiness assertions pass).
- [x] Browser reconcile smoke imported the old pre-deploy server layout (minor test harness defect; corrected full browser suite passes).
- [x] JSO-451 Quiet cold Compose quickstart regression (blocker; verified using backend quiet uncached 127.99s / 144.34s and passing QA runtime checks; independent QA benchmarks explicitly deferred).
- [ ] (Linear issue pending: workspace quota) Newly imported route intermittently returns 404 through try-it after direct Kong is ready (minor). Browser retest on 2026-11-08 returned the correct 403 on its first request (`25`); one pass does not establish a fix. Filing retried on 2026-11-08 and again refused with `linear_write_failed: Usage limit exceeded`; intended Bug / low priority / parent JSO-234, details in the retest report.
<!-- One line per bug, each with its Linear issue: - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [x] JSO-380 Try-it retained saved proxy URLs for 30 seconds (verified by immediate saved-URL regression, Done).
- [x] JSO-379 Portal component tests use Node storage globals instead of jsdom on Node 25+ (110 component tests pass on Node 26, Done).
- [x] JSO-366 Unreadable stored-token recovery (safe 503 and replacement/removal regression passes, Done).
- [x] JSO-381 Gateway help links point to a nonexistent Kong Admin API guide (minor).
- [x] JSO-398 Admin with no gateway lands on the dashboard after sign-in, not the wizard (major)
- [x] [frontend] Fix JSO-398: send an admin with no gateway and no `next` to `/setup/gateway` after sign-in, including on an admin-only install (major)
- [x] [frontend] Fix JSO-381: gateway help links point to `docs/connect-kong.md` and sections that exist (minor)
- [x] [frontend] Fix JSO-400: a 400 with field errors shows only the field errors, and no raw problem title reaches the user, including in the Revoke dialog (minor)
- [x] [frontend] Fix JSO-401: the repoint dialog pluralises the key count, and the Test warning shows `affectedKeys` with the design §5.3 wording (minor)
- [x] [frontend] Fix JSO-402: the localhost field error reads "Use an address the portal server can reach.", per design §5.2 (minor)
- [ ] JSO-399 Reloading `/setup/gateway` after saving loses the sample choice (minor): reproduced 2026-11-08, retest screenshot `05`
- [x] JSO-400 Raw problem titles shown to users: "validation", "gateway unavailable" (minor)
- [x] JSO-401 "1 active keys" in the repoint dialog, and the Test warning has no count (minor)
- [x] JSO-402 localhost failure message does not say what to enter instead (minor)
- [x] JSO-403 Setup token hint does not match the log line (minor)
- [x] JSO-404 Protected-route recipe needs `curl`, which the Kong image lacks (minor)
- [ ] JSO-405 Import form disappears on first load when Kong is down (minor): reproduced 2026-11-08, retest screenshot `14`; retry recovers
- [ ] JSO-406 Redundant "Connect a Kong" heading on the wizard gateway step (minor): reproduced 2026-11-08, retest screenshot `02`

## User testing  _(user-tester)_

### Final smoke — 2026-11-09

**Result: review; no open blocker or major.** Narrow post-revert browser smoke on `2b88c0f` passed with newly built branch images, fresh volumes and real Kong 3.9.4. First admin → Test/Save → explicit sample opt-in → service discovery/import → developer signup/app/key → direct Kong and browser try-it **200**, plus Disable/Enable and fresh admin-only sign-in → gateway wizard all passed. The guide link points to `docs/connect-kong.md`; protected-route and full acceptance coverage remain in the preceding full retest.

All seven story results and nine screenshots are recorded in [the final smoke report](../uat/005/final-2026-11-09/README.md). No new problem was found; existing minor bugs remain open without claiming fixes (JSO-406 duplicate headings still observed). This was the coordinator-requested narrow smoke, not another full mobile/keyboard/error matrix or cold-build benchmark. Only the owned `spec005final` resources and uniquely named application images were created and removed.

### Current retest — 2026-11-08

**Result: ready for code review; no open blocker or major.** All seven stories were re-walked in Orca's built-in browser against freshly built branch images and real Kong 3.9.4. Evidence and exact limits: [`docs/uat/005/retest-2026-11-08/README.md`](../uat/005/retest-2026-11-08/README.md). Screenshot names below are relative to that directory.

| User story | Current result | Evidence |
| --- | --- | --- |
| Fresh install creates the first admin | **Pass.** Default install needs no token; empty form validates, admin reaches gateway step. Production requires a token; missing/wrong/old tokens fail, restart rotates it, current token succeeds, replay gets 409 and exactly one admin exists | `01`, `30`–`33` |
| Test a connection before saving | **Pass.** Bundled defaults and Kong version; Test explicitly says nothing is saved. Localhost guidance, malformed URL, non-Kong, DB-less, wrong protected token and unreachable proxy errors checked in the browser | `02`–`04`, `15`–`21` |
| Edit, disable and remove a connection | **Pass.** Empty removal works; dependent removal names 2 APIs/1 key. Disable pauses imports, existing keys still return 200, failed re-enable stays disabled, recovery works. Stored token is preserved when blank, changed URL requires a new decision, explicit no-token removes it. Missing-key warning/confirmation/decline and confirmed repoint to a second Kong work | `06`, `12`–`13`, `17`, `22`–`24`, `m04`–`m05`, `m07`–`m08` |
| Discover services and import | **Pass with existing minor JSO-405.** Both routes and key-auth shown, uploaded document publishes, developer signup/app/key succeed, direct Kong and browser try-it return 200. Outage retry restores service list. Fresh first-load outage still hides the form | `07`–`10`, `14` |
| Sample API is optional | **Pass with existing minor JSO-399.** Both opt-in and keyboard-only decline walked; sample key returns 200. Declining leaves catalog and Kong services empty. Reload after Save still loses the choice | `05`, `27`, `m01`–`m03`, `m06` |
| Environment configuration stays declarative | **Pass. JSO-398 verified fixed.** Admin-only sign-in reaches the missing gateway wizard. Both variables in production bypass setup, seed sample on request and show a read-only card. Kong-only production asks for admin only. Unsetting Kong variables preserves the connection and makes it editable | `26`, `28`–`33`, `m07` |
| Safe Admin API documentation | **Pass.** Documented separate curl-container recipe executed on real Kong. UI Test rejects wrong token and passes correct token; direct checks: right 200, wrong 401, portal key 403, outside allowlist 403 | `15`–`16`; retest README |

Existing minors **JSO-399, JSO-405 and JSO-406 remain open** and reproduced. The intermittent try-it 404 did not reproduce in one matching newly imported/ungranted-key browser attempt (direct and first try-it both 403); it remains open and quota-blocked. No new product bug was found. JSO-400/401/402 copy fixes were observed, including actionable localhost guidance and singular missing-key wording.

Mobile functional wizard/save/sample and keyboard-only Save → decline passed at 390×844; the scale-3 screenshot capture repeats/crops pixels (as in historical UAT), so readable supplemental card/editor captures use scale 1. Desktop setup and environment card were checked at 1280×900; navigation resets Orca's viewport, so other desktop journeys used its native 666px width. Empty form, wrong password, refresh mid-flow, Escape from dialogs, developer denial and database-expired session → sign-in were exercised. Console checks showed only Scalar info messages; network failures matched intentional 401/403/409/422/503 cases. This retest does not claim a complete independent repeat of QA's concurrent-submission, encryption-at-rest, reconcile, actual baseline upgrade, tag cleanup or all timeout variants; their current automated QA evidence above and the prior UAT evidence below remain the coverage for those branches.

Serial image builds plus fresh-volume `up --no-build -d --wait` took **78.36 + 26.84 + 43.36 = 148.56 seconds** of command time, including base/service downloads where needed. These were normal cached-mode builds, not a new no-cache benchmark; admin-only fresh startup later took 12.50 seconds. Only the owned `spec005uat` project/volumes and uniquely named images were used and removed after testing.

### Historical first UAT — 2026-11-07

The results below predate the fixes and are retained as history; the current decision is the retest above.

Run on 2026-11-07 in Orca's built-in browser, against this branch's images and real Kong 3.9.4. Screenshots are in `docs/uat/005/`.

| User story | Result | Screenshot |
| --- | --- | --- |
| Fresh install walks me through creating the first admin | **Pass.** Every page goes to `/setup`, sign-up is refused, Kong is empty, and a second admin gets 409. Production token: wrong, missing, old and post-admin tokens are refused, and each start gives a new one | `01`, `02`, `03`, `51`, `52` |
| Test a Kong connection before saving it | **Pass.** Every criterion 4 case shows its message on real targets, including DB-less and a protected route, and Save refuses too. A passed Test says nothing is saved, and editing a field clears it. Copy issues: JSO-400, JSO-402 | `05`, `06`, `07`, `37`, `38`, `42` |
| Edit, disable and remove a connection from the admin screens | **Pass.** 7(a) to 7(e) all walked with a second, protected Kong. The token never appears in a response, log or the page after saving. Copy issue: JSO-401 | `16`, `17`, `23`, `27`–`34`, `39`–`44`, `46`, `48`, `49` |
| Pick from Kong's services when importing | **Pass.** Routes and key-auth are shown, the key returns 200 through Kong and in try-it, and retry keeps entries through an outage. First-load difference: JSO-405 | `09`, `24`, `25`, `26`, `35`, `36`, `50` |
| The sample API is my choice | **Pass.** Declining leaves the catalog and Kong empty, and opting in publishes it with a working key. A reload loses the choice: JSO-399 | `10`, `11`, `12`, `15`, `18`, `19`, `22` |
| Environment variables keep working, with no wizard | **Fail.** Admin, Kong and sample variables in production pass, with a read-only card and 409 refusals, and Kong-only passes. **Admin-only fails:** the admin lands on the dashboard and never sees the wizard (JSO-398, major) | `54`, `55`, `56`, `57`, `13` |
| A documented safe way to reach the Kong Admin API | **Pass with minor issues.** Recipe results: right token 200, wrong 401, outside the allowlist 403, portal key 403, hidden from discovery. Cleanup removes only tagged objects and traffic is unchanged. The UI links to the guide are dead (JSO-381), and the recipe needs `curl`, which the Kong image lacks (JSO-404) | `45` |

Other journeys: at 390×844 the wizard, card, dialog and import have no sideways scroll, and form buttons are 44px (`m01`–`m08`). The wizard works with Tab, Enter and Escape only, in the designed order, and focus returns to the trigger after a dialog (`53`). Wrong password, empty forms, a double-clicked Save (one POST), back button and an expired session (sent to sign-in) all behave. Developers get 404 on admin pages and 403 from the gateway API, and signed-out callers get 401. The console stayed clean, and the only failed requests were the expected refusals.

Notes:
- **Speed:** `up --wait` took 139 s with a build, mostly cached, and 13 s from built images. That cached build isn't a first-time figure; QA's clean build reached `/setup` in 220.2 s. Flow A at 390px took 25 s of scripted actions, so it isn't a human reading time.
- **Flow A judgement:** a passed Test isn't mistaken for a save, because the alert says so and the form stays. The "What saving changes" notice stays visible above the buttons, so it's easy to read, though at 390px it's several screens of text before Save.
- **Not walked:** a real v0.2 upgrade, which QA also covered only at the migration and startup layers. The desktop runs used Orca's 805px-wide browser, not 1280px, so the 1280px layout wasn't checked.
- **How it was run:** each run used its own compose project (`-p spec005uat…`), because the default `portal` project held another worktree's containers. Another worktree replaced the shared `portal-server` image during testing, which caused a false crash. Runs after that used `--build`. Follow-up: JSO-407.
- **Evidence:** the second half of the mobile screenshots repeats the first because of how the tool captures them, not the page. API keys are masked in screenshots.

## Review  _(tech-lead)_

**Re-review, 2026-11-08: `approved`, no blocking findings.** Scope was B1 plus everything changed since the
first review (`ded8ab9..HEAD`). Outside `docs/`, only the eight B1 files changed.
- **B1 resolved.** `git diff origin/main...HEAD` is empty for `apps/server/Dockerfile`, `pnpm-workspace.yaml`,
  `pnpm-lock.yaml` and the `package.json` of `apps/server`, `packages/db`, `packages/adapter-sdk` and
  `packages/adapter-kong`. `injectWorkspacePackages` and `syncInjectedDepsAfterScripts` are gone, and so are the
  `files` lists. `origin/main` is 0 commits ahead.
- **Reconcile smoke** (`apps/portal/e2e/gateway.ts:254-257`) imports main's `./packages/db/dist` and
  `./apps/server/dist` layout again. The new bounded poll at `gateway.ts:230-239` waits up to 30 s for the
  asynchronous `gateway unavailable` warning. It drops no assertion: the key and password are still checked
  against the final log snapshot. This matches the race diagnosed in Build notes. QA passed the live AC 6 case
  (12.0 s) and the fresh-install smoke, and UAT's final smoke passed on `2b88c0f`.
- **Local checks on `e3660d2`:** `pnpm lint` 7/7, `pnpm typecheck` 12/12 and `pnpm test` 12/12 tasks pass
  (95 server and 170 portal tests, plus the Kong adapter and database suites).
- **Still conditional (ruling 3):** the intermittent try-it 404 bug must be filed in Linear (Bug, low priority,
  parent JSO-234) once quota allows. It doesn't block merge. Ruling 2's gate still applies: if CI's
  `compose-smoke` fresh-install step goes over 5 minutes, hold the merge.
- **Suggestions S1–S5 below stand.** None is blocking.
- **Deferred follow-ups (Linear quota):** S1 (pin the SSRF-checked address against DNS rebinding) and S4 (Kong
  adapter `request`/`pages` follow redirects with `Kong-Admin-Token`) are out-of-scope follow-ups. Creating
  them on 2026-11-08 was refused with `Usage limit exceeded`. When capacity returns, file each as a Backlog
  issue with no parent, label Code Review and low priority, using the text of S1 and S4 below.

**Review, 2026-11-08: `building`, 1 blocking finding.** Reviewed `git diff origin/main...HEAD` (origin/main is 0 commits ahead). Local checks pass: `pnpm lint` 7/7 tasks, `pnpm typecheck` 12/12 tasks, and `pnpm test` with **322 tests** (95 server, 170 portal, 55 Kong adapter with real Kong, 2 database). The feature code follows the design. All ten criteria are implemented and mapped to passing tests (Test report). Errors are problem+json with fixed `detail` strings. Tokens are encrypted, never returned and covered by the redact paths. The 7(a) token rule, the SSRF block and the exclusive and shared advisory locks match the design. The only blocking finding is the packaging change, which wasn't part of the feature.

### Blocking
- **B1. Revert the JSO-451 packaging change (`b56d03d`).** `apps/server/Dockerfile:7-22`, `pnpm-workspace.yaml:5-8`, `pnpm-lock.yaml:6`, and the `files` lists in `apps/server/package.json:35-39`, `packages/db/package.json`, `packages/adapter-sdk/package.json` and `packages/adapter-kong/package.json`. It was meant to fix a 372s cold build that never reproduced, and it didn't make the build faster: 128s/144s, against 103s/126s for the unchanged branch and 102s/131s for main in the same quiet conditions. Its gains (one `COPY`, a slightly tidier runtime tree) are real but small and weren't measured. Main's Dockerfile already ships production-only dependencies. The cost reaches beyond Docker. `injectWorkspacePackages: true` is workspace-wide, so after a fresh `pnpm install` every workspace dependency is a hard-linked copy instead of a symlink. `apps/portal` consumes `@portal/ui` straight from source (`exports: ./src/index.tsx`, `transpilePackages`). Edits to `packages/ui` or `packages/sdk` that an editor saves by atomic rename, and any new file, won't reach the portal until a `build` script or a reinstall runs. That breaks the `pnpm dev` loop for frontend contributors. (This worktree still has symlinks only because it was installed before the setting.) It isn't clearly better, and it adds risk unrelated to spec 005, so it goes. QA's reconcile-smoke import change in `7106ceb` (`apps/portal/e2e/gateway.ts:246-249`) depends on the new layout and must be reverted with it. Fix task added. If image size or install speed matters later, raise it as its own change with measurements.

### Suggestions (not blocking)
- **S1.** `apps/server/src/gateway-connection.ts:122-143`: the SSRF check resolves the name, then the adapter's `fetch` resolves it again, so a DNS-rebinding name could pass the check and still reach `169.254.169.254`. This is within ADR 0006's accepted risk (admins only, rate-limited, no bodies shown). A future hardening is to pin the checked address with an undici `Agent` `connect.lookup`.
- **S2.** `apps/server/src/import.ts:271-275`: `getService` runs on the adapter loaded before the shared lock. If a repoint commits between that call and the re-read under the lock (`import.ts:318`), `protectService` runs on the new Kong with the old Kong's service ID. It fails with a gateway error and leaves nothing partial, so this is only a confusing message. Re-read the service after the re-load, or refuse when `gateway.id` or `adminUrl` changed.
- **S3.** `apps/server/src/startup.ts:29-47`: when `KONG_ADMIN_URL` re-enables a gateway an admin had disabled, or points it at a different Kong, nothing is logged. One `info` line ("environment re-enabled/repointed the gateway") would help operators understand the change. See ruling 4.
- **S4.** `packages/adapter-kong/src/index.ts` `request`/`pages` (existing code) follow redirects with `Kong-Admin-Token` attached, unlike `checkConnection` (`redirect: 'manual'`). Only a host the admin entered the token for can trigger this, because 7(a) never sends a stored token to a changed URL. Use `redirect: 'manual'` there too when the adapter is next touched (spec 017).
- **S5.** The open minor bugs JSO-399, JSO-405 and JSO-406 are tracked in Backlog with expected-failure e2e tests, and none of them blocks merge.

### Rulings requested by the coordinator
1. **Server packaging change (`b56d03d`, JSO-451): revert.** See B1. Keeping it would need a clear gain in speed, size or correctness, and none was shown. Its workspace-wide pnpm setting changes how every contributor's install links packages. Reverting returns to the Dockerfile that has the best quiet-timing evidence (103s/126s on this branch before the change). The JSO-451 checkbox stays done: the regression is resolved as not reproduced, and this change wasn't needed for that.
2. **Quickstart timing: acceptable for merge, and no extra timing run is needed before the PR.** After the revert, the server image is the same as main's. Four quiet alternating runs (branch 103s/126s, main 102s/131s) show no regression and leave over 170s of margin under 300s. The 372s figure never reproduced in any later quiet run. The PR's CI `compose-smoke` job and `deploy/quickstart-smoke.mjs` (fresh install to `/setup`) remain the gate. If CI's fresh-install step goes over 5 minutes, block the merge and rerun a quiet benchmark then.
3. **Intermittent try-it 404 (1 in 18, deferred): acceptable as a post-merge follow-up, provided its Linear issue gets filed.** Try-it no longer caches the catalog (`apps/server/src/proxy.ts:99-101`), so the 404 comes from Kong, not the portal. The likely cause is Kong's eventually consistent router rebuild: the e2e test creates the route seconds before importing it. Real admins import routes that already exist, and the bundled sample's route is created well before a developer gets through sign-up, app creation and a key. It didn't recur in two full browser runs or the UAT retest. The follow-up should map Kong's `no Route matched` 404 on try-it to a message that says the gateway may still be applying the route, and confirm the cause with `worker_state_update_frequency`. The issue is still blocked by the Linear quota. File it (Bug, low priority, parent JSO-234) as soon as capacity returns.
4. **`KONG_ADMIN_URL` re-enables an admin-disabled gateway without the connection checks: no safety problem.** Server environment access is more trusted than the admin UI. The environment path is declarative by design (criterion 8), and an unreachable environment Kong still shows up in health, reconcile logs and gateway errors. It also skips the SSRF block and the 7(e) warning, and that's acceptable for operator-controlled configuration. S3 suggests a log line.

**Re-review scope:** only B1. Confirm the Dockerfile, workspace settings and lockfile match main, the `files` lists are gone, the reconcile smoke imports the main layout, and `pnpm test` plus the fresh-install smoke pass.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [x] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
