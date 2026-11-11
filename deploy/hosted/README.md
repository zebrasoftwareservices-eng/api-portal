# Hosted live demo operations

This deployment adds the API Portal server, its own PostgreSQL database and a sample
`httpbin` upstream to the existing Hostinger Kong host. It does not publish container ports:
the existing Caddy is the only path to Fastify, and Postgres stays on an internal Docker
network. The Kong and portal databases are separate volumes and separate containers.

For PostgreSQL-backed Kong 3.9, configure `KONG_WORKER_CONSISTENCY=strict` on the
existing Kong deployment and restart its workers before publishing APIs. The default
`eventual` mode can serve a request with an older ACL plugin list on a pooled try-it
connection, even after another worker has returned 403 for the same unsubscribed key.
The bundled quickstart configures strict consistency automatically.

## Host layout

- Application checkout: `/opt/api-portal`
- Mode-600 secrets: `/etc/api-portal/portal.env`
- Mode-600 backups: `/var/backups/api-portal/portal-<UTC timestamp>.sql.gz`
- Public control plane: `https://portal-api.189.72.147.38.sslip.io`
- Public gateway: `https://gateway.189.72.147.38.sslip.io`
- Public portal: `https://api-portal-two.vercel.app`

`BETTER_AUTH_TRUSTED_ORIGINS` is restricted to the Vercel project's preview
hostname pattern (`https://api-portal-*-zss2.vercel.app`) so pull-request
previews can complete authentication without trusting unrelated origins.

Copy `.env.example` to the secret path and generate independent random values for every
blank. `PORTAL_ENCRYPTION_KEY` must be base64 for exactly 32 random bytes. The Kong token
comes from the existing `/root/apigw/.env`; never put it in a browser, a `NEXT_PUBLIC_*`
variable, Git, logs or a shell command line. Keep the environment file owned by root and
mode 600.

The existing apigw Caddy must join the external `portal-edge` network and proxy the portal
API hostname to `portal-server:4000`. That tracked change lives in the apigw JSO-127 PR.

## Deploy, health and recovery

Run as root after placing the approved revision at `/opt/api-portal`:

```sh
PORTAL_DEPLOY_ROOT=/opt/api-portal deploy/hosted/install.sh
curl --fail https://portal-api.189.72.147.38.sslip.io/api/v1/health
```

Both containers use `restart: unless-stopped`; Docker and the timers are enabled at boot.
The install command is idempotent and waits for database and Fastify health. JSON logs rotate
at 10 MiB with three files. The sample route gets a Kong 120 requests/minute limit, while
try-it keeps its existing 60 requests/minute/IP limit.

To roll back application code, place the prior approved revision in `/opt/api-portal` and
rerun `deploy/hosted/install.sh`. Schema changes must be backward compatible. For a database
rollback, stop Fastify, restore a selected dump into the `portal` database, then start Fastify;
never restore the portal dump into Kong's database.

## Backup and reset

`api-portal-backup.timer` writes one compressed logical dump each day and retains 14 days.
Run an immediate backup with:

```sh
systemctl start api-portal-backup.service
```

`api-portal-reset.timer` runs daily after the backup. It deletes developer users (their
sessions, apps, subscriptions and portal credential metadata cascade), preserves the admin
and seeded catalog, then restarts Fastify. Startup reconciliation deletes orphaned Kong
consumers and credentials. To inspect schedules and results:

```sh
systemctl list-timers 'api-portal-*'
journalctl -u api-portal-backup.service -u api-portal-reset.service
```

## Vercel

Set only the server-side `SERVER_URL` variable to
`https://portal-api.189.72.147.38.sslip.io` for Production, Preview and Development in the
existing `api-portal` project. Set `PORTAL_DEMO_MODE=off` in the same scopes as an explicit
operator signal; only the value `on` enables demo mode. Do not add the Kong token, database
URL, auth secret, encryption key or admin password to Vercel. A PR deployment supplies the
preview; only merging `main` supplies production code.
