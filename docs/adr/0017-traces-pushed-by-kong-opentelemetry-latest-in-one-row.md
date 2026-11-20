# ADR 0017 — Kong pushes OTLP traces to the portal, which keeps only the latest one in a Postgres row

- Status: Proposed (accept by merging)
- Date: 2026-11-20
- Spec: 026-trace-waterfall-kong
- Builds on: [ADR 0002](0002-gateway-adapter-contract-v0.md) (adapter contract),
  [ADR 0011](0011-usage-collected-by-kong-http-log.md) (Kong pushes to a portal ingest endpoint)

## Context
Spec 026 shows an admin the span waterfall of the latest traced call on Kong, for the APIs,
developer accounts and teams the admin selects. The portal has no trace history (Decision 3),
the quickstart may not gain a container, and nothing stored may hold a query string, client
IP, upstream address, header, body or other span attribute.

Facts checked against the quickstart's `kong:3.9` image:
- Spans exist only when the node's `tracing_instrumentations` is set (kong.conf; the Admin API
  can't change it). `GET /` returns it in `configuration`.
- Span names are `kong` (root), `kong.router`, `kong.balancer` (one per try, attribute
  `try_count`), `kong.<phase>.plugin.<name>`, `kong.dns`, `kong.database.query`. The root carries
  `http.url` with the query string, `http.client_ip`, `net.peer.ip`, `http.route` and
  `http.status_code`; balancer spans carry the upstream `net.peer.ip`/`port`.
- The `opentelemetry` plugin only exports OTLP/HTTP Protobuf, expects a 200, and retries anything
  else through Kong's queue. Each plugin instance has its own queue, so a batch comes from one
  instance and carries that instance's `resource_attributes`.
- `propagation.extract: []` makes Kong ignore incoming trace headers (a fresh trace id per call);
  `propagation.inject: []` stops it adding headers upstream.
- Kong runs one instance of a plugin per request, the most specific: a consumer-scoped instance
  beats a service-scoped one. A call matching both an API and a consumer selection is exported
  once, by the consumer's instance.

Options for storing the latest trace:
- **Server memory.** Lost on restart; with several Helm replicas, Kong posts to one replica and
  the admin's browser may read another.
- **An external tracing backend (Jaeger, Tempo).** A new container, and history the spec rules out.
- **One overwritten Postgres row.** Shared by replicas, survives restarts, one small write per batch.

## Decision
1. **Kong pushes with `opentelemetry`.** The Kong adapter writes one portal-tagged plugin per
   traced scope: service-scoped for an API selection (ID `stableId('otel', 'service:'+serviceId)`),
   consumer-scoped for each app covered by a developer or team selection
   (`stableId('otel', 'app:'+appId)`), with `PUT /plugins/{id}` so repeats change nothing. Config:
   `traces_endpoint` = the admin's trace endpoint, `headers.Authorization: Bearer <trace token>`,
   `propagation: { extract: [], inject: [], default_format: w3c }`, `queue.max_coalescing_delay: 1`,
   `queue.max_batch_size: 1000`, `queue.max_retry_time: 60`, no `sampling_rate` (the node's
   applies), and `resource_attributes` `portal.instance`, `portal.selections` (comma-separated
   `api:<id>`, `developer:<id>`, `team:<id>` keys that cover this scope) and, for an API scope,
   `portal.api_id`. An app covered by two selections gets one plugin listing both keys.
2. **The adapter owns OTLP and Kong's names.** `GatewayAdapter` gains `applyTracing(plan)`,
   `inspectTracing()`, `ensureTraceProbe(probe)`, `parseTraceBatch(body)` and
   `classifySpan(name)`, and `Capabilities` gains `tracing`. `parseTraceBatch` decodes the Protobuf
   and returns only allowlisted fields: per span trace id, span id, parent id, name, start,
   duration, status; from the root, method, path with the query removed, status code and
   `http.route`. All other attributes are dropped there, before the server sees them. New
   dependency: `protobufjs`, because Kong sends only Protobuf; the OTLP trace message subset ships
   as a JSON descriptor in the adapter, with no code generation step.
3. **One row holds the latest trace.** Table `trace_latest`, keyed by `scope_key` (today always
   `portal`). An accepted batch locks the row (`SELECT … FOR UPDATE`) and, per trace id in the
   batch: merges spans by span id when it is the shown trace (so a resent batch adds nothing and a
   trace split across batches joins up); replaces the row when the trace started later than the
   shown one; drops it otherwise. Spans per trace are capped at 1000. Nothing else about calls is
   stored, and the raw body is never logged.
4. **A batch must belong to an active selection.** The server refuses with 422 a batch whose
   `portal.instance` isn't this portal or none of whose `portal.selections` is on, so turning a
   selection off stops its traces at once, before reconcile removes the plugin. A wrong or
   missing token is 401. Both store nothing.
5. **The Test probes end to end.** It reads `configuration.tracing_instrumentations` from `GET /`,
   writes a portal-internal probe route `/__portal/trace-probe/<instanceId>` with a
   `request-termination` 204 and a route-scoped `opentelemetry` plugin (sampling rate 1, resource
   attribute `portal.probe=<nonce>`), calls it through the internal proxy URL, and waits up to 10
   seconds for the nonce to be recorded in `tracing_settings` by whichever replica received it.
   Each failure has its own cause.
6. **The API of a consumer-scoped trace is matched by route.** A consumer-scoped plugin can't
   know which service was called, so the server matches the root's `http.route` against the
   routes of the services behind published APIs (from `listServices()`, cached for 60 seconds).
   No match leaves the API null.

## Consequences
- Kong must reach the portal server at the trace endpoint, as for usage. The quickstart sets
  `KONG_TRACING_INSTRUMENTATIONS` and `KONG_TRACING_SAMPLING_RATE=1`; every proxied call then
  builds spans in Kong's memory, but only selected calls are exported.
- Unlike ADR 0011, the sensitive fields do leave Kong: the plugin can't filter attributes, so the
  client IP, full URL and upstream address cross the network to the portal, which drops them on
  receipt. The trace endpoint should stay on a private network.
- The trace token is visible to anyone who can read Kong's Admin API. It can only replace the
  shown trace with spans tagged with an active selection.
- Per-API or per-selection latest traces (spec 026 open question 1) are a change of `scope_key`,
  not of the table.
- Another gateway adds tracing by implementing the five adapter methods; span labels come from
  its own `classifySpan`.
