---
id: 026
title: Trace waterfall for one API call on Kong
status: review  # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-18
linear:            # the one feature issue, e.g. JSO-117 — filled by `node scripts/factory.mjs linear-init 026`
---

# 026 — Trace waterfall for one API call on Kong

## Summary
A portal admin turns Kong tracing on for chosen APIs, developer accounts or teams, checks the
Kong node's settings with a Test button, and then sees a waterfall of the spans for the latest
traced call (request, router, each plugin phase, the upstream try). The next traced call
replaces it; the portal keeps no trace history.

## Problem
A portal admin whose API is slow has nothing in the portal to diagnose it with. Spec 011 shows
monthly call counts and status classes only, and
[ADR 0011](../adr/0011-usage-collected-by-kong-http-log.md) stores daily counts, not requests,
so a slow call is one tick on a usage bar. To find out whether a plugin or the upstream used
the time, the admin has to set up a collector and a tracing backend themselves. Commercial
portals now ship this view: Zuplo's roadmap card "Diagnose slow endpoints without leaving
Zuplo" is marked available ([Zuplo roadmap](https://zuplo.com/roadmap)), and its Traces tab
lists one row per request that expands into that request's spans
([changelog, 17 June 2026](https://zuplo.com/changelog/2026/06/17/otel-tracing-views);
[Zuplo OpenTelemetry docs](https://zuplo.com/docs/articles/opentelemetry)).

Kong already creates the spans. The [OpenTelemetry plugin](https://developer.konghq.com/plugins/opentelemetry/)
(Gateway 3.0+, no enterprise flag) exports traces as OTLP/HTTP Protobuf. It can be scoped to one
service ([traces example](https://developer.konghq.com/plugins/opentelemetry/examples/traces/)).
Spans appear only when the node's `tracing_instrumentations` is set, and that is a `kong.conf`
setting, not something the Admin API can change ([Kong tracing](https://developer.konghq.com/gateway/tracing/)).
The quickstart runs `kong:3.9`, so traces are available there.

Solved when, on the quickstart, an admin turns tracing on for the sample API, the Test passes,
one try-it call is made, and the admin names the slowest span in the portal, with no extra
container, no stored secrets or client data, and nothing kept beyond that latest call.
Evidence: [research brief](../research/show-opentelemetry-traces-for-one-api-re.md).

## Users
- **Portal admin** (primary): chooses what is traced, checks the Kong settings, and reads the
  latest trace to diagnose a slow or failing call.
- **Platform engineer**: runs the quickstart or an existing Kong, and sets the node settings the
  turn-on dialog explains.

## User stories
- As a portal admin, I want to turn tracing on for one API, one developer account or one team,
  so that only the calls I care about are traced.
- As a portal admin, I want the turn-on dialog to tell me which Kong node settings tracing needs,
  let me enter the values my Kong uses, and test them, so that I know tracing works before I
  make a call.
- As a portal admin, I want to see the latest traced call's spans on one timeline, labelled
  request, plugin or upstream, with the slowest marked, so that I know whether a plugin or the
  upstream used the time.
- As a platform engineer, I want the quickstart to trace calls with no extra container, so that
  I can try the feature without setting up a collector.
- As a portal admin, I want the portal to keep only the latest trace, without query strings,
  client IPs, upstream addresses, headers or bodies, so that tracing never becomes a store of
  customer data.

## Acceptance criteria
1. **Given** a connected Kong and an admin who turns tracing on for API A, developer account B
   and team C **When** the reconcile runs twice **Then** Kong holds portal-tagged
   `opentelemetry` plugins scoped to A's service and to each Kong consumer of B's and of C's
   apps, each sending OTLP/HTTP traces to the configured trace endpoint with a bearer token; the
   second run creates or changes nothing; **and when** the admin turns one selection off and the
   reconcile runs, only that selection's plugins are gone.
2. **Given** tracing is on for API A only and A has a shown trace **When** a developer who is in
   no selection calls API D **Then** after 30 seconds the trace page still shows A's call and no
   span from the D call was stored.
3. **Given** an admin who turns tracing on **When** the dialog opens **Then** it names
   `tracing_instrumentations` and `tracing_sampling_rate` (and their `KONG_TRACING_*` environment
   variables), says the Kong node must be restarted after changing them, and offers editable
   fields for the trace endpoint (the portal address as Kong reaches it), the instrumentation
   list and the sampling rate, prefilled with the quickstart values from criterion 10; the trace
   endpoint the admin enters is the one written into the plugins in criterion 1.
4. **Given** the quickstart Kong and the prefilled values **When** the admin clicks Test **Then**
   within 15 seconds the dialog shows a pass.
5. **Given** a Kong whose node has `tracing_instrumentations` off, **or** a trace endpoint Kong
   cannot reach, **or** a Kong Admin API that does not answer **When** the admin clicks Test
   **Then** within 15 seconds the dialog shows a failure whose message names that cause (tracing
   off on the node, endpoint unreachable from Kong, gateway unreachable), one distinct message
   per cause, and never a pass.
6. **Given** tracing is on for the sample API on the quickstart **When** a developer sends one
   try-it call **Then** within 30 seconds the admin trace page shows that call's method, path
   without the query string, status code and total duration in milliseconds, and a waterfall of
   each span's name, start offset and duration on one time axis: the root span is labelled
   request, spans named `rewrite|access|header_filter phase: <plugin>` are labelled plugin with
   the plugin name, `balancer try #N` is labelled upstream, and the longest span other than the
   root is marked slowest; **and when** a second traced call is made, within 30 seconds the page
   shows only the second call and the first can no longer be fetched through the API.
7. **Given** a traced call sent with a query string (`?token=abc123`), custom headers and a body,
   and a Kong span that carries a non-allowlisted attribute (for example a username) **When** its
   trace is kept and then fetched through the API **Then** what the server keeps and returns holds
   only trace id, span id, parent span id, name, start, duration, status and the portal's API id;
   `abc123`, the client IP, the upstream address, headers, bodies and the extra attribute appear
   in neither.
8. **Given** a trace batch posted to the trace endpoint with a missing or wrong bearer token, or
   one whose spans come from a service or consumer outside the admin's selection **When** the
   server receives it **Then** it answers with RFC 9457 problem+json (401 for the token, 4xx for
   the selection) and the shown trace does not change; **and when** Kong resends a batch it
   already delivered, the shown trace holds each span once.
9. **Given** a signed-in developer who is not a portal admin, or an anonymous visitor **When**
   they request the latest trace, the tracing settings, the selection endpoints, the Test, or the
   admin trace page **Then** the API answers 403 (or 401) problem+json and the page is not shown.
10. **Given** the quickstart compose file **When** it starts Kong **Then** the node sets
    `KONG_TRACING_INSTRUMENTATIONS` to `request,router,balancer,plugin_rewrite,plugin_access,plugin_header_filter`
    (no `db_query`, `dns_query` or `http_client`) and `KONG_TRACING_SAMPLING_RATE=1`, and the
    quickstart still gives a working portal in under five minutes.

## Out of scope
- **A log viewer, a live log tail, and jumping from a log line to its trace.** Traces only (Decision 1).
  Kong access logs are a second export and would undo ADR 0011's redaction.
- **Trace history, a recent-calls list, search, filters, a live tail, and retention settings.**
  The portal shows the latest traced call only (Decision 3).
- **A developer-facing waterfall, including inside try-it.** Portal admins only (Decision 2).
- **Tracing per route or per app.** The selection is per API, per developer account or per team.
- **Exporting traces to Jaeger, Honeycomb or any other backend.** An operator can point Kong's
  plugin at their own collector themselves.
- **Latency charts, per-route metrics and response size.** Analytics, a separate item (spec 011
  left them out on purpose).
- **Inventing spans Kong does not emit** (Zuplo's handler span). Labels come from Kong's own span names.
- **AWS API Gateway, APISIX, Envoy and other adapters.** The span names are Kong's; AWS tracing
  was not researched (spec 017).
- **Changing spec 011's http-log plugin** to keep raw requests.
- **Changing `tracing_instrumentations` or `tracing_sampling_rate` on the Kong node.** The Admin API
  cannot; the dialog explains them and the operator restarts the node.
- **Staff roles limiting which admins see traces.** Every portal admin sees them until spec 015.
- **Traces in the static Vercel demo** (spec 002). It has no gateway.

## Decisions
Elango, 2026-11-18.
1. **Traces only.** A log viewer waits for a later spec.
2. **Portal admins only see traces.** The admin turns tracing on per API, per developer account
   or per team.
3. **No retention policy and no trace history.** The UI shows the trace for the call just made and
   the next traced call replaces it. The portal keeps only what it needs to show that latest
   result; a short wait for Kong's spans, which arrive after the response, is fine.
4. **Turning tracing on opens a dialog** that explains the Kong node settings and the restart,
   offers fields for the admin's own values (trace endpoint, instrumentations, sampling rate),
   and has a Test button that shows pass or a clear failure reason.
5. **The admin's selection decides what is traced.** Calls outside it produce no trace. This
   replaces the service-versus-consumer question.

## Open questions
- [ ] Is "the latest trace" one for the whole portal, or one per traced API or selection? This
  spec assumes one for the whole portal. — Elango
- [ ] Does "developer account" mean the apps of every team the developer belongs to, or only the
  apps they created? Kong consumers are one per app and apps belong to teams (spec 008). — Elango
- [ ] May the admin save tracing on after a failing Test, or must the Test pass first? — Elango
- [ ] Keep the latest trace in server memory or in a single overwritten database row? Memory is
  lost on restart and not shared across Helm server replicas (spec 016). — tech-lead
- [ ] How does the Test verify the node: read its configuration from the Admin API root, send a
  probe call and wait for spans, or both? Criterion 5 needs each cause told apart. — tech-lead
- [ ] When a call matches both an API and a consumer selection, which plugin instance runs, and is
  only one trace exported? — tech-lead
- [ ] Selection, dialog and Test, ingest and the waterfall may not fit one pull request. If not,
  the proposed cut is developer-account and team selection into a follow-up spec. — tech-lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Lasting choices are in [ADR 0017](../adr/0017-traces-pushed-by-kong-opentelemetry-latest-in-one-row.md).
Kong facts below were checked in the quickstart's `kong:3.9` image.

**Kong 3.9's span names differ from criterion 6's wording.** The root is `kong`, plugin spans are
`kong.<phase>.plugin.<name>` (for example `kong.access.plugin.key-auth`), each upstream try is
`kong.balancer` (attribute `try_count`) and the router is `kong.router`. The
`rewrite phase: <plugin>` and `balancer try #N` names belong to older Kong releases. The labels
are the ones criterion 6 asks for. `classifySpan` maps both naming schemes, and tests use the
3.9 names. The product manager should correct the criterion's wording.

### Decisions on the open questions
- **Tech lead: where the latest trace lives.** One overwritten Postgres row (`trace_latest`).
  It survives restarts, and every Helm replica sees it. Memory is ruled out by spec 016's replicas.
- **Tech lead: how the Test tells causes apart.** Both checks run in order. `GET /` answers or
  `gateway-unreachable`. Its `configuration.tracing_instrumentations` includes `request` (or `all`)
  or `tracing-off`. A probe call through the internal proxy works or `proxy-unreachable`. Its
  spans arrive within 10 s or `endpoint-unreachable`. Kong refusing the probe objects is
  `gateway-rejected`. The budget is 5 s plus 1 s plus 10 s, under the 15 s limit.
- **Tech lead: a call matching both an API and a consumer selection.** Kong runs one instance of
  a plugin per request, the most specific scope, and a consumer beats a service. The consumer's
  instance exports, once. Its resource attributes list its selections. The API comes from matching
  the root's `http.route` (ADR 0017 §6).
- **Tech lead: one pull request?** Yes. Developer and team selection add one consumer-scoped plugin
  kind and one query, about a day. The ingest, the Test and the waterfall are the same either way.
  If the build overruns, the agreed cut is still developer and team selection.
- **Elango (open), assumed defaults.** Each is isolated so a change is small:
  1. *One latest trace per portal.* `trace_latest.scope_key` is always `'portal'`, set in one
     function, `traceScopeKey(batch)`. Per API means returning the API id there and adding
     `?apiId=` to `GET /latest`. There is no migration.
  2. *A developer account covers the active apps that developer created* (`apps.created_by`), in
     any team. `resolveSelectionApps(selection)` is the only place this is decided. Membership
     means swapping its query for one on `team_members`.
  3. *Saving after a failing Test is allowed.* The dialog shows the failure and still saves, so
     an operator can save, then restart Kong. The constant `TRACING_REQUIRE_PASSING_TEST = false`
     switches `PUT /admin/tracing` to 409 `/problems/tracing-test-required` unless the last Test
     passed for the same values. The contract already lists that 409.

### Components
- `packages/adapter-sdk`: adds `Capabilities.tracing`, the five tracing methods below, and their
  types (`TracingPlan`, `TracingReport`, `TraceBatch`, `TraceSpanRecord`, `SpanClass`). The
  conformance suite gains a tracing case.
- `packages/adapter-kong`: the `opentelemetry` plugin writes, the node inspection, the probe, and
  OTLP Protobuf decoding with `protobufjs` (new dependency, because Kong sends only Protobuf). The
  OTLP trace subset ships as a checked-in JSON descriptor.
- `packages/db`: three tables and one migration.
- `apps/server`: a `tracing.ts` module with the admin routes, ingest, the Test and the apply job.
  It reuses `crypto.ts` for the token, the gateway URL validation for `traceEndpoint`,
  `auth-limits` for the Test rate limit and pg-boss for `tracing-apply`. `config.ts` gains
  `PORTAL_TRACE_INGEST_URL`, the prefilled endpoint.
- `apps/portal`: the admin "Tracing" page. It has the selections list and add control, the
  turn-on dialog with the fields and Test, and the latest-trace waterfall. The layout and copy
  come from the UX section.
- `packages/sdk`: regenerated.
- `deploy/docker-compose.yml`: Kong gets `KONG_TRACING_INSTRUMENTATIONS` and
  `KONG_TRACING_SAMPLING_RATE` (criterion 10). The server gets `PORTAL_TRACE_INGEST_URL`, default
  `http://server:4000/api/v1/internal/traces/kong`. The Helm chart gets the same server variable.

### API contract
`apps/server/openapi.yaml`, tag `tracing`. Every `/v1/admin/tracing*` operation needs an admin
session. A signed-out caller gets 401 and a non-admin gets 403 problem+json (criterion 9).
| Method · path | Purpose | Notable responses |
| --- | --- | --- |
| `GET /v1/admin/tracing` | `Tracing`: supported, configured, settings (defaults before the first save), selections, lastTest, apply | 200 |
| `PUT /v1/admin/tracing` | Save `TracingSettingsInput` (`traceEndpoint`, `instrumentations`, `samplingRate`). A changed endpoint queues an apply | 200; 400 field; 409 `tracing-test-required` (policy off) |
| `POST /v1/admin/tracing/test` | The Test, without saving settings | 200 `TracingTestResult` (node values, warnings); 422 `tracing-check-failed` with `cause` and `node`; 409 `tracing-unsupported`; 429 |
| `POST /v1/admin/tracing/selections` | `{kind: api\|developer\|team, targetId}`, idempotent, queues an apply | 201 new, 200 existing; 404 unknown target; 409 `tracing-not-configured` |
| `DELETE /v1/admin/tracing/selections/{id}` | Turn one off, queue an apply | 204; 404 |
| `GET /v1/admin/tracing/developers?q=` | Find developers for the add control. Teams use `GET /v1/admin/teams`, APIs use `GET /v1/admin/apis` | 200 |
| `GET /v1/admin/tracing/latest` | `{trace: Trace \| null}`. The UI polls every 3 s | 200 |
| `POST /v1/internal/traces/kong` | Kong's OTLP/HTTP Protobuf, `traceIngestToken` bearer, up to 1 MB | 200 empty OTLP response; 400; 401; 413; 415; 422 `trace-not-selected` |

`Trace` holds `traceId`, `startedAt`, `receivedAt`, `durationMs` (root), `api` (id, slug and name,
or null), `request` (`method`, `path` without the query, `statusCode`) and `spans`. Each span has
`spanId`, `parentSpanId`, `name`, `label` (request, router, plugin, upstream or other), `plugin`,
`startOffsetMs`, `durationMs`, `status` and `slowest`. `slowest` is true on exactly one span: the
longest non-root span, with ties going to the earliest. Labels and `slowest` are computed on read.
The stored data stays as criterion 7 lists it.

### Data model (`packages/db`, one migration from `drizzle-kit generate`)
- `tracing_settings`: a singleton (`id smallint` = 1, with a check). It holds `trace_endpoint`,
  `instrumentations text[]`, `sampling_rate real`, `token_ciphertext` (generated once, encrypted
  like the usage token), `configured_at`, `last_test_passed`, `last_test_cause`, `last_test_at`,
  `probe_nonce`, `probe_received_at`, `apply_status`, `apply_message` and `applied_at`.
- `tracing_selections`: `id uuid` (v7), `kind text` check (`api`, `developer`, `team`), and three
  nullable FKs `api_id`, `user_id` and `team_id` that cascade on delete. A check requires exactly
  the one matching `kind`, and each FK is unique. It also has `created_by` (set null) and `created_at`.
- `trace_latest`: `scope_key text` PK (always `'portal'`, see default 1) and `trace_id`
  (32 hex). It has `api_id` (FK `apis`, set null), `started_at`, `received_at`, `root_span_id`, and
  `request jsonb` holding `{method, path, statusCode}` or null. `spans jsonb` holds up to 1000 of
  `{spanId, parentSpanId, name, startNs, durationNs, status}`, with the nanosecond values as strings.

### Adapter calls (Kong)
- **`applyTracing({endpoint, token, targets})`.** Each target is
  `{ scope: {service} | {app}, selections: string[], apiId? }`. The server builds targets from the
  selections. An API maps to its gateway service. Developer and team selections map through
  `resolveSelectionApps` to active apps with a consumer. Targets are deduplicated by scope and
  their selection keys merged. The adapter lists plugins tagged `portal-tracing` and this
  instance's tag. It `PUT`s each desired plugin, ID and config as in ADR 0017 §1, only when the
  config differs, and `DELETE`s portal-tracing plugins that are no longer desired. It never touches
  untagged or operator plugins. Running it twice changes nothing (criterion 1). A Kong 4xx on the
  plugin raises `TracingUnavailableError` and becomes `apply.status: failed` with "Kong refused
  the opentelemetry plugin; check KONG_PLUGINS". An unavailable gateway leaves `pending`, and the
  pg-boss job retries with backoff. Deleting an app's consumer cascades its plugin.
- **`inspectTracing()`.** `GET /` returns `{instrumentations, samplingRate}` from `configuration`.
  An unreachable gateway or a 5xx raises `GatewayUnavailableError`.
- **`ensureTraceProbe({endpoint, token, nonce})`.** Idempotent `PUT`s of the internal service,
  the route `/__portal/trace-probe/<instanceId>`, the `request-termination` 204 and a route-scoped
  `opentelemetry` plugin with `sampling_rate: 1` and `portal.probe=<nonce>`. The ADR 0011
  heartbeat pattern is reused, tagged `portal-internal`. It returns `{probePath}`. The server
  calls it through `KONG_PROXY_INTERNAL_URL`.
- **`parseTraceBatch(bytes)`.** It returns `{resource: {instance, selections[], apiId?, probe?},
  spans[]}`. Root spans also carry `request` and `routePath`. Every other attribute is discarded
  here. It throws `InvalidTraceBatchError` on undecodable input, which becomes a 400.
- **`classifySpan(name)`.** `kong` is request, `kong.router` or `router` is router,
  `kong.<rewrite|access|header_filter>.plugin.<p>` or `<phase> phase: <p>` is plugin `p`, and
  `kong.balancer` or `balancer try #N` is upstream. Anything else is other.
- **Triggers for `tracing-apply`** (a singleton pg-boss job): a selection is added or removed, the
  trace endpoint changes, an app is created, revoked or deleted, and the periodic reconcile.

### Ingest flow (`POST /v1/internal/traces/kong`)
1. Check `content-type` (415), size (413) and the bearer token in constant time (401).
2. `parseTraceBatch`, or 400.
3. If `probe` matches the stored `probe_nonce`, set `probe_received_at` and return 200. The shown
   trace is not touched.
4. If `instance` is not this portal, or no listed selection exists now, return 422
   `trace-not-selected` (criterion 8).
5. In one transaction: lock `trace_latest`, group spans by trace id, then merge, replace or drop
   per ADR 0017 §3. The API is `resource.apiId`, else the root's `routePath` matched against the
   cached published-API service routes. Return 200.
Nothing from the body is logged. Log lines carry the trace id and span count only.

### Risks and how to test them
- *Span names or attributes differ by Kong version.* Classifier unit tests cover both schemes.
  An integration test on Testcontainers `kong:3.9` asserts the real names and labels end to end.
- *Leaking customer data* (criterion 7). An integration test sends a real call with `?token=abc123`,
  a custom header and a body. A hand-built OTLP batch adds a span with an extra attribute
  (`user.name`), because Kong itself won't emit one. The test then greps the DB row
  and `GET /latest` for `abc123`, the client IP, the upstream address and the attribute name.
  A unit test on `parseTraceBatch` asserts the output keys exactly.
- *A trace split across batches, or resent* (criterion 8). Unit tests on the merge feed a trace
  in two halves, in both orders, plus a resend, plus an older trace after a newer one.
- *Calls outside the selection* (criterion 2). A Kong integration test makes a call to an
  unselected API and checks no POST reached the ingest, and that the row is unchanged after 30 s.
  A wiremock-style counter on the ingest is enough.
- *A multi-replica Test.* The probe receipt goes through Postgres, and an integration test runs
  the Test handler and the ingest on two server instances.
- *A client-supplied `traceparent` merging two calls into one trace.* `propagation.extract: []`
  prevents it. A test sends the same `traceparent` on two calls and expects two trace ids.
- *The quickstart.* The QA run of `docker compose up` checks the Kong environment variables and the
  under-5-minutes budget (criterion 10). An extra Kong environment variable doesn't change the
  start time.

### Tasks
- [x] [backend] adapter-sdk: add `Capabilities.tracing`, the tracing types, the five
  `GatewayAdapter` methods, `TracingUnavailableError` and `InvalidTraceBatchError`. Add a
  conformance case covering apply twice, a selection removed, and parse of a captured batch.
- [x] [backend] adapter-kong: implement `applyTracing` (service and consumer scopes, merged
  selection keys, diff and stale removal), `inspectTracing`, `ensureTraceProbe`, `classifySpan`,
  and `parseTraceBatch` with `protobufjs` and an OTLP JSON descriptor. Add unit tests for the
  allowlist and the classifier.
- [x] [backend] db: add the `tracing_settings`, `tracing_selections` and `trace_latest` tables,
  generated with `pnpm --filter @portal/db exec drizzle-kit generate`, plus a migration test.
- [x] [backend] server: add the admin tracing routes per the contract (settings, Test with
  rate limit and probe wait, selections with `resolveSelectionApps`, developers search, latest
  with labels and slowest computed on read). Add `TRACING_REQUIRE_PASSING_TEST` and
  `traceScopeKey`.
- [x] [backend] server: add `POST /v1/internal/traces/kong` (415, 413, 401, 400, probe, 422,
  locked merge or replace, and the route-path API match with a 60 s service cache). Keep
  `/api/v1/internal/*` unforwarded by the portal rewrite.
- [x] [backend] server: add the `tracing-apply` pg-boss job and its triggers (selection, endpoint,
  app create, revoke and delete, periodic reconcile), and report its status in `Tracing.apply`.
- [x] [backend] deploy: add `KONG_TRACING_INSTRUMENTATIONS` and `KONG_TRACING_SAMPLING_RATE=1`
  on Kong, `PORTAL_TRACE_INGEST_URL` on the server and in the Helm values, and document both in
  the README and `.env.example`.
- [x] [backend] regenerate `packages/sdk`.
- [x] [frontend] admin Tracing page: the selections list with add (API, developer and team
  pickers) and remove, and the apply status.
- [x] [frontend] turn-on dialog: name the node settings, their `KONG_TRACING_*` variables and the
  restart. Add editable, prefilled endpoint, instrumentation and sampling fields, Test with a
  pass or a per-cause failure message, and Save (allowed after a failure, with a warning).
- [x] [frontend] latest-trace view: method, path, status and total ms, and the waterfall on one
  time axis with labels, plugin names and the slowest marker. Poll every 3 s, and show an empty
  state and a "not available for this gateway" state. Admins only.
- [x] [qa] integration on Testcontainers Kong 3.9: criteria 1 (apply twice, remove one), 2, 4,
  5 (each of the three causes, plus proxy), 6 (real names, replaced by a second call, first not
  fetchable), 7, 8 (token, unselected, resend) and 9.
- [x] [qa] e2e (Playwright) on the quickstart: turn on the sample API, Test passes, one try-it call,
  and the waterfall shows the slowest span. Check criterion 10's compose values and the 5-minute
  start.
- [x] [backend] Fix: Tracing quickstart defaults omit required plugin phases
- [x] [backend] Fix: Tracing Test failures omit cause keys required by dialog
- [x] [backend] Fix: Production server image crashes on protobufjs named export
- [x] [backend] Fix: Full suite leaves open admin assignment credential active
- [x] [backend] Fix: Trace ingest accepts unsupported media type
- [x] [backend] Fix: Quickstart Kong rejects tracing plugin during Test
- [x] [backend] Fix: Latest trace omits request method path and status
- [x] [frontend] Fix: Tracing API picker lists no APIs, so an API selection cannot be added
## UX  _(ui-designer)_
Design: [docs/design/026-trace-waterfall-kong.md](../design/026-trace-waterfall-kong.md). No new tokens.
- A new admin-only **Tracing** tab (`/admin/tracing`, after Insights) holds three cards: **Kong
  settings** (settings, last Test, apply status), **What's traced** (kind + target picker, rows with
  **Stop tracing**) and **Latest traced call** (summary line, slowest-step line, waterfall, 3 s poll).
- The **Turn on tracing** dialog names both node settings and their `KONG_TRACING_*` variables in a
  copyable block that follows the fields, says to restart Kong, and has the endpoint, an
  instrumentation checkbox group and the sampling rate. **Test** shows a pass with Kong's reported
  values or one message per `cause`.
- Waterfall rows use the server's `label` (from the Kong 3.9 classifier): plugin rows show the plugin
  name, upstream rows "Upstream try", raw span name as secondary text. The slowest span gets a word
  badge, an icon and a warning-coloured bar. It is a real table, with start and duration as text.
- Each of Elango's three open defaults lives in one component (`LatestTraceCard` `apiId`,
  `coversCopy`, `SaveGuardNotice`), so a change needs no redesign (design §7).

## Build notes  _(backend-developer, frontend-developer)_

- Backend: added the tracing adapter contract and Kong OTLP implementation, the tracing tables and generated migration, the admin/test/ingest/latest routes, and the singleton `tracing-apply` worker. Compose and Helm now expose the private trace ingest URL and Kong tracing defaults; the generated SDK includes the tracing contract. QA should exercise the Test probe against Kong 3.9 and the split-batch/selection rejection paths; the default remains one latest portal trace, developer-owned apps, and Save after a failing Test.

- Backend (build loop 2): trace ingest now checks the media type first. A request that is not `application/x-protobuf` gets RFC 9457 415 `unsupported-media-type` before the token and selection checks, matching the existing contract. `@portal/server` passes lint, typecheck and all 364 tests, including QA's AC8 regression. The admin-revocation fix is still open for QA.

- Frontend: added the admin-only Tracing page with Kong settings/Test/Save, API/developer/team
  selections, apply feedback, and the 3-second latest-trace waterfall. The portal package passes
  lint, typecheck, and all 429 Vitest tests; QA should exercise the live Kong Test causes and
  selection apply status against the completed backend.

- Backend (build loop 3): Kong 3.9 rejected the probe because `propagation.default_format` is
  required with `inject: ["preserve"]`; the adapter now sends `default_format: "w3c"` and the
  current `traces_endpoint` field. A Testcontainers Kong 3.9 regression installs the exact probe
  config. The adapter's 76 tests pass, and the rebuilt quickstart Test passed before a selected
  sample try-it call produced a new latest trace with four spans.

- Backend (build loop 4): a captured Kong 3.9 OTLP batch showed the request root uses
  `http.method`, absolute `http.url`, and integer-valued `http.status_code`; the allowlist now also
  accepts the newer semantic-convention equivalents while retaining only the query-free pathname.
  All 77 adapter tests pass, and a live selected call persisted `GET /sample/get` with status 401
  without its query string, client IP, or peer address.

- Frontend (build loop 5): the API picker now reads `GET /v1/apis`. The contract's `GET /v1/admin/apis` has
  only a POST, and the catalog list returns every published API to an admin session, hidden and
  restricted ones included, so no server route was added. Changing the kind clears the target list,
  the selected target and the search, and drops late responses for the previous kind. Escape from the
  settings dialog returns focus to Edit settings. Portal lint, typecheck and 435 tests pass. The
  tech lead should correct the contract table's `GET /v1/admin/apis` to `GET /v1/apis`.

## Test report  _(qa-tester)_
Commit tested: `1a8648a` (HEAD `08c961f`, docs only on top) · Portal: `http://localhost:3001`

| Criterion | Test file | Result |
| --- | --- | --- |
| 1 | `apps/server/src/tracing.test.ts`; `packages/adapter-kong/src/tracing.test.ts`; `apps/portal/e2e/tracing.test.ts` | Pass — idempotent selection/apply and removal are automated; the e2e now adds the sample API from the picker (by id), checks a kind change clears the chosen target, and sees the selection in the table and in `GET /admin/tracing`. |
| 2 | `apps/server/src/tracing.test.ts` | Pass — an unselected batch is rejected and the selected latest trace is unchanged. |
| 3 | `apps/portal/components/admin-tracing.test.tsx`; `apps/portal/e2e/tracing.test.ts` | Pass — the dialog names the Kong settings and variables, shows the quickstart defaults, and Escape returns focus to the settings button. |
| 4 | `apps/portal/e2e/tracing.test.ts` | Pass — the live Test reports `✓ Test passed` within 15 seconds. |
| 5 | `apps/server/src/tracing.test.ts`; `apps/portal/components/admin-tracing.test.tsx` | Pass — tracing-off, endpoint-unreachable and gateway-unreachable causes and messages are distinct. |
| 6 | `apps/server/src/tracing.test.ts`; `apps/portal/components/admin-tracing.test.tsx`; `apps/portal/e2e/tracing.test.ts` | Pass — the selected live call shows `GET /sample/get`, `401`, the waterfall and the Slowest marker, without the query token. |
| 7 | `apps/server/src/tracing.test.ts`; `packages/adapter-kong/src/tracing.test.ts` | Pass — stored/returned fields are allowlisted and secret markers are absent. |
| 8 | `apps/server/src/tracing.test.ts` | Pass — wrong token and unselected batches return problem+json without replacement; a resend deduplicates spans. |
| 9 | `apps/server/src/tracing.test.ts`; `apps/portal/components/admin-tracing.test.tsx`; `apps/portal/e2e/tracing.test.ts` | Pass — anonymous/developer API access is refused and an anonymous browser is redirected. |
| 10 | `apps/portal/e2e/tracing.test.ts`; `deploy/e2e/quickstart.spec.ts` | Pass — the Kong values are present; the rebuilt isolated quickstart became healthy and serves the catalog. |

Full pass: `pnpm lint`, `pnpm typecheck` and `pnpm test` passed (server 364/364, portal 435/435, Kong adapter 77/77; turbo replayed the unchanged server and adapter results). The full `pnpm test:e2e` against this stack's ports ran 117 passed, 2 skipped and 1 failed. The failure was the new picker step in AC4/6, which used `name` where the catalog returns `title`. After that test-only fix, the 026 Playwright tests passed 4/4 against `http://localhost:3001`. The stack is left up.

Long notes go in `docs/specs/log/026.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [x] Tracing quickstart defaults omit required plugin phases (major)
- [x] Tracing Test failures omit cause keys required by dialog (major)
- [x] Production server image crashes on protobufjs named export (blocker)
- [x] Full suite leaves open admin assignment credential active (major) — Not reproduced alone or in the server suite (6/6 admin-revocation tests passed in both runs); QA should confirm on its full pass.
- [x] Trace ingest accepts unsupported media type (major)
- [x] Quickstart Kong rejects tracing plugin during Test (major)
- [x] Latest trace omits request method path and status (major)
- [x] Tracing API picker lists no APIs, so an API selection cannot be added (major)
- [x] Escape from Tracing settings dialog leaves focus on the page body, not Edit settings (minor)
- [ ] The selections table names an API by its slug (`sample`) while the picker shows its title (`Sample HTTP API`) (minor)
- [ ] The first Test right after a Kong restart reported "Kong can't reach the trace endpoint"; the next Test passed (minor, seen once)
- [ ] The Tracing API picker shows several APIs with the same title (three "Sample HTTP API", two "Orders QA") with nothing to tell them apart (minor)
## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |
| 1 Turn tracing on for one API, developer or team | Pass | Retest: picker lists published APIs; added the quickstart Sample HTTP API → "Api · sample · Every call to this API"; Kind switches reset the target to "Choose a developer…" / "Search APIs…"; a try-it call replaced the latest trace ("Received 16 seconds ago", new Trace ID `245ec73c…ceb2`) |
| 2 Call outside the selection keeps the shown trace | Pass | With only a developer selected, 3 calls to `/sample/get?token=abc123`; after 35 s Trace ID `816e4c43…324d` unchanged |
| 3 Turn-on dialog names node settings, restart, quickstart values | Pass | "Set these two node settings … then restart the Kong node"; `KONG_TRACING_INSTRUMENTATIONS=request,router,balancer,plugin_rewrite,plugin_access,plugin_header_filter`, `KONG_TRACING_SAMPLING_RATE=1`, endpoint `http://server:4000/api/v1/internal/traces/kong` |
| 4 Test passes on the quickstart | Pass | "✓ Test passed — Kong delivered a test trace to the portal." in about 1 s |
| 5 Test names the failure cause | Pass | Unreachable endpoint: "Kong can't reach the trace endpoint" (previous tester, re-seen as "Last test failed") |
| 6 Latest call waterfall with Slowest | Pass | "GET /sample/get ⚠ 401 Unauthorized 14.3 ms total"; "⚠ Slowest: key-auth plugin — 9.76 ms, 68% of the call"; rows Request, Router, Plugin key-auth, Plugin opentelemetry; no query string |
| 9 Non-admin cannot reach tracing | Pass | UI-signed-up developer: "You don't have access to Tracing"; `/api/v1/admin/tracing/latest` 403 problem+json |
| Mobile 390×844 | Pass | No horizontal scroll (scrollWidth 390); waterfall stacks as cards with "⚠ Slowest" badge |
| Keyboard | Pass | Retest: Enter on Edit settings opens "Tracing settings"; Escape closes it and focus returns to "Edit settings" |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/026.md`. The full report is `docs/uat/026/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/026.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR

### Deferred Linear
- **Bug** — Bug: Tracing quickstart defaults omit required plugin phases (major)
  - parent: none
  - priority: high
  - create when the Linear limit allows
  - body: Reproduction: GET /api/v1/admin/tracing before first save returns request,router,balancer,plugin_access, and deploy/docker-compose.yml sets the same subset. AC3 and AC10 require request,router,balancer,plugin_rewrite,plugin_access,plugin_header_filter; apps/server/src/tracing.test.ts and apps/portal/e2e/tracing.test.ts preserve the expected failure.
- **Bug** — Bug: Tracing Test failures omit cause keys required by dialog (major)
  - parent: none
  - priority: high
  - create when the Linear limit allows
  - body: Reproduction: POST /api/v1/admin/tracing/test returns distinct detail text for gateway unreachable, tracing off, and proxy unreachable, but the problem body has no cause field. AdminTracing selects its required cause-specific title/body from error.cause, so live failures fall back to generic copy; apps/server/src/tracing.test.ts preserves the expected failure.
- **Bug** — Bug: Production server image crashes on protobufjs named export (blocker)
  - parent: none
  - priority: urgent
  - create when the Linear limit allows
  - body: Reproduction: node scripts/worktree-compose.mjs up -d --build --wait builds images but the server exits before health. Container log: packages/adapter-kong/dist/index.js imports named Root from CommonJS protobufjs; Node 22 throws SyntaxError Named export Root not found. Portal remains unavailable, so Playwright and quickstart cannot pass.
- **Bug** — Bug: Full suite leaves open admin assignment credential active (major)
  - parent: none
  - priority: high
  - create when the Linear limit allows
  - body: Full pnpm test at aa8c2f8 failed once in apps/server/src/admin-revocation.test.ts: open admin assignment expected a revoked credential call to return 401 but received 200. The new tracing suites passed; this existing full-suite failure blocks a green QA pass and was not rerun per the one-full-pass rule.
- **Bug** — Bug: Trace ingest accepts unsupported media type (major)
  - parent: none
  - priority: high
  - create when the Linear limit allows
  - body: POST /api/v1/internal/traces/kong with a valid bearer token and Content-Type: application/json. Expected RFC 9457 status 415 per AC8/technical ingest flow; received 422 trace-not-selected because JSON reaches the handler. Reproduced with: pnpm --filter @portal/server exec vitest run src/tracing.test.ts (1 failed, 8 passed).
- **Bug** — Bug: Quickstart Kong rejects tracing plugin during Test (major)
  - parent: none
  - priority: high
  - create when the Linear limit allows
  - body: On commit 8d324a1, start the isolated quickstart with node scripts/worktree-compose.mjs up -d --build --wait, export its worktree portal/API/Kong URLs, and run pnpm test:e2e. apps/portal/e2e/tracing.test.ts AC4/6 clicks Test and receives HTTP 422 problem+json with cause gateway-rejected and detail Kong refused the tracing plugin; server logs also report Kong refused the opentelemetry plugin. Expected the quickstart Test to pass within 15 seconds and then render a traced-call waterfall; actual result was 117 passed, 1 failed, 2 skipped, with AC4/AC6 blocked before the waterfall assertion.
- **Bug** — Bug: Latest trace omits request method path and status (major)
  - parent: none
  - priority: high
  - create when the Linear limit allows
  - body: Reproduction on application commit 0292b45 at http://localhost:3001: run the focused apps/portal/e2e/tracing.test.ts AC4/6 journey against the rebuilt isolated quickstart. The live Test passes, the selected sample call reaches POST /v1/internal/traces/kong and renders a four-span waterfall with key-auth marked Slowest, but the latest trace stays Unknown / Path not known yet / No status instead of GET /sample/get / 401. The trace therefore lacks the method, path and status required by AC6; the test fails at the GET assertion.
- **Bug** — Bug: Tracing API picker lists no APIs, so an API selection cannot be added (major)
  - parent: none
  - priority: high
  - create when the Linear limit allows
  - body: Steps: sign in as the seeded admin, open /admin/tracing, look at What's traced with Kind = API; then switch Kind to Developer and back to API. Expected: the Target picker lists the portal's APIs (the quickstart sample API) so the admin can add an API selection (story 1, AC1). Actual: the Target picker only shows 'Search APIs…'; the page's GET /api/v1/admin/apis answers 404. After switching Developer -> API the API picker shows the developer accounts; choosing one and clicking Add shows 'That api no longer exists. Pick another.' (POST /api/v1/admin/tracing/selections 404). Reload brings back the empty list. An admin cannot add an API selection from the UI. Developer selections work. Screen: 1114x812 desktop, Orca built-in browser, http://localhost:3001, commit 83cf246. Image: selection-picker-fail.png (local).
