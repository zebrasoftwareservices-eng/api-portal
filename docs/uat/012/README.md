# Spec 012 user acceptance testing — 2026-11-09

Outcome: **building**. All eight user stories were walked in Orca’s built-in browser; the developer story fails for published version names containing `+`. No application code or automated tests were changed.

## Environment and method

- Fresh standard Compose project (`portal`), real Kong 3.9 and PostgreSQL 17, local evaluation credentials and synthetic developer data only. Docker was empty before startup. `docker compose -f deploy/docker-compose.yml up -d --wait` completed in **15.20 seconds** using existing production images; this is startup timing, not an uncached build measurement.
- Orca tab `a9a5fabb-658c-484e-b754-fca2f391f656`, `http://localhost:3000`. Snapshot → UI action → snapshot, with keyboard Enter/Tab/Escape and arrow navigation; browser actions and findings are preserved in `browser-log.jsonl`.
- Desktop 1280×900; mobile 390×844 with touch emulation reapplied after navigation. Scale 3 was attempted per the role checklist, but Orca’s screenshots tiled the same page pixels. Those captures were discarded and visual evidence was retaken at scale 1. This was a screenshot-tool limitation, not evidence of portal reflow failure.
- Some Orca click commands reported success without activating the offscreen submit control. Keyboard focus + Enter reliably submitted; failed stale refs and mismatched text/URL waits in the raw log are automation mistakes, not product failures.
- The seeded API retained its slug `sample`, Kong service `portal-sample`, base URL and single catalog entry. Version `1.0.1` established the orders GET baseline without replacing seeded `1.0.0`; `2.0.0` removed GET /orders and added POST /orders. Fixtures are in `fixtures/`.

## Journey evidence

| User story / visible criterion | Result and observation | Screenshots |
| --- | --- | --- |
| Publish another version on one API (AC1) | PASS for numeric versions: published 1.0.1 then 2.0.0, same service/base URL and one catalog row; latest switcher selected v2. | `02-v2-published.png`, `06-switcher-desktop.png`, `18-linked-service-handoff.png` |
| Publish an older patch without changing default (AC2) | PASS: checked opt-out on 1.1.0; success said developers still see 2.0.0. Then unchecked/default publication of 1.2.0 became latest. The raw log records both 201 responses and UI/table state; `21` later also shows a non-default success. | `21-custom-replaces-default.png`; `browser-log.jsonl` |
| Set any version as latest (AC9) | PASS: selected Set 2.0.0 as latest from mobile, focus moved to success status and the Latest badge moved back to v2; public default subsequently showed v2. | `26-switcher-mobile.png`; `browser-log.jsonl` |
| Write release notes and read generated summary (AC3) | PASS: note “Orders can now be created”, date, compared-with 1.0.1, Added POST /orders, Removed GET /orders, Breaking notice and badge. | `10-changelog-desktop.png`, `09-changelog-mobile.png` |
| Refuse docs-breaking imports (AC5) | PASS: duplicate operationId, missing internal ref and undeclared id tested individually in both forms; 422 problem+json, rule/message/1-based line/pointer, retained form values and no published bad-version rows. Corrected upload subsequently succeeded. | `13-duplicate-operation-error-mobile.png`, `14-unresolved-ref-error-mobile.png`, `15-parameter-error-mobile.png`, `16-lint-error-desktop.png`, `19-new-api-lint-refused.png` |
| Show nonblocking warnings (AC6) | PASS: warning-only orders document published; collapsed 10-warning summary expanded by Tab/Enter to rule, message, line and pointer; success and errors are focused. | `02-v2-published.png`, `03-warnings-expanded.png` |
| Replace company ruleset (AC7) | PASS: mounted `operator-ruleset.yaml`, restarted only this stack’s server; custom-refused lacked descriptions and returned 422 operation-description. custom-allowed supplied descriptions but duplicated operation IDs and published, proving default rules were replaced. | `20-custom-ruleset-refusal.png`, `21-custom-replaces-default.png` |
| Developer switches versions and reads changelog (AC1/3/9) | **FAIL for + versions; PASS for numeric versions.** Keyboard menu, Escape focus return, Tab to changelog, Back, stable v1 refresh, noticeable older-version notice, latest link, mobile menu without Scalar clipping and unknown-version recovery worked. Published 1.0.0+build.1 opened Version not found. | `07-older-version-desktop.png`, `08-older-version-mobile.png`, `26-switcher-mobile.png`, `17-plus-version-not-found.png`, `33-unknown-version.png` |

## Other states and recovery

- Empty submit says “Choose an OpenAPI file”; wrong password says “Email or password is incorrect” and valid local login recovers. Upload and linting pending states were observed with controls disabled.
- Duplicate 2.0.0 returned 409 problem+json and left the table/latest unchanged (`12-duplicate-refused.png`). Minor copy friction: the alert heading displays “api version exists”; the explanatory sentence is useful. This stays in the spec for the current fix loop.
- The linked-service import warning explains why to add a version and links to `/admin/apis/sample#add-version`; following it reached the separate version form (`18-linked-service-handoff.png`).
- Missing ruleset showed path, ENOENT and instructions to fix PORTAL_LINT_RULESET and restart on both admin pages; submit returned 503, no retry button, no new version (`22`–`24`). Invalid mounted YAML similarly showed its path and “Invalid ruleset provided” (`25`). Health reported degraded/lint error and startup logs named the failures; see `missing-ruleset-*` and `invalid-ruleset-*`. The default server configuration was restored successfully afterward.
- Signed-out admin access redirected to sign-in with `next`; a newly registered developer saw Page not found for admin versions (`27-signed-out-admin.png`, `30-developer-no-permission.png`). Signup, empty app list, selected API subscription, app/key creation and access link “Open in UAT version reader” worked (`28`, `29`, `31`).
- The new developer’s key worked through Scalar on the stable 1.0.0 reference: GET /get and GET /uuid both returned 200 through the real Kong-backed try-it proxy. UUID screenshot avoids echoing the credential (`32-older-version-try-it-200.png`); keys are redacted in the text log. Latest/older automated call coverage remains in the QA report; this UAT’s real call used the preserved old sample document because synthetic /orders paths are not httpbin routes.
- Console checks after journeys showed Scalar timing information and no JavaScript errors. Network checks showed successful loads/publications/try-it and expected deliberate 409, 422 and 503 responses. No gateway or session failure was hidden by a demo fallback.
- Incoming Bugs contained no open items: the pre-hydration defect and QA-only findings were already verified closed. Normal file uploads succeeded here; UAT did not inject a pre-hydration script delay, whose passing deterministic regression is recorded by QA.

## Open finding UAT-012-01 — major

Published `+` version references cannot be read. Steps: admin opens /admin/apis/sample; uploads fixtures/1.0.0+build.1.json with “Don’t make this the default version” checked; follows the versions-table View link. Publication returns 201 and the table lists 1.0.0+build.1; the link /apis/sample/versions/1.0.0%2Bbuild.1 instead displays **Version not found**, saying the API has no version **1.0.0%2Bbuild.1**. Refresh reproduces at desktop and mobile widths. Expected: the accepted published version loads at the stable URL; `+` is explicitly allowed and requested in UX §9. Evidence: `17-plus-version-not-found.png`, the preceding success/table snapshot and refresh in `browser-log.jsonl`.

Durable Bug creation was attempted under JSO-240 (team JSO, label Bug, priority High, intended state Todo), but Linear returned **Usage limit exceeded — free issue limit**. The intended title is “UAT: published versions containing + open Version not found”; create it once capacity returns, keeping parent JSO-240. The same finding and deferred issue details are recorded in the spec and feature summary. Fix task: make accepted encoded version names resolve to the published reference, and retest all three entry points (admin table, switcher, changelog) in the browser.

## Teardown

Completed `docker compose -f deploy/docker-compose.yml down -v`: this UAT’s containers, network and fresh PostgreSQL test volume were removed. `docker ps` was empty afterward; no other worktree’s containers were stopped. The coordinator was notified immediately and confirmed the report may be completed with no further Docker use.
