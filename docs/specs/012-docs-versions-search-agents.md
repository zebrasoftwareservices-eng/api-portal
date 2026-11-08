---
id: 012
title: API versions and changelog, spec linting, search and agent-ready docs
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-08
linear: JSO-240
linear_stages:     # stage issues — filled by linear-init
---

# 012 — Docs that keep up: versions, changelog, linting, search and agent-ready pages

## Summary
Admins can publish a new version of an API with a changelog, bad specs are stopped at import,
and developers and AI agents can find any endpoint by search, as Markdown or through `/llms.txt`.

## Problem
Today an API in the portal has exactly one OpenAPI document. When the team ships v2, the admin
can only replace v1 or import v2 as a second API, and since spec 004 the second option is
refused: ADR 0005 allows only one published API per Kong service, because a Kong ACL can't tell
two APIs on the same service apart. Developers can't see what changed between versions or keep
reading the version they integrated against. The import checks only that a document is valid
OpenAPI 3.x, so specs with missing descriptions, broken examples or duplicate operation IDs get
published and make the docs worse. There's no search, so a developer who knows a path like
`/orders/{id}` has to browse every API to find it. AI coding agents, which developers
increasingly point at docs, get HTML built for browsers instead of text they can read.

We'll know it's solved when importing v2 of an API shows a version switcher and a changelog
entry on the same API, a spec with a lint error is refused with its rule and location, search
finds an endpoint by its path, and `/llms.txt` lists every API.

## Users
- **Portal admin / platform engineer:** imports specs and publishes new versions.
- **API consumer (developer):** reads the reference, switches versions, reads the changelog, searches.
- **AI agent:** reads the portal through `/llms.txt`, Markdown pages and spec downloads.

## User stories
- As a portal admin, I want to import a new version of an API I already published, so that
  developers get the new docs without the API being split into two.
- As a portal admin, I want to write release notes for a version and have the portal summarise
  what changed, so that the changelog is useful without a lot of writing.
- As a portal admin, I want an import with spec errors refused with the rule and location, so
  that I can fix the spec before bad docs reach developers.
- As a portal admin, I want lint warnings shown but not blocking, so that I can publish now and
  improve the spec later.
- As a developer, I want to switch between versions of an API and read its changelog, so that
  I can read the docs for the version I use and plan my upgrade.
- As a developer, I want to search for an API or an endpoint by name or path, so that I can
  find it without browsing every API.
- As a developer, I want code samples in the languages I use, so that I can copy a working call.
- As an AI agent, I want `/llms.txt`, a Markdown version of each page and the raw spec for each
  version, so that I can read the portal without parsing HTML.

## Acceptance criteria
QA runs these against the Compose stack with a real Kong.

1. **Given** a published API at version `1.0.0` linked to a Kong service **When** an admin
   imports a valid OpenAPI document with `info.version` `2.0.0` as a new version of that API
   **Then** the API's reference page shows a version switcher listing `2.0.0` (selected, marked
   latest) and `1.0.0`; choosing `1.0.0` shows the v1 reference at its own stable URL; the API
   still has one catalog entry and the same Kong service link.
2. **Given** v1 has `GET /orders` and `GET /orders/{id}`, and v2 removes `GET /orders` and adds
   `POST /orders` **When** the admin imports v2 with the release note "Orders can now be created"
   **Then** the API's changelog shows a `2.0.0` entry with the import date, the admin's note, and
   a generated summary listing `POST /orders` as added and `GET /orders` as removed (breaking).
3. **Given** a published API at `2.0.0` **When** an admin imports another document as a new
   version with `info.version` `2.0.0` **Then** the import is refused with a problem+json
   response saying that version already exists, and the published `2.0.0` is unchanged.
4. **Given** an OpenAPI document that breaks a ruleset rule at error severity (for example two
   operations with the same `operationId`) **When** an admin imports it, as a new API or as a new
   version **Then** the import is refused with a 422 problem+json and the admin UI shows, for
   each error, the rule name, its message and the location (JSON pointer and line number);
   nothing is stored and existing versions are unchanged.
5. **Given** an OpenAPI document with no lint errors but at least one warning (for example an
   operation without a description) **When** an admin imports it **Then** it is published and
   the admin sees each warning with its rule name, message and location.
6. **Given** published APIs including one with the path `/orders/{id}` **When** a visitor
   searches the portal for `orders/{id}` or for the API's title **Then** results include that
   endpoint (method, path and API name) linking to the operation in the latest version's
   reference, and the API linking to its reference page.
7. **Given** a search term that matches nothing, or matches only an API the visitor isn't allowed
   to see under the catalog visibility rules **When** the visitor searches **Then** they see an
   empty-results state and the hidden API doesn't appear.
8. **Given** published APIs **When** an anonymous client requests `GET /llms.txt` **Then** it
   gets `text/plain` in the llms.txt format listing every API the anonymous visitor can see, each
   with its title, one-line description, a link to its Markdown reference and a link to download
   the latest spec; APIs the anonymous visitor can't see aren't listed.
9. **Given** an API with versions `1.0.0` and `2.0.0` **When** a client requests the Markdown
   version of its reference page, and the spec download for each version **Then** the Markdown
   lists every operation of the latest version with method, path, summary, parameters and
   response codes; each download returns the document exactly as imported for that version; a
   download for a version that doesn't exist returns 404 problem+json.
10. **Given** any operation in the API reference **When** a developer opens its code samples
    **Then** they can choose at least curl, JavaScript and Python, and each sample uses the
    operation's method, the gateway URL and path, and the API's key header.

## Out of scope
- **Searching docs pages and articles.** Those arrive with spec 014. Search should index them
  once 014 ships, but that is 014's or a follow-up's work.
- **Per-version gateway routing.** All versions of an API share one Kong service and route; the
  portal documents versions, it doesn't route `/v1` and `/v2` traffic or create Kong objects per
  version. Subscriptions and keys stay per API, not per version.
- **Deprecation and sunset dates, and deleting or unpublishing a version.** Cut to keep scope small.
- **Custom Spectral rulesets edited in the admin UI.** One built-in ruleset ships; see Open questions.
- **Field-level or schema-level diffs.** The generated summary covers added, removed and
  changed operations only.
- **AI or semantic search, an MCP server per API.** On the roadmap as later work (product brief).
- **Search inside request and response schemas.**

## Open questions
- [ ] **Split into several specs?** This is more than one pull request. Proposed order:
  012a versions, changelog and linting (Done-when items 1–2) first; 012b search; 012c
  agent-ready Markdown, `/llms.txt`, spec downloads and code samples. Needs new roadmap
  numbers. — Elango
- [ ] Which ruleset: Spectral's built-in `spectral:oas` as is, or with some rules raised or
  lowered (which rules are errors)? Can an operator replace it with their own ruleset file
  through configuration? — tech-lead, then Elango
- [ ] Should linting apply to the sample API seeded by the quickstart, and what happens to
  already-published APIs that would fail the new rules (stay published, shown as warnings)? —
  tech-lead
- [ ] What makes a change "breaking" in the generated summary beyond removed operations (for
  example a new required parameter)? — tech-lead
- [ ] Is "new version" a separate admin action on the API, or does the import form detect an
  existing API linked to the same Kong service and offer to add a version? — ui-designer
- [ ] Does the latest version mean the most recently imported or the highest semver? Can an
  admin import an older version (a v1 patch after v2) without it becoming the default? — Elango
- [ ] Catalog visibility (spec 010) is planned before this spec. If 010 hasn't shipped, are all
  published APIs public for search and `/llms.txt`? — Elango
- [ ] Markdown URL convention: `.md` suffix, `Accept: text/markdown`, or both? Should
  `/llms-full.txt` (every page inlined) be included? — tech-lead
- [ ] Code samples: does Scalar already give us the languages we need, and which languages
  beyond curl, JavaScript and Python (Go, Java)? — tech-lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/012-*.md`

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
