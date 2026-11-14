// SPDX-License-Identifier: Apache-2.0
import { ensurePersonalTeam } from './teams.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  BUILTIN_PLAN_ID,
  plans,
  connect,
  migrate,
  instanceSettings,
  gateways,
  user,
  apis,
  apiVersions,
  apps,
  credentials,
  subscriptions,
  gatewayConsumers,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { GatewayAdapter, ConnectionCheck } from '@portal/adapter-sdk';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { decrypt } from './crypto.js';
import { gatewayConnection } from './gateway-connection.js';
import { reconcile } from './reconcile.js';
let container: StartedPostgreSqlContainer;
let db: ReturnType<typeof connect>;
let app: Awaited<ReturnType<typeof createApp>>['app'];
let config: ReturnType<typeof loadConfig>;
let cookie: string;
let ownerId: string;
let outcome: ConnectionCheck;
let proxyReachable: boolean;
const logs: string[] = [];
const seen: { adminUrl: string; adminToken?: string }[] = [];
const enqueue = vi.fn(async () => {});
const ensure = vi.fn(async ({ id }: { id: string }) => ({
  id: 'consumer-' + id,
  username: 'portal-app-' + id,
}));
const grant = vi.fn(async () => {});
const issue = vi.fn(async (_app: unknown, key: { id: string }) => ({
  id: key.id,
}));
const owned = vi.fn(async () => []);
const request = vi.fn(async () => null);
const protect = vi.fn(async () => ({ keyAuth: true, findings: [] }));
const revoke = vi.fn(async () => {});
const service = {
  id: 'service',
  name: 'pets',
  routes: [{ id: 'route', name: null, paths: ['/pets'] }],
  keyAuth: true,
};
const adapter = {
  kind: 'kong',
  capabilities: () => ({
    apiKeys: true,
    accessControl: true,
    oauthClients: false,
    plans: false,
    usage: false,
  }),
  health: async () => ({ reachable: true, latencyMs: 1 }),
  checkConnection: vi.fn(async () => outcome),
  checkProxy: vi.fn(async () => proxyReachable),
  listServices: vi.fn(async () => [service]),
  getService: vi.fn(async () => service),
  ensureConsumer: ensure,
  deleteConsumer: vi.fn(async () => {}),
  issueCredential: issue,
  revokeCredential: revoke,
  applyPlanLimits: vi.fn(async () => {}),
  grantAccess: grant,
  revokeAccess: vi.fn(async () => {}),
  protectService: protect,
  applyAccessPolicy: vi.fn(async () => ({ repairs: [], findings: [] })),
  isAccessDenied: () => false,
  listOwnedConsumers: owned,
  request,
} satisfies GatewayAdapter & { request: typeof request };
const values = {
  adminUrl: 'http://127.0.0.1:8001',
  proxyInternalUrl: 'http://127.0.0.1:8000',
  proxyPublicUrl: 'http://localhost:8000',
};
const document = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Pets', version: '1' },
  paths: {},
});
const boot = async (production = false) => {
  config = loadConfig({
    DATABASE_URL: container.getConnectionUri(),
    PORTAL_BUNDLED_KONG_ADMIN_URL: values.adminUrl,
  });
  if (production) config.NODE_ENV = 'production';
  ({ app } = await createApp({
    db: db.db,
    config,
    setupToken: production ? 'one-time-setup-secret' : undefined,
    adapterFor: (row) => {
      seen.push({ adminUrl: row.adminUrl, adminToken: row.adminToken });
      return adapter;
    },
    enqueueReconcile: enqueue,
    logger: { stream: { write: (line: string) => logs.push(line) } },
  }));
};
const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  auth = cookie,
) =>
  app.inject({
    method,
    url: '/api/v1/' + path,
    headers: auth ? { cookie: auth } : {},
    ...(payload !== undefined ? { payload } : {}),
  });
async function claim(production = false) {
  const response = await call(
    'POST',
    'setup/admin',
    {
      email: 'admin@example.com',
      password: 'test-password-123',
      ...(production ? { setupToken: 'one-time-setup-secret' } : {}),
    },
    '',
  );
  expect(response.statusCode, response.body).toBe(201);
  cookie = response.headers['set-cookie']!.toString().split(';')[0]!;
  ownerId = response.json().id;
}
async function connectGateway() {
  const response = await call('POST', 'admin/gateways', {
    ...values,
    adminToken: 'unique-gateway-secret',
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id as string;
}
async function publish(gatewayId: string) {
  const id = uuidv7();
  await db.db.insert(apis).values({
    id,
    gatewayId,
    slug: 'pets',
    gatewayServiceId: 'service',
    gatewayServiceName: 'pets',
    routePath: '/pets',
  });
  await db.db.insert(apiVersions).values({
    id,
    apiId: id,
    title: 'Pets',
    version: '1',
    document: JSON.parse(document),
  });
  await db.db.update(apis).set({ latestVersionId: id }).where(eq(apis.id, id));
  return id;
}
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  await migrate(container.getConnectionUri());
  db = connect(container.getConnectionUri());
  await db.db.insert(instanceSettings).values({ id: 1, instanceId: uuidv7() });
});
beforeEach(async () => {
  await db.client`set client_min_messages to warning`;
  await db.client`truncate "user",gateways cascade`;
  await db.db
    .insert(plans)
    .values({ id: BUILTIN_PLAN_ID, name: 'Unlimited', builtin: true });
  vi.clearAllMocks();
  outcome = { outcome: 'ok', version: '3.9.4' };
  proxyReachable = true;
  cookie = '';
  ownerId = '';
  logs.length = 0;
  seen.length = 0;
});
afterEach(async () => {
  await app?.close();
});
afterAll(async () => {
  await db?.client.end();
  await container?.stop();
});
it('starts empty, blocks sign-up and claims exactly one first admin concurrently with a working session', async () => {
  await boot();
  expect((await call('GET', 'health')).json().gateway).toBeNull();
  expect((await call('GET', 'setup')).json()).toEqual({
    adminRequired: true,
    setupTokenRequired: false,
  });
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: 'bypass@example.com',
      password: 'test-password-123',
      name: 'Bypass',
    },
  });
  expect(signup.statusCode).toBe(403);
  const results = await Promise.all(
    Array.from({ length: 3 }, (_, i) =>
      call('POST', 'setup/admin', {
        email: `first${i}@example.com`,
        password: 'test-password-123',
      }),
    ),
  );
  expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
  expect(await db.db.select().from(user)).toHaveLength(1);
  const created = results.find((r) => r.statusCode === 201)!;
  cookie = created.headers['set-cookie']!.toString().split(';')[0]!;
  expect((await call('GET', 'me')).json().role).toBe('admin');
  expect((await call('GET', 'setup')).json()).toEqual({
    adminRequired: false,
    setupTokenRequired: false,
  });
});
it('requires the production token and consumes it when an admin exists without exposing it', async () => {
  await boot(true);
  expect((await call('GET', 'setup')).json().setupTokenRequired).toBe(true);
  for (const setupToken of [undefined, 'wrong']) {
    const response = await call('POST', 'setup/admin', {
      email: 'admin@example.com',
      password: 'test-password-123',
      setupToken,
    });
    expect(response.statusCode).toBe(403);
  }
  await claim(true);
  expect(
    (
      await call('POST', 'setup/admin', {
        email: 'second@example.com',
        password: 'test-password-123',
        setupToken: 'one-time-setup-secret',
      })
    ).statusCode,
  ).toBe(409);
  expect(logs.join('')).not.toContain('one-time-setup-secret');
});
it('rate limits setup per IP with problem+json', async () => {
  await boot(true);
  for (let i = 0; i < 10; i++)
    expect(
      (
        await call('POST', 'setup/admin', {
          email: 'admin@example.com',
          password: 'test-password-123',
        })
      ).statusCode,
    ).toBe(403);
  const limited = await call('POST', 'setup/admin', {
    email: 'admin@example.com',
    password: 'test-password-123',
  });
  expect(limited.statusCode).toBe(429);
  expect(limited.json().type).toBe('/problems/rate-limited');
});
it('rejects a preexisting developer email and allows a fresh one, preserving password sign-in', async () => {
  await boot();
  await db.db.insert(user).values({
    id: uuidv7(),
    name: 'Old',
    email: 'old@example.com',
    role: 'developer',
  });
  const duplicate = await call('POST', 'setup/admin', {
    email: 'OLD@example.com',
    password: 'test-password-123',
  });
  expect(duplicate.statusCode).toBe(400);
  expect(duplicate.json().errors[0].pointer).toBe('/email');
  await claim();
  const signin = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: 'admin@example.com', password: 'test-password-123' },
  });
  expect(signin.statusCode, signin.body).toBe(200);
});
it('saves encrypted credentials without leaking them, uses them on the next request, and refuses a second add before outbound calls', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  const list = await call('GET', 'admin/gateways');
  expect(list.json().items[0]).toMatchObject({
    id,
    hasAdminToken: true,
    managedBy: 'admin',
    enabled: true,
    sampleAvailable: true,
  });
  expect(list.body).not.toContain('unique-gateway-secret');
  const [row] = await db.db.select().from(gateways);
  expect(
    decrypt(row!.adminTokenCiphertext!, config.PORTAL_ENCRYPTION_KEY),
  ).toBe('unique-gateway-secret');
  await call('GET', 'admin/gateway/services');
  expect(seen.at(-1)?.adminToken).toBe('unique-gateway-secret');
  const count = adapter.checkConnection.mock.calls.length;
  expect(
    (
      await call('POST', 'admin/gateways', {
        ...values,
        adminUrl: 'http://169.254.169.254',
      })
    ).statusCode,
  ).toBe(409);
  expect(adapter.checkConnection).toHaveBeenCalledTimes(count);
  expect(enqueue).toHaveBeenCalledOnce();
  expect(logs.join('')).not.toContain('unique-gateway-secret');
});
it('requires authorization before any candidate request and rate limits tests per admin', async () => {
  await boot();
  expect(
    (await call('POST', 'admin/gateways/test', values, '')).statusCode,
  ).toBe(401);
  await claim();
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: 'dev@example.com',
      password: 'test-password-123',
      name: 'Dev',
    },
  });
  const devCookie = signup.headers['set-cookie']!.toString().split(';')[0]!;
  expect(
    (await call('POST', 'admin/gateways/test', values, devCookie)).statusCode,
  ).toBe(403);
  expect(adapter.checkConnection).not.toHaveBeenCalled();
  for (let i = 0; i < 30; i++)
    expect((await call('POST', 'admin/gateways/test', values)).statusCode).toBe(
      200,
    );
  const limited = await call('POST', 'admin/gateways/test', values);
  expect(limited.statusCode).toBe(429);
  expect(limited.headers['content-type']).toContain('application/problem+json');
});
it.each(['unreachable', 'refused', 'not-gateway', 'read-only'] as const)(
  'Test and save map %s safely and persist nothing',
  async (failure) => {
    await boot();
    await claim();
    outcome = { outcome: failure };
    for (const path of ['admin/gateways/test', 'admin/gateways']) {
      const response = await call('POST', path, {
        ...values,
        adminToken: 'unique-gateway-secret',
      });
      expect(response.statusCode, response.body).toBe(422);
      expect(response.body).not.toContain('unique-gateway-secret');
    }
    expect(await db.db.select().from(gateways)).toHaveLength(0);
  },
);
it('checks internal proxy reachability and blocks malformed or metadata URLs without contacting Kong', async () => {
  await boot();
  await claim();
  proxyReachable = false;
  const response = await call('POST', 'admin/gateways/test', values);
  expect(response.statusCode).toBe(422);
  expect(response.json().type).toBe('/problems/gateway-proxy-unreachable');
  adapter.checkConnection.mockClear();
  for (const adminUrl of [
    'ftp://host',
    'http://2852039166/',
    'http://[fe80::1]',
    'http://name:password@host',
  ])
    expect(
      (await call('POST', 'admin/gateways/test', { ...values, adminUrl }))
        .statusCode,
    ).toBe(400);
  expect(adapter.checkConnection).not.toHaveBeenCalled();
});
it('keeps a blank token only at the same normalized URL, and explicit null removes it', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  expect(
    (await call('PATCH', `admin/gateways/${id}`, { adminToken: '' }))
      .statusCode,
  ).toBe(200);
  const count = adapter.checkConnection.mock.calls.length;
  for (const path of [`admin/gateways/${id}`, 'admin/gateways/test']) {
    const response = await call(
      path.endsWith('/test') ? 'POST' : 'PATCH',
      path,
      {
        ...values,
        gatewayId: path.endsWith('/test') ? id : undefined,
        adminUrl: 'http://127.0.0.1:8002',
        adminToken: '',
      },
    );
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json().type).toBe('/problems/gateway-token-required');
  }
  expect(adapter.checkConnection).toHaveBeenCalledTimes(count);
  expect(
    (await call('PATCH', `admin/gateways/${id}`, { adminToken: null }))
      .statusCode,
  ).toBe(200);
  expect(
    (await db.db.select().from(gateways))[0]?.adminTokenCiphertext,
  ).toBeNull();
});
it('returns a safe 503 for unreadable stored tokens on Test, edit and Enable, while replacement or token removal recovers', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  await db.db
    .update(gateways)
    .set({ adminTokenCiphertext: 'unreadable-secret', enabled: false });
  adapter.checkConnection.mockClear();
  expect((await call('GET', 'health')).json().gateway.reachable).toBe(false);
  for (const [method, path, payload] of [
    [
      'POST',
      'admin/gateways/test',
      { ...values, gatewayId: id, adminToken: '' },
    ],
    ['PATCH', `admin/gateways/${id}`, { adminToken: '' }],
    ['PATCH', `admin/gateways/${id}`, { enabled: true }],
  ] as const) {
    const response = await call(method, path, payload);
    expect(response.statusCode, response.body).toBe(503);
    expect(response.json().detail).toContain('Enter the token again');
    expect(response.body).not.toContain('unreadable-secret');
  }
  expect(adapter.checkConnection).not.toHaveBeenCalled();
  expect(
    (
      await call('PATCH', `admin/gateways/${id}`, {
        adminToken: 'replacement',
        enabled: true,
      })
    ).statusCode,
  ).toBe(200);
  expect(logs.join('')).not.toContain('unreadable-secret');
});
it('disables with no Kong call, blocks discovery/import/sample/app/key creation, but permits revoke and reconcile; failed re-enable stays disabled', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  const apiId = await publish(id);
  const appId = uuidv7(),
    credentialId = uuidv7();
  await db.db.insert(apps).values({
    id: appId,
    teamId: await ensurePersonalTeam(db.db, ownerId),
    createdBy: ownerId,
    name: 'existing',
  });
  await db.db.insert(subscriptions).values({ id: uuidv7(), appId, apiId });
  await db.db.insert(credentials).values({
    id: credentialId,
    appId,
    gatewayId: id,
    keyHint: '1234',
    status: 'active',
  });
  vi.clearAllMocks();
  expect(
    (await call('PATCH', `admin/gateways/${id}`, { enabled: false }))
      .statusCode,
  ).toBe(200);
  expect(adapter.checkConnection).not.toHaveBeenCalled();
  for (const [method, path, payload] of [
    ['GET', 'admin/gateway/services'],
    ['POST', 'admin/apis', { invalid: 'body' }],
    ['POST', `admin/gateways/${id}/sample`],
    ['POST', 'apps', { name: 'new', apiIds: [apiId] }],
    ['POST', `apps/${appId}/credentials`],
  ] as const) {
    const response = await call(method, path, payload);
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().type).toBe('/problems/gateway-disabled');
  }
  expect(adapter.listServices).not.toHaveBeenCalled();
  expect(protect).not.toHaveBeenCalled();
  expect(issue).not.toHaveBeenCalled();
  expect((await call('GET', 'apis')).json().items).toHaveLength(1);
  const { GatewayUnavailableError } = await import('@portal/adapter-sdk');
  revoke.mockRejectedValueOnce(new GatewayUnavailableError());
  const failedRevoke = await call(
    'DELETE',
    `apps/${appId}/credentials/${credentialId}`,
  );
  expect(failedRevoke.statusCode).toBe(503);
  expect(failedRevoke.json().type).toBe('/problems/gateway-unavailable');
  expect(failedRevoke.json().detail).toBe(
    "The API gateway didn't respond. Try again in a moment.",
  );
  expect((await db.db.select().from(credentials))[0]?.status).toBe('active');
  expect(
    (await call('DELETE', `apps/${appId}/credentials/${credentialId}`))
      .statusCode,
  ).toBe(204);
  expect(revoke).toHaveBeenCalled();
  await reconcile(
    db.db,
    gatewayConnection(
      db.db,
      config,
      'test',
      { error: () => {} },
      () => adapter,
    ),
    { warn: () => {} },
  );
  expect(adapter.applyAccessPolicy).toHaveBeenCalled();
  outcome = { outcome: 'unreachable' };
  expect(
    (await call('PATCH', `admin/gateways/${id}`, { enabled: true })).statusCode,
  ).toBe(422);
  expect((await db.db.select().from(gateways))[0]?.enabled).toBe(false);
  outcome = { outcome: 'ok', version: '3.9.4' };
  expect(
    (await call('PATCH', `admin/gateways/${id}`, { enabled: true })).statusCode,
  ).toBe(200);
});
it('counts dependent APIs and keys, then removes without Kong calls and preserves revoked credentials', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  const apiId = await publish(id);
  const appId = uuidv7();
  await db.db.insert(apps).values({
    id: appId,
    teamId: await ensurePersonalTeam(db.db, ownerId),
    createdBy: ownerId,
    name: 'existing',
  });
  await db.db.insert(credentials).values({
    id: uuidv7(),
    appId,
    gatewayId: id,
    keyHint: '1234',
    status: 'active',
  });
  await db.db.insert(gatewayConsumers).values({
    id: uuidv7(),
    appId,
    gatewayId: id,
    externalId: 'external',
    username: 'consumer',
  });
  const refused = await call('DELETE', `admin/gateways/${id}`);
  expect(refused.statusCode).toBe(409);
  expect(refused.json()).toMatchObject({ apis: 1, activeKeys: 1 });
  await db.db.delete(apis).where(eq(apis.id, apiId));
  await db.db.update(credentials).set({ status: 'revoked' });
  vi.clearAllMocks();
  expect((await call('DELETE', `admin/gateways/${id}`)).statusCode).toBe(204);
  expect(adapter.checkConnection).not.toHaveBeenCalled();
  expect(adapter.deleteConsumer).not.toHaveBeenCalled();
  expect((await db.db.select().from(credentials))[0]?.gatewayId).toBeNull();
  expect(await db.db.select().from(gatewayConsumers)).toHaveLength(0);
});
it('refuses mutations on an environment-managed connection before checks', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  await db.db.update(gateways).set({ managedBy: 'env' });
  vi.clearAllMocks();
  for (const [method, payload] of [
    ['PATCH', { enabled: false }],
    ['PATCH', { adminUrl: 'http://new' }],
    ['DELETE', undefined],
  ] as const) {
    const response = await call(method, `admin/gateways/${id}`, payload);
    expect(response.statusCode).toBe(409);
    expect(response.json().type).toBe('/problems/gateway-env-managed');
  }
  expect(adapter.checkConnection).not.toHaveBeenCalled();
});
it('warns and requires confirmation for missing consumers, then reprovisions the consumer and service grants before another key', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  const apiId = await publish(id);
  const appId = uuidv7();
  await db.db.insert(apps).values({
    id: appId,
    teamId: await ensurePersonalTeam(db.db, ownerId),
    createdBy: ownerId,
    name: 'existing',
  });
  await db.db.insert(subscriptions).values({ id: uuidv7(), appId, apiId });
  await db.db.insert(credentials).values({
    id: uuidv7(),
    appId,
    gatewayId: id,
    keyHint: '1234',
    status: 'active',
  });
  const input = {
    ...values,
    adminUrl: 'http://127.0.0.1:8002',
    adminToken: null,
  };
  const tested = await call('POST', 'admin/gateways/test', {
    ...input,
    gatewayId: id,
  });
  expect(tested.json().warnings[0].affectedKeys).toBe(1);
  const declined = await call('PATCH', `admin/gateways/${id}`, input);
  expect(declined.statusCode).toBe(409);
  expect(declined.json().affectedKeys).toBe(1);
  expect((await db.db.select().from(gateways))[0]?.adminUrl).toBe(
    values.adminUrl,
  );
  expect(
    (
      await call('PATCH', `admin/gateways/${id}`, {
        ...input,
        confirmMissingKeys: true,
      })
    ).statusCode,
  ).toBe(200);
  expect((await call('POST', `apps/${appId}/credentials`)).statusCode).toBe(
    201,
  );
  expect(ensure.mock.invocationCallOrder[0]).toBeLessThan(
    grant.mock.invocationCallOrder[0]!,
  );
  expect(grant.mock.invocationCallOrder[0]).toBeLessThan(
    issue.mock.invocationCallOrder[0]!,
  );
  expect((await db.db.select().from(gatewayConsumers))[0]?.externalId).toBe(
    'consumer-' + appId,
  );
});
it('offers the sample only once on the enabled bundled Kong and refuses other Kongs', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  const sample = await call('POST', `admin/gateways/${id}/sample`);
  expect(sample.statusCode, sample.body).toBe(201);
  expect(sample.json().slug).toBe('sample');
  expect(request).toHaveBeenCalled();
  expect(
    (await call('GET', 'admin/gateways')).json().items[0].sampleAvailable,
  ).toBe(false);
  request.mockClear();
  expect((await call('POST', `admin/gateways/${id}/sample`)).statusCode).toBe(
    409,
  );
  expect(request).not.toHaveBeenCalled();
  await db.db.delete(apis);
  expect(
    (
      await call('PATCH', `admin/gateways/${id}`, {
        adminUrl: 'http://127.0.0.1:8002',
        adminToken: null,
      })
    ).statusCode,
  ).toBe(200);
  expect((await call('POST', `admin/gateways/${id}/sample`)).statusCode).toBe(
    409,
  );
});
it('save waits for a slow app creation holding the shared gateway lock', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  const apiId = await publish(id);
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  ensure.mockImplementationOnce(async ({ id: appId }) => {
    entered();
    await blocked;
    return { id: 'consumer-' + appId, username: 'portal-app-' + appId };
  });
  const creating = call('POST', 'apps', { name: 'slow', apiIds: [apiId] });
  // inject is a thenable: consume it so the request starts before awaiting the barrier.
  const creation = Promise.resolve(creating);
  await started;
  let saved = false;
  const saving = call('PATCH', `admin/gateways/${id}`, { enabled: false }).then(
    (result) => {
      saved = true;
      return result;
    },
  );
  try {
    await expect
      .poll(
        async () =>
          (
            await db.client`select count(*)::int as n from pg_locks where locktype='advisory' and not granted`
          )[0]!.n,
      )
      .toBeGreaterThan(0);
    expect(saved).toBe(false);
  } finally {
    release();
  }
  expect((await creation).statusCode).toBe(201);
  expect((await saving).statusCode).toBe(200);
});

it.each(['import', 'sample'])(
  'rechecks enabled after a queued %s obtains the shared lock, leaving no Kong writes',
  async (kind) => {
    await boot();
    await claim();
    const id = await connectGateway();
    let release!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const disabling = db.db.transaction(async (tx) => {
      const { sql } = await import('drizzle-orm');
      await tx.execute(sql`select pg_advisory_xact_lock(71833002)`);
      await tx
        .update(gateways)
        .set({ enabled: false })
        .where(eq(gateways.id, id));
      entered();
      await barrier;
    });
    await acquired;
    protect.mockClear();
    request.mockClear();
    const pending = Promise.resolve(
      call(
        'POST',
        kind === 'sample' ? `admin/gateways/${id}/sample` : 'admin/apis',
        kind === 'sample'
          ? undefined
          : { spec: { content: document }, gatewayServiceId: 'service' },
      ),
    );
    try {
      await expect
        .poll(
          async () =>
            (
              await db.client`select count(*)::int as n from pg_locks where locktype='advisory' and not granted`
            )[0]!.n,
        )
        .toBeGreaterThan(0);
    } finally {
      release();
    }
    await disabling;
    const response = await pending;
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().type).toBe('/problems/gateway-disabled');
    expect(protect).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(await db.db.select().from(apis)).toHaveLength(0);
  },
);

it('boots the real environment path, hands management back when variables are removed and skips a disabled sample on restart', async () => {
  const { start } = await import('./startup.js');
  config = loadConfig({
    DATABASE_URL: container.getConnectionUri(),
    ADMIN_EMAIL: 'environment@example.com',
    ADMIN_PASSWORD: 'test-password-123',
    KONG_ADMIN_URL: 'http://127.0.0.1:1',
  });
  config.PORT = 0;
  app = await start(config);
  expect((await call('GET', 'setup')).json().adminRequired).toBe(false);
  const signin = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: {
      email: 'environment@example.com',
      password: 'test-password-123',
    },
  });
  expect(signin.statusCode, signin.body).toBe(200);
  cookie = signin.headers['set-cookie']!.toString().split(';')[0]!;
  expect((await call('GET', 'admin/gateways')).json().items[0].managedBy).toBe(
    'env',
  );
  await app.close();
  await db.db.update(gateways).set({ enabled: false });
  config = loadConfig({
    DATABASE_URL: container.getConnectionUri(),
    SEED_SAMPLE: 'true',
  });
  config.PORT = 0;
  app = await start(config);
  const [gateway] = await db.db.select().from(gateways);
  expect(gateway).toMatchObject({ managedBy: 'admin', enabled: false });
  expect((await call('GET', 'health')).statusCode).toBe(200);
  expect(await db.db.select().from(apis)).toHaveLength(0);
});

it('try-it uses newly saved proxy URLs immediately after its catalog has been read', async () => {
  config = loadConfig({ DATABASE_URL: container.getConnectionUri() });
  const fetcher = vi.fn(async () => new Response('ok'));
  ({ app } = await createApp({
    db: db.db,
    config,
    adapterFor: () => adapter,
    proxyFetch: fetcher,
    logger: false,
  }));
  await claim();
  const id = await connectGateway();
  await publish(id);
  expect(
    (
      await call(
        'GET',
        'try-it?scalar_url=' +
          encodeURIComponent('http://localhost:8000/pets/get'),
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await call('PATCH', `admin/gateways/${id}`, {
        proxyInternalUrl: 'http://127.0.0.1:9000',
        proxyPublicUrl: 'http://localhost:9000',
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await call(
        'GET',
        'try-it?scalar_url=' +
          encodeURIComponent('http://localhost:9000/pets/get'),
      )
    ).statusCode,
  ).toBe(200);
  expect(String(fetcher.mock.calls.at(-1)![0])).toBe(
    'http://127.0.0.1:9000/pets/get',
  );
  expect(
    (
      await call(
        'GET',
        'try-it?scalar_url=' +
          encodeURIComponent('http://localhost:8000/pets/get'),
      )
    ).statusCode,
  ).toBe(400);
});

it.each([401, 404, 503])(
  'maps candidate consumer-list failure %s through the same fixed connection messages',
  async (status) => {
    const { GatewayRejectedError } = await import('@portal/adapter-sdk');
    await boot();
    await claim();
    const id = await connectGateway();
    owned.mockRejectedValueOnce(new GatewayRejectedError(status));
    const response = await call('POST', 'admin/gateways/test', {
      ...values,
      gatewayId: id,
      adminUrl: 'http://localhost:8002',
      adminToken: null,
    });
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json().type).toBe(
      '/problems/' +
        (status === 401
          ? 'gateway-token-refused'
          : status === 404
            ? 'gateway-not-kong'
            : 'gateway-unreachable'),
    );
    if (status === 503) {
      expect(response.json().detail).toContain(
        'resolved from the portal server',
      );
      expect(response.json().detail).toContain('http://kong:8001');
      expect(response.json().detail).not.toContain('that Kong is running');
    }
  },
);

it('AC 9: every gateway operation rejects signed-out, developer and expired sessions before outbound checks', async () => {
  await boot();
  await claim();
  const id = await connectGateway();
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: 'limited@example.com',
      password: 'test-password-123',
      name: 'Limited',
    },
  });
  const developer = signup.headers['set-cookie']!.toString().split(';')[0]!;
  const expired = cookie;
  await db.client`update session set expires_at = now() - interval '1 hour' where user_id = ${ownerId}`;
  vi.clearAllMocks();
  seen.length = 0;
  for (const [auth, expected] of [
    ['', 401],
    [developer, 403],
    [expired, 401],
  ] as const) {
    for (const [method, path, payload] of [
      ['GET', 'admin/gateways'],
      ['GET', 'admin/gateway/services'],
      ['POST', 'admin/gateways', values],
      ['POST', 'admin/gateways/test', values],
      ['PATCH', `admin/gateways/${id}`, { enabled: false }],
      ['DELETE', `admin/gateways/${id}`],
      ['POST', `admin/gateways/${id}/sample`],
    ] as const)
      expect((await call(method, path, payload, auth)).statusCode).toBe(
        expected,
      );
  }
  expect(seen).toHaveLength(0);
  expect(adapter.checkConnection).not.toHaveBeenCalled();
  expect(adapter.listServices).not.toHaveBeenCalled();
  expect((await db.db.select().from(gateways))[0]?.enabled).toBe(true);
});

it.each([
  'unreachable',
  'refused',
  'not-gateway',
  'read-only',
  'proxy',
] as const)(
  'AC 4: failing candidate %s leaves the existing connection and encrypted token intact',
  async (failure) => {
    await boot();
    await claim();
    const id = await connectGateway();
    const [before] = await db.db.select().from(gateways);
    if (failure === 'proxy') proxyReachable = false;
    else outcome = { outcome: failure };
    const input = {
      ...values,
      adminUrl: 'http://localhost:9001',
      adminToken: 'candidate-secret',
    };
    for (const [method, path, payload] of [
      ['POST', 'admin/gateways/test', { ...input, gatewayId: id }],
      ['PATCH', `admin/gateways/${id}`, input],
    ] as const) {
      const response = await call(method, path, payload);
      expect(response.statusCode).toBe(422);
      expect(response.body).not.toContain('candidate-secret');
      expect(response.body).not.toContain('unique-gateway-secret');
    }
    expect((await db.db.select().from(gateways))[0]).toEqual(before);
    expect(logs.join('')).not.toContain('candidate-secret');
  },
);

it.each(['adminUrl', 'proxyInternalUrl', 'proxyPublicUrl'] as const)(
  'AC 4: malformed %s identifies the field and cannot be saved',
  async (field) => {
    await boot();
    await claim();
    for (const path of ['admin/gateways/test', 'admin/gateways']) {
      const response = await call('POST', path, {
        ...values,
        [field]: 'file:///secret',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().errors).toContainEqual(
        expect.objectContaining({ pointer: '/' + field }),
      );
    }
    expect(adapter.checkConnection).not.toHaveBeenCalled();
    expect(await db.db.select().from(gateways)).toHaveLength(0);
  },
);

it('AC 5: missing gateway and unavailable service discovery have actionable errors and no partial import', async () => {
  const { GatewayUnavailableError } = await import('@portal/adapter-sdk');
  await boot();
  await claim();
  const missing = await call('GET', 'admin/gateway/services');
  expect(missing.statusCode).toBe(409);
  expect(missing.json().detail).toContain('Admin → Gateways');
  await connectGateway();
  adapter.listServices.mockRejectedValueOnce(new GatewayUnavailableError());
  const unavailable = await call('GET', 'admin/gateway/services');
  expect(unavailable.statusCode).toBe(503);
  expect(unavailable.json().type).toBe('/problems/gateway-unavailable');
  expect(unavailable.json().detail).toBe(
    "The API gateway didn't respond. Try again in a moment.",
  );
  expect(await db.db.select().from(apis)).toHaveLength(0);
  expect((await call('GET', 'admin/gateway/services')).json().items).toEqual([
    { ...service, linkedApiSlug: null },
  ]);
});

it.each(['admin-only', 'kong-only', 'both'] as const)(
  'AC 8: production startup with %s environment variables covers just the missing setup part',
  async (mode) => {
    const { start } = await import('./startup.js');
    config = loadConfig({
      DATABASE_URL: container.getConnectionUri(),
      ...(mode !== 'kong-only'
        ? {
            ADMIN_EMAIL: 'production@example.com',
            ADMIN_PASSWORD: 'production-test-password',
          }
        : {}),
      ...(mode !== 'admin-only'
        ? { KONG_ADMIN_URL: 'http://127.0.0.1:1' }
        : {}),
    });
    config.NODE_ENV = 'production';
    config.PORT = 0;
    app = await start(config);
    expect((await call('GET', 'setup')).json()).toEqual({
      adminRequired: mode === 'kong-only',
      setupTokenRequired: mode === 'kong-only',
    });
    const rows = await db.db.select().from(gateways);
    if (mode === 'admin-only') expect(rows).toHaveLength(0);
    else expect(rows[0]).toMatchObject({ managedBy: 'env', enabled: true });
    expect((await db.db.select().from(user)).length).toBe(
      mode === 'kong-only' ? 0 : 1,
    );
    expect((await call('GET', 'health')).statusCode).toBe(200);
  },
);
