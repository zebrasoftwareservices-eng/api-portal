---
id: 005
title: First-run setup and gateway connections
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
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

5. **Given** a connected gateway **When** the admin starts an import **Then** they pick from the
   services Kong reports, each showing its routes and whether it has key-auth, and supply an OpenAPI
   file or URL. **Then** the API is published, and a developer who creates an app for it gets a key
   that returns 200 through Kong. **If** Kong is unreachable when services are listed, **then** they
   see the "gateway unavailable" message with a retry, and nothing is lost. **If** no gateway is
   connected, **then** they're pointed to Admin → Gateways.
6. **Given** the engineer connected the bundled Kong in the wizard **When** they opt in to the sample
   API **Then** it's published and a developer's key returns 200 on it. **When** they don't opt in
   **Then** the catalog stays empty and Kong has no sample objects. **Given** any other Kong **Then**
   the sample isn't offered, because its upstream exists only in the bundled compose network.
7. **Given** a gateway saved from the admin screens **When** the admin: (a) edits it and leaves the token
   blank, **Then** with the Admin API URL unchanged, the stored token is kept and the checks in criterion 4
   apply. With the URL changed and a token stored, Test and save are refused with a message to enter the
   token again, and the stored token is never sent to the new host; (b) disables it, **Then** creating a new
   app or key on its APIs shows a clear error and leaves nothing partial. Nothing else is blocked: key revoke,
   app delete and the reconcile job keep running, existing keys keep working through Kong and the docs stay
   published. If Kong can't be reached, revoke and delete show a clear error, and the reconcile job logs one;
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
  new host (criterion 7(a)). — Elango, 2026-11-07.
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
- [x] **Does disabling mean what criterion 7(b) says?** Decided: yes. Disable blocks only new apps and new
  keys. Key revoke, app delete and the reconcile job keep running, and show a clear error if Kong can't be
  reached. Existing keys keep working through Kong and docs stay published. Revoking access would mean
  deleting keys that can't be recreated. — Elango, 2026-11-07.
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
- **App delete doesn't exist yet.** Criterion 7(b) names it, but neither `main` nor spec 004's branch has an app
  delete operation, and this spec doesn't add one. That part of the criterion can't be tested until one exists.
- **Quickstart.** The default compose file changes, so CI smoke and e2e tests that rely on the seeded admin and
  sample API must change in the same pull request. Spec 006 relies on criterion 8.
- **If this won't fit one pull request:** ship criteria 1–6, 9 and 10 plus environment variables first, because
  they meet the issue's "Done when". Move edit, disable and remove (criterion 7) to a second pull request, along
  with criterion 10's tag-based cleanup docs.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

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
