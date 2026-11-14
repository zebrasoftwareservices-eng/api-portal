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
docker compose exec -T postgres pg_restore -U portal -d portal --clean --if-exists --single-transaction --no-owner < "$file"
printf 'Restored %s. Set the desired PORTAL_VERSION, then run docker compose up -d.\n' "$file"
