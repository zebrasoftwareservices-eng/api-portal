# ADR 0002 — Gateway adapter contract v0: consumer per app, portal-issued keys, tag-and-reconcile

- Status: Proposed (accept by merging)
- Date: 2026-11-02
- Spec: 001-kong-quickstart-slice

## Context
Spec 001 is the first code that writes to a gateway. Every later adapter (AWS, APISIX, Envoy,
Apigee, Azure APIM) will copy whatever shape we choose here, so the choices below need to hold
for gateways with no transactions, flaky admin APIs and objects that other tools also manage.
`docs/engineering-conventions.md` sketches `ensureConsumer(dev: DeveloperRef)`; building
spec 001 showed that this grain is wrong (see decision 1).

## Decision
1. **One gateway consumer per portal app, not per developer.** Kong consumer
   `username = portal-app-<appId>`, `custom_id = <appId>`. Revoking or deleting an app then
   touches only that app's gateway objects, and future per-app plans (rate limits, ACL groups)
   attach to the consumer. AWS maps the same way (one usage-plan key per app).
2. **The portal generates API keys** (`pk_` + 32 random bytes, base64url) and passes them to the
   gateway. The key is shown to the developer once and never stored by the portal; Postgres keeps
   only the last four characters as a hint. Gateways that generate keys themselves (AWS) return
   the value once from `issueCredential`, and the same rule applies.
3. **Portal IDs are the gateway IDs where the gateway allows it.** The Kong key-auth credential is
   upserted with `PUT /consumers/{username}/key-auth/{credentialId}` using the portal's UUIDv7
   credential ID, so a retried call converges on one object instead of creating a second.
4. **Every gateway object is tagged.** Tags: `portal`, `portal-instance-<instanceId>` (one per
   install, generated at first boot and kept in the `instance_settings` table) and
   `portal-app-<appId>`; credentials also get `portal-cred-<credentialId>`. The instance tag
   stops two portals sharing one gateway from touching each other's objects.
5. **No distributed transactions: write gateway first, then Postgres, compensate on failure, and
   reconcile.** Request handlers call the gateway with a 5 s timeout and no retries, then commit
   Postgres. If anything fails after a gateway write, the handler deletes what it wrote
   (best effort). A pg-boss job (`gateway-reconcile`, at startup and every 5 minutes) deletes
   instance-tagged consumers with no app row and credentials whose row is revoked. Postgres
   holds desired state; the job repairs drift.
6. **Adapter errors are typed.** `GatewayUnavailableError` (network error, timeout, 5xx) maps to
   HTTP 503 `/problems/gateway-unavailable`. `GatewayRejectedError` (4xx other than an expected
   404 on delete) maps to 502 `/problems/gateway-rejected`. A 404 on any delete counts as success.

The v0 interface (in `packages/adapter-sdk`) is:

```ts
interface GatewayAdapter {
  readonly kind: 'kong';
  capabilities(): Capabilities;                          // { apiKeys: true, oauthClients: false, plans: false, usage: false }
  health(): Promise<HealthReport>;                       // { reachable, version?, latencyMs }
  listServices(): Promise<GatewayService[]>;             // discover(): services + routes, for linking specs
  getService(idOrName: string): Promise<GatewayService | null>;
  ensureConsumer(app: AppRef): Promise<ConsumerRef>;     // idempotent upsert
  deleteConsumer(app: AppRef): Promise<void>;            // cascades credentials; 404 = ok
  issueCredential(app: AppRef, cred: CredentialSpec): Promise<IssuedCredential>; // idempotent on cred.id
  revokeCredential(app: AppRef, credentialId: string): Promise<void>;           // 404 = ok
  listOwnedConsumers(): Promise<OwnedConsumer[]>;        // objects carrying this instance's tag, for reconcile
}
```

`applyPlan` and `usage` from the conventions sketch are left out until a spec needs them; adding
them later is a non-breaking addition behind `capabilities()`.

## Consequences
- A developer with three apps has three Kong consumers. That's fine for Kong and AWS, and it's
  what per-app plans need anyway.
- Losing a key means issuing a new one; the portal can't show an old key again. This is the
  same as GitHub and Stripe keys and is the safer default.
- For up to 5 minutes, an orphaned consumer can exist in Kong (when compensation itself fails).
  It has no usable credential the developer has seen, so the risk is clutter, not access.
- `docs/engineering-conventions.md` should be updated to the v0 interface when this is accepted.
- Key-auth alone does not scope a key to one API: any portal key works on every key-auth
  service in that Kong. Per-API scoping (Kong ACL groups attached to the consumer) belongs to
  the rate-limit plans spec, and its ADR will extend this one.
