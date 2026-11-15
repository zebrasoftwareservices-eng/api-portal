# Spec 021 — User acceptance testing

Date: 2026-11-15. Tested checkout: `2f317d435d906370cc5fb474c4cdb8b4896d389c`; QA's running application build: `bd273fa9a18ec16f1342ac5109f251c5930e1636` (as recorded in the Test report). Portal: http://localhost:3020; real Kong: http://localhost:18020. Reused the healthy QA Compose stack without rebuilding.

Orca built-in browser; desktop 1280×900 and mobile 390×844, scale 1. Initial reference inspection also used the pane's 805×812 viewport. No application code, previous UAT rounds, old screenshots or browser log files were read.

| User story / criterion | Result | Observed evidence |
| --- | --- | --- |
| Find APIs as plain text — AC1 | PASS, anonymous journey | `/llms.txt` returned 200 `text/plain; charset=utf-8`, headed `# Developer Portal` and `## APIs`. Its 15 API entries matched all public catalog titles and slugs; all 30 Markdown/spec links returned 200. The Sample HTTP API entry included “A small HTTP API for trying your portal API key.” |
| Keep private/unpublished APIs out — AC2 | QA-covered; public view checked | Public catalog/index equality was checked in the browser. No unpublished or hidden fixture identifier was available from the permitted inputs, so direct hidden-resource requests were not repeated; QA's Test report records passing unpublished, hidden/internal/manual checks. |
| Read an API reference as Markdown — AC3 | PASS | Latest text was headed `# Orders QA 2.0.0`, returned `text/markdown`, and listed `GET /get`, `POST /orders`, `GET /orders/{id}`, `Responses: 200`, and `id | path | yes | string`. The sample reference exposed “Inspect a GET request” and “Inspect a POST request” in the browser. |
| Download each version — AC4 | PASS, user journey | The version menu offered 1.0.0 and 2.0.0. Their downloads returned distinct JSON documents naming the requested versions; latest named 2.0.0 and matched the explicit 2.0.0 document. Headers included `application/json` and versioned attachment filenames. Mobile and keyboard activation each started a `sample-1.0.0.json` download. Original imported bytes and YAML preservation remain covered by QA; original import files were not read. |
| Understand missing resources — AC5 | PASS | Unknown slug Markdown/spec, unknown UUID spec and unknown version spec returned 404 `application/problem+json`. Example: “API 'versions-b767e104-590b-4d9c-9d25-66a0195d5c7e' has no version 'no-such-version'.” |
| Choose code samples — AC6 | PASS | Chose JavaScript Fetch and Python Requests, and inspected curl plus Node.js Fetch. Samples used `http://localhost:18020`, the selected operation path/method, and `apikey: YOUR_SECRET_TOKEN`. Sample POST curl included `--request POST`, JSON content type and `--data '{}'`; Fetch used `body: JSON.stringify({})`, Python used `json={}`. Go and Java were also offered. Copy controls appeared beside samples. |
| Find Markdown/download from reference — AC7 | PASS | Latest and 1.0.0 pages exposed “View as Markdown (version …)” and “Download spec (version …)”; choosing the older Markdown link opened its `/versions/1.0.0/reference.md` document headed `# Orders QA 1.0.0`. |
| Mobile main journey | PASS | At 390×844, Changelog/Markdown shared a line, Download spec occupied the full content width, and there was no document horizontal overflow. Opened Markdown, returned to the reference, downloaded the spec and chose Python for POST; `requests.post` retained gateway URL, placeholder header and `json={}`. `success-mobile.png` is the single mobile success image. |
| Keyboard main journey | PASS | Using Tab/Enter/Escape for page interactions, reached Orders QA from the catalog, opened/dismissed its version menu, opened Markdown, then on the reference reached Download spec and started its download. Reached the sample language picker, opened it with Enter and dismissed it with Escape. Reference navigation was reset between the plain-text document and the remaining keyboard checks. |

Authenticated/API-key index equality, byte-for-byte imported JSON/YAML preservation and hidden fixtures are API assertions supported by QA's recorded passing tests, rather than claimed as new manual checks. UAT used anonymous browsing and test fixture content; no account or real key was entered.

## Existing open findings retested

| Finding | Result | Current evidence |
| --- | --- | --- |
| Saved Node.js sample resets on reload (minor) | STILL OPEN | More → Node.js → Fetch displayed “Node.js Fetch”; saved preference was `node/fetch` before reload. Reload displayed “Shell Curl”. This does not prevent selecting any required language. |
| Unknown/invisible browser pages return HTTP 200 (minor) | STILL OPEN | Requests to `/apis/uat-no-such-api` and its `/changelog` returned 200 with not-found content. Agent-readable Markdown/spec endpoints returned 404 correctly. The unknown-page case reproduced; hidden-page variants remain QA-covered. |
| Version badge/title alignment (minor) | STILL OPEN | At 1280×900, the version control occupies the row below the title; its center is outside the heading bounds. `version-alignment-fail.png` records this layout; all new document controls remain reachable. |

All three were recorded with `node scripts/factory.mjs linear bug 021 open "<match>"`; each remained an unkeyed minor. No new blocker/major or durable issue was created.

## Console and disposition

Checked `orca console --limit 50 --json` after the main journey and again after reload: **no error-level entries**. There is no console error line to quote; the final informational line was `addDocument: 42 ms`. No console/network dump was saved.

Result: **review**, with the three existing minors open. The evidence folder is flat with two local PNGs, neither staged or committed; no round directory was created. The reused Compose stack was stopped after testing.
