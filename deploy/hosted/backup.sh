#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu

umask 077
ROOT=${PORTAL_DEPLOY_ROOT:-/opt/api-portal}
ENV_FILE=${PORTAL_ENV_FILE:-/etc/api-portal/portal.env}
BACKUP_DIR=${PORTAL_BACKUP_DIR:-/var/backups/api-portal}
COMPOSE_FILE="$ROOT/deploy/hosted/compose.yaml"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$BACKUP_DIR/portal-$STAMP.sql.gz"
TEMP="$TARGET.tmp"

mkdir -p "$BACKUP_DIR"
trap 'rm -f "$TEMP"' EXIT HUP INT TERM
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump --clean --if-exists --no-owner --no-privileges -U portal portal | gzip -9 >"$TEMP"
test -s "$TEMP"
chmod 600 "$TEMP"
mv "$TEMP" "$TARGET"
find "$BACKUP_DIR" -type f -name 'portal-*.sql.gz' -mtime +14 -delete
printf '%s\n' "$TARGET"

