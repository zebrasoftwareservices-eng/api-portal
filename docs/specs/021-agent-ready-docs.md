---
id: 021
title: Agent-ready docs — Markdown pages, llms.txt, spec downloads and code samples
status: review   # draft → ready → designed → building → testing → uat → review → approved → done
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

## Test report  _(qa-tester)_

Tested commit: `bd273fa9a18ec16f1342ac5109f251c5930e1636` (application and QA tests). Portal URL from `node scripts/worktree-compose.mjs env`: **http://localhost:3020**; isolated Compose project `portal-021-agent-ready-docs-b3eb`, real Kong at `http://localhost:18020`.

| Criterion | Automated tests | Result |
| --- | --- | --- |
| 1 — public index, anonymous/authenticated equality, working links | `apps/portal/e2e/agent-docs.test.ts`; `apps/server/src/agent-docs.test.ts` | PASS: catalog equality, every emitted link fetched, signed-in developer/admin, API key and expired-cookie requests |
| 2 — unpublished and non-public APIs remain invisible | `apps/server/src/agent-docs.test.ts`; `apps/portal/e2e/agent-docs.test.ts` | PASS: unpublished fixture plus hidden/internal/manual products; latest and version Markdown/downloads return private 404 problem+json |
| 3 — latest Markdown contains operations and parameter/response details | `apps/portal/e2e/agent-docs.test.ts`; `apps/server/src/agent-docs.test.ts` | PASS: GET/POST, summaries, parameter table, response codes; local references, overrides, body and empty-path fixtures |
| 4 — source-preserving JSON/YAML version downloads and latest pointer | `apps/portal/e2e/agent-docs.test.ts`; `apps/server/src/agent-docs.test.ts` | PASS: byte-identical imported YAML 1.0.0 and JSON 2.0.0, latest 2.0.0, matching types; legacy JSON fallback |
| 5 — missing API/version returns named 404 problem+json | `apps/portal/e2e/agent-docs.test.ts`; `apps/server/src/agent-docs.test.ts` | PASS: unknown slug, UUID and version, both formats |
| 6 — curl, JavaScript and Python samples | `apps/portal/e2e/agent-docs.test.ts`; `apps/portal/lib/reference-options.test.ts` | PASS: actual Scalar clients show POST, gateway URL/path, custom x-agent-key placeholder and example body |
| 7 — latest and viewed-version Markdown/download links | `apps/portal/e2e/agent-docs.test.ts`; `apps/portal/components/api-page.test.tsx`; `apps/portal/components/version-pages.test.tsx` | PASS: latest and 1.0.0 page links target the viewed version |

Failure-path coverage also includes duplicate version rejection without source replacement, concurrent repeated reads, expired sessions and invalid keys on private formats, and the portal's unreachable-upstream 503, upstream errors and demo 404 (`apps/portal/lib/llms-route.test.ts`). The focused server run passed 6 tests, focused portal run passed 17 tests, and the new live acceptance test passed against Compose; the saved-client reload regression is an explicit expected failure for the minor below.

One full validation pass on the tested commit:

| Command | Result |
| --- | --- |
| `pnpm lint` | PASS (7 packages) |
| `pnpm typecheck` | PASS (12 Turbo tasks) |
| `pnpm test` | PASS: 796 tests in 83 files across database, Kong adapter, SDK, portal and server; Turbo reused unchanged package results |
| `pnpm test:e2e` | FAIL: 98 passed, 2 skipped, 3 unexpected failures in 9.6 minutes. Spec 021's complete live test passed (test 95). |
| `node scripts/worktree-compose.mjs up -d --build --wait` | PASS: build and all service health checks in 145 seconds; stack left running for UAT |

The three unexpected browser failures are `backlog-regressions.test.ts`'s JSO-173 version/title alignment assertion (badge center 203px versus title bottom 169px), its JSO-223/JSO-228 unknown API HTTP-status assertion, and `access-requests.test.ts`'s invisible/unknown reference and changelog HTTP-status assertions. The latter two share the same rendered not-found HTTP 200 behavior; the agent-readable endpoints pass their visibility and 404 checks. Four expected failures remain explicitly marked by the tests: existing setup findings JSO-399/405/406 and the saved sample-client reload issue below; no blocker or major was found. Logs: `/tmp/spec021-qa/{lint,typecheck,test,e2e,quickstart}.log`; the full pass was not repeated.

### Bugs
<!-- One line per bug, each with its Linear issue: - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] Minor: Scalar resets a saved Node.js Fetch sample selection to curl on reload; select More → Node.js Fetch on `/apis/sample`, reload, and observe Shell Curl despite `scalar-reference-selected-client-v2=node/fetch`. Tracked as an expected failure in `apps/portal/e2e/reference-snippets.test.ts`; all three required sample languages work before reload.
- [ ] Minor: Browser reference/changelog pages for unknown or invisible APIs render the not-found UI with HTTP 200. The existing unknown-page and access-request browser tests fail their HTTP 404 assertions; the JSON catalog, Markdown and spec endpoints still enforce visibility and return 404 correctly.
- [ ] Minor: The existing version/copy alignment regression fails because the reference version badge center sits outside the title's vertical bounds (`apps/portal/e2e/backlog-regressions.test.ts`, version alignment test); compact badge checks at 1280px and 375px pass.

## User testing  _(user-tester)_

2026-11-15: Orca browser UAT on QA's running http://localhost:3020 stack; desktop 1280×900, mobile 390×844, plus keyboard journey. Current evidence: [UAT report](../uat/021/report.md).

| User story | Result | Evidence |
| --- | --- | --- |
| Discover public plain-text docs | PASS (anonymous) | “# Developer Portal”; all 15 public catalog APIs and all 30 document links returned 200. |
| Read operations as Markdown | PASS | “# Orders QA 2.0.0”; GET/POST operations, `id | path | yes | string`, and “Responses: 200”. |
| Download viewed API versions | PASS | Distinct 1.0.0/2.0.0 JSON, latest 2.0.0; “Download spec” started the expected file on mobile and keyboard. Original-byte/YAML checks remain QA-covered. |
| Choose language samples | PASS | JavaScript Fetch, Python Requests and curl show the Kong URL, method/path, placeholder key and POST body. |
| Use document controls on mobile and keyboard | PASS | Mobile full-width Download spec, no horizontal overflow; Tab/Enter/Escape reached document links and menus. `success-mobile.png` is local evidence. |
| Handle missing/private resources | PASS for missing resources; privacy QA-covered | Named 404 problem+json for missing API/version; unpublished/hidden fixtures and authenticated-index equality remain covered by QA's Test report. |
| Retest existing minor findings | STILL OPEN (minor only) | Node.js choice resets to “Shell Curl”; unknown reference/changelog returns HTTP 200; title/version alignment remains (`version-alignment-fail.png`, local). |

No blocker or major found; status is review. Console checks contained no error-level entries; no error line exists to quote. Stack stopped after testing.

## Review  _(tech-lead)_

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
