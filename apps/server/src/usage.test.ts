// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { uuidv7 } from 'uuidv7';
import { GenericContainer, TestContainers, Wait } from 'testcontainers';
import { eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import {
  connect,
  migrate,
  instanceSettings,
  gateways,
  user,
  teams,
  teamMembers,
  apps,
  credentials,
  usageCollection,
  usageDaily,
  developerFirstCalls,
  usageIngestBatches,
  apis,
  apiVersions,
  products,
  plans,
} from '@portal/db';
import { KongAdapter } from '@portal/adapter-kong';
import type { Auth } from './auth.js';
import { gatewayConnection } from './gateway-connection.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { encrypt } from './crypto.js';
import {
  monthPeriod,
  collectionState,
  median,
  usageHousekeeping,
  usageToken,
  usageHeartbeat,
} from './usage.js';
let container: StartedPostgreSqlContainer,
  connection: ReturnType<typeof connect>,
  server: Awaited<ReturnType<typeof createApp>>['app'];
const instanceId = uuidv7(),
  ownerId = uuidv7(),
  teammateId = uuidv7(),
  outsiderId = uuidv7(),
  teamId = uuidv7(),
  appId = uuidv7(),
  keyId = uuidv7(),
  secondKeyId = uuidv7(),
  gatewayId = uuidv7();
const config = loadConfig({
  NODE_ENV: 'test',
  PORTAL_USAGE_INGEST_URL: 'http://server:4000/api/v1/internal/usage/kong',
});
let viewer: string | null = ownerId,
  role = 'developer',
  supported = true;
const adapter = new KongAdapter({ adminUrl: 'http://unused', instanceId });
const auth = {
  api: {
    getSession: async () => (viewer ? { user: { id: viewer, role } } : null),
  },
} as unknown as Auth;
const token = 'test-token';
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  await migrate(container.getConnectionUri());
  connection = connect(container.getConnectionUri());
  const db = connection.db;
  await db.insert(instanceSettings).values({ instanceId });
  await db.insert(gateways).values({
    id: gatewayId,
    name: 'test',
    kind: 'kong',
    adminUrl: 'http://unused',
    proxyInternalUrl: 'http://unused',
    proxyPublicUrl: 'http://unused',
  });
  await db.insert(user).values(
    [ownerId, teammateId, outsiderId].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      role: 'developer',
      createdAt: new Date(Date.now() - 600000),
    })),
  );
  await db
    .insert(teams)
    .values({ id: teamId, name: 'Team', createdBy: ownerId });
  await db.insert(teamMembers).values([
    { teamId, userId: ownerId, role: 'admin' },
    { teamId, userId: teammateId, role: 'read-only' },
  ]);
  await db
    .insert(apps)
    .values({ id: appId, teamId, createdBy: ownerId, name: 'Usage' });
  await db.insert(credentials).values([
    {
      id: keyId,
      appId,
      gatewayId,
      keyHint: '1234',
      status: 'active',
      createdBy: teammateId,
    },
    {
      id: secondKeyId,
      appId,
      gatewayId,
      keyHint: '5678',
      status: 'revoked',
      createdBy: ownerId,
    },
  ]);
  await db.insert(usageCollection).values({
    tokenCiphertext: encrypt(token, config.PORTAL_ENCRYPTION_KEY),
    configuredAt: new Date(Date.now() - 600000),
  });
  server = (
    await createApp({
      db,
      config,
      auth,
      logger: false,
      adapterFor: () => {
        adapter.capabilities = () => ({
          apiKeys: true,
          accessControl: true,
          oauthClients: false,
          plans: true,
          usage: supported,
        });
        return adapter;
      },
    })
  ).app;
});
afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await container?.stop();
});
beforeEach(async () => {
  viewer = ownerId;
  role = 'developer';
  supported = true;
  await connection.db.delete(usageDaily);
  await connection.db.delete(usageIngestBatches);
  await connection.db.delete(developerFirstCalls);
  await connection.db.update(usageCollection).set({ lastReceivedAt: null });
});
const entry = (status = 200, credentialId = keyId, timestamp = Date.now()) => ({
  started_at: timestamp,
  consumer: { username: `portal-app-${appId}` },
  authenticated_entity: { id: credentialId },
  service: { id: 'service' },
  response: { status },
});
const ingest = (body: unknown, authorization = `Bearer ${token}`) =>
  server.inject({
    method: 'POST',
    url: '/api/v1/internal/usage/kong',
    headers: { authorization, 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  });
const usage = () => server.inject(`/api/v1/apps/${appId}/usage`);
it('buckets by start month, deduplicates raw batches and attributes earliest 2xx to credential creator', async () => {
  const start = monthPeriod(new Date()).start.getTime();
  const body = [
    entry(200),
    entry(404),
    entry(503),
    entry(302),
    entry(204, keyId, start - 1),
    entry(200, uuidv7()),
    { ...entry(), consumer: {} },
    { ...entry(), consumer: { username: `portal-app-${uuidv7()}` } },
  ];
  expect((await ingest(body)).statusCode).toBe(204);
  expect((await ingest(body)).statusCode).toBe(204);
  const result = (await usage()).json();
  expect(result).toMatchObject({
    total: 4,
    quota: null,
    byStatus: { '2xx': 1, '4xx': 1, '5xx': 1, other: 1 },
    collection: { status: 'ok' },
  });
  let rows = await connection.db.select().from(developerFirstCalls);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.userId).toBe(teammateId);
  expect(rows[0]!.firstCallAt.getTime()).toBe(start - 1);
  expect((await ingest(entry(400, secondKeyId))).statusCode).toBe(204);
  expect(await connection.db.select().from(developerFirstCalls)).toHaveLength(
    1,
  );
  expect((await ingest(entry(204, secondKeyId))).statusCode).toBe(204);
  rows = await connection.db.select().from(developerFirstCalls);
  expect(rows.map((r) => r.userId)).toContain(ownerId);
});
it('authenticates ingest, validates envelopes and limits bodies without session checks', async () => {
  viewer = null;
  expect((await ingest({}, 'Bearer wrong')).statusCode).toBe(401);
  expect((await ingest(null)).statusCode).toBe(400);
  expect((await ingest('bad')).statusCode).toBe(400);
  expect((await ingest(Array(5001).fill({}))).statusCode).toBe(413);
  expect(
    (await ingest({ large: 'x'.repeat(2 * 1024 * 1024) })).statusCode,
  ).toBe(413);
  for (let i = 0; i < 65; i++)
    expect((await ingest({ invalid: i })).statusCode).toBe(204);
  expect(await connection.db.select().from(usageDaily)).toEqual([]);
});
it('AC 3: rejected authentication and malformed entries cannot pollute or suppress a valid batch', async () => {
  for (const authorization of ['', 'Basic test-token', 'Bearer wrong']) {
    const rejected = await ingest(entry(), authorization);
    expect(rejected.statusCode).toBe(401);
    expect(rejected.headers['content-type']).toContain(
      'application/problem+json',
    );
  }
  expect(await connection.db.select().from(usageDaily)).toEqual([]);
  const valid = entry();
  const batch = [
    null,
    'invalid',
    { ...entry(), response: { status: '200' } },
    { ...entry(), authenticated_entity: { id: uuidv7() } },
    { ...entry(), consumer: { username: 'operator-consumer' } },
    valid,
  ];
  expect((await ingest(batch)).statusCode).toBe(204);
  expect((await ingest(batch)).statusCode).toBe(204);
  expect((await usage()).json()).toMatchObject({
    total: 1,
    byStatus: { '2xx': 1, '4xx': 0, '5xx': 0, other: 0 },
  });
  expect(await connection.db.select().from(developerFirstCalls)).toHaveLength(
    1,
  );
});
it('enforces app membership and admin access, returns behind counts and null unsupported values', async () => {
  await ingest(entry());
  viewer = teammateId;
  expect((await usage()).statusCode).toBe(200);
  viewer = outsiderId;
  expect((await usage()).statusCode).toBe(404);
  expect((await server.inject('/api/v1/admin/insights')).statusCode).toBe(403);
  viewer = null;
  expect((await usage()).statusCode).toBe(401);
  expect((await server.inject('/api/v1/admin/insights')).statusCode).toBe(401);
  viewer = ownerId;
  role = 'admin';
  await connection.db
    .update(usageCollection)
    .set({ lastReceivedAt: new Date(Date.now() - 360000) });
  expect((await usage()).json()).toMatchObject({
    total: 1,
    collection: { status: 'behind' },
  });
  const insights = (await server.inject('/api/v1/admin/insights')).json();
  expect(insights).toMatchObject({
    signups: 3,
    activeApps: 1,
    topApis: [],
    timeToFirstCall: { covered: 1, total: 3, targetSeconds: 600 },
  });
  supported = false;
  expect((await usage()).json()).toMatchObject({
    total: null,
    byStatus: null,
    collection: { status: 'unsupported' },
  });
  expect((await server.inject('/api/v1/admin/insights')).json()).toMatchObject({
    activeApps: null,
    topApis: null,
    timeToFirstCall: { medianSeconds: null, covered: 0 },
  });
});
it('prunes only expired aggregates and dedupe digests', async () => {
  await ingest(entry());
  await connection.db.insert(usageDaily).values({ appId, day: '2020-01-01' });
  await connection.db
    .insert(usageIngestBatches)
    .values({ digest: 'old', receivedAt: new Date(0) });
  await usageHousekeeping(connection.db, 400);
  expect(await connection.db.select().from(usageDaily)).toHaveLength(1);
  expect(await connection.db.select().from(usageIngestBatches)).toHaveLength(1);
  expect(await connection.db.select().from(developerFirstCalls)).toHaveLength(
    1,
  );
});
it('computes UTC month bounds, median and setup grace independently', () => {
  expect(monthPeriod(new Date('2026-12-31T23:59:59Z'))).toEqual({
    start: new Date('2026-12-01Z'),
    resetsAt: new Date('2027-01-01Z'),
  });
  expect(median([9, 2, 3, 4])).toBe(3);
  expect(median([])).toBeNull();
  expect(collectionState(false, true, undefined, new Date()).status).toBe(
    'unsupported',
  );
  expect(collectionState(true, false, undefined, new Date()).status).toBe(
    'not-configured',
  );
  const row = {
    id: 1,
    tokenCiphertext: '',
    configuredAt: new Date(0),
    lastReceivedAt: null,
    lastHeartbeatAt: null,
  };
  expect(collectionState(true, true, row, new Date(300001)).status).toBe(
    'behind',
  );
  expect(collectionState(true, true, row, new Date(300000)).status).toBe('ok');
});

it('creates one encrypted stable token during concurrent gateway loads', async () => {
  await connection.db.delete(usageCollection);
  try {
    const tokens = await Promise.all(
      Array.from({ length: 12 }, () => usageToken(connection.db, config)),
    );
    expect(new Set(tokens).size).toBe(1);
    expect(Buffer.from(tokens[0]!, 'base64url')).toHaveLength(32);
    const [stored] = await connection.db.select().from(usageCollection);
    expect(stored!.tokenCiphertext).not.toContain(tokens[0]!);
  } finally {
    await connection.db.delete(usageCollection);
    await connection.db.insert(usageCollection).values({
      tokenCiphertext: encrypt(token, config.PORTAL_ENCRYPTION_KEY),
      configuredAt: new Date(),
    });
  }
});
it('uses the configured heartbeat path and warns once on a failed request', async () => {
  const log = { error: vi.fn(), warn: vi.fn() };
  const gateway = gatewayConnection(
    connection.db,
    config,
    instanceId,
    log,
    () => adapter,
  );
  gateway.usageHeartbeatPath = '/heartbeat-from-adapter';
  const fetcher = vi.fn(async () => {
    throw new Error('private failure detail');
  });
  await usageHeartbeat(connection.db, gateway, log, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toEqual([
    'http://unused/heartbeat-from-adapter',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  ]);
  expect(log.warn).toHaveBeenCalledWith(
    { code: 'usage-heartbeat-failed' },
    'Usage heartbeat failed',
  );
});

it('AC 2: returns exactly 12 successes, five client errors including 429, and three server errors', async () => {
  const statuses = [
    ...Array(12).fill(200),
    400,
    401,
    403,
    404,
    429,
    500,
    502,
    503,
  ];
  await ingest(
    statuses.map((status, index) => entry(status, keyId, Date.now() - index)),
  );
  expect((await usage()).json()).toMatchObject({
    total: 20,
    byStatus: { '2xx': 12, '4xx': 5, '5xx': 3, other: 0 },
  });
});

it('AC 5/9: permission failures are problem+json without counts, including an expired session', async () => {
  await ingest(entry());
  for (const [identity, url, status] of [
    [outsiderId, `/api/v1/apps/${appId}/usage`, 404],
    [ownerId, '/api/v1/admin/insights', 403],
    [null, `/api/v1/apps/${appId}/usage`, 401],
    [null, '/api/v1/admin/insights', 401],
  ] as const) {
    viewer = identity;
    const response = await server.inject({
      url,
      headers: { cookie: 'better-auth.session_token=expired' },
    });
    expect(response.statusCode).toBe(status);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.json()).toMatchObject({
      status,
      type: expect.any(String),
      title: expect.any(String),
    });
    expect(response.json()).not.toHaveProperty('total');
    expect(response.json()).not.toHaveProperty('activeApps');
  }
});

it('AC 7/8: ranks only five APIs, excludes old calls, orders developers and computes attribution median', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const ids: string[] = [];
  try {
    for (let index = 0; index < 6; index++) {
      const id = uuidv7(),
        versionId = uuidv7();
      ids.push(id);
      await connection.db.insert(apis).values({
        id,
        slug: `usage-${index}`,
        gatewayId,
        gatewayServiceId: id,
        gatewayServiceName: id,
        routePath: `/${id}`,
      });
      await connection.db.insert(apiVersions).values({
        id: versionId,
        apiId: id,
        version: '1.0.0',
        title: `API ${index}`,
        document: {},
      });
      await connection.db
        .update(apis)
        .set({ latestVersionId: versionId })
        .where(eq(apis.id, id));
      await connection.db
        .insert(usageDaily)
        .values({ appId, serviceId: id, day: today, count2xx: index + 1 });
    }
    await connection.db.insert(usageDaily).values({
      appId,
      serviceId: ids[0]!,
      day: '2020-01-01',
      count2xx: 10000,
    });
    const signup = new Date(Date.now() - 600000);
    await connection.db
      .update(user)
      .set({ createdAt: signup })
      .where(eq(user.id, ownerId));
    await connection.db
      .update(user)
      .set({ createdAt: new Date(signup.getTime() + 1000) })
      .where(eq(user.id, teammateId));
    await ingest(entry(500, secondKeyId));
    await ingest(entry(400, keyId));
    expect(await connection.db.select().from(developerFirstCalls)).toHaveLength(
      0,
    );
    await ingest(entry(200, keyId, signup.getTime() + 122000));
    const rows = await connection.db.select().from(developerFirstCalls);
    expect(rows.map((r) => r.userId)).toEqual([teammateId]);
    await ingest(entry(204, secondKeyId, signup.getTime() + 60000));
    role = 'admin';
    const result = (await server.inject('/api/v1/admin/insights')).json();
    expect(result).toMatchObject({
      signups: 3,
      activeApps: 1,
      timeToFirstCall: {
        covered: 2,
        total: 3,
        medianSeconds: 90,
        targetSeconds: 600,
      },
    });
    expect(result.topApis.map((a: { calls: number }) => a.calls)).toEqual([
      6, 5, 4, 3, 2,
    ]);
    expect(
      result.timeToFirstCall.developers.map(
        (d: { signedUpAt: string }) => d.signedUpAt,
      ),
    ).toEqual(
      result.timeToFirstCall.developers
        .map((d: { signedUpAt: string }) => d.signedUpAt)
        .sort()
        .reverse(),
    );
    expect(
      result.timeToFirstCall.developers.find(
        (d: { userId: string }) => d.userId === outsiderId,
      ),
    ).toMatchObject({ firstCallAt: null, secondsToFirstCall: null });
    await connection.db.delete(usageDaily);
    await connection.db.delete(developerFirstCalls);
    expect(
      (await server.inject('/api/v1/admin/insights')).json(),
    ).toMatchObject({
      activeApps: 0,
      topApis: [],
      timeToFirstCall: { covered: 0, medianSeconds: null },
    });
  } finally {
    for (const id of ids)
      await connection.db.delete(apis).where(eq(apis.id, id));
  }
});

it('AC 1/3: twenty real Kong calls arrive automatically within 60 seconds; rejected keys add nothing', async () => {
  const productId = uuidv7(),
    planId = uuidv7();
  await connection.db
    .insert(products)
    .values({ id: productId, slug: productId, name: 'Usage', description: '' });
  await connection.db.insert(plans).values({
    id: planId,
    productId,
    name: '1000 calls',
    rateLimit: 100,
    rateLimitUnit: 'second',
    monthlyQuota: 1000,
  });
  await connection.db.update(apps).set({ planId }).where(eq(apps.id, appId));
  await connection.client.unsafe('CREATE DATABASE kong_usage');
  const address = await server.listen({ port: 0, host: '0.0.0.0' });
  const port = Number(new URL(address).port);
  await TestContainers.exposeHostPorts(port, container.getPort());
  const environment = {
    KONG_DATABASE: 'postgres',
    KONG_PG_HOST: 'host.testcontainers.internal',
    KONG_PG_PORT: String(container.getPort()),
    KONG_PG_USER: container.getUsername(),
    KONG_PG_PASSWORD: container.getPassword(),
    KONG_PG_DATABASE: 'kong_usage',
  };
  const migration = await new GenericContainer('kong:3.9')
    .withEnvironment(environment)
    .withCommand(['kong', 'migrations', 'bootstrap'])
    .withWaitStrategy(Wait.forOneShotStartup())
    .start();
  await migration.stop();
  const kong = await new GenericContainer('kong:3.9')
    .withEnvironment({
      ...environment,
      KONG_ADMIN_LISTEN: '0.0.0.0:8001',
      KONG_WORKER_CONSISTENCY: 'strict',
      KONG_NGINX_WORKER_PROCESSES: '1',
    })
    .withExposedPorts(8000, 8001)
    .withWaitStrategy(Wait.forHttp('/status', 8001))
    .start();
  try {
    const real = new KongAdapter({
      adminUrl: `http://${kong.getHost()}:${kong.getMappedPort(8001)}`,
      instanceId,
      usage: {
        endpoint: `http://host.testcontainers.internal:${port}/api/v1/internal/usage/kong`,
        token,
      },
    });
    const serviceId = uuidv7();
    await real.request(`/services/${serviceId}`, 'PUT', {
      url: 'http://127.0.0.1:65535',
    });
    await real.request(`/routes/${serviceId}`, 'PUT', {
      service: { id: serviceId },
      paths: ['/usage-qa'],
    });
    await real.request(`/services/${serviceId}/plugins`, 'POST', {
      name: 'key-auth',
    });
    await real.request(`/services/${serviceId}/plugins`, 'POST', {
      name: 'request-termination',
      config: { status_code: 200 },
    });
    await real.ensureConsumer({ id: appId });
    const key = `qa-${uuidv7()}`;
    await real.issueCredential({ id: appId }, { id: keyId, key });
    const url = `http://${kong.getHost()}:${kong.getMappedPort(8000)}/usage-qa`;
    for (let index = 0; index < 20; index++) {
      const response = await fetch(url, {
        headers: { apikey: key, 'x-private-test': 'private-header-value' },
      });
      expect(response.status).toBe(200);
      await response.body?.cancel();
    }
    await expect
      .poll(async () => (await usage()).json().total, {
        timeout: 60000,
        interval: 100,
      })
      .toBe(20);
    expect((await usage()).json()).toMatchObject({ total: 20, quota: 1000 });
    await real.revokeCredential({ id: appId }, keyId);
    for (const rejected of [undefined, 'unknown-key', key]) {
      const response = await fetch(url, {
        headers: rejected ? { apikey: rejected } : {},
      });
      expect(response.status).toBe(401);
      await response.body?.cancel();
    }
    // A separately logged consumer event is an ingestion barrier after the rejected requests.
    const replacement = `qa-${uuidv7()}`;
    await real.issueCredential(
      { id: appId },
      { id: secondKeyId, key: replacement },
    );
    const response = await fetch(url, { headers: { apikey: replacement } });
    expect(response.status).toBe(200);
    await response.body?.cancel();
    await expect
      .poll(async () => (await usage()).json().total, {
        timeout: 60000,
        interval: 100,
      })
      .toBe(21);
    const stored = JSON.stringify(
      await connection.db.select().from(usageDaily),
    );
    for (const secret of [key, replacement, 'apikey', 'private-header-value'])
      expect(stored).not.toContain(secret);
    const period = monthPeriod(new Date());
    await connection.db.insert(usageDaily).values({
      appId,
      day: new Date(period.start.getTime() - 1).toISOString().slice(0, 10),
      count2xx: 99,
    });
    const lastUpdate = new Date(Date.now() - 360000);
    await connection.db.update(usageCollection).set({
      configuredAt: new Date(Date.now() - 600000),
      lastReceivedAt: lastUpdate,
    });
    expect((await usage()).json()).toMatchObject({
      total: 21,
      quota: 1000,
      period: { resetsAt: period.resetsAt.toISOString() },
      collection: { status: 'behind', lastUpdatedAt: lastUpdate.toISOString() },
    });
  } finally {
    await kong.stop();
  }
}, 180000);

it('AC 11: the hosted reset SQL removes visitor aggregates and first-call attribution from insights', async () => {
  await ingest(entry());
  role = 'admin';
  expect(
    (await server.inject('/api/v1/admin/insights')).json().activeApps,
  ).toBe(1);
  const script = await readFile(
    new URL('../../../deploy/hosted/reset-demo.sh', import.meta.url),
    'utf8',
  );
  const sql = script.match(/<<'SQL'\n([\s\S]*?)\nSQL/);
  expect(sql).not.toBeNull();
  const reserved = await connection.client.reserve();
  try {
    await reserved.unsafe(sql![1]!);
  } finally {
    reserved.release();
  }
  expect(await connection.db.select().from(usageDaily)).toEqual([]);
  expect(await connection.db.select().from(developerFirstCalls)).toEqual([]);
  expect((await server.inject('/api/v1/admin/insights')).json()).toMatchObject({
    signups: 0,
    activeApps: 0,
    topApis: [],
  });
});
