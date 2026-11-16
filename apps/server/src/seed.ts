// SPDX-License-Identifier: Apache-2.0
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { uuidv7 } from 'uuidv7';
import { apis, apiVersions } from '@portal/db';
import { eq } from 'drizzle-orm';
import { TransactionRollbackError } from 'drizzle-orm/errors';
import type { DbConnection } from './gateway-connection.js';
import { KongAdapter } from '@portal/adapter-kong';
import { portalTags } from '@portal/adapter-sdk';
const SKIP =
  'Sample seed skipped: slug "sample" is taken by an admin-published API';
export async function seedSample(
  db: DbConnection,
  adapter: KongAdapter,
  gatewayId: string,
  instanceId: string,
  log?: { info(message: string): void },
) {
  const [published] = await db
    .select({ id: apis.id, seeded: apis.seeded })
    .from(apis)
    .where(eq(apis.slug, 'sample'));
  if (published && !published.seeded) {
    log?.info(SKIP);
    return;
  }
  const tags = [...portalTags(instanceId), 'portal-seed'];
  await adapter.request('/services/portal-sample', 'PUT', {
    name: 'portal-sample',
    url: 'http://httpbin:8080',
    tags,
  });
  await adapter.request('/routes/portal-sample', 'PUT', {
    name: 'portal-sample',
    service: { name: 'portal-sample' },
    paths: ['/sample'],
    strip_path: true,
    tags,
  });
  await adapter.request(
    '/plugins/02d7a773-f31b-458e-a2b6-746e8811fc00',
    'PUT',
    {
      name: 'key-auth',
      service: { name: 'portal-sample' },
      config: { key_names: ['apikey'], hide_credentials: true },
      tags,
    },
  );
  const service = await adapter.getService('portal-sample');
  if (!service) throw new Error('Seed service missing');
  // Existing installs need subscription memberships before the first allow ACL.
  // Startup reconcile protects existing rows after backfilling them.
  const existing = await db.select({ id: apis.id }).from(apis);
  if (existing.length === 0) await adapter.protectService({ id: service.id });
  const document = parse(
    await readFile(
      new URL('../seed/sample-api.openapi.yaml', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;
  try {
    await db.transaction(async (tx) => {
      const [api] = await tx
        .insert(apis)
        .values({
          id: uuidv7(),
          slug: 'sample',
          gatewayId,
          gatewayServiceId: service.id,
          gatewayServiceName: service.name,
          routePath: '/sample',
          seeded: true,
        })
        .onConflictDoUpdate({
          target: apis.slug,
          set: {
            gatewayServiceId: service.id,
            gatewayServiceName: service.name,
            updatedAt: new Date(),
          },
          where: eq(apis.seeded, true),
        })
        .returning();
      if (!api) {
        log?.info(SKIP);
        tx.rollback();
        return;
      }
      const [version] = await tx
        .insert(apiVersions)
        .values({
          id: uuidv7(),
          apiId: api.id,
          version: '1.0.0',
          title: 'Sample HTTP API',
          description: 'A small HTTP API for trying your portal API key.',
          document,
        })
        .onConflictDoUpdate({
          target: [apiVersions.apiId, apiVersions.version],
          set: { document },
        })
        .returning();
      if (!api.latestVersionId && version)
        await tx
          .update(apis)
          .set({ latestVersionId: version.id })
          .where(eq(apis.id, api.id));
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) return;
    throw error;
  }
}
