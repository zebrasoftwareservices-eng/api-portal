# API Portal (working name)

A free, open-source developer portal for the API gateways you already run.
Import your OpenAPI specs, publish docs, and let developers sign up and get working
credentials on the gateway — starting with **Kong Gateway OSS**, then **AWS API Gateway**,
APISIX, Envoy Gateway, Apigee and Azure API Management.

> **Status:** pre-alpha. Spec [001 — Kong quickstart](docs/specs/001-kong-quickstart-slice.md)
> is the first vertical slice.

## Quickstart

Install Docker with Compose, clone the repository, then run:

```sh
git clone https://github.com/zebrasoftwareservices-eng/api-portal.git
cd api-portal
```

```sh
docker compose -f deploy/docker-compose.yml up --build
```

Open http://localhost:3000. The seeded Sample HTTP API uses Kong at
http://localhost:8000/sample. Admin login: `admin@example.com` / `change-me-now`.
These defaults are for local evaluation; production refuses default secrets.
Create a developer account, create an app subscribed to the sample API, and save
its key when shown. Send it as the `apikey` header in the reference console.
Keys are shown once; only their last four characters are stored by the portal.
Kong key-auth currently accepts any portal key on all key-auth services; subscriptions
do not yet enforce per-API access (see ADR 0002).

For local development use Node 22, `corepack enable`, `pnpm install`, and `pnpm dev`.
Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before committing.
Integration tests require a running Docker daemon.

## Hosted demo

The public Vercel deployment is backed by the live control plane and sample Kong gateway,
so visitors can sign up, create an app, receive a key once and call the sample API. Its
Hostinger deployment, reset, backup and recovery runbook is in
[`deploy/hosted/README.md`](deploy/hosted/README.md).

Static demo mode remains available for tests and documentation-only deployments. It is baked
in at build time: `PORTAL_DEMO_MODE=on`, or `VERCEL=1` with no `SERVER_URL`, enables it. Set
`SERVER_URL` when deploying a real portal on Vercel to keep live features enabled. Ordinary
local and Compose builds stay live even when the server is unreachable. Changing mode or the
seed requires a rebuild.

## Goals

- **Five-minute quickstart:** `docker compose up` gives a working portal against a real Kong.
- **Any gateway:** one adapter interface per gateway, plus a JWT path any gateway can validate.
- **Customize without forking:** theme, page builder, MDX in Git, custom widgets, headless API.
- **Agent-ready:** every page as Markdown, `llms.txt`, and later an MCP server per API product.

## Roadmap

1. Kong quickstart: specs → docs → sign-up → app → Kong key → try-it
2. AWS API Gateway (REST) adapter
3. Rate-limit plans, theming, Helm chart
4. Page builder, widget SDK, more gateway adapters, MCP server

## How this project is built

Features move through an AI "software factory" — product manager, tech lead, UI designer,
backend and frontend developers, and QA — coordinated in [Orca](https://www.onorca.dev) on
Claude Code and Codex, with a human approving every spec and merging every pull request.
See [docs/team-charter.md](docs/team-charter.md) and [docs/orca-playbook.md](docs/orca-playbook.md).

## Contributing

Contributions are welcome. Sign off your commits with the
[Developer Certificate of Origin](https://developercertificate.org/) (`git commit -s`).

## License

[Apache 2.0](LICENSE) © Zebra Software Services
