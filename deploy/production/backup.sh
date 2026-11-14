#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
umask 077
cd "$(dirname "$0")"
directory=${1:-./backups}
mkdir -p "$directory"
version=$(sed -n 's/^PORTAL_VERSION=//p' .env | head -n 1)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$directory/api-portal-$stamp-${version:-unknown}.dump"
docker compose exec -T postgres pg_dump -U portal -d portal -Fc > "$target"
docker compose exec -T postgres pg_restore --list < "$target" >/dev/null
printf 'Created and verified %s\n' "$target"
