# Connect the portal to Kong

The portal server must reach Kong's Admin API and its internal proxy. The public
proxy URL is the address developers use. In **Admin → Gateways**, enter all three,
press **Test**, then **Save**. Test reads only; Save repeats its checks. A portal
connects to one Kong. Kong needs a database: DB-less and data-plane nodes cannot
store the consumers and keys the portal creates.

Saving lets this portal manage its tagged consumers, keys and ACL memberships.
Publishing an API sets an allow ACL on its service, and reconciliation adds a deny
ACL for portal consumers to other key-auth services without a foreign ACL. It also
hides credentials on managed key-auth paths. See [access-control upgrade notes](upgrade-004-access-control.md).

## Use the same private network

Put the portal server and Kong on a private network where the server can reach the
Admin API. Restrict that interface and port to the portal and trusted operators.
Use TLS when requests cross a network you do not control. The default Compose
network provides `http://kong:8001` and internal proxy `http://kong:8000`; developers
on the host use public proxy `http://localhost:8000`. Do not put `localhost:8001` in
the container's form: that names the portal server container itself.

Kong OSS's open Admin API ignores `Kong-Admin-Token`, so a wrong token can still
pass Test on an unprotected Admin API. Restrict it at the network layer, or use the
protected route below. Never expose an open Admin API to the internet.

The default Compose installation sets `NODE_ENV=development` and asks for no setup
token. **Do not expose that installation to the internet.** On a production server,
set non-default secrets and `NODE_ENV=production`; use the setup token printed at
startup to create the first admin. Each restart replaces it until an admin exists.

## Reach the Admin API through a protected route

This recipe adapts [Kong's API loopback guidance](https://developer.konghq.com/gateway/secure-the-admin-api/).
Apply it from Kong's own host or container, using its loopback Admin API, before
you expose the route. Keep the proxy private or firewalled while configuring it:
the route must never be reachable without all three security plugins.

1. Set `KONG_ADMIN_LISTEN=127.0.0.1:8001` and restart Kong. Its Admin API is now
   accessible only from the Kong host/container. Run the following commands there.
2. Choose a random admin token and the portal server's source IP as Kong sees it.
   Add trusted operators explicitly. Behind a load balancer, configure Kong's
   trusted proxy and real-IP settings before relying on an IP allowlist.
3. Create the service, route, service-scoped plugins and a dedicated admin consumer.
   Every object here uses the `portal-internal` tag. This tag hides the service
   from portal discovery and is distinct from the portal's ownership tag.

```sh
# Run in the Kong host/container; keep shell tracing off when handling tokens.
ADMIN=http://127.0.0.1:8001
PORTAL_SERVER_IP=192.0.2.10/32 # Replace with the real source address.
read -r -s -p 'Choose an admin token: ' ADMIN_TOKEN
printf '\n'

curl --fail-with-body -sS -X PUT "$ADMIN/services/kong-admin-api" \
  --data 'url=http://127.0.0.1:8001' --data 'tags[]=portal-internal'
curl --fail-with-body -sS -X PUT "$ADMIN/routes/kong-admin-api" \
  --data 'service.name=kong-admin-api' --data 'paths[]=/admin-api' \
  --data 'strip_path=true' --data 'tags[]=portal-internal'
curl --fail-with-body -sS -X POST "$ADMIN/services/kong-admin-api/plugins" \
  --data 'name=key-auth' --data 'config.key_names[]=Kong-Admin-Token' \
  --data 'config.hide_credentials=true' --data 'tags[]=portal-internal'
curl --fail-with-body -sS -X POST "$ADMIN/services/kong-admin-api/plugins" \
  --data 'name=acl' --data 'config.allow[]=kong-admin' \
  --data 'config.hide_groups_header=true' --data 'tags[]=portal-internal'
curl --fail-with-body -sS -X POST "$ADMIN/services/kong-admin-api/plugins" \
  --data 'name=ip-restriction' --data-urlencode "config.allow[]=$PORTAL_SERVER_IP" \
  --data 'tags[]=portal-internal'
curl --fail-with-body -sS -X PUT "$ADMIN/consumers/portal-admin-client" \
  --data 'username=portal-admin-client' --data 'tags[]=portal-internal'
# Discard the credential response because it includes the chosen token.
curl --fail -sS -o /dev/null -X POST "$ADMIN/consumers/portal-admin-client/key-auth" \
  --data-urlencode "key=$ADMIN_TOKEN" --data 'tags[]=portal-internal'
curl --fail-with-body -sS -X POST "$ADMIN/consumers/portal-admin-client/acls" \
  --data 'group=kong-admin' --data 'tags[]=portal-internal'
unset ADMIN_TOKEN
```

Use `http://<kong-private-host>:8000/admin-api` as the Admin API URL, or its HTTPS
address if TLS is configured. Enter the chosen token in the portal. Keep proxy
URLs pointed to the actual proxy, without the `/admin-api` prefix. These commands
configure a fresh recipe: POSTs will conflict if those plugins or memberships
already exist; inspect and update them instead of adding duplicates.

The `Kong-Admin-Token` key name matches the adapter's header. **Key-auth alone is
insufficient:** a portal-issued key belongs to another consumer on the same Kong.
The recipe's own `kong-admin` allow ACL must exist from the start, and must be
service-scoped. Reconcile leaves it alone. A route-scoped ACL instead produces a
`foreign-acl` finding. Do not give portal consumers membership in `kong-admin`.

Verify from the portal network before relying on it:

- Test passes with the right token and reports Kong's version.
- A wrong or absent token returns 401; Test says Kong refused the token.
- The right token from outside the allowlist returns 403.
- A portal-issued API key in the `Kong-Admin-Token` header returns 403, including
  before reconciliation has run. The service's own allow ACL enforces this.

## Edit, disable, repoint or remove

A blank token preserves the stored token only if the normalized Admin API URL is
unchanged. On a changed URL, enter the token again or choose **This Kong needs no
token**; the stored token is never forwarded to a new address. If the encryption
key changes, Test/edit/Enable returns a 503 asking you to enter the token again.

Disable pauses new apps, keys, imports and sample publication. Existing keys and
docs continue working. Revoke and reconciliation still contact Kong. Re-enable
checks both the Admin API and internal proxy again before enabling the connection.

Repointing changes the address used for later requests; it does **not** copy Kong
services, routes, consumers or keys. Published APIs retain their service IDs.
Reconcile logs `service-missing` if those services are absent. When an active key's
consumer is missing, Test warns and Save requires explicit confirmation. With no
active keys there is no warning. A new key on an existing app upserts its consumer
and access grants on the new Kong, but old key values cannot be recreated: the
portal stores only their last four characters. Old Kong keys can still work there,
and revoking through the new connection cannot revoke keys on the old Kong.
Clean up the old Kong separately.

Removal is refused while APIs or active keys depend on the connection, with both
counts shown. Revoked keys remain in developer history after a successful removal.
Removal only deletes the saved connection and encrypted token; it makes no Kong
request. Consumers, keys and allow/deny ACLs remain, and traffic stays unchanged.
The portal currently has no unpublish action, so an API dependency must be handled
by editing or disabling the connection instead.

## Clean up this portal's objects after removal

Only do this when you intend to delete this portal's gateway configuration. For a
repoint, run against the **old** Kong. Establish a trusted Admin API connection
first; if you use the protected route, include its admin header on every request.

Find the exact `portal-instance-<uuid>` tag on one of the portal's objects. Never
use the broad `portal` tag when several installs share a Kong. List these entity
collections with `?tags=portal-instance-<uuid>` and follow **every** pagination
`next` link, collecting the IDs before deleting anything:

1. `GET /plugins?tags=portal-instance-<uuid>` → `DELETE /plugins/{id}`.
2. `GET /consumers?tags=portal-instance-<uuid>` → `DELETE /consumers/{id}`.
3. `GET /routes?tags=portal-instance-<uuid>` → `DELETE /routes/{id}`.
4. `GET /services?tags=portal-instance-<uuid>` → `DELETE /services/{id}`.

Delete in that order. Plugin cleanup includes the portal-owned **deny ACLs** on
operator services as well as its allow ACLs. Consumer deletion takes its keys and
memberships with it. Inspect each object's tags before deleting; leave everything
without the exact ownership tag untouched. The recipe's `portal-internal` consumer,
service, route and plugins must remain. If an operator's untagged objects depend on
a tagged service/route, resolve those dependencies explicitly rather than deleting
untagged objects to bypass a conflict.

The portal may have changed `hide_credentials` on an operator-owned key-auth
plugin. Tag cleanup does **not** undo that change, because the portal doesn't own
that plugin. Review it manually if you want different credential-forwarding behavior.
