# Product brief — API Developer Portal (working name: Portal)

Last updated: 2026-11-02 · Owner: Elango (Zebra Software Services)

## What we're building
A free, open-source (Apache 2.0) developer portal that connects to the API gateways teams
already run. Platform teams import OpenAPI specs; developers read docs, sign up, create apps
and get working credentials on the gateway; AI agents read every page as Markdown.

## Why
- Kong Gateway OSS and lighter gateways (APISIX, Envoy Gateway, KrakenD) ship no self-serve portal.
- Gateway-bundled portals are hard to customize, and multi-gateway portals are enterprise-priced SaaS.
- The project builds Zebra Software Services' reputation in the API space. Success is adoption
  (GitHub stars, real deployments, contributors), not revenue.

## Who it's for
1. Platform engineers running Kong OSS or AWS API Gateway who need an external developer portal
2. API consumers (developers) who want docs and a key in minutes
3. Portal admins who want branding and custom pages without forking

## Principles
- `docker compose up` gives a working portal against a real Kong in under five minutes.
- Customize anything without forking: theme → page builder → MDX in Git → injected code → widgets → hooks → headless API.
- One adapter interface per gateway; any gateway can also validate portal-issued JWTs.
- Agent-ready: Markdown for every page, `llms.txt`, later an MCP server per API product.

## Scope
**MVP (spec 001):** Kong quickstart — import OpenAPI, publish docs, developer sign-up,
app + Kong key-auth credential, try-it console, key revoke.
**Next:** AWS API Gateway REST adapter (spec 002), rate-limit plans, theming, Helm chart.
**Later:** page builder, widget SDK, APISIX/Envoy/Apigee/Azure adapters, MCP server, AI search, WASM hooks.
**Not doing:** paid tiers, monetization/billing as a priority, a hosted SaaS before the open-source core is adopted.

## Distribution
GitHub + Docker images + Helm chart first. Free listings on AWS and Google Cloud marketplaces
later, for visibility.

## Tech stack (ADR 0001, proposed)
TypeScript monorepo (pnpm + Turborepo) · Next.js + Tailwind + shadcn/ui · Fastify (OpenAPI-first) ·
PostgreSQL + Drizzle · pg-boss · Better Auth · Kong Admin API, AWS SDK v3 · Vitest, Playwright,
Testcontainers · Docker, Helm, GitHub Actions. License Apache 2.0 with DCO sign-off.
