# Product brief — API Developer Portal (working name: Portal)

Last updated: 2026-11-06 · Owner: Elango (Zebra Software Services)

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

## Deployment model
Single-tenant and self-hosted: each company installs its own portal on its own servers
(Docker compose today, Helm chart in v0.8). There is no multi-tenant hosting.

## Scope
**Shipped (v0.1):** Kong quickstart (spec 001) — import OpenAPI, publish docs, developer sign-up,
app + Kong key-auth credential, try-it console, key revoke — and a static demo on Vercel (spec 002).
**Next (v0.2–v0.9, one-week sprints):** see `docs/roadmap.md` — per-API access control, gateway
connections from the admin UI and a live demo, accounts and teams, products with free plan tiers and
approvals, usage and docs upgrades, branding and content, governance and production install, then the
AWS adapter and OAuth credentials.
**Later:** Konnect, APISIX, Envoy, Azure and Apigee adapters, MCP server per product, AI search, widget SDK, page builder.
**Not doing:** billing, paid plans or payment providers; multi-tenant hosting; a hosted SaaS.

## Distribution
GitHub + Docker images + Helm chart first. Free listings on AWS and Google Cloud marketplaces
later, for visibility.

## Tech stack (ADR 0001, proposed)
TypeScript monorepo (pnpm + Turborepo) · Next.js + Tailwind + shadcn/ui · Fastify (OpenAPI-first) ·
PostgreSQL + Drizzle · pg-boss · Better Auth · Kong Admin API, AWS SDK v3 · Vitest, Playwright,
Testcontainers · Docker, Helm, GitHub Actions. License Apache 2.0 with DCO sign-off.
