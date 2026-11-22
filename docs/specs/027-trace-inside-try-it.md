---
id: 027
title: Trace inside Try it
status: designed   # draft → ready → designed → building → testing → uat → review → approved → done
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
   that matches a Try it row is stored even when no API can be resolved for it. The API's
   `trace_latest` is still updated as before (AC 5, open question 5).
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
  - `ready` means the root span arrived. `missing` means no root span 30 s after `issuedAt`
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
- [ ] [backend] `packages/db`: add the `try_it_traces` table (columns, checks, unique `trace_id`, FKs with cascade) and generate the migration with `pnpm --filter @portal/db exec drizzle-kit generate`
- [ ] [backend] `packages/adapter-kong`: `tracingConfig` propagation `extract: ['w3c']`; update adapter tests; the server queues one tracing apply at start when tracing settings exist
- [ ] [backend] `apps/server/src/tracing.ts`: export a `tryItTraceState(db, viewer, apiId)` coverage helper (api, developer, or member-team selection; configured; adapter supports tracing) returning `traced | off | signed-out`
- [ ] [backend] `apps/server/src/proxy.ts`: generate the trace id and span id; upsert the row before the call; add `traceparent`; drop any browser `traceparent` or `tracestate`; set `X-Portal-Trace-State` and `X-Portal-Trace-Id` on every response, problems included; on a 503 transport failure delete the row and answer `unreachable`; on a 504 keep `traced`
- [ ] [backend] Ingest: inside the existing transaction, merge each trace-id group into the matching `try_it_traces` row (span-id merge, 1000 cap, `root_span_id`, `request`, `started_at`, `received_at`); keep the `trace_latest` behaviour; store a matching group even when no API resolves
- [ ] [backend] `GET /api/v1/try-it/traces/:traceId`: session required (401); owner and current id, otherwise one 404; `state` waiting/ready/missing (30 s); `traceView` redaction for non-admins (`plugin: null`, `name = label`); regenerate `packages/sdk`
- [ ] [backend] Unit tests: coverage helper, traceparent format and the dropping of browser headers, redaction, ingest merge into the Try it row and `trace_latest`, 404 for another user, replaced or unknown id
- [ ] [frontend] `components/reference.tsx`: register a Scalar API-client plugin with `onResponseReceived` that reads `X-Portal-Trace-State` and `X-Portal-Trace-Id` and drives a React trace panel under the response
- [ ] [frontend] Trace panel: reuse spec 026's waterfall read-only; show method, path, status, total ms, labels and the slowest span; poll `getTryItTrace` every 2 s until `ready` or `missing`; states off (immediate), waiting, missing (after 30 s), unreachable (immediate), signed-out; admin copy names `tracing_instrumentations` and links to the tracing settings and Test; developer copy names no Kong setting (per the UX doc)
- [ ] [qa] Integration (Testcontainers Kong + Postgres): AC 1 (the trace id equals the sent `traceparent`), AC 2 (two users at once), AC 3 (404 for another user, 401 anonymous, 026 admin endpoints 403), AC 4 (with `?token=abc123`, custom headers and a body: none appear; no plugin names for a developer), AC 6 (replaced id is 404), AC 9 (Kong down: `unreachable`, no row)
- [ ] [qa] Kong sampling check: with `KONG_TRACING_SAMPLING_RATE=0.01`, 5 traced Try it calls all get a trace; record the result in the Test report
- [ ] [qa] Playwright e2e on the quickstart: developer Try it shows the panel within 30 s (AC 1); an admin sees plugin names and the 026 page shows the same call (AC 5); tracing off shows the message without a spinner, with a settings link for the admin (AC 7); no spans gives "waiting" then "no trace arrived" (AC 8)

## UX  _(ui-designer)_
Summary + link to `docs/design/027-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/027.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/027.md`. The full report is `docs/uat/027/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/027.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
