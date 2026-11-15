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
import { renderLlmsTxt, renderMarkdown } from './agent-docs.js';
import { publicDocument, type PublishedApi } from './catalog.js';
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
      version: '2.0.0',
      document,
      sourceContent: JSON.stringify(document),
      sourceFormat: 'json',
    });
    await db.insert(apiVersions).values({
      id: uuidv7(),
      apiId,
      title: 'Orders API',
      version: '1.0.0',
      document,
      sourceContent: '# preserved comment\nopenapi: 3.0.3\n',
      sourceFormat: 'yaml',
    });
    await db.insert(apiVersions).values({
      id: uuidv7(),
      apiId,
      title: 'Orders API',
      version: 'legacy',
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

it('renders empty and populated llms indexes with absolute links and first-line descriptions', () => {
  expect(renderLlmsTxt([], 'https://portal.example/')).toContain(
    'No APIs are published yet.',
  );
  const row = {
    api: { slug: 'orders' },
    version: {
      title: 'Orders',
      document: {
        info: {
          description: '\n[Purchase](https://example.com) history\nSecond line',
        },
      },
    },
  } as PublishedApi;
  const result = renderLlmsTxt([row], 'https://portal.example/');
  expect(result).toContain(
    '- [Orders](https://portal.example/api/v1/apis/orders/reference.md): [Purchase](https://example.com) history OpenAPI: https://portal.example/api/v1/apis/orders/spec',
  );
  expect(result).not.toContain('Second line');
  row.version.document.info = { description: 'a'.repeat(250) };
  expect(renderLlmsTxt([row], 'https://portal.example')).toContain(
    'a'.repeat(200) + ' OpenAPI:',
  );
  expect(renderLlmsTxt([row], 'https://portal.example')).not.toContain(
    'a'.repeat(201),
  );
});

it('renders local refs, parameter overrides, types, body, responses and empty paths', () => {
  const version = {
    id: 'old',
    title: 'Orders',
    version: 'v1+old',
    document: {},
  } as PublishedApi['version'];
  const row = {
    api: { slug: 'orders', routePath: '/orders', latestVersionId: 'latest' },
    gateway: { proxyPublicUrl: 'https://gateway.example/' },
    version,
  } as PublishedApi;
  const input = {
    info: { description: 'Order details' },
    components: {
      parameters: {
        Id: {
          name: 'id|value\nnext',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      },
      requestBodies: {
        Body: { required: true, content: { 'application/json': {} } },
      },
    },
    paths: {
      '/orders/{id}': {
        parameters: [
          { $ref: '#/components/parameters/Id' },
          { name: 'limit', in: 'query', schema: { type: 'string' } },
        ],
        get: {
          summary: 'List | orders',
          deprecated: true,
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            {
              name: 'tags',
              in: 'query',
              schema: { type: 'array', items: { type: 'string' } },
            },
            {
              name: 'filter',
              in: 'query',
              schema: { $ref: '#/components/schemas/Filter' },
            },
            { name: 'extra', in: 'query', schema: {} },
          ],
          requestBody: { $ref: '#/components/requestBodies/Body' },
          responses: { '200': {}, '404': {} },
        },
        post: {
          requestBody: { content: { 'text/plain': {} } },
          responses: { default: {} },
        },
      },
    },
  };
  const result = renderMarkdown(
    row,
    version,
    publicDocument(row, input),
    'https://portal.example/',
  );
  for (const part of [
    '# Orders v1+old',
    'Order details',
    'Base URL: https://gateway.example/orders',
    'Authentication: send your API key in the apikey header',
    'https://portal.example/api/v1/apis/orders/versions/v1%2Bold/spec',
    'https://portal.example/apis/orders/versions/v1%2Bold',
    '### GET /orders/{id}',
    'Deprecated.',
    '| id\\|value next | path | yes | string |',
    '| limit | query | no | integer |',
    '| tags | query | no | array<string> |',
    '| filter | query | no | Filter |',
    '| extra | query | no | object |',
    'Request body: application/json (required)',
    'Request body: text/plain (optional)',
    'Responses: 200, 404',
  ])
    expect(result).toContain(part);
  expect(result.split('### POST')[0]).not.toContain(
    '| limit | query | no | string |',
  );
  expect(renderMarkdown(row, version, {}, 'https://portal.example')).toContain(
    '## Operations',
  );
});

it('always renders the anonymous index regardless of session and apikey', async () => {
  const base = await server.inject('/api/v1/llms.txt');
  expect(base.statusCode).toBe(200);
  expect(base.headers['content-type']).toBe('text/plain; charset=utf-8');
  expect(base.headers['cache-control']).toBe('public, max-age=60');
  expect(base.body).toContain('/apis/open/reference.md');
  for (const slug of ['hidden', 'internal', 'manual', 'unpublished'])
    expect(base.body).not.toContain(`/apis/${slug}/`);
  for (const headers of [
    { cookie: 'session=ignored', 'x-viewer': 'admin' },
    { apikey: 'ignored' },
  ])
    expect(
      (await server.inject({ url: '/api/v1/llms.txt', headers })).body,
    ).toBe(base.body);
});

it('uses catalog visibility for all latest and version formats, with precise private 404s', async () => {
  for (const slug of [
    'open',
    'hidden',
    'internal',
    'manual',
    'unpublished',
    'missing',
  ]) {
    for (const suffix of [
      'reference.md',
      'spec',
      'versions/1.0.0/reference.md',
      'versions/1.0.0/spec',
    ]) {
      const response = await server.inject(`/api/v1/apis/${slug}/${suffix}`);
      expect(response.statusCode).toBe(slug === 'open' ? 200 : 404);
      if (slug !== 'open') {
        expect(response.headers['content-type']).toContain(
          'application/problem+json',
        );
        expect(response.json()).toMatchObject({
          type: '/problems/not-found',
          detail: `No published API with slug '${slug}'.`,
        });
      }
      if (['internal', 'manual'].includes(slug))
        expect(
          (
            await server.inject({
              url: `/api/v1/apis/${slug}/${suffix}`,
              headers: { 'x-viewer': 'member' },
            })
          ).statusCode,
        ).toBe(200);
    }
  }
  for (const suffix of ['reference.md', 'spec']) {
    const response = await server.inject(
      `/api/v1/apis/open/versions/missing/${suffix}`,
    );
    expect(response.statusCode).toBe(404);
    expect(response.json().detail).toBe("API 'open' has no version 'missing'.");
  }
});

it('preserves download source bytes and latest pointer, with JSON fallback and catalog links', async () => {
  const versions = await connection.db
    .select()
    .from(apiVersions)
    .where(eq(apiVersions.apiId, seeded.get('open')!.apiId));
  const legacy = versions.find((version) => version.version === 'legacy')!;
  for (const [suffix, expected, extension] of [
    ['spec', JSON.stringify(document), 'json'],
    ['versions/2.0.0/spec', JSON.stringify(document), 'json'],
    ['versions/1.0.0/spec', '# preserved comment\nopenapi: 3.0.3\n', 'yaml'],
    ['versions/legacy/spec', JSON.stringify(legacy.document, null, 2), 'json'],
  ]) {
    const response = await server.inject(`/api/v1/apis/open/${suffix}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(expected);
    expect(response.headers['content-type']).toContain(
      `application/${extension}`,
    );
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="open-${suffix === 'spec' ? '2.0.0' : suffix!.split('/')[1]}.${extension}"`,
    );
    expect(response.headers['cache-control']).toBe('private, no-cache');
  }
  const markdown = await server.inject('/api/v1/apis/open/reference.md');
  expect(markdown.headers['content-type']).toBe('text/markdown; charset=utf-8');
  expect(markdown.headers['cache-control']).toBe('private, no-cache');
  expect(markdown.body).toContain('# Orders API 2.0.0');
  expect(markdown.body).toContain('### DELETE /orders/{id}');
  const detail = (await server.inject('/api/v1/apis/open')).json();
  expect(detail.markdownUrl).toBe('/api/v1/apis/open/reference.md');
  expect(detail.downloadUrl).toBe('/api/v1/apis/open/spec');
  for (const version of detail.versions) {
    expect(version.markdownUrl).toBe(
      `/api/v1/apis/open/versions/${version.version}/reference.md`,
    );
    expect(version.downloadUrl).toBe(
      `/api/v1/apis/open/versions/${version.version}/spec`,
    );
  }
});

it('keeps concurrent repeated reads stable and treats expired sessions as anonymous', async () => {
  const index = await server.inject('/api/v1/llms.txt');
  const links = [...index.body.matchAll(/http:\/\/localhost:3000([^\s)]+)/g)];
  expect(links).toHaveLength(2);
  for (const [, url] of links) {
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        server.inject({
          url: url!,
          headers: {
            cookie: 'better-auth.session_token=expired',
            apikey: 'invalid',
          },
        }),
      ),
    );
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(responses[0]!.body);
    }
  }
  for (const slug of ['internal', 'manual', seeded.get('open')!.apiId]) {
    const response = await server.inject({
      url: `/api/v1/apis/${slug}/spec`,
      headers: {
        cookie: 'better-auth.session_token=expired',
        apikey: 'invalid',
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.json().detail).toBe(
      `No published API with slug '${slug}'.`,
    );
  }
});
