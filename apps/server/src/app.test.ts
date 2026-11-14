// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  connect,
  migrate,
  gateways,
  apis,
  apiVersions,
  apps,
  credentials,
  user,
  instanceSettings,
  subscriptions,
  session,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GatewayUnavailableError,
  GatewayServiceConflictError,
  type GatewayAdapter,
} from '@portal/adapter-sdk';
import { KongAdapter } from '@portal/adapter-kong';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { seedSample } from './seed.js';
import { createAuth } from './auth.js';
import { reconcile } from './reconcile.js';
import { gatewayConnection } from './gateway-connection.js';
const runtime = () =>
  gatewayConnection(
    connection.db,
    loadConfig({}),
    'test',
    { error: () => {} },
    () => adapter,
  );
let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
let cookie: string;
let secondCookie: string;
let ownerId: string;
const gatewayId = uuidv7(),
  apiId = uuidv7();
const owned = new Map<
  string,
  {
    id: string;
    username: string;
    appId: string;
    tags: string[];
    credentials: { id: string; tags: string[] }[];
  }
>();
const adapter: GatewayAdapter = {
  kind: 'kong',
  capabilities: () => ({
    apiKeys: true,
    accessControl: true,
    oauthClients: false,
    plans: false,
    usage: false,
  }),
  checkConnection: async () => ({ outcome: 'ok', version: '3.9.4' }),
  checkProxy: async () => true,
  health: async () => ({ reachable: true, latencyMs: 1 }),
  listServices: async () => [
    {
      id: 'service',
      name: 'pets',
      routes: [{ id: 'route', name: null, paths: ['/sample'] }],
      keyAuth: true,
    },
  ],
  getService: async (id) => ({
    id,
    name: 'pets',
    routes: [{ id: 'route', name: null, paths: ['/sample'] }],
    keyAuth: true,
  }),
  ensureConsumer: vi.fn(async (app) => {
    if (owned.has(app.id)) return owned.get(app.id)!;
    const value = {
      id: uuidv7(),
      username: `portal-app-${app.id}`,
      appId: app.id,
      tags: [],
      credentials: [],
    };
    owned.set(app.id, value);
    return value;
  }),
  deleteConsumer: vi.fn(async (app) => {
    owned.delete(app.id);
  }),
  issueCredential: vi.fn(async (app, cred) => {
    owned.get(app.id)?.credentials.push({ id: cred.id, tags: [] });
    return { id: cred.id };
  }),
  revokeCredential: vi.fn(async (app, id) => {
    const c = owned.get(app.id);
    if (c) c.credentials = c.credentials.filter((k) => k.id !== id);
  }),
  grantAccess: vi.fn(async () => {}),
  revokeAccess: vi.fn(async () => {}),
  protectService: vi.fn(async () => ({ keyAuth: true, findings: [] })),
  applyAccessPolicy: vi.fn(async () => ({ repairs: [], findings: [] })),
  isAccessDenied: (response) =>
    new KongAdapter({
      adminUrl: 'http://unused',
      instanceId: 'test',
    }).isAccessDenied(response),
  listOwnedConsumers: async () => [...owned.values()],
};
const proxyFetch = vi.fn().mockImplementation(
  async () =>
    new Response('gateway 401', {
      status: 401,
      headers: {
        'content-type': 'text/plain',
        'set-cookie': 'bad=session',
        'x-upstream': 'test',
      },
    }),
);
const logs: string[] = [];
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  await migrate(url);
  connection = connect(url);
  await connection.db.insert(gateways).values({
    id: gatewayId,
    name: 'default',
    kind: 'kong',
    adminUrl: 'http://kong:8001',
    proxyPublicUrl: 'http://localhost:8000',
    proxyInternalUrl: 'http://kong:8000',
  });
  await connection.db
    .insert(instanceSettings)
    .values({ id: 1, instanceId: uuidv7() });
  await connection.db.insert(apis).values({
    id: apiId,
    slug: 'sample',
    gatewayId,
    gatewayServiceId: 'service',
    gatewayServiceName: 'pets',
    routePath: '/sample',
  });
  await connection.db.insert(apiVersions).values({
    id: apiId,
    apiId,
    title: 'Sample',
    version: '0.1.0',
    document: {
      openapi: '3.1.0',
      info: { title: 'Sample', version: '0.1.0' },
      paths: {},
    },
  });
  await connection.db
    .update(apis)
    .set({ latestVersionId: apiId })
    .where(eq(apis.id, apiId));
  ({ app: server } = await createApp({
    db: connection.db,
    config: loadConfig({ DATABASE_URL: url }),
    adapterFor: () => adapter,
    proxyFetch,
    logger: {
      stream: {
        write: (s: string) => {
          logs.push(s);
        },
      },
    },
  }));
  await server.inject({
    method: 'POST',
    url: '/api/v1/setup/admin',
    payload: { email: 'bootstrap@example.com', password: 'test-password-123' },
  });
  const signup = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: 'dev@example.com',
      password: 'test-password-123',
      name: 'Developer',
      role: 'admin',
    },
  });
  expect(signup.statusCode, signup.body).toBe(200);
  cookie = signup.headers['set-cookie']?.toString().split(';')[0] ?? '';
  ownerId = signup.json().user.id;
  const second = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: 'second@example.com',
      password: 'test-password-123',
      name: 'Second',
    },
  });
  secondCookie = second.headers['set-cookie']?.toString().split(';')[0] ?? '';
});
afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await container?.stop();
});
describe('contract endpoints', () => {
  it('signs up with UUIDv7, prevents role escalation and enforces session/admin boundaries', async () => {
    expect(ownerId[14]).toBe('7');
    const me = await server.inject({ url: '/api/v1/me', headers: { cookie } });
    expect(me.json().role).toBe('developer');
    expect((await server.inject('/api/v1/me')).statusCode).toBe(401);
    expect(
      (
        await server.inject({
          url: '/api/v1/admin/gateway/services',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect((await server.inject('/api/v1/health')).json()).toMatchObject({
      status: 'ok',
      version: 'dev',
      gateway: { reachable: true },
    });
    expect((await server.inject('/api/v1/health/live')).json()).toEqual({
      status: 'ok',
    });
    expect((await server.inject('/api/v1/health/ready')).json()).toEqual({
      status: 'ok',
      database: 'ok',
    });
  });
  it('serves catalog and rewritten OpenAPI without exposing gateway credentials', async () => {
    expect((await server.inject('/api/v1/apis')).json().items).toHaveLength(1);
    expect(
      (await server.inject('/api/v1/apis/sample')).json().documentUrl,
    ).toBe('/api/v1/apis/sample/openapi.json');
    expect(
      (await server.inject('/api/v1/apis/sample/openapi.json')).json().servers,
    ).toEqual([{ url: 'http://localhost:8000/sample' }]);
    expect((await server.inject('/api/v1/apis/missing')).statusCode).toBe(404);
  });
  it('rejects invalid app bodies and expired sessions without gateway side effects', async () => {
    const calls = vi.mocked(adapter.ensureConsumer).mock.calls.length;
    for (const payload of [
      { name: '', apiIds: [apiId] },
      { name: 'invalid', apiIds: [] },
      { name: 'invalid', apiIds: ['not-a-uuid'] },
    ]) {
      const result = await server.inject({
        method: 'POST',
        url: '/api/v1/apps',
        headers: { cookie },
        payload,
      });
      expect(result.statusCode, result.body).toBe(400);
      expect(result.headers['content-type']).toContain(
        'application/problem+json',
      );
    }
    const expired = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      headers: { cookie: 'better-auth.session_token=expired.invalid' },
      payload: { name: 'expired', apiIds: [apiId] },
    });
    expect(expired.statusCode).toBe(401);
    expect(vi.mocked(adapter.ensureConsumer).mock.calls).toHaveLength(calls);
    expect(await connection.db.select().from(apps)).toHaveLength(0);
  });
  it('rejects a previously valid session after its stored expiry', async () => {
    const signup = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Expired',
        email: 'expired@example.com',
        password: 'test-password-123',
      },
    });
    expect(signup.statusCode).toBe(200);
    const expiredCookie =
      signup.headers['set-cookie']?.toString().split(';')[0] ?? '';
    await connection.db
      .update(session)
      .set({ expiresAt: new Date(0) })
      .where(eq(session.userId, signup.json().user.id));
    const result = await server.inject({
      url: '/api/v1/me',
      headers: { cookie: expiredCookie },
    });
    expect(result.statusCode).toBe(401);
    expect(result.json().type).toBe('/problems/unauthenticated');
    const consumersBefore = vi.mocked(adapter.ensureConsumer).mock.calls.length;
    const grantsBefore = vi.mocked(adapter.grantAccess).mock.calls.length;
    const keysBefore = vi.mocked(adapter.issueCredential).mock.calls.length;
    const appsBefore = await connection.db.select().from(apps);
    const create = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      headers: { cookie: expiredCookie },
      payload: { name: 'expired-session-access', apiIds: [apiId] },
    });
    expect(create.statusCode).toBe(401);
    expect(create.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(create.json().type).toBe('/problems/unauthenticated');
    expect(create.body).not.toContain('pk_');
    expect(vi.mocked(adapter.ensureConsumer).mock.calls).toHaveLength(
      consumersBefore,
    );
    expect(vi.mocked(adapter.grantAccess).mock.calls).toHaveLength(
      grantsBefore,
    );
    expect(vi.mocked(adapter.issueCredential).mock.calls).toHaveLength(
      keysBefore,
    );
    expect(await connection.db.select().from(apps)).toEqual(appsBefore);
  });
  it('compensates a credential failure and permits a clean retry', async () => {
    vi.mocked(adapter.issueCredential).mockRejectedValueOnce(
      new GatewayUnavailableError(),
    );
    const body = { name: 'retry-app', apiIds: [apiId] };
    const failed = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      headers: { cookie },
      payload: body,
    });
    expect(failed.statusCode, failed.body).toBe(503);
    expect(failed.headers['retry-after']).toBe('5');
    expect(await connection.db.select().from(apps)).toHaveLength(0);
    expect(owned.size).toBe(0);
    const result = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      headers: { cookie },
      payload: body,
    });
    expect(result.statusCode, result.body).toBe(201);
    expect(result.json().credential.key).toMatch(/^pk_[A-Za-z0-9_-]{43}$/);
    expect(owned.size).toBe(1);
    const stored = await connection.db.select().from(credentials);
    expect(stored[0]?.keyHint).toBe(result.json().credential.key.slice(-4));
    expect(JSON.stringify(stored)).not.toContain('pk_');
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/apps',
          headers: { cookie },
          payload: body,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({
          url: `/api/v1/apps/${result.json().app.id}`,
          headers: { cookie: secondCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          url: `/api/v1/apps/${result.json().app.id}`,
          headers: { cookie },
        })
      ).body,
    ).not.toContain('pk_');
  });
  it('compensates failed grants before key creation and leaves no app or consumer', async () => {
    const beforeApps = await connection.db.select().from(apps);
    const beforeConsumers = owned.size;
    const issueCalls = vi.mocked(adapter.issueCredential).mock.calls.length;
    vi.mocked(adapter.grantAccess).mockRejectedValueOnce(
      new GatewayUnavailableError(),
    );
    const result = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      headers: { cookie },
      payload: { name: 'grant-failure', apiIds: [apiId] },
    });
    expect(result.statusCode).toBe(503);
    expect(result.body).not.toContain('pk_');
    expect(await connection.db.select().from(apps)).toEqual(beforeApps);
    expect(owned.size).toBe(beforeConsumers);
    expect(vi.mocked(adapter.issueCredential).mock.calls).toHaveLength(
      issueCalls,
    );
    expect(result.json()).toMatchObject({
      type: '/problems/gateway-unavailable',
      status: 503,
    });
    const retry = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      headers: { cookie },
      payload: { name: 'grant-failure', apiIds: [apiId] },
    });
    expect(retry.statusCode, retry.body).toBe(201);
    expect(owned.size).toBe(beforeConsumers + 1);
    const retryApp = retry.json().app.id;
    expect(owned.get(retryApp)?.credentials).toHaveLength(1);
    expect(vi.mocked(adapter.grantAccess)).toHaveBeenLastCalledWith(
      { id: retryApp },
      { id: 'service' },
    );
  });
  it('serializes concurrent key creation to five keys and preserves active status on revoke failure', async () => {
    const [app] = await connection.db.select().from(apps);
    if (!app) throw new Error('No app');
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        server.inject({
          method: 'POST',
          url: `/api/v1/apps/${app.id}/credentials`,
          headers: { cookie },
        }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(4);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(1);
    const [key] = await connection.db.select().from(credentials);
    if (!key) throw new Error('No key');
    vi.mocked(adapter.revokeCredential).mockRejectedValueOnce(
      new GatewayUnavailableError(),
    );
    const url = `/api/v1/apps/${app.id}/credentials/${key.id}`;
    expect(
      (await server.inject({ method: 'DELETE', url, headers: { cookie } }))
        .statusCode,
    ).toBe(503);
    expect(
      (
        await connection.db
          .select()
          .from(credentials)
          .where(eq(credentials.id, key.id))
      )[0]?.status,
    ).toBe('active');
    expect(
      (await server.inject({ method: 'DELETE', url, headers: { cookie } }))
        .statusCode,
    ).toBe(204);
    expect(
      (await server.inject({ method: 'DELETE', url, headers: { cookie } }))
        .statusCode,
    ).toBe(204);
  });
  it('passes through gateway responses and strips portal cookies, arbitrary headers and upstream cookies', async () => {
    const response = await server.inject({
      url:
        '/api/v1/try-it?scalar_url=' +
        encodeURIComponent('http://localhost:8000/sample/get'),
      headers: {
        cookie,
        apikey: 'pk_test',
        authorization: 'portal-secret',
        'x-forwarded-for': '1.2.3.4',
      },
    });
    expect(response.statusCode, response.body).toBe(401);
    expect(response.body).toBe('gateway 401');
    expect(response.headers['set-cookie']).toBeUndefined();
    const init = proxyFetch.mock.calls[0]?.[1];
    expect(init.headers.get('apikey')).toBe('pk_test');
    expect(init.headers.get('cookie')).toBeNull();
    expect(init.headers.get('authorization')).toBeNull();
    expect(init.redirect).toBe('manual');
    expect(
      (await server.inject('/api/v1/try-it?scalar_url=http://evil.test'))
        .statusCode,
    ).toBe(400);
    const raw = ' { "message": "hello" } ';
    await server.inject({
      method: 'POST',
      url: '/api/v1/try-it?scalar_url=http://localhost:8000/sample/post',
      headers: { 'content-type': 'application/json' },
      payload: raw,
    });
    expect(Buffer.from(proxyFetch.mock.calls.at(-1)?.[1].body).toString()).toBe(
      raw,
    );
    expect(logs.join('')).not.toContain('pk_');
    expect(logs.join('')).not.toContain('test-password-123');
  });
  it('uses action-neutral outage copy when try-it cannot reach the gateway', async () => {
    proxyFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    const response = await server.inject(
      '/api/v1/try-it?scalar_url=http://localhost:8000/sample/get',
    );
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      type: '/problems/gateway-unavailable',
      status: 503,
      detail: "The API gateway didn't respond. Try again in a moment.",
    });
  });
  it('rewrites only gateway ACL 403s with the UX problem and preserves gateway headers', async () => {
    const url = '/api/v1/try-it?scalar_url=http://localhost:8000/sample/get';
    const body = JSON.stringify({ message: 'You cannot consume this service' });
    proxyFetch.mockResolvedValueOnce(
      new Response(body, {
        status: 403,
        headers: { 'x-kong-request-id': 'test' },
      }),
    );
    const refused = await server.inject(url);
    expect(refused.statusCode).toBe(403);
    expect(refused.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(refused.headers['x-kong-request-id']).toBe('test');
    expect(refused.json()).toEqual({
      type: '/problems/api-access-denied',
      title: "This key doesn't have access to this API",
      status: 403,
      detail:
        "This key's app doesn't have access to this API. Select Get an API key on this page, create an app that includes this API, and send the request with the new key. If this key's app should already have access, tell the portal admin.",
    });
    proxyFetch.mockResolvedValueOnce(
      new Response(body, {
        status: 403,
        headers: { 'x-kong-upstream-latency': '1' },
      }),
    );
    expect((await server.inject(url)).body).toBe(body);
  });
  it('rewrites negotiated XML ACL refusals and preserves XML upstream 403s', async () => {
    const url = '/api/v1/try-it?scalar_url=http://localhost:8000/sample/get';
    const body =
      '<error><message>You cannot consume this service</message></error>';
    proxyFetch.mockResolvedValueOnce(
      new Response(body, {
        status: 403,
        headers: {
          'content-type': 'application/xml',
          'x-kong-request-id': 'xml-refusal',
        },
      }),
    );
    const refused = await server.inject({
      url,
      headers: { accept: 'application/xml', apikey: 'pk_unsubscribed' },
    });
    expect(proxyFetch.mock.calls.at(-1)?.[1].headers.get('accept')).toBe(
      'application/xml',
    );
    expect(refused.statusCode).toBe(403);
    expect(refused.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(refused.headers['x-kong-request-id']).toBe('xml-refusal');
    expect(refused.json()).toMatchObject({
      type: '/problems/api-access-denied',
      title: "This key doesn't have access to this API",
      detail: expect.stringContaining('Select Get an API key'),
    });
    proxyFetch.mockResolvedValueOnce(
      new Response(body, {
        status: 403,
        headers: {
          'content-type': 'application/xml',
          'x-kong-upstream-latency': '0',
        },
      }),
    );
    const upstream = await server.inject({
      url,
      headers: { accept: 'application/xml' },
    });
    expect(upstream.statusCode).toBe(403);
    expect(upstream.headers['content-type']).toContain('application/xml');
    expect(upstream.body).toBe(body);
  });
  it('imports for admins and leaves nothing published after validation failure', async () => {
    await connection.db
      .update(user)
      .set({ role: 'admin' })
      .where(eq(user.id, ownerId));
    const invalid = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/apis',
      headers: { cookie },
      payload: {
        spec: {
          content: `openapi: 3.1.0
info: {}`,
        },
        gatewayServiceId: 'service',
      },
    });
    expect(invalid.statusCode, invalid.body).toBe(422);
    expect(invalid.json().errors).toHaveLength(1);
    expect(await connection.db.select().from(apis)).toHaveLength(1);
    for (const content of [
      '{"openapi":"3.0.3","paths":{}}',
      'openapi: 3.1.0\npaths: {}',
    ]) {
      const missingInfo = await server.inject({
        method: 'POST',
        url: '/api/v1/admin/apis',
        headers: { cookie },
        payload: { spec: { content }, gatewayServiceId: 'service' },
      });
      expect(missingInfo.statusCode, missingInfo.body).toBe(422);
      expect(missingInfo.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(missingInfo.json()).toMatchObject({
        type: '/problems/invalid-api-version',
        errors: [{ message: 'Invalid API version', pointer: '/info/version' }],
      });
      expect(await connection.db.select().from(apis)).toHaveLength(1);
    }
    const content = JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Imported API', version: '1.0' },
      paths: {},
    });
    const valid = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/apis',
      headers: { cookie },
      payload: { spec: { content }, gatewayServiceId: 'import-service' },
    });
    expect(valid.statusCode, valid.body).toBe(201);
    expect(valid.json().slug).toBe('imported-api');
    expect(valid.json().warnings).toEqual([]);
  });
  it('refuses duplicate service links before protection and maps foreign ACL conflicts', async () => {
    const spec = {
      content: JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Another API', version: '1' },
        paths: {},
      }),
    };
    const count = vi.mocked(adapter.protectService).mock.calls.length;
    const linked = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/apis',
      headers: { cookie },
      payload: { spec, gatewayServiceId: 'service' },
    });
    expect(linked.statusCode).toBe(422);
    expect(linked.json()).toMatchObject({
      type: '/problems/gateway-service-already-linked',
      title: 'This service already has a published API',
    });
    expect(linked.json().detail).toContain('/apis/sample');
    expect(vi.mocked(adapter.protectService).mock.calls).toHaveLength(count);
    vi.mocked(adapter.protectService).mockRejectedValueOnce(
      new GatewayServiceConflictError('operator-service'),
    );
    const conflict = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/apis',
      headers: { cookie },
      payload: { spec, gatewayServiceId: 'foreign' },
    });
    expect(conflict.statusCode).toBe(422);
    expect(conflict.json()).toMatchObject({
      type: '/problems/gateway-service-has-acl',
      title: 'Another ACL plugin applies to this service',
    });
    expect(conflict.json().detail).toContain('operator-service');
    expect(
      (await connection.db.select().from(apis)).some(
        (a) => a.gatewayServiceId === 'foreign',
      ),
    ).toBe(false);
  });
  it('serializes simultaneous imports to one service and returns adapter warnings', async () => {
    const spec = {
      content: JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Concurrent API', version: '1' },
        paths: {},
      }),
    };
    vi.mocked(adapter.protectService).mockResolvedValueOnce({
      keyAuth: false,
      findings: [
        {
          code: 'api-public',
          serviceId: 'concurrent',
          serviceName: 'Concurrent',
          message: 'This API is public.',
        },
      ],
    });
    const results = await Promise.all(
      ['first', 'second'].map((slug) =>
        server.inject({
          method: 'POST',
          url: '/api/v1/admin/apis',
          headers: { cookie },
          payload: { spec, slug, gatewayServiceId: 'concurrent' },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 422]);
    expect(results.find((r) => r.statusCode === 201)?.json().warnings).toEqual([
      { code: 'api-public', message: 'This API is public.' },
    ]);
  });
  it('reconciles orphans and revoked keys and warns for missing active credentials', async () => {
    const orphan = uuidv7();
    await adapter.ensureConsumer({ id: orphan });
    const [key] = await connection.db
      .select()
      .from(credentials)
      .where(eq(credentials.status, 'active'));
    if (!key) throw new Error('No active key');
    const consumer = owned.get(key.appId);
    if (consumer)
      consumer.credentials = consumer.credentials.filter(
        (c) => c.id !== key.id,
      );
    const warn = vi.fn();
    await reconcile(connection.db, runtime(), { warn });
    expect(owned.has(orphan)).toBe(false);
    expect(adapter.applyAccessPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.arrayContaining([{ id: 'service' }]),
        apps: expect.arrayContaining([
          { app: { id: key.appId }, services: [{ id: 'service' }] },
        ]),
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ credentialId: key.id }),
      expect.stringContaining('drift'),
    );
  });
  it('AC 6: unavailable gateway reconciliation leaves persisted keys/subscriptions unchanged and the next run converges', async () => {
    const before = {
      apps: await connection.db.select().from(apps),
      keys: await connection.db.select().from(credentials),
      subscriptions: await connection.db.select().from(subscriptions),
    };
    const warn = vi.fn();
    const list = vi
      .spyOn(adapter, 'listOwnedConsumers')
      .mockRejectedValueOnce(new GatewayUnavailableError());
    await expect(
      reconcile(connection.db, runtime(), { warn }),
    ).rejects.toBeInstanceOf(GatewayUnavailableError);
    expect(await connection.db.select().from(apps)).toEqual(before.apps);
    expect(await connection.db.select().from(credentials)).toEqual(before.keys);
    expect(await connection.db.select().from(subscriptions)).toEqual(
      before.subscriptions,
    );
    list.mockRestore();
    await reconcile(connection.db, runtime(), { warn });
    expect(adapter.applyAccessPolicy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apps: expect.arrayContaining(
          before.apps.map((app) => ({
            app: { id: app.id },
            services: [{ id: 'service' }],
          })),
        ),
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('pk_');
  });
  it('JSO-277: immediately accepts a newly published API after the proxy catalog cache is warm', async () => {
    const config = loadConfig({ DATABASE_URL: container.getConnectionUri() });
    const fetchGateway = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        const target = new URL(String(input));
        expect(new Headers(init?.headers).get('apikey')).toBe('pk_unsubscribed');
        if (target.pathname === '/sample/get')
          return new Response('subscribed API response', { status: 200 });
        return new Response(
          JSON.stringify({ message: 'You cannot consume this service' }),
          { status: 403 },
        );
      },
    );
    const { app: fresh } = await createApp({
      db: connection.db,
      config,
      adapterFor: () => adapter,
      proxyFetch: fetchGateway,
    });
    const id = uuidv7(),
      slug = `cache-${id}`;
    try {
      const headers = { apikey: 'pk_unsubscribed' };
      const warm = await fresh.inject({
        url: '/api/v1/try-it?scalar_url=http://localhost:8000/sample/get',
        headers,
      });
      expect(warm.statusCode).toBe(200);
      const target = `/api/v1/try-it?scalar_url=http://localhost:8000/${slug}/get`;
      const unpublished = await fresh.inject(target);
      expect(unpublished.statusCode).toBe(400);
      expect(unpublished.json().type).toBe(
        '/problems/try-it-target-not-allowed',
      );
      expect(fetchGateway).toHaveBeenCalledTimes(1);
      await connection.db.insert(apis).values({
        id,
        slug,
        gatewayId,
        gatewayServiceId: id,
        gatewayServiceName: slug,
        routePath: `/${slug}`,
      });
      await connection.db.insert(apiVersions).values({
        id,
        apiId: id,
        version: '1',
        title: 'Newly published',
        document: {
          openapi: '3.1.0',
          info: { title: slug, version: '1' },
          paths: {},
        },
      });
      await connection.db
        .update(apis)
        .set({ latestVersionId: id })
        .where(eq(apis.id, id));
      const result = await fresh.inject({ url: target, headers });
      expect(result.statusCode, result.body).toBe(403);
      expect(result.json().type).toBe('/problems/api-access-denied');
      expect(fetchGateway).toHaveBeenCalledTimes(2);
      expect(String(fetchGateway.mock.calls[1]?.[0])).toBe(
        `http://kong:8000/${slug}/get`,
      );
      const unknown = await fresh.inject(
        `/api/v1/try-it?scalar_url=http://localhost:8000/${slug}-unpublished/get`,
      );
      expect(unknown.statusCode).toBe(400);
      const external = await fresh.inject(
        '/api/v1/try-it?scalar_url=http://evil.test/sample/get',
      );
      expect(external.statusCode).toBe(400);
      expect(fetchGateway).toHaveBeenCalledTimes(2);
    } finally {
      await fresh.close();
      await connection.db.delete(apis).where(eq(apis.id, id));
    }
  });
  it('enforces proxy response/request caps, timeout problems and rate limits', async () => {
    const url = '/api/v1/try-it?scalar_url=http://localhost:8000/sample/get';
    proxyFetch.mockResolvedValueOnce(new Response('x'.repeat(1024 * 1024 + 1)));
    expect((await server.inject(url)).statusCode).toBe(413);
    proxyFetch.mockRejectedValueOnce(
      new DOMException('Timed out', 'TimeoutError'),
    );
    expect((await server.inject(url)).statusCode).toBe(504);
    expect(
      (
        await server.inject({
          method: 'POST',
          url,
          headers: { 'content-type': 'text/plain' },
          payload: 'x'.repeat(1024 * 1024 + 1),
        })
      ).statusCode,
    ).toBe(413);
    let limited = false;
    for (let i = 0; i < 61; i++) {
      const response = await server.inject(url);
      if (response.statusCode === 429) {
        expect(response.headers['content-type']).toContain(
          'application/problem+json',
        );
        expect(response.json().type).toBe('/problems/rate-limited');
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
describe('API versions and changelog', () => {
  const endpoint = '/api/v1/admin/apis/sample';
  const spec = (version: string, paths: Record<string, unknown> = {}) => ({
    content: JSON.stringify({
      openapi: '3.1.0',
      info: { title: `Sample ${version}`, version },
      paths,
    }),
  });
  const publish = (version: string, extra = {}, paths = {}) =>
    server.inject({
      method: 'POST',
      url: endpoint + '/versions',
      headers: { cookie },
      payload: { spec: spec(version, paths), ...extra },
    });
  it('publishes versions without gateway calls, switches latest, rejects duplicates and preserves stable documents', async () => {
    const getService = vi.spyOn(adapter, 'getService');
    getService.mockClear();
    vi.mocked(adapter.protectService).mockClear();
    const v1 = await publish(
      '1.0.0',
      {},
      { '/orders': { get: { responses: { '200': { description: 'OK' } } } } },
    );
    expect(v1.statusCode, v1.body).toBe(201);
    const v2 = await publish(
      '2.0.0',
      { releaseNote: 'Orders can now be created' },
      {
        '/orders': {
          post: { responses: { '201': { description: 'Created' } } },
        },
      },
    );
    expect(v2.statusCode, v2.body).toBe(201);
    expect(v2.json().version).toMatchObject({
      releaseNote: 'Orders can now be created',
      changes: {
        comparedTo: '1.0.0',
        added: [
          expect.objectContaining({
            method: 'POST',
            path: '/orders',
            breaking: false,
          }),
        ],
        removed: [expect.objectContaining({ method: 'GET', breaking: true })],
        breaking: true,
      },
    });
    const patch = await publish('1.1.0', { makeLatest: false });
    expect(patch.statusCode, patch.body).toBe(201);
    expect(patch.json().api.version).toBe('2.0.0');
    expect(patch.json().version.changes.comparedTo).toBe('1.0.0');
    const newerPatch = await publish('1.2.0');
    expect(newerPatch.json().api.version).toBe('1.2.0');
    expect(
      newerPatch.json().api.versions.map((v: { version: string }) => v.version),
    ).toEqual(['2.0.0', '1.2.0', '1.1.0', '1.0.0', '0.1.0']);
    const duplicate = await publish('2.0.0');
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().type).toBe('/problems/api-version-exists');
    const parallel = await Promise.all([publish('3.0.0'), publish('3.0.0')]);
    expect(parallel.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const latest = await server.inject({
      method: 'PUT',
      url: endpoint + '/latest-version',
      headers: { cookie },
      payload: { version: '2.0.0' },
    });
    expect(latest.statusCode, latest.body).toBe(200);
    expect(latest.json().version).toBe('2.0.0');
    expect(
      latest.json().versions.filter((v: { isLatest: boolean }) => v.isLatest),
    ).toHaveLength(1);
    const stable = await server.inject(
      '/api/v1/apis/sample/versions/1.0.0/openapi.json',
    );
    expect(stable.json().info.version).toBe('1.0.0');
    expect(stable.json().servers).toEqual([
      { url: 'http://localhost:8000/sample' },
    ]);
    expect(
      (await server.inject('/api/v1/apis/sample/openapi.json')).json().info
        .version,
    ).toBe('2.0.0');
    expect(
      (await server.inject('/api/v1/apis/sample/changelog'))
        .json()
        .items.find((v: { version: string }) => v.version === '2.0.0')
        .releaseNote,
    ).toBe('Orders can now be created');
    expect(getService).not.toHaveBeenCalled();
    expect(adapter.protectService).not.toHaveBeenCalled();
    getService.mockRestore();
  });
  it('012 failure paths: invalid bodies, expired admin session and gateway outage leave version state safe', async () => {
    const before = await connection.db.select().from(apiVersions);
    for (const payload of [
      {},
      { spec: spec('invalid/name') },
      { spec: spec('valid'), releaseNote: 'x'.repeat(5001) },
      { spec: spec('valid'), makeLatest: 'false' },
    ]) {
      const result = await server.inject({
        method: 'POST',
        url: endpoint + '/versions',
        headers: { cookie },
        payload,
      });
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
      expect(result.statusCode).toBeLessThan(500);
      expect(result.headers['content-type']).toContain(
        'application/problem+json',
      );
    }
    const signed = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Expired version admin',
        email: 'expired-versions@example.com',
        password: 'test-password-123',
      },
    });
    expect(signed.statusCode).toBe(200);
    await connection.db
      .update(user)
      .set({ role: 'admin' })
      .where(eq(user.id, signed.json().user.id));
    await connection.db
      .update(session)
      .set({ expiresAt: new Date(0) })
      .where(eq(session.userId, signed.json().user.id));
    const expiredCookie =
      signed.headers['set-cookie']?.toString().split(';')[0] ?? '';
    for (const method of ['POST', 'PUT'] as const) {
      const result = await server.inject({
        method,
        url: endpoint + (method === 'POST' ? '/versions' : '/latest-version'),
        headers: { cookie: expiredCookie },
        payload:
          method === 'POST' ? { spec: spec('expired') } : { version: '1.0.0' },
      });
      expect(result.statusCode).toBe(401);
      expect(result.headers['content-type']).toContain(
        'application/problem+json',
      );
    }
    expect(await connection.db.select().from(apiVersions)).toEqual(before);
    const outage = vi
      .spyOn(adapter, 'getService')
      .mockRejectedValue(new GatewayUnavailableError());
    try {
      const result = await publish('outage-qa', { makeLatest: false });
      expect(result.statusCode, result.body).toBe(201);
      expect(outage).not.toHaveBeenCalled();
    } finally {
      outage.mockRestore();
    }
  });
  it('012 AC7-8: operator replacement reaches HTTP imports; invalid rulesets log and fail closed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'portal-qa-rules-'));
    try {
      for (const mode of ['custom', 'missing', 'invalid']) {
        const path = join(dir, mode + '.yaml');
        if (mode === 'custom')
          await writeFile(
            path,
            'extends: []\nrules:\n  operation-description:\n    given: $.paths[*].get\n    severity: error\n    then:\n      field: description\n      function: truthy\n',
          );
        if (mode === 'invalid') await writeFile(path, 'rules: [');
        const entries: string[] = [];
        const { app } = await createApp({
          db: connection.db,
          config: loadConfig({ PORTAL_LINT_RULESET: path }),
          adapterFor: () => adapter,
          auth: createAuth(connection.db, loadConfig({})),
          logger: {
            stream: {
              write: (line: string) => {
                entries.push(line);
              },
            },
          },
        });
        try {
          for (const target of ['/api/v1/admin/apis', endpoint + '/versions']) {
            const result = await app.inject({
              method: 'POST',
              url: target,
              headers: { cookie },
              payload: {
                spec: spec('operator-' + mode, {
                  '/orders': {
                    get: { responses: { '200': { description: 'OK' } } },
                  },
                }),
                ...(target.endsWith('/apis')
                  ? {
                      slug: 'operator-' + mode,
                      gatewayServiceId: 'operator-' + mode,
                    }
                  : {}),
              },
            });
            expect(result.statusCode, result.body).toBe(
              mode === 'custom' ? 422 : 503,
            );
            expect(result.headers['content-type']).toContain(
              'application/problem+json',
            );
            if (mode === 'custom')
              expect(result.json().errors).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    rule: 'operation-description',
                    message: expect.any(String),
                    line: 1,
                    pointer: '/paths/~1orders/get',
                  }),
                ]),
              );
          }
          if (mode === 'custom') {
            // An undeclared path parameter is a portal-default error omitted by the operator file.
            const result = await app.inject({
              method: 'POST',
              url: endpoint + '/versions',
              headers: { cookie },
              payload: {
                spec: spec('operator-replacement', {
                  '/orders/{id}': {
                    get: {
                      description: 'Present',
                      responses: { '200': { description: 'OK' } },
                    },
                  },
                }),
                makeLatest: false,
              },
            });
            expect(result.statusCode, result.body).toBe(201);
            expect(result.json().lintWarnings).toEqual([]);
          } else {
            expect((await app.inject('/api/v1/health')).json()).toMatchObject({
              status: 'degraded',
              lint: {
                status: 'error',
                path,
                error: expect.stringContaining(path),
              },
            });
            const entry = entries
              .map((line) => JSON.parse(line))
              .find((item) => item.msg === 'Lint ruleset unavailable');
            expect(entry).toMatchObject({
              level: 50,
              lint: { path, error: expect.any(String) },
            });
            expect((await app.inject('/api/v1/apis/sample')).statusCode).toBe(
              200,
            );
          }
        } finally {
          await app.close();
        }
      }
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it('sample seeding retains an administrator latest choice', async () => {
    const seedAdapter = {
      ...adapter,
      request: vi.fn(async () => ({})),
    } as unknown as KongAdapter;
    await seedSample(connection.db, seedAdapter, gatewayId, 'test-instance');
    const detail = (await server.inject('/api/v1/apis/sample')).json();
    expect(detail.version).toBe('2.0.0');
    expect(
      detail.versions.filter((v: { version: string }) => v.version === '1.0.0'),
    ).toHaveLength(1);
  });
  it('returns URL-encoded stable documents for version names containing plus', async () => {
    const response = await publish('2024+build', { makeLatest: false });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.headers.location).toBe(
      '/api/v1/apis/sample/versions/2024%2Bbuild/openapi.json',
    );
    expect(
      (await server.inject(response.headers.location!)).json().info.version,
    ).toBe('2024+build');
  });
  it('enforces admin permissions and unknown API/version 404s', async () => {
    for (const method of ['POST', 'PUT'] as const) {
      const url =
        endpoint + (method === 'POST' ? '/versions' : '/latest-version');
      const payload =
        method === 'POST' ? { spec: spec('4.0.0') } : { version: '1.0.0' };
      expect((await server.inject({ method, url, payload })).statusCode).toBe(
        401,
      );
      expect(
        (
          await server.inject({
            method,
            url,
            headers: { cookie: secondCookie },
            payload,
          })
        ).statusCode,
      ).toBe(403);
    }
    for (const url of [
      endpoint + '/latest-version',
      '/api/v1/admin/apis/unknown/latest-version',
    ])
      expect(
        (
          await server.inject({
            method: 'PUT',
            url,
            headers: { cookie },
            payload: { version: 'unknown' },
          })
        ).statusCode,
      ).toBe(404);
    expect(
      (await server.inject('/api/v1/apis/sample/versions/unknown/openapi.json'))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/admin/apis/unknown/versions',
          headers: { cookie },
          payload: { spec: spec('1.0.0') },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('refuses each blocking lint finding on new APIs and versions without modifying stored versions', async () => {
    for (const [rule, paths] of [
      [
        'path-params',
        {
          '/orders/{id}': {
            get: { responses: { '200': { description: 'OK' } } },
          },
        },
      ],
      [
        'invalid-ref',
        {
          '/orders': {
            get: {
              responses: { '200': { $ref: '#/components/responses/Missing' } },
            },
          },
        },
      ],
      [
        'operation-operationId-unique',
        {
          '/a': {
            get: {
              operationId: 'same',
              responses: { '200': { description: 'OK' } },
            },
          },
          '/b': {
            get: {
              operationId: 'same',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      ],
    ] as const) {
      const before = await connection.db.select().from(apiVersions);
      for (const url of ['/api/v1/admin/apis', endpoint + '/versions']) {
        const response = await server.inject({
          method: 'POST',
          url,
          headers: { cookie },
          payload: {
            spec: spec('bad-lint', paths),
            ...(url.endsWith('/apis')
              ? { gatewayServiceId: 'unused', slug: 'bad-lint' }
              : {}),
          },
        });
        expect(response.statusCode, response.body).toBe(422);
        expect(response.json()).toMatchObject({
          type: '/problems/openapi-lint-failed',
          errorCount: expect.any(Number),
          errors: expect.arrayContaining([
            expect.objectContaining({
              rule,
              line: 1,
              pointer: expect.any(String),
            }),
          ]),
        });
      }
      expect(await connection.db.select().from(apiVersions)).toHaveLength(
        before.length,
      );
    }
  });
  it('keeps docs available and imports unavailable when an operator ruleset cannot load', async () => {
    const { app } = await createApp({
      db: connection.db,
      config: loadConfig({
        PORTAL_LINT_RULESET: '/missing/operator.spectral.yaml',
      }),
      adapterFor: () => adapter,
      auth: createAuth(connection.db, loadConfig({})),
      logger: false,
    });
    try {
      const health = (await app.inject('/api/v1/health')).json();
      expect(health).toMatchObject({
        status: 'degraded',
        lint: {
          ruleset: 'custom',
          status: 'error',
          path: '/missing/operator.spectral.yaml',
          error: expect.stringContaining('/missing/operator.spectral.yaml'),
        },
      });
      expect((await app.inject('/api/v1/apis/sample')).statusCode).toBe(200);
      const response = await app.inject({
        method: 'POST',
        url: endpoint + '/versions',
        headers: { cookie },
        payload: { spec: spec('4.0.0') },
      });
      expect(response.statusCode, response.body).toBe(503);
      expect(response.json().type).toBe('/problems/lint-ruleset-unavailable');
    } finally {
      await app.close();
    }
  });
});
