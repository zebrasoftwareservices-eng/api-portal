// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { uuidv7 } from 'uuidv7';
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
    await connection.db
      .insert(usageCollection)
      .values({
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
