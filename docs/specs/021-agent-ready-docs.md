---
id: 021
title: Agent-ready docs — Markdown pages, llms.txt, spec downloads and code samples
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
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

1. **Given** published APIs **When** an anonymous client requests `GET /llms.txt` **Then** it
   gets `text/plain` in the llms.txt format listing every API the public catalog shows an
   anonymous visitor, each with its title, one-line description, a link to its Markdown
   reference and a link to download its latest spec; every link in it returns 200.
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

## Open questions
- [ ] **Visibility for `/llms.txt` before spec 010 ships.** Recommended: `/llms.txt`, Markdown
  pages and spec downloads show exactly what the public catalog shows, using the same visibility
  check, so spec 010 applies automatically when it ships; an unpublished API never appears
  (criterion 2). — Elango
- [ ] Should a signed-in developer's agent see more in `/llms.txt` than an anonymous one (for
  example through an API key), or is `/llms.txt` always the anonymous view? — Elango
- [ ] Markdown URL convention: `.md` suffix, `Accept: text/markdown`, or both? Should
  `/llms-full.txt` (every page inlined) be included? — tech-lead
- [ ] Code samples: does Scalar already give us the languages we need, and which languages
  beyond curl, JavaScript and Python (Go, Java)? — tech-lead
- [ ] If spec 012 hasn't shipped when this is built, should criterion 4 be reduced to the latest
  spec download, with per-version downloads added to 012? Recommended: build 021 after 012. —
  Elango

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/021-*.md`

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
