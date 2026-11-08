#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu

ENV_FILE=${PORTAL_ENV_FILE:-/etc/api-portal/portal.env}
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${KONG_ADMIN_URL:?KONG_ADMIN_URL is required}"
: "${KONG_ADMIN_TOKEN:?KONG_ADMIN_TOKEN is required}"

# A stable ID keeps this operation idempotent. The policy bounds direct calls
# to the public sample route; Fastify separately limits try-it to 60/minute/IP.
curl --fail --silent --show-error \
  --request PUT \
  --header "Kong-Admin-Token: $KONG_ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"name":"rate-limiting","service":{"name":"portal-sample"},"config":{"minute":120,"policy":"local"},"tags":["portal-hosted-demo"]}' \
  "$KONG_ADMIN_URL/plugins/6b45e3a8-7085-4ec4-b170-1ce90676f127" >/dev/null

