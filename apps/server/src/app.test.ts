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
  apps,
  credentials,
  user,
  instanceSettings,
  subscriptions,
  session,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  GatewayUnavailableError,
  GatewayServiceConflictError,
  type GatewayAdapter,
} from '@portal/adapter-sdk';
import { KongAdapter } from '@portal/adapter-kong';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { reconcile } from './reconcile.js';
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
    title: 'Sample',
    version: '1',
    gatewayId,
    gatewayServiceId: 'service',
    gatewayServiceName: 'pets',
    routePath: '/sample',
    document: {
      openapi: '3.1.0',
      info: { title: 'Sample', version: '1' },
      paths: {},
    },
  });
  ({ app: server } = await createApp({
    db: connection.db,
    config: loadConfig({ DATABASE_URL: url }),
    adapter,
    gatewayId,
    proxyFetch,
    logger: {
      stream: {
        write: (s: string) => {
          logs.push(s);
        },
      },
    },
  }));
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
      gateway: { reachable: true },
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
        type: '/problems/invalid-openapi',
        detail:
          "Invalid OpenAPI document: must have required property 'info' at /",
        errors: [
          { message: "must have required property 'info'", pointer: '' },
        ],
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
    await reconcile(connection.db, adapter, { warn });
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
      reconcile(connection.db, adapter, { warn }),
    ).rejects.toBeInstanceOf(GatewayUnavailableError);
    expect(await connection.db.select().from(apps)).toEqual(before.apps);
    expect(await connection.db.select().from(credentials)).toEqual(before.keys);
    expect(await connection.db.select().from(subscriptions)).toEqual(
      before.subscriptions,
    );
    list.mockRestore();
    await reconcile(connection.db, adapter, { warn });
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
  it.fails(
    'JSO-277: immediately accepts a newly published API after the proxy catalog cache is warm',
    async () => {
      const config = loadConfig({ DATABASE_URL: container.getConnectionUri() });
      const { app: fresh } = await createApp({
        db: connection.db,
        config,
        adapter,
        gatewayId,
        proxyFetch: async () =>
          new Response(
            JSON.stringify({ message: 'You cannot consume this service' }),
            { status: 403 },
          ),
      });
      const id = uuidv7(),
        slug = `cache-${id}`;
      try {
        await fresh.inject(
          '/api/v1/try-it?scalar_url=http://localhost:8000/sample/get',
        );
        await connection.db.insert(apis).values({
          id,
          slug,
          title: 'Newly published',
          version: '1',
          gatewayId,
          gatewayServiceId: id,
          gatewayServiceName: slug,
          routePath: `/${slug}`,
          document: {
            openapi: '3.1.0',
            info: { title: slug, version: '1' },
            paths: {},
          },
        });
        const result = await fresh.inject(
          `/api/v1/try-it?scalar_url=http://localhost:8000/${slug}/get`,
        );
        expect(result.statusCode, result.body).toBe(403);
      } finally {
        await fresh.close();
        await connection.db.delete(apis).where(eq(apis.id, id));
      }
    },
  );
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
