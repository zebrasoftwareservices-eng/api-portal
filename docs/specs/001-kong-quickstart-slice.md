---
id: 001
title: Kong quickstart — first vertical slice
status: ready   # draft → ready → designed → building → testing → review → approved → done
owner: product-manager
created: 2026-11-02
linear: JSO-117
linear_stages: requirements=JSO-118 design=JSO-119 ux=JSO-120 backend=JSO-121 frontend=JSO-122 test=JSO-123 review=JSO-124 release=JSO-125 uat=JSO-126
---

# 001 — Kong quickstart: from OpenAPI spec to a working API key

## Summary
A platform engineer runs one command and gets a portal where a developer can read API docs,
sign up, create an app, receive a Kong API key, and make a successful call from the browser.

## Problem
Kong Gateway OSS has no self-serve developer portal. Teams hand out keys manually through
the Admin API or build their own portal. This slice proves the whole loop end to end and
becomes the project's demo and quickstart.

## Users
Platform engineer (installs and publishes), API consumer (developer who signs up and calls the API).

## User stories
- As a platform engineer, I want to start the portal and a Kong gateway with one command,
  so that I can evaluate the project in minutes.
- As a platform engineer, I want to import an OpenAPI spec and link it to a Kong service,
  so that its docs appear in the portal.
- As a developer, I want to sign up, create an app and get an API key,
  so that I can call the API without emailing anyone.
- As a developer, I want to try a request from the docs page with my key,
  so that I know my key works before writing code.

## Acceptance criteria
1. **Given** Docker is installed **When** the engineer runs `docker compose -f deploy/docker-compose.yml up`
   **Then** the portal, server, Postgres and Kong start, and the portal home page loads at
   `http://localhost:3000` within 5 minutes on a typical laptop.
2. **Given** the quickstart is running **When** it starts for the first time
   **Then** a sample API (OpenAPI 3.x spec plus a matching Kong service and route with the
   key-auth plugin) is seeded and published.
3. **Given** an admin is signed in **When** they import an OpenAPI 3.x file or URL and link it to a
   Kong service **Then** the API reference appears in the public catalog.
4. **Given** an invalid OpenAPI file **When** the admin imports it **Then** the import is rejected
   with a message naming the first validation error, and nothing is published.
5. **Given** a visitor **When** they sign up with email and password **Then** they reach their
   developer dashboard signed in.
6. **Given** a signed-in developer **When** they create an app and subscribe it to the sample API
   **Then** a Kong consumer and key-auth credential are created, tagged with the portal app ID,
   and the key is shown once with a copy button.
7. **Given** a developer with a key **When** they use the try-it console on an operation
   **Then** the request goes through Kong and the response is shown; without a key, Kong's 401 is shown.
8. **Given** Kong's Admin API is unreachable **When** a developer creates an app
   **Then** they see a clear "gateway unavailable, try again" error, no partial app is left,
   and a retry later succeeds without duplicate Kong consumers.
9. **Given** a developer revokes a key **When** they call the API with it **Then** Kong returns 401.

## Out of scope
- AWS API Gateway (spec 002), other gateways
- SSO / OIDC, teams and orgs, approval workflows
- Page builder, custom widgets, theming beyond the default theme
- Rate-limit plans, analytics, MCP server, AI features
- Helm chart (later spec)

## Open questions
- [ ] Use Zudoku or Scalar for the API reference and try-it console? — tech-lead
- [ ] Project name, so the docker images and npm scope can be named — Elango
- [ ] Should the try-it console call Kong directly from the browser (needs CORS on Kong) or via a server proxy? — tech-lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Note: this spec also creates the monorepo scaffold described in CLAUDE.md.

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
| Criterion | Test file | Result |
| --- | --- | --- |

### Bugs

## Review  _(tech-lead)_

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
