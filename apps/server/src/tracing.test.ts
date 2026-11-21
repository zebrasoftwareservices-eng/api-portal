// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  apis,
  apiVersions,
  connect,
  gateways,
  instanceSettings,
  migrate,
  traceLatest,
  tracingSelections,
  tracingSettings,
  user,
} from '@portal/db';
import type {
  GatewayAdapter,
  TraceBatch,
  TracingPlan,
} from '@portal/adapter-sdk';
import { GatewayUnavailableError } from '@portal/adapter-sdk';
import { KongAdapter } from '@portal/adapter-kong';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { decrypt } from './crypto.js';
import { applyTracing } from './tracing.js';

let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
let adminCookie = '';
let developerCookie = '';
const instanceId = uuidv7();
const gatewayId = uuidv7();
const apiId = uuidv7();
const apiBId = uuidv7();
const apiVersionId = uuidv7();
const apiBVersionId = uuidv7();
let inspected: 'ok' | 'off' | 'unreachable' = 'ok';
let proxyWorks = true;
let parsedBatch: TraceBatch;
const applied: TracingPlan[] = [];

const classifier = new KongAdapter({
  adminUrl: 'http://unused',
  instanceId,
});

const adapter = {
  kind: 'kong',
  capabilities: () => ({
    apiKeys: true,
    accessControl: true,
    oauthClients: false,
    plans: false,
    usage: false,
    tracing: true,
  }),
  checkConnection: async () => ({ outcome: 'ok', version: '3.9.1' }),
  checkProxy: async () => proxyWorks,
  health: async () => ({ reachable: true, latencyMs: 1 }),
  listServices: async () => [],
  getService: async (id: string) => ({ id, name: id, routes: [], keyAuth: false }),
  ensureConsumer: vi.fn(),
  deleteConsumer: vi.fn(),
  issueCredential: vi.fn(),
  revokeCredential: vi.fn(),
  applyPlanLimits: vi.fn(),
  grantAccess: vi.fn(),
  revokeAccess: vi.fn(),
  protectService: vi.fn(async () => ({ keyAuth: true, findings: [] })),
  applyAccessPolicy: vi.fn(async () => ({ repairs: [], findings: [] })),
  isAccessDenied: () => false,
  listOwnedConsumers: async () => [],
  applyTracing: vi.fn(async (plan: TracingPlan) => {
    applied.push(plan);
    return { created: plan.targets.length, updated: 0, removed: 0 };
  }),
  inspectTracing: vi.fn(async () => {
    if (inspected === 'unreachable') throw new GatewayUnavailableError();
    return {
      instrumentations: inspected === 'off' ? ['off'] : ['request', 'router'],
      samplingRate: 1,
    };
  }),
  ensureTraceProbe: vi.fn(async () => ({ probePath: '/__portal/trace-probe/test' })),
  parseTraceBatch: vi.fn(() => parsedBatch),
  classifySpan: (name: string) => classifier.classifySpan(name),
} as unknown as GatewayAdapter;

const settings = {
  traceEndpoint: 'http://server:4000/api/v1/internal/traces/kong',
  instrumentations: [
    'request',
    'router',
    'balancer',
    'plugin_rewrite',
    'plugin_access',
    'plugin_header_filter',
  ],
  samplingRate: 1,
};

async function saveSettings() {
  const response = await server.inject({
    method: 'PUT',
    url: '/api/v1/admin/tracing',
    headers: { cookie: adminCookie },
    payload: settings,
  });
  expect(response.statusCode, response.body).toBe(200);
}

async function token() {
  const [row] = await connection.db.select().from(tracingSettings).limit(1);
  return decrypt(row!.tokenCiphertext, loadConfig({}).PORTAL_ENCRYPTION_KEY);
}

async function ingest(batch: TraceBatch, bearer?: string) {
  parsedBatch = batch;
  const supplied = bearer ?? (await token());
  return server.inject({
    method: 'POST',
    url: '/api/v1/internal/traces/kong',
    headers: {
      authorization: `Bearer ${supplied}`,
      'content-type': 'application/x-protobuf',
    },
    payload: Buffer.from('otlp'),
  });
}

function batch(
  traceId: string,
  selectionId: string,
  startedMs: number,
): TraceBatch {
  const startNs = String(BigInt(startedMs) * 1_000_000n);
  return {
    resource: { instance: instanceId, selections: [selectionId], apiId },
    spans: [
      {
        traceId,
        spanId: 'root',
        parentSpanId: null,
        name: 'kong',
        startNs,
        durationNs: '40000000',
        status: '1',
        request: { method: 'GET', path: '/sample/get', statusCode: 200 },
      },
      {
        traceId,
        spanId: 'plugin',
        parentSpanId: 'root',
        name: 'kong.access.plugin.key-auth',
        startNs: String(BigInt(startNs) + 2_000_000n),
        durationNs: '21000000',
        status: '1',
      },
      {
        traceId,
        spanId: 'upstream',
        parentSpanId: 'root',
        name: 'kong.balancer',
        startNs: String(BigInt(startNs) + 25_000_000n),
        durationNs: '9000000',
        status: '1',
      },
    ],
  };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const databaseUrl = container.getConnectionUri();
  await migrate(databaseUrl);
  connection = connect(databaseUrl);
  await connection.db.insert(instanceSettings).values({ id: 1, instanceId });
  await connection.db.insert(gateways).values({
    id: gatewayId,
    name: 'default',
    kind: 'kong',
    adminUrl: 'http://kong:8001',
    proxyPublicUrl: 'http://localhost:8000',
    proxyInternalUrl: 'http://kong:8000',
  });
  await connection.db.insert(apis).values({
    id: apiId,
    slug: 'sample',
    gatewayId,
    gatewayServiceId: 'sample',
    gatewayServiceName: 'sample',
    routePath: '/sample',
  });
  await connection.db.insert(apis).values({
    id: apiBId,
    slug: 'orders',
    gatewayId,
    gatewayServiceId: 'orders',
    gatewayServiceName: 'orders',
    routePath: '/orders',
  });
  await connection.db.insert(apiVersions).values([
    {
      id: apiVersionId,
      apiId,
      version: '1.0.0',
      title: 'Sample API',
      description: null,
      document: { openapi: '3.1.0', info: { title: 'Sample API', version: '1.0.0' }, paths: {} },
    },
    {
      id: apiBVersionId,
      apiId: apiBId,
      version: '1.0.0',
      title: 'Orders API',
      description: null,
      document: { openapi: '3.1.0', info: { title: 'Orders API', version: '1.0.0' }, paths: {} },
    },
  ]);
  await connection.db.update(apis).set({ latestVersionId: apiVersionId }).where(eq(apis.id, apiId));
  await connection.db.update(apis).set({ latestVersionId: apiBVersionId }).where(eq(apis.id, apiBId));
  ({ app: server } = await createApp({
    db: connection.db,
    config: loadConfig({ DATABASE_URL: databaseUrl }),
    adapterFor: () => adapter,
    enqueueTracingApply: async () => undefined,
    logger: false,
  }));
  const setup = await server.inject({
    method: 'POST',
    url: '/api/v1/setup/admin',
    payload: { email: 'admin@example.com', password: 'change-me-now' },
  });
  expect(setup.statusCode, setup.body).toBe(201);
  const signIn = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: 'admin@example.com', password: 'change-me-now' },
  });
  adminCookie = signIn.headers['set-cookie']?.toString().split(';')[0] ?? '';
  const developer = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: 'developer@example.com',
      password: 'developer-password',
      name: 'Developer',
    },
  });
  developerCookie = developer.headers['set-cookie']?.toString().split(';')[0] ?? '';
}, 120_000);

beforeEach(async () => {
  inspected = 'ok';
  proxyWorks = true;
  applied.length = 0;
  vi.clearAllMocks();
  await connection.db.delete(traceLatest);
  await connection.db.delete(tracingSelections);
  await connection.db.delete(tracingSettings);
});

afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await container?.stop();
});

describe('tracing admin contract', () => {
  it('AC3 and AC10: pre-fills every quickstart instrumentation', async () => {
    const defaults = await server.inject({
      url: '/api/v1/admin/tracing',
      headers: { cookie: adminCookie },
    });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json().settings).toEqual(settings);
  });

  it('AC9 and failure paths: denies anonymous, developer, and expired sessions on every admin trace endpoint', async () => {
    const selectionId = uuidv7();
    const operations = [
      { method: 'GET', url: '/api/v1/admin/tracing' },
      { method: 'PUT', url: '/api/v1/admin/tracing', payload: settings },
      { method: 'POST', url: '/api/v1/admin/tracing/test', payload: settings },
      {
        method: 'POST',
        url: '/api/v1/admin/tracing/selections',
        payload: { kind: 'api', targetId: apiId },
      },
      { method: 'DELETE', url: `/api/v1/admin/tracing/selections/${selectionId}` },
      { method: 'GET', url: '/api/v1/admin/tracing/latest' },
      { method: 'GET', url: '/api/v1/admin/tracing/developers' },
    ];
    for (const operation of operations) {
      for (const [cookie, status] of [
        ['', 401],
        [developerCookie, 403],
        ['better-auth.session_token=expired.invalid', 401],
      ] as const) {
        const response = await server.inject({
          ...operation,
          headers: cookie ? { cookie } : undefined,
        });
        expect(response.statusCode, `${operation.method} ${operation.url}`).toBe(status);
        expect(response.headers['content-type']).toContain('application/problem+json');
      }
    }

    const invalid = await server.inject({
      method: 'PUT',
      url: '/api/v1/admin/tracing',
      headers: { cookie: adminCookie },
      payload: { ...settings, samplingRate: 2 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.headers['content-type']).toContain('application/problem+json');
  });

  it('AC5: distinguishes an unreachable gateway, tracing-off node, and unreachable proxy', async () => {
    for (const [state, proxy, detail] of [
      ['unreachable', true, 'Kong could not be reached.'],
      ['off', true, 'Tracing is off on this Kong.'],
      ['ok', false, "The portal couldn't reach Kong's proxy."],
    ] as const) {
      inspected = state;
      proxyWorks = proxy;
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/admin/tracing/test',
        headers: { cookie: adminCookie },
        payload: settings,
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().detail).toBe(detail);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
  });

  it('AC5: returns stable cause keys for the dialog copy', async () => {
    for (const [state, proxy, cause] of [
      ['unreachable', true, 'gateway-unreachable'],
      ['off', true, 'tracing-off'],
      ['ok', false, 'proxy-unreachable'],
    ] as const) {
      inspected = state;
      proxyWorks = proxy;
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/admin/tracing/test',
        headers: { cookie: adminCookie },
        payload: settings,
      });
      expect(response.json().cause).toBe(cause);
    }
  });

  it('AC5: reports an endpoint that does not receive the Kong probe', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/tracing/test',
      headers: { cookie: adminCookie },
      payload: settings,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      cause: 'endpoint-unreachable',
      detail: 'The trace endpoint did not receive the probe.',
    });
    expect(response.headers['content-type']).toContain('application/problem+json');
  }, 15_000);

  it('AC1: selection creation is idempotent and reconcile converges after removal', async () => {
    await saveSettings();
    const create = () =>
      server.inject({
        method: 'POST',
        url: '/api/v1/admin/tracing/selections',
        headers: { cookie: adminCookie },
        payload: { kind: 'api', targetId: apiId },
      });
    const first = await create();
    const second = await create();
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);

    await applyTracing(connection.db, {
      config: loadConfig({}),
      load: async () => ({
        row: { enabled: true, proxyInternalUrl: 'http://kong:8000' },
        adapter,
      }),
    } as never);
    await applyTracing(connection.db, {
      config: loadConfig({}),
      load: async () => ({
        row: { enabled: true, proxyInternalUrl: 'http://kong:8000' },
        adapter,
      }),
    } as never);
    expect(applied).toHaveLength(2);
    expect(applied[0]).toEqual(applied[1]);
    expect(applied[0]!.targets).toEqual([
      { scope: { service: 'sample' }, selections: [first.json().id], apiId },
    ]);

    expect(
      (
        await server.inject({
          method: 'DELETE',
          url: `/api/v1/admin/tracing/selections/${first.json().id}`,
          headers: { cookie: adminCookie },
        })
      ).statusCode,
    ).toBe(204);
    await applyTracing(connection.db, {
      config: loadConfig({}),
      load: async () => ({
        row: { enabled: true, proxyInternalUrl: 'http://kong:8000' },
        adapter,
      }),
    } as never);
    expect(applied.at(-1)!.targets).toEqual([]);
  });
});

describe('trace ingest and latest trace', () => {
  it('AC8 failure paths: rejects unsupported media, missing tokens, and oversized batches', async () => {
    await saveSettings();
    parsedBatch = batch('f'.repeat(32), uuidv7(), Date.now());
    const unsupported = await server.inject({
      method: 'POST',
      url: '/api/v1/internal/traces/kong',
      headers: {
        authorization: `Bearer ${await token()}`,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(unsupported.statusCode).toBe(415);
    expect(unsupported.headers['content-type']).toContain('application/problem+json');

    const missingToken = await server.inject({
      method: 'POST',
      url: '/api/v1/internal/traces/kong',
      headers: { 'content-type': 'application/x-protobuf' },
      payload: Buffer.from('otlp'),
    });
    expect(missingToken.statusCode).toBe(401);
    expect(missingToken.headers['content-type']).toContain('application/problem+json');

    const oversized = await server.inject({
      method: 'POST',
      url: '/api/v1/internal/traces/kong',
      headers: {
        authorization: `Bearer ${await token()}`,
        'content-type': 'application/x-protobuf',
      },
      payload: Buffer.alloc(1024 * 1024 + 1),
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.headers['content-type']).toContain('application/problem+json');
  });

  it('AC2, AC7 and AC8: rejects tokens/unselected calls without changing the allowlisted row and deduplicates resends', async () => {
    await saveSettings();
    const selectionId = uuidv7();
    await connection.db.insert(tracingSelections).values({
      id: selectionId,
      kind: 'api',
      apiId,
      createdBy: (await connection.db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')))[0]!.id,
    });
    const accepted = batch('a'.repeat(32), selectionId, Date.now());
    expect((await ingest(accepted)).statusCode).toBe(200);
    expect((await ingest(accepted)).statusCode).toBe(200);
    const [stored] = await connection.db.select().from(traceLatest);
    expect(stored!.spans).toHaveLength(3);
    const serialized = JSON.stringify(stored);
    for (const secret of ['abc123', 'client.ip', 'upstream.address', 'user.name', 'headers', 'body'])
      expect(serialized).not.toContain(secret);

    const wrong = await ingest(batch('b'.repeat(32), selectionId, Date.now() + 1), 'wrong');
    expect(wrong.statusCode).toBe(401);
    expect(wrong.headers['content-type']).toContain('application/problem+json');
    const unselected = batch('c'.repeat(32), uuidv7(), Date.now() + 2);
    const rejected = await ingest(unselected);
    expect(rejected.statusCode).toBe(422);
    expect(rejected.headers['content-type']).toContain('application/problem+json');
    expect((await connection.db.select().from(traceLatest))[0]!.traceId).toBe('a'.repeat(32));
  });

  it('merges split trace batches in both orders without moving the trace start', async () => {
    await saveSettings();
    const selectionId = uuidv7();
    await connection.db.insert(tracingSelections).values({
      id: selectionId,
      kind: 'api',
      apiId,
      createdBy: (await connection.db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')))[0]!.id,
    });

    for (const rootFirst of [true, false]) {
      await connection.db.delete(traceLatest);
      const startedMs = Date.now();
      const complete = batch(rootFirst ? '1'.repeat(32) : '2'.repeat(32), selectionId, startedMs);
      const rootHalf = { ...complete, spans: [complete.spans[0]!] };
      const childHalf = { ...complete, spans: complete.spans.slice(1) };
      for (const half of rootFirst ? [rootHalf, childHalf] : [childHalf, rootHalf])
        expect((await ingest(half)).statusCode).toBe(200);

      const [stored] = await connection.db.select().from(traceLatest);
      expect(stored!.startedAt.getTime()).toBe(startedMs);
      const latest = await server.inject({
        url: `/api/v1/admin/tracing/latest?apiId=${apiId}`,
        headers: { cookie: adminCookie },
      });
      expect(latest.statusCode).toBe(200);
      expect(latest.json().trace.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ spanId: 'root', startOffsetMs: 0 }),
          expect.objectContaining({ spanId: 'plugin', startOffsetMs: 2 }),
        ]),
      );
    }
  });

  it('keeps one latest trace per API and resolves consumer-scoped traces from the root route', async () => {
    await saveSettings();
    const apiSelectionId = uuidv7();
    const developerSelectionId = uuidv7();
    const adminId = (await connection.db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')))[0]!.id;
    const developerId = (await connection.db.select({ id: user.id }).from(user).where(eq(user.role, 'developer')))[0]!.id;
    await connection.db.insert(tracingSelections).values([
      { id: apiSelectionId, kind: 'api', apiId, createdBy: adminId },
      { id: developerSelectionId, kind: 'developer', userId: developerId, createdBy: adminId },
    ]);

    const now = Date.now();
    const apiBTrace = batch('b'.repeat(32), developerSelectionId, now);
    apiBTrace.resource = { instance: instanceId, selections: [developerSelectionId] };
    apiBTrace.spans[0] = { ...apiBTrace.spans[0]!, routePath: '/orders' };
    expect((await ingest(apiBTrace)).statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await ingest(batch('a'.repeat(32), apiSelectionId, now + 1000))).statusCode).toBe(200);

    const newest = await server.inject({
      url: '/api/v1/admin/tracing/latest',
      headers: { cookie: adminCookie },
    });
    expect(newest.statusCode).toBe(200);
    expect(newest.json()).toMatchObject({
      trace: { traceId: 'a'.repeat(32), api: { id: apiId, name: 'Sample API' } },
      apis: [
        { id: apiId, name: 'Sample API' },
        { id: apiBId, name: 'Orders API' },
      ],
    });

    const apiBLatest = await server.inject({
      url: `/api/v1/admin/tracing/latest?apiId=${apiBId}`,
      headers: { cookie: adminCookie },
    });
    expect(apiBLatest.statusCode).toBe(200);
    expect(apiBLatest.json().trace).toMatchObject({
      traceId: 'b'.repeat(32),
      api: { id: apiBId, name: 'Orders API' },
    });
  });

  it('AC6: replaces an older call, classifies real Kong 3.9 names, and marks one slowest span', async () => {
    await saveSettings();
    const selectionId = uuidv7();
    await connection.db.insert(tracingSelections).values({
      id: selectionId,
      kind: 'api',
      apiId,
      createdBy: (await connection.db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')))[0]!.id,
    });
    const now = Date.now();
    await ingest(batch('d'.repeat(32), selectionId, now));
    await ingest(batch('e'.repeat(32), selectionId, now + 1000));
    const latest = await server.inject({
      url: '/api/v1/admin/tracing/latest',
      headers: { cookie: adminCookie },
    });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().trace).toMatchObject({
      traceId: 'e'.repeat(32),
      durationMs: 40,
      request: { method: 'GET', path: '/sample/get', statusCode: 200 },
    });
    expect(latest.json().trace.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'request', slowest: false }),
        expect.objectContaining({ label: 'plugin', plugin: 'key-auth', slowest: true }),
        expect.objectContaining({ label: 'upstream', slowest: false }),
      ]),
    );
    expect(latest.body).not.toContain('d'.repeat(32));
  });
});
