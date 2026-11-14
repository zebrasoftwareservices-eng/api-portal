# Production installation with Docker Compose

This guide installs one API Developer Portal on an Ubuntu 26.04 LTS VM. It expects Docker Engine with Compose v2, a DNS name, an existing Kong gateway, and outbound access from the server container to Kong and your SMTP provider.

## Install

1. Download an exact release of this repository and enter `deploy/production`.
2. Copy `.env.example` to `.env`. Set `PORTAL_VERSION` to an exact published version, `PORTAL_DOMAIN`, and the matching HTTPS `PORTAL_PUBLIC_URL`.
3. Follow `secrets/README.md`. Keep the encryption key with your off-host backups.
4. Authenticate to GHCR before pulling the private images. Run `docker login ghcr.io -u <github-user>` and enter a GitHub personal access token with the `read:packages` scope when prompted.
5. Start the private portal endpoint with `docker compose pull && docker compose up -d`. For automatic HTTPS on ports 80 and 443, instead run `docker compose --profile caddy up -d`.
6. Check `docker compose ps`. PostgreSQL and the server have no host ports; only the portal is bound to `127.0.0.1:3000` unless the Caddy profile is enabled.

Retrieve the shared first-admin token without copying other log data:

```sh
docker compose logs server | sed -n 's/.*Setup token for the first admin: //p' | tail -1
```

Open the portal, claim the administrator, then use **Admin → Gateways** to connect Kong. Set `KONG_ADMIN_URL` and proxy URLs in `.env` instead when the connection should remain environment-managed. Never expose the Kong Admin API publicly.

## Back up

Run `./backup.sh` before every upgrade. It creates a compressed custom-format dump and verifies it with `pg_restore --list`. The database dump is not sufficient without the matching `secrets/encryption_key`.

A nightly cron entry from `deploy/production` can be:

```cron
15 2 * * * cd /opt/api-portal/deploy/production && ./backup.sh /var/backups/api-portal
```

Test restores on another installation. To restore deliberately, run `./restore.sh <dump>` and type `RESTORE`; automation may use `./restore.sh --yes <dump>`. The script stops the application and leaves it stopped so you can select the correct version before restarting.

## Upgrade

```sh
./backup.sh
# edit PORTAL_VERSION in .env to the exact new version
docker compose pull
docker compose up -d
```

Migrations run at server start. Watch `docker compose logs server` and verify `/api/v1/health/ready`. Never reuse an old application image against a database already migrated by a newer one.

## Roll back

Rollback is a database restore, not merely an image change:

```sh
docker compose stop server portal
./restore.sh /path/to/the-pre-upgrade.dump
# set the previous exact PORTAL_VERSION in .env
docker compose up -d
```

If the server reports that the database was upgraded by a newer portal version, it has made no schema changes. Restore the backup taken before the upgrade, then start the previous version.
