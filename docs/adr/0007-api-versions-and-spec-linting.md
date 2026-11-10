# ADR 0007 — API versions are children of one API; imports are linted with Spectral

- Status: Proposed (accept by merging)
- Date: 2026-11-08
- Spec: 012-docs-versions-search-agents
- Builds on: [ADR 0005](0005-per-api-access-control-kong-acl.md) (one published API per Kong
  service), [ADR 0003](0003-api-reference-scalar-and-try-it-proxy.md) (Scalar reference)

## Context
An API in the portal holds exactly one OpenAPI document. ADR 0005 refuses a second API on the
same Kong service, so v2 of an API can only replace v1. Spec 012 needs several versions of one
API, a latest version the admin controls, a changelog, and an import check that stops documents
that would break the rendered reference or the try-it console. Specs 020 (search) and 021
(agent-ready docs, per-version downloads) build on whatever model this spec picks.

## Decision
1. **A version is a child row of the API.** A new table `api_versions` holds each version's
   document, `info` fields, release note, change summary and lint warnings. The `apis` row keeps
   what is shared by every version: slug, Kong service link, route path, first publish time, and
   a pointer `latest_version_id`. The document, title, version and description move off `apis`, so
   there is one source of truth. A composite foreign key makes the pointer always name a version
   of the same API.
2. **Versions are named by `info.version`,** unique per API, and used in URLs. The name must match
   `^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$`; anything else is refused at import.
3. **Gateway objects stay per API.** All versions share one Kong service, route, ACL group and
   subscription. Adding a version or changing the latest makes no gateway call, which also means
   both work while Kong is down.
4. **"Latest" is an explicit pointer, not derived.** The most recently imported version becomes
   latest unless the admin opts out, and any version can be set as latest. Display order is a
   separate concern: SemVer precedence when every name is valid SemVer, otherwise import order.
5. **The change summary is computed once, at import, and stored.** It compares the new version
   with the version just below it in display order, at operation level only. Changing the latest
   later doesn't rewrite history.
6. **Imports are linted with Spectral** (`@stoplight/spectral-*`, Apache-2.0), the de-facto
   OpenAPI linter, so operators can reuse the style guides they already have. The portal ships its
   own ruleset file built on `spectral:oas` (recommended rules), in which only rules whose failure
   breaks the reference or try-it are errors and every other rule is a warning. Errors refuse the
   import; warnings are returned and stored.
7. **Operators replace the ruleset with a file, never edit it in the UI.** `PORTAL_LINT_RULESET`
   points at a mounted Spectral ruleset (YAML or JSON). A file that is missing or invalid never
   falls back to the default: the server starts, logs the error, reports `degraded` on
   `/api/v1/health`, and refuses imports with 503 until it is fixed. The loader never fetches
   over the network: `extends` may name only Spectral's built-in rulesets or local files.
8. **Structural validation stays separate from the ruleset.** The `@scalar/openapi-parser`
   validation from spec 001 still runs after linting, so a custom ruleset that drops `oas3-schema`
   can't let an invalid document through to Scalar.

## Consequences
- Every reader of `apis.title`, `apis.version` or `apis.document` (catalog, subscriptions, seed,
  try-it allowlist, reconcile) now joins the latest version. The migration copies each existing
  document into a first version that reuses the API's ID, so URLs and subscriptions don't change.
- Spec 020 indexes the latest version only; spec 021 serves per-version downloads from
  `api_versions` (the original import text is kept in `source_content` for that purpose).
- Per-version routing (`/v1` and `/v2` on different Kong services) would need a version-level
  gateway link. That is a new decision, not a change to this one.
- Spectral adds a set of runtime dependencies to the server image (a bundler is needed to load
  operator ruleset files). JavaScript custom functions in an operator's ruleset run inside the
  server with the operator's trust, the same as any other mounted configuration.
- A Spectral upgrade can add or change rules. A unit test pins the default ruleset's exact
  error-rule list so an upgrade can't silently start refusing imports.
- Documents already published are not re-linted; they keep working and show no lint warnings
  until a new version is imported.
