---
id: 005
title: First-run setup and gateway connections
status: designed   # draft → ready → designed → building → testing → uat → review → approved → done
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
- **Setup token with several server replicas.** Spec 016 owns this. The follow-up is still to be filed in Linear.
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

**Four things Elango may want to look at:**
- **A gateway with a published API can't be removed.** The portal has no way to unpublish an API, so 7(c) always refuses once one exists, including the sample. Follow-up: JSO-310.
- **Pointing at a new Kong doesn't move published APIs.** They keep the old Kong's service IDs, and reconcile logs `service-missing`. Criterion 7(e) only asks for a warning about keys, and says none may appear when there are no active keys, so the warning follows that exactly. The docs page must say this. Follow-up: JSO-310.
- **One addition to the spec: "this Kong needs no token".** `adminToken: null` removes a stored token. Without it, moving from a protected Kong to an open one would mean typing a junk token, because a blank token is refused when the URL changes. A blank field still behaves as 7(a) says, and the stored token is never sent.
- **Re-enabling runs the checks.** The spec doesn't say; a disabled connection to a dead Kong stays disabled until Kong answers.

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
| `apps/server/src/startup.ts` | Environment sync, optional bootstrap, token, jobs load the gateway when they run | AC 1, 2, 8 |
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
| `PATCH /v1/admin/gateways/{id}` | 200 `Gateway` | 400, 401, 403, 404; 409 `gateway-env-managed`, `gateway-keys-missing`; 422 checks; 429 |
| `DELETE /v1/admin/gateways/{id}` | 204 | 401, 403, 404; 409 `gateway-env-managed`, `gateway-in-use` (with `apis`, `activeKeys`) |
| `POST /v1/admin/gateways/{id}/sample` | 201 `ApiDetail` | 401, 403, 404; 409 `sample-not-available`; 502, 503 |

Changes to existing operations:
- `GET /v1/health`: `gateway` may be null, and the status stays 200.
- `GET /v1/admin/gateway/services`, `POST /v1/admin/apis`, `POST /v1/apps/{id}/credentials`: 409 `gateway-not-connected`.
- `POST /v1/apps`, `POST /v1/apps/{id}/credentials`: 409 `gateway-disabled`, before any Kong write.
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
→ SEED_SAMPLE and a gateway exists? seed (with no gateway: log a warning and skip)
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
- **Disable:** app and key creation check `enabled` before any Kong write. Revoke, reconcile, import, discovery, the catalog and try-it ignore it (7(b)).
- **Reconcile:** loads the gateway after it holds the lock, and returns at once if none exists. When Kong can't be reached it logs through the existing `backgroundJob` path.
- **`createCredential`:** adds `ensureConsumer` and `grantAccess` for the app's subscribed services before `issueCredential`, and upserts `gateway_consumers`. Without this, a new key on an existing app gets a 502 after repointing, because Kong has no such consumer. Both calls are idempotent. It uses the existing shared lock and compensation.
- **`createFirstAdmin`:** under `pg_advisory_xact_lock(71833003)`: if an admin exists, 409; check the token in constant time on SHA-256 digests; insert `user` with `role = 'admin'` and `account` with `providerId = 'credential'`, `accountId = user.id` and `password = await (await auth.$context).password.hash(...)`. After the commit, call `auth.api.signInEmail` with `returnHeaders: true` and copy `set-cookie`. If that sign-in fails, return 201 without a cookie; the portal sends them to `/sign-in`. If a user who predates this spec already has that email, the response is 400 `validation` on `/email`.
- **Sample:** `seedSample` takes the loaded adapter, unchanged otherwise. `sampleAvailable` is `adminUrl === hint` and no API has slug `sample`, so it can't overwrite an API an admin published under that slug. It queues a reconcile afterwards.
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
| App delete doesn't exist (7(b)) | That part can't be tested in this spec. Follow-up: JSO-311. |

### Tasks
- [ ] [backend] JSO-312 `packages/db`: migration and schema for `managed_by`, `enabled`, the singleton index and the changed foreign keys, with an upgrade test from a v0.2 row and revoked credentials.
- [ ] [backend] JSO-313 Regenerate `packages/sdk` from the updated `openapi.yaml` first, because CI's check job fails until it matches.
- [ ] [backend] JSO-314 `config.ts`: optional admin and `KONG_ADMIN_URL`, empty string means unset, `SEED_SAMPLE` defaults to false, `PORTAL_BUNDLED_KONG_ADMIN_URL`, and a clear failure when only one admin variable is set.
- [ ] [backend] JSO-315 `adapter-sdk` and `adapter-kong`: `checkConnection` and `checkProxy` per the design, `portal-internal` filter in `listServices`, and conformance cases.
- [ ] [backend] JSO-317 `gateway-connection.ts`: `loadGateway` with `adapterFor`, `requireGateway`, `requireEnabled`, URL normalising, the SSRF check with `BlockList`, and the shared checks with the AC 4 message map.
- [ ] [backend] JSO-318 Move `app.ts`, `apps.ts`, `import.ts`, `proxy.ts`, `reconcile.ts`, `seed.ts` and health to the per-request gateway, including null health, `gateway-not-connected`, `gateway-disabled`, and an undecryptable token acting as unavailable.
- [ ] [backend] JSO-319 `createCredential`: ensure the consumer and grant access before issuing, and upsert `gateway_consumers`, so a new key works after repointing.
- [ ] [backend] JSO-320 `gateways.ts`: list, create, test, update and delete, with the exclusive lock, env-managed refusals, 7(a) token rules, 7(e) missing-key count and confirmation, 7(c) counts, and a queued reconcile after each save.
- [ ] [backend] JSO-321 `POST /v1/admin/gateways/{id}/sample` and `sampleAvailable`, so the sample is refused on any Kong but the bundled one and can't overwrite an API with slug `sample`.
- [ ] [backend] JSO-322 `setup.ts` and `auth.ts`: `GET /v1/setup`, `POST /v1/setup/admin` with direct atomic insert and sign-in cookie, setup token check, rate limit, and the `user.create.before` hook.
- [ ] [backend] JSO-323 `startup.ts`: environment sync and `managed_by` handover, shared `createFirstAdmin`, setup token log line and redact paths, jobs that load the gateway when they run, and seeding only when a gateway exists.
- [ ] [backend] JSO-324 `problem.ts`: new problem types, titles and the `apis`, `activeKeys` and `affectedKeys` fields.
- [ ] [backend] JSO-325 `deploy/docker-compose.yml`, `deploy/.env.example` and README: no default admin or gateway, the bundled hint, and the new quickstart steps.
- [ ] [backend] JSO-326 New docs page on reaching the Kong Admin API: same-network option, the protected-route recipe, the warning not to expose the default compose file, tag-based cleanup including the `hide_credentials` caveat, and what repointing does and doesn't move.
- [ ] [backend] JSO-327 Update `apps/server/src/*.test.ts` and `deploy/*.mjs` for the new options, and run the existing suites on the environment path so they keep their seeded sample.
- [ ] [frontend] JSO-328 `middleware.ts`: send every page to `/setup` until an admin exists, cache the answer once false, pass public pages through when the server is down, and keep demo builds unaffected.
- [ ] [frontend] JSO-329 `/setup`: first admin form, the setup token field when `setupTokenRequired`, refusal messages, and sign-in on success.
- [ ] [frontend] `/setup/gateway` and post-sign-in landing: pre-filled bundled values, Test, what the portal will change in this Kong, skip, and the sample opt-in only when `sampleAvailable`.
- [ ] [frontend] `/admin/gateways` and nav: add, edit, disable, re-enable and remove; read-only state when `managedBy` is `env`; blank token keeps the stored one; a "this Kong needs no token" option.
- [ ] [frontend] Show every AC 4 message at the right field, the 7(a) re-enter-token message, the 7(e) warning with explicit confirmation and decline, and the 7(c) counts.
- [ ] [frontend] Import screen: `gateway-not-connected` links to Admin → Gateways, and `gateway-unavailable` shows a retry that loses nothing. Handle `gateway: null` wherever health is read. Handle `gateway-disabled` on Create app and New key.
- [ ] [qa] AC 1, 2: fresh compose with no settings reaches `/setup` within 5 minutes, sign-up refused, no Kong objects; simultaneous submissions; production token right, wrong, missing and after an admin exists; a new token on each start.
- [ ] [qa] AC 3, 4, 9: real Kong connect without restart, token encrypted and absent from responses and logs, second add refused; every failure case including real DB-less Kong; signed-out and developer callers get 401 or 403 with no outbound request.
- [ ] [qa] AC 5, 6: pick a discovered service, import, and a developer's key returns 200; Kong down and no gateway states; sample opt-in, opt-out and non-bundled Kong.
- [ ] [qa] AC 7: every path (a) to (e) on real Kongs, including two Kongs for (e), and removal leaving `deny` ACLs and traffic unchanged. Mark the app delete part of (b) as blocked by JSO-311.
- [ ] [qa] AC 8: full, admin-only and Kong-only environment variables, with `NODE_ENV=production`; env-managed refusals; a v0.2 upgrade using the new compose file keeps every key working and the gateway becomes editable.
- [ ] [qa] AC 10: follow the docs page on a real Kong: right and wrong token, outside the allowlist, portal key 403, and tag-based cleanup leaving untagged objects untouched.
- [ ] [qa] CI: fresh-install path first, then environment path for the existing smoke and e2e suites, and confirm the demo smoke is unaffected.

## UX  _(ui-designer)_
Summary + link to `docs/design/005-*.md`

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
