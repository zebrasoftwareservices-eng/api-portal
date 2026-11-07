# Engineering conventions

## Repo layout

```
apps/portal          Next.js developer portal (public docs, developer area, admin)
apps/server          Fastify control-plane API + reconcile jobs
packages/adapter-sdk GatewayAdapter interface + conformance tests
packages/adapter-kong, packages/adapter-aws
packages/db          Drizzle schema + migrations
packages/ui          Shared components + design tokens
packages/sdk         Generated TypeScript client for the server API
deploy/              docker-compose.yml, helm/
docs/specs · docs/adr · docs/design
```

## Code

- TypeScript strict everywhere; ESLint + Prettier; no `any` without a comment saying why.
- OpenAPI-first: `apps/server/openapi.yaml` is the contract. Change it before handlers;
  the frontend uses the generated client in `packages/sdk`.
- Errors: RFC 9457 problem+json. IDs: UUIDv7. Timestamps: UTC ISO 8601.
- Validate input at every boundary.

## Gateway adapters

```ts
interface GatewayAdapter {
  capabilities(): Capabilities; // includes accessControl: true
  health(): Promise<HealthReport>;
  listServices(): Promise<GatewayService[]>;
  getService(idOrName: string): Promise<GatewayService | null>;
  ensureConsumer(app: AppRef): Promise<ConsumerRef>;
  deleteConsumer(app: AppRef): Promise<void>;
  issueCredential(
    app: AppRef,
    credential: CredentialSpec,
  ): Promise<IssuedCredential>;
  revokeCredential(app: AppRef, credentialId: string): Promise<void>;
  listOwnedConsumers(): Promise<OwnedConsumer[]>;
  grantAccess(app: AppRef, service: ServiceRef): Promise<void>;
  revokeAccess(app: AppRef, service: ServiceRef): Promise<void>;
  protectService(service: ServiceRef): Promise<ServiceProtection>;
  applyAccessPolicy(policy: AccessPolicy): Promise<AccessReport>;
  isAccessDenied(response: {
    status: number;
    headers: Headers;
    body: Uint8Array;
  }): boolean;
}
```

- Desired state in Postgres, actual state in the gateway; a reconcile job repairs drift.
- Every call idempotent; gateway objects tagged with the portal ID.
- Every adapter passes the shared conformance suite in CI, including tagged, idempotent
  access grants, missing revokes and unavailable-gateway errors.
- Access belongs to the app; subscriptions grant service access before credentials are issued.
  Kong groups and plugin details stay in the adapter, never in server handlers.
- The access-policy snapshot is fully read before writes. Add memberships before enforcing
  ACLs; the first upgrade waits six seconds for Kong propagation before plugin changes.
- Only portal-owned consumers are reconciled. Foreign ACLs are not edited. Managed
  service/route key-auth hides credentials; global key-auth is copied at service scope.
- Import takes a service advisory lock and the shared reconcile lock before protecting and
  publishing a service. App creation holds that shared reconcile lock across gateway writes.
- See [the access-control upgrade notes](upgrade-004-access-control.md) for operator impact,
  conflict handling, propagation assumptions and plugin removal.

## Security

- Never commit, log or return secrets, API keys or gateway admin tokens.
- Gateway admin credentials encrypted at rest.
- Tenant/custom code (widgets) runs sandboxed; never on the origin holding sessions.

## Testing

- Unit: Vitest next to the code.
- Integration: Vitest + Testcontainers (real Postgres, real Kong).
- E2E: Playwright in `apps/portal/e2e/`.
- Poll for gateway propagation in integration tests; no arbitrary test sleeps or real external
  services beyond containers. The production access-policy upgrade settle wait is deliberate.

## Git

- Trunk-based: `main` always releasable.
- Every spec gets its own Orca worktree on branch `feat/<linear-key>-<spec-id>-<slug>`,
  linked to its Linear feature issue (`node scripts/factory.mjs start <id>` creates it).
- Agents commit inside their worktree and may push their own feature branch and open its PR,
  but never create or switch branches, force-push, push to `main` or merge. Only Elango merges.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), DCO sign-off (`git commit -s`).
- Every commit message ends with `Refs <feature key>` (for example `Refs JSO-117`).
- One spec per PR; the PR title ends with the feature key, the description says `Fixes <feature key>`,
  links the spec and pastes its test report.
- Releases via Changesets; images published to GitHub Container Registry.

## Deploys

- Private GitHub repo `zebrasoftwareservices-eng/api-portal`; `main` is protected by process: only Elango merges.
- Vercel project `api-portal` builds `apps/portal` (Next.js, Node 22). Merge to `main` = production deploy;
  each PR gets a preview URL the user-tester can test.
- Never commit secrets; Vercel environment variables hold `SERVER_URL` and any keys.
