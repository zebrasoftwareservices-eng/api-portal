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

Open http://localhost:3000. The setup screen creates your first admin and signs you in.
Connect the bundled Kong using the pre-filled values, press **Test**, then **Save**.
You can skip connecting and return to **Admin → Gateways** later. The sample API is
optional: choose it in the wizard, or keep an empty catalog and import your own OpenAPI
spec linked to a service already in Kong. The bundled sample runs at
http://localhost:8000/sample.

Create a developer account, create an app subscribed to the sample or an imported API,
and save its key when shown. Send it as the `apikey` header in the reference console.
Keys are shown once; only their last four characters are stored by the portal. A key
works only on the APIs subscribed to by its app.

The default Compose file is for local evaluation. **Do not expose it to the internet:**
it sets `NODE_ENV=development`, so anyone who reaches a fresh install can claim its
first admin without a setup token. Production requires non-default authentication,
encryption and database secrets. Until an admin exists, a production server prints a
random single-use setup token at each start; enter that token in setup. Persist your
`PORTAL_ENCRYPTION_KEY`: changing it makes stored gateway tokens unreadable until you
enter them again. See [reaching the Kong Admin API](docs/connect-kong.md) for networking,
a protected-route recipe, moving a connection and cleanup.

For declarative configuration, set **both** `ADMIN_EMAIL` and `ADMIN_PASSWORD`, plus
`KONG_ADMIN_URL` and the proxy URLs. In Compose the bundled Admin API is
`http://kong:8001`, and the internal proxy is `http://kong:8000`; `localhost` is resolved
from the server container. An environment-managed gateway can't be edited, disabled
or removed in the UI. Remove `KONG_ADMIN_URL` and restart to manage the saved connection
from the UI. Existing v0.2 admins and keys remain valid on upgrade.

```sh
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='<choose-a-password>' \
KONG_ADMIN_URL=http://kong:8001 SEED_SAMPLE=true \
docker compose -f deploy/docker-compose.yml up --build
```

Set `SEED_SAMPLE=true` only to opt in to startup seeding. With no gateway, or with a
disabled connection, seeding logs a warning and skips without preventing startup.
The next start with an enabled connection can seed. A published `sample` slug is
preserved. The default install creates no admin, API, consumer, key, route or service.

For local development use Node 22, `corepack enable`, `pnpm install`, and `pnpm dev`.
Start Postgres first and apply the connection settings in `deploy/.env.example` as
needed. Local development also opens the wizard unless you supply the admin and Kong
environment variables. The bundled hint is Compose-only; when developing on the host,
use `http://localhost:8001` for Admin and `http://localhost:8000` for both proxy URLs.
Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before committing.
Integration tests require a running Docker daemon.

## Hosted demo

The Vercel deployment shows the seeded sample API catalog and a read-only reference.
Sign-up, API keys, try-it and admin need the local quickstart above.
Demo mode is baked in at build time: `PORTAL_DEMO_MODE=on`, or `VERCEL=1`
with no `SERVER_URL`, enables it. Set `SERVER_URL` when deploying a real portal
on Vercel to keep live features enabled. Ordinary local and Compose builds stay live,
even when the server is unreachable. Changing mode or the seed requires a rebuild.

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
