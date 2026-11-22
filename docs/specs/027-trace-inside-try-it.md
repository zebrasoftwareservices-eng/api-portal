---
id: 027
title: Trace inside Try it
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-22
linear:            # the one feature issue, e.g. JSO-117 — filled by `node scripts/factory.mjs linear-init 027`
---

# 027 — Trace inside Try it

## Summary
When a signed-in developer or admin clicks **Try it** in the API reference, the portal shows the
Kong trace waterfall for that exact call under the response. Each person sees only the traces of
calls they made themselves. Builds on spec 026.

## Problem
Spec 026 gives portal admins a waterfall of the latest traced call per API, on an admin page.
A developer whose Try it call is slow or fails sees only the status and body. They cannot tell
whether the gateway (an auth or rate-limit plugin) or the upstream used the time, so they open a
support request, and the admin has to find the call again on the trace page. An admin testing an
API from the reference has to leave it and open the trace page, where another traced call may
already have replaced the one they made.

Kong can tie a trace to one call. The [OpenTelemetry plugin](https://docs.konghq.com/hub/kong-inc/opentelemetry/)
supports W3C trace context propagation, and Kong's own example reads the incoming `traceparent`
header, which carries the trace id and parent span id
([Kong cookbook, voice AI observability](https://developer.konghq.com/cookbooks/voice-ai-observability/)).
If Try it sends a `traceparent` with a trace id the portal chose, the spans Kong exports carry
that id, and the portal can show exactly that call's trace to the person who made it.
Zuplo shows one trace row per request with no collector to run
([Zuplo OpenTelemetry docs](https://zuplo.com/docs/articles/opentelemetry)); spec 026's
[research brief](../research/show-opentelemetry-traces-for-one-api-re.md) has the Kong span names,
node settings and redaction rules this spec reuses. No research brief exists for this idea.

Solved when, on the quickstart with tracing on for the sample API, a developer clicks Try it and,
within 30 seconds and without leaving the reference, names the slowest span of their own call,
and cannot see anyone else's.

## Users
- **API consumer (developer)** (primary): tries an operation from the reference and wants to know
  why that call was slow or failed.
- **Portal admin**: tries an API from the reference while diagnosing it and wants the trace of
  that call, not whichever call came last.

## User stories
- As a developer, I want to see the trace of my own Try it call under its response, so that I
  know whether the gateway or the upstream used the time.
- As a developer, I want to be sure nobody else can see my calls' traces and I can't see theirs,
  so that I can trust the portal with my traffic.
- As a portal admin, I want the Try it trace to show the plugin names, so that I can tell which
  plugin is slow without opening the admin trace page.
- As a developer or admin, I want Try it to tell me plainly when there is no trace (tracing off,
  still waiting, nothing arrived, call never reached Kong), so that I don't wait for nothing.

## Acceptance criteria
Criteria marked *(proposed)* use the PM's proposed answer to an open question below and change
if Elango decides otherwise.

1. **Given** the quickstart, tracing on for the sample API (spec 026), and a signed-in developer
   with a key for it **When** they click Try it on an operation and the call returns **Then**
   within 30 seconds a trace panel under the response shows that call's method, path without the
   query string, status code, total duration in milliseconds, and the waterfall labelled as in
   spec 026 criterion 6 (request, router, plugin, upstream, slowest marked); and the trace id the
   panel shows equals the trace id in the `traceparent` header the Try it request sent to Kong.
2. **Given** two signed-in developers, X and Y, who each click Try it on the same traced API within
   the same second **When** both trace panels fill **Then** each panel shows only the spans of its
   own call (the trace ids differ and match each one's `traceparent`), and neither panel shows
   the other's call.
3. **Given** developer Y knows the trace id of developer X's Try it call **When** Y, or an
   anonymous visitor, asks the API for that trace **Then** the API answers 404 problem+json to Y
   and 401 problem+json to the visitor, and returns no span. Spec 026's admin endpoints (tracing
   settings, selections, Test, per-API latest trace) still answer 403 to a developer.
4. **Given** a developer's Try it call that passed through Kong plugins, sent with a query string
   (`?token=abc123`), custom headers and a body **When** the developer's trace panel shows it and
   the developer fetches it through the API **Then** plugin spans are labelled `plugin` without the
   plugin's name *(proposed)*, timings are shown, and `abc123`, the client IP, the upstream address,
   headers, bodies and every attribute outside spec 026 criterion 7's allowlist appear in neither.
5. **Given** a portal admin who clicks Try it on the same traced API **When** the trace panel
   fills **Then** it shows each plugin span with its plugin name (for example `key-auth`)
   *(proposed)*; **and** spec 026's admin trace page for that API now shows this call as its latest
   trace, so the 026 page works as before.
6. **Given** the same developer makes a second Try it call **When** its trace panel fills **Then**
   the first call's trace can no longer be fetched through the API (404); the portal keeps at most
   one Try it trace per user, and keeps no list or history of them.
7. **Given** tracing is off for the API, and neither the developer's account nor their team is in a
   tracing selection *(proposed: Try it calls are traced only when tracing is on for them)* **When**
   they click Try it **Then** the response shows as usual and the trace panel says straight away
   that tracing is off for this API, with no waiting spinner; for a portal admin the message links
   to the API's tracing settings.
8. **Given** tracing is on for the API but no spans for the call reach the portal (for example the
   Kong node has `tracing_instrumentations` off, or the trace endpoint is unreachable from Kong)
   **When** the user clicks Try it **Then** the response shows as usual, the panel shows "waiting
   for trace" for up to 30 seconds, then a "no trace arrived for this call" message, and never
   another person's trace. The developer's message names no Kong setting; the admin's message names
   `tracing_instrumentations` and links to the Test in the tracing dialog.
9. **Given** Kong does not answer the Try it call (gateway down or unreachable) **When** the user
   clicks Try it **Then** Try it shows the call error as it does today, and the trace panel says the
   call did not reach the gateway, without waiting 30 seconds and without showing a waterfall.

## Out of scope
- **Changing spec 026's admin trace page, selection, dialog or Test.** They stay as they are; this
  spec only adds a Try it panel and a per-user Try it trace.
- **Traces of calls not made from Try it** (a developer's own code, curl, an SDK), and a developer
  trace page outside the reference. Try it only.
- **A developer turning tracing on.** The admin's selection decides what is traced (026 Decision 5),
  unless Elango answers the first open question otherwise.
- **Trace history, a list of past Try it traces, search, filters, sharing a trace link.** One trace
  per user, replaced by their next Try it call (026 Decision 3).
- **Upstream host or address in any view.** Spec 026 never stores it, so no role can see it.
- **Logs, and jumping from a log line to a trace** (026 Decision 1).
- **Traces in the static Vercel demo** (spec 002). It has no gateway or Try it calls through Kong.
- **AWS API Gateway and other adapters.** The spans and propagation are Kong's.
- **Changing `tracing_instrumentations` or `tracing_sampling_rate` on the Kong node.**

## Decisions
Elango, 2026-11-22.
1. **Whoever makes the Try it call sees the trace of their own call,** developers and admins alike.
   A developer sees only traces of calls they made. This reverses spec 026 Decision 2 (portal admins
   only) for Try it calls; the admin trace page from 026 stays as is.

## Open questions
- [ ] Are Try it calls traced always, or only when tracing is on for that API, developer account or
  team? Proposed: only when on (criterion 7). It needs no new Kong plugins and keeps 026 Decision 5
  ("calls outside the selection produce no trace"). "Always" means a tracing plugin on every
  published API, which then also traces non-Try-it traffic unless the plugin only keeps calls that
  carry a portal `traceparent`. — Elango
- [ ] Which span details may a developer see versus an admin? Proposed: both see labels and timings;
  only admins see plugin names (criteria 4 and 5), because the plugin list is the operator's
  configuration (026 brief). Nobody sees the upstream host, which is never stored. — Elango
- [ ] How is the trace tied to one call? Proposed: the portal gives Try it a fresh trace id bound to
  the signed-in user, Try it sends it as a W3C `traceparent`, and the server keeps that call's spans
  for that user only. Open for the design: whether the browser calls Kong directly (then Kong's CORS
  must allow `traceparent`) or through the server; whether the OpenTelemetry plugin's propagation
  must be set to extract W3C; and whether Kong honours the `sampled` flag of an incoming
  `traceparent` or applies `tracing_sampling_rate` anyway (not confirmed in Kong's docs). — tech-lead
- [ ] What does Try it show when the Kong node settings are missing or the trace has not arrived?
  Proposed: criteria 7–9 (off straight away; wait up to 30 s, then "no trace arrived"; gateway down
  straight away), with Kong setting names shown to admins only. Is 30 seconds the right wait? — Elango
- [ ] Does a Try it trace also replace the API's latest trace on the 026 admin page? Proposed: yes
  (criterion 5), since 026 already counts Try it calls. — Elango
- [ ] A developer who uses Try it signed out with a pasted key: no trace (proposed), since the trace
  is tied to a user. — Elango

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
ADR 0019 (new) builds on ADR 0003 (the Try it proxy) and ADR 0018 (Kong pushes traces). The design
uses the PM's proposed answers to the open questions. Changing an answer changes only the step
named beside it.

**How a call gets its trace.** Try it already goes through `/api/v1/try-it`, so the browser never
calls Kong. No CORS change is needed.
1. The proxy resolves the target API (as today) and the viewer (`loadViewer`).
2. It decides the trace state:
   - `signed-out`: no session (open question 6).
   - `off`: tracing is not configured, the adapter doesn't support it, or no selection covers the
     call. A selection covers the call if it is an `api` selection for the target API, a
     `developer` selection for the caller, or a `team` selection for a team the caller belongs to
     (open question 1).
   - `traced`: otherwise.
3. If the state is `traced`, the proxy does three things:
   - generates `traceId` (16 random bytes, hex) and `spanId` (8 bytes, hex);
   - upserts the caller's `try_it_traces` row (new trace id, empty spans, `issued_at = now()`) and
     commits before calling Kong, which deletes the previous trace (AC 6);
   - adds `traceparent: 00-<traceId>-<spanId>-01` to the forwarded headers. A browser
     `traceparent` or `tracestate` is never forwarded.
4. Every response from the route carries `X-Portal-Trace-State`. A `traced` response also carries
   `X-Portal-Trace-Id`. This includes the 400, 403, 413, 429 and 504 problems. A 400 or 429 is
   decided before step 2, so it is `off`.
   - A transport failure (503 `gateway-unavailable`) deletes the row it just wrote and answers
     `unreachable` (AC 9).
   - A 504 timeout stays `traced`, because Kong received the call and may still export spans.
5. Kong's `opentelemetry` plugin (portal tracing plugins only) now has
   `propagation.extract: ['w3c']`, so the exported spans carry the portal's trace id.
6. Ingest (`POST /v1/internal/traces/kong`) keeps all of its 026 checks. Inside the existing
   transaction and advisory lock, it also merges each trace-id group into the matching
   `try_it_traces` row by span id. The 1000-span cap and newer/older rules are the same. A group
   that matches a Try it row is stored even when no API can be resolved for it. The root is an
   unparented span, or the `kong` request span whose parent is the portal span id from
   `traceparent` (Kong does not export that parent). `ready` follows that root, so a parented
   request span does not stay `waiting`. The API's `trace_latest` is still updated as before
   (AC 5, open question 5), using the same root.
7. The panel reads `X-Portal-Trace-*` from Scalar's API-client plugin hook
   `onResponseReceived({ response })` (`@scalar/types` `apiClientPluginSchema`). If the state is
   `traced`, it polls `GET /api/v1/try-it/traces/{traceId}` every 2 s until `ready` or `missing`.

**Components**
- `apps/server`:
  - `proxy.ts`: trace state, traceparent, row upsert and delete, response headers.
  - `tracing.ts`: selection-coverage helper, the Try it merge in ingest, and the new GET route
    with role redaction. `traceView` gains a redact option.
  - Registration order: the proxy needs `auth` (already passed) and the tracing connection.
- `packages/adapter-kong`: `tracingConfig` changes `extract` to `['w3c']`. The next tracing
  apply rewrites existing plugins idempotently (deep-equal check, stable ids, `PUT`).
- `packages/db`: the new `try_it_traces` table and a migration.
- `apps/portal`:
  - `components/reference.tsx`: a Scalar API-client plugin with the `onResponseReceived` hook.
  - A React trace panel under the response that reuses spec 026's waterfall component, in a
    read-only variant.
  - Copy differs by role (an admin gets the setting names and links). The UI designer owns layout
    and copy.
- `packages/sdk`: regenerate for the new operation.
- Nothing changes in `packages/adapter-sdk`; the interface is unchanged.

**API contract** (`apps/server/openapi.yaml`, already updated)
- `/v1/try-it` (all methods): the description now covers the trace context. Every response
  carries `X-Portal-Trace-State` (`traced | off | signed-out | unreachable`). A traced response
  also carries `X-Portal-Trace-Id` (32 hex). Both are in `components/headers`.
- `GET /v1/try-it/traces/{traceId}` (`getTryItTrace`, tags try-it and tracing, session
  required) returns `200 TryItTrace`:
  - Fields: `{ traceId, state: waiting|ready|missing, issuedAt, trace: Trace|null }`.
  - `ready` means the root span arrived: an unparented span, or the `kong` request span whose
    parent is the portal span id. `missing` means no root span 30 s after `issuedAt`
    (open question 4). A late root span turns it `ready`.
  - Errors: `400` (bad id pattern), `401` (signed out, AC 3), and `404` for any id that is not
    the caller's current row (another person's, replaced, or unknown; one body, AC 3 and 6).
  - Portal admin (`role = 'admin'`): `plugin` and Kong's `name` are kept.
  - Anyone else: `plugin: null`, and `name` is the same as `label` (AC 4, 5; open question 2).
  - `api` is filled from `try_it_traces.api_id`.
- `POST /v1/internal/traces/kong`: the description adds the Try it merge. The status codes stay
  the same.
- Spec 026's admin endpoints are unchanged and still answer 403 to non-admins (AC 3).

**Data model** (`packages/db/src/schema.ts`, migration via `pnpm --filter @portal/db exec drizzle-kit generate`)
`try_it_traces`:

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid | PK, FK `user.id`, on delete cascade |
| `trace_id` | text | not null, unique index, check `^[0-9a-f]{32}$` |
| `api_id` | uuid | null, FK `apis.id`, on delete cascade |
| `issued_at` | timestamptz | not null, default now() |
| `received_at` | timestamptz | null |
| `started_at` | timestamptz | null |
| `root_span_id` | text | null |
| `request` | jsonb | null, `{ method, path, statusCode }` |
| `spans` | jsonb | not null, default `[]`, `StoredTraceSpan[]` |

- It stores only 026's allowlisted fields: no query string, IP, upstream, headers or bodies.
- There is at most one row per user and no history (AC 6).
- Rows are only ever replaced, so no cleanup job is needed.

**Adapter calls**
- No new Kong calls. `applyTracing` rewrites portal tracing plugins whose config differs.
  Changing `extract` makes the first apply after upgrade `PUT` each one, using stable ids. That
  is idempotent, tagged `portal-tracing`, and failures follow the existing apply status.
- Upgrade: queue one tracing apply at server start when settings exist. The apply is already
  queued on settings and selection changes, so it only needs to run once at boot. Without it,
  Kong keeps `extract: []`, and Try it calls show "no trace arrived" until the next apply.

**Risks and tests**
- *Kong ignores the incoming `sampled` flag.* `tracing_sampling_rate` might win over the flag.
  QA tests against the quickstart Kong with `KONG_TRACING_SAMPLING_RATE=0.01`: 5 traced Try it
  calls must all get a trace. If they don't, record a finding. The fallback is the AC 8 message,
  not a wrong trace.
- *Cross-user leak.* Covered by AC 2 and AC 3 integration tests: two users at once; a guessed id
  answered 404 to another user and 401 to an anonymous caller; a replaced id answered 404.
- *Spoofed trace ids from outside Try it.* `extract: ['w3c']` accepts any client's
  `traceparent` on traced routes. Ids are 128-bit random and shown only to their owner (ADR 0019).
  A client can force sampling, but only inside an admin's selection.
- *Plugin names reaching a developer.* A unit test on the redacted `traceView` checks that a
  non-admin response contains no `kong.*.plugin.<name>` text. QA checks the e2e JSON too (AC 4).
- *Coverage approximation.* A developer or team selection covers the apps of that developer or
  team. The proxy can't see which app's key is pasted, so a covered user calling with someone
  else's key gets `traced` and then `missing`. This is acceptable and needs no extra test.
- *Ingest volume.* No new load beyond Try it calls inside selections.

### Tasks
- [x] [backend] `packages/db`: add the `try_it_traces` table (columns, checks, unique `trace_id`, FKs with cascade) and generate the migration with `pnpm --filter @portal/db exec drizzle-kit generate`
- [x] [backend] `packages/adapter-kong`: `tracingConfig` propagation `extract: ['w3c']`; update adapter tests; the server queues one tracing apply at start when tracing settings exist
- [x] [backend] `apps/server/src/tracing.ts`: export a `tryItTraceState(db, viewer, apiId)` coverage helper (api, developer, or member-team selection; configured; adapter supports tracing) returning `traced | off | signed-out`
- [x] [backend] `apps/server/src/proxy.ts`: generate the trace id and span id; upsert the row before the call; add `traceparent`; drop any browser `traceparent` or `tracestate`; set `X-Portal-Trace-State` and `X-Portal-Trace-Id` on every response, problems included; on a 503 transport failure delete the row and answer `unreachable`; on a 504 keep `traced`
- [x] [backend] Ingest: inside the existing transaction, merge each trace-id group into the matching `try_it_traces` row (span-id merge, 1000 cap, `root_span_id`, `request`, `started_at`, `received_at`); keep the `trace_latest` behaviour; store a matching group even when no API resolves
- [x] [backend] `GET /api/v1/try-it/traces/:traceId`: session required (401); owner and current id, otherwise one 404; `state` waiting/ready/missing (30 s); `traceView` redaction for non-admins (`plugin: null`, `name = label`); regenerate `packages/sdk`
- [x] [backend] Unit tests: coverage helper, traceparent format and the dropping of browser headers, redaction, ingest merge into the Try it row and `trace_latest`, 404 for another user, replaced or unknown id
- [x] [frontend] `components/reference.tsx`: register a Scalar API-client plugin with `onResponseReceived` that reads `X-Portal-Trace-State` and `X-Portal-Trace-Id` and drives a React trace panel under the response
- [x] [frontend] Trace panel: reuse spec 026's waterfall read-only; show method, path, status, total ms, labels and the slowest span; poll `getTryItTrace` every 2 s until `ready` or `missing`; states off (immediate), waiting, missing (after 30 s), unreachable (immediate), signed-out; admin copy names `tracing_instrumentations` and links to the tracing settings and Test; developer copy names no Kong setting (per the UX doc)
- [x] [qa] Integration (Testcontainers Kong + Postgres): AC 1 (the trace id equals the sent `traceparent`), AC 2 (two users at once), AC 3 (404 for another user, 401 anonymous, 026 admin endpoints 403), AC 4 (with `?token=abc123`, custom headers and a body: none appear; no plugin names for a developer), AC 6 (replaced id is 404), AC 9 (Kong down: `unreachable`, no row)
- [x] [qa] Kong sampling check: with `KONG_TRACING_SAMPLING_RATE=0.01`, 5 traced Try it calls all get a trace; record the result in the Test report
- [x] [qa] Playwright e2e on the quickstart: developer Try it shows the panel within 30 s (AC 1); an admin sees plugin names and the 026 page shows the same call (AC 5); tracing off shows the message without a spinner, with a settings link for the admin (AC 7); no spans gives "waiting" then "no trace arrived" (AC 8)
- [x] [backend] Fix: Try it trace never becomes ready
- [x] [frontend] Fix: Try it trace panel never mounts after a traced Send
- [ ] [backend] Fix: a Try it transport failure (503 `gateway-unavailable`) answers `X-Portal-Trace-State: unreachable` for every signed-in caller, not only a traced one; delete the row only when one was written (`apps/server/src/proxy.ts:259-271`); add a unit or integration test for tracing off + Kong down
## UX  _(ui-designer)_
Design: [docs/design/027-trace-inside-try-it.md](../design/027-trace-inside-try-it.md).
- A **Trace** card (`TryItTracePanel`) sits directly under Scalar's Try it response and reuses
  spec 026's summary, slowest line and `TraceWaterfall` read-only; the 026 API link is dropped.
- States: off and unreachable and signed-out show at once with no spinner; waiting (static clock,
  elapsed seconds, polls every 2 s); partial; ready; no trace arrived at 30 s with **Check again**;
  replaced (404); error. "Your call only" hint explains that traces are private and one is kept.
- Admins see plugin names, raw span names, and links to `/admin/tracing` (off, missing, footer);
  only the admin "missing" copy names `tracing_instrumentations`. Developer copy names no Kong setting.
- Accessibility: a labelled section after the response, one polite live region with a single
  "Trace ready…" sentence, focus never moves on its own, the 026 table rules. At 375px (or a narrow
  response column, by container query) the summary wraps, the trace ID is middle-truncated and
  the waterfall uses 026's two-line rows. No new tokens.

## Build notes  _(backend-developer, frontend-developer)_

- Backend: added the `try_it_traces` migration, W3C propagation and startup tracing apply, selection-aware Try it trace issuance/cleanup, ingest merging, and the owner-only trace read with developer redaction. QA should exercise both 503 (`unreachable`, row removed) and 504 (`traced`, row retained) proxy failures and confirm late spans can move a `missing` trace to `ready`.
- Backend fix: a Try it trace becomes `ready` when the `kong` request span is stored, including when its parent is the portal span id. Child spans alone stay `waiting`. Kong 3.9 still exports a different trace id when key-auth exits before the OpenTelemetry access phase, because the plugin entity has no priority field; a call with no key can stay `missing`. Retest AC 1–5 with a valid key at sampling rate 1.

- Frontend: Scalar Try it responses now drive a role-aware Trace panel with waiting, partial,
  ready, missing, off, unreachable, signed-out, replaced and retry states. It reuses the spec 026
  waterfall, polls `getTryItTrace` every two seconds, pauses while hidden, and includes the specified
  admin/developer copy, links, live announcements and narrow-container layout.
- Scalar's installed React wrapper does not expose its `response.section` plugin slot. The frontend
  therefore keeps the `onResponseReceived`-shaped plugin behind a tested `configuration.fetch`
  bridge and mounts the React panel into Scalar's live `.response-section-content` with a DOM-observed
  portal; if Scalar changes that internal node, a visible below-reference fallback remains for UI
  designer and review verification.
- Frontend fix: Scalar's Try it client calls the page `fetch`, not `configuration.fetch` (that option
  only loads the OpenAPI document), so a traced Send never mounted the panel. The reference now reads
  `X-Portal-Trace-State` and `X-Portal-Trace-Id` from that page fetch and mounts the panel under the
  response, including a Try it client rendered outside the reference root. QA should retest AC 1, 5, 7,
  and 8: after Send, `.try-it-trace` appears in the client.
- Frontend retest: the rebuilt portal at http://localhost:3009 mounts the panel inside Scalar's API
  Client dialog, in the Response region after the response body. The off and missing titles are also
  in the live region, so the journey asserts the visible `strong`. That 027 journey passed.

## Test report  _(qa-tester)_
Commit tested: `504ab45` · Portal: http://localhost:3009 (API http://127.0.0.1:4009, Kong http://localhost:18009). The stack is still up after `node scripts/worktree-compose.mjs up -d --build --wait`. Lint 8/8, typecheck 14/14, and `pnpm test` passed (portal 438, server 384, adapter-kong 77, db 11, sdk 16, theme 13). `pnpm test:e2e` was 108 passed, 2 skipped, 17 failed. Both spec 027 journeys passed. The 17 failures are outside this spec and are not a 027 bug. Four are `setup-gateways.test.ts` (`AC 1–7`, JSO-398, JSO-399, JSO-406): the default compose project cannot bind Mailpit on `127.0.0.1:8025` because this worktree holds it. The other 13 are `backlog-regressions.test.ts` JSO-223/JSO-228, `create-app-products.test.ts` 023, `account-security.test.ts` 007 M2 at 1280px and 390px, `access-requests.test.ts` 010, `journeys.ts` JSO-176/JSO-177/JSO-184 and JSO-219, `backlog-live.test.ts` JSO-189/JSO-190/JSO-191, `unified-journey.test.ts` 019 AC1, and `versions.test.ts` 012 AC1-4/6/9 plus the three mounted-ruleset cases.

| Criterion | Test file | Result |
| --- | --- | --- |
| 1 | `apps/server/src/try-it-trace.integration.test.ts`; `apps/portal/e2e/tracing.test.ts` | Pass. A keyed call at sampling rate 1 becomes `ready` with method, path `/sample/get`, status 200, and the trace id from `traceparent`. After Send, `.try-it-trace` shows that trace id, GET, the path, 200, total milliseconds, and the slowest span. |
| 2 | same integration file, AC1-5 | Pass. Two callers in the same second get different trace ids and only their own spans. |
| 3 | same file, AC3/6 | Pass. Another user gets 404, an anonymous caller gets 401 problem+json, a developer gets 403 on the spec 026 admin routes, and a malformed id is rejected. |
| 4 | same integration file; e2e in `tracing.test.ts`; `apps/portal/components/try-it-trace-panel.test.tsx` | Pass. `abc123`, the custom header, and `?` are absent from the owner JSON and the admin latest row. The developer panel does not show `key-auth`. |
| 5 | same integration file; e2e in `tracing.test.ts` | Pass. The admin panel and the spec 026 page show `key-auth` and this call's trace id. A developer view has `plugin: null` and name equal to the label. |
| 6 | same file, AC3/6; panel unit test | Pass. A replaced id is 404, one row remains, a parallel pair keeps one row, and an expired session is 401. The panel says the trace was replaced. |
| 7 | integration AC3/6; `apps/server/src/app.test.ts`; panel unit test; e2e | Pass. Tracing off returns `off` with no trace id and no spinner. The admin message links to tracing settings. A 429 is `off`. |
| 8 | `apps/server/src/tracing.test.ts`; panel unit test; e2e | Pass. A late span moves `missing` to `ready`. The browser shows waiting, then "No trace arrived for this call". Developer copy names no Kong setting. Admin copy names `tracing_instrumentations` and links to the tracing page. |
| 9 | same integration file, AC9; panel unit test | Pass. A hung upstream is 504 `traced` and keeps the row. A closed port is 503 `unreachable`, deletes the row, and the panel says the call did not reach the gateway without a waterfall. |
| Sampling | same integration file | Open minor. `SAMPLING_SPANS 0/5` within 4 seconds at `KONG_TRACING_SAMPLING_RATE=0.01`. The quickstart default is 1, where spans arrive. No Fix task. |

Long notes go in `docs/specs/log/027.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
- [x] Try it trace never becomes ready (major)
- [x] At `KONG_TRACING_SAMPLING_RATE=0.01`, 0 of 5 keyed Try it calls stored a span within 4 seconds. Kong's ratio sampler ignores the sampled flag. The quickstart default is 1, where spans do arrive. (minor)
- [x] Try it trace panel never mounts after a traced Send (major)
- [ ] When tracing is off and Kong is down, a developer Try it response is 503 "The API gateway didn't respond" while the panel says "Your call worked as usual." It does not say the call did not reach the gateway. With tracing on, the same outage says that at once. (minor)

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |
| 1. Own Try it trace under the response | Pass | "Trace ready: POST /sample/post, 200, 25.772544 milliseconds." Path `/sample/post`, trace id matched the traceparent. Plugin rows say plugin. |
| 2. Two people, each sees only their call | Pass | Y's panel: "Trace ready: GET /sample/get, 200, 41.73952 milliseconds." It did not show X's trace id. The two Sends were one after another. |
| 3. Another person, or signed out, cannot read a trace | Pass | Y got 404 "not found" for X's id. Signed out got 401 "Sign in to continue." Admin tracing returned 403. |
| 4. Query, headers, and body stay out of the trace | Pass | The panel and the owner's trace had no `abc123`, no custom header, no body text, and no plugin name. |
| 5. Admin sees plugin names and the latest admin trace | Pass | Panel showed "Plugin key-auth". Tracing page "Latest traced call" showed the same id `4b9ad3bc4f33c7f16b3570d1834d1214`. |
| 6. A second call replaces the first | Pass | New panel "Trace ready: GET /sample/get". The first id then returned 404 "not found". |
| 7. Tracing off is immediate | Pass | "Tracing is off for this API" at once, no waiting spinner. Admin link "Open tracing settings". Developer: "Your call worked as usual." |
| 8. No spans: wait, then no trace arrived | Pass | Waiting "1 s", then at about 32 s "No trace arrived for this call" and "Check again". Admin copy names `tracing_instrumentations` and links to `/admin/tracing`. |
| 9. Kong down | Pass | Status 503 "The API gateway didn't respond." Panel: "The call didn't reach the gateway." No waterfall. |
| Mobile main journey | Pass | 390×844. Trace id `f3ab0a35…ce228b5`, "10.3 ms total", waterfall on screen. |
| Keyboard main journey | Pass | Tab reached "Send get request", Enter showed a new "Trace ready" id `2252994f…d198ce3`. |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/027.md`. The full report is `docs/uat/027/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/027.md`.

Reviewed `git diff main...HEAD` at `6f57b64`. The code is unchanged since the tested commit `504ab45`, whose full suite passed for this spec, so the suite was not re-run. Contract, table, migration, adapter `extract: ['w3c']`, boot-time apply, ingest merge and the owner-only GET with role redaction match the design. ACs 1–8 are implemented and tested.

- **blocking** — `apps/server/src/proxy.ts:259-271`: on a transport failure the proxy sets `unreachable` only when the call was `traced`. With tracing off (or no selection) the 503 keeps `off`, and the panel tells the developer "Your call worked as usual" about a call that failed. The design says every 503 `gateway-unavailable` answers `unreachable`, and AC 9 has no tracing condition. Fix: for any signed-in viewer set `unreachable` in the catch; delete the `try_it_traces` row only when the state was `traced`. This is the open minor bug in Bugs; the fix closes it.
- **suggestion** — `apps/server/src/proxy.ts:143-145`: the trace state is set before `canSeeApi` and before the 413 body check (`:183`). A 404 for an API the caller can't see, or a 413, then says `traced` with no `X-Portal-Trace-Id`, which hints that a hidden API is in a tracing selection and leaves the panel with no state to show. Set `traced` only after the row is written; report `off` before that.
- **suggestion** — `apps/server/src/tracing.ts:127-132`: `tryItTraceState` checks for any enabled Kong gateway, not the target API's gateway. Fine for one gateway; revisit when multi-gateway lands.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR

### Deferred Linear
- **Bug** — Bug: Try it trace panel never mounts after a traced Send (major)
  - parent: none
  - priority: high
  - create when the Linear limit allows
  - body: Sign in as an admin, set the tracing sampling rate to 1, and select the sample API. Sign up a developer, create a key for sample, open /apis/sample, paste that key into Try it, and Send. The Try it response is 200 with X-Portal-Trace-State traced and a 32-hex X-Portal-Trace-Id. GET /api/v1/try-it/traces/{id} for that caller returns state ready with method GET, path /sample/get, and status 200. The page never mounts .try-it-trace. .try-it-trace-fallback stays empty, and the span table Spans of your Try it call is still absent after 30 seconds. Playwright apps/portal/e2e/tracing.test.ts:672 failed on that locator in the full e2e (35.9s). An earlier isolated run of the same Send logged the traced header and an empty fallback before the same timeout. The API companion in the same file passed in that e2e run, and the Kong integration AC 1-5 test passed, so this is the panel, not the ready-state bug. Scalar Send reaches /api/v1/try-it, but the React panel does not appear.
