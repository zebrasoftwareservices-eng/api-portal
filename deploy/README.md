# Plan rate limits

`PORTAL_RATE_LIMIT_POLICY` accepts `cluster` (default) or `local`. `cluster` persists Kong rate-limit counters in its PostgreSQL database, including calendar-month quotas in UTC, and writes the database on each request. `local` keeps counters in each Kong node’s memory; use it only when independent node counters and resets after restarts are acceptable.

The quickstart uses `cluster`. On Kong deployments with multiple nodes, plan changes can take up to five seconds to propagate; the quickstart uses strict worker consistency. Set this variable in the server environment when overriding the default.

## Usage collection

Compose (quickstart, hosted and production) sets `PORTAL_USAGE_INGEST_URL` to
`http://server:4000/api/v1/internal/usage/kong`. Kong must reach this private server URL;
for an external gateway, override it with a server address reachable from that gateway.
Helm defaults to the in-cluster server service URL; `server.usageIngestUrl` overrides it.
Do not route ingest through the public portal: the portal excludes internal routes.
The server generates and encrypts the bearer token and writes it into redacted Kong
consumer http-log plugins. Changing the URL takes effect on the next reconcile run.

`PORTAL_USAGE_RETENTION_DAYS` defaults to 400 and must be at least 62 (Helm:
`server.usageRetentionDays`). Hourly housekeeping prunes daily counts beyond this
window and deduplication digests after 24 hours. Raw requests are never stored.
Kong batches at most 200 entries per delivery, with a one-second coalescing delay and
five-minute retry budget; each batch uses one aggregate upsert, plus digest, first-call
and collection metadata writes. The ingest route accepts at most 5000 entries and 2 MB.
A one-minute internal heartbeat detects delayed collection without adding another service.
