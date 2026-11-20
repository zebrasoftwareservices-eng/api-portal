---
id: 026
title: Trace waterfall for one API call on Kong
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
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
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/026-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/026.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

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
