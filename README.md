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
random single-use setup token shared by every replica and preserved across restarts; enter that token in setup. Persist your
`PORTAL_ENCRYPTION_KEY`: changing it makes stored gateway tokens unreadable until you
enter them again. See [reaching the Kong Admin API](docs/connect-kong.md) for networking,
a protected-route recipe, moving a connection and cleanup.

For a real installation, use the [production Docker Compose guide](docs/install/production.md)
or the [Kubernetes Helm guide](docs/install/helm.md). Both use exact-version images,
forward-only migrations, persistent secrets, health probes, and documented backup and rollback procedures.

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

### Portal email

The quickstart sends verification and password reset email to Mailpit. Open
<http://127.0.0.1:8025> to read it; no external mail account is needed. Mailpit
is independent of server readiness, so an SMTP outage does not block startup.
The bootstrap admin is already verified; new accounts receive a verification
link valid for 24 hours. Password reset links work once and expire after an hour.

Admins can configure SMTP under **Mail** and send a test email. Saved settings
win over the server environment on the next send. The password is encrypted at
rest and write-only: omit it on updates to keep it, or send null to remove it.
Removing saved settings restores the environment fallback. Under **Accounts**,
admins can require verification before apps or keys are created and adjust the
failed sign-in, reset email and verification email limits without restarting.
Verification is off by default and cannot be enabled without configured mail.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | unset (`mailpit` in compose) | SMTP hostname; mail needs this and a sender address |
| `SMTP_PORT` | `587` (`1025` in compose) | Port, 1–65535 |
| `SMTP_SECURITY` | `starttls` (`none` in compose) | `none`, required `starttls`, or direct `tls` |
| `SMTP_USERNAME` | unset | Optional SMTP username |
| `SMTP_PASSWORD` | unset | Optional SMTP password |
| `SMTP_SENDER_NAME` | `Developer Portal` | Sender display name |
| `SMTP_SENDER_ADDRESS` | unset (`noreply@example.com` in compose) | Sender email address |

For local `pnpm dev`, set `SMTP_HOST=localhost` and expose the Mailpit SMTP
port on localhost (for example `docker run --rm -p 127.0.0.1:1025:1025 -p
127.0.0.1:8025:8025 axllent/mailpit:v1.27.10`). Production installs use their own
SMTP provider and should use STARTTLS or TLS. `PORTAL_PUBLIC_URL` determines the
origin of links in all account emails.
### API versions and import linting

Each API has one gateway service and catalog entry, with a stored OpenAPI document per version.
Use **Manage versions** in the API admin area to publish another `info.version`, supply a plain-text
release note, or set an existing version as latest. Uploads become latest by default; select
**Don't make this the default version** for an older patch. Version names must match
`^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$`; duplicate versions are refused. Stable documents are served at
`/api/v1/apis/{slug}/versions/{version}/openapi.json` and changes at `/api/v1/apis/{slug}/changelog`.
All versions share subscriptions, keys and gateway routing.

Imports use the packaged `apps/server/rulesets/portal.spectral.yaml` ruleset. Its blocking rules
are `oas3-schema`, `invalid-ref` (Spectral core), `operation-operationId-unique`, `path-params`,
`path-declarations-must-exist`, `path-not-include-query`, `operation-parameters` and
`oas3-operation-security-defined`. Every other shipped rule is a warning. Errors return a 422
problem with rule, message, JSON pointer, 1-based line/column and external source URL when applicable;
successful imports return warnings.

To replace the ruleset, mount a YAML or JSON Spectral ruleset in the server container and set
`PORTAL_LINT_RULESET` to its **absolute container path**. For example, in a Compose override:

```yaml
services:
  server:
    environment:
      PORTAL_LINT_RULESET: /etc/portal/ruleset.yaml
    volumes:
      - ./ruleset.yaml:/etc/portal/ruleset.yaml:ro
```

The file replaces the default ruleset. To retain the portal defaults and promote a warning:

```yaml
extends: /app/apps/server/rulesets/portal.spectral.yaml
rules:
  operation-description: error
```

Local files and `spectral:*` built-ins can be extended; network rulesets are refused. Restart the
server after changing the file. A missing or invalid ruleset is logged with its path and reported
by `/api/v1/health` as `status: degraded`, `lint.status: error`; docs remain readable and imports
return 503 until the configuration is fixed. There is no automatic fallback.

**Upgrading existing installations:** migration `0002_api_versions.sql` runs automatically at
server startup. Back up PostgreSQL before upgrading. It moves each existing document into its
first `api_versions` row, preserves API IDs, subscriptions and publication dates, and sets the latest
pointer. Existing documents remain published without re-linting (`lint_warnings = null`). The
migration drops the old per-document `apis` columns; rollback requires restoring the backup and
previous image together. Sample seeding refreshes only its `1.0.0` document and retains the latest
version chosen by an administrator.
