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
  capabilities(): Capabilities;
  discover(): Promise<DiscoveredApi[]>;
  ensureConsumer(dev: DeveloperRef): Promise<ExternalId>;
  issueCredential(app: AppRef, kind: "api-key" | "oauth-client"): Promise<Credential>;
  revokeCredential(cred: CredentialRef): Promise<void>;
  applyPlan(app: AppRef, plan: PlanSpec): Promise<void>;
  usage(app: AppRef, window: TimeWindow): Promise<UsageSeries>;
  health(): Promise<HealthReport>;
}
```
- Desired state in Postgres, actual state in the gateway; a reconcile job repairs drift.
- Every call idempotent; gateway objects tagged with the portal ID.
- Every adapter passes the shared conformance suite in CI.

## Security
- Never commit, log or return secrets, API keys or gateway admin tokens.
- Gateway admin credentials encrypted at rest.
- Tenant/custom code (widgets) runs sandboxed; never on the origin holding sessions.

## Testing
- Unit: Vitest next to the code.
- Integration: Vitest + Testcontainers (real Postgres, real Kong).
- E2E: Playwright in `apps/portal/e2e/`.
- No sleeps, no real external services beyond containers.

## Git
- Trunk-based: `main` always releasable.
- Every spec gets its own Orca worktree on branch `feat/<linear-key>-<spec-id>-<slug>`,
  linked to its Linear feature issue (`node scripts/factory.mjs start <id>` creates it).
- Agents commit inside their worktree but never create, switch, merge or push branches.
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
