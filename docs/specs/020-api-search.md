---
id: 020
title: Search across APIs and endpoints
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
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
- [ ] Search engine: PostgreSQL full-text search with trigram matching for paths, or an
  embedded index? It must not add a container to the quickstart. — tech-lead
- [ ] Is search a box in the site header with a results page, a command palette (⌘K), or both?
  Do results appear as you type? — ui-designer
- [ ] Maximum search term length and result count, and is the search API rate-limited for
  anonymous visitors? — tech-lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

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
