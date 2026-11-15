# ADR 0012 — Search is computed from the visible catalog at query time, with no index

- Status: Proposed (accept by merging)
- Date: 2026-11-15
- Spec: 020-api-search
- Builds on: [ADR 0010](0010-visibility-policy-and-access-requests.md) (catalog visibility)

## Context
Spec 020 adds one search box over published APIs and their operations (method, path, summary).
Two rules shape the engine. Search must show exactly what the public catalog shows the current
visitor, using the catalog's own visibility check, so hidden or unpublished APIs can never leak.
And it must not add a container to the quickstart. A replaced spec, a new version or an
unpublished API must drop out of results as soon as the change is saved.

A self-hosted portal's catalog is small: tens to a few hundred APIs, a few thousand operations.
`GET /v1/apis` already loads each visible API's latest document on every request.

Options considered:
- **Search engine container (Meilisearch, OpenSearch, Typesense).** Good ranking and typo
  tolerance, but it adds a container, a sync job and a second copy of visibility rules.
  Rejected by the quickstart rule.
- **Embedded index (MiniSearch, Lunr) in the server process.** No container, but the index must
  be rebuilt on every import, version and visibility change, and kept per server replica.
  Visibility would still be a separate filter over it.
- **Postgres index table (`search_entries`) with `pg_trgm` or `tsvector`.** Fast at scale, but
  needs a migration, an extension, and writes on every import, version change and delete. A
  missed write leaves a stale or leaking row. `tsvector` also splits paths like `/orders/{id}`
  badly.
- **Query time over the catalog rows (chosen).** Call `publishedApis(db, viewer)`, the function
  behind `GET /v1/apis`, then match the term in TypeScript over each visible API's title,
  description and latest document's operations.

## Decision
Search has no index and no table of its own. `GET /v1/search` builds its candidate set from
`publishedApis(db, viewer)`. That way visibility, publish state and "latest version" are the
catalog's by construction. Matching is a pure function: lowercase substring matching, every
token must match, and wildcard characters are not special. Ranking is a fixed score. The route
is rate limited (60/min per IP anonymous, 120/min per user signed in) because every search reads
the visible documents.

## Consequences
- AC 3–5 hold by construction: there is nothing to keep in sync, and the search and catalog sets
  cannot drift apart. Spec 010 visibility and spec 012 versions apply with no search code.
- No migration, extension, dependency or container.
- Cost grows with the size of the visible catalog on every search. That is fine for hundreds of
  APIs. Revisit this ADR when a portal passes about 500 APIs or search p95 passes 300 ms. The
  next step is a Postgres `search_entries` table maintained by the import and version code,
  still filtered by the catalog's visible API IDs.
- No stemming, typo tolerance or relevance tuning. "cancel orders" won't match "Cancel an
  order". Semantic search is out of scope (product brief).
