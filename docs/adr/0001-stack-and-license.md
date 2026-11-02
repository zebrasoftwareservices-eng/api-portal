# ADR 0001 — Tech stack and license

- Status: Proposed (accept by merging)
- Date: 2026-11-02

## Context
The portal is a free, open-source project whose purpose is adoption and reputation for
Zebra Software Services. One person builds it with AI agents, so the stack must be one
language, well known to contributors, and easy to self-host.

## Decision
- **License:** Apache 2.0 for everything; contributions signed off with the DCO
  (`git commit -s`), no CLA.
- **Language:** TypeScript (strict) across frontend, server, adapters and SDKs.
- **Monorepo:** pnpm workspaces + Turborepo.
- **Frontend:** Next.js (App Router), Tailwind, shadcn/ui.
- **Server:** Fastify, OpenAPI-first.
- **Data:** PostgreSQL + Drizzle ORM; pg-boss for jobs (no Redis).
- **Auth:** Better Auth; bring-your-own OIDC later.
- **Testing:** Vitest, Playwright, Testcontainers.
- **Distribution:** Docker images, docker compose quickstart, Helm chart.

## Consequences
- Anyone, including competitors, may host the project; accepted, because adoption is the goal.
- A single Postgres keeps self-hosting simple; revisit queues only if load demands it.
- Contributors need only Node.js and Docker to work on any part of the project.
