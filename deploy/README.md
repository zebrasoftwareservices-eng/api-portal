# Plan rate limits

`PORTAL_RATE_LIMIT_POLICY` accepts `cluster` (default) or `local`. `cluster` persists Kong rate-limit counters in its PostgreSQL database, including calendar-month quotas in UTC, and writes the database on each request. `local` keeps counters in each Kong node’s memory; use it only when independent node counters and resets after restarts are acceptable.

The quickstart uses `cluster`. On Kong deployments with multiple nodes, plan changes can take up to five seconds to propagate; the quickstart uses strict worker consistency. Set this variable in the server environment when overriding the default.
