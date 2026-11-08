#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu

ROOT=${PORTAL_DEPLOY_ROOT:-/opt/api-portal}
ENV_FILE=${PORTAL_ENV_FILE:-/etc/api-portal/portal.env}
COMPOSE_FILE="$ROOT/deploy/hosted/compose.yaml"

test "$(id -u)" -eq 0
test -f "$ENV_FILE"
test "$(stat -c '%a' "$ENV_FILE")" = 600
install -d -m 700 /var/backups/api-portal
docker network inspect portal-edge >/dev/null 2>&1 || docker network create portal-edge >/dev/null

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --wait
PORTAL_ENV_FILE="$ENV_FILE" "$ROOT/deploy/hosted/configure-sample-policy.sh"

install -m 644 "$ROOT/deploy/hosted/systemd/api-portal-backup.service" /etc/systemd/system/
install -m 644 "$ROOT/deploy/hosted/systemd/api-portal-backup.timer" /etc/systemd/system/
install -m 644 "$ROOT/deploy/hosted/systemd/api-portal-reset.service" /etc/systemd/system/
install -m 644 "$ROOT/deploy/hosted/systemd/api-portal-reset.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now api-portal-backup.timer api-portal-reset.timer

