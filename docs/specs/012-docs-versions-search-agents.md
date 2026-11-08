---
id: 012
title: API versions and changelog, and spec linting
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
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
