# ADR 0015 — Stored OpenAPI documents use Postgres `json`, so authored key order survives

- Status: Proposed (accept by merging)
- Date: 2026-11-16
- Spec: 022-server-robustness
- Builds on: [ADR 0012](0012-search-computed-from-catalog-at-query-time.md) (search runs in the server, not in SQL)

## Context
`api_versions.document` is `jsonb`. `jsonb` stores object keys sorted by length and then by
bytes, so the quickstart sample's paths come back as `/get`, `/post`, `/uuid`, `/headers`,
`/status/{code}`, not in the order the author wrote. Scalar keeps the document's order, so the
reference shows the database's order. The document is the bundled, validated form, not the
uploaded text (`source_content`), so the reference cannot just re-parse the source.

No query reads `document` with `jsonb` operators or an index. Search (ADR 0012), change
summaries and the reference all parse the document in the server.

Options considered:
- **Keep `jsonb` and add a `document_text` column.** Keeps `jsonb` for SQL that does not exist,
  doubles the largest column, and every writer has to keep two columns in step.
- **`text` column.** Works, but drops Postgres's check that the value is valid JSON, and
  Drizzle would need a custom type.
- **`json` column.** Postgres stores the text exactly as written and checks that it is valid JSON.
  Drizzle has a `json()` type, and postgres-js parses it with `JSON.parse`, which keeps order.

## Decision
Change `api_versions.document` from `jsonb` to `json` with one
`ALTER TABLE … ALTER COLUMN document TYPE json USING document::json` migration. Postgres DDL runs
in a transaction, and the migrator applies pending migrations in one transaction, so a failed
upgrade leaves the `jsonb` column untouched. Writers keep passing the parsed document. Order is
kept from parse, through bundling, through `JSON.stringify`.

## Consequences
- Rows written before this change keep the `jsonb` order. The cast cannot recover the authored
  order. Re-importing a version stores its authored order, and boot refreshes the seed-created
  sample, so the quickstart is right after upgrade.
- Integer-like keys (response codes such as `200`, `404`) follow JavaScript object rules and come
  out in ascending order. That is not a regression, and the spec does not ask for it.
- A future feature that wants to query inside documents in SQL must cast to `jsonb` in the
  query or add a derived column.
- The migration rewrites `api_versions` under an exclusive lock. It runs at boot, before the
  server listens.
