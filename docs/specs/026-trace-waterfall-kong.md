---
id: 026
title: Trace waterfall for one API call on Kong
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-18
linear:            # the one feature issue, e.g. JSO-117 — filled by `node scripts/factory.mjs linear-init 026`
---

# 026 — Trace waterfall for one API call on Kong

## Summary
Portal admins open one recent call to a published Kong API and see a waterfall of the spans
Kong recorded for it (request, router, each plugin phase, the upstream try), so they can see
what used the time without leaving the portal.

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

Solved when, on the quickstart, an admin makes one try-it call and then opens it in the portal
and names the slowest span, with no extra container and no stored secrets or client data.
Evidence: [research brief](../research/show-opentelemetry-traces-for-one-api-re.md).

## Users
- **Portal admin** (primary): diagnoses a slow or failing call on an API they published.
- **Platform engineer**: runs the quickstart or connects an existing Kong, and decides whether
  that Kong node emits spans.

## User stories
- As a portal admin, I want to see the recent calls to one published API with method, path,
  status and total time, so that I can pick out a slow or failing one.
- As a portal admin, I want to open one call and see its spans on a timeline, labelled request,
  plugin or upstream, with the slowest marked, so that I know whether a plugin or the upstream
  used the time.
- As a platform engineer, I want the quickstart to trace calls with no extra container, and an
  existing Kong to be told clearly which two settings turn tracing on, so that I opt in knowingly.
- As a portal admin, I want traces to hold no query strings, client IPs, upstream addresses,
  headers or bodies, and to expire quickly, so that tracing does not become a store of customer data.

## Acceptance criteria
1. **Given** a connected Kong and an admin who publishes an API **When** the publish (or a later
   reconcile) runs, twice **Then** Kong holds exactly one `opentelemetry` plugin scoped to that
   API's service, carrying the portal's tags, sending OTLP/HTTP traces to the portal server's
   trace path with a bearer token; the second run creates or changes nothing.
2. **Given** the quickstart from `docker compose -f deploy/docker-compose.yml up` with no added
   container **When** a developer sends one try-it call to the sample API **Then** within 30
   seconds an admin sees that call in the sample API's recent-calls list with its method, path
   without the query string, status code and total duration in milliseconds.
3. **Given** that call in the list **When** the admin opens it **Then** a waterfall shows each
   span's name, start offset and duration on one time axis; the root span is labelled request,
   spans named `rewrite|access|header_filter phase: <plugin>` are labelled plugin with the plugin
   name, `balancer try #N` is labelled upstream, and the longest span other than the root is
   marked slowest.
4. **Given** a call sent with a query string (`?token=abc123`), custom headers and a body, and a
   Kong span that carries a non-allowlisted attribute (for example a username) **When** its
   trace is stored and later fetched through the API **Then** the database row and the response
   hold only trace id, span id, parent span id, name, start, duration, status and the portal's
   API id; `abc123`, the client IP, the upstream address, headers, bodies and the extra
   attribute appear in neither.
5. **Given** a trace batch posted to the trace path with a missing or wrong bearer token, or one
   whose spans belong to a Kong service the portal does not publish **When** the server receives
   it **Then** it answers with an RFC 9457 problem+json error (401 for the token, 4xx for the
   unknown service) and stores no span; **and when** Kong resends a batch it already delivered,
   no span is stored twice.
6. **Given** a connected Kong whose node has `tracing_instrumentations` at its default `off`
   **When** an admin opens an API's recent calls **Then** the page says tracing is off on the
   gateway and names `tracing_instrumentations` and `tracing_sampling_rate` (and the
   `KONG_TRACING_*` environment variables) with a link to the setup doc, instead of an empty list.
7. **Given** a signed-in developer who is not a portal admin, or an anonymous visitor **When**
   they request an API's recent-calls list, one trace, or the admin trace page **Then** the API
   answers 403 (or 401) problem+json and the page is not shown.
8. **Given** an API with traces older than the retention window and more than the per-API cap
   (proposal: 24 hours and 200 traces, see Open questions) **When** housekeeping runs **Then**
   traces older than the window are deleted and at most the cap's newest traces remain for that
   API; **and on** the hosted demo, the daily reset deletes every trace.
9. **Given** the quickstart compose file **When** it starts Kong **Then** the node sets
   `KONG_TRACING_INSTRUMENTATIONS` to `request,router,balancer,plugin_rewrite,plugin_access,plugin_header_filter`
   (no `db_query`, `dns_query` or `http_client`) and `KONG_TRACING_SAMPLING_RATE=1`, and the
   quickstart still gives a working portal in under five minutes.

## Out of scope
- **A log viewer, a live log tail, and jumping from a log line to its trace.** Kong access logs
  are a second export and would undo ADR 0011's redaction; spec 011's http-log stays a counter.
- **Trace search, filters, a live tail and a LIVE badge.** The shipped Zuplo screen is a list you
  open; one list per API proves the value.
- **Exporting traces to Jaeger, Honeycomb or any other backend.** An operator can point Kong's
  plugin at their own collector themselves.
- **A developer-facing waterfall, including inside try-it.** The plugin list is the operator's
  configuration, and showing a developer only their own calls needs a consumer id this spec
  does not store.
- **Latency charts, per-route metrics and response size.** Spec 011 left these out on purpose;
  they are analytics, a separate item.
- **Inventing spans Kong does not emit** (Zuplo's handler span). Labels come from Kong's own span names.
- **AWS API Gateway, APISIX, Envoy and other adapters.** The span names are Kong's; AWS tracing
  was not researched (spec 017).
- **Changing spec 011's http-log plugin** to keep raw requests.
- **Setting `tracing_instrumentations` on an existing Kong for the operator.** The Admin API cannot;
  the portal says what to set and the operator restarts the node.
- **Staff roles limiting who sees traces.** Every portal admin sees them until spec 015.
- **Traces in the static Vercel demo** (spec 002). It has no gateway.

## Open questions
- [ ] Confirm this pull request is traces only and a log tail waits (the request said "otel logs"; the screenshot is a trace waterfall). — Elango
- [ ] Confirm the viewer is portal admins on one published API, and a developer view of their own calls is a later spec. — Elango
- [ ] Is 24 hours and at most 200 traces per API the right retention cap? — Elango
- [ ] Is "tracing stays off on an existing Kong until the operator sets `tracing_instrumentations` and restarts the node" the right opt-in for a company's own Kong? — Elango
- [ ] Should the plugin sit on the published service (every call, including a missing or rejected key) or on each portal consumer like usage collection (portal keys only; a rejected key leaves no trace)? This spec assumes the service. — Elango
- [ ] How does the portal tell "tracing is off" from "no calls yet" (criterion 6): read the node's configuration through the Admin API, or infer from no spans arriving? — tech-lead

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
