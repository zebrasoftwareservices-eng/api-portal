# ADR 0003 — API reference with Scalar; try-it requests go through a server proxy

- Status: Proposed (accept by merging)
- Date: 2026-11-02
- Spec: 001-kong-quickstart-slice (answers its two tech-lead open questions)

## Context
The portal must render an OpenAPI 3.x reference with a try-it console (spec 001 AC 3 and 7).
Candidates were Zudoku and Scalar. The try-it console also has to reach the gateway from a
browser on another origin (`localhost:3000` → Kong on `localhost:8000`).

## Decision
**Use Scalar (`@scalar/api-reference-react`, MIT) for the API reference and try-it console.**
- It's a React component that mounts inside our own Next.js App Router pages. Zudoku is a
  complete Vite-based docs framework; embedding it would mean running a second app or giving
  up our routing, auth and layout.
- It supports OpenAPI 3.0 and 3.1, an API-key auth input, and a `proxyUrl` option for try-it.
- It is themed with CSS variables, which matches our token approach (`packages/ui`).
- The server validates imports with `@scalar/openapi-parser`, so the docs and the validator
  read specs the same way.

**Send try-it requests through a portal server proxy, not straight from the browser to the
gateway.** Scalar is configured with `proxyUrl: "/api/v1/try-it"` and uses its standard
`?scalar_url=<target>` protocol. The server:
- forwards only to URLs under a **published API's public gateway base URL** (allowlist; anything
  else gets 400) and rewrites the public base to the internal one
  (`KONG_PROXY_PUBLIC_URL` → `KONG_PROXY_INTERNAL_URL`), so it works inside docker compose;
- strips `cookie`, `authorization` (unless the API's scheme uses it), and all `x-forwarded-*`
  headers, and never forwards the portal session;
- doesn't follow redirects, caps request and response bodies at 1 MiB, uses a 10 s timeout,
  and is rate-limited to 60 requests per minute per IP (`@fastify/rate-limit`);
- passes the gateway's status, headers (minus hop-by-hop and `set-cookie`) and body back
  unchanged, so Kong's own 401 shows in the console.

The browser-direct option was rejected because it would need the CORS plugin on every Kong
service the platform engineer links. That means the portal would change gateway config it
doesn't own, and AWS and other gateways would each need their own CORS setup.

**Keep Scalar's hosted services off.** A self-hosted portal contacts only its own origin unless the
operator opts in, so the Scalar configuration disables the AI agent (`agent: { disabled: true }`)
and its hosted fonts (`withDefaultFonts: false`). Spec 001's review added this after UAT found
calls to `proxy.scalar.com` on local hostnames (JSO-171, JSO-186).

## Consequences
- Try-it traffic goes through the portal server. This is fine for a docs console. The rate limit
  and the 1 MiB cap stop it being used as a general proxy.
- The allowlist means try-it works only against published APIs. This is intended.
- Swapping Scalar later only touches `apps/portal` and the proxy route, and the proxy protocol
  is a single query parameter.
