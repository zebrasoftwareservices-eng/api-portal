---
id: 022
title: Server robustness and authored path order
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
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
- [ ] Since spec 005, the first admin is created in the setup wizard. Does boot still create an admin
      anywhere (for example from environment variables in the quickstart), and so which code path
      does criterion 6 cover? — tech-lead
- [ ] Since specs 009 and 010, keys are created through subscriptions and access approvals. Do those
      paths also hold a transaction during Kong calls, and are they part of criterion 1, or only
      the original app and key creation paths? — tech-lead
- [ ] Storage for authored order: keep the raw document text beside `jsonb` (two columns), or
      switch to `json`/`text` only? This affects the migration size and spec 020 search, which may
      query `jsonb`. — tech-lead
- [ ] Should the seed skip at slug `sample` only when the API there wasn't created by the seed, or
      always skip once any API exists at that slug? — Elango
- [ ] The 20 × 1 MB numbers in criterion 7 are a test fixture, not a performance target. Does Elango
      want a response-time target for the catalog as well? — Elango
