# Backend build verification — spec 001

Verified 2026-11-02 in the spec worktree.

- `pnpm lint`, `pnpm typecheck`, and `pnpm test`: pass. The suites include real
  PostgreSQL migration and Kong 3.9 adapter conformance tests, 15 server tests,
  and 24 portal tests.
- SDK regeneration produces no diff. Frozen-lockfile install passes.
- `pnpm test:e2e`: one Chromium browser smoke passes, checking the rendered
  seeded catalog and the same-origin catalog endpoint.
- `node deploy/smoke.mjs`: passes signup, app/key creation, real Kong key auth,
  try-it proxy, one-time key isolation, and idempotent revocation.
- `node deploy/outage-smoke.mjs`: passes unavailable-gateway 503/no partial app
  and successful retry with one tagged consumer and credential.
- `COMPOSE_PROJECT_NAME=portal-backend-smoke node deploy/quickstart-smoke.mjs`:
  **85.9 seconds**, including both application builds, fresh database/migrations,
  service healthchecks, and a home-page response containing Sample HTTP API.
  Docker had 8 CPUs and 4 GB RAM. Base images and the pnpm fetch layer were
  cached; application compile layers were rebuilt. This is not a fully cold
  image/download timing. CI repeats the 300-second assertion on its runner.

The server and portal use multi-stage Dockerfiles, with a non-root runtime and
Next.js standalone output. Runtime dependencies remain installed from the frozen
workspace lockfile; an experimental pnpm legacy production deployment was removed
because it re-resolved workspace dependency ranges and failed offline.

CI runs lint/typecheck/unit/integration and generated-client drift checks, then a
separate Compose job runs the bounded quickstart, live gateway flow, outage flow,
and Playwright smoke. Full acceptance e2e coverage and an uncached timing run belong
to the QA stage; no remote CI execution or approval gate is claimed here.
