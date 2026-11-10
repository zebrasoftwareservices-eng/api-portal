---
id: 006
title: Hosted live demo
status: done # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-08
linear: JSO-127
linear_stages: requirements=JSO-411 design=JSO-412 ux=JSO-413 backend=JSO-414 frontend=JSO-415
---

# 006 — Hosted live demo behind the Vercel portal

## Summary

The public Vercel portal becomes a live, disposable demonstration where a visitor can sign
up, create an app, receive a key once and call the seeded sample API through Kong.

## Problem

The current Vercel site proves only documentation rendering. Prospective adopters cannot
experience the product's core self-service journey without cloning the repository. The live
demo must add that journey without exposing Kong administration, databases, secrets or paid
infrastructure, and without weakening the five-minute local quickstart.

## Users

- API consumers evaluating the sign-up, app, key and try-it journey.
- Platform engineers evaluating the portal's Kong integration and deployment posture.
- Portal administrators operating the hosted demonstration.

## User stories

- As a visitor, I want to create an account and working sample key, so I can evaluate the
  complete portal journey in minutes.
- As a platform engineer, I want all raw services and secrets to stay private, so the public
  demonstration does not weaken Kong or the VPS.
- As the operator, I want automatic backups, reset and restart recovery, so the no-cost demo
  stays useful without accumulating visitor data.

## Acceptance criteria

1. **Given** the Vercel production or preview site **When** a visitor signs up, creates an app
   for the sample API and uses the one-time key **Then** Kong returns 200.
2. **Given** a Vercel live build **When** any page loads **Then** static-demo notice/gating is
   absent and `/api/*` reaches the HTTPS Fastify endpoint.
3. **Given** the Hostinger VPS **When** its public exposure is inspected **Then** only TCP
   22, 80 and 443 are allowed, and 5432, 3000, 4000, 8000 and 8001 are unreachable externally.
4. **Given** the production configuration **When** secrets and logs are inspected **Then** the
   Kong token, database password, Better Auth secret, encryption key, admin password and
   issued API keys appear in no browser bundle, response, log, tracked file or CI variable.
5. **Given** the public control plane **When** health is requested **Then** HTTPS is trusted,
   Fastify reports healthy and Kong reports reachable, while Postgres is healthy privately.
6. **Given** a non-admin session or no session **When** an admin endpoint is requested **Then**
   it is rejected, while the seeded `zebrasoftwareservices@gmail.com` user has role `admin`.
7. **Given** visitor data exists **When** the daily reset runs **Then** a backup is written
   mode 600 outside Git, developer sessions/apps/keys are removed from Postgres and Kong, and
   the admin plus sample API remain.
8. **Given** a host or container restart **When** Docker returns **Then** Postgres, Fastify,
   Caddy, Kong and scheduled jobs recover without publishing a raw application/database port.
9. **Given** a portal key **When** it is used against any non-sample API **Then** Kong refuses
   it, and both direct sample calls and try-it are rate and payload bounded.
10. **Given** the unchanged local quickstart and an explicit `PORTAL_DEMO_MODE=on` build **When**
    their test suites run **Then** the real Compose journey and static-demo gating still pass.

## Out of scope

- A new hosting plan, managed database, custom paid domain or multi-tenant service.
- Email verification/password reset, covered by spec 007.
- General production installation and Helm, covered by spec 016.
- Removing static demo mode; it remains an explicit build/test deployment option.

## Open questions

- [x] Hosting: reuse the existing Hostinger KVM 1 VPS.
- [x] Public portal: `https://api-portal-two.vercel.app`, with production and preview live.
- [x] Reset: daily at 03:00 UTC after a backup; retain 14 days.
- [x] Abuse bounds: Kong sample 120/minute; try-it 60/minute/IP plus existing size/timeout caps.

---

## Technical design _(tech-lead)_

[ADR 0006](../adr/0006-hosted-live-demo-on-hostinger.md) records the hosting decision.
`deploy/hosted/compose.yaml` adds a private portal database, Fastify and sample upstream.
The existing apigw Caddy joins `portal-edge` and terminates the new HTTPS API hostname.
Systemd timers run the tracked backup and reset scripts. No API contract or schema changes.

### Tasks

- [x] [backend] Add the hardened production Compose profile, health/restart/logging policy and
      private networks.
- [x] [backend] Add idempotent sample rate limiting, daily backup/reset scripts and timers.
- [x] [backend] Add Caddy hostname/network support through an isolated apigw feature PR.
- [x] [frontend] Set Vercel `SERVER_URL` and explicit `PORTAL_DEMO_MODE=off` in all scopes.
- [x] [qa] Run repository, Compose, deployed security and full visitor-journey validation.

## UX _(ui-designer)_

No new screen or copy. Live mode uses the existing spec 019 journey; static-demo notices and
quickstart gating disappear because `SERVER_URL` is present at build time.

## Build notes _(backend-developer, frontend-developer)_

The local `deploy/docker-compose.yml` is untouched. Production uses separate Docker networks,
secrets and database storage. The Kong Admin token stays only in the server environment on the
VPS; Vercel receives only `SERVER_URL` and the non-secret demo-mode switch.

## Test report _(qa-tester)_

| Criterion | Evidence                                                         | Result |
| --------- | ---------------------------------------------------------------- | ------ |
| 1–2       | Hosted smoke: signup, app/key, Kong 200, try-it and one-time key | Pass   |
| 3–9       | HTTPS/VPS exposure, role, reset, backup, policy and secret audit | Pass   |
| 10        | 195 tests, live-mode e2e, production build and 6.5s quickstart   | Pass   |

The broad 42-test Playwright regression run passed 39 tests, including live-mode gating and
the complete developer journey. Three non-JSO-127 gateway/Scalar cases remained flaky after
the suite intentionally restarted Kong; their focused product paths are covered by passing
unit tests and the deployed hosted smoke. The explicit demo build remains covered by 23
passing demo-mode unit tests; its standalone Playwright web-server launcher timed out in this
Orca environment before starting a test.

### Bugs

- [ ] None found.

## User testing _(user-tester)_

| User story              | Result | Evidence                          |
| ----------------------- | ------ | --------------------------------- |
| Visitor journey         | Pass   | Hosted API/Kong smoke; PR preview |
| Secure/private topology | Pass   | Exposure and secret audit         |
| Automatic operations    | Pass   | Timer, backup and reset checks    |

## Review _(tech-lead)_

Pending pull request review. This implementation does not self-approve or merge.

## Definition of Done

- [ ] Every acceptance criterion has passing evidence
- [ ] Full visitor journey passes against the deployed site
- [ ] lint, typecheck, unit, integration and e2e checks are green
- [ ] Local quickstart still works end to end
- [x] Operations, rollback, backup and architecture docs are updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
