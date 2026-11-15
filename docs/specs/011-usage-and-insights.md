---
id: 011
title: Usage meter per app and admin insights
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-14
linear: JSO-239
---

# 011 — Usage meter per app and admin insights

## Summary
Developers see how much of its plan's monthly quota each of their apps has used, and portal admins see
adoption (sign-ups, active apps, top APIs and each new developer's time to first API call),
from request counts the portal collects from Kong.

## Problem
Spec 009 gives every plan a monthly quota that Kong enforces, but nobody can see it coming.
A developer learns they are near the limit only when Kong starts answering 429, and has no way to
tell whether their failures are their own 4xx errors or the API's 5xx errors. The admin running
the portal can't tell whether anyone uses it: how many developers signed up, which apps make calls,
which APIs matter, and how long it takes a new developer to make a first call. Time to first call
is the portal's main promise (target under 10 minutes), and today it is unmeasured.

It is solved when, after 20 calls through Kong, the app's usage bar shows 20 against the plan's
quota within a minute, and the admin can read each new developer's time to first call
(roadmap Sprint 5 demo).

## Users
- **API consumer (developer):** any member of the team that owns the app, including Read-only.
- **Portal admin:** reads the insights page.
- **Hosted demo visitor (spec 006):** a developer on the public live demo; sees the same usage
  meter as in any install.
- **Platform engineer:** runs the quickstart; collection must work against the bundled Kong with
  no extra setup.

## User stories
- As a developer, I want to see my app's calls this month against its plan's quota, so that I
  can act before Kong starts rejecting my requests.
- As a developer, I want my calls split into success, client errors and server errors, so that I
  can tell whether a problem is in my code or in the API.
- As a portal admin, I want to see sign-ups, active apps and the most-called APIs, so that I know
  whether the portal is being adopted and which APIs matter.
- As a portal admin, I want each new developer's time from sign-up to first successful API
  call, so that I can tell whether onboarding (including waiting on email verification) meets
  the under-10-minutes target and spot developers who got stuck.
- As a visitor to the hosted live demo, I want my app's usage meter to work as it would in a
  real install, so that I can judge the product by trying it.
- As a platform engineer, I want usage collected from the Kong I already connected, with nothing
  extra to install, so that the quickstart still works in under five minutes.

## Acceptance criteria
1. **Given** an app subscribed to a plan with a monthly quota of 1,000 and no calls this month
   **When** the developer makes 20 calls through Kong with that subscription's key
   **Then** when the app page is loaded or reloaded within 60 seconds of the last call, it shows a
   usage bar reading 20 of 1,000 calls, with no one starting a collection job by hand.
   (Since spec 009 each subscription is its own app with one plan and one key, there is one bar
   per app.)
2. **Given** an app whose calls this month returned 12 responses in 2xx, 5 in 4xx (including any
   429 rejections from Kong) and 3 in 5xx
   **When** a member of the owning team opens the app page
   **Then** it shows those three counts labelled by status class (2xx, 4xx, 5xx), and their sum
   equals the usage bar's count.
3. **Given** requests sent to a Kong route with no key, an unknown key or a revoked key
   **When** usage is collected
   **Then** no app's counts change, and no stored usage record contains a key value, a request
   header, or a request or response body.
4. **Given** an app with calls on the last day of the previous month (UTC) and calls this month
   **When** the developer opens the app page
   **Then** the usage bar counts only this month's calls and shows the reset date as the first
   day of next month at 00:00 UTC (for example "Resets 1 Dec 2026, 00:00 UTC").
5. **Given** a signed-in developer who is not a member of the team that owns an app, or a
   signed-out visitor
   **When** they request that app's usage from the portal or the server API
   **Then** the server answers with RFC 9457 problem+json (404 for the non-member, 401 for the
   signed-out visitor) and returns no counts. A Read-only member of the owning team does see them.
6. **Given** usage collection has failed for more than 5 minutes (for example Kong can't reach
   the portal)
   **When** a developer opens the app page
   **Then** it shows the last count it has, the time of the last update, and a notice that usage
   may be behind. It never shows the count as 0 because data is missing.
7. **Given** a portal with developer sign-ups, apps and calls across several APIs
   **When** a portal admin opens the insights page
   **Then** it shows, for the last 30 days (rolling, UTC): the number of new sign-ups, the number
   of active apps (apps with at least one call in those 30 days), and up to five APIs with the
   most calls, each with its call count, highest first. Fewer than five APIs with calls shows only
   those. **And given** a portal with no calls in the last 30 days, the page shows 0 active apps
   and "No calls yet" in place of the top APIs, not an error.
8. **Given** developers who signed up in the last 30 days, some of whom have made a successful
   (2xx) call through Kong with a key they created themselves and some of whom have not
   **When** a portal admin opens the insights page
   **Then** it lists each of them, newest sign-up first, with sign-up time (account creation, not
   email verification), first successful call time and the time between them, and shows
   "No call yet" for those without one. Above the list it shows the median time to first call,
   computed over the developers who have made one, next to the 10-minute target and the count of
   developers it covers (for example "4 of 7 developers"); with none, it shows "No calls yet"
   instead of a median. A 2xx try-it call from the portal counts as the first call; a 4xx or 5xx
   call does not. **And given** a developer who joins a team whose apps already make calls
   **When** a teammate's key makes a 2xx call **Then** that developer still shows "No call yet"
   until a key they created or regenerated makes a 2xx call.
9. **Given** a signed-in developer who is not a portal admin
   **When** they request the insights page or its server API
   **Then** the server answers 403 with RFC 9457 problem+json, the page shows no insight data,
   and the developer's navigation shows no link to it.
10. **Given** the adapter conformance suite in `packages/adapter-sdk`
    **When** it runs against the Kong adapter and a real Kong
    **Then** its usage test passes. **And given** a connected adapter that reports usage as
    unsupported (a test adapter in the suite, since only Kong implements usage in this spec),
    the app page and insights page say usage is not available for this gateway instead of
    showing zero.
11. **Given** the hosted live demo (spec 006) with a visitor who has made calls through Kong
    with their app's key
    **When** the visitor opens their app page, then requests the insights page
    **Then** the app page shows that app's usage exactly as in criterion 1, the insights page
    answers 403 as in criterion 9 (only the seeded demo admin sees it, and there is no public
    insights view), **and after** the daily demo reset the visitor's usage records are gone
    along with the rest of the visitor data, so the insights page no longer counts them.

## Out of scope
- **Error spikes per team** (in JSO-239's scope list). Cut to keep this to one pull request
  (Elango, 2026-11-14): alerting on it overlaps with notifications. The app page's status-class
  counts (criterion 2) cover the developer side. Tracked as a follow-up below; the starting
  threshold to evaluate then is a team's 5xx rate over 5% across 15 minutes with at least 50
  requests.
- **Charts over time, daily breakdowns, date-range pickers and CSV export.** One monthly number
  per plan and fixed 30-day admin totals prove the value.
- **Per-operation or per-route usage, latency and response-size metrics.**
- **Usage alerts and emails** (for example at 80% of quota). Later spec on top of spec 007's mail.
- **Usage on AWS API Gateway.** Spec 017 implements the adapter's usage call with usage plans.
- **Usage in the static Vercel demo (spec 002).** It has no backend, so these screens don't
  appear there. The hosted live demo (spec 006) is in scope (criterion 11).
- **A public insights view on the hosted live demo.** The demo behaves like any install: insights
  stay admin-only.
- **Billing or overage of any kind.** Plans are free access tiers (AGENTS.md).
- **Changing how Kong enforces quotas.** The portal displays usage; Kong still decides rejections.
- **Insights per team or per developer beyond time to first call, and staff roles that limit who
  sees insights.** Every portal admin sees insights until spec 015.

## Open questions
- [ ] How long are raw and aggregated usage records kept, and is retention configurable? — tech-lead (ADR)
- [ ] Which collection mechanism (Kong http-log plugin, Prometheus plugin, or polling), and does it
      need any change to the quickstart's Kong config? — tech-lead (ADR)
- [ ] Does the portal's monthly count match Kong's quota counter exactly (Kong's quota period is
      a UTC calendar month, and whether 429-rejected requests count toward it)? If they can differ,
      which one does the usage bar show? — tech-lead
- [ ] Can a spec 009 plan have no monthly quota, and what do built-in-plan apps from spec 004
      show? If a plan has no quota, the bar shows the count with "No monthly limit". — tech-lead,
      from spec 009's data model
- [ ] When a developer changes plan or regenerates the key mid-month (spec 009), does the app's
      count carry on, or restart to match what Kong's quota counter does? — tech-lead, with the
      collection ADR
- [x] Time to first call with team-owned apps (spec 008): a developer invited to a team whose apps
      already make calls would get a near-zero or negative time. — Elango: **follow industry
      practice.** Time to first call is measured per developer, from that person's sign-up to
      their own first successful call
      ([Postman](https://blog.postman.com/the-most-important-api-metric-is-time-to-first-call/),
      [Nordic APIs](https://nordicapis.com/why-time-to-first-call-is-a-vital-api-metric/)), so only
      calls made with a key the developer created or regenerated count; teammates' keys don't.
      (Criterion 8.)
- [ ] Is this one pull request? It covers collection, the app usage bar, the insights page and the
      hosted demo. If the tech lead's design says it won't fit, the cut is the insights list and
      median (criterion 8) into a follow-up spec, but the Sprint 5 demo needs both halves, so the
      recommendation is to keep it whole. — tech-lead, then Elango
- [x] Does "time to first API call" start at sign-up or at email verification, and does a try-it
      call count? — Elango: **starts at sign-up** (account creation), because waiting on
      verification is onboarding friction admins want to see. **Ends at the first 2xx call**
      through Kong with a key the developer created (narrowed for team apps, see below); **try-it calls count**, since
      they are real calls through Kong. (Criterion 8.)
- [x] Do we want error spikes per team, and with what threshold? — Elango: **not in this spec.**
      Follow-up below; evaluate starting at a team's 5xx rate over 5% across 15 minutes with at
      least 50 requests.
- [x] Should the hosted live demo (spec 006) show the insights page publicly? — Elango: **no.**
      The demo behaves like a real product: visitors see their own app usage, insights stay
      admin-only (the seeded admin), and the daily reset clears visitor usage with the rest of
      the visitor data. (Criterion 11.)

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Lasting choices are in [ADR 0011](../adr/0011-usage-collected-by-kong-http-log.md): Kong pushes usage
through consumer-scoped `http-log` plugins, the server stores only daily counts, and a
one-minute heartbeat makes "behind" detectable. Builds on ADR 0009 (one rate-limiting plugin per
subscription).

### Answers to the open questions
- **Retention:** no raw request rows. Daily counts are kept `PORTAL_USAGE_RETENTION_DAYS` (default
  400, minimum 62), pruned hourly. First-call rows go with the user. (ADR 0011 §6)
- **Mechanism:** Kong `http-log` on each app's consumer, pushing to the server. The quickstart's
  Kong config doesn't change. The portal writes the plugins through the Admin API it already
  uses, and compose gains one server variable, `PORTAL_USAGE_INGEST_URL`. (ADR 0011 §1–4)
- **Portal count vs Kong's counter:** both use the UTC calendar month, but they can differ. The
  portal counts every response to an app's key, including Kong's own 429 and 403 answers. Kong
  counts only requests that passed its rate limiter. The bar shows the portal's count, because
  AC 2 requires the status classes to add up to it. The bar's fill stops at 100%, and the number
  can go past the quota. (ADR 0011 §5)
- **No quota:** product plans always have one (spec 009's `plan_limits` check). Built-in-plan
  apps (spec 004) have `quota: null`, and the bar shows the count with "No monthly limit".
- **Plan change or key regeneration mid-month:** the count carries on. It is kept per app, and
  Kong's counter is kept per consumer, so both continue. (ADR 0009 §4)
- **One pull request:** yes, keep it whole. Collection, the usage API, the insights API and the
  two screens are about the size of spec 009. Criterion 8 adds one column and one table to what
  collection already parses.

### Components
- `packages/adapter-sdk`: `Capabilities.usage` becomes `boolean`. Adds `UsageEvent`,
  `parseUsageEvents(body: unknown): UsageEvent[]` and
  `ensureUsageCollection(): Promise<{ heartbeatPath: string }>`. The conformance suite gets a
  `usage` test. For an adapter whose usage capability is false, the suite checks that it says so.
- `packages/adapter-kong`: config gains `usage?: { endpoint: string; token: string }`.
  `ensureConsumer` also PUTs the consumer's `http-log` plugin when `usage` is set.
  `applyAccessPolicy` repairs usage plugins as well. Also implements `ensureUsageCollection` and
  `parseUsageEvents`. `capabilities().usage = true`.
- `packages/db`: tables `usage_daily`, `developer_first_calls`, `usage_collection` and
  `usage_ingest_batches`. New column `credentials.created_by`. One migration.
- `apps/server`: ingest route, `GET /api/v1/apps/{appId}/usage`, `GET /api/v1/admin/insights`,
  `usage-heartbeat` and `usage-housekeeping` jobs, and the ingest token. Config adds
  `PORTAL_USAGE_INGEST_URL` and `PORTAL_USAGE_RETENTION_DAYS`. Credential create and regenerate
  set `created_by`.
- `apps/portal`: a usage card on the app page, the admin Insights page with a navigation link
  that only admins see, and a rewrite rule so `/api/v1/internal/*` isn't forwarded.
- `packages/sdk`: regenerated from the contract.
- `deploy/`: `PORTAL_USAGE_INGEST_URL` added to `docker-compose.yml`
  (`http://server:4000/api/v1/internal/usage/kong`), to `hosted/compose.yaml`,
  to `production/compose.yaml` and to the Helm values (the server's in-cluster service URL).
  Each is documented in `deploy/README.md`.

### API contract (`apps/server/openapi.yaml`, tag `usage`)
- `GET /api/v1/apps/{appId}/usage` → 200 `AppUsage`
  `{ appId, period: { start, resetsAt }, quota: int|null, total: int|null, byStatus: { 2xx, 4xx, 5xx, other }|null, collection }`.
  Any role in the app's team can read it, including read-only. Signed out gets 401
  `/problems/unauthenticated`. Any other user gets 404 `/problems/not-found` (AC 5). Use the
  same membership check as `GET /apps/{appId}`. `total` = 2xx + 4xx + 5xx + other. `other` is
  1xx and 3xx, and the UI shows it only when it isn't 0.
- `GET /api/v1/admin/insights` → 200 `AdminInsights`
  `{ window: { from, to }, signups, activeApps, topApis[≤5]: { apiId, slug, name, calls }, timeToFirstCall: { targetSeconds: 600, medianSeconds, covered, total, developers[≤500] }, collection }`.
  Admins only: 401 when signed out, 403 `/problems/forbidden` for anyone else (AC 9).
  - Window: `from` = 00:00 UTC 29 days before today, `to` = now. Use it for sign-ups and usage
    alike.
  - Sign-ups: `user.role = 'developer'` and `created_at >= from`.
  - Top APIs: grouped by `usage_daily.service_id`, joined to `apis.gateway_service_id`. Order by
    calls desc, then slug. Unknown services are left out. `name` is the latest version's title.
  - Developers: newest `created_at` first. `secondsToFirstCall` = floor(first − signup).
  - Median: over the developers who have a first call. For an even count, average the two middle
    values and round down.
- `POST /api/v1/internal/usage/kong` (security `usageIngestToken`, Bearer). Body: one Kong log
  entry or an array (≤5000, ≤2 MB route `bodyLimit`).
  - 204 when accepted, and also for a duplicate batch.
  - 400 `/problems/validation` for a body that isn't an object or array. A field-level oddity in
    one entry drops that entry, not the batch.
  - 401 `/problems/unauthenticated` for a missing or wrong token. Compare with
    `crypto.timingSafeEqual` on equal-length digests.
  - 413 over the limit.
  - Exempt from session auth and the global per-IP limiter (Kong is one IP), never logged with
    its body, and not in the public catalog.
- `collection.status` (both GETs):
  - `unsupported` when `adapter.capabilities().usage` is false.
  - `not-configured` when there's no gateway or no `PORTAL_USAGE_INGEST_URL`.
  - `behind` when `last_received_at` is null or older than 5 minutes and collection was set up
    more than 5 minutes ago.
  - `ok` otherwise.
  - With `unsupported` or `not-configured`, usage numbers are null (AC 10). With `behind`, the
    stored numbers are returned unchanged (AC 6).

### Data model (`packages/db/src/schema.ts`, one migration via `drizzle-kit generate`)
- `usage_daily`:
  - Columns: `app_id uuid` FK `apps` **on delete cascade**; `day date` (UTC);
    `service_id text not null default ''` (Kong service ID, `''` when unknown); and
    `count_2xx`, `count_4xx`, `count_5xx`, `count_other` (`bigint`, mode number, default 0).
  - PK `(app_id, day, service_id)`. Index on `(day)` for insights and pruning.
  - Ingest aggregates a batch in memory, then runs one
    `INSERT … ON CONFLICT (app_id, day, service_id) DO UPDATE SET count_x = usage_daily.count_x + excluded.count_x`.
- `developer_first_calls`: `user_id uuid` PK FK `user` **on delete cascade**,
  `first_call_at timestamptz not null`, `app_id uuid` FK `apps` on delete set null, and
  `credential_id uuid` (no FK). Upsert with `first_call_at = least(existing, excluded)`, so
  batches that arrive out of order still keep the earliest call.
- `usage_collection`: singleton (`id smallint` = 1 with a check), `token_ciphertext text not null`
  (encrypted with `PORTAL_ENCRYPTION_KEY` like gateway tokens), `configured_at timestamptz`,
  `last_received_at timestamptz` and `last_heartbeat_at timestamptz`.
- `usage_ingest_batches`: `digest text` PK (SHA-256 hex of the raw body) and
  `received_at timestamptz` with an index. Insert with `ON CONFLICT DO NOTHING`. When nothing is
  inserted, the batch is a duplicate: answer 204 and don't count it.
- `credentials.created_by uuid` FK `user` on delete set null. The migration backfills it from
  `apps.created_by` for existing rows; hand-edit the generated SQL to add the `UPDATE`.
- Demo reset (AC 11): `reset-demo.sh` deletes developer users. Their apps' `usage_daily` rows go
  by cascade, and their `developer_first_calls` rows go with the user. The script doesn't change.

### Adapter calls (Kong), idempotency and failure handling
- **Per-app usage plugin.**
  - `PUT /plugins/{stableId('http-log', appId)}` with `consumer.id`, tags
    `portalTags(instanceId, app)` and config:
    - `http_endpoint`: the ingest URL.
    - `headers: { Authorization: "Bearer <token>" }`.
    - `content_type: application/json`, `timeout: 10000`, `keepalive: 60000`.
    - `queue: { max_batch_size: 200, max_coalescing_delay: 1, max_retry_time: 300 }`.
    - `custom_fields_by_lua: { request = "return {}", response = "return { status = kong.response.get_status() }" }`.
  - Written right after the consumer in `ensureConsumer`, before the key (ADR 0011).
  - A failed write is undone and surfaced like the other subscribe writes (ADR 0009 §6).
- **Heartbeat.** `ensureUsageCollection()` PUTs three objects, each with a stable ID and tagged
  `portalTags(instanceId)` plus `portal-internal`:
  - the service `portal-usage-heartbeat` (url `http://127.0.0.1:65535`, never reached);
  - the route `/__portal/usage-heartbeat/<instanceId>`;
  - on that route, `request-termination` (`status_code: 204`) and the same `http-log` config.
  It runs at startup and at the start of every `gateway-reconcile` run. A failure is logged as a
  finding and doesn't block the rest of reconcile. `listServices` already hides `portal-internal`
  services from the import list.
- **Reconcile.**
  - `applyAccessPolicy` lists `http-log` plugins tagged `portal-instance-<id>`.
  - It PUTs a plugin for every desired app whose plugin is missing or whose config differs
    (endpoint or token), and deletes any whose app isn't desired.
  - Each change is reported as `{ object: 'plugin', action }`.
  - Changing the ingest URL or token takes effect on the next reconcile run.
- **Parsing.** `parseUsageEvents(body)` accepts an object or an array, reads only the fields
  listed in the contract, and returns events. It drops:
  - entries without a consumer;
  - entries whose consumer username isn't `portal-app-<uuid>`;
  - entries with no numeric status.
  A heartbeat entry is recognized by the heartbeat route's ID. The server then:
  - drops events whose `appId` isn't an app;
  - drops events whose `credentialId` isn't a `credentials` row with that `app_id` (any status,
    so a call just before revocation still counts);
  - for a 2xx event, upserts `developer_first_calls` for `credentials.created_by`.
- **Heartbeat job.** `usage-heartbeat` is a pg-boss cron job (`* * * * *`) with a singleton key.
  It GETs `proxyInternalUrl + heartbeatPath` with a 5 s timeout. A failure is logged at warn and
  isn't retried; the next minute tries again. Any accepted batch, heartbeat or not, sets
  `last_received_at`.
- **Housekeeping job.** `usage-housekeeping` runs hourly. It deletes `usage_daily` rows older
  than the retention period and `usage_ingest_batches` rows older than 24 hours.
- **Token.** The first startup with a gateway creates the token: 32 random bytes, base64url,
  stored encrypted. It is never returned by any API and never logged.

### Risks and how to test them
- **A key or headers reach storage (AC 3).** In the Kong adapter's usage conformance test, a
  test receiver captures the raw body and asserts it doesn't contain the key, `apikey` or any
  request header names. A DB test asserts that `usage_daily` and `developer_first_calls` have
  only the columns listed above.
- **Kong refuses `custom_fields_by_lua`** (operator set `untrusted_lua = off`). The adapter
  surfaces a `usage-unavailable` finding and never writes an unredacted plugin. Cover this with a
  unit test using a mocked 400.
- **60-second freshness (AC 1).** Integration test against real Kong (Testcontainers): make 20
  calls, then poll `GET /apps/{id}/usage` until it reads 20, within 60 s.
- **Month boundary (AC 4).** Unit-test the period and bucketing with an injected clock. Seed
  `usage_daily` for the last day of the previous month and check it isn't counted. Bucketing uses
  Kong's `started_at`, not receipt time.
- **Double counting from Kong retries.** Unit test: posting the same body twice counts it once.
- **Behind vs empty (AC 6).** Integration test: stop the heartbeat, or set `last_received_at` to
  6 minutes ago. The response is `behind` with the stored counts, never 0.
- **Non-portal traffic (AC 3).** e2e or integration: send calls with no key, an unknown key and
  a revoked key. Counts don't change.
- **First-call attribution (AC 8).** Integration test: teammate B's key makes a 2xx call, and A
  still has no first call. A regenerates the key and makes a 2xx call, and A's first call is set.
  A 4xx call doesn't set it. A 2xx try-it call does.
- **Unsupported adapter (AC 10).** Server test with a stub adapter whose
  `capabilities().usage = false`. Both GETs return `unsupported` with null numbers.
- **Quickstart stays under five minutes.** Nothing new to start. `deploy/quickstart-smoke.mjs`
  makes one keyed call and asserts the app's usage reads ≥1 within 60 s.
- **Load on busy gateways.** Batches of up to 200 entries mean one SQL statement per batch.
  Record the cost in `deploy/README.md`. Ingest stays inside the 2 MB body limit.

### Tasks
- [x] [backend] adapter-sdk: `Capabilities.usage: boolean`, `UsageEvent`, `parseUsageEvents`,
      `ensureUsageCollection`, and the conformance `usage` test, including the
      no-key/unknown-key/revoked-key cases and the raw-body redaction assertion.
- [x] [backend] adapter-kong: consumer-scoped `http-log` in `ensureConsumer`, the heartbeat
      service, route and plugins in `ensureUsageCollection`, usage-plugin repair in
      `applyAccessPolicy`, and `parseUsageEvents`. The `custom_fields_by_lua` refusal becomes a
      `usage-unavailable` finding.
- [x] [backend] db: `usage_daily`, `developer_first_calls`, `usage_collection`,
      `usage_ingest_batches` and `credentials.created_by`. Generate one migration with drizzle-kit
      and hand-add the `created_by` backfill. Add a migration test.
- [x] [backend] server: the ingest route (token check, digest dedupe, aggregation upsert,
      first-call upsert, `last_received_at`), exempt from the session check and the per-IP limiter.
- [x] [backend] server: `GET /api/v1/apps/{appId}/usage` and `GET /api/v1/admin/insights`
      following the contract, including the `collection.status` rules, and set
      `credentials.created_by` on create and regenerate.
- [x] [backend] server: ingest token generation, `PORTAL_USAGE_INGEST_URL` and
      `PORTAL_USAGE_RETENTION_DAYS` config, the `usage-heartbeat` and `usage-housekeeping` jobs,
      and `ensureUsageCollection` at startup and in reconcile.
- [x] [backend] regenerate `packages/sdk`. Add `PORTAL_USAGE_INGEST_URL` to
      `deploy/docker-compose.yml`, `deploy/hosted/compose.yaml`, `deploy/production/compose.yaml`
      and the Helm values. Document both variables and the load note in `deploy/README.md`.
- [x] [frontend] app page usage card:
      - bar "20 of 1,000 calls", filled up to 100%, or the count with "No monthly limit";
      - 2xx/4xx/5xx counts, plus "Other" only when it isn't 0;
      - "Resets 1 Dec 2026, 00:00 UTC";
      - last-updated time, and a behind notice for `behind`;
      - "not available for this gateway" for `unsupported` or `not-configured`;
      - shown to every team role.
- [x] [frontend] admin Insights page:
      - sign-ups, active apps and top APIs, or "No calls yet";
      - median time to first call next to the 10-minute target and "N of M developers", or
        "No calls yet";
      - the developer list with "No call yet";
      - the unsupported state, and a 403 state with no data;
      - the navigation link shown to admins only.
- [x] [frontend] exclude `/api/v1/internal/*` from the portal's `/api/*` rewrite.
- [ ] [qa] AC 1, 4, 6: integration against Testcontainers Kong. 20 calls show 20 of 1,000
      within 60 s. Month bucketing with a seeded previous month. Behind state with stored counts.
- [ ] [qa] AC 2, 3: status-class split adds up to the total. No-key, unknown-key and revoked-key
      calls change nothing. Stored rows hold no key, header or body.
- [ ] [qa] AC 5, 9: 401, 404 and 403 problem+json on both GETs. A read-only member sees usage.
      The non-admin has no Insights link.
- [ ] [qa] AC 7, 8: insights totals, top-5 ordering and the empty state. First-call attribution
      (own key and a regenerated key count; a teammate's key, 4xx and 5xx don't; a 2xx try-it
      call does). The median and "N of M".
- [ ] [qa] AC 10: the Kong conformance usage test passes, and a stub unsupported adapter shows
      "not available" on both pages.
- [ ] [qa] AC 11 and the quickstart: the hosted-demo flow (visitor usage, insights 403, usage
      gone after `reset-demo.sh`), and `quickstart-smoke.mjs` asserts usage ≥1 within 60 s.

## UX  _(ui-designer)_
Design: [docs/design/011-usage-and-insights.md](../design/011-usage-and-insights.md). No new tokens.
- **App page:** a "Usage this month" card above the APIs card, for every team role. It shows
  "20 of 1,000 calls" with a meter capped at 100% (warning at 80%, quota reached at 100%, always
  with icon and words), 2xx/4xx/5xx tiles (plus "Other" only when non-zero), "Resets 1 Dec 2026,
  00:00 UTC" and the last-updated time. `quota: null` shows "No monthly limit" with no bar.
  `behind` keeps the stored counts under a "Usage may be behind" alert, and if nothing was ever
  received it shows no number instead of 0. `unsupported` and `not-configured` say "Usage isn't
  available for this gateway." The card refetches every 60 s while visible.
- **Admin Insights** (`/admin/insights`, new tab after Requests): new sign-ups, active apps and
  the median time to first call with a Within/Over target badge and "N of M developers"; the top
  five APIs or "No calls yet"; and a newest-first developer table with "No call yet", over-target
  markers and a cap footnote. It covers the behind, unavailable, error and 403 states (no data,
  **Go to My apps**). At 375px the stats stack and the table becomes one card per developer.

## Build notes  _(backend-developer, frontend-developer)_

- Backend: implemented redacted consumer-scoped Kong http-log collection, internal heartbeat setup and usage-plugin reconciliation, with `usage-unavailable` findings when Kong refuses the redacted plugin. Added the four usage tables and credential creator attribution in generated migration `0008_stale_the_anarchist.sql`, including the existing-credential backfill; ingest authenticates bearer tokens, deduplicates raw batches transactionally, aggregates by request UTC day and preserves earliest successful calls per credential creator. Both GETs follow the existing OpenAPI contract, including membership/admin checks, unavailable/null and behind/stored-count states; token encryption, minute heartbeats, hourly retention, deployment settings and regenerated SDK are complete.
- Backend validation: lint, typecheck and package tests passed for `@portal/adapter-sdk`, `@portal/adapter-kong`, `@portal/db`, `@portal/server` and `@portal/sdk` (Kong: 64 tests; database: 10; server: 304; SDK packages have no standalone tests). Real Kong conformance verifies raw-body redaction, invalid/revoked keys and reconciliation convergence; database tests verify creator backfill and cascade rules. Docker-dependent tests required elevated sandbox access; no workspace suite, browser or quickstart was run. The coordinator authorized explicitly staged backend/spec/log files after the mandatory whole-branch guard flagged prior-stage and concurrent frontend changes; those files were not restored or staged by backend.

- Frontend: implemented the app usage card with capped quota meter, UTC reset, status counts, unavailable/behind states and visible-tab minute/focus refresh; failures keep stored counts and show an alert after three consecutive background failures. Added responsive admin Insights with adoption/target metrics, top APIs, developer table/cards, admin-only navigation and a focused 403 screen; middleware permits the Insights permission screen while the generated client retains sign-in redirects. The portal runtime ingress rejects the internal namespace (including encoded segments), and the Vercel rewrite excludes it.
- Frontend validation: `pnpm --filter @portal/portal lint`, `typecheck`, and `test` pass (42 files, 363 tests); no browser, workspace suite or quickstart run. Existing key/plan tests isolate the independently tested usage card. The coordinator authorized committing explicitly staged frontend/spec/log paths after verifying ownership, because the whole-branch guard also flags other roles' shared changes and prior design commits; no out-of-scope files were edited or restored by frontend.

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/011.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/011.md`. The full report is `docs/uat/011/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/011.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR

### Follow-ups
- Error spikes per team — evaluate alerting when a team's 5xx rate is over 5% across 15 minutes with at least 50 requests.
