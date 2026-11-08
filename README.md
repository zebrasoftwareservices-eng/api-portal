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
