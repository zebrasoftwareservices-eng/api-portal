#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
cd "$(dirname "$0")"
assume_yes=false
if [ "${1:-}" = "--yes" ]; then assume_yes=true; shift; fi
file=${1:-}
if [ -z "$file" ] || [ ! -r "$file" ]; then
  printf 'Usage: %s [--yes] <readable-dump-file>\n' "$0" >&2
  exit 2
fi
if [ "$assume_yes" = false ]; then
  printf 'This replaces the portal database. Type RESTORE: '
  read -r answer
  [ "$answer" = RESTORE ] || { printf 'Restore cancelled.\n'; exit 1; }
fi
docker compose stop server portal
restore_sql=$(mktemp)
trap 'rm -f "$restore_sql"' EXIT INT TERM
printf 'DROP SCHEMA IF EXISTS pgboss CASCADE;\n' > "$restore_sql"
docker compose exec -T postgres pg_restore --clean --if-exists --no-owner --file=- < "$file" >> "$restore_sql"
docker compose exec -T postgres psql -U portal -d portal --single-transaction --set ON_ERROR_STOP=1 < "$restore_sql"
printf 'Restored %s. Set the desired PORTAL_VERSION, then run docker compose up -d.\n' "$file"
