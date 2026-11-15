# ADR 0011 — Usage is pushed by consumer-scoped Kong http-log plugins and stored as daily counts

- Status: Proposed (accept by merging)
- Date: 2026-11-14
- Spec: 011-usage-and-insights
- Builds on: [ADR 0002](0002-gateway-adapter-contract-v0.md) (adapter contract),
  [ADR 0009](0009-plans-map-to-kong-rate-limiting.md) (one rate-limiting plugin per subscription)

## Context
Spec 011 shows each app's calls this month against its plan's quota within 60 seconds of the
calls, splits them by status class, and gives admins 30-day adoption numbers and each new
developer's time to first call. Time to first call counts only keys the developer created or
regenerated, so the portal needs the key (credential) behind each call, not only the consumer.
Collection must work against the quickstart's Kong with nothing extra to install, and stored
records must never hold a key, a header or a body.

Options considered:
- **Prometheus plugin, polled.** Has consumer and status labels, but no credential label, so it
  can't attribute a first call to a key. Counters are per Kong node and reset when Kong restarts,
  so the portal would have to scrape every node and handle resets.
- **Polling Kong's rate-limiting counters.** Not exposed by the Admin API, has no status split,
  and doesn't exist for built-in-plan apps.
- **Kong http-log plugin, pushed to the portal.** Kong's log serializer carries the consumer, the
  credential (`authenticated_entity.id`, which the adapter sets to the portal credential ID), the
  service, the status and the request time. Kong batches and retries delivery itself.

## Decision
1. **Kong pushes, using `http-log`.** The Kong adapter puts one `http-log` plugin on each app's
   consumer, ID `stableId('http-log', appId)`, tagged `portalTags(instanceId, app)`, created with
   `PUT /plugins/{id}` so repeats are idempotent. It POSTs to `PORTAL_USAGE_INGEST_URL`
   (compose default `http://server:4000/api/v1/internal/usage/kong`) with
   `Authorization: Bearer <ingest token>`, `queue.max_coalescing_delay: 1` and
   `queue.max_batch_size: 200`. Consumer scope, not global: an operator's own global `http-log`
   plugin keeps working (Kong allows one plugin of a name per scope), Kong sends only portal
   traffic, and requests with no key, an unknown key or a revoked key are never sent at all.
   Deleting a consumer cascades its plugin.
2. **Nothing sensitive leaves Kong.** The plugin sets `custom_fields_by_lua` so `request` becomes
   an empty table and `response` becomes `{ status = <status> }`; headers (including `apikey`),
   query strings and bodies are not serialized. This needs Kong's default
   `untrusted_lua = sandbox`. If Kong refuses the field, the adapter does not fall back to an
   unredacted plugin: reconcile reports a `usage-unavailable` finding and usage shows as behind.
3. **The server parses through the adapter and stores only counts.** `GatewayAdapter` gains
   `parseUsageEvents(body)`, which turns the gateway's payload into
   `{ appId, credentialId, serviceId, routeId, status, at }` events; Kong's field names stay in
   the Kong adapter. An event counts only when its app exists and its credential is one of that
   app's keys. Events add to `usage_daily` (app, UTC day, gateway service, counts per status
   class). There is no table of raw requests.
4. **A heartbeat makes "behind" detectable.** Pushed logs are silent when nobody calls, which
   looks the same as Kong failing to reach the portal. The adapter's `ensureUsageCollection()`
   creates a portal-internal route `/__portal/usage-heartbeat/<instanceId>` with a
   `request-termination` plugin (204) and a route-scoped `http-log` plugin like the one above. A
   `usage-heartbeat` job requests it through Kong's internal proxy URL every minute. Any accepted
   batch sets `usage_collection.last_received_at`; older than 5 minutes means usage is behind.
5. **The portal counts every response for an app's key, by Kong's request time.** That includes
   429 and 403 answers Kong made itself. Kong's quota counter counts only requests that passed the
   rate limiter (ACL runs first and a rejected request isn't counted), so the portal's number can
   be higher than Kong's. The usage bar shows the portal's number, because spec 011 requires the
   status classes to sum to it. Both use the UTC calendar month and both carry on across a plan
   change or a key regeneration, since both count per consumer.
6. **Retention.** Daily rows are kept for `PORTAL_USAGE_RETENTION_DAYS` (default 400, minimum 62
   so this month and last month are always whole). An hourly `usage-housekeeping` job deletes
   older rows and batch digests older than 24 hours. A developer's first call is kept with the
   user and goes when the user is deleted.
7. **Retries don't double count.** Kong resends a batch after a failed or timed-out delivery.
   The server records each accepted batch's SHA-256 digest for 24 hours and acknowledges a
   repeat with 204 without counting it again.
8. **Adapters may not support usage.** `capabilities().usage` becomes a boolean. When it is
   false, the server answers `collection.status: unsupported` and the UI says usage isn't
   available for this gateway instead of showing zero. Spec 017 implements usage for AWS.

## Consequences
- Kong must reach the portal server. The quickstart does over its compose network. An operator
  whose Kong runs elsewhere sets `PORTAL_USAGE_INGEST_URL`; until Kong can reach it, the app page
  says usage may be behind. With the variable unset, usage is `not-configured`.
- Every portal-key request costs Kong one queued log entry, delivered in batches. The portal
  takes one insert per batch, aggregated with `ON CONFLICT ... DO UPDATE`.
- Subscribe gains one Kong write: consumer, ACL groups, rate limit, usage log, then the key.
  Reconcile creates missing usage plugins and deletes portal-tagged ones whose app is gone.
- Counts are close to real time but not exact: a batch lost after Kong's retries give up (300
  seconds) is lost, and the portal does not try to match Kong's quota counter.
- The ingest token is visible to anyone who can read Kong's Admin API. It only allows adding
  counts for portal apps with real credential IDs, and rotating it is a reconcile run.
