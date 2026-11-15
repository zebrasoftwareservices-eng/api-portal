---
id: 021
title: Agent-ready docs — Markdown pages, llms.txt, spec downloads and code samples
status: approved   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-08
linear:            # pending: Linear feature issue not created yet (the Linear workspace is at its free issue limit)
linear_stages:     # stage issues — filled by linear-init
---

# 021 — Agent-ready docs: Markdown pages, `/llms.txt`, spec downloads and code samples

## Summary
AI agents and developers can read the portal as plain text: `/llms.txt`, a Markdown version of
each API reference, the raw spec for each version, and copyable code samples per operation.

## Problem
Developers increasingly point AI coding agents at API docs, but the portal serves only HTML
built for browsers, which agents read poorly. There is no way to download the OpenAPI document
an API was published from, so tools and agents can't generate clients from it, and developers
have no copyable sample call. Split from spec 012 (Elango, 2026-11-08). Per-version downloads
need the versions from spec 012, so this spec comes after it.

We'll know it's solved when `/llms.txt` lists every API the visitor can see, each with a working
Markdown reference and spec download, and every operation offers curl, JavaScript and Python
samples.

## Users
- **AI agent:** reads the portal through `/llms.txt`, Markdown pages and spec downloads.
- **API consumer (developer):** downloads specs, copies code samples, points an agent at the portal.

## User stories
- As an AI agent, I want `/llms.txt` listing every API with links to plain-text docs, so that I
  can find what the portal offers without parsing HTML.
- As an AI agent, I want a Markdown version of each API reference, so that I can read every
  operation as text.
- As a developer, I want to download the OpenAPI document for any version of an API, so that I
  can generate a client or load it into my own tools.
- As a developer, I want code samples in the languages I use, so that I can copy a working call.

## Acceptance criteria
QA runs these against the Compose stack with a real Kong.

**Visibility (decided by Elango).** `/llms.txt`, Markdown references and spec downloads show
exactly what the public catalog shows an anonymous visitor, using the same visibility check as
the catalog. Before spec 010 ships that means every published API; when spec 010 ships its
visibility rules apply here automatically. An unpublished API never appears. `/llms.txt` is
always the anonymous, public-only view: signing in or sending an API key doesn't change it.

1. **Given** published APIs **When** an anonymous client requests `GET /llms.txt` **Then** it
   gets `text/plain` in the llms.txt format listing every API the public catalog shows an
   anonymous visitor, each with its title, one-line description, a link to its Markdown
   reference and a link to download its latest spec; every link in it returns 200. A request
   from a signed-in developer, or one carrying an API key, gets the same content.
2. **Given** an API that has been imported but not published, and an API the public catalog
   doesn't show an anonymous visitor **When** an anonymous client requests `GET /llms.txt` or
   either API's Markdown reference or spec download **Then** neither API is listed in
   `/llms.txt`, and its Markdown and download URLs return 404 problem+json.
3. **Given** a published API **When** a client requests the Markdown version of its reference
   page **Then** it gets `text/markdown` listing every operation of the latest version with
   method, path, summary, parameters (name, location, required, type) and response codes.
4. **Given** a published API with versions `1.0.0` and `2.0.0` (spec 012) **When** a client
   downloads the spec for each version, and the latest spec **Then** each download returns the
   document exactly as imported for that version, in its original format (JSON or YAML) with the
   matching content type, and the latest download returns `2.0.0`.
5. **Given** a published API **When** a client requests a spec download for a version that
   doesn't exist, or the Markdown or download URL for an API id or slug that doesn't exist
   **Then** it gets a 404 problem+json naming what wasn't found.
6. **Given** any operation in the API reference **When** a developer opens its code samples
   **Then** they can choose at least curl, JavaScript and Python, and each sample uses the
   operation's method, the gateway URL and path, the API's key header with a placeholder (never
   a real key), and an example body for operations that take one.
7. **Given** the reference page of an API **When** a developer views it in the browser **Then**
   it links to the Markdown version and offers "Download spec" for the version being viewed.

## Out of scope
- **An MCP server per API.** On the roadmap as later work (product brief).
- **Markdown for docs pages and articles.** Those arrive with spec 014.
- **Generated SDKs** (packaged client libraries per language). Code samples only.
- **Downloading a spec rewritten for the gateway** (server URLs replaced with the Kong URL). The
  download is the document as imported.
- **Search.** Spec 020.
- **Signed-in or API-key views of `/llms.txt`.** `/llms.txt` is always the anonymous,
  public-only view; showing an agent the APIs its developer can see is a possible follow-up.

## Open questions
- [x] ~~Visibility for `/llms.txt` before spec 010 ships?~~ Decided (Elango): `/llms.txt`,
  Markdown pages and spec downloads show exactly what the public catalog shows, using the same
  visibility check, so spec 010 applies automatically when it ships; an unpublished API never
  appears (criterion 2).
- [x] ~~Should a signed-in developer's agent see more in `/llms.txt`?~~ Decided (Elango): no —
  `/llms.txt` is always the anonymous, public-only view (criterion 1; listed under Out of scope).
- [ ] Markdown URL convention: `.md` suffix, `Accept: text/markdown`, or both? Should
  `/llms-full.txt` (every page inlined) be included? — tech-lead
- [ ] Code samples: does Scalar already give us the languages we need, and which languages
  beyond curl, JavaScript and Python (Go, Java)? — tech-lead
- [x] ~~If spec 012 hasn't shipped when this is built, reduce criterion 4?~~ Decided (Elango):
  build 021 after 012; criterion 4 keeps per-version downloads.

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Decision record: [ADR 0013](../adr/0013-agent-readable-docs-rendered-by-the-server.md). The
server renders every agent-readable format on request from the stored documents, behind the
catalog's own visibility check. No migration, no new dependency, no new container.

**Open questions answered (tech-lead).** Markdown uses a `.md` URL only (agents follow links;
no `Accept` negotiation). `/llms-full.txt` is not in this spec (follow-up). Code samples use
Scalar's built-in clients, which already cover curl, JavaScript and Python; the picker shows
curl, JavaScript (fetch), Node.js (fetch), Python (requests), Go and Java (java.net.http).

### Components
- `apps/server` — new `src/agent-docs.ts`: the routes below plus two pure functions,
  `renderLlmsTxt(rows, publicUrl)` and `renderMarkdown(row, version, document, publicUrl)`.
  `catalog.ts` adds `markdownUrl` and `downloadUrl` to `apiDetail` and its `versions[]`.
  `problem.ts` `notFound(detail?)` takes an optional detail so a 404 names what is missing.
- `apps/portal` — `app/llms.txt/route.ts` (forwards to the server, no cookies); "Markdown" link
  and "Download spec" button on `app/apis/[slug]/page.tsx` and
  `app/apis/[slug]/versions/[version]/page.tsx`; Scalar code-sample options in
  `lib/reference-options.ts`.
- `packages/sdk` — regenerate from `openapi.yaml`.
- Not touched: `packages/db` (no schema change), gateway adapters, `deploy/`.

### API contract (`apps/server/openapi.yaml`, done)
All `security: []`, tag `catalog`. Paths are under the server's `/api` prefix.

| Method + path | operationId | 200 | Visibility |
| --- | --- | --- | --- |
| `GET /v1/llms.txt` | `getLlmsTxt` | `text/plain; charset=utf-8` | always anonymous |
| `GET /v1/apis/{slug}/reference.md` | `getApiMarkdown` | `text/markdown; charset=utf-8` | caller's viewer |
| `GET /v1/apis/{slug}/versions/{version}/reference.md` | `getApiVersionMarkdown` | `text/markdown; charset=utf-8` | caller's viewer |
| `GET /v1/apis/{slug}/spec` | `downloadApiSpec` | `application/json` or `application/yaml` | caller's viewer |
| `GET /v1/apis/{slug}/versions/{version}/spec` | `downloadApiVersionSpec` | same | caller's viewer |

- `ApiDetail` and `ApiVersionSummary` gain required `markdownUrl` and `downloadUrl` (relative
  `/api/v1/...` paths, version URL-encoded like `versionDocumentUrl`).
- **Visibility.** `/llms.txt` calls `publishedApis(db, anonymous)` and ignores cookies and API
  keys. Markdown and downloads resolve the API with `publishedApis(db, await loadViewer(...))`,
  exactly like `GET /v1/apis/{slug}`: an anonymous caller (criteria 1–2) sees the public catalog,
  and a signed-in developer whose reference page shows an API can also fetch its Markdown and
  spec (criterion 7). Unpublished APIs are never in `publishedApis`.
- **`/llms.txt` format** (llmstxt.org): `# Developer Portal`, a one-line `>` summary,
  `## APIs`, then one item per API in catalog order:
  `- [<title>](<PUBLIC>/api/v1/apis/<slug>/reference.md): <description> OpenAPI: <PUBLIC>/api/v1/apis/<slug>/spec`.
  `<PUBLIC>` is `PORTAL_PUBLIC_URL` without a trailing slash. The description is the first
  non-empty line of the latest `info.description`, Markdown link syntax kept, cut to 200
  characters, omitted when empty. No APIs: `No APIs are published yet.` under the heading.
  `Cache-Control: public, max-age=60`.
- **Markdown layout** (rendered from `publicDocument(row, version.document)` so base URL and key
  header match the browser reference):
  `# <title> <version>`, the description, then a list: `Base URL: <gatewayBaseUrl>`,
  `Authentication: send your API key in the <name> <in>` (from the applied `apiKey` scheme; never
  a key), `OpenAPI document: <PUBLIC><downloadUrl>`, `Reference: <PUBLIC>/apis/<slug>[/versions/<v>]`.
  Then `## Operations` and per operation, in document order (same order as
  `referenceOptions`): `### <METHOD> <path>`, the summary (and `Deprecated.` when set), a
  `Parameters` table `| Name | In | Required | Type |` (path-level + operation-level, operation
  wins on same name+in; local `#/...` `$ref`s resolved; Type is `schema.type`, `array<items.type>`,
  the `$ref` component name, or `object`), a `Request body:` line (media types; required or
  optional) when present, and `Responses: 200, 404` as written. Cells escape `|` and fold newlines.
  `Cache-Control: private, no-cache`.
- **Download.** Body is `source_content` byte for byte; `Content-Type` is `application/json`
  when `source_format = 'json'`, else `application/yaml`; `Content-Disposition: attachment;
  filename="<slug>-<version>.<json|yaml>"` (version sanitised to the `ApiVersionName` charset).
  A row with null `source_content` returns `JSON.stringify(document, null, 2)` as JSON.
  Latest means `apis.latest_version_id` (criterion 4: `2.0.0`). `Cache-Control: private, no-cache`.
- **Errors** (RFC 9457, `/problems/not-found`, 404): unknown or invisible slug →
  `detail: "No published API with slug '<slug>'."`; unknown version → `detail: "API '<slug>' has
  no version '<version>'."`. An invisible API uses the same text as an unknown one (no leak).
  The global not-found handler is unchanged.
- **Portal `/llms.txt`.** Route handler `GET` fetches `${SERVER_URL}/api/v1/llms.txt` with no
  forwarded headers, returns the body with the server's `content-type` and `cache-control`;
  server unreachable → 503 `text/plain` "The portal is starting or unavailable." Works on the
  self-hosted ingress (non-`/api` goes to Next) and on Vercel. In demo builds it returns 404.

### Data model
None. Uses `api_versions.source_content`, `source_format`, `document` and
`apis.latest_version_id`, which already exist (spec 012).

### Adapter calls
None. No gateway call; the gateway base URL comes from the stored `gateways.proxy_public_url`
and `apis.route_path`, as in `apiSummary`.

### Code samples (criterion 6)
Scalar renders the request example per operation from the served document: method, the
`servers` URL (the gateway base URL), the path, the applied `apiKey` header and an example body
from the schema/example. In `referenceOptions` set `hiddenClients` to keep only `shell/curl`,
`js/fetch`, `node/fetch`, `python/requests`, `go/native`, `java/nethttp`, and
`defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' }`. The key value stays empty so
Try it is unaffected; the sample must show Scalar's placeholder, never a real key.

### Risks and how to test them
- **Visibility leak** (a hidden or unpublished API appears in a text format). Integration test
  with one published-open, one internal/manual-product API and one imported-but-unpublished:
  `/llms.txt` lists only the first, both others 404 on `.md` and `/spec`, and `/llms.txt` is
  identical with a session cookie and with an `apikey` header.
- **"Exactly as imported"** drift. Import a YAML `1.0.0` with comments and key order, and a JSON
  `2.0.0`; assert the download bodies equal the imported bytes and the content types differ.
- **Dead links in `/llms.txt`** when `PORTAL_PUBLIC_URL` is wrong. QA fetches every link in the
  Compose stack; the default `http://localhost:3000` matches the quickstart.
- **Scalar placeholder or client keys differ in 0.8.x.** Frontend verifies the client keys and
  that the curl sample shows a placeholder header; if Scalar prints an empty value, set the
  scheme's example via the document transform rather than prefilling the Try-it key.
- **Markdown on odd documents** (no paths, `$ref` parameters, path-level params, `|` in
  summaries, huge specs). Unit tests on `renderMarkdown` with fixtures.
- **Quickstart.** No new service or env var; `PORTAL_PUBLIC_URL` already exists.

### Tasks
- [x] [backend] Add `notFound(detail?)` in `problem.ts`; existing callers unchanged.
- [x] [backend] Add `markdownUrl` and `downloadUrl` to `apiDetail` and `versions[]` in `catalog.ts`; regenerate `packages/sdk`.
- [x] [backend] Add `src/agent-docs.ts` with `renderLlmsTxt` and `GET /api/v1/llms.txt` (anonymous viewer, absolute links from `PORTAL_PUBLIC_URL`, cache header); register it in `app.ts`.
- [x] [backend] Add `renderMarkdown` and the latest + per-version `reference.md` routes (caller's viewer, 404 details as designed).
- [x] [backend] Add the latest + per-version `spec` download routes (source bytes, content type, `Content-Disposition`, JSON fallback for null source).
- [x] [backend] Unit tests for `renderLlmsTxt` and `renderMarkdown` fixtures; route tests in `agent-docs.test.ts` for visibility, 404 details and download bytes.
- [x] [frontend] Add `app/llms.txt/route.ts` forwarding to the server without cookies; 503 when the server is down; 404 in demo builds.
- [x] [frontend] On the API page and the version page, add a "Markdown" link (`markdownUrl`) and a "Download spec" button (`downloadUrl`) for the version being viewed; hide both in demo builds.
- [x] [frontend] Set Scalar `hiddenClients` and `defaultHttpClient` in `referenceOptions` to the six clients above; unit test the options.
- [x] [qa] Integration: criteria 1, 2, 5 against the Compose stack (all `/llms.txt` links return 200; same content with cookie and `apikey`; 404 problem+json with a detail naming the slug or version).
- [x] [qa] Integration: criteria 3 and 4 (Markdown lists every operation with parameters and response codes; YAML and JSON downloads byte-identical with matching content type; latest is `2.0.0`).
- [x] [qa] e2e (Playwright): criteria 6 and 7 (curl, JavaScript and Python samples with method, gateway URL, path, key placeholder and body; Markdown link and Download spec on the latest and a version page).
- [x] [frontend] Fix (review B1): remove `apps/portal/app/apis/[slug]/loading.tsx` and `apps/portal/app/apis/[slug]/versions/[version]/loading.tsx` (or move the API lookup and `notFound()` into a `layout.tsx` above them) so unknown and invisible API pages return HTTP 404 again; `backlog-regressions.test.ts` unknown-API checks and the `access-requests.test.ts` status checks pass.
  Regression references: JSO-223 / JSO-228 (existing regression coverage, not task issues).
- [x] [qa] Fix (review B2): update the JSO-173 assertion in `apps/portal/e2e/backlog-regressions.test.ts` to the 021 layout (the version row sits on its own line under the title, per design §3.1): check the badge centre aligns with the **Changelog** link instead of the title; keep the Copy check.

## UX  _(ui-designer)_
Design: [docs/design/021-agent-ready-docs.md](../design/021-agent-ready-docs.md). No new tokens, components or pages.
- The version row on `/apis/[slug]` and `/apis/[slug]/versions/[version]` gains a **View as Markdown**
  text link and a **Download spec** secondary button after **Changelog**, both plain `<a>`s using
  that version's `markdownUrl` / `downloadUrl`; the access action stays the only primary button.
  At 375px the links share a line and the button is full width. Both are hidden in demo builds.
- Code samples: Scalar's picker with curl (default), JavaScript, Node.js, Python, Go and Java; the
  key header always shows a placeholder.
- Exact copy for `/llms.txt` (summary line, empty state, 503) and the fixed lines of the Markdown
  reference (Authentication wording, `yes`/`no`, no-operations line) is in §4 of the design.

## Build notes  _(backend-developer, frontend-developer)_

**Backend:** Added the anonymous `/api/v1/llms.txt` index, viewer-aware Markdown references and source downloads for latest and named versions, precise 404 details, catalog links, and regenerated SDK types. Markdown uses the public document transform and resolves local parameter/body references; downloads preserve source text and fall back to pretty JSON for legacy rows. `@portal/server` lint, typecheck, and all 322 tests (25 files), plus `@portal/sdk` lint, typecheck, and all 16 tests pass; Docker-backed tests required sandbox escalation. QA should verify absolute links against the configured public URL and byte-identical imported files in the live stack.

**Frontend:** Added the anonymous SDK-backed `/llms.txt` route, version-specific View as Markdown and Download spec controls, responsive loading states, and the six Scalar clients with curl selected by default. Demo pages hide both controls and `/llms.txt` returns the default 404; Scalar retains its built-in `YOUR_SECRET_TOKEN` placeholder with empty Try-it credentials. `@portal/portal` lint, typecheck, and all 382 tests (45 files) pass; QA should verify the responsive layout, actual Scalar samples, and downloads against the live server. The download glyph is the equivalent inline 16px SVG because this repo does not depend on lucide-react, and the shared Button has no size prop.

**Frontend review B1:** Removed the latest and version API route `loading.tsx` boundaries so API and version lookups can call `notFound()` before any response streams; the inner reference Suspense fallback remains. Portal lint, typecheck, and all 382 tests (45 files) pass. QA should rerun the unknown/invisible API and version HTTP-status e2e assertions; no browser or quickstart was run in this stage. Moved the existing regression issue references onto a separate continuation line so `linear task` can tick this task without treating those references as task issue keys.

## Test report  _(qa-tester)_

Tested commit: `042dcf1c538c0ae0b0ef91861103f618d796397e` (2026-11-15).
Portal: **http://localhost:3020** from `node scripts/worktree-compose.mjs env`;
Compose project `portal-021-agent-ready-docs-b3eb`, API `http://127.0.0.1:4020`,
Kong proxy `http://localhost:18020`, Kong Admin `http://localhost:19020`.
Started with `node scripts/worktree-compose.mjs up -d --build --wait`; all six
long-running services remain up, with Postgres, Kong, server, portal and Mailpit healthy.
A final HTTP check returned the catalog title `APIs · Developer Portal`.

| Acceptance criterion | Automated coverage | Result |
| --- | --- | --- |
| 1: anonymous index, catalog parity, descriptions, live links, identical signed-in/key responses | `apps/server/src/agent-docs.test.ts`; `apps/portal/e2e/agent-docs.test.ts`; `apps/portal/lib/llms-route.test.ts` | Pass; every emitted link fetched against Compose |
| 2: unpublished and nonpublic APIs absent; Markdown/spec return private 404s | `apps/server/src/agent-docs.test.ts` (unpublished, hidden, internal, manual, outsider); `apps/portal/e2e/agent-docs.test.ts` (real Kong visibility changes) | Pass |
| 3: latest Markdown operations, summaries, parameter fields and responses | `apps/server/src/agent-docs.test.ts` (refs, overrides, types, empty paths); `apps/portal/e2e/agent-docs.test.ts` | Pass |
| 4: imported YAML/JSON bytes, named versions and latest pointer | `apps/server/src/agent-docs.test.ts`; `apps/portal/e2e/agent-docs.test.ts` | Pass; comments/newlines preserved and latest is 2.0.0 |
| 5: unknown slug/id/version yields named 404 problem+json | `apps/server/src/agent-docs.test.ts`; `apps/portal/e2e/agent-docs.test.ts` | Pass |
| 6: curl, JavaScript and Python method, gateway path, configured key placeholder and body | `apps/portal/lib/reference-options.test.ts`; `apps/portal/e2e/agent-docs.test.ts` | Pass; actual Scalar POST samples checked in all three clients |
| 7: Markdown and Download spec links follow the viewed version | `apps/portal/e2e/agent-docs.test.ts` | Pass for latest 2.0.0 and named 1.0.0 |

**Failure paths:** Added signed-in outsider and forged expired-session checks for latest
and named restricted/unpublished references and downloads. The seven server agent-docs
tests pass, including concurrent repeated reads, invalid keys, unknown identifiers and
read availability without a reachable Kong Admin API; existing portal route tests cover
unreachable server (503), upstream failures and demo 404s. The live acceptance test also
verifies duplicate version publication returns 409 without changing source downloads.
Changed packages were typechecked before their tests; the revised JSO-173 alignment
assertion passed alone before the full pass.

**One full pass:** `pnpm lint` and `pnpm typecheck` pass. `pnpm test` passes all
797 tests in 83 files (Turbo reused 10 of 12 task results; server reran 324 tests).
`pnpm test:e2e` ran once: **91 passed, 2 skipped, 10 failed** in 7.3 minutes;
the saved Node.js client reset reproduced as its expected failure. Nine failures are
validation-environment failures: raw Compose calls in setup/account/outage tests target
the default `portal` project rather than this checkout, encountering occupied Mailpit
port 8025, missing services/schema, or leaving the intended gateway running. This QA
invocation supplied the portal/Kong URLs but omitted the raw-Compose project environment;
these failures do not establish application regressions, and the full suite was not repeated.
The remaining failure is the minor ambiguous quickstart heading selector documented below.
The separate spec acceptance run (`tests/spec021.playwright.config.ts`) passes its complete
AC1–7 journey against the real Compose Kong (1 passed, 10.4 seconds).

**Bug retests:** Ran `linear bug 021 done` for the reference/changelog HTTP statuses
and version/copy alignment after their browser regressions passed. Ran `linear bug 021 open`
for saved Node.js client persistence after reproducing its expected failure. No blocker or
major application defect remains; UAT may proceed with the full-suite validation limits above.
Local command logs: `/tmp/spec021-{lint,typecheck,test,e2e,agent-browser}.log`.

### Bugs
<!-- One line per bug, each with its Linear issue: - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] Minor: Scalar resets a saved Node.js Fetch sample selection to curl on reload; select More → Node.js Fetch on `/apis/sample`, reload, and observe Shell Curl despite `scalar-reference-selected-client-v2=node/fetch`. Tracked as an expected failure in `apps/portal/e2e/reference-snippets.test.ts`; all three required sample languages work before reload.
- [x] Minor resolved: Browser reference/changelog pages for unknown or invisible APIs now return HTTP 404; both `backlog-regressions.test.ts` and the real-Kong `access-requests.test.ts` pass their status assertions.
- [x] Minor resolved: Updated `backlog-regressions.test.ts` to align the version badge with Changelog in the 021 layout while retaining the Copy assertion; targeted and full-browser checks pass, as do compact badge checks at 1280px and 375px.
- [ ] Minor: `deploy/e2e/quickstart.spec.ts` uses an unqualified heading locator for “APIs”; the catalog now contains both an H1 and an H2 with that name, so the smoke assertion fails strict mode despite the healthy page and seeded catalog. Reproduced in the one full browser pass; scope the assertion to heading level 1 in a later test maintenance change.


## User testing  _(user-tester)_

2026-11-15: Focused retest on commit `d0a92bee1f3049fccb0617811df28b34d03d512b` using Orca's embedded browser at http://localhost:3020, desktop 1280×900 and mobile 390×844. Previously passing journeys were not repeated; current evidence: [UAT report](../uat/021/report.md).

| User story / failed check | Result | Evidence |
| --- | --- | --- |
| Retain sample language choice | STILL OPEN (minor) | “Node.js Fetch” changes to “Shell Curl” after reload. |
| Missing reference/changelog status | PASS | Browser requests for unknown reference and changelog both returned HTTP 404. |
| Version row alignment and mobile fit | PASS | Desktop version and Changelog centres both 206px; mobile links share a line and Download spec spans 358px with no overflow. Resolved failure image removed. |
| Keyboard use of sample controls | PASS | Tab reached More; Enter opened the picker; Escape dismissed it. |
| Catalog smoke-test heading ambiguity | STILL OPEN (minor test maintenance) | Catalog has both H1 “APIs” and H2 “APIs”; automated assertion remains QA-covered. |

No blocker or major is open; status is review. Console contained info entries only (`addDocument: 40 ms`), with no error line to quote. Stack stopped after testing.

### Follow-ups
- Scope the quickstart smoke heading locator to the H1 so leftover open products don't make it ambiguous
  deploy/e2e/quickstart.spec.ts:11 matches any heading named APIs; once an open product exists the catalog also renders H2 APIs (apps/portal/components/catalog-view.tsx:81) and strict mode fails. Scope to level 1. Pre-existing on main; not caused by spec 021.

## Review  _(tech-lead)_

Reviewed `git diff main...HEAD` at `b227e8c` (2026-11-15). QA tested `042dcf1`; the two later
commits change only docs, so I did not re-run the suite. All seven acceptance criteria are built
as designed and have tests. Visibility goes through `publishedApis` with the caller's viewer, and
`/llms.txt` always uses the anonymous viewer. Invisible and unknown APIs share one 404 detail.
Downloads send `source_content` byte for byte. No secrets, no migration, no new dependency and
no change to `deploy/`.

**Verdict: no blocking findings.** B1 and B2 from the last round are fixed and verified.

**E2E failures in QA's full run (10).** None of them blocks this branch.
- `deploy/e2e/quickstart.spec.ts:11` fails because the stack had old test data. It is not a
  regression from this branch. The H2 "APIs" in `apps/portal/components/catalog-view.tsx:81`
  already exists on `main`. This branch doesn't change that file. The H2 appears only when the
  anonymous catalog shows a product, and the anonymous catalog shows only `open` products.
  QA's long-lived stack had open products left from earlier runs. On a fresh CI stack, the
  journeys that run before the quickstart test end with their products `manual`, so the H2
  doesn't appear. It's recorded under Follow-ups and is a one-line fix (`level: 1`).
- The nine setup, account and outage failures come from the test environment. Each one fails in
  a raw `docker compose -f deploy/docker-compose.yml …` call against the default `portal`
  project, before any app assertion runs (see `/tmp/spec021-e2e.log`). They are in
  `setup-gateways.test.ts`, `account-security.test.ts` and `gateway.ts`, and this branch changes
  none of them. I don't require a local re-run before approval.
- **Merge gate note for Elango:** GitHub Actions hasn't run on this branch or on `main` (runs
  43753332535 and 43747702291). The job was not started because account payments failed or the
  spending limit was reached. So the "CI is the second run" check hasn't happened. Restore Actions
  billing and get a green CI before you merge.

**Suggestions** (no Fix task):
- S1 `apps/server/src/agent-docs.ts:46`: the `/llms.txt` link text uses the API title as it is.
  A title with `[` or `]` breaks the Markdown link. Escape brackets in the title.
- S2 `apps/portal/lib/reference-options.ts:23`: `hiddenClients` is a denylist, so any client a
  later Scalar release adds will appear in the picker. Pin the six clients with an allowlist
  test when Scalar is upgraded.
- S3 `apps/server/src/catalog.ts:103`: the latest `markdownUrl` and `downloadUrl` don't URL-encode
  the slug, but the per-version URLs and `agent-docs.ts` do. Current slugs are URL-safe, so
  nothing breaks today. Encode it for consistency.
- The open minor bug (Scalar resets the saved Node.js client to curl on reload) stays in Bugs.
