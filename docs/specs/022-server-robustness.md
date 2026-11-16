---
id: 022
title: Server robustness and authored path order
status: review   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-15
linear: JSO-188
---

# 022 — Server robustness and authored path order

## Summary
Platform engineers and admins get a server that stays consistent when Kong or Postgres fails
mid-request or mid-boot, loads the catalog without reading every full OpenAPI document, and
shows each API reference in the order its author wrote the paths.

## Problem
The spec 001 code review (JSO-188) found server weaknesses that spec 003 cut out because they
need real Kong and Postgres integration work and touch key handling:

- App creation and key creation hold a database transaction open while they call Kong, so a slow
  Kong ties up a database connection and its locks for the whole call.
- When the database update after a Kong key revoke fails, reconcile reports `drift` for that key
  forever, even though Kong already has the right state.
- When compensation (undoing a Kong change after a later step fails) itself fails, the log drops the
  error, so an operator can't tell what went wrong or what is left in Kong.
- The boot seed can overwrite an API an admin published at slug `sample`.
- A crash part-way through admin creation leaves a partial admin that stops the next boot.
- The catalog list and the slug lookup load every API's full OpenAPI document, so they slow down
  as admins import more and larger APIs.

Separately, JSO-225 (covered by this spec, no separate feature issue): the API reference lists
operations in a different order from the OpenAPI document. The likely cause is that
`api_versions.document` is stored as `jsonb`, and Postgres `jsonb` doesn't keep object key order.
An API author can't control the order of their own reference. A fix needs a storage change and a
database migration that keeps existing rows working.

Solved when each item below has a passing automated test against real Kong and Postgres, and the
quickstart sample reference shows `/get`, `/post`, `/status/{code}`, `/uuid`, `/headers` in that
order. JSO-188 and JSO-225 both stay open until this spec merges.

## Users
- **Platform engineer** who runs the portal and reads its logs.
- **Portal admin** who publishes APIs and controls how their reference reads.
- **API consumer (developer)** who creates apps and keys and reads the reference.

## User stories
- As a platform engineer, I want app and key creation not to hold database transactions while
  Kong is slow, so that one slow gateway call doesn't starve the rest of the portal.
- As a platform engineer, I want reconcile to stop reporting drift once a revoked key is consistent
  again, so that drift warnings mean something real.
- As a platform engineer, I want failed compensation logged with its error and never with a key
  value, so that I can clean up Kong without leaking secrets.
- As a portal admin, I want my API at slug `sample` to survive a restart, so that the seed never
  replaces my work.
- As a platform engineer, I want the portal to boot after a crash during admin creation, so that
  one bad start doesn't need manual database repair.
- As a developer, I want the catalog to load quickly however many APIs there are, so that browsing
  stays fast.
- As a portal admin, I want the API reference to keep the path order of my OpenAPI document, so
  that I decide how my reference reads.

## Acceptance criteria
1. **Given** a running portal connected to Kong **When** a developer creates an app, or creates a
   key, and Kong takes several seconds to answer each call **Then** no database transaction stays
   open while the Kong call is in flight (checked in `pg_stat_activity` during the call), and the
   app or key is created as before.
2. **Given** a developer creating an app or a key **When** Kong returns an error or times out
   **Then** the request returns a problem+json error, no app or key row is left half-created in the
   database, and no credential the portal created in this request is left in Kong.
3. **Given** an active key **When** an admin or developer revokes it, Kong deletes the credential,
   and the database update that follows fails **Then** the next reconcile run brings the key row in
   line with Kong (revoked) and clears its `drift` flag, and a second reconcile run reports no drift
   for that key.
4. **Given** a key or app creation where a later step fails and the portal tries to undo its Kong
   change **When** that compensation call also fails **Then** the server logs one error entry that
   includes the error object (message and cause) and the IDs of the app, key and gateway object
   involved, and no log line contains a `pk_` key value.
5. **Given** an admin has published their own API at slug `sample` **When** the server restarts
   (including with the sample seed enabled) **Then** that API's title, document and versions are
   unchanged, and the boot log says the seed was skipped because the slug is taken.
6. **Given** a previous boot crashed after it created part of the admin account (for example the
   user row without its credential or role) **When** the server starts again **Then** boot
   completes, the portal serves requests, and there is exactly one admin account that can sign in
   (or the setup path to create one is available, if no usable admin exists).
7. **Given** a portal with at least 20 published APIs, each with an OpenAPI document of 1 MB or
   more **When** a developer opens the catalog list or an API page by slug **Then** the server
   answers without reading any full `document` column for the list, reads only the one requested
   API's document for its reference, and the list response matches what it returned before.
8. **Given** an imported or seeded OpenAPI document whose `paths` are not in alphabetical or
   key-length order **When** a developer opens its API reference **Then** the sidebar lists the
   operations in the document's authored order; for the quickstart sample that is `/get`, `/post`,
   `/status/{code}`, `/uuid`, `/headers`.
9. **Given** a database with existing `api_versions` rows written before this spec **When** the
   migration runs on upgrade **Then** it completes without error, every existing API still renders
   its reference, try-it still works, the spec download (spec 021) still returns a valid document,
   and re-importing a document stores its authored order.
10. **Given** the migration fails part-way (for example the database connection drops) **When** the
    server is restarted **Then** the migration either completed fully or left the old storage
    untouched, and the server boots and serves the existing APIs either way.

## Out of scope
- **JSO-188 items spec 003 already shipped**: the "Nothing was created" problem copy on revoke, the
  admin picker and try-it (`apps/server/src/problem.ts`); the generic 400 for titles with no ASCII
  letters (`import.ts` slugs); the API reference fetching the document twice and Scalar's Developer
  Tools toolbar (`reference.tsx`, JSO-172); `pnpm dev` binding to `HOSTNAME` (`ingress/start.ts`);
  and ticking spec 001's answered Open questions.
- **The allowlist** that JSO-188 groups with the catalog loads. Only the catalog list and slug lookup
  are in scope here; the allowlist can move with the follow-up below if the tech lead finds it costly.
- **New screens or API endpoints.** No user-visible change except the reference order and the
  absence of bad drift warnings.
- **Retry queues or a general outbox for gateway calls.** This spec fixes the named paths only.
- **Other gateways' adapters** (AWS and later). The fixes are in the server's Kong paths.
- **Letting admins reorder operations in the UI.** The document's authored order is the order.
- **Issues found after this spec is written.** They go to the spec where they were found or a new issue.

## Open questions
- [x] Since spec 005, the first admin is created in the setup wizard. Does boot still create an admin
      anywhere (for example from environment variables in the quickstart), and so which code path
      does criterion 6 cover? — tech-lead
      **Answer:** yes. `startup.ts` calls `createFirstAdmin` when `ADMIN_EMAIL` and `ADMIN_PASSWORD`
      are set and no admin exists. The quickstart compose passes both through. `createFirstAdmin`
      is already one transaction, so today's code can't leave a partial admin. Older installs or a
      manual repair can, though. Boot crashes when `ADMIN_EMAIL` already belongs to a user that isn't
      an admin, because only `setup-complete` is caught. And a role-`admin` row with no credential
      counts as "admin exists", which hides the setup wizard while nobody can sign in. Criterion 6
      covers the boot path and the shared `createFirstAdmin`, which the wizard also uses.
- [x] Since specs 009 and 010, keys are created through subscriptions and access approvals. Do those
      paths also hold a transaction during Kong calls, and are they part of criterion 1, or only
      the original app and key creation paths? — tech-lead
      **Answer:** yes. Admin subscription (`product-access.ts`, `POST` for a team) and approval
      (`access-requests.ts`) both call `provisionApp` inside a transaction. They are in scope,
      because the fix lands in `provisionApp`, which all of them share. Plan change, app delete,
      gateway switch, the seed and `revokeApps` keep their shape. That is recorded as a follow-up.
- [x] Storage for authored order: keep the raw document text beside `jsonb` (two columns), or
      switch to `json`/`text` only? This affects the migration size and spec 020 search, which may
      query `jsonb`. — tech-lead
      **Answer:** switch `api_versions.document` to Postgres `json` (ADR 0015). Search does not
      query `jsonb`; it parses documents in the server (ADR 0012). No SQL uses `jsonb` operators
      on `document`.
- [x] Should the seed skip at slug `sample` only when the API there wasn't created by the seed, or
      always skip once any API exists at that slug? — Elango
      **Default, pending Elango:** skip whenever an API at `sample` was not created by the seed.
      A seed-created one is refreshed. See "Seed" below for the one line to change if Elango
      picks "always skip".
- [x] The 20 × 1 MB numbers in criterion 7 are a test fixture, not a performance target. Does Elango
      want a response-time target for the catalog as well? — Elango
      **Default, pending Elango:** no response-time target. Criterion 7 stays a fixture-based test
      that checks which columns are read. A timing assertion can be added to the same test later.

## Technical design

### Components
- `apps/server` — app and key creation, key revoke, compensation logging, reconcile, seed, first
  admin, catalog queries.
- `packages/db` — `gateway_operations` table, `apis.seeded`, `api_versions.document` as `json`,
  one migration.
- `apps/server/openapi.yaml` — no new paths or schema changes. The document endpoints now say
  they keep authored key order.
- No portal (frontend) code changes. Scalar keeps document order by default, and
  `components/reference.tsx` sets no sorter.
- `GatewayUnavailableError` accepts `{ cause }`. Kong keeps the fetch error, `Error('Kong returned <status>')` on HTTP 5xx, and the JSON parse error. Calls stay idempotent and tagged (ADR 0002).

### 1. Kong calls outside transactions (criteria 1, 2) — ADR 0014
New `apps/server/src/gateway-operation.ts`:
- `beginOperation(tx, { kind, appId, credentialId?, gatewayId })` inserts a `gateway_operations` row.
- `endOperation(db, id)` deletes it.

Each path runs as prepare → gateway → commit:

| Path | Prepare (short tx) | Gateway (no tx) | Commit (short tx) |
| --- | --- | --- | --- |
| `POST /v1/apps` | today's locks and checks, `create-app` op with `credentialId` | `ensureConsumer`, `grantAccess` × services, `applyPlanLimits` (if not builtin), `issueCredential` | same locks and checks again, insert app, subscriptions, `gateway_consumers` and credential, delete op |
| `POST /v1/apps/{appId}/credentials` | access, app active, key limit, `issue-credential` op | `ensureConsumer`, `grantAccess`, `applyPlanLimits`, `issueCredential` | app still active, key limit again, upsert `gateway_consumers`, insert credential, `keyIssued`, delete op |
| admin subscription (`product-access.ts`) | today's checks via `provisionApp` prepare, `create-app` op | `provisionApp` gateway calls | checks again, inserts, delete op |
| access approval (`access-requests.ts`) | same as above, plus the request row stays `pending` | same | request → `approved`, inserts, delete op |
| `DELETE /v1/apps/{appId}/credentials/{id}` | access, key active, `revoke-credential` op | `revokeCredential` | key → `revoked`, delete op |

- Split `provisionApp` into `prepareApp(tx, …) → AppPlan` (checks only, no writes except the op),
  `applyAppToGateway(adapter, plan, rollback)` and `commitApp(tx, plan)`. `commitApp` calls the
  same check function as `prepareApp`.
- In commit, re-load the gateway with `connection.load(tx)`. If its id differs from the
  prepared `gatewayId`, or it is disabled, throw `409 gateway-changed`. The existing problem type
  for a disabled gateway is reused if one exists. The adapter used in step 2 then compensates.
- Name races: two creates can both pass prepare. Commit holds the team+name advisory lock and
  re-checks, so the loser gets `409 app-name-taken` and compensates.
- Failure in gateway or commit runs `compensate(rollback, log)` outside any transaction, then
  `endOperation`. Exception: a revoke whose commit fails keeps its op for reconcile.
- No transaction is open during step 2. Criterion 1 is checked in `pg_stat_activity` while Kong
  is delayed: no portal session is `idle in transaction`, and none has an `xact_start` older than
  one second.

### 2. Reconcile and revoke (criterion 3)
`reconcile()` loads `gateway_operations` once. Let `recent` be ops younger than
`PENDING_OPERATION_GRACE_MS = 10 * 60_000`.
- Owned consumer whose app is not active: skip if a `recent` op has that `appId`, else delete
  (today's rule).
- Kong key with no row or a revoked row: skip if a `recent` op has that `credentialId`, else
  revoke (today's rule).
- Active row missing from Kong: if a `revoke-credential` op exists for it (any age), set
  `status = 'revoked'`, `revokedAt = now()`, delete the op, and do not warn. Otherwise warn
  `drift: active credential missing from gateway` (today's rule).
- Stale `revoke-credential` op (older than grace) whose key is still in Kong: `revokeCredential`,
  then the update above.
- After the rules run, delete ops older than the grace period.
- `reconcile()` returns `{ drift: { credentialIds: string[] } }` so tests can check
  "a second run reports no drift" without parsing logs. The `drift` "flag" in criterion 3 is this
  report and the warning. There is no drift column, and none is added.

### 3. Compensation logging (criterion 4)
- `compensate(operations, log)` takes entries of
  `{ appId, credentialId?, gatewayId, gatewayObject: { consumer?: string; credential?: string }, run }`.
- A failure logs once, at error level:
  `log.error({ err: redactSecrets(error), appId, credentialId, gatewayId, gatewayObject }, 'Gateway compensation failed; reconcile will retry')`.
- The `POST …/credentials` catch block, which logs a warning without the error, uses `compensate()` too.
- New `apps/server/src/log-safety.ts` exports `redactSecrets(error)`. It returns a plain
  `{ type, message, stack, cause }` copy, recursing into `cause` up to depth 5. Every string
  matching `/pk_[A-Za-z0-9_-]+/g` becomes `pk_[redacted]`. Kong error bodies can echo the key,
  so this runs on every compensation error.
- The Fastify logger uses pino's `stdSerializers.errWithCause` for `err`, so `cause` shows up in
  the log line.

### 4. Seed at slug `sample` (criterion 5)
- New column `apis.seeded boolean not null default false`. The migration backfills
  `seeded = true` where `slug = 'sample' and gateway_service_name = 'portal-sample' and created_by is null`.
- `seedSample` checks first: if a row at `sample` exists and `seeded = false`, it logs
  `info` `Sample seed skipped: slug "sample" is taken by an admin-published API` and returns
  before any Kong call.
- The upsert gets a guard, `onConflictDoUpdate({ target: apis.slug, set, where: eq(apis.seeded, true) })`,
  with `seeded: true` on insert. If `returning()` is empty, an admin published at `sample`
  between the check and the insert. Then it logs the same skip line and rolls back. The version
  upsert runs only after the API upsert returns a seeded row.
- A seed-created row is refreshed on boot: service ids and the `1.0.0` document. That also
  rewrites the sample's document in authored order on upgraded quickstarts (criterion 8).
- **If Elango picks "always skip":** replace the first check with "any row at `sample` → skip" and
  drop the refresh. The guard in the upsert stays. The column and tests stay.

### 5. First admin after a crash (criterion 6)
In `setup.ts`, a **usable admin** is a `user` with `role = 'admin'` that has an `account` row with
`provider_id = 'credential'` and a non-null `password`.
- `adminExists(db)` means a usable admin exists. It is used by boot, `GET /v1/setup`,
  `prepareSetupToken` and the `createFirstAdmin` guard. A partial admin no longer hides the wizard.
- In `createFirstAdmin`, when a `user` with the requested email exists **without** a credential
  account, it is a partial row from a crashed start. Complete it in the same transaction: set
  `role = 'admin'`, `emailVerified = true`, `name`, insert the credential account, and delete
  setup tokens. If the user has a credential account, keep today's `400 validation` (email taken).
- Boot in `startup.ts`: any `Problem` from `createFirstAdmin` is logged with `warn`
  `First admin from ADMIN_EMAIL not created: <title>` and boot continues. The wizard stays
  available while there is no usable admin. A non-`Problem` error still stops boot.
- Exactly one usable admin: the advisory lock `71833003` and the usable-admin guard run in the
  same transaction as the completion, so two boots can't both complete it.

### 6. Catalog without full documents (criterion 7)
- `publishedApis(db, viewer?, options?: { slug?: string; documents?: boolean })` selects explicit
  version columns (`id, apiId, version, title, description, publishedAt, sourceFormat`). It does
  not select `document`, `source_content`, `lint_warnings` or `change_summary` unless
  `documents: true`. `slug` adds `where apis.slug = $1` in SQL.
- `loadDocument(db, versionId)` reads one `document`.
- Callers:

| Caller | Change |
| --- | --- |
| `GET /v1/apis` | no documents |
| `GET /v1/apis/{slug}` | `slug` filter; `apiDetail` selects version columns without `document` |
| `GET /v1/apis/{slug}/openapi.json`, `versions.ts`, spec download, `agent-docs` per-API | `slug` filter, then `loadDocument` for one version |
| `proxy.ts` | resolve target on rows without documents, then `loadDocument` for that one row's components |
| `products.ts`, `gateways.ts`, `import.ts` | no documents (they use summary fields) |
| `search.ts`, `llms.txt` / `agent-docs` site-wide | `documents: true` (spec 020 behavior, out of scope) |

- The `PublishedApi` type keeps its shape minus `version.document`. Code that needs the document
  takes it as an argument.
- Test: a Drizzle `logger` passed in the integration test records SQL. The list request runs no
  statement that selects `"document"`. The slug page selects `"document"` for exactly one row.
  `connect(url, { logger })` takes an optional logger for that.

### 7. Authored path order (criteria 8, 9, 10) — ADR 0015
- `api_versions.document` becomes `json('document').$type<Record<string, unknown>>().notNull()`.
- Writers are unchanged (import, versions, seed). `yaml.parse` and the bundler keep key order,
  and Drizzle's `JSON.stringify` keeps insertion order.
- Old rows keep their `jsonb` order. Re-import stores authored order. The seed refresh fixes the
  quickstart sample.
- The migration runs in the migrator's transaction (criterion 10). Test it by killing the
  connection mid-migration with `pg_terminate_backend` from a second session on a database with
  pre-022 rows. Then restart and check the column type and that the APIs render.

### Data model (one migration, `pnpm --filter @portal/db exec drizzle-kit generate`)
```sql
create table gateway_operations (
  id uuid primary key,
  kind text not null check (kind in ('create-app','issue-credential','revoke-credential')),
  app_id uuid not null,            -- no FK: the app row may not exist yet
  credential_id uuid,
  gateway_id uuid not null references gateways(id) on delete cascade,
  started_at timestamptz not null default now()
);
create index gateway_operation_started_idx on gateway_operations (started_at);
alter table apis add column seeded boolean not null default false;
update apis set seeded = true
  where slug = 'sample' and gateway_service_name = 'portal-sample' and created_by is null;
alter table api_versions alter column document type json using document::json;
```
Drizzle-kit may not write the `update` or the `using` clause. Edit the generated SQL by hand to
match, and keep the snapshot in step.

### API contract
No new endpoints, request fields or response fields. `getApiDocument` and `getApiVersionDocument`
now say they keep authored key order. Error cases on the changed paths stay what they are today:
`409 app-name-taken`, `409 credential-limit`, `409 app-revoked` and gateway `502/503` problems. Commit
can now also return those 409s after a race, and `409 gateway-changed` when the gateway was
switched mid-request. All are problem+json.

### Risks and how to test them
- **Reconcile deletes an in-flight consumer.** Integration test: delay Kong, run `reconcile()`
  during step 2, and check that the app and key are created and still work through Kong.
- **Slow Kong in tests.** A small HTTP delay proxy in front of the Kong Admin API in the Testcontainers
  setup (Node `http`, no new dependency). Point the gateway connection at it.
- **Forcing a DB failure after a Kong revoke (criterion 3).** In the test, create a Postgres trigger
  on `credentials` that raises on update for the target id, revoke, drop the trigger, then run reconcile twice.
- **Compensation failure (criterion 4).** Make the delay proxy return 500 for `DELETE` on the
  consumer after a forced commit failure (a name collision), and capture logger output.
- **Integer-like keys reorder.** This is documented, not a bug.
- **Migration lock time.** `api_versions` is rewritten at boot. That is acceptable for
  self-hosted sizes and is noted in the ADR.

### Follow-ups
- Move plan change, app delete, gateway switch, seed and `revokeApps` Kong calls to the
  prepare → gateway → commit pattern.
- The allowlist load, if profiling shows it is costly (out of scope above).

### Tasks
- [x] [backend] Migration and schema: `gateway_operations`, `apis.seeded` with backfill, `api_versions.document` → `json` (§Data model, ADR 0015)
- [x] [backend] `gateway-operation.ts` and the prepare → gateway → commit split of `provisionApp`; apply to `POST /v1/apps`, admin subscription and access approval (§1)
- [x] [backend] `POST /v1/apps/{appId}/credentials` and key revoke on prepare → gateway → commit (§1)
- [x] [backend] Reconcile: in-flight op grace, finishing revoke ops, stale op cleanup, `{ drift }` return value (§2)
- [x] [backend] `log-safety.ts` `redactSecrets`, error-level `compensate()` with ids and `err`, `errWithCause` serializer (§3)
- [x] [backend] Seed guard and refresh for seed-created `sample` and the skip log line (§4)
- [x] [backend] Usable-admin check, completing a partial admin, boot continues after a `Problem` (§5)
- [x] [backend] `publishedApis` without documents, `slug` filter, `loadDocument`; update callers; optional `logger` in `connect` (§6)
- [x] [qa] Criterion 1: Kong delayed by the proxy, `pg_stat_activity` shows no open portal transaction during the call, for app create, key create, admin subscription and approval
- [x] [qa] Criterion 2: Kong error and timeout on create → problem+json, no app or key row, no consumer or key left in Kong (check Kong by tag)
- [x] [qa] Criterion 3: trigger-forced update failure after a Kong revoke, reconcile run twice, row revoked and no drift on the second run
- [x] [qa] Criterion 4: compensation failure logs one error entry with `err.message`, `err.cause` and app, key and gateway ids; no log line matches `pk_[A-Za-z0-9_-]{8,}`
- [x] [qa] Reconcile during an in-flight create does not delete the new consumer or key
- [x] [qa] Criterion 5: admin API at `sample`, restart with `SEED_SAMPLE=true`, API unchanged, skip line logged; seed-created sample still refreshed
- [x] [qa] Criterion 6: user row with `ADMIN_EMAIL` and no credential → boot completes and admin signs in; role-admin row without credential → wizard available; exactly one usable admin
- [x] [qa] Criterion 7: 20 APIs × 1 MB fixture, SQL logger shows no `document` in the list and one in the slug page; list response equal to the pre-change snapshot
- [x] [qa] Criteria 8, 9: quickstart sample sidebar order `/get`, `/post`, `/status/{code}`, `/uuid`, `/headers` (Playwright); pre-022 rows still render, try-it works, spec download valid, re-import stores authored order
- [x] [qa] Criterion 10: connection killed mid-migration → restart boots, column is `json` or untouched `jsonb`, APIs serve
- [x] [qa] `docker compose up` quickstart still works on a fresh volume and on an upgraded pre-022 volume
- [x] [backend] Fix (review): keep the underlying error as `cause` on `GatewayUnavailableError` (`packages/adapter-sdk/src/index.ts:109`, thrown at `packages/adapter-kong/src/index.ts:91-101`), and assert `err.cause` in the criterion 4 test (`apps/server/src/server-robustness.test.ts:779`)

## Build notes

- Migration `0009_gateway_operations` adds `gateway_operations`, `apis.seeded` (backfill where slug is `sample`, service is `portal-sample`, and `created_by` is null), and changes `api_versions.document` to `json` with `USING document::json`.
- App create, key issue, admin subscription, and an access approval that creates an app run prepare → gateway → commit. A name collision, or a gateway that is replaced or disabled during the Kong call, returns 409 and compensates. Two creates can both call Kong; the loser compensates. Key revoke uses the same split, keeps the operation when commit fails, and still completes when that same gateway is disabled. `reconcile()` returns `{ drift: { credentialIds } }`, skips ops younger than 10 minutes, and finishes a stale revoke.
- A compensation failure logs one error, `Gateway compensation failed; reconcile will retry`, with `err` (message and cause; every `pk_` value becomes `pk_[redacted]`), `appId`, `credentialId`, `gatewayId`, and `gatewayObject`.
- `GatewayUnavailableError` takes `{ cause }`. A fetch or JSON parse failure keeps that error, and an HTTP 5xx keeps `Error('Kong returned <status>')` with no response body. Criterion 4 asserts `err.cause.message` is `Kong returned 500` when the consumer delete fails.
- Seed logs `Sample seed skipped: slug "sample" is taken by an admin-published API` and makes no Kong call when `seeded` is false, and refreshes a seed-created sample. A user at the admin email with no credential account is completed; a role-admin without a credential account still sees the wizard. A `Problem` from `ADMIN_EMAIL` logs `First admin from ADMIN_EMAIL not created: <title>` and boot continues. Catalog list and summary callers omit `document`; search and `llms.txt` pass `{ documents: true }`, and one document is loaded with `loadDocument`. `connect(url, { logger })` accepts a Drizzle logger. Plan change, app delete, gateway switch, seed, and `revokeApps` still call Kong inside a transaction.

## Test report

Commit tested: `05a4be00e3ce0cec145983c320a784e9c42972ab` · Portal: http://localhost:3005

| Criterion | Test file | Result |
| --- | --- | --- |
| 1. No open transaction while Kong is slow, on app create, key create, admin subscription, and approval | `apps/server/src/server-robustness.test.ts` | pass |
| 2. Kong error and timeout return problem+json and leave no app, key, or tagged Kong consumer | `apps/server/src/server-robustness.test.ts` | pass |
| 3. A failed revoke update is finished by the next reconcile, and a second reconcile reports no drift for that key | `apps/server/src/server-robustness.test.ts` | pass |
| 4. One compensation error, with `err.message`, `err.cause` (`Kong returned 500`), ids, and no `pk_` secret in the log | `apps/server/src/server-robustness.test.ts` | pass |
| Reconcile during an in-flight create does not delete the new consumer | `apps/server/src/server-robustness.test.ts` | pass |
| 5. An admin-published `sample` is skipped with the skip log and no Kong call; a seed-created sample is refreshed in authored order | `apps/server/src/server-robustness.test.ts` | pass |
| 6. A partial admin is completed and can sign in; a role without a credential keeps the wizard; exactly one usable admin | `apps/server/src/server-robustness-migration.test.ts` | pass |
| 7. Twenty 1 MB documents: the list and slug page do not select `document`; the reference selects it once | `apps/server/src/server-robustness.test.ts` | pass |
| 8. Quickstart sample sidebar order is `/get`, `/post`, `/status/{code}`, `/uuid`, `/headers` | `deploy/e2e/authored-order.test.ts` | pass |
| 9. Pre-022 rows still render; try-it works; spec download is valid JSON; re-import stores authored order | `apps/server/src/server-robustness-migration.test.ts`, `apps/server/src/server-robustness.test.ts` | pass |
| 10. Killing the connection mid-migration leaves `jsonb` and no `gateway_operations`; the next boot migrates and serves the API | `apps/server/src/server-robustness-migration.test.ts` | pass |
| Failure paths: invalid input, missing session, expired session, missing permission, duplicate name, unreachable gateway, gateway disabled during the Kong call | `apps/server/src/server-robustness.test.ts` | pass |
| Fresh compose volume | `apps/portal/e2e/setup-gateways.test.ts` | pass: `/` redirects to `/setup`, catalog empty |
| Seeded compose quickstart, left up | `deploy/e2e/quickstart.spec.ts` | pass |

`pnpm lint`, `pnpm typecheck`, and `pnpm test` passed (346 tests in `@portal/server`). `pnpm test:e2e` ran 105 tests against http://localhost:3005: 103 passed and 2 skipped. The crossed results for JSO-399, JSO-405, JSO-406, the Node.js snippet case, and the homepage outage case are the existing `test.fail` markers, and they failed as marked. The stack at http://localhost:3005 is still up. The sample API is seeded, and its paths are `/get`, `/post`, `/status/{code}`, `/uuid`, `/headers`.

## User testing

Portal http://localhost:3005 at `4b1d534f1a4c233bef42ca70d34bc4487a3ac808`. Notes: `docs/uat/022/report.md`.

| User story | Result | Evidence |
| --- | --- | --- |
| App and key creation stays usable while Kong is slow | pass | Created "UAT sample reader". The app page showed "● Active". |
| Reconcile stops reporting drift once a key is consistent | pass | Admin Gateways showed "● Connected". The word drift was not on that screen. |
| Failed compensation is logged with its error and no key value | pass | Server log: "Gateway compensation failed; reconcile will retry", cause "fetch failed". No `pk_` line. |
| An API at slug `sample` survives a restart | pass | Admin row "sample", "1.0.0", "http://localhost:18005/sample". |
| The portal boots and an admin can sign in | pass | Sign-in landed on "My apps". |
| The catalog stays fast to browse | pass | Heading "APIs". Sample page heading "Sample HTTP API". |
| The reference keeps the authored path order | pass | Sidebar: Inspect a GET request, Inspect a POST request, Return an HTTP status, Generate a UUID, Inspect request headers. |

A 390×844 pass and a Tab, Enter, and Escape pass both reached that sidebar order. Try-it on GET /get showed "200 OK".

### Bugs

- [x] Compensation error log has no `err.cause` (minor). One error is logged, `Gateway compensation failed; reconcile will retry`, with `err.message` "The API gateway is unavailable", `appId`, `credentialId`, `gatewayId`, and `gatewayObject`. No log line matches `pk_[A-Za-z0-9_-]{8,}`. `GatewayUnavailableError` does not keep the underlying fetch or HTTP error as `cause`.

## Review

Commit reviewed: `5521f4a` (code unchanged since the tested `1c3fd9d`; the suite was not re-run).

**Blocking**
- Criterion 4 is not met: the compensation log has no `err.cause`. `redactSecrets` copies `cause` and the logger uses `errWithCause`, but `GatewayUnavailableError` (`packages/adapter-sdk/src/index.ts:109`) takes no cause, and `KongAdapter.request` drops the fetch error and the 5xx status (`packages/adapter-kong/src/index.ts:91-101`). For a Kong outage, the most common compensation failure, the operator sees only "The API gateway is unavailable" and can't tell a refused connection from a timeout or a 500. Fix: accept `{ cause }` in the constructor (`super(message, { cause })`), pass the caught error at line 92, an `Error('Kong returned <status>')` at line 95 and the parse error at line 101. The criterion 4 test at `apps/server/src/server-robustness.test.ts:779` must also assert `err.cause`. The design said "no adapter changes"; that was a gap in the design, and this is a constructor option only. It closes the open minor in Bugs.

**Suggestions**
- `apps/server/src/apps.ts:405-490` (key create) and `apps/server/src/apps.ts:495-560` (key revoke) repeat the compensate-and-end-operation cleanup from `runGatewayPhase` (`apps/server/src/app-provisioning.ts:205-230`). Key create could use `runGatewayPhase` directly; revoke needs its `keepOperationOnCommitFailure` option.
- `apps/server/src/app.ts:35-49` reaches pino through `createRequire(fastify)`. That works but depends on fastify's install layout. A direct `pino` dependency, pinned to the version fastify uses, is simpler.
- `apps/server/src/reconcile.ts` still calls Kong inside its transaction. That is already listed under Follow-ups.

Checked and fine: prepare → gateway → commit on app create, key create, admin subscription, subscribe approval and revoke; commit re-checks name, key limit and gateway; in-flight ops protect consumers and keys from reconcile; revoke ops are finished by reconcile; problem+json throughout; no `pk_` in logs; seed guard and skip line; usable-admin check and partial-admin completion; catalog list without `document`; migration in one transaction with backfill and `USING document::json`; contract note in `openapi.yaml`; quickstart passed in the Test report.
