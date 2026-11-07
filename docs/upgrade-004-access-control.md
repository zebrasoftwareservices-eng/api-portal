# Upgrading to per-API access control

Back up the portal database and Kong configuration before an upgrade. No database migration
is needed for this change. Postgres subscriptions remain the source of truth; the first
reconcile after startup grants existing apps their groups before applying the new ACLs.
If Kong is unavailable, the server starts, warns, and retries reconciliation. Existing
subscriptions and keys stay stored as before. Keep Kong reachable during the upgrade and
check the server's access-policy warnings after the first reconcile.

## Changes for developers and upstream services

- Keys now work only on APIs their app is subscribed to. A key loses access to other
  published APIs and to unmanaged key-auth services; Kong returns 403. To use another API,
  create an app that includes it. Existing subscribed keys keep their values.
- Publishing a service with key-auth limits it to the `portal-svc-<serviceId>` group.
  Existing non-portal callers on that service lose access until an operator grants them
  membership. The same restriction applies to services already published before upgrade.
- Kong no longer forwards API keys in headers or query parameters to upstream services on
  managed services. Upstreams that read the key must change first. `X-Consumer-Custom-Id`
  remains available. `X-Consumer-Groups` is hidden by the portal ACLs.
- Public services without key-auth stay public. Route-only key-auth protects only those
  routes; other routes stay public. A global key-auth plugin is never changed: the portal
  makes a service-scoped copy for managed services so it can hide credentials there.

Hiding credentials stops Kong forwarding the key to upstreams, but Kong's own access log
still records the full query string, including a key sent as `?apikey=`. So can any load
balancer in front of Kong. Send keys in the `apikey` header where you can. To keep query
strings out of Kong's log, set a format that uses `$uri`:

```text
KONG_NGINX_HTTP_LOG_FORMAT=portal_noquery '$remote_addr [$time_local] "$request_method $uri" $status $body_bytes_sent'
KONG_PROXY_ACCESS_LOG=/dev/stdout portal_noquery
```

This removes all query strings from the log, not only keys, so adjust it if you rely on
them. Rotate any key that may already be in forwarded logs.

To keep an operator's consumer working on a managed service, use the service's UUID from
Kong, not the API's UUID. For example, with your own Admin API authentication options:

```sh
curl --fail -X PUT "$KONG_ADMIN_URL/consumers/$CONSUMER_ID/acls/portal-svc-$SERVICE_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"group\":\"portal-svc-$SERVICE_ID\"}"
```

Do not add portal instance tags to operator consumers. Reconciliation leaves those consumers
and their memberships untouched. On portal-owned consumers, reconciliation removes every
group without a corresponding subscription (including groups added manually), and restores
`portal-consumer` and subscribed service memberships.

## Conflicts and warnings

A service can be linked to only one new published API. Use a separate Kong service for a
second API or version. Existing APIs sharing one service stay published and share access:
a subscription to either grants access to both. Reconcile logs the affected API slugs.

New imports refuse any operator ACL applying globally, on the service, or on its routes,
before changing plugins. For already-published services the portal leaves foreign ACLs
alone, warns, and still hides credentials. A foreign allow list may block subscribed keys;
a foreign deny list may leave portal keys with broader access. Resolve those warnings in
Kong. On unmanaged services, an operator ACL can prevent the portal deny policy; a deny
list that does not include `portal-consumer` leaves portal keys usable there. Route-level
operator ACLs also need review because they can override a service policy.

Reconcile normally runs every five minutes. Newly created unmanaged key-auth services can
accept portal keys until the next run adds their deny ACL. Keep them unavailable to callers
until reconciliation finishes if that interval matters. A managed service whose key-auth
was removed retains its portal ACL and emits a warning rather than silently becoming public.

## Propagation and verification

The upgrade adds missing memberships first, then waits six seconds before creating or
converting plugins. This assumes a single Kong node with the default five-second
`db_update_frequency`. Multi-node propagation has not been verified; upgrade during a
maintenance window and confirm memberships have propagated to every node before enforcing
new ACLs if your cluster uses different timing.

After upgrade, check a subscribed API returns 200, another API returns 403, and an echoing
upstream receives neither the `apikey` header nor query parameter. Check an operator key on
an unmanaged service and an anonymous public request still work. Restarting the portal
should leave Kong object IDs and configuration unchanged; the sample seed may change
`updated_at` timestamps. Review every `drift: access policy finding` warning.

## Removing portal plugins

The plugins remain if the portal stops. Stop the portal before removal or reconcile will
restore them. Removing ACLs reopens access; take the affected routes offline or apply your
own policy first. Obtain the instance UUID from the `instance_settings` table and remove
only plugins carrying its `portal-instance-<id>` tag. Do not remove operator plugins or
plugins belonging to another portal instance.

The following Bash example pages through tagged plugins, then deletes their IDs. Configure
any required Admin API authentication on both curl calls. It requires `jq`.

```sh
plugin_ids=$(mktemp)
next="$KONG_ADMIN_URL/plugins?tags=portal-instance-$INSTANCE_ID&size=1000"
while [ -n "$next" ]; do
  page=$(curl --fail --silent --show-error "$next") || break
  jq -r '.data[].id' <<< "$page" >> "$plugin_ids"
  next=$(jq -r '.next // empty' <<< "$page")
  if [[ "$next" == /* ]]; then next="$KONG_ADMIN_URL$next"; fi
done
while IFS= read -r plugin_id; do
  curl --fail -X DELETE "$KONG_ADMIN_URL/plugins/$plugin_id" || break
done < "$plugin_ids"
rm "$plugin_ids"
```

This removes ACLs and portal-created service copies of global key-auth, including the
sample seed's key-auth plugin. Hiding applied to operator-owned service/route key-auth
plugins stays on; restore their previous `hide_credentials` settings from your backup
only if required. Consumer ACL memberships are harmless without ACL plugins and can be
removed separately as part of decommissioning portal-owned consumers.
