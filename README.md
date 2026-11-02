# API Portal (working name)

A free, open-source developer portal for the API gateways you already run.
Import your OpenAPI specs, publish docs, and let developers sign up and get working
credentials on the gateway — starting with **Kong Gateway OSS**, then **AWS API Gateway**,
APISIX, Envoy Gateway, Apigee and Azure API Management.

> **Status:** pre-alpha. Spec [001 — Kong quickstart](docs/specs/001-kong-quickstart-slice.md)
> is the first vertical slice.

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
