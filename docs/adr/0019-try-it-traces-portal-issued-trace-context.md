# ADR 0019 — Try it traces use a portal-issued W3C trace context, one per user

Status: proposed (spec 027) · Date: 2026-11-22

## Context
Spec 026 (ADR 0018) keeps one latest trace per API, pushed by Kong's `opentelemetry` plugin,
for portal admins only. Spec 027 shows each signed-in user the trace of their own Try it call,
and nobody else's. The portal needs to tie a trace to exactly one call and one user, without
running a collector and without a trace history.

Try it already goes through the server (`/api/v1/try-it`, ADR 0003), so the browser never calls
Kong directly.

## Decision
1. **The server issues the trace context.** For a signed-in caller whose call is covered by an
   active tracing selection, the Try it proxy generates a random 128-bit trace id and 64-bit
   span id and sends `traceparent: 00-<traceId>-<spanId>-01` to Kong. Any `traceparent` or
   `tracestate` from the browser is dropped (the proxy already forwards an allowlist of headers).
   The response tells the browser the trace id in `X-Portal-Trace-Id` and the outcome in
   `X-Portal-Trace-State`. No CORS change, because the browser never talks to Kong.
2. **Kong extracts W3C context.** The portal's tracing plugins change from
   `propagation.extract: []` to `extract: ['w3c']` (inject `preserve`, default `w3c`
   unchanged), so the spans Kong exports carry the portal's trace id.
3. **One Try it trace per user, in its own table.** `try_it_traces` has the user id as primary key
   and a unique trace id. A traced Try it call replaces the row; ingest merges spans whose trace id
   matches a row. There is no list or history. The API's latest trace (ADR 0018) is still updated,
   so the 026 admin page keeps working.
4. **Reading is by trace id and owner.** `GET /v1/try-it/traces/{traceId}` answers only when the id
   is the caller's current row; every other id is the same 404.
5. **Redaction depends on the reader.** Portal admins see plugin names; everyone else sees the
   `plugin` label only. Spans are stored once with Kong's names and redacted when read.

## Consequences
- With `extract: ['w3c']`, any client of a traced route can set its own trace id and sampled flag.
  Trace ids issued by the portal are 128-bit random and shown only to their owner, so another client
  can't guess one. A client can force sampling on traced routes, which only adds ingest load inside
  the admin's selection; ingest stays one-row upserts.
- Whether Kong honours an incoming `sampled` flag over `tracing_sampling_rate` must be checked
  against the quickstart Kong. If it doesn't, a Try it call under a sampling rate below 1 can show
  "no trace arrived", which is the designed fallback (spec 027 AC 8).
- Try it is traced only when the admin's selection covers it (026 Decision 5). Tracing every
  Try it call would need a plugin on every published API and is left out.
- Calls made outside Try it are never tied to a user.
- Other adapters can do the same if they accept W3C context. AWS API Gateway is out of scope.

## Alternatives considered
- **The browser sends `traceparent` straight to Kong.** It needs Kong CORS to allow the header and
  lets the browser choose ids. Rejected because Try it already goes through the server.
- **Match by time window or request id instead of trace id.** This is racy when two people call at
  once (spec 027 AC 2), and the request id is a dropped attribute. Rejected.
- **Store Try it traces in `trace_latest` under a per-user scope key.** It mixes two lifetimes and
  two audiences in one table, and the admin API-selector query would need to filter them out.
  Rejected for a small separate table.
