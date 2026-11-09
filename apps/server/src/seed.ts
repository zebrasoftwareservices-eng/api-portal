// SPDX-License-Identifier: Apache-2.0
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { uuidv7 } from 'uuidv7';
import { apis } from '@portal/db';
import { eq } from 'drizzle-orm';
import type { DbConnection } from './gateway-connection.js';
import { KongAdapter } from '@portal/adapter-kong';
import { portalTags } from '@portal/adapter-sdk';
export async function seedSample(
  db: DbConnection,
  adapter: KongAdapter,
  gatewayId: string,
  instanceId: string,
) {
  const [published] = await db
    .select({ id: apis.id })
    .from(apis)
    .where(eq(apis.slug, 'sample'));
  if (published) return;
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
  const values = {
    title: 'Sample HTTP API',
    version: '1.0.0',
    description: 'A small HTTP API for trying your portal API key.',
    gatewayId,
    gatewayServiceId: service.id,
    gatewayServiceName: service.name,
    routePath: '/sample',
    document,
  };
  await db
    .insert(apis)
    .values({ id: uuidv7(), slug: 'sample', ...values })
    .onConflictDoNothing();
}
