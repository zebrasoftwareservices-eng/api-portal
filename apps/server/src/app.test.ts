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
  session,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  GatewayUnavailableError,
  type GatewayAdapter,
} from '@portal/adapter-sdk';
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
  getService: async () => ({
    id: 'service',
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
      payload: { spec: { content }, gatewayServiceId: 'service' },
    });
    expect(valid.statusCode, valid.body).toBe(201);
    expect(valid.json().slug).toBe('imported-api');
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
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ credentialId: key.id }),
      expect.stringContaining('drift'),
    );
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
