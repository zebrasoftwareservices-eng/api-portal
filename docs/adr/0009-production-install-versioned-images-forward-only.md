# ADR 0009 — Production install: versioned GHCR images, forward-only migrations, setup token in the database

- Status: Proposed (accept by merging)
- Date: 2026-11-13
- Spec: 016-production-install-helm

## Context
Until spec 016 the only install is the evaluation stack (`deploy/docker-compose.yml`), built from
source with `NODE_ENV=development`. There are no tags, no published images and no upgrade or
rollback story. Three choices made for spec 016 will outlive it, so they are recorded here:
how releases are versioned and shipped, what rollback means, and where the first-admin setup
token lives once more than one server process can exist.

Drizzle's migrator applies local migrations newer than the last applied one and silently does
nothing when the database already has migrations the image does not know. An old image started
on an upgraded database would therefore run against a schema it was not written for.

Spec 005 minted a new setup token in memory on every start. With two replicas, each prints a
different token and a claim only works on the pod that printed it (JSO-378).

## Decision
1. **Releases are git tags `vX.Y.Z` (optionally `-pre.N`).** A tag push runs
   `.github/workflows/release.yml`, which builds `apps/server/Dockerfile` and
   `apps/portal/Dockerfile` and pushes `ghcr.io/zebrasoftwareservices-eng/api-portal-server:X.Y.Z`
   and `…/api-portal-portal:X.Y.Z`. No `latest`, no floating `X.Y` or `X` tags: an operator always
   names an exact version. The image carries `PORTAL_VERSION=X.Y.Z`, reported by
   `GET /api/v1/health`. Package visibility is never changed by CI.
2. **Migrations stay forward-only. Rollback is restore plus the previous tag.** Before migrating,
   the server compares `drizzle.__drizzle_migrations` with the journal baked into the image. If
   the database holds a migration the image does not contain, the server exits non-zero before
   any write and logs the rollback steps. There are no down migrations and `helm rollback` is not
   a supported rollback.
3. **The setup token is one encrypted database row.** `setup_tokens` is a singleton table
   (`id = 1`), created at start under the setup advisory lock while no admin exists, encrypted
   with `PORTAL_ENCRYPTION_KEY` (the same AES-GCM helper as gateway credentials). Every replica
   and every restart decrypts and prints the same token. The claim reads the row inside the claim
   transaction and deletes it on success. No Kubernetes Secret or file holds the token.
4. **Secrets can come from files.** Every secret setting `X` also accepts `X_FILE` (a path whose
   trimmed contents are the value), the convention the official Postgres image already uses.
   `DATABASE_PASSWORD` / `DATABASE_PASSWORD_FILE` fill the password of a `DATABASE_URL` that has
   none, so the password is never written into a URL in an env file.

## Consequences
- An operator can pin, audit and roll back to an exact image. Upgrades are "back up, change the
  tag, start"; rollbacks are "stop, restore, start the old tag", and the guide says exactly that.
- The schema-ahead guard protects rollbacks only to images that contain it. The first such image
  is the first release after spec 016 merges; rolling back to anything older relies on the
  operator restoring first, as the guide says.
- A leaked setup-token log line stays valid until the admin is claimed, including across
  restarts. This is weaker than spec 005's per-start token and is accepted because the window
  closes at the first claim and the token never leaves the database or the logs.
- Rotating `PORTAL_ENCRYPTION_KEY` before setup makes the stored token undecryptable; the server
  then replaces the row and prints the new token.
- Backups must include the secrets directory or Secret holding `PORTAL_ENCRYPTION_KEY`; a
  database dump without the key cannot decrypt stored gateway credentials.
