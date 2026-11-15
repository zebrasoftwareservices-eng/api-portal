# ADR 0013 — Agent-readable docs are plain-text endpoints rendered by the server on request

- Status: Proposed (accept by merging)
- Date: 2026-11-15
- Spec: 021-agent-ready-docs
- Builds on: [ADR 0003](0003-api-reference-scalar-and-try-it-proxy.md) (Scalar reference),
  [ADR 0010](0010-visibility-policy-and-access-requests.md) (catalog visibility),
  [ADR 0007](0007-api-versions-and-spec-linting.md) (API versions)

## Context
Spec 021 makes the portal readable by AI agents: `/llms.txt`, a Markdown reference per API,
a download of the OpenAPI document as imported, and code samples per operation. All of it must
show exactly what the public catalog shows, using the catalog's visibility check, and must not
add a container or a build step to the quickstart. Admins import, version and unpublish APIs at
any time, so the text must never lag the catalog.

Options considered:
- **Static generation in Next.js** (write `.md` and `llms.txt` at build time). Stale after every
  import, and the portal image is built once per release, not per install. Rejected.
- **Cached Markdown columns written at import** (`api_versions.markdown`). Needs a migration, a
  backfill and a rewrite whenever the renderer changes; visibility still has to be checked per
  request. Rejected: the render is cheap.
- **Content negotiation on the existing pages** (`Accept: text/markdown` on `/apis/{slug}`).
  Agents follow links; few send custom `Accept` headers, and Next.js page routes would need a
  server round trip anyway. Rejected for now; the `.md` URLs work for every client.
- **Server routes that render on request (chosen).** The Fastify server renders `llms.txt` and
  Markdown from the stored documents on each request and serves the imported bytes for
  downloads, behind the same `publishedApis`/`canSeeApi` check as `GET /v1/apis`.

## Decision
- The server owns every agent-readable format, under the public catalog namespace:
  `GET /api/v1/llms.txt`, `GET /api/v1/apis/{slug}[/versions/{version}]/reference.md` and
  `GET /api/v1/apis/{slug}[/versions/{version}]/spec`. They are in `openapi.yaml` like any route.
- The portal serves `/llms.txt` at its origin root with a Next.js route handler that forwards to
  the server **without** the caller's cookies or headers, so it is always the anonymous view.
  Markdown and downloads use the caller's viewer, exactly like the catalog routes.
- Links in `llms.txt` are absolute, built from `PORTAL_PUBLIC_URL`.
- Markdown is rendered from the version's stored document after the same transformation as
  `getApiDocument` (gateway base URL, API-key header), by one pure function with unit tests.
- Downloads return `api_versions.source_content` byte for byte with `application/json` or
  `application/yaml`; rows without a stored source fall back to the document as JSON.
- Code samples come from Scalar's built-in HTTP clients, limited to a curated list; the portal
  writes no sample generator of its own.

## Consequences
- No migration, no new dependency, no new container. A new version or an unpublished API shows
  up in every format on the next request.
- Each request re-renders. For a self-hosted catalog (tens to hundreds of APIs) that is cheap;
  `llms.txt` gets `Cache-Control: public, max-age=60` because it is the same for everyone, and
  per-viewer responses get `private, no-cache`.
- `/llms-full.txt` (every reference inlined) and Markdown for docs pages (spec 014) can be added
  as more server routes with the same pattern.
- Sample languages are bounded by what Scalar supports; a language Scalar lacks needs
  `x-codeSamples` in the document or a later decision.
