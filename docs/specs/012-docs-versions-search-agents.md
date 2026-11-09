---
id: 012
title: API versions and changelog, and spec linting
status: done   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-08
linear: JSO-240
linear_stages:     # stage issues — filled by linear-init
---

# 012 — API versions, changelog and spec linting

## Summary
Admins can publish a new version of an API with a changelog, and specs that would break the
rendered docs or the try-it panel are stopped at import.

## Problem
Today an API in the portal has exactly one OpenAPI document. When the team ships v2, the admin
can only replace v1 or import v2 as a second API, and since spec 004 the second option is
refused: ADR 0005 allows only one published API per Kong service, because a Kong ACL can't tell
two APIs on the same service apart. Developers can't see what changed between versions or keep
reading the version they integrated against. The import checks only that a document is valid
OpenAPI 3.x, so specs with unresolved references, duplicate operation IDs or undeclared path
parameters get published and produce broken reference pages and try-it calls.

We'll know it's solved when importing v2 of an API shows a version switcher and a changelog
entry on the same API, and a spec with a lint error is refused with its rule and location.

Split from the original 012 (Elango, 2026-11-08): search moved to spec 020, agent-ready docs
(Markdown pages, `/llms.txt`, per-version spec downloads, code samples) moved to spec 021.
This spec ships first; 021's per-version downloads need it.

## Users
- **Portal admin / platform engineer:** imports specs, publishes new versions, configures the
  lint ruleset.
- **API consumer (developer):** reads the reference, switches versions, reads the changelog.

## User stories
- As a portal admin, I want to import a new version of an API I already published, so that
  developers get the new docs without the API being split into two.
- As a portal admin, I want to upload a patch for an older version without making it the
  default, so that a v1 fix doesn't hide v2 from developers.
- As a portal admin, I want to set any version as the latest, so that I control which version
  developers see first.
- As a portal admin, I want to write release notes for a version and have the portal summarise
  what changed, so that the changelog is useful without a lot of writing.
- As a portal admin, I want an import that would break the docs or try-it refused with the rule
  and location, so that I can fix the spec before bad docs reach developers.
- As a portal admin, I want other lint findings shown as warnings but not blocking, so that I
  can publish now and improve the spec later.
- As a platform engineer, I want to replace the portal's ruleset with my company's own Spectral
  ruleset file through configuration, so that the portal enforces our API style guide.
- As a developer, I want to switch between versions of an API and read its changelog, so that
  I can read the docs for the version I use and plan my upgrade.

## Acceptance criteria
QA runs these against the Compose stack with a real Kong.

**Lint ruleset (decided by Elango).** The portal ships its own Spectral ruleset based on
`spectral:oas`. Only problems that break the rendered docs or the try-it panel are errors —
for example an invalid OpenAPI document, an unresolved `$ref`, a duplicate `operationId`, or a
path parameter that isn't declared. Every other rule is a warning. The tech lead fixes the exact
rule list in the technical design. An operator can replace the ruleset with their own Spectral
ruleset file through configuration (an environment variable pointing at a mounted file).

1. **Given** a published API at version `1.0.0` linked to a Kong service **When** an admin
   imports a valid OpenAPI document with `info.version` `2.0.0` as a new version of that API
   **Then** the API's reference page shows a version switcher listing `2.0.0` (selected, marked
   latest) and `1.0.0`; choosing `1.0.0` shows the v1 reference at its own stable URL; the API
   still has one catalog entry and the same Kong service link.
2. **Given** a published API with versions `1.0.0` and then `2.0.0` **When** an admin uploads
   `1.1.0` as a new version **Then** `1.1.0`, the most recently uploaded version, becomes the
   latest version and the default the reference page opens on; `2.0.0` and `1.0.0` stay
   reachable through the switcher. If instead the admin uploads `1.1.0` with "Don't make this the
   default version" selected, `1.1.0` is published and listed in the switcher but `2.0.0` stays
   the latest and the default.
3. **Given** v1 has `GET /orders` and `GET /orders/{id}`, and v2 removes `GET /orders` and adds
   `POST /orders` **When** the admin imports v2 with the release note "Orders can now be created"
   **Then** the API's changelog shows a `2.0.0` entry with the import date, the admin's note, and
   a generated summary listing `POST /orders` as added and `GET /orders` as removed (breaking).
4. **Given** a published API at `2.0.0` **When** an admin imports another document as a new
   version with `info.version` `2.0.0` **Then** the import is refused with a problem+json
   response saying that version already exists, and the published `2.0.0` is unchanged.
5. **Given** the default ruleset and an OpenAPI document with an error-severity problem (each
   case tested separately: two operations with the same `operationId`; a `$ref` that doesn't
   resolve; a path `/orders/{id}` with no `id` parameter declared) **When** an admin imports it,
   as a new API or as a new version **Then** the import is refused with a 422 problem+json and
   the admin UI shows, for each error, the rule name, its message and the location (JSON pointer
   and line number); nothing is stored and existing versions are unchanged.
6. **Given** the default ruleset and an OpenAPI document with no errors but at least one warning
   (for example an operation without a description, or no `info.contact`) **When** an admin
   imports it **Then** it is published and the admin sees each warning with its rule name,
   message and location.
7. **Given** the operator has configured the portal to use their own Spectral ruleset file, in
   which `operation-description` is an error **When** an admin imports a document with an
   operation that has no description **Then** the import is refused with a 422 problem+json
   naming `operation-description`; and a document that breaks only a rule of the portal's
   default ruleset that the operator's file doesn't contain is published.
8. **Given** the ruleset configuration points at a file that doesn't exist or isn't a valid
   Spectral ruleset **When** the server starts **Then** it reports an error naming the file and
   the problem (in the log and the health check) and never silently falls back to the default
   ruleset; with no ruleset configured, as in the quickstart, the default ruleset is used.
9. **Given** a published API with versions `1.0.0`, `1.1.0` and `2.0.0`, where `1.1.0` is the
   latest **When** an admin uses "Set as latest" on `2.0.0` **Then** `2.0.0` becomes the latest
   version and the default the reference page opens on, marked latest in the switcher, and the
   other versions stay reachable; when a signed-in developer who isn't an admin calls the same
   action through the API, it is refused with a 403 problem+json and the latest version is
   unchanged; when it names a version that doesn't exist, it gets a 404 problem+json.

## Out of scope
- **Search.** Moved to spec 020.
- **Markdown pages, `/llms.txt`, spec downloads and code samples.** Moved to spec 021.
- **Per-version gateway routing.** All versions of an API share one Kong service and route; the
  portal documents versions, it doesn't route `/v1` and `/v2` traffic or create Kong objects per
  version. Subscriptions and keys stay per API, not per version.
- **Deprecation and sunset dates, and deleting or unpublishing a version.** Cut to keep scope small.
- **Editing lint rules in the admin UI.** Operators replace the ruleset through configuration only.
- **Field-level or schema-level diffs.** The generated summary covers added, removed and
  changed operations only.
- **Syncing specs from GitHub or another Git tool.** A separate future spec (follow-up, not yet
  numbered). Decided (Elango): in Git sync, "latest" will mean the version on the default
  branch or the newest release tag; that spec defines the details.

## Open questions
- [x] ~~Split into several specs?~~ Yes (Elango): 012 versions, changelog and linting; 020
  search; 021 agent-ready docs.
- [x] ~~Which ruleset, and can an operator replace it?~~ Decided (Elango): a portal-tuned
  ruleset based on `spectral:oas` where only problems that break the docs or try-it are errors,
  everything else a warning; the operator can replace it with their own ruleset file through
  configuration. The tech lead fixes the exact rule list and the configuration variable name.
- [x] ~~Latest version for manual upload?~~ Decided (Elango): the most recently uploaded
  version becomes the latest and default (criterion 2).
- [x] ~~Uploading an older patch without making it the default?~~ Decided (Elango): yes to both,
  in this spec — the upload form offers "Don't make this the default version" (criterion 2) and
  any version has a "Set as latest" action (criterion 9).
- [x] ~~What "latest" means when specs sync from GitHub or another Git tool?~~ Decided (Elango):
  the version on the default branch, or the newest release tag. Git sync itself is out of scope
  here and becomes a separate future spec (see Out of scope).
- [ ] Should linting apply to the sample API seeded by the quickstart, and what happens to
  already-published APIs that would fail the new rules (stay published, shown as warnings)? —
  tech-lead
- [ ] What makes a change "breaking" in the generated summary beyond removed operations (for
  example a new required parameter)? — tech-lead
- [ ] Is "new version" a separate admin action on the API, or does the import form detect an
  existing API linked to the same Kong service and offer to add a version? — ui-designer

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Architecture decision: [ADR 0007](../adr/0007-api-versions-and-spec-linting.md). Contract:
`apps/server/openapi.yaml` (updated in this stage; validated with `@scalar/openapi-parser` and
`openapi-typescript`).

### Answers to the tech-lead open questions
- **Seeded sample and already-published APIs.** The quickstart sample isn't linted at runtime
  (it's the portal's own file), but a unit test asserts `apps/server/seed/sample-api.openapi.yaml`
  has zero errors under the default ruleset, so the sample always passes. APIs published before
  012 become a first version with `lint_warnings = null` ("not linted"): they stay published,
  aren't re-linted, and show no warnings until a new version is imported.
- **What is breaking.** Operations are matched on method + path template, with path parameter
  names ignored (`/orders/{id}` = `/orders/{orderId}`). Breaking: an operation removed; a new
  required query/header/cookie parameter; an optional parameter that became required; a request
  body that became required; a documented 2xx response removed; security added to an operation
  that had none. Not breaking, but listed as changed: a new optional parameter, a parameter
  removed, other security changes, the operation newly `deprecated`. Description, example and
  schema changes aren't reported (field-level diffs are out of scope).
- (The ui-designer question — separate action or detection — is open. The contract supports
  both: `GatewayService.linkedApiSlug` already tells the import form which API a service belongs
  to, and the add-version endpoint is separate.)

### Components
| Component | Change |
| --- | --- |
| `packages/db` | New `api_versions` table; `apis` loses its per-document columns and gains `latest_version_id`; migration `0002_api_versions.sql` with backfill. |
| `apps/server` | `src/lint/` (ruleset loading + Spectral run), `src/changes.ts` (change summary), `src/versions.ts` (add version, set latest, changelog, per-version document routes); `import.ts` refactored so both import paths share parse → lint → validate; `catalog.ts`, `apps.ts`, `seed.ts`, `reconcile.ts`, `proxy.ts` join the latest version; `config.ts` gains `PORTAL_LINT_RULESET`; `/api/v1/health` reports the ruleset. New file `apps/server/rulesets/portal.spectral.yaml`, copied into the image. |
| `packages/sdk` | Regenerated from the contract. |
| `apps/portal` | Version switcher on the reference page, versioned reference route, changelog page, admin "Add version" and "Set as latest", lint findings in both import forms, demo data. |
| `packages/adapter-*` | **No change.** Versions make no gateway calls (ADR 0007 §3). |
| docs | README/configuration docs: `PORTAL_LINT_RULESET`, the default rule list, how to copy and extend the shipped ruleset; upgrade notes for the migration. |

New dependencies (server only):
- `@stoplight/spectral-core`, `@stoplight/spectral-rulesets`, `@stoplight/spectral-parsers`,
  `@stoplight/spectral-ref-resolver` — run Spectral with the `spectral:oas` rules and line numbers.
- `@stoplight/spectral-ruleset-bundler` — the documented way to load an operator's ruleset file.
- `semver` — SemVer precedence for version order and the change-summary baseline.

### API contract
All paths are under `/api`. Admin operations need `role = admin` (401 signed out, 403 otherwise).

| Operation | Method + path | Notes |
| --- | --- | --- |
| `importApi` (changed) | `POST /v1/admin/apis` | Now lints. New optional `releaseNote`. Response adds `lintWarnings` and `versions`. New refusals: 422 `/problems/openapi-lint-failed`, 422 `/problems/invalid-api-version`, 503 `/problems/lint-ruleset-unavailable`. |
| `importApiVersion` (new) | `POST /v1/admin/apis/{slug}/versions` | Body `{ spec: {url}\|{content}, releaseNote?, makeLatest = true }`. 201 `{ api: ApiDetail, version: ChangelogEntry, lintWarnings }`, `Location: /api/v1/apis/{slug}/versions/{version}/openapi.json`. 404 unknown API; 409 `/problems/api-version-exists`; 413; 422 as `importApi`; 503 ruleset unavailable. No gateway call. |
| `setLatestApiVersion` (new) | `PUT /v1/admin/apis/{slug}/latest-version` | Body `{ version }`. 200 `ApiDetail`. Idempotent. 404 `/problems/not-found` for an unknown API or version. |
| `getApi` (changed) | `GET /v1/apis/{slug}` | `title`, `version`, `description`, `documentUrl` describe the latest version. Adds `versions: ApiVersionSummary[]` in display order, exactly one `isLatest`. |
| `getApiDocument` (changed) | `GET /v1/apis/{slug}/openapi.json` | Serves the latest version. |
| `getApiVersionDocument` (new) | `GET /v1/apis/{slug}/versions/{version}/openapi.json` | Same transformation as today (`servers` replaced, `portalApiKey` added). 404 unknown version. |
| `getApiChangelog` (new) | `GET /v1/apis/{slug}/changelog` | `{ items: ChangelogEntry[] }`, newest import first. |
| `getHealth` (changed) | `GET /v1/health` | Adds `lint: { ruleset: default\|custom, path?, status: ok\|error, error? }`; `status: degraded` when the custom ruleset failed. Still 200. |
| `listApis` | `GET /v1/apis` | Shape unchanged; one entry per API, fields from the latest version. |

Lint findings: `LintFinding { rule, severity: error|warning, message, pointer, line, column,
source }`. Lines and columns are 1-based (Spectral's are 0-based). `source` is null for the
imported document and the URL for a finding inside an external `$ref` file. On
`/problems/openapi-lint-failed` the problem's `errors[]` carries the same fields for every error
(up to 100) plus `errorCount`; warnings aren't included in a refusal. `lintWarnings` is capped at
200. Spectral `info` and `hint` findings are reported as `warning`.

`ApiVersionName` = `^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$`. The portal URL-encodes it in paths
(`+` → `%2B`).

### Import pipeline (both import operations)
1. Read `spec` (URL fetch rules from spec 001 unchanged; 5 MiB cap).
2. Parse YAML/JSON; keep the original text and note its format (`json` if it starts with `{`).
3. Require `openapi` 3.0.x/3.1.x (`unsupported-openapi-version`).
4. Require `info.version` matching `ApiVersionName` (`invalid-api-version`, pointer `/info/version`).
5. Add-version only: if the API doesn't exist → 404; if the version exists → 409 (cheap pre-check;
   the unique index is the real guard).
6. Fail fast if the ruleset failed to load (503).
7. `prepareRefs` host checks, then bundle external `$ref`s as today, recording every fetched file
   in a `Map<url, text>`. The bundle step may fail only on **external** references; an unresolved
   internal `$ref` must reach the linter so it's reported as `invalid-ref` (AC 5).
8. Lint the **original text** with Spectral, `source` = the document URL (or none for pasted
   content). Spectral is given a resolver whose `http`/`https` readers serve only from the map in
   step 7 and never touch the network, so external refs are linted with their own line numbers.
9. Any error-severity finding → 422 `openapi-lint-failed`, nothing stored.
10. Run the existing `@scalar/openapi-parser` validation on the bundled document (unchanged
    `invalid-openapi` behaviour) — the safety net for custom rulesets without `oas3-schema`.
11. Store (see transactions below) and return warnings.

### Default ruleset (`apps/server/rulesets/portal.spectral.yaml`)
`extends: [[spectral:oas, recommended]]`, then **every** rule of that set listed with an explicit
severity so the file reads as the full list. Errors — exactly these:

| Rule | Why it breaks docs or try-it |
| --- | --- |
| `oas3-schema` | Not a valid OpenAPI 3.x document; Scalar can't render it reliably. |
| `invalid-ref` (Spectral core, always error) | Unresolved `$ref`: the reference shows an empty schema or fails. |
| `operation-operationId-unique` | Duplicate `operationId`: reference anchors and links collide. |
| `path-params` | Path parameter undeclared, unused or duplicated: try-it can't build the URL. |
| `path-declarations-must-exist` | Empty `{}` in a path: try-it can't build the URL. |
| `path-not-include-query` | Query string in a path key: try-it sends a malformed URL. |
| `operation-parameters` | Same parameter twice on an operation: try-it form is ambiguous. |
| `oas3-operation-security-defined` | Security references an undefined scheme: try-it can't send the key. |

Every other rule in the set is `warn` (for example `operation-description`, `info-contact`,
`operation-tags`, `oas3-api-servers`, `oas3-unused-component`, `oas3-valid-media-example`,
`no-$ref-siblings`). A unit test loads the file through the same loader as an operator file and
asserts the error set equals the table above.

`PORTAL_LINT_RULESET` (optional, absolute path). Unset → the shipped file. Set → loaded at startup
with `bundleAndLoadRuleset` using the local file system and a `fetch` that always throws, so
`extends` may use only `spectral:*` built-ins and local files. Accepts `.yaml`, `.yml`, `.json`.
Load failure (missing file, parse error, invalid ruleset, network `extends`) → log at `error`
with the path and reason, `health.lint.status = error`, imports 503; never fall back (AC 8).

### Data model (Drizzle, `packages/db/src/schema.ts`)
New table `api_versions`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | UUIDv7 |
| `api_id` | uuid not null → `apis.id` on delete cascade | |
| `version` | text not null | `info.version`; unique with `api_id` |
| `title` | text not null | `info.title` |
| `description` | text | `info.description` |
| `document` | jsonb not null | bundled, validated document (as `apis.document` today) |
| `source_url` | text | |
| `source_content` | text | original import text; null for backfilled rows (spec 021 serves it) |
| `source_format` | text | `json` \| `yaml`, check constraint; null when `source_content` is null |
| `release_note` | text | ≤ 5000 chars (validated in the handler) |
| `change_summary` | jsonb | `ChangeSummary` or null |
| `lint_warnings` | jsonb | `LintFinding[]`; null = not linted (pre-012 rows) |
| `created_by` | uuid → `user.id` | |
| `published_at` | timestamptz not null default now() | import date |

Indexes: unique `(api_id, version)`; unique `(api_id, id)` (target of the composite FK).

`apis`: drop `title`, `version`, `description`, `document`, `source_url`; add
`latest_version_id uuid` with composite FK `(id, latest_version_id) → api_versions(api_id, id)`.
The column is nullable only so the API row and its first version can be inserted in one
transaction (insert API → insert version → set pointer); every read inner-joins the latest
version, so an API without one is never visible.

Migration `0002_api_versions.sql` (generated, then hand-edited, in one transaction):
create table → `insert into api_versions (id, api_id, version, title, description, document,
source_url, created_by, published_at) select id, id, version, title, description, document,
source_url, created_by, published_at from apis` (reusing the API's UUIDv7 as its first version's
ID) → add and fill `latest_version_id` → add the FK → drop the old columns. A migration test runs
it on a database with the spec 001/004 shape and a published API with a subscription.

Version order (computed in the server, returned already sorted): if every version name is
`semver.valid`, sort by `semver.rcompare`; otherwise by `published_at` desc. Change-summary
baseline: the version just below the new one in that order, computed over the existing versions
plus the new one, so uploading `1.1.0` after `2.0.0` compares with `1.0.0`, and uploading the
lowest version gives `changes = null`.

Transactions:
- Add version: `select … from apis where slug = $1 for update` → re-check version uniqueness →
  load the baseline document → compute summary → insert (unique violation → 409) → if
  `makeLatest`, set `latest_version_id`. Linting runs before the transaction.
- Set latest: `update apis set latest_version_id = v.id from api_versions v where …`; zero rows →
  404.
- Import API: as today, plus the version insert and pointer update inside the existing
  transaction.
- Seed: upsert the `apis` row by slug, upsert version `1.0.0` on `(api_id, version)` (refreshing
  its document as today), and set `latest_version_id` only when it's null, so an admin's choice
  survives restarts.

### Change summary (`src/changes.ts`, pure function, unit-tested)
`summarise(previous, next) → ChangeSummary`. Both documents are bundled, so only internal refs
need resolving (`#/components/parameters/*`, `#/components/requestBodies/*`; one level, cycle
guarded). Effective parameters = path-item parameters overridden by operation parameters on
`(in, name)`; `in: path` parameters are skipped (covered by the path template). Effective security
= operation `security` if present, else the root `security`. Reasons and their `breaking` flag as
in "What is breaking" above; output sorted by path, then method in the order GET, PUT, POST,
DELETE, OPTIONS, HEAD, PATCH, TRACE. `summary` is the new operation's `summary` (old for removed).

### Adapter calls
None. All versions share the API's Kong service, route, ACL group (`portal-svc-<serviceId>`) and
subscriptions (ADR 0005 unchanged). `importApi` still calls `protectService` exactly as today;
`importApiVersion` and `setLatestApiVersion` never call the adapter, so they work with Kong down.
The try-it allowlist uses `apis.route_path`, which every version shares, so try-it works on every
version's page.

### Portal (for the ui-designer and frontend)
- `/apis/[slug]` — latest version (unchanged URL). `/apis/[slug]/versions/[version]` — stable URL
  per version (AC 1), fed by `getApiVersionDocument`. `/apis/[slug]/changelog` — `getApiChangelog`.
  The switcher uses `ApiDetail.versions` as given (order and `isLatest`); it is hidden when there's
  one version unless the ui-designer decides otherwise.
- Release notes are plain text: render with preserved line breaks, never as HTML or Markdown.
- Admin: per-API "Add version" (spec source, release note, "Don't make this the default version"
  → `makeLatest: false`) and "Set as latest" per version. Both import forms list lint errors from
  `errors[]` on a 422 and lint warnings from `lintWarnings` on success (rule, message, pointer,
  line; `source` when not null).
- Demo mode (ADR 0004): `demoData()` gains one version and one changelog entry; no admin actions.

### Risks and how to test them
| Risk | Mitigation / test |
| --- | --- |
| Spectral packages misbehave in the server's ESM/TypeScript build or the Docker image. | First backend task is a spike: lint the sample in a unit test and in the built image (`docker compose up`) before building on it. |
| A Spectral upgrade adds error rules and starts refusing imports. | Unit test pins the default error-rule set; pin Spectral minor versions. |
| Unresolved internal `$ref` fails in the bundle step as `invalid-openapi`, not `invalid-ref` (AC 5). | Bundle fails only on external refs; integration test for the AC 5 `$ref` case asserts rule `invalid-ref`. |
| Spectral fetches external refs or `extends` itself (SSRF, slow imports). | Resolver serves only already-fetched files; ruleset loader `fetch` throws. Unit tests assert no network call. |
| Line numbers wrong for external files. | Findings carry `source`; test a URL import with an external file containing an error. |
| Migration loses data or breaks subscriptions. | Migration test on a populated spec 004 database: same API IDs, documents, subscriptions; catalog unchanged. |
| Concurrent imports of the same version. | Unique index + 409; integration test with two parallel imports, exactly one 201. |
| Linting a 5 MiB document is slow. | Integration test: 2 MiB generated document lints in under 10 s; record timing in Build notes. |
| Bad operator ruleset bricks the portal. | Server still starts and serves docs; health `degraded`; imports 503 (AC 8 tests). |
| Readers of the dropped `apis` columns missed. | `pnpm typecheck` fails on any leftover use; grep for `apis.title`/`apis.document` in review. |

### Tasks
- [x] [backend] Spike: add the Spectral dependencies and `semver`; lint the sample document in a unit test and confirm the server image builds and starts with them (record result in Build notes).
- [x] [backend] Drizzle schema: `api_versions` table and `apis` changes; migration `0002_api_versions.sql` with backfill; migration test on a populated spec 004 database.
- [x] [backend] Regenerate `packages/sdk` from the updated contract.
- [x] [backend] `src/lint/`: load the default ruleset file or `PORTAL_LINT_RULESET` (no network, no fallback); run Spectral on original text with the no-network resolver; map findings to `LintFinding` (1-based lines, JSON pointer, `source`, severity mapping, caps 100/200). Add `apps/server/rulesets/portal.spectral.yaml` with the full rule list and copy it into the Docker image.
- [x] [backend] Unit tests: default error-rule set equals the design table; sample seed document has zero errors; missing/invalid/network-`extends` ruleset files fail with the path in the message.
- [x] [backend] Refactor `importDocument` into the shared pipeline (steps 1–11), including the `invalid-api-version` check and external-only bundle failures.
- [x] [backend] `importApi`: write the first version and the latest pointer in its transaction; accept `releaseNote`; return `lintWarnings` and `versions`.
- [x] [backend] `src/changes.ts`: `summarise()` with the breaking rules; unit tests for each reason code, path-parameter renames, and `$ref`'d parameters.
- [x] [backend] `src/versions.ts`: `importApiVersion`, `setLatestApiVersion`, `getApiChangelog`, `getApiVersionDocument`; version order and baseline selection.
- [x] [backend] Update `catalog.ts`, `apps.ts`, `seed.ts`, `reconcile.ts`, `proxy.ts` to read the latest version; seed keeps an admin's latest choice.
- [x] [backend] `config.ts` `PORTAL_LINT_RULESET`; startup loads the ruleset without throwing, logs failures; `/api/v1/health` `lint` block and `degraded` status; imports 503 while degraded.
- [x] [backend] Docs: README/configuration (`PORTAL_LINT_RULESET`, rule list, extending the shipped file), upgrade notes for the migration, `docs/engineering-conventions.md` if it lists the `apis` shape.
- [x] [backend] Merge `origin/main` (spec 005, PR #8) into this branch: renumber 012's migration to `0002_api_versions` after `0001_gateway_connections`, regenerate the Drizzle snapshot/journal and the SDK, and combine the conflicting server, contract and portal changes so both specs work; full suite, quickstart and both specs' e2e/upgrade tests green.
- [x] [frontend] Reference page: version switcher from `ApiDetail.versions`, "latest" marker, versioned route `/apis/[slug]/versions/[version]`, 404 for unknown versions.
- [x] [frontend] Changelog page `/apis/[slug]/changelog`: version, import date, plain-text note, added/removed/changed with breaking markers; first version shows no summary.
- [x] [frontend] Admin: "Add version" form (spec URL/content, release note, "Don't make this the default version"), "Set as latest" per version, 409 version-exists message.
- [x] [frontend] Admin: show lint errors (422 `openapi-lint-failed`) and lint warnings (success) in both import forms with rule, message, location; 503 ruleset-unavailable message.
- [x] [frontend] Handle `gateway-service-already-linked` per the UX decision (offer to add a version to the linked API).
- [x] [frontend] Demo mode: `demoData()` with one version and changelog entry; demo build tests still pass.
- [x] [frontend] Fix pre-hydration upload bug: the version upload keeps a file chosen before hydration (or disables file entry until hydrated), so the failing regression "012 failure path: version upload cannot discard input before hydration" in `apps/portal/e2e/versions.test.ts` passes (see Bugs).
- [x] [frontend] Fix UAT-012-01: version pages decode the route parameter so an accepted version name containing `+` (e.g. `1.0.0+build.1` at `/apis/sample/versions/1.0.0%2Bbuild.1`) opens its published document; admin table, switcher and changelog links work, including on refresh; add a regression test (if the server lookup is at fault, fix it there and note it in Build notes).
- [x] [frontend] Fix duplicate-version alert heading: show a plain-language heading instead of the problem identifier words “api version exists” (see Bugs, minor copy).
- [ ] [qa] AC 1: import v2 onto a published v1 on the Compose stack; switcher, stable v1 URL, one catalog entry, same Kong service link (Playwright + API).
- [ ] [qa] AC 2 and AC 9: upload order and `makeLatest: false`; "Set as latest"; 403 for a developer, 404 for an unknown version.
- [ ] [qa] AC 3: changelog entry for the orders v1 → v2 example (note, date, `POST /orders` added, `GET /orders` removed and breaking).
- [ ] [qa] AC 4: duplicate version → 409, stored v2 unchanged; parallel duplicate imports → exactly one 201.
- [ ] [qa] AC 5 and AC 6: each error case (duplicate `operationId`, unresolved `$ref`, undeclared path param) refused with rule, message, pointer and line, for new API and new version; warning case published with warnings shown.
- [ ] [qa] AC 7 and AC 8: custom ruleset via a mounted file (`operation-description` error); default-only rule passes; missing/invalid file → log + health `degraded`, imports 503, no fallback; quickstart without the variable uses the default.
- [ ] [qa] Migration: existing published API and subscription survive the upgrade; try-it works on latest and older version pages; `docker compose up` quickstart still green in under five minutes.

## UX  _(ui-designer)_
Design: [docs/design/012-docs-versions-search-agents.md](../design/012-docs-versions-search-agents.md).
No new tokens.

- **Developer pages.** The reference page gets a version row under the title: a
  `VersionSwitcher` (shadcn DropdownMenu of real links, in `ApiDetail.versions` order, current
  version checked, **Latest** badge) and a **Changelog** link. With one version the existing
  `v{version}` badge stays and only **Changelog** is added. `/apis/{slug}/versions/{version}` shows the
  same header plus the notice "You're reading version 1.0.0. The latest is 2.0.0." with **View latest
  version**; unknown versions get a "Version not found" page. `/apis/{slug}/changelog` lists entries
  newest first: version, date, plain-text release note, a **Breaking changes** notice, and
  Added / Removed / Changed operation lists with **Breaking** badges and reasons.
- **Admin pages.** New `/admin/apis/{slug}` ("{title} versions"): versions table with **View** and
  **Set as latest** (no confirmation; idempotent), and an **Add a version** form (file/URL, release
  note with 5,000-character counter, **Don't make this the default version**, **Publish version**).
  `/admin/apis` gains a **Manage versions** column, a release-note field, a `LintFindings` list of
  errors on a 422 (rule, message, line/column, pointer, external source) and a collapsed warnings
  panel on success, and a page banner plus no-retry 503 message when the operator's ruleset failed to
  load.
- **Open question answered (ui-designer):** both. "Add a version" is a separate per-API action — the
  only place versions are published, with no Kong service, slug or route fields — and the import form
  keeps detecting a service with `linkedApiSlug`, replacing 004's dead-end warning with a link
  **Add a version to {title}** (also on the 422 `gateway-service-already-linked` refusal). The import
  form doesn't switch modes silently.
- Every state (loading, empty, error, success, no permission, demo), exact copy, keyboard path and
  focus order, and 375px/1280px layouts are in the design file, §3–§7.

## Build notes  _(backend-developer, frontend-developer)_

### Backend main integration — 2026-11-09
- Merged main at `db80714` (spec 005/PR #8) into this feature branch in signed-off merge `f69cd12`; preserved commit `33516a3` and the Codex user-tester configuration. Combined setup/gateway connections with version routes, lint health and import findings; the import form keeps gateway disabled/disconnected/outage states, release notes, lint findings and version links. Sample publication now returns the asynchronous version-aware API detail, and shared problem responses retain both gateway counts and lint error counts.
- Kept main's `0001_gateway_connections.sql` and `0001_snapshot.json` unchanged; regenerated `0002_snapshot.json` and the journal with Drizzle, then retained the transactional version backfill in renamed `0002_api_versions.sql`. Regenerated the SDK from the combined OpenAPI contract and updated the README upgrade filename. Drizzle's subsequent generate reports no schema changes.
- Adapted gateway publication fixtures and version-endpoint runtime injection to the combined schema/connection API. Database regressions cover fresh migration, pre-005 gateway upgrades, populated main schema with subscriptions and gateway settings retained, and a real main migration journal upgraded twice without replaying 0001 or duplicating backfilled versions.
- Verification: `pnpm lint` (7 tasks) and `pnpm typecheck` (12 tasks) pass. The initial uncached full suite passed 377 tests; after adding the journal regression, `NODE_OPTIONS=--no-experimental-webstorage pnpm test --concurrency=1 -- --maxWorkers=2` passes **378 tests** (192 portal, 127 server, 55 Kong adapter, 4 DB; 12 successful tasks, 6 cached). The new journal regression also passed independently against real PostgreSQL. Host Node 26 uses the existing webstorage workaround; production images use Node 22.
- Production verification: `COMPOSE_PROJECT_NAME=spec012merge node deploy/quickstart-smoke.mjs` passes in **105.6 s** including the normal cached-layer image build and fresh setup (not a cold benchmark), then verifies the environment-admin/Kong/sample path. `node deploy/server-image-smoke.mjs` and `node deploy/smoke.mjs` pass, covering packaged Spectral/default ruleset/migrations, unprivileged runtime, signup, app/key, real Kong authentication, try-it, one-time reveal and revocation.
- Combined `COMPOSE_PROJECT_NAME=spec012merge pnpm test:e2e`: **52 ordinary passes + 3 expected failures = 55 completed checks, exit 0, in 4.6 min**, including all eight 012 cases and spec 005's fresh wizard/sample/key/disabled-gateway journey. No new unexpected failures or regressions were found. The three failing desired-behavior assertions in `apps/portal/e2e/setup-gateways.test.ts` are:
  - **JSO-399: reloading the saved gateway retains the sample choice** (line 343): after saving shows “Add the sample API?”, reloading loses that panel and redirects away.
  - **JSO-405: first-load gateway outage retains import source fields** (line 380): the Gateway unavailable alert appears while Kong is down, but the OpenAPI file/source fields are absent on the first page load.
  - **JSO-406: gateway wizard has a single connection heading** (line 404): the wizard shows both “Connect your Kong” and the redundant “Connect a Kong” heading.
- **Origin/main evidence and expected-failure meaning:** these tests and their `test.fail(true, reason)` annotations are byte-for-byte unchanged from `origin/main` (`git diff origin/main -- apps/portal/e2e/setup-gateways.test.ts` is empty). Main's committed spec 005 Test report, “Fourth QA pass” and “Third QA pass” sections, already records **44 ordinary passes + the same 3 expected failures**, with the same symptoms in its bug table; its Review S5 explicitly retains these minor Backlog bugs as non-blocking. This task freshly reproduced all three on the combined branch; **it did not independently build and rerun origin/main alone**. The earlier baseline upgrade uses pre-005 `f52870e`, so it is not a standalone-main reproduction. They are expected because the existing tests deliberately assert the desired fixed behavior and mark these known, open bugs with `test.fail`; an unexpected pass would fail the suite and prompt removal of the annotation after verification. They remain open and are not counted as fixes or ordinary passes.
- Real pre-005 baseline `f52870e` → combined application upgrade: `SPEC005_BASELINE_DIR=/tmp/spec012-pre005-baseline SPEC005_UPGRADE_PROJECT=spec012mergeupgrade SPEC005_UPGRADE_IMAGE_PREFIX=spec012mergeupgrade pnpm exec playwright test --config tests/spec005-upgrade.playwright.config.ts` passes **1/1 in 3.1 min**. The same active key returns Kong 200 before/after; developer sessions and the published API survive, admin skips setup, gateway remains editable, and the documented protected-route recipe returns correct-token 200 / wrong-token 401. The separate DB regression verifies main's recorded 0000+0001 journal → 0002 without replaying prior migrations.
- Cleanup: removed only the owned `spec012merge` and `spec012mergeupgrade` projects/volumes and the four unique upgrade application image tags; mounted-ruleset and Testcontainers fixtures clean themselves up. No spec status or approval gate was changed; no new durable issue was needed. QA/review remains with the coordinator's assigned roles.

### Frontend UAT fixes — 2026-11-09 (build loop 2)
- Stable version pages decode the route segment before matching published versions, requesting the document through the SDK, rendering the selected version and generating metadata. Literal `+` stays `+`; malformed escapes return not-found. No server or contract change was needed.
- Duplicate-version import refusals now show **This version already exists** while retaining the explanation and form values. Component regressions cover encoded/literal plus routes, metadata, malformed routes, changelog links and the duplicate heading; existing admin-table and switcher encoding assertions remain.
- Validation: `pnpm lint` (7 tasks) and `pnpm typecheck` (12 tasks) pass. `NODE_OPTIONS=--no-experimental-webstorage pnpm test --concurrency=1 -- --maxWorkers=1` passes (250 tests: 139 portal, 70 server, 39 adapter, 2 DB; 11 unchanged Turbo tasks cached). An initial sandbox-only portal run hit three unrelated ingress `listen EPERM` failures; the full rerun with local listener access passes.
- Fresh production Compose quickstart: **81.3 s**. Targeted `pnpm exec playwright test --config deploy/playwright.config.ts --grep '012 AC1-4,6,9'`: **1 passed (11.2 s)** against real Kong/PostgreSQL, including publication of `1.0.0+build.1`, admin-table/switcher/changelog navigation, stable-page refresh, Scalar rendering and the duplicate refusal heading. Bugs remain unchecked for independent QA/UAT verification; spec status is unchanged. The major bug's durable Linear issue remains deferred under the recorded workspace issue-limit finding.

### Frontend fix — 2026-11-08
- Version publication now falls back to the native file input's selected file when the selection happened before hydration and React state is empty. Both size validation and document reading use that file; drag-and-drop selections continue to use React state.
- Added server-render/hydrate component regressions proving that an input populated before hydration publishes the selected document, and that an oversized pre-hydration selection is refused before reading or calling the API.
- Validation: `pnpm lint` (7 tasks), `pnpm typecheck` (12 tasks), and `NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @portal/portal test` (135 tests in 21 files, including all 10 version tests) pass. Docker/Compose, full workspace tests using Testcontainers, and the Playwright hydration regression are deferred to the QA re-test by coordinator instruction because spec 005 holds the shared Docker turn; the Bugs item remains open for QA verification. Spec status is unchanged.

### Frontend — 2026-11-08
- Added the shared Radix version menu, stable version routes (including encoded `+` names, unknown-version 404s, latest canonical metadata and the older-version notice), and server-rendered changelog entries with plain-text release notes and operation summaries.
- Added per-API version management, latest selection and version publishing through the generated SDK; both import forms now show detailed lint errors, collapsed warnings, ruleset failures, release notes and the linked-service hand-off (URL sources carry over).
- Demo data contains one version and first-release changelog entry; public demo routes avoid server calls. Component/page tests cover menu order/links, lint locations and truncation, publish/default selection, duplicate and ruleset refusals, latest-action focus, changelog safety, unknown versions and demo rendering.
- Frontend commit: `806a5c0`. Validation: `pnpm lint` and `pnpm typecheck` pass; the complete suite passes (242 tests: DB 2, Kong adapter 39, portal 133, server 68), including all 11 demo build/configuration tests. Final command: `NODE_OPTIONS=--no-experimental-webstorage pnpm test --concurrency=1 -- --maxWorkers=1` (12 successful Turbo tasks, 5m7s). The host's Node 26 needs that flag so jsdom supplies browser storage. An earlier two-worker run hit three transient gateway request/health failures; all 39 adapter tests then passed in isolation and again in the final full run. Frontend code is committed separately; the shared spec and lockfile remain for backend/coordinator reconciliation.

- Backend (2026-11-08): implemented version rows and a same-API latest pointer, transactional
  first/new-version imports, stable documents, changelog and set-latest endpoints, operation
  summaries, original-source Spectral linting and degraded ruleset health. The default ruleset
  has the seven configured error rules plus Spectral's core `invalid-ref`; custom rulesets replace
  it and cannot fetch network dependencies. Lint refusal/warning caps are 100/200, with full
  error count, escaped pointers, 1-based locations and external source URLs. SDK regenerated;
  README covers mounted configuration, extension and migration/rollback. Catalog, subscriptions,
  seed and proxy readers use version rows; reconcile already reads only unchanged API identity
  and gateway columns.
- Verification: `pnpm lint` and `pnpm typecheck` pass. The populated legacy migration and
  DB constraint tests pass (2 tests), and all backend tests pass (68 tests), including all six
  added endpoint/seed regressions: duplicates/concurrency, stable documents, patch baseline,
  set-latest permissions/404s, lint refusals with no writes, degraded configuration and seed
  preservation. The 2 MiB import pipeline measured 697–931 ms. Production image smoke caught
  Node 22's inability to expose Spectral's CommonJS re-exports as named ESM exports; the loader
  now uses default imports and destructuring (TypeScript and Vitest had accepted named imports).
  `NODE_OPTIONS=--no-experimental-webstorage pnpm test --concurrency=1` passes for the whole
  workspace (68 server, 2 DB, 133 portal and 39 adapter tests; unchanged adapter checks used
  the Turbo cache). The final `docker compose -f deploy/docker-compose.yml build server`
  succeeds; `node deploy/server-image-smoke.mjs` passes under Node 22 with network disabled,
  including the packaged default ruleset, seed, migrations and unprivileged production graph.
  An isolated Compose project (`portal012-backend`, host ports removed) starts the server against
  real Kong and PostgreSQL: health/lint are ok, the sample is seeded, version import keeps one
  catalog entry and the same service, stable v1 docs and changelog are served, set-latest works,
  and Kong still refuses a request without a key. The stack is removed after verification.
  Full portal/browser acceptance and the complete quickstart timing remain QA-stage checks.
  The host runs Node 26.13.0: native webstorage causes a pre-existing portal key-reveal test
  failure, and that isolated test passes with `NODE_OPTIONS=--no-experimental-webstorage`.

## Test report  _(qa-tester)_
| Criterion | Test file | Result |
| --- | --- | --- |
| AC 1: v2 switcher, stable v1, one catalog entry and Kong link | `apps/portal/e2e/versions.test.ts` (real Kong journey); `apps/server/src/app.test.ts`; `apps/portal/components/version-pages.test.tsx`, `versions.test.tsx` | PASS (Compose + automated tests); uploads after hydration. |
| AC 2: upload order/default and opt-out | `apps/portal/e2e/versions.test.ts`; `apps/server/src/app.test.ts`; `apps/portal/components/versions.test.tsx` | PASS (Compose + automated tests); uploads after hydration. |
| AC 3: orders added/removed, breaking flag, note and date | `apps/portal/e2e/versions.test.ts`; `apps/server/src/changes.test.ts`, `app.test.ts`; `apps/portal/components/versions.test.tsx` | PASS (Compose + automated tests); uploads after hydration. |
| AC 4: duplicate 409 preserves v2; concurrent imports exactly one 201 | `apps/portal/e2e/versions.test.ts`; `apps/server/src/app.test.ts` | PASS (Compose + automated tests); uploads after hydration. |
| AC 5: duplicate operationId, unresolved ref, undeclared parameter individually, both forms, 422 and locations, no writes | `apps/portal/e2e/versions.test.ts` (three separate tests); `apps/server/src/app.test.ts`, `lint/lint.test.ts`; `apps/portal/components/admin-apis.test.tsx`, `versions.test.tsx` | PASS (Compose + automated tests); uploads after hydration. |
| AC 6: warning-only import succeeds and displays findings | `apps/portal/e2e/versions.test.ts`; `apps/server/src/app.test.ts`; `apps/portal/components/admin-apis.test.tsx`, `versions.test.tsx` | PASS (Compose + automated tests); uploads after hydration. |
| AC 7: mounted operator ruleset replaces defaults | `apps/portal/e2e/versions.test.ts` (production-image custom ruleset); `apps/server/src/app.test.ts`, `lint/lint.test.ts` | PASS (Compose + automated tests); uploads after hydration. |
| AC 8: missing/invalid file logs path/reason, degraded health, imports 503, default quickstart | `apps/portal/e2e/versions.test.ts` (production-image missing/invalid rulesets); `apps/server/src/app.test.ts`, `lint/lint.test.ts` | PASS (Compose + automated tests); uploads after hydration. |
| AC 9: set latest updates reference, developer 403 unchanged, unknown version 404 | `apps/portal/e2e/versions.test.ts`; `apps/server/src/app.test.ts`; `apps/portal/components/versions.test.tsx` | PASS (Compose + automated tests); uploads after hydration. |
| Upgrade, try-it on latest/older reference, quickstart first call | `packages/db/src/versions-migration.test.ts`; `apps/portal/e2e/versions.test.ts`; `deploy/e2e/quickstart.spec.ts`; `deploy/quickstart-smoke.mjs`, `deploy/smoke.mjs` | PASS: migration, both try-it pages, first-call smoke; quickstart 163.4 s. |

QA run (2026-11-08/09): tests reused from the interrupted QA worker and reviewed/extended with real-stack developer authorization, unknown-version refusal and latest-default assertions. Added HTTP failure paths cover invalid/missing input, overlong notes, invalid version names, expired sessions, duplicate/concurrent requests and gateway outage (version publication deliberately needs no gateway call). The root Playwright command now discovers 50 tests, including seven new version/lint acceptance tests and the additional hydration regression through `deploy/e2e/versions.test.ts`.

- `pnpm lint`: PASS (7 tasks); `pnpm typecheck`: PASS (12 tasks).
- Lint and operation-diff unit tests: PASS (20 tests).
- Portal suite: first sandboxed run passed 130/133; three ingress tests could not bind listeners (`listen EPERM`). Re-run with local listener access: PASS, all 133 tests in 21 files (13.90 s); this was an environment restriction, not an application finding.
- Host Node 26 needs `NODE_OPTIONS=--no-experimental-webstorage` for jsdom storage; CI uses `.nvmrc` Node 22 and does not set this flag. Production Compose also uses Node 22.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm test --concurrency=1 -- --maxWorkers=1`: PASS, 244 tests (70 server, 133 portal, 39 Kong adapter, 2 DB); 12 Turbo tasks, 10 cached, 32.61 s. The modified server suite ran against real Testcontainers PostgreSQL.
- `node deploy/quickstart-smoke.mjs`: PASS, **163.4 s**, including image builds, healthy Compose services and seeded portal home (under 300 s). Fresh standard Compose project/volume; Docker image layers were cached where available. Production server/portal use Node 22.
- `node deploy/smoke.mjs`: PASS, seed → signup → app/key → real Kong 401 without key / 200 with key → try-it → one-time reveal → idempotent revocation / 401.
- `node deploy/outage-smoke.mjs`: PASS, Kong outage 503/no partial app/retry with one consumer and credential; server outage error page without demo fallback.
- `pnpm test:e2e`: initial full run **44 passed, 5 failed** (49 tests, 3.1 min). One legacy missing-`info` assertion expected the old schema error; updated it to the approved import-pipeline step 4 (`invalid-api-version`, `/info/version`) without weakening the refusal/no-write checks. Four new journeys exposed the pre-hydration upload bug below. No application code was changed.
- Targeted re-run `pnpm exec playwright test --config deploy/playwright.config.ts --grep '012|admin imports files'`: **8 passed, 1 failed** (29.3 s). All seven spec 012 acceptance tests and the updated legacy import journey pass; the added hydration regression fails. Post-hydration acceptance flows explicitly wait for page network idle before choosing a file. The other 41 original tests passed in the full run; no unexecuted criteria remain.
- Re-ran the final hydration regression independently with actual file selection while scripts are held: **FAIL**, publish shows “Choose an OpenAPI file.” and no published-version status. This is reproducible, not a flaky timeout or gateway readiness failure.
- All Compose test containers, operator-ruleset one-off containers, network and test volume were removed; `docker ps` was empty before the coordinator handed Docker to spec 005. No other worktree's containers were stopped or removed.
- Open-bug retest: the incoming Bugs section contained only a placeholder, with no concrete open bugs or durable bug keys to retest.


### QA re-test — 2026-11-09 (build loop 1)
- Re-tested frontend fix `e5fc818`: the real Compose Playwright regression **012 failure path: version upload cannot discard input before hydration** passes, selecting an actual file while JavaScript is held and publishing after hydration. Both component regressions (valid selection and oversized selection before hydration) also pass. The sole incoming open bug is verified fixed; the previous criterion-to-test mapping and failure-path coverage above still apply.
- `pnpm lint`: PASS (7 tasks); `pnpm typecheck`: PASS (12 tasks), including a fresh portal check after QA test edits.
- Portal tests: PASS, **135 tests in 21 files** (5.26 s). The first sandbox-only attempt had 3 `listen EPERM` ingress failures; the rerun with local listener access passed all tests. Host Node 26 used `NODE_OPTIONS=--no-experimental-webstorage`.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm test --concurrency=1 -- --maxWorkers=1`: PASS, **246 tests** (135 portal, 70 server, 39 Kong adapter, 2 DB), 12 successful Turbo tasks in 16.81 s. The changed portal suite ran fresh; 11 unchanged tasks reused the earlier validated cache.
- Fresh `node deploy/quickstart-smoke.mjs`: PASS, **112.1 s**, including production image builds, new volume, healthy real Kong/Postgres/server/portal and seeded catalog. `node deploy/smoke.mjs`: PASS for signup, app/key creation, real Kong 401/200, try-it, one-time key and idempotent revocation.
- Browser reruns exposed test defects, recorded and fixed within QA ownership: Scalar introduces multiple `main` elements (use portal `#main`); the virtual timeout must start after the apps request is observed; the gateway rate-limit test must clear its exhausted shared budget in `finally`; the hydration regression must use an isolated API so the seeded sample retains its single-version layout; newly created Kong routes need an authenticated readiness check before a one-shot browser call. These are transient test findings, with no application changes or durable Bug issue needed.
- Initial full browser run: 47 passed / 3 failed (strict locator, clock race and shared rate-limit budget); targeted re-run: all eight 012 tests passed, with two unrelated sample-title failures caused by rerunning after the original hydration test changed the sample default. Fresh full re-run: 49 passed / 1 failed (Kong route propagation, real response `404 no Route matched with those values`); readiness assertion added without weakening the browser's 200 assertion. A further full run passed every 012 test (48/50 total); two badge-layout assertions encountered the extra versions left on the sample by previous hydration runs, confirming the need for an isolated regression fixture.
- Final clean `pnpm test:e2e`: **PASS, 50/50 tests (1.7 min)**, including all eight spec 012 tests, both latest/older-version try-it requests, mounted custom/missing/invalid rulesets, all access-retry failure cases, and the real pre-hydration upload regression. All observed test failures have deterministic fixes and pass in this full run; no unresolved flaky cases or application findings remain.
- Teardown: removed only QA's Compose containers, network and PostgreSQL test volume; operator-ruleset containers cleaned up in their tests; `docker ps` was empty. Coordinator notified immediately and handed Docker back to spec 005; no further Docker use by this QA task.
- Outcome: all criteria retain passing automated coverage, the sole incoming bug is verified fixed, no durable Bug issues are required, and status is **uat** for browser user testing (no approval gate passed).

### QA re-test — 2026-11-09 (build loop 2)
- Independently verified frontend fix `99986f4`. The existing AC 1–9 criterion-to-test mapping above remains complete and passing; reviewed the new plus-version route/metadata, admin-table, switcher, changelog and duplicate-heading regressions rather than duplicating them. No application code or tests needed changes in this re-test.
- **UAT-012-01: PASS.** `apps/portal/e2e/versions.test.ts`, **012 AC1-4,6,9: real Kong versions, stable references, changelog, defaults and duplicate refusal**, publishes `1.0.0+build.1` as non-default, opens its encoded stable URL from the admin table, refreshes it, and follows the switcher and changelog links. The older-version notice and Scalar reference render; the single catalog entry and service link remain unchanged. `apps/portal/components/version-pages.test.tsx` verifies both encoded and decoded route parameters resolve the published document and metadata; `versions.test.tsx` verifies encoded links.
- **Duplicate-version heading: PASS.** The same real-stack journey asserts **This version already exists** in the alert heading, the corrective instruction, HTTP 409 and the unchanged stored document. Its component regression also passes. Both incoming open Bugs are now checked below; the frontend Fix tasks were already checked before this re-test.
- `pnpm lint --force`: **PASS**, all 7 tasks freshly executed (10.00 s). `pnpm typecheck --force`: **PASS**, all 12 tasks freshly executed (12.45 s).
- `NODE_OPTIONS=--no-experimental-webstorage pnpm test --force --concurrency=1 -- --maxWorkers=1`: **PASS, 250 tests** (139 portal, 70 server, 39 Kong adapter, 2 DB), 12 successful tasks, **0 cached**, 1m44.97s. Real Testcontainers PostgreSQL/Kong tests ran, including legacy migration preservation. Existing failure-path coverage for invalid input, expired sessions, missing permissions, unknown versions, concurrent duplicates, gateway outage and broken rulesets remains green.
- `node deploy/quickstart-smoke.mjs`: **PASS, 15.9 s**, including production Compose image build/start, healthy services and seeded home page, using available build layers and a new QA database volume. `node deploy/smoke.mjs`: **PASS**, signup → app/key → real Kong 401 without key / 200 with key → try-it → one-time reveal → idempotent revocation / 401.
- `pnpm test:e2e`: **PASS, 50/50 tests (1.8 min)** on the first full run, including all eight 012 tests, latest/older-reference try-it calls, custom/missing/invalid mounted production rulesets and the earlier hydration regression. No new application findings, unresolved test failures or flaky cases were observed.
- Environment: initial sandbox attempts could not access Docker (`permission denied` / no container-runtime strategy); reran the complete suite with authorized Docker and local-listener access. Host Node 26 used the documented webstorage flag; production images use Node 22. These sandbox failures were environment restrictions, not product bugs.
- Teardown: removed only this QA Compose project's containers, network and PostgreSQL volume; operator-ruleset containers cleaned up in their tests, and `docker ps` was empty. Returned Docker to the coordinator before finalizing this report; no further Docker use.
- Outcome: **uat**. Both incoming bugs are verified fixed and no bugs remain open. The previously deferred major Bug creation remains recorded as history (Linear's free-plan limit); there is no remaining durable fix work to track. Browser UAT re-check and later review remain with their assigned roles; no approval gate passed.

### QA re-test — 2026-11-09 (post-main integration)
- Scope: independently tested the combined branch after `f69cd12`, `4e473e0` and `4005ac0` against main `db80714`. AC 1–9 retain the complete criterion-to-test mapping above; all eight `apps/portal/e2e/versions.test.ts` cases passed in the first full browser run, including the encoded `+` version, duplicate heading and pre-hydration regressions. No incoming spec 012 bug was open, and none of those previously fixed bugs recurred.
- Failure paths retained and passed: malformed/missing input, invalid version names, overlong release notes, concurrent duplicate publication, missing permission, expired admin sessions, unknown versions, gateway outage, and custom/missing/invalid mounted rulesets. Reviewed existing coverage instead of duplicating these tests; no application code was changed.
- `pnpm lint --force`: **PASS, 7/7 tasks, 0 cached** (final 18.791 s). `pnpm typecheck --force`: **PASS, 12/12 tasks, 0 cached** (final 24.676 s). `NODE_OPTIONS=--no-experimental-webstorage pnpm test --force --concurrency=1 -- --maxWorkers=2`: **PASS, 378 tests** (192 portal, 127 server, 55 Kong adapter, 4 DB), **12/12 tasks, 0 cached, 3m13.781s**. Host Node 26 uses the documented webstorage flag; production images use Node 22.
- The first uncached workspace attempt stopped at a single inherited adapter conformance failure: the query-key echo still contained its synthetic credential after another request's status had converged. An unchanged fresh-container adapter rerun passed 55/55; server tests skipped by Turbo were independently completed (127/127). Changed only `packages/adapter-kong/src/conformance.test.ts`: poll the actual credential-stripping and consumer-identity behavior for each header/query source (15 s bound), retaining HTTP 200, absence of the key and exact consumer identity. No fixed sleep or application workaround was added. The final uncached 378-test run passes with this check; formatter and diff checks pass.
- Fresh `COMPOSE_PROJECT_NAME=spec012qa node deploy/quickstart-smoke.mjs`: **PASS, 18.6 s** to first-run setup, including production image build/start using available cached layers and a new volume (not a cold-build benchmark). It verifies empty Kong/catalog, setup-only access and blocked signup, then replaces the stack with a fresh environment-admin/Kong/sample installation. `node deploy/smoke.mjs`: **PASS**, signup → app/key → real Kong 401/200 → try-it → one-time reveal → idempotent revocation/401.
- Database upgrades: `packages/db/src/versions-migration.test.ts` passes both populated legacy-schema → `0001_gateway_connections` → `0002_api_versions` preservation (subscriptions, API document, source and disabled/environment-managed gateway) and main's recorded migration journal → 0002, run twice. The existing journal hashes/timestamps remain unchanged, exactly three migrations are recorded and exactly one latest version is backfilled. The other two DB migration regressions also pass against real PostgreSQL.
- First full `pnpm test:e2e`: **51 ordinary passes + 3 expected failures + 1 unexpected failure = 55 completed, exit 1, 5.1 min**. All 012 cases pass. The unexpected failure is the already-recorded spec 005 intermittent newly imported route try-it 404: this run's `application/json` first call returned 404 after direct Kong 403, and the same-route diagnostic retry recovered to 403 after two requests in 131 ms. The first-call assertion remains intact. This is an inherited open minor, not a new 012 regression or a claimed fix; see spec 005 Test report / Review ruling 3. Fresh-volume full rerun: **52 ordinary passes + the same 3 expected failures = 55 completed, exit 0, 4.4 min**; all eight 012 tests pass again. This passing rerun does not close the intermittent 404 finding.
- JSO-399/405/406: freshly reproduced the same three `test.fail(true, reason)` desired-behavior assertions as main. `git diff origin/main -- apps/portal/e2e/setup-gateways.test.ts` is empty, and main's committed fourth QA report records 44 ordinary passes plus these same three failures. Symptoms remain lost sample choice after reload, missing source fields on first-load outage, and duplicate gateway heading; none is counted as a fix or ordinary pass. This pass did not independently build/run main alone. Linear currently marks all three **Done**, contrary to main's open/Backlog report; posted fresh evidence on each and preserved their completed states for coordinator reconciliation.
- Durable follow-up: no matching 404 Bug was found by Linear search. Retried filing **Bug: newly imported route intermittently returns 404 through try-it**, team JSO, project API Portal, label Bug, priority Low, state Backlog, no parent (out-of-scope follow-up); Linear again returned **Usage limit exceeded**. The intended issue and fresh reproduction remain here and in the feature summary so the coordinator can file it when capacity returns. No required finding was dropped.
- Independent end-to-end upgrade: `SPEC005_BASELINE_DIR=/tmp/spec012-pre005-baseline SPEC005_UPGRADE_PROJECT=spec012qaupgrade SPEC005_UPGRADE_IMAGE_PREFIX=spec012qaupgrade pnpm exec playwright test --config tests/spec005-upgrade.playwright.config.ts`: **PASS, 1/1, 5.3 min including baseline and replacement image builds**. This is the coordinator-approved pre-005 `f52870e` baseline (its Compose file was compared to that commit), not a claim to have rerun main alone. The same key returns real Kong 200 before/after, the developer session and API survive, admin bypasses setup, gateway editing works, and the documented protected-route recipe returns correct-token 200 / wrong-token 401. Main-schema 0001→0002 compatibility is separately verified by both DB regressions above.
- Teardown: removed only `spec012qa` and `spec012qaupgrade` containers/networks/volumes and the upgrade test's four unique image tags; mounted-ruleset and Testcontainers fixtures cleaned up. Docker inventory is empty; no further Docker work is needed by this stage. Logs: `/tmp/012-qa-{lint-final,types-final,tests-final,quickstart,smoke,e2e,e2e-final,upgrade}.log`.
- Outcome: **uat** under the role's blocker/major gate: all spec 012 criteria and regressions pass, no spec 012 bug or new blocker/major is open, and no application code was changed. The inherited spec 005 minors remain explicit above, including the intermittent 404 even though the fresh rerun passes; they retain main's recorded non-blocking disposition. No approval or merge gate was passed.

### Bugs
<!-- One line per bug, each with its Linear issue: - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [x] QA inherited credential-stripping readiness check (minor, tests only): a different request's 200/403 did not establish that the current request observed the key-auth update. An unchanged fresh-container rerun passed; bounded assertions now verify key removal and consumer identity separately for header/query requests, and the full uncached 378-test suite passes. Root cause was not independently established; no application fix is claimed. See post-main integration report for the initial failure and passing reruns.
- Inherited spec 005 findings remain tracked in its Bugs section: JSO-399/405/406 and the quota-deferred intermittent try-it 404. Fresh evidence and the Linear state discrepancy are recorded in this Test report; none is introduced or claimed fixed by spec 012.

- [x] Pre-hydration version upload loses the chosen file (minor, frontend; stays in this spec, no durable Linear issue).
  - Repro: sign in as admin; delay `/_next/static/**/*.js*`; open `/admin/apis/sample` at the initial HTML response; select a valid OpenAPI file in the enabled input; release scripts and wait for hydration; click **Publish version**.
  - Expected: preserve the selected file and publish it, or disable file entry until the event handlers can retain the selection. Actual: the DOM accepts the file but React's file state stays empty; submission says **Choose an OpenAPI file.**, makes no import request and publishes nothing. Re-selecting the file after hydration recovers; no published data is corrupted.
  - Automated evidence: `apps/portal/e2e/versions.test.ts`, **012 failure path: version upload cannot discard input before hydration**. This final regression selects a real file before hydration and expects a successful publish after scripts resume; it failed before frontend fix `e5fc818` and now passes in the Compose re-test. The initial real browser journey reproduced the original issue without injected delay.
  - Verified fixed on 2026-11-09 by the Compose regression and both valid/oversized pre-hydration component regressions. No blocker/major findings or durable bugs exist; QA has not changed application code.

- [x] QA test strict-locator and virtual-clock races (minor, tests only): nested Scalar `main` elements caused strict-mode violations; the timeout sometimes advanced before hydration started the request. Scope to `#main` and wait for the intercepted apps request before advancing time; all six failure cases pass in the final full run.
- [x] QA shared-fixture isolation (minor, tests only): rate-limit exhaustion returned 429 to later try-it requests, and hydration publication on the sample changed its title/version layout on rerun. Reset the server budget in the rate-limit test's `finally` and publish hydration versions on an isolated API; the final full run passes all badge and version checks.
- [x] QA Kong route readiness (minor, tests only): a freshly created route returned 404 `no Route matched with those values` before workers observed it. Poll a real authenticated gateway call before the browser journey; the browser still requires 200 on both stable version pages and passes in the full run.


- [x] UAT-012-01 Published versions containing `+` open **Version not found** (major, frontend; durable Bug deferred because Linear rejected creation at its free issue limit).
  - Repro: publish `docs/uat/012/fixtures/1.0.0+build.1.json` on `/admin/apis/sample` with the non-default checkbox selected; follow **View version 1.0.0+build.1**. The 201-success/table lists the version, but `/apis/sample/versions/1.0.0%2Bbuild.1` says the API has no version `1.0.0%2Bbuild.1`; refresh reproduces at 1280×900 and 390×844.
  - Expected: a published, accepted version with an allowed `+` name has a working stable reference. Evidence: `docs/uat/012/17-plus-version-not-found.png`, `docs/uat/012/browser-log.jsonl`; full report: `docs/uat/012/README.md`.
  - Intended Linear issue: **UAT: published versions containing + open Version not found**, parent **JSO-240**, team **JSO**, label **Bug**, priority **High**, state **Todo**. Creation was deferred until capacity returned; the attempted write returned **Usage limit exceeded**. The fix is now independently verified and closed in this spec; no durable fix remains pending.
  - [x] Fix: resolve encoded accepted version names to the published document; browser re-test the admin table, switcher and changelog entry links, including refresh.
  - QA verified fixed on 2026-11-09 in the full Compose Playwright run (50/50) and fresh component suite; see build loop 2 re-test above. Original issue-creation failure is preserved as history; no durable fix remains open. Browser UAT independently verified the admin-table link and refresh, mobile keyboard switcher and desktop changelog link on 2026-11-09; evidence `35-recheck-plus-admin-link-refresh.png`, `36-recheck-plus-switcher-mobile.png` and `38-recheck-plus-changelog-link.png` in `docs/uat/012/`.
- [x] Duplicate-version alert heading exposes “api version exists” (minor copy, current frontend loop; no separate issue). Steps: upload 2.0.0 twice on the version form; expected plain-language heading, actual lowercase problem identifier words above a helpful explanation. Evidence: `docs/uat/012/12-duplicate-refused.png` (390×844); refusal itself works and preserves published data. QA verified fixed on 2026-11-09: the full Compose regression asserts **This version already exists**, 409 and unchanged stored data; the component regression also passes. Browser UAT independently verified the heading, correction text and 409 refusal on 2026-11-09; `docs/uat/012/39-recheck-duplicate-heading-mobile.png`.


## User testing  _(user-tester)_

UAT completed in Orca’s built-in browser on 2026-11-09 against fresh Compose with real Kong/Postgres. Startup using existing images took **15.20 seconds**. Desktop 1280×900 and mobile 390×844, keyboard navigation, browser console/network checks, wrong/empty input, duplicate refusal, refresh/back, signed-out and developer permissions, custom/missing/invalid rulesets, signup/app/key and a real older-reference 200 call are recorded in [the UAT report](../uat/012/README.md) and `docs/uat/012/browser-log.jsonl`.

| User story | Result | Screenshot |
| --- | --- | --- |
| Admin imports a new version of one API | PASS (numeric versions, single catalog entry/service) | `docs/uat/012/02-v2-published.png` |
| Admin patches an older version without changing default | PASS (1.1.0 non-default; 1.2.0 default when opt-out cleared) | `docs/uat/012/21-custom-replaces-default.png`; browser log records both patch flows |
| Admin chooses any version as latest | PASS (set 2.0.0 back to latest, public default updated) | `docs/uat/012/26-switcher-mobile.png`; browser log |
| Admin writes notes and gets a useful change summary | PASS (note/date, POST added, GET removed/breaking) | `docs/uat/012/10-changelog-desktop.png`, `09-changelog-mobile.png` |
| Admin gets actionable lint refusals | PASS (all three error cases separately, both forms, no bad rows) | `docs/uat/012/13-duplicate-operation-error-mobile.png`, `14-unresolved-ref-error-mobile.png`, `15-parameter-error-mobile.png`, `19-new-api-lint-refused.png` |
| Admin can publish warning-only documents | PASS (published, collapsed warning count, keyboard expansion and locations) | `docs/uat/012/03-warnings-expanded.png` |
| Operator replaces the lint ruleset | PASS (custom error blocks; absent default rule permits; missing/invalid files pause imports) | `docs/uat/012/20-custom-ruleset-refusal.png`, `21-custom-replaces-default.png`, `22-missing-ruleset-banner.png`, `25-invalid-ruleset-banner.png` |
| Developer switches versions and reads changelog | PASS after build-loop-2 browser re-check; accepted `+` version links, refresh, numeric links, older notice, changelog, keyboard and mobile work | `docs/uat/012/36-recheck-plus-switcher-mobile.png`, `38-recheck-plus-changelog-link.png`, `08-older-version-mobile.png`, `32-older-version-try-it-200.png` |

**Outcome: review.** Build-loop-2 UAT re-check on 2026-11-09 independently verifies both original findings fixed in Orca's built-in browser after frontend `99986f4` and QA `0a1b097`: the accepted `1.0.0+build.1` reference works from the admin table, switcher and changelog, including refresh, decoded title, older notice and Scalar document rendering; duplicate refusal now says **This version already exists** with its corrective instruction and HTTP 409. Evidence: `docs/uat/012/34-recheck-plus-published.png` through `43-recheck-single-catalog-entry.png`, `recheck-browser-log.jsonl` and the report's Browser re-check section.

Fresh real-Kong/Postgres Compose started in **12.45 seconds** using existing images. Quick smoke passed new/default publication, non-default patch, release-note operation diff, keyboard warning expansion, lint refusal with location, Set as latest, public default and one catalog entry; desktop 1280×900 and mobile 390×844 were inspected. The original complete operator/custom/missing/invalid ruleset, permissions, signup/app/key and real older-version try-it evidence remains valid under the coordinator's focused re-check scope. Console/network checks found no new product errors; deliberate 409/422 refusals worked. No blocker/major or minor remains open, the deferred Bug was never created and no durable fix remains pending; normal uploads passed, while the earlier hydration and QA-only fixes retain QA's deterministic verification. Compose was torn down with its fresh test volume, Docker was empty and the coordinator acknowledged handback. No application code/tests changed or approval gate passed.


### Post-main-merge browser smoke — 2026-11-09

**PASS → review.** Focused Orca browser UAT on merged `a081bdf` against fresh real-Kong/Postgres Compose (18.28 s startup with existing images) passed setup → test/save bundled Kong → publish sample, connected gateway/Edit/Cancel, import's linked-service handoff, version publication, keyboard warning expansion, actionable lint refusal, non-default `+` publication/table link/refresh, mobile version menu, numeric switcher navigation, release-note operation diff, Set as latest/public default and one catalog entry. The duplicate-version heading remains fixed; no new product finding or spec 012 blocker/major is open.

Screenshots `44-postmerge-setup-gateway.png` through `57-postmerge-single-catalog.png` and `post-merge-browser-log.jsonl` are documented in [the post-merge UAT report](../uat/012/README.md#post-main-merge-browser-smoke--2026-11-09). Desktop 1280×900 and mobile 390×844 inspected; console samples have no JavaScript errors and recent network samples show successful loads plus deliberate 422. The earlier complete eight-story/operator/permissions/real-call UAT stands under the coordinator's focused scope; inherited spec 005 JSO-399/405/406 and intermittent try-it 404 are not re-filed, closed or claimed fixed. This screen/handoff smoke did not repeat those reload/outage/try-it cases. Compose containers/network/fresh volume removed and Docker empty; no application or test edits or approval gate passed.

## Review  _(tech-lead)_

### Code review — 2026-11-09
Scope: `git diff main...HEAD` (130 files) against the acceptance criteria, the Technical design,
ADR 0007 and the contract.

**Checks run**
- `pnpm lint`: PASS (7 tasks). `pnpm typecheck`: PASS (12 tasks).
- `pnpm test` (plain, host Node 26): one failure, `key-reveal-dialog.test.tsx:57` (`localStorage`
  undefined). This is the known Node 26 native-webstorage problem recorded by build and QA; the
  test isn't touched by this branch, and CI/production use Node 22 (`.nvmrc`, Dockerfile). Turbo
  then stopped the server suite.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm test --concurrency=1 -- --maxWorkers=1`:
  **PASS, 250 tests** (139 portal, 70 server, 39 Kong adapter, 2 DB), real Testcontainers
  PostgreSQL included.
- Quickstart and e2e were not re-run in this review; QA's build-loop-2 evidence (Compose
  quickstart PASS, `pnpm test:e2e` 50/50, `deploy/smoke.mjs` PASS) is against the same
  application code (`HEAD` adds only UAT evidence since then).

**Against the checklist**
- Acceptance criteria: AC 1–9 each map to passing tests at server (`app.test.ts`,
  `lint/lint.test.ts`, `changes.test.ts`), DB (`versions-migration.test.ts`), component and
  real-Kong Playwright level (`apps/portal/e2e/versions.test.ts`). AC 8's no-fallback is enforced
  in `lint/index.ts:56-64` (load failure keeps `ruleset` undefined) and `requireLinter` (503).
- Contract and data model match the design: paths, status codes and problem types in
  `openapi.yaml`; `api_versions` table, composite latest-version FK and backfill in
  `0001_api_versions.sql`; no leftover reads of the dropped `apis` columns (grep and typecheck
  clean). The default ruleset's error set equals the design table, and a unit test pins it.
- Errors are problem+json, including `errors[]` + `errorCount` for lint refusals. Inputs are
  validated with zod (version name regex, 5000-char note, strict bodies). The Spectral resolver
  serves only already-fetched files, `file:` refs are refused, and the ruleset loader can't fetch,
  so there's no new SSRF path. Nothing secret is logged or returned.
- Gateway: versions make no adapter calls (`versions.ts` has none); `importApi` still protects
  the service exactly as before.
- Release notes render as plain text (`release-note.tsx`, `white-space: pre-wrap`), never HTML.
- The ruleset is copied into the image (`apps/server/Dockerfile:28`) and resolved relative to
  `dist/` (`lint/index.ts:34-36`). README documents `PORTAL_LINT_RULESET` and the upgrade.

**Blocking**
- None.

**Suggestions** (non-blocking; none needs its own Linear issue)
- [ ] `apps/server/src/versions.ts:41-45` (and the existing `catalog.ts:73-77`): `find()` loads
  every published API with its latest document and filters by slug in JS. `importApiVersion`
  calls it twice (`:102`, `:175`). Query by `apis.slug` instead, ideally through one shared
  helper in `catalog.ts`.
- [ ] `apps/server/src/catalog.ts:30-35`: `apiDetail` selects every column of every version,
  including `document` and `source_content`, only to sort and list names. Select
  `id, version, publishedAt`. The same applies to the changelog query (`versions.ts:52-57`).
- [ ] `apps/server/src/versions.ts:131-142`: the add-version transaction loads every version's
  document to choose one baseline, and builds the new entry by spreading `existing[0]!`.
  Order on light rows, then load only the baseline's document. This is clearer and avoids
  reading N documents under the row lock.
- [ ] `apps/portal/app/apis/[slug]/versions/[version]/page.tsx:84-88`: the server fetches the
  whole version document only to check for 404, then `Reference` fetches it again on the client.
  `selected` (`:82-83`) already proves the version exists, so drop the server fetch or pass the
  document through.
- [ ] `apps/server/src/import.ts:35-40`: `inputSchema.spec` repeats `specSchema` (`:28-31`);
  reuse it.
- [ ] Branch hygiene: commit `33516a3` (user-tester on Codex in `factory.config.json`,
  `AGENTS.md`, `docs/team-charter.md`) is unrelated to spec 012. Call it out in the PR
  description, or merge it separately.
- [ ] Local DX: plain `pnpm test` fails on Node 26 hosts (`key-reveal-dialog.test.tsx`). This
  predates the branch; consider having the portal Vitest config disable native webstorage (or
  pin `engines.node`) so contributors don't need the flag.

**Verdict:** no blocking findings → `status: approved`. Merging is Elango's gate.

### Merge re-review — 2026-11-09
Scope: the main-integration merge `f69cd12` (main `db80714`, spec 005), checked with
`git show --remerge-diff f69cd12`, plus the follow-ups `4e473e0` and `4005ac0`, then QA `a081bdf`
and UAT `6325bcc`. This covers all nine conflicted files and the files that merged cleanly but
were adapted to the new schema.

**Checks run**
- `pnpm lint`: PASS (7 tasks). `pnpm typecheck`: PASS (12 tasks).
- `pnpm test` (plain, no Node flag, every test task a cache miss): **PASS, 378 tests**
  (192 portal, 127 server, 55 Kong adapter, 4 DB), 12/12 tasks.
- `openapi-typescript` regenerated from `apps/server/openapi.yaml` is byte-identical to
  `packages/sdk/src/schema.d.ts`.
- Drizzle snapshot chain: `0000 → 0001 → 0002` (`prevId` links are correct; 0002 adds
  `api_versions`, 11 → 12 tables). The journal order is `0000_0000_init`, `0001_gateway_connections`
  (main's entry, unchanged), then `0002_api_versions` with a later `when`.
- `git merge-tree HEAD origin/main` is clean. Main has moved on to `eba970a` (PR #9). Since
  `db80714` it has changed only the CI compose-smoke timeout, the expected-failure waits in
  `setup-gateways.test.ts`, and spec 005's status and notes.

**Conflict resolutions verified**
- `openapi.yaml`: the `/health` description keeps both the lint `degraded` text and the
  null-gateway text. `Health` requires `lint`, and `gateway` stays `oneOf null | object`. Both the
  `Version` and `GatewayId` path parameters are kept.
- `app.ts`: `loadLinter` and its error log run alongside the instance/`gatewayConnection` setup.
  `registerImport(…, connection, linter)`, `registerVersions(…, linter)`, `registerApps(…, connection)`
  and `registerProxy(…, connection.adapterFor, …)` are all wired. Nothing from either side was
  dropped.
- `import.ts`: imports use the gateway connection (`requireEnabled`, re-checked under the
  transaction lock), the lint pipeline, and writes to `api_versions` plus `latestVersionId`. The
  disabled-gateway and disconnected-gateway problems still precede any adapter call. Adding a
  version (`versions.ts`) still makes no gateway call, so it works while Kong is down or disabled,
  as designed.
- `problem.ts`: the constructor is `(…, errors, fields, errorCount)`, and the handler spreads both.
  The only five-argument caller, `lint/index.ts:130-136`, passes `undefined` for `fields`. The
  `gateways.ts` callers pass `fields` in fourth position, as before.
- `seed.ts`: main's idempotent Kong seeding and `DbConnection` type are combined with 012's
  transactional `apis` + `api_versions` + `latestVersionId` write. `gateways.ts:414` awaits the new
  async `apiDetail(db, …)`.
- `admin-apis.tsx`: keeps the `RulesetBanner`, the `LintWarnings`, the release note under More
  options, the link to add a version from an already-linked service, and `ImportProblem` for lint
  refusals. From main it keeps the service loading, outage and disabled/disconnected states, and
  the gateway-disabled/gateway-not-connected problem titles. The outage banner now reads
  `gateway?.reachable` (null-safe).
- Migrations: main's `0001_gateway_connections.sql` and snapshot are unchanged. The renamed
  `0002_api_versions.sql` is the same SQL as the reviewed `0001_api_versions.sql`, with the
  transactional backfill. `versions-migration.test.ts:75` upgrades a real main 0000+0001
  journal to 0002 twice, without replaying 0001 and without duplicate versions. The README
  upgrade note names `0002_api_versions.sql`.
- Tests and fixtures (`app.test.ts`, `setup-gateways.test.ts`) are adapted to `adapterFor` and
  the versioned `apis` shape without loosening any assertion.

**Blocking**
- None.

**Suggestions** (non-blocking; none needs its own Linear issue)
- [ ] Before opening or refreshing the PR, merge `origin/main` (`eba970a`) again so the branch
  picks up the compose-smoke timeout of 20 minutes (`.github/workflows/ci.yml:42`). Spec 012 adds
  e2e cases to that job, so the old 10-minute limit is likely to time out in CI. The merge is
  conflict-free.
- [ ] Dev databases created from this branch *before* `f69cd12` have `0001_api_versions` recorded.
  Drizzle compares timestamps, so it would skip `0001_gateway_connections` and then fail on
  `0002`. Only pre-merge preview or test volumes are affected, never main installs. Reset those
  volumes (`docker compose down -v`); no code change is needed.
- [ ] `seed.ts:66-73`: the conflict branch of `apis.slug` doesn't refresh `gatewayId`. It can't run
  today, because the function returns early when `sample` exists, but setting `gatewayId` there
  too would keep the upsert self-consistent.
- The earlier review's suggestions still stand. Its reference to `0001_api_versions.sql` now
  means `0002_api_versions.sql`. Plain `pnpm test` passes on this host now, so the Node 26
  webstorage suggestion is lower priority.

**Verdict:** the merge keeps both features' behavior and contract, the migration order and
upgrade path are correct, and there are no blocking findings → `status: approved`. Merging is
Elango's gate.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [x] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
