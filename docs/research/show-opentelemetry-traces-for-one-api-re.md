# Research brief — a trace waterfall for one API call

Evidence for the product manager. This is not a spec.

## Question

A portal admin who published an API on Kong needs to open one call and see which plugin or which upstream used the time, inside this portal. Today a slow call shows up only as a status-class count on the monthly usage bar.

The screenshot in the request is Zuplo's roadmap card for that view ("Diagnose slow endpoints without leaving Zuplo"). The words "otel logs" in the request match a different OpenTelemetry signal. The card, and the feature Zuplo has shipped, are traces: a waterfall of spans for one request.

## Sources

Each fact below is from a page opened for this brief.

**What Zuplo ships**

- [Zuplo roadmap, Tracing](https://zuplo.com/roadmap): status "Now available". The card copy is the screenshot: view OpenTelemetry traces in the Zuplo portal and drill into every span (policies, handlers, and origins). The card also lists a full waterfall, per-policy timings, handler and origin spans, slow-span detection, trace search and filters, and OTel-compatible export.
- [OpenTelemetry tracing views, changelog, 17 June 2026](https://zuplo.com/changelog/2026/06/17/otel-tracing-views): the Observability section shows a waterfall for every gateway request. Spans cover inbound and outbound policies, the handler, and subrequests. Traces are stored by Zuplo, with no collector to run. `@zuplo/otel` creates a span for each inbound and outbound policy, the handler, `fetch` subrequests, and Cache API operations. Logs emitted with `context.log` carry the request id `zp-rid`, so a log line can jump to its trace. Export is OTLP over JSON. That changelog says the tracing views are an Enterprise feature.
- [Zuplo OpenTelemetry docs](https://zuplo.com/docs/articles/opentelemetry): the later docs page says built-in tracing is on every plan, and exporting to your own backend is the Enterprise feature. Traces are stored by Zuplo and shown on the Traces tab, next to Logs and Analytics, with no collector to host. The tab lists one row per HTTP request; expanding the row shows that request's spans. Local `zuplo dev` does not send traces to Zuplo. What is traced by default: the request, each inbound policy, the handler, each outbound policy, and `fetch` subrequests. A new project samples every request on the working copy and 10% elsewhere. Error traces are still exported at any ratio unless the operator replaces the tail sampler. Tracing adds little to a single response (spans flush after the response) and does cost CPU and memory, so high-RPS APIs are told to sample. Retention depends on the plan. The same page says Zuplo's built-in storage covers traces, and managed logs and metrics are planned. The page also says its scope is the gateway runtime, not Zuplo's developer portal.

**What Kong can emit**

- [Kong OpenTelemetry plugin](https://developer.konghq.com/plugins/opentelemetry/): minimum Gateway 3.0. Traces, and logs from 3.8. Metrics on this plugin are 3.13 or later. The quickstart image is `kong:3.9` (`deploy/docker-compose.yml`), so traces and logs apply and native metrics on this plugin do not. Export is OTLP/HTTP with Protobuf, not JSON. The plugin page does not mark the plugin enterprise-only. With `tracing_instrumentations` enabled, the root span carries `http.method`, `http.url`, `http.host`, `http.scheme`, `http.flavor`, and `net.peer.ip`. A debug trace printed in the docs is six spans: `GET /wrk` (the request), `rewrite phase: opentelemetry`, `router`, `access phase: cors`, a custom span inside that plugin, and `balancer try #1` (the upstream attempt, with the upstream address). The plugin can affect Gateway performance. Kong's own guidance is to set `tracing_sampling_rate`. Queues live in each worker's memory and are dropped if the worker dies. From 3.5, a log serializer running beside this plugin adds `trace_id` to the serialized log. Access logs are a separate export (`access_logs`) and carry request metadata.
- [Enable the OTEL plugin for traces](https://developer.konghq.com/plugins/opentelemetry/examples/traces/): the plugin can be global, or scoped to a service, a route, or a consumer. The tutorial's prerequisites are `tracing_instrumentations = all` and `tracing_sampling_rate = 1.0` in `kong.conf`, plus `traces_endpoint` on the plugin.
- [Kong Gateway tracing](https://developer.konghq.com/gateway/tracing/): minimum 3.4. Instrumentations default to `off`, and the tracer stays a no-op until they are enabled. They are a node setting in `kong.conf`, not a plugin field. Values include `request`, `router`, `balancer`, `plugin_rewrite`, `plugin_access`, `plugin_header_filter`, `http_client`, `dns_query`, and `db_query`. `all` turns every one of those on. The node will not emit spans unless a tracing plugin (OpenTelemetry or Zipkin) is also enabled. Granular tracing (`tracing = on`) was removed in 3.7.

## Already covered

- **Spec 011 (JSO-239), done.** Admins and developers see monthly call counts and status classes, collected from Kong. Out of scope there: per-operation or per-route usage, latency, and response-size metrics. [ADR 0011](../adr/0011-usage-collected-by-kong-http-log.md) stores daily counts only. There is no table of raw requests. The `http-log` plugin is scoped to the app's consumer, and `custom_fields_by_lua` empties `request` and keeps `response.status`, so headers, query strings, and bodies are not stored. That pipeline cannot draw a span waterfall, and it should stay a counter.
- **Spec 008 (JSO-236), done.** Its out of scope leaves an audit log to spec 015. That log is staff actions (the roadmap's example is key revokes), not a gateway request trace.
- **Spec 015 (JSO-243), not written.** Roadmap sprint 7: staff roles, registration approval, a private portal, and that audit log.
- **Spec 017 (JSO-245), not written.** AWS API Gateway. This brief did not verify AWS tracing.
- **Spec 001 (JSO-117), done.** Analytics was out of scope. The quickstart Kong is `kong:3.9`.
- **Spec 002 (JSO-193), done.** The static Vercel demo has no gateway, so it has nothing to trace.

No open spec stores a span or shows one request's timeline.

## Fits one pull request

Zuplo can draw policy, handler, and origin bars because Zuplo is the gateway. This portal is not. The bars have to be the spans Kong already creates. Copying Zuplo's four labels (policy, handler, origin, plugin) would invent a handler span Kong does not emit.

**Build, Kong only, admin only.**

- On each API the portal publishes, the Kong adapter installs one OpenTelemetry plugin, scoped to that service, posting OTLP/HTTP Protobuf to the existing server. Same rules as usage: idempotent upsert, portal tags, a bearer token, and a dedicated path. A batch that is not a trace for a portal service is refused. Kong retries are deduped by trace id and span id.
- The quickstart compose file sets the node flags Kong will not accept through the Admin API: `KONG_TRACING_INSTRUMENTATIONS` to `request`, `router`, `balancer`, `plugin_rewrite`, `plugin_access`, `plugin_header_filter`, and `KONG_TRACING_SAMPLING_RATE=1` so one try-it call shows up. Leave out `db_query`, `dns_query`, and `http_client`. The tutorial's `all` includes database queries. No extra container. `docker compose up` stays the quickstart.
- The server keeps an allowlist of span fields: trace id, span id, parent span id, name, start, duration, status, and the portal service id that ties the trace to the API. It drops `http.url`'s query string, `net.peer.ip`, the upstream address on the balancer span, headers, bodies, and every other attribute. The debug sample in Kong's docs puts a username on a custom span; storing unknown attributes would keep that.
- An admin opens one published API and sees recent calls: method, path without query, status, total time. Opening one call shows the waterfall. Group the spans from Kong's own names. The root span is the request. Spans whose names are a plugin phase (`access phase: key-auth`, and the same for rewrite and header_filter) are plugins. `balancer try #N` is the upstream. Mark the longest span other than the root. That is the whole of "slow span" for this pull request.
- A gateway whose node still has the default `tracing_instrumentations=off` shows that tracing is off, and names the two settings, rather than an empty list. Try-it calls appear in the list because they go through Kong.
- Retention is short and capped (proposal: 24 hours, and at most 200 traces per API). Housekeeping deletes the rest. The hosted demo's daily reset deletes these rows the same way spec 011 deletes a visitor's usage.

**Split out.**

- A log viewer, and jumping from a log line to a trace. Zuplo's built-in store is traces; managed logs are still planned there. Kong access logs are a second export and would undo ADR 0011's redaction. `trace_id` on the http-log payload is useless while that pipeline keeps only counts.
- Trace search, filters, a live tail, and the roadmap card's LIVE badge. The shipped Zuplo screen is a list you open.
- Sending a copy to Jaeger, Honeycomb, or any other backend. An operator who wants that can point Kong's plugin at it themselves.
- A developer-facing waterfall, including one inside try-it. The plugin list is the operator's configuration.
- Latency charts, per-route metrics, and response size. Spec 011 left those out on purpose. Zuplo lists them under Analytics, a separate roadmap item.
- AWS, APISIX, Envoy, and the other adapters. The span names above are Kong's.
- Changing spec 011's http-log plugin so it keeps raw requests.

## Open questions for Elango

- The screenshot is a trace waterfall. Confirm this pull request is traces, and that a log tail waits.
- Confirm the viewer is portal admins on one published API. A developer seeing only their own call is a later spec, and it needs a consumer id we would otherwise not store.
- Is 24 hours and 200 traces per API the right cap? Zuplo's retention depends on the plan; this install should not keep spans for the 400 days ADR 0011 keeps counts.
- The quickstart would trace every call, with that cap. An existing Kong is unchanged until someone sets `tracing_instrumentations` and restarts the node. The portal cannot set that through the Admin API. Is that the right opt-in for a Kong the company already runs?
- Should the plugin stay on the published service (every call to that API, including a missing key), or move to the consumer the way usage collection did (portal keys only, and a rejected key has no trace)?
