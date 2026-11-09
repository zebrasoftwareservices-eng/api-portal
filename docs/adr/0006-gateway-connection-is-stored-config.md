# ADR 0006 — The gateway connection is stored config, read on each request

- Status: Proposed (accept by merging)
- Date: 2026-11-07
- Spec: 005-setup-wizard-and-gateway-connections
- Changes: the startup wiring from spec 001, where `start()` built one `KongAdapter` from environment
  variables and passed it to every handler

## Context
Spec 005 lets an admin create the first account and connect, edit, disable or remove a Kong without
a restart, while GitOps installs keep working from environment variables. Later specs depend on
what's decided here: spec 006 relies on the environment path, spec 016 runs more than one server,
and spec 017 allows several gateways. A fresh install also has to refuse sign-ups safely before any
admin exists.

## Decision
1. **Postgres is the only place the running server reads the connection from.** Environment
   variables only write to the `gateways` row at startup. A request, or a background job, loads the
   row, decrypts the token and builds an adapter. Nothing is cached, because the adapter is a small
   object with no connection pool. An edit therefore applies on the next request, and every server
   replica sees it.
2. **`KONG_ADMIN_URL` is the one switch for environment management.** When it's set, startup writes
   the row with `managed_by = 'env'` and the API refuses to change it, because the next start would
   silently overwrite any edit. When it's unset, startup leaves the row alone, and a row left as
   `env` becomes `admin`, so removing the variable hands the connection to the admin screens.
3. **One gateway per install, enforced by a unique index.** The index is on a constant expression,
   so simultaneous adds can't both succeed. Spec 017 drops the index; the API already uses a
   `/gateways/{id}` collection, so it doesn't need new paths for that.
4. **The bundled Kong is recognised by a separate hint.** The default compose file sets
   `PORTAL_BUNDLED_KONG_ADMIN_URL=http://kong:8001`. It pre-fills the form and decides whether the
   sample can be offered, but it never creates a connection, so criterion 8 doesn't treat that Kong
   as environment-managed.
5. **The first admin is written directly, not through sign-up.** A single transaction, under the
   existing bootstrap advisory lock, checks that no admin exists and inserts the `user` row with
   `role = 'admin'` and its credential `account` row, using Better Auth's password hasher. A Better
   Auth `user.create.before` hook refuses every other user creation while no admin exists. The hook
   covers every route that creates a user, so the refusal doesn't depend on matching URL paths. No
   half-made admin can survive a crash. Environment bootstrap and the wizard share this code.
6. **The setup token exists only in memory.** Each production start without an admin generates 32
   random bytes and writes them to the log, under the narrow exception Elango recorded in spec 005.
   It's compared in constant time, and the "an admin exists" check makes it useless afterwards.
7. **The connection test only reads.** `GET /` proves it's Kong (`tagline`, `version`) and shows
   whether it can be written to (`configuration.database`, `configuration.role`). There's no write
   probe, because a test shouldn't leave anything in the operator's Kong, even briefly. A Kong that
   goes read-only for a reason `GET /` doesn't show, such as an expired Enterprise license, surfaces
   later as `/problems/gateway-rejected`.
8. **SSRF: block link-local and cloud metadata addresses, and allow private ones.** Kongs usually
   live on private networks, including the bundled one, so blocking RFC 1918 would break the main use
   case. The address is resolved and checked before the first request, redirects aren't followed,
   response bodies never reach a message and Test is limited to 30 requests per minute per admin.
   The endpoint is admin-only.
9. **Mark the protected Admin API service with a `portal-internal` tag.** The docs recipe puts this
   tag on its service. Discovery leaves out services carrying it, so nobody can publish the Admin API
   by accident.

## Consequences
- Every request that touches the gateway costs one more indexed read and one AES-GCM decrypt. Each
  already reads Postgres, so this doesn't matter at this scale.
- Saving a connection takes the same advisory lock that app creation and reconcile use, so a save
  can wait for a running reconcile to finish. No key or reconcile straddles two Kongs.
- A setup token doesn't work across replicas, because each process has its own. Setup needs a single
  server until spec 016 decides how to run several.
- DNS rebinding can get past decision 8 between the check and the request, and later requests aren't
  re-checked. An attacker would already need an admin account and control of the DNS name, so we
  accept this.
- Changing `PORTAL_ENCRYPTION_KEY` makes a stored token unreadable until an admin enters it again.
  Rotation stays out of scope; the server reports this clearly instead of failing health checks.
- `GatewayAdapter` gains `checkConnection` and `checkProxy`, which every later adapter implements.
- Writing `user` and `account` rows directly ties this code to Better Auth's schema, which the repo
  already generates. A Better Auth upgrade that changes those tables needs this code checked too, and
  a test signs in with the created admin to catch it.

## Alternatives rejected
- **Cache one adapter and swap it on save.** It's faster by a query, but every server replica and
  job would need invalidation, and a stale adapter would send a token to the wrong host.
- **Environment overrides the stored row silently.** An admin's edit would vanish on restart
  (Elango, spec 005).
- **Sign up through Better Auth, then promote to admin.** That's the current startup code. It isn't
  atomic, and sign-up would have to stay open while no admin exists.
- **A write probe in Test.** See decision 7.
- **Blocking all private addresses.** See decision 8.
