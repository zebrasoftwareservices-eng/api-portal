#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu

ROOT=${PORTAL_DEPLOY_ROOT:-/opt/api-portal}
ENV_FILE=${PORTAL_ENV_FILE:-/etc/api-portal/portal.env}
COMPOSE_FILE="$ROOT/deploy/hosted/compose.yaml"
LOCK_FILE=${PORTAL_RESET_LOCK:-/run/lock/api-portal-reset.lock}

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

PORTAL_DEPLOY_ROOT="$ROOT" PORTAL_ENV_FILE="$ENV_FILE" \
  "$ROOT/deploy/hosted/backup.sh" >/dev/null

# Cascades remove sessions, apps, subscriptions and credential metadata while
# retaining the seeded catalog, gateway settings and the bootstrap admin.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U portal -d portal <<'SQL'
BEGIN;
DELETE FROM "user" WHERE role = 'developer';
DELETE FROM verification;
COMMIT;
SQL

# Startup immediately schedules reconcile. It removes every now-orphaned
# portal-owned Kong consumer and credential before the next visitor journey.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" restart server >/dev/null
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --wait server >/dev/null

