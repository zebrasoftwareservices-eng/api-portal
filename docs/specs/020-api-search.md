---
id: 020
title: Search across APIs and endpoints
status: designed   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-08
linear:            # pending: Linear feature issue not created yet (the Linear workspace is at its free issue limit)
linear_stages:     # stage issues — filled by linear-init
---

# 020 — Search across APIs and endpoints

## Summary
Developers can find any published API or endpoint from one search box by its name, path or
summary, without browsing every API.

## Problem
The portal has no search. A developer who knows a path like `/orders/{id}`, or roughly what an
operation does, has to open every API's reference to find it, and the bigger the catalog the
worse this gets. Split from spec 012 (Elango, 2026-11-08) so it can ship as its own pull request.

We'll know it's solved when searching for a path or an API title lists the matching endpoint and
API, each linking straight to its reference, and nothing the visitor can't see in the catalog
ever shows up.

## Users
- **API consumer (developer):** searches for APIs and endpoints, signed in or not.
- **Portal admin:** expects search to respect what is published and visible.

## User stories
- As a developer, I want to search for an API or an endpoint by name, path or summary, so that I
  can find it without browsing every API.
- As a developer, I want each result to show the method, path and API, and to take me straight
  to the operation, so that I can tell results apart and read the docs in one click.
- As a portal admin, I want search to show only what the public catalog shows the visitor, so
  that unpublished or hidden APIs never leak through search.

## Acceptance criteria
QA runs these against the Compose stack with a real Kong.

**Visibility (decided by Elango).** Search shows exactly what the public catalog shows the
current visitor, using the same visibility check as the catalog — no separate rules for search.
Before spec 010 ships that means every published API; when spec 010 ships its visibility rules
apply to search automatically. An unpublished API never appears.

1. **Given** published APIs including one with the operation `GET /orders/{id}` **When** a
   visitor searches the portal for `orders/{id}` **Then** the results include that endpoint,
   showing method, path and API name, and the result opens that operation in the API's
   reference (the latest version once spec 012 has shipped).
2. **Given** a published API titled "Orders API" with an operation whose summary is "Cancel an
   order" **When** a visitor searches for `orders api` and, separately, for `cancel order`
   **Then** the first search lists the API, linking to its reference page, and the second lists
   the operation; matching ignores letter case.
3. **Given** an API that has been imported but not published **When** a visitor or a signed-in
   developer searches for its title or one of its paths **Then** it never appears in the results.
4. **Given** an API the public catalog doesn't show to the current visitor (under the catalog
   visibility check in force — before spec 010, any published API is shown) **When** that
   visitor searches for its title or one of its paths **Then** it doesn't appear in the results,
   and it does appear for a visitor the catalog shows it to; for every visitor, the APIs in
   search results are a subset of the APIs the catalog lists for them.
5. **Given** a published API whose spec is replaced, or which gets a new version, so that
   `GET /orders` is removed **When** a visitor searches for `GET /orders` after the import
   finishes **Then** the removed operation is no longer in the results; likewise an API that is
   unpublished disappears from results.
6. **Given** a search term that matches nothing **When** the visitor searches **Then** they see
   an empty-results state that says nothing matched and suggests browsing the catalog, not an
   error.
7. **Given** an empty search term, one longer than the maximum length, or one made only of
   special characters such as `{}/*%` **When** a client calls the search API **Then** an empty
   or over-long term gets a 400 problem+json that names the problem, special characters return a
   normal (possibly empty) result, and the server never returns a 500.

## Out of scope
- **Searching docs pages and articles.** Those arrive with spec 014; indexing them is 014's or a
  follow-up's work.
- **Searching older versions.** Only the latest version of each API is searched once spec 012
  ships; older versions are reached through the version switcher.
- **Search inside request and response schemas** (field names, enum values).
- **AI or semantic search.** On the roadmap as later work (product brief).
- **Search analytics** (what people searched for, searches with no results).
- **Search-specific visibility rules.** Search reuses the catalog's visibility check; per-API
  visibility itself is spec 010's work.

## Open questions
- [x] ~~Visibility before spec 010 ships?~~ Decided (Elango): search shows exactly what the
  public catalog shows, using the same visibility check, so spec 010 applies automatically when
  it ships; an unpublished API never appears (criteria 3 and 4).
- [x] ~~Search engine?~~ Answered (tech-lead): query-time matching over the visible catalog, no
  index or container (ADR 0012, Technical design).
- [ ] Is search a box in the site header with a results page, a command palette (⌘K), or both?
  Do results appear as you type? — ui-designer
- [x] ~~Maximum term length, result count, rate limit?~~ Answered (tech-lead): 100 characters,
  20 results by default and 50 at most, 60/min per IP anonymous and 120/min per user.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Decision record: [ADR 0012](../adr/0012-search-computed-from-catalog-at-query-time.md). Search
has no index and no table. Each request builds its candidates from `publishedApis(db, viewer)`,
the function behind `GET /v1/apis`. Visibility (spec 010), publish state and "latest version"
(spec 012) therefore come from the catalog, and AC 3–5 hold with no sync code.

**Open questions answered (tech-lead).**
- Engine: query-time substring matching in the server process over the visible catalog. No
  Postgres FTS or trigram index, no new container, no migration (ADR 0012).
- Limits: the term is 1–100 characters after trimming. `limit` defaults to 20, max 50. Rate
  limits: 60 searches a minute per client IP when anonymous, 120 a minute per user when signed in.

**Components**
- `packages/sdk`: new pure module `src/search.ts`, exported as `searchCatalog(apis, term, limit)`.
  It has no I/O. Input is `{ slug, title, version, description, document }[]`, and output is the
  `SearchResults` shape. It lives here so the server and the portal's demo mode (ADR 0004, no
  server) share one matcher. The server gains a `@portal/sdk` workspace dependency for it, with
  no new third-party dependency.
- `apps/server`: new `src/search.ts` registers `GET /api/v1/search`. It validates the query (zod),
  calls `loadViewer`, then `publishedApis(db, viewer)`, maps rows to the matcher's input
  (`row.version.title/description/document`, `row.api.slug`) and returns `searchCatalog(...)`.
  It is registered in `app.ts` beside `registerCatalog`. A scoped `@fastify/rate-limit`
  registration follows the pattern in `gateways.ts`. The key is the user ID when signed in,
  otherwise `request.ip`, which already honours `trusted-proxy.ts`.
- `apps/portal`: search box and `/search?q=` results page (layout, ⌘K and search-as-you-type are
  the ui-designer's call). It uses the generated client `GET /v1/search`. The operation deep link
  comes from a shared `operationAnchor()` helper that the reference also uses.
- No change to `packages/db`, the adapters or deploy files.

**API contract** (`apps/server/openapi.yaml`, done)
- `GET /v1/search?q=<term>&limit=<1..50, default 20>`, tag `catalog`, `security: []`
  (the session cookie is optional and only widens visibility).
- `200 SearchResults` `{ items: SearchResult[], truncated: boolean }`. `SearchResult` is
  `{ kind: 'api'|'operation', api: { slug, title, version }, method?, path?, summary?,
  operationId?, tags? }`. Nothing matched is a 200 with `items: []`, never an error (AC 6).
- `400 /problems/validation` when `q` is missing, blank after trimming, or over 100
  characters, or when `limit` is out of range. `detail` names the problem: "Enter a search
  term." or "Search terms can be at most 100 characters." (AC 7).
- `429 /problems/rate-limited` with `Retry-After`.
- It never returns 500 for any `q`. Matching is plain `String.includes` on lowercased text, so
  `{}/*%_\` are literal and nothing reaches SQL.

**Matching and ranking** (the `searchCatalog` behaviour, unit-tested)
- Normalise: trim, collapse whitespace, lowercase, then split on spaces into tokens.
- API result: every token occurs in `title + " " + description`.
- Operation result: for each `paths[path][method]` of the latest document, with `method` in the
  8 HTTP verbs (skip `parameters`, `servers` and other keys), every token occurs in
  `METHOD + " " + path + " " + summary + " " + operationId`. The API title is not part of the
  operation text, so `orders api` lists the API and not every one of its operations.
- Score (higher first): exact `path` or `METHOD path` equal to the term 100. API title equal to
  the term 90. Term a substring of `path` 80. All tokens within method and path 60. All tokens
  within the API title 50. Other operation match 40. Other API match (description) 30. Ties
  break by API title, then path, then method. Cut at `limit` and set `truncated`.
- Documents with a missing or non-object `paths` produce no operations and don't throw.

**Data model.** None. No migration.

**Adapter calls.** None. Search reads only portal data, never Kong.

**Reference deep link.** Scalar builds each operation's DOM id from its config. The frontend
sets Scalar's `generateOperationSlug` (or the equivalent option in the installed
`@scalar/api-reference-react` version) in `referenceOptions` to a shared
`operationAnchor({ method, path, tags })` helper, and the search links to
`/apis/{slug}#<that anchor>`. API results link to `/apis/{slug}`. Both are the latest version,
because the reference page opens the latest version by default.

**Risks and how to test them**
- *Visibility drift (AC 4).* Mitigated because search calls `publishedApis` itself, not a copy
  of the rule. QA checks that, for anonymous, signed-in non-member, team member and admin
  viewers, the slugs in search results are a subset of `GET /v1/apis` for the same session,
  with open, hidden, internal and manual products seeded.
- *Not-published APIs (AC 3).* Today import publishes atomically and a failed import stores
  nothing. An `apis` row without `latest_version_id` is excluded by the catalog's inner join.
  QA covers both: a refused import (lint error), and a row inserted with a null latest version.
  Neither appears.
- *Staleness (AC 5).* There is nothing cached, so the next search after a new version or a
  product visibility change reflects it. QA asserts this right after the import or version
  response, with no wait.
- *Cost per search.* Every search loads the visible documents, as `GET /v1/apis` does. The rate
  limit bounds abuse. Backend adds a unit benchmark of 300 APIs × 30 operations matched in
  under 50 ms. ADR 0012 records when to move to an index.
- *Anchor mismatch.* The reference may not scroll to the operation if the Scalar slug option
  differs by version. The Playwright test asserts that the operation heading is in view after
  following a result.
- *Special characters (AC 7).* Unit tests cover `{}/*%_\'"` and Unicode in the matcher.
  Integration tests cover `q` at 0, 1, 100 and 101 characters, plus whitespace only.

### Tasks
- [ ] [backend] Add `packages/sdk/src/search.ts` (`searchCatalog`, types) and export it from the package index; unit tests for normalisation, AND-token matching, verb filtering, scoring order, ties, `limit`/`truncated`, special characters, malformed `paths`, and a 300×30 benchmark under 50 ms.
- [ ] [backend] Regenerate `packages/sdk/src/schema.d.ts` from the updated `openapi.yaml` (`pnpm --filter @portal/sdk generate`).
- [ ] [backend] Add `apps/server/src/search.ts`: `GET /api/v1/search` with zod validation (`q` trimmed 1–100, `limit` 1–50 default 20, problem `detail` copy as in the design), `loadViewer` + `publishedApis` + `searchCatalog`; register it in `app.ts`; add the `@portal/sdk` workspace dependency to `apps/server`.
- [ ] [backend] Scoped `@fastify/rate-limit` on the search route: 60/min keyed by `request.ip` anonymous, 120/min keyed by user ID signed in; 429 `/problems/rate-limited`.
- [ ] [backend] Integration tests (`apps/server/src/search.test.ts`, Testcontainers Postgres): AC 1, 2, 3 (refused import, null latest version), 4 (open/hidden/internal/manual products × anonymous/member/non-member/admin; results ⊆ `GET /v1/apis`), 5 (new version removes `GET /orders`; product made internal hides it), 6, 7 (blank, 101 chars, `{}/*%`), 429.
- [ ] [frontend] Search entry point and `/search?q=` results page per the UX design: each result shows method badge, path, summary and API name (API results show title and version); empty state "Nothing matched" with a link to browse the catalog; 400 shows the problem `detail` inline; 429 shows a try-again message.
- [ ] [frontend] Shared `operationAnchor()` helper wired into `referenceOptions` (Scalar operation slug) and into operation result links, so `/apis/{slug}#<anchor>` scrolls to the operation; unit-test the helper.
- [ ] [frontend] Demo mode: search the sample API in the browser with `searchCatalog` from `@portal/sdk` (no server call), same results UI.
- [ ] [qa] Playwright e2e on the Compose stack with real Kong: search `orders/{id}` → result opens the reference with the `GET /orders/{id}` operation in view (AC 1); `orders api` and `cancel order` (AC 2); empty state (AC 6); a hidden-product API absent anonymously and present for its team member (AC 4).
- [ ] [qa] Run the full suite and the `docker compose up` quickstart; confirm no new container and no migration; record results in the Test report.

## UX  _(ui-designer)_
Summary + link to `docs/design/020-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
| Criterion | Test file | Result |
| --- | --- | --- |

### Bugs
<!-- One line per bug, each with its Linear issue: - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Screenshot |
| --- | --- | --- |

## Review  _(tech-lead)_

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
