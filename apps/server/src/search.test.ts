// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  connect,
  migrate,
  user,
  teams,
  teamMembers,
  gateways,
  instanceSettings,
  apis,
  apiVersions,
  products,
  productApis,
  productTeams,
  plans,
  apps,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { Auth } from './auth.js';
import type { SearchResults } from '@portal/sdk';
let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
const ids = { admin: uuidv7(), member: uuidv7(), outsider: uuidv7() };
const teamId = uuidv7(),
  gatewayId = uuidv7();
const seeded = new Map<string, { apiId: string; productId: string }>();
const document = {
  openapi: '3.0.3',
  info: { title: 'Orders API', version: '1' },
  paths: {
    '/orders': { get: { summary: 'List orders' } },
    '/orders/{id}': {
      delete: {
        summary: 'Cancel order',
        operationId: 'cancelOrder',
        tags: ['Orders'],
      },
    },
  },
};
const auth = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      const name = headers.get('x-viewer') as keyof typeof ids | null;
      return name && ids[name]
        ? {
            user: {
              id: ids[name],
              role: name === 'admin' ? 'admin' : 'developer',
              emailVerified: true,
            },
          }
        : null;
    },
  },
} as unknown as Auth;
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  await migrate(url);
  connection = connect(url);
  const db = connection.db;
  await db.insert(user).values(
    Object.entries(ids).map(([name, id]) => ({
      id,
      name,
      email: `${name}@example.com`,
      emailVerified: true,
      role: name === 'admin' ? 'admin' : 'developer',
    })),
  );
  await db.insert(teams).values({ id: teamId, name: 'Members' });
  await db
    .insert(teamMembers)
    .values({ teamId, userId: ids.member, role: 'member' });
  await db.insert(instanceSettings).values({ id: 1, instanceId: uuidv7() });
  await db.insert(gateways).values({
    id: gatewayId,
    name: 'Kong',
    kind: 'kong',
    adminUrl: 'http://kong',
    proxyPublicUrl: 'http://kong',
    proxyInternalUrl: 'http://kong',
  });
  for (const visibility of ['open', 'hidden', 'internal', 'manual'] as const) {
    const apiId = uuidv7(),
      productId = uuidv7(),
      versionId = uuidv7();
    seeded.set(visibility, { apiId, productId });
    await db.insert(apis).values({
      id: apiId,
      slug: visibility,
      gatewayId,
      gatewayServiceId: apiId,
      gatewayServiceName: visibility,
      routePath: `/${visibility}`,
    });
    await db.insert(apiVersions).values({
      id: versionId,
      apiId,
      title: 'Orders API',
      description: 'Purchase history',
      version: '1',
      document,
    });
    await db
      .update(apis)
      .set({ latestVersionId: versionId })
      .where(eq(apis.id, apiId));
    await db.insert(products).values({
      id: productId,
      slug: visibility,
      name: visibility,
      description: visibility,
      visibility,
    });
    await db.insert(productApis).values({ productId, apiId });
    if (visibility === 'internal')
      await db.insert(productTeams).values({ productId, teamId });
    if (visibility === 'manual') {
      const planId = uuidv7();
      await db.insert(plans).values({
        id: planId,
        productId,
        name: 'Assigned',
        rateLimit: 10,
        rateLimitUnit: 'minute',
        monthlyQuota: 100,
      });
      await db.insert(apps).values({
        id: uuidv7(),
        teamId,
        planId,
        name: 'Assigned app',
        origin: 'admin',
        status: 'active',
      });
    }
  }
  await db.insert(apis).values({
    id: uuidv7(),
    slug: 'unpublished',
    gatewayId,
    gatewayServiceId: 'unpublished',
    gatewayServiceName: 'Unpublished',
    routePath: '/unpublished',
  });
  ({ app: server } = await createApp({
    db,
    auth,
    config: loadConfig({ DATABASE_URL: url }),
    logger: false,
  }));
});
afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await container?.stop();
});
const search = (
  q: string,
  viewer?: keyof typeof ids,
  ip = '127.0.0.1',
  suffix = '',
) =>
  server.inject({
    url: `/api/v1/search?q=${encodeURIComponent(q)}${suffix}`,
    headers: viewer ? { 'x-viewer': viewer } : {},
    remoteAddress: ip,
  });
it('AC1/2/6: matches paths, API metadata and summaries with empty results as 200', async () => {
  const path = await search('orders/{id}');
  expect(path.statusCode).toBe(200);
  expect(path.json().items).toEqual([
    expect.objectContaining({
      kind: 'operation',
      method: 'DELETE',
      path: '/orders/{id}',
      api: { slug: 'open', title: 'Orders API', version: '1' },
      summary: 'Cancel order',
      operationId: 'cancelOrder',
      tags: ['Orders'],
    }),
  ]);
  expect((await search('orders api')).json().items).toHaveLength(1);
  expect((await search('cancel order')).json().items[0].method).toBe('DELETE');
  expect((await search('purchase history')).json().items[0].kind).toBe('api');
  const empty = await search('nothing matches');
  expect(empty.statusCode).toBe(200);
  expect(empty.json()).toEqual({ items: [], truncated: false });
  expect(
    (await search('orders', undefined, '127.0.0.1', '&limit=1')).json(),
  ).toMatchObject({ truncated: true, items: [expect.any(Object)] });
});
it('AC3/4: search uses exactly catalog visibility and excludes unpublished APIs', async () => {
  for (const viewer of [undefined, 'member', 'outsider', 'admin'] as const) {
    const catalog = await server.inject({
      url: '/api/v1/apis',
      headers: viewer ? { 'x-viewer': viewer } : {},
    });
    const expected =
      viewer === 'admin' || viewer === 'member'
        ? ['hidden', 'internal', 'manual', 'open']
        : viewer === 'outsider'
          ? ['hidden', 'open']
          : ['open'];
    expect(
      catalog
        .json()
        .items.map((item: { slug: string }) => item.slug)
        .sort(),
    ).toEqual(expected);
    const found = (await search('orders', viewer)).json<SearchResults>();
    expect(
      [...new Set(found.items.map((item) => item.api.slug))].sort(),
    ).toEqual(expected);
  }
});
it('AC3: a lint-refused import stores nothing and cannot be searched', async () => {
  const rejected = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/apis',
    headers: { 'x-viewer': 'admin' },
    payload: {
      gatewayServiceId: 'refused',
      slug: 'refused',
      spec: {
        content: JSON.stringify({
          ...document,
          info: { title: 'Refused API', version: '1' },
          paths: { '/refused': { get: { summary: 'Refused operation' } } },
        }),
      },
    },
  });
  expect(rejected.statusCode, rejected.body).toBe(422);
  expect(rejected.json().type).toBe('/problems/openapi-lint-failed');
  expect((await search('refused', 'admin')).json().items).toEqual([]);
});
it('AC5: next search reflects a new latest version and visibility changes without waiting', async () => {
  const { apiId, productId } = seeded.get('open')!;
  const versionId = uuidv7();
  await connection.db.insert(apiVersions).values({
    id: versionId,
    apiId,
    title: 'Orders API',
    version: '2',
    document: {
      ...document,
      paths: { '/purchases': { get: { summary: 'List purchases' } } },
    },
  });
  const latest = await server.inject({
    method: 'PUT',
    url: '/api/v1/admin/apis/open/latest-version',
    headers: { 'x-viewer': 'admin' },
    payload: { version: '2' },
  });
  expect(latest.statusCode, latest.body).toBe(200);
  expect((await search('GET /orders')).json().items).toEqual([]);
  expect((await search('GET /purchases')).json().items[0].api.version).toBe(
    '2',
  );
  const restricted = await server.inject({
    method: 'PUT',
    url: `/api/v1/admin/products/${productId}/access`,
    headers: { 'x-viewer': 'admin' },
    payload: { visibility: 'internal', teamIds: [teamId] },
  });
  expect(restricted.statusCode, restricted.body).toBe(200);
  expect((await search('orders')).json().items).toEqual([]);
  await connection.db
    .update(products)
    .set({ visibility: 'open' })
    .where(eq(products.id, productId));
});
it('AC7: validates term boundaries and limits and treats special characters literally', async () => {
  for (const q of ['', '   ', 'x'.repeat(101)]) {
    const result = await search(q);
    expect(result.statusCode).toBe(400);
    expect(result.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(result.json()).toMatchObject({
      type: '/problems/validation',
      detail:
        q.length === 101
          ? 'Search terms can be at most 100 characters.'
          : 'Enter a search term.',
    });
  }
  expect((await server.inject('/api/v1/search')).json().detail).toBe(
    'Enter a search term.',
  );
  for (const q of ['x', 'x'.repeat(100), '{}/*%', '\\_\'"', '日本語'])
    expect((await search(q)).statusCode).toBe(200);
  for (const limit of ['0', '51', '1.5', 'abc', ''])
    expect(
      (await search('orders', undefined, '127.0.0.1', `&limit=${limit}`))
        .statusCode,
    ).toBe(400);
});
it('limits anonymous IPs to 60/min and signed-in users to 120/min across IPs; catalog is unscoped', async () => {
  for (let i = 0; i < 60; i++)
    expect((await search('orders', undefined, '192.0.2.10')).statusCode).toBe(
      200,
    );
  const blocked = await search('orders', undefined, '192.0.2.10');
  expect(blocked.statusCode).toBe(429);
  expect(blocked.json().type).toBe('/problems/rate-limited');
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  expect((await search('orders', undefined, '192.0.2.11')).statusCode).toBe(
    200,
  );
  // Use an identity unused by earlier searches for an exact fresh user bucket.
  const freshId = uuidv7();
  await connection.db.insert(user).values({
    id: freshId,
    name: 'Fresh',
    email: 'fresh@example.com',
    role: 'developer',
    emailVerified: true,
  });
  ids.outsider = freshId;
  for (let i = 0; i < 120; i++)
    expect(
      (await search('orders', 'outsider', i % 2 ? '192.0.2.10' : '192.0.2.11'))
        .statusCode,
    ).toBe(200);
  const userBlocked = await search('orders', 'outsider', '192.0.2.12');
  expect(userBlocked.statusCode).toBe(429);
  expect(userBlocked.headers['retry-after']).toBeDefined();
  expect(
    (await server.inject({ url: '/api/v1/apis', remoteAddress: '192.0.2.10' }))
      .statusCode,
  ).toBe(200);
});
