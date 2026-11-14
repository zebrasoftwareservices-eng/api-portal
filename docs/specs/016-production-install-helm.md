---
id: 016
title: Production install — hardened Compose, Helm chart, backups and upgrades
status: designed   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-13
linear: JSO-244
---

# 016 — Production install: hardened Compose, Helm chart, backups and upgrades

## Summary
A platform engineer installs the portal on a company server (Docker Compose on a Linux VM, or
Helm on Kubernetes) from versioned images, keeps it backed up, and upgrades or rolls back
without losing data.

## Problem
Today the only install is `deploy/docker-compose.yml`, the evaluation stack. The README tells
readers not to expose it: it runs with `NODE_ENV=development`, builds from source and bundles
Kong. `deploy/hosted/` is hardened, but it is the ZSS demo and its backup exists to wipe visitor
data. There are no git tags, no GitHub releases and no image-publish workflow (spec 005's test
report; `gh release list` is empty, `.github/workflows/` has only `ci.yml`). So a company that
wants to run the portal for real has no supported way to install it, back it up, or upgrade it,
and no proof that an upgrade keeps its developers' apps and keys.

It is solved when (from JSO-244 and the Sprint 7 demo in `docs/roadmap.md`):
- someone with repo access installs the portal on a clean Ubuntu 26.04 LTS VM from the guide in
  under 30 minutes;
- upgrading from the previous release tag keeps all data;
- the Helm chart passes a smoke test on a throwaway Kubernetes cluster in CI.

Evidence and sources: [`docs/research/JSO-244.md`](../research/JSO-244.md). Similar products split
evaluation and production installs the same way: Docker for proof of concept, a separate
production path ([Tyk](https://tyk.io/docs/tyk-self-managed/tyk-helm-chart/)); pinned image tags
and forward-only migrations, so rollback is not `helm rollback`
([Gravitee](https://documentation.gravitee.io/apim/self-hosted-installation-guides/kubernetes));
bundled chart Postgres only for temporary environments
([Kong charts](https://github.com/Kong/charts/blob/main/charts/kong/README.md)); a single portal
instance plus a database is a legitimate production shape, the gateway stays outside, and the
operator sets the public base URL
([WSO2 API Portal](https://wso2.com/bijira/docs/api-portal/1.0.0/deployment/overview/)).

## Users
- **Platform engineer** — installs, backs up, upgrades and rolls back the portal on company
  infrastructure, and connects it to a Kong they already run.
- **Portal admin** — claims the first admin on a production install (spec 005's setup token)
  and relies on data surviving upgrades.
- **API consumer (developer)** — indirectly: their apps and keys must survive upgrades and restores.

## User stories
- As a platform engineer, I want a production Compose file that pulls pinned images, takes
  secrets from an env file or files, and sits behind my TLS reverse proxy, so that I can run the
  portal on a company VM without building from source or exposing the database.
- As a platform engineer, I want versioned server and portal images on GitHub Container Registry,
  so that I know exactly what I run and can go back to it.
- As a platform engineer, I want a documented backup, restore and rollback, so that a bad upgrade
  or a lost disk does not lose my developers' apps and keys.
- As a platform engineer on Kubernetes, I want a Helm chart with health and readiness probes and
  an option to use my own PostgreSQL, so that the portal fits how my cluster already runs.
- As a portal admin on a chart with more than one server replica, I want the setup token from any
  replica's log to work, so that I can claim the first admin whichever pod serves me (JSO-378).
- As a platform engineer, I want an old image started against a newer database to stop with a
  pointer to the rollback steps, so that a wrong rollback cannot damage the data.

## Acceptance criteria
1. **Given** a clean Ubuntu 26.04 LTS VM with Docker Engine and Compose v2, a Kong the company
   already runs, and access to this repo's GHCR packages, **When** a person follows the install
   guide using the production Compose file, secrets supplied as files, and the guide's Caddy
   reverse proxy example, **Then** within 30 minutes the portal is served over HTTPS at the configured
   public URL, the server runs with `NODE_ENV=production`, Postgres and the server API are not
   published on any host port, no sample API is seeded, no Kong container runs, and the admin can
   claim the install with the setup token and connect the existing Kong.
2. **Given** the production Compose file **When** it is started with a required secret missing
   (for example the database password or `PORTAL_ENCRYPTION_KEY`, from neither env nor file),
   **Then** the server exits non-zero before serving any request, and its log names the missing
   setting without printing any secret value.
3. **Given** a version tag is pushed to the repo **When** the release workflow finishes, **Then**
   the server and portal images are published to GHCR tagged with exactly that version, the
   packages stay private, and no `latest` tag is pushed or moved.
4. **Given** a baseline server image built in CI from `origin/main`, running with data (an admin,
   a published API, a developer, an app with a key) **When** the server image built from this
   branch is started against the same database volume, **Then** migrations apply on start, the
   admin and developer can sign in, and the API, app and key are all still listed. This runs in
   CI and needs no published tag. The guide describes the same steps for a real upgrade: the
   previous published tag, then the new tag.
5. **Given** a running production install with data **When** the operator runs the documented
   backup command, deletes an app, then runs the documented restore command with that backup,
   **Then** the deleted app is back, every other record matches the backup, and the backup step
   itself changed no data.
6. **Given** an install upgraded to the new tag, and a backup taken before the upgrade **When** the
   operator follows the guide's rollback (stop, restore the pre-upgrade backup, start the previous
   tag), **Then** the previous version runs and shows the pre-upgrade data.
7. **Given** a throwaway kind cluster in CI on kind's Kubernetes 1.37 node image, and a chart whose
   `Chart.yaml` declares `kubeVersion` for 1.37 only, **When** the chart is installed with Helm 3
   and default values, **Then** the portal, server and Postgres pods
   become Ready, the portal answers through its Service, every container runs as a non-root user,
   and the release creates no Kong, cert-manager or ingress-controller resources.
8. **Given** the Helm chart **When** it is installed with an external database URL value, **Then**
   no Postgres pod is created and the server becomes Ready against that database; **and when** it
   is installed with ingress enabled but no public URL value, **Then** `helm install` fails with a
   message naming the missing value.
9. **Given** a running Helm install **When** the database becomes unreachable, **Then** the server's
   readiness check fails and the pod leaves the Service endpoints while its liveness check keeps
   passing; **when** the database returns, **Then** the pod is Ready again without a restart.
10. **Given** a Helm install with two server replicas and no admin yet **When** both replicas
    start, **Then** they print the same setup token, which is stored in one database row created
    once while no admin exists; **when** that token is submitted on a request served by the other
    replica, **Then** it is accepted, the admin is created, the row is deleted, and the token is
    then rejected by both replicas. **Given** the production Compose install with no admin yet
    **When** the server restarts, **Then** it prints the same token as before the restart. The
    chart creates no Secret holding the token. This replaces spec 005's rule that each start mints
    a new token and nothing is stored: a leaked log line stays valid until the admin is claimed,
    including across restarts.
11. **Given** a database that has a migration the running image does not contain (for example the
    previous tag started on a database already upgraded, without a restore) **When** the server
    starts, **Then** it exits non-zero before serving any request, changes no data, and its log
    names the rollback steps: restore the pre-upgrade backup, then start the previous tag.

## Out of scope
- **Replacing the quickstart.** `deploy/docker-compose.yml`, its bundled Kong, the optional sample
  and the five-minute rule stay as they are. Production is a separate file.
- **Changing `deploy/hosted/`** (spec 006). The demo keeps its Caddy and its daily reset. A
  company backup must never reset the database.
- **High availability as a supported topology**: several replicas as a promise, HA Postgres,
  PodDisruptionBudgets, autoscaling, multi-zone. One replica stays the default. Criterion 10
  only makes the setup token safe if someone scales up. WSO2 also treats HA as extra.
- **Installing, upgrading or securing the company's Kong.** Kong's own chart does that; the guide
  points at `docs/connect-kong.md` and spec 005's settings.
- **Down migrations.** Migrations stay forward-only; rollback is restore plus the previous tag
  (Elango, 2026-11-13). An old image facing a newer schema stops (criterion 11); it never migrates down.
- **Publishing a baseline tag such as `v0.7.0`.** The CI upgrade test builds its baseline from
  `origin/main`. The first real tag-to-tag upgrade happens at the second release (Elango, 2026-11-13).
- **More than one Kubernetes minor, and Helm 4.** The chart declares 1.37 (stable was v1.37.2 on
  2026-11-13) and is tested with Helm 3 only.
- **Proxy examples other than Caddy, and a proxy inside the chart.** Any proxy that forwards HTTPS
  to the portal works; the guide shows Caddy only. The chart installs no Caddy, cert-manager or
  ingress controller.
- **A Kubernetes Secret as a second store for the setup token.** The database row is the only store.
- **TLS inside the portal, cert-manager, Vault, external-secrets, OpenShift, air-gapped mirrors,
  Windows hosts and marketplace listings.** Later specs if asked for.
- **A second VM walkthrough.** Ubuntu 24.04 LTS is named as expected to work, not walked.
- **Booting a cloud VM in CI.** The user-tester walks the VM guide; CI covers the chart and the upgrade.
- **Making the repo or GHCR packages public, and cutting `v0.8.0`.** Elango does that himself after
  specs 015 and 016 merge, once he has walked the guide and checked the git history (decision
  2026-11-13). Merging this spec does not publish anything.
- **Any UI change.** No new screens; the ui-designer stage has no work.

## Open questions
All five were decided by Elango on 2026-11-13. None are open.
- [x] **Upgrade baseline.** Decided: no `v0.7.0` tag. CI builds the baseline image from
  `origin/main` and the new image from this branch on the same volume (criterion 4). The guide
  describes previous published tag → new tag.
- [x] **Kubernetes minor.** Decided: `kubeVersion` 1.37, kind's 1.37 node image in CI, Helm 3, one
  minor only (criterion 7).
- [x] **Newer schema.** Decided: the server exits before serving and logs the rollback steps; no
  down migrations (criterion 11).
- [x] **Shared setup token.** Decided: one database row, created while no admin exists, deleted on
  claim; every replica on Compose and Helm prints the same token; no chart Secret. Replaces spec
  005's per-start token (criterion 10).
- [x] **Reverse proxy.** Decided: the VM guide shows Caddy; any HTTPS-forwarding proxy is fine; the
  chart installs no Caddy or cert-manager (criterion 1, Out of scope).

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Decisions that outlive this spec are in [ADR 0009](../adr/0009-production-install-versioned-images-forward-only.md):
exact-version GHCR images with no `latest`, forward-only migrations with a schema-ahead guard,
the setup token as one encrypted database row, and `X_FILE` secrets. No UI change; the
ui-designer stage has no work. The quickstart (`deploy/docker-compose.yml`) and `deploy/hosted/`
are not edited, except that both keep working with the new server behaviour (the token row and
health routes are additive; non-production starts are unchanged).

### Components
| Where | Change | Why |
| --- | --- | --- |
| `apps/server/src/config.ts`, `main.ts` | `X_FILE` for every secret; `DATABASE_PASSWORD[_FILE]`; production requires secrets with no defaults; config errors print setting names only and exit 1 | AC 1, 2 |
| `packages/db` | `setup_tokens` table + migration `0005_setup_tokens`; `migrate()` runs a schema-ahead check first and throws `SchemaAheadError` | AC 10, 11 |
| `apps/server/src/setup.ts`, `startup.ts` | token row create/print at start, read and delete in the claim transaction; no in-memory token | AC 10 |
| `apps/server/src/app.ts` | `GET /api/v1/health/live`, `GET /api/v1/health/ready`; `/api/v1/health` reports `PORTAL_VERSION` | AC 7, 9 |
| `apps/server/Dockerfile`, `apps/portal/Dockerfile` | `ARG PORTAL_VERSION=dev` → `ENV PORTAL_VERSION`, OCI labels (`org.opencontainers.image.source`, `.version`); both run as `node` (uid 1000) and tolerate a read-only root filesystem with `/tmp` writable | AC 3, 7 |
| `apps/portal/ingress/` | `/api/*` proxied at runtime to `SERVER_URL` (no build-time host); `GET /healthz` answered by the ingress; optional `PORTAL_TRUSTED_PROXIES` keeps the client IP and `https` scheme from the operator's reverse proxy | AC 1, 7, 8 |
| `deploy/production/` (new) | `compose.yaml`, `.env.example`, `secrets/README.md`, `Caddyfile`, `backup.sh`, `restore.sh` | AC 1, 2, 5, 6, 10 |
| `deploy/helm/api-portal/` (new) | Helm chart: server, portal, optional Postgres, optional Ingress, generated or existing Secret | AC 7, 8, 9, 10 |
| `.github/workflows/release.yml` (new), `scripts/release-tags.mjs` (new) | tag → two images on GHCR with exactly that version | AC 3 |
| `.github/workflows/ci.yml` | new jobs `upgrade-smoke` and `helm-smoke` | AC 4, 5, 6, 7–11 |
| `docs/install/production.md`, `docs/install/helm.md` (new), `README.md` | VM guide (Ubuntu 26.04 LTS, Caddy), backup/restore/upgrade/rollback, Helm guide; README links them and keeps the "evaluation only" warning on the quickstart | AC 1, 4, 5, 6 |

### API contract (`apps/server/openapi.yaml`, already updated)
- **`GET /v1/health/live`** (`getLiveness`, public) → `200 { status: "ok" }`. Touches nothing but
  the process. Used for Kubernetes liveness and startup probes.
- **`GET /v1/health/ready`** (`getReadiness`, public) → `200 { status: "ok", database: "ok" }`
  after `select 1` succeeds within 2 s; otherwise `503` problem+json
  `/problems/database-unavailable`, title "Database unavailable", detail "The server can't reach
  its database." — never the URL, host or error text. Gateway not checked. Used for Kubernetes
  readiness and the Compose healthcheck. Implement with the existing postgres.js pool (it
  reconnects on its own) and a `Promise.race` timeout; no new connection per probe.
- **`GET /v1/health`** unchanged in shape; `version` now comes from `PORTAL_VERSION` (`dev` when unset).
- **`POST /v1/setup/admin`** unchanged in shape and errors. Description now says the token is the
  shared database row. `403 setup-token-invalid` also covers "no row yet" (detail: "The setup
  token is unavailable. Restart the server and use the token from its startup log.");
  `409 setup-complete` is what every replica answers after a claim.
- Regenerate `packages/sdk/src/schema.d.ts` (`pnpm --filter @portal/sdk generate`); CI diffs it.

### Configuration (server)
- **Files.** For each of `DATABASE_URL`, `DATABASE_PASSWORD`, `BETTER_AUTH_SECRET`,
  `PORTAL_ENCRYPTION_KEY`, `KONG_ADMIN_TOKEN`, `SMTP_PASSWORD`, `ADMIN_PASSWORD`: if `X_FILE` is
  set, read it (UTF-8, trailing newline trimmed) before parsing. `X` and `X_FILE` both set →
  error "Set X or X_FILE, not both". Unreadable file → error "X_FILE: cannot read <path>" (path
  only, never contents). Done in a `resolveFileSecrets(env)` step ahead of `envSchema.parse`.
- **Database password.** If `DATABASE_PASSWORD` is set and `DATABASE_URL` has no password, set
  `url.password` (URL-encoded). Both carry a password → error.
- **Production requires.** With `NODE_ENV=production`, `DATABASE_URL`, `BETTER_AUTH_SECRET` and
  `PORTAL_ENCRYPTION_KEY` have no defaults. A missing one fails with
  "Missing required setting PORTAL_ENCRYPTION_KEY (set PORTAL_ENCRYPTION_KEY or
  PORTAL_ENCRYPTION_KEY_FILE)". `DATABASE_URL` without any password counts as missing
  `DATABASE_PASSWORD`. The existing "non-default secrets" check stays for explicit dev values.
- **Error output.** `main.ts` catches `ConfigError` (new, carries setting names) and zod errors,
  writes one line per setting name and issue code to stderr — never `received` values — and
  exits 1 before `start()`. Unit-test that a bad secret value never appears in output.
- `PORTAL_VERSION` (default `dev`) feeds `/v1/health.version`. `PORTAL_PUBLIC_URL` keeps its
  default in the server; Compose and the chart require it where it matters.

### Data model
- **`setup_tokens`** (new, `packages/db/src/schema.ts`):
  `id smallint primary key default 1` with `check (id = 1)`,
  `token_ciphertext text not null`, `created_at timestamptz not null default now()`.
  Migration `0005_setup_tokens`, generated with
  `pnpm --filter @portal/db exec drizzle-kit generate`. No backfill. Forward-only.
- **Start (production only, no admin):** in one transaction under
  `pg_advisory_xact_lock(71833003)` (the claim's lock): re-check no admin; read the row; if
  missing, or decryption with the current key fails, upsert a new
  `randomBytes(32).toString('hex')` encrypted with `PORTAL_ENCRYPTION_KEY`; commit; log
  `Setup token for the first admin: <token>` (unchanged line, so spec 005 tooling still works).
  If an admin exists, delete any leftover row. Non-production starts never create a row.
- **Claim:** `createFirstAdmin` takes the token from the row inside its transaction
  (`select … for update` after the advisory lock), compares with `timingSafeEqual` over SHA-256
  as today, inserts the admin, deletes the row, commits. `registerSetup` no longer receives a
  token; `createApp`'s `setupToken` option goes away. `ADMIN_EMAIL` bootstrap also deletes the row.
- **Schema-ahead guard (`packages/db` `migrate`)**, inside the existing
  `pg_advisory_lock(71833001)` and before `drizzleMigrate`: if `drizzle.__drizzle_migrations`
  exists, read `hash, created_at`; load the image's migrations with `readMigrationFiles` from
  `drizzle-orm/migrator`; if any applied `created_at` is greater than the newest local
  `folderMillis`, or an applied hash is unknown, throw `SchemaAheadError` (exported) without
  running anything else. `main.ts` logs: "This database was upgraded by a newer portal version.
  Nothing was changed. To roll back: restore the backup taken before the upgrade, then start the
  previous version. See docs/install/production.md#roll-back." and exits 1. Reads only; no
  write happens before the check.

### Images and release
- `scripts/release-tags.mjs <ref>`: accepts `refs/tags/vX.Y.Z` or `vX.Y.Z[-pre.N]`, prints
  `X.Y.Z[-pre.N]`; anything else exits 1. Unit-tested with `node --test` and added to the CI
  `node --test` line.
- `release.yml`: `on: push: tags: ['v*']`; `permissions: contents: read, packages: write`;
  `docker/login-action` with `GITHUB_TOKEN`; `docker/build-push-action` twice with
  `build-args: PORTAL_VERSION=<v>` and exactly one tag each:
  `ghcr.io/zebrasoftwareservices-eng/api-portal-server:<v>` and `…/api-portal-portal:<v>`.
  No metadata-action, so no `latest` can appear. Linux amd64 only. The workflow never calls the
  packages visibility API. Actions pinned to full commit SHAs.
- AC 3 is verified without pushing a tag: the release-tags unit test, `actionlint` on the
  workflow in CI, and a static check that `release.yml` contains no `latest`. The first real run
  is Elango's `v0.8.0` (out of scope).

### Production Compose (`deploy/production/compose.yaml`)
- Project name `api-portal`. Images `ghcr.io/…/api-portal-server:${PORTAL_VERSION:?…}` and
  `…-portal:${PORTAL_VERSION:?…}`, `postgres:17-alpine` pinned by digest. No `build:` keys.
- **Secrets** as Compose file secrets from `./secrets/`: `db_password`, `auth_secret`,
  `encryption_key`, optional `kong_admin_token`, `smtp_password`. Postgres uses
  `POSTGRES_PASSWORD_FILE`; the server uses `DATABASE_URL=postgres://portal@postgres:5432/portal`
  plus `DATABASE_PASSWORD_FILE`, `BETTER_AUTH_SECRET_FILE`, `PORTAL_ENCRYPTION_KEY_FILE`.
  `.env` holds only non-secrets: `PORTAL_VERSION`, `PORTAL_DOMAIN`, `PORTAL_PUBLIC_URL`,
  optional `KONG_*` URLs and SMTP host settings. `secrets/README.md` gives the `openssl rand`
  commands and `chmod 600`.
- **Server:** `NODE_ENV=production`, `SEED_SAMPLE=false`, no `ports:`, `PORTAL_PROXY_HOST=portal`,
  healthcheck on `/api/v1/health/ready`, `restart: unless-stopped`, `read_only: true`,
  `tmpfs: /tmp`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, log rotation.
- **Portal:** same hardening; `SERVER_URL=http://server:4000`; publishes only
  `127.0.0.1:${PORTAL_HTTP_PORT:-3000}:3000` for a host proxy; `PORTAL_TRUSTED_PROXIES` set to the
  `edge` network subnet so Caddy's client IP and scheme pass through.
- **Caddy** under profile `caddy` (`docker compose --profile caddy up -d`): `caddy:2-alpine`
  pinned by digest, publishes 80/443, `Caddyfile` is `{$PORTAL_DOMAIN} { reverse_proxy portal:3000 }`,
  `caddy_data` volume for certificates.
- **Networks:** `database` (`internal: true`: postgres, server), `app` (server, portal; egress
  allowed so the server reaches Kong and SMTP), `edge` (portal, caddy). Postgres publishes nothing.
- No Kong service, no httpbin, no seed. The admin claims with the token from
  `docker compose logs server` and connects the existing Kong in the UI (spec 005), or sets
  `KONG_ADMIN_URL` in `.env`.

### Backup, restore, rollback (`deploy/production/backup.sh`, `restore.sh`)
- `backup.sh [dir]` (default `./backups`): `umask 077`;
  `docker compose exec -T postgres pg_dump -U portal -d portal -Fc` →
  `api-portal-<UTC timestamp>-<PORTAL_VERSION>.dump`, then `pg_restore --list` on the file to
  prove it is readable. Read-only on the database. Never resets, never touches other files.
- `restore.sh <file>`: refuses without a readable file; asks "type RESTORE" unless `--yes`;
  `docker compose stop server portal`; `pg_restore -U portal -d portal --clean --if-exists
  --single-transaction --no-owner` (all schemas: `public`, `drizzle`, `pgboss`); starts nothing
  — the operator starts the version they want, so the same script serves restore and rollback.
- Both scripts run from `deploy/production/`, use only `docker compose` (no host Postgres
  client), and print what they did. The guide says the backup is useless without
  `secrets/encryption_key` and shows a nightly cron line.
- **Upgrade** (guide): `backup.sh` → set `PORTAL_VERSION` → `docker compose pull && up -d`;
  migrations run on start. **Rollback:** `docker compose stop server portal` → `restore.sh
  <pre-upgrade dump>` → set the previous `PORTAL_VERSION` → `up -d`.
- **Helm:** the guide shows `kubectl exec <release>-postgres-0 -- pg_dump -Fc` and `pg_restore`
  for the bundled database, and says an external database is backed up the operator's usual
  way. Upgrade is `helm upgrade --set image.tag=…`; rollback is scale server to 0, restore,
  `helm upgrade` with the previous tag — not `helm rollback`.

### Helm chart (`deploy/helm/api-portal/`)
- `Chart.yaml`: `apiVersion: v2`, `kubeVersion: ">=1.37.0-0 <1.38.0-0"`, `version` and
  `appVersion` follow the release. No subchart dependencies (no Bitnami): the bundled Postgres is
  a small StatefulSet the chart owns, documented as for evaluation and small installs.
- **Values (defaults):** `image.registry: ghcr.io/zebrasoftwareservices-eng`, `image.tag`
  (default `.Chart.AppVersion`), `imagePullSecrets: []`; `server.replicas: 1`,
  `portal.replicas: 1`, `resources`; `publicUrl: ""`; `ingress.enabled: false`, `className`,
  `host`, `tls`; `postgresql.enabled: true`, `persistence.size: 8Gi`, `storageClass`;
  `externalDatabase.url`, `externalDatabase.existingSecret` / `key`;
  `secrets.existingSecret` (keys `auth-secret`, `encryption-key`, `db-password`);
  `kong.adminUrl`, `kong.proxyPublicUrl`, `kong.proxyInternalUrl`,
  `kong.adminTokenSecret` / `key`; `smtp.*` with `passwordSecret`.
- **Secret:** without `secrets.existingSecret`, the chart creates `<fullname>-secrets` with
  random values on first install and reuses them via `lookup` on upgrade; annotated
  `helm.sh/resource-policy: keep` so uninstall never destroys the encryption key. No token key.
- **Database choice:** `externalDatabase.url` or `existingSecret` set → no Postgres StatefulSet,
  Service or PVC, and the server reads `DATABASE_URL` from that value/Secret. Otherwise
  StatefulSet `<fullname>-postgres` (1 replica, PVC template) and Service.
- **Required values:** `ingress.enabled` and empty `publicUrl` →
  `{{ fail "publicUrl is required when ingress.enabled is true" }}` (AC 8). Without ingress,
  `publicUrl` defaults to `http://localhost:3000` and NOTES.txt says to port-forward.
- **Server Deployment:** env from the Secret with `secretKeyRef`; `NODE_ENV=production`,
  `SEED_SAMPLE=false`, `PORTAL_VERSION`, `PORTAL_PUBLIC_URL`,
  `PORTAL_PROXY_HOST=<fullname>-portal-headless` (headless Service so DNS returns pod IPs, which
  the server's trusted-proxy check needs). Probes: `startupProbe` `/api/v1/health/live`
  (failureThreshold 60 × 2 s, covers migrations); `livenessProbe` `/api/v1/health/live`;
  `readinessProbe` `/api/v1/health/ready` (period 5 s, failureThreshold 2).
- **Portal Deployment:** `SERVER_URL=http://<fullname>-server:4000`; probes on `/healthz`.
  Services `<fullname>-portal` (ClusterIP 3000) and `<fullname>-portal-headless`.
- **Security on every pod:** `runAsNonRoot: true`, `seccompProfile: RuntimeDefault`; containers
  `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `readOnlyRootFilesystem: true`
  with `emptyDir` on `/tmp` (Postgres also on `/var/run/postgresql`). Server and portal
  `runAsUser: 1000`; Postgres `runAsUser: 70`, `fsGroup: 70`, `PGDATA` in a subdirectory of the volume.
- **Ingress** (optional, `networking.k8s.io/v1`) to the portal Service only. The chart creates no
  Kong, cert-manager, ingress controller or Caddy resources.
- `helm lint` and `helm template` with each value set run in CI before the kind install.

### Gateway adapter calls
None new. Kong stays outside both installs. With `KONG_ADMIN_URL` set the server registers it as
today (spec 005); otherwise the admin connects it in the UI. Upgrade does not re-tag or rewrite
Kong objects; reconcile keeps running every 5 minutes as now and is idempotent.

### CI
- **`upgrade-smoke`** (`deploy/upgrade-smoke.mjs`, `fetch-depth: 0`): build `portal-server:baseline`
  from a `git worktree` of `origin/main` and `portal-server:candidate` + `portal-portal:candidate`
  from HEAD. Start `deploy/production/compose.yaml` with a CI override
  (`deploy/ci/compose.upgrade.yaml`) that adds the quickstart's Kong on the `app` network and sets
  images. With the baseline server (`ADMIN_EMAIL`/`ADMIN_PASSWORD` bootstrap, `KONG_ADMIN_URL`
  set): create a published API, a developer, an app with a key. `backup.sh`. Swap to the
  candidate, start, assert AC 4 (both sign in; API, app, key listed). Then AC 5 (backup →
  checksum unchanged; delete app → restore → app back, other rows equal), AC 6 (restore the
  pre-upgrade dump, start baseline, data shown), AC 11 (on the candidate's database insert a row
  in `drizzle.__drizzle_migrations` with a future `created_at`, start candidate → exit ≠ 0,
  log names the rollback steps, `pg_dump` of `public` byte-identical before and after), AC 2
  (start with `secrets/encryption_key` absent → exit ≠ 0 before listening, log names
  `PORTAL_ENCRYPTION_KEY`, no secret value in logs), and AC 10's Compose part (restart → same token).
- **`helm-smoke`** (`deploy/helm/smoke.sh`): `helm/kind-action` with `kindest/node:v1.37.x`
  pinned by digest, Helm 3 pinned; build both candidate images and `kind load`; `helm lint`;
  install defaults (AC 7: all pods Ready; portal answers through its Service; `id -u` ≠ 0 in every
  container; `helm get manifest` has no Kong/cert-manager/ingress-controller kinds or images);
  AC 9 (scale Postgres to 0 → server NotReady and out of Endpoints, restartCount unchanged; scale
  back → Ready, restartCount 0); AC 10 (`server.replicas=2`: both logs print the same token; claim
  via port-forward to the other pod → 201; row gone; both pods then 409); AC 8 (a second release
  with `externalDatabase.url` to a plain Postgres → no Postgres pod, server Ready;
  `helm install --set ingress.enabled=true` without `publicUrl` fails naming `publicUrl`).

### Risks and how to test them
- **Portal `SERVER_URL` is baked at build** (`next.config.ts` rewrites, image builds with
  `http://server:4000`). The chart's Service is `<release>-server`, so `/api` would break. Fix:
  the ingress proxies `/api/*` at runtime; middleware and `lib/server.ts` read the env at runtime.
  Test: run the portal image with `SERVER_URL=http://other-host:4000` and an alias, sign in.
- **Rate limits and client IP behind Caddy.** The portal ingress replaces `X-Forwarded-For`
  with its peer, so behind Caddy every visitor shares one IP and one auth rate-limit bucket, and
  the scheme reads `http`. Fix: `PORTAL_TRUSTED_PROXIES` (IPs/CIDRs); only when the peer matches,
  keep the rightmost client address and `X-Forwarded-Proto`. Test: unit tests for trusted and
  untrusted peers; a spoofed header from an untrusted peer is dropped.
- **Read-only root filesystem** may break Next.js (`.next/cache`) or Node writes. Test:
  Compose and kind runs with `read_only`; add an `emptyDir`/tmpfs only where a write is proven.
- **Postgres as non-root** on kind needs `fsGroup` and a `PGDATA` subdirectory; verified in
  `helm-smoke`.
- **pg-boss during a database outage** could throw out of the process and turn a readiness
  failure into a crash loop. Test: AC 9 asserts restartCount 0; if it fails, catch at the boss
  `error` handler (already wired) and keep the process alive.
- **Schema guard only exists from this release on.** The baseline from `main` has no guard, so
  AC 11 is tested on the candidate with a synthetic future migration row (above).
- **The baseline lacks `PORTAL_VERSION`, health routes and `*_FILE`.** The CI override gives the
  baseline plain env secrets and a `/api/v1/health` healthcheck.
- **Setup token now survives restarts** (weaker than spec 005); accepted in ADR 0009. Test that
  the token never appears in any response or problem body.
- **kind 1.37 node image availability.** Pin the digest of the `kindest/node:v1.37.x` image
  published with the kind release; if none exists when building, raise a blocker rather than
  dropping the `kubeVersion` constraint.
- **The 30-minute VM walk** cannot run in CI; the user-tester times it on a clean Ubuntu 26.04
  VM following only `docs/install/production.md`.

### Tasks
- [ ] [backend] Regenerate `packages/sdk/src/schema.d.ts` from the updated `openapi.yaml`.
- [ ] [backend] Config: `X_FILE` secrets, `DATABASE_PASSWORD[_FILE]`, production-required secrets, `ConfigError` with names only; `main.ts` exits 1 on config errors; unit tests incl. no secret value in output (AC 2).
- [ ] [backend] `setup_tokens` table + generated migration `0005_setup_tokens`; token create/print at start and read/delete in the claim transaction; drop the in-memory token; tests for two app instances on one database and restart (AC 10).
- [ ] [backend] Schema-ahead guard in `packages/db` `migrate()` with `SchemaAheadError`; `main.ts` logs the rollback steps and exits 1; test with a synthetic future migration row (AC 11).
- [ ] [backend] `GET /api/v1/health/live` and `/api/v1/health/ready` per the contract; `PORTAL_VERSION` in `/api/v1/health`; outage test (AC 9).
- [ ] [backend] Server Dockerfile: `PORTAL_VERSION` build arg, OCI labels, works with a read-only root filesystem.
- [ ] [backend] `scripts/release-tags.mjs` + `node --test` test; `.github/workflows/release.yml` (exact-version tags only, pinned actions); `actionlint` in CI (AC 3).
- [ ] [backend] `deploy/production/`: `compose.yaml`, `.env.example`, `secrets/README.md`, `Caddyfile`, `backup.sh`, `restore.sh` as designed (AC 1, 2, 5, 6).
- [ ] [backend] Helm chart `deploy/helm/api-portal/` as designed, with NOTES.txt and `helm lint` clean (AC 7, 8, 9, 10).
- [ ] [backend] CI jobs `upgrade-smoke` (`deploy/upgrade-smoke.mjs`, `deploy/ci/compose.upgrade.yaml`) and `helm-smoke` (`deploy/helm/smoke.sh`) (AC 2, 4–11).
- [ ] [backend] `docs/install/production.md` (VM guide, Caddy, claim, connect Kong, backup cron, upgrade, rollback anchor `#roll-back`), `docs/install/helm.md`; README links them (AC 1, 4, 5, 6).
- [ ] [frontend] Portal ingress proxies `/api/*` to `SERVER_URL` at runtime; middleware and `lib/server.ts` read it at runtime; test with a non-default server host.
- [ ] [frontend] Portal ingress answers `GET /healthz` (200 when the Next child answers on loopback, 503 otherwise).
- [ ] [frontend] `PORTAL_TRUSTED_PROXIES` in the portal ingress: keep client IP and `https` only from a trusted peer; unit tests for trusted, untrusted and spoofed headers.
- [ ] [frontend] Portal Dockerfile: `PORTAL_VERSION` build arg, OCI labels, runs with a read-only root filesystem (writable `/tmp` only, or the proven minimum).
- [ ] [qa] Run `upgrade-smoke` and `helm-smoke` locally and in CI; record AC 2–11 evidence in the Test report.
- [ ] [qa] Verify the quickstart is unchanged: `deploy/docker-compose.yml` up in under five minutes, existing smokes and `pnpm test:e2e` pass.
- [ ] [qa] Production Compose on a Linux host with a real Kong: HTTPS via the Caddy profile, `NODE_ENV=production`, no host ports for Postgres/server, no Kong container, no sample API, claim and connect Kong (AC 1).

## UX  _(ui-designer)_
Summary + link to `docs/design/NNN-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/016.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/016.md`. The full report is `docs/uat/016/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/016.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
