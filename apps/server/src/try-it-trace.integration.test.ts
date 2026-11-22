// SPDX-License-Identifier: Apache-2.0
import { createServer, type AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  GenericContainer,
  TestContainers,
  Wait,
  type StartedTestContainer,
} from 'testcontainers';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  apis,
  apiVersions,
  connect,
  gateways,
  instanceSettings,
  migrate,
  session,
  tracingSelections,
  tryItTraces,
} from '@portal/db';
import { KongAdapter } from '@portal/adapter-kong';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
let kong: StartedTestContainer;
let proxyUrl = '';
const instanceId = uuidv7();
const gatewayId = uuidv7();
const apiId = uuidv7();
const versionId = uuidv7();
const serviceId = uuidv7();
const routeId = uuidv7();
const secretQuery = 'abc123';
const secretHeader = 'header-secret-xyz';
const secretBody = 'body-secret-xyz';
const apiKey = 'portal-key-qa';
const spoofedTraceId = 'a'.repeat(32);
let adminCookie = '';
let developerCookie = '';
let secondDeveloperCookie = '';
let developerId = '';
let secondDeveloperId = '';
let traceEndpoint = '';
let observedSamplingReady = 0;

const instrumentations = [
  'request',
  'router',
  'balancer',
  'plugin_rewrite',
  'plugin_access',
  'plugin_header_filter',
] as const;

function sessionCookie(headers: { 'set-cookie'?: string | string[] | number }) {
  const raw = headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : String(raw ?? '');
  return first.split(';')[0] ?? '';
}

function tryItTarget(query = true) {
  const target = `${proxyUrl}/qa-trace${query ? `?token=${secretQuery}` : ''}`;
  return '/api/v1/try-it?scalar_url=' + encodeURIComponent(target);
}

function callTryIt(cookie?: string) {
  return server.inject({
    method: 'POST',
    url: tryItTarget(true),
    headers: {
      ...(cookie ? { cookie } : {}),
      'content-type': 'application/json',
      apikey: apiKey,
      'x-qa-secret': secretHeader,
      traceparent: `00-${spoofedTraceId}-${'b'.repeat(16)}-01`,
      tracestate: 'browser=spoofed',
    },
    payload: JSON.stringify({ password: secretBody }),
  });
}

async function readTrace(traceId: string, cookie?: string) {
  return server.inject({
    url: `/api/v1/try-it/traces/${traceId}`,
    headers: cookie ? { cookie } : {},
  });
}

async function pollStored(traceId: string, cookie: string, timeout: number) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const read = await readTrace(traceId, cookie);
    const trace = read.statusCode === 200 ? read.json().trace : null;
    if (trace?.traceId === traceId && Array.isArray(trace.spans) && trace.spans.length > 0)
      return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function untilReady(traceId: string, cookie: string, timeout: number) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < timeout) {
    const read = await readTrace(traceId, cookie);
    const body = read.statusCode === 200 ? read.json() : null;
    last = `${read.statusCode} ${read.body.slice(0, 500)}`;
    if (body?.state === 'ready') return body;
    const spans = body?.trace?.spans as { name?: string; parentSpanId?: string | null }[] | undefined;
    if (spans?.length) {
      const parents = spans.map((span) => `${span.name}:${span.parentSpanId ?? 'null'}`).join(', ');
      throw new Error(
        `trace ${traceId} stored ${spans.length} spans but state is ${body.state}, so it is not ready. Span parents: ${parents}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const rows = await connection.db.select().from(tryItTraces);
  throw new Error(
    `trace ${traceId} not ready: ${last}\nrows ${JSON.stringify(rows.map((row) => ({ traceId: row.traceId, rootSpanId: row.rootSpanId, spanCount: row.spans.length })))}`,
  );
}

async function pointGateway(internal: string) {
  await connection.db
    .update(gateways)
    .set({ proxyInternalUrl: internal, proxyPublicUrl: proxyUrl, adminUrl: kongAdminUrl() })
    .where(eq(gateways.id, gatewayId));
}

function kongAdminUrl() {
  return `http://${kong.getHost()}:${kong.getMappedPort(8001)}`;
}

function kongEnv(rate: string) {
  return {
    KONG_DATABASE: 'postgres',
    KONG_PG_HOST: 'host.testcontainers.internal',
    KONG_PG_PORT: String(container.getPort()),
    KONG_PG_USER: container.getUsername(),
    KONG_PG_PASSWORD: container.getPassword(),
    KONG_PG_DATABASE: 'kong_tryit',
    KONG_ADMIN_LISTEN: '0.0.0.0:8001',
    KONG_PROXY_LISTEN: '0.0.0.0:8000',
    KONG_WORKER_CONSISTENCY: 'strict',
    KONG_NGINX_WORKER_PROCESSES: '1',
    KONG_TRACING_INSTRUMENTATIONS: instrumentations.join(','),
    KONG_TRACING_SAMPLING_RATE: rate,
  };
}

async function startKong(rate: string) {
  return new GenericContainer('kong:3.9')
    .withEnvironment(kongEnv(rate))
    .withExposedPorts(8000, 8001)
    .withWaitStrategy(Wait.forHttp('/status', 8001))
    .withStartupTimeout(120_000)
    .start();
}

async function rememberProxy() {
  proxyUrl = `http://${kong.getHost()}:${kong.getMappedPort(8000)}`;
  await pointGateway(proxyUrl);
}

async function nodeTracing() {
  const root = (await (await fetch(`${kongAdminUrl()}/`)).json()) as {
    configuration?: {
      tracing_instrumentations?: string | string[];
      tracing_sampling_rate?: number | string;
    };
  };
  const raw = root.configuration?.tracing_instrumentations;
  const enabled = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',').map((value) => value.trim()).filter(Boolean)
      : [];
  return {
    instrumentations: enabled,
    samplingRate: Number(root.configuration?.tracing_sampling_rate),
  };
}

async function waitForProxy() {
  const readyAt = Date.now() + 20_000;
  let proxyStatus = 0;
  while (Date.now() < readyAt) {
    try {
      const response = await fetch(`${proxyUrl}/qa-trace`, { method: 'POST' });
      await response.body?.cancel();
      proxyStatus = response.status;
      if (proxyStatus === 401) return;
    } catch {
      proxyStatus = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Kong proxy did not answer 401: ${proxyStatus} ${proxyUrl}`);
}

async function restartKong(rate: string) {
  await kong.stop();
  kong = await startKong(rate);
  await rememberProxy();
  await waitForProxy();
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const databaseUrl = container.getConnectionUri();
  await migrate(databaseUrl);
  connection = connect(databaseUrl);
  await connection.db.insert(instanceSettings).values({ id: 1, instanceId });
  await connection.db.insert(gateways).values({
    id: gatewayId,
    name: 'qa-kong',
    kind: 'kong',
    adminUrl: 'http://127.0.0.1:9',
    proxyPublicUrl: 'http://127.0.0.1:9',
    proxyInternalUrl: 'http://127.0.0.1:9',
  });
  ({ app: server } = await createApp({
    db: connection.db,
    config: loadConfig({ DATABASE_URL: databaseUrl, NODE_ENV: 'test' }),
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
  adminCookie = sessionCookie(signIn.headers);
  const developer = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: 'developer-x@example.com',
      password: 'developer-password',
      name: 'Developer X',
    },
  });
  developerCookie = sessionCookie(developer.headers);
  developerId = (await server.inject({ url: '/api/v1/me', headers: { cookie: developerCookie } })).json().id;
  const second = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: 'developer-y@example.com',
      password: 'developer-y-password',
      name: 'Developer Y',
    },
  });
  secondDeveloperCookie = sessionCookie(second.headers);
  secondDeveloperId = (
    await server.inject({ url: '/api/v1/me', headers: { cookie: secondDeveloperCookie } })
  ).json().id;

  const address = await server.listen({ port: 0, host: '0.0.0.0' });
  const port = Number(new URL(address).port);
  await TestContainers.exposeHostPorts(port, container.getPort());
  traceEndpoint = `http://host.testcontainers.internal:${port}/api/v1/internal/traces/kong`;
  await connection.client.unsafe('CREATE DATABASE kong_tryit');
  const migration = await new GenericContainer('kong:3.9')
    .withEnvironment(kongEnv('0.01'))
    .withCommand(['kong', 'migrations', 'bootstrap'])
    .withWaitStrategy(Wait.forOneShotStartup())
    .withStartupTimeout(120_000)
    .start();
  await migration.stop();
  kong = await startKong('0.01');
  await rememberProxy();
  const node = await nodeTracing();
  expect(node.instrumentations).toEqual(expect.arrayContaining(['request', 'plugin_access']));
  expect(node.samplingRate).toBeCloseTo(0.01);

  const adapter = new KongAdapter({ adminUrl: kongAdminUrl(), instanceId });
  await adapter.request(`/services/${serviceId}`, 'PUT', {
    name: 'qa-trace',
    url: 'http://127.0.0.1:65535',
  });
  await adapter.request(`/routes/${routeId}`, 'PUT', {
    service: { id: serviceId },
    paths: ['/qa-trace'],
  });
  await adapter.request(`/services/${serviceId}/plugins`, 'POST', {
    name: 'key-auth',
    config: { hide_credentials: true },
  });
  const consumerId = uuidv7();
  await adapter.request(`/consumers/${consumerId}`, 'PUT', { username: 'qa-caller' });
  await adapter.request(`/consumers/${consumerId}/key-auth/${uuidv7()}`, 'PUT', { key: apiKey });
  await connection.db.insert(apis).values({
    id: apiId,
    slug: 'qa-trace',
    gatewayId,
    gatewayServiceId: serviceId,
    gatewayServiceName: 'qa-trace',
    routePath: '/qa-trace',
  });
  await connection.db.insert(apiVersions).values({
    id: versionId,
    apiId,
    version: '1.0.0',
    title: 'QA Trace',
    description: null,
    document: {
      openapi: '3.1.0',
      info: { title: 'QA Trace', version: '1.0.0' },
      components: {
        securitySchemes: {
          qaSecret: { type: 'apiKey', in: 'header', name: 'X-QA-Secret' },
        },
      },
      paths: { '/': { post: { responses: { '200': { description: 'OK' } } } } },
    },
  });
  await connection.db.update(apis).set({ latestVersionId: versionId }).where(eq(apis.id, apiId));
  const saved = await server.inject({
    method: 'PUT',
    url: '/api/v1/admin/tracing',
    headers: { cookie: adminCookie },
    payload: { traceEndpoint, instrumentations, samplingRate: 1 },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const selected = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/tracing/selections',
    headers: { cookie: adminCookie },
    payload: { kind: 'api', targetId: apiId },
  });
  expect(selected.statusCode, selected.body).toBe(201);
  const applied = await server.inject({
    url: '/api/v1/admin/tracing',
    headers: { cookie: adminCookie },
  });
  expect(applied.json().apply, applied.body).toMatchObject({ status: 'applied' });
  await waitForProxy();
}, 180_000);

afterAll(async () => {
  await server?.close();
  await kong?.stop();
  await connection?.client.end();
  await container?.stop();
});

it('027 sampling risk: five Try it calls at KONG_TRACING_SAMPLING_RATE=0.01 record how many traces arrive', async () => {
  const traceIds: string[] = [];
  let ready = 0;
  for (let callNumber = 0; callNumber < 5; callNumber += 1) {
    const response = await server.inject({
      url: tryItTarget(false),
      headers: { cookie: developerCookie, apikey: apiKey },
    });
    expect(response.headers['x-portal-trace-state'], response.body).toBe('traced');
    expect(response.statusCode, response.body).not.toBe(401);
    const traceId = String(response.headers['x-portal-trace-id']);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    traceIds.push(traceId);
    // Count stored spans. Kong 3.9 can apply tracing_sampling_rate over the
    // sampled flag, so fewer than 5 arrivals is a finding, not a header failure.
    const arrived = await pollStored(traceId, developerCookie, 4_000);
    if (arrived) ready += 1;
  }
  expect(new Set(traceIds).size).toBe(5);
  observedSamplingReady = ready;
  // Kong 3.9 applies tracing_sampling_rate even when traceparent is sampled.
  // Fewer than 5 stored traces is the recorded finding, not a failed portal header.
  console.log(`SAMPLING_SPANS ${ready}/5`);
}, 45_000);

it('027 AC1-5: a real Kong trace matches the sent traceparent, hides secrets, and redacts plugin names', async () => {
  if (observedSamplingReady < 5) {
    await restartKong('1');
    expect((await nodeTracing()).samplingRate).toBe(1);
  }
  const [first, second] = await Promise.all([
    callTryIt(developerCookie),
    callTryIt(secondDeveloperCookie),
  ]);
  expect(first.statusCode, first.body).not.toBe(401);
  expect(second.statusCode, second.body).not.toBe(401);
  expect(first.headers['x-portal-trace-state']).toBe('traced');
  expect(second.headers['x-portal-trace-state']).toBe('traced');
  const firstId = String(first.headers['x-portal-trace-id']);
  const secondId = String(second.headers['x-portal-trace-id']);
  expect(firstId).not.toBe(secondId);
  expect(firstId).not.toBe(spoofedTraceId);
  expect(secondId).not.toBe(spoofedTraceId);
  const own = await untilReady(firstId, developerCookie, 20_000);
  const other = await untilReady(secondId, secondDeveloperCookie, 20_000);
  expect(own.trace.request).toMatchObject({
    method: 'POST',
    path: '/qa-trace',
    statusCode: first.statusCode,
  });
  expect(own.trace.durationMs).toEqual(expect.any(Number));
  expect(own.trace.spans.some((span: { label: string }) => span.label === 'request')).toBe(true);
  const plugins = own.trace.spans.filter((span: { label: string }) => span.label === 'plugin');
  expect(plugins.length).toBeGreaterThan(0);
  for (const span of plugins)
    expect(span).toMatchObject({ name: 'plugin', plugin: null });
  expect(own.trace.spans.some((span: { slowest: boolean }) => span.slowest)).toBe(true);
  expect(other.traceId).toBe(secondId);
  for (const body of [own, other]) {
    const text = JSON.stringify(body);
    for (const secret of [secretQuery, secretHeader, secretBody, apiKey, 'client.ip', 'upstream.address', spoofedTraceId])
      expect(text).not.toContain(secret);
    expect(text).not.toContain('key-auth');
    expect(text).not.toContain('?');
  }
  const stored = JSON.stringify(await connection.db.select().from(tryItTraces));
  for (const secret of [secretQuery, secretHeader, secretBody, apiKey, spoofedTraceId])
    expect(stored).not.toContain(secret);

  const adminCall = await callTryIt(adminCookie);
  expect(adminCall.headers['x-portal-trace-state']).toBe('traced');
  const adminId = String(adminCall.headers['x-portal-trace-id']);
  const adminTrace = await untilReady(adminId, adminCookie, 20_000);
  expect(adminTrace.trace.spans.some((span: { plugin: string | null }) => span.plugin === 'key-auth')).toBe(true);
  const latest = await server.inject({
    url: `/api/v1/admin/tracing/latest?apiId=${apiId}`,
    headers: { cookie: adminCookie },
  });
  expect(latest.statusCode, latest.body).toBe(200);
  expect(latest.json().trace.traceId).toBe(adminId);
  expect(latest.body).toContain('key-auth');
  expect(latest.body).not.toContain(secretQuery);

  expect((await readTrace(firstId, secondDeveloperCookie)).statusCode).toBe(404);
  expect((await readTrace(secondId, developerCookie)).statusCode).toBe(404);
  const anonymous = await readTrace(firstId);
  expect(anonymous.statusCode).toBe(401);
  expect(anonymous.headers['content-type']).toContain('application/problem+json');
  expect(anonymous.body).not.toContain('key-auth');
}, 120_000);

it('027 AC3/6 and failure paths: permissions, replacement, invalid input, and an expired session', async () => {
  const developerForbidden = [
    ['GET', '/api/v1/admin/tracing'],
    ['PUT', '/api/v1/admin/tracing'],
    ['POST', '/api/v1/admin/tracing/selections'],
    ['POST', '/api/v1/admin/tracing/test'],
    ['GET', `/api/v1/admin/tracing/latest?apiId=${apiId}`],
    ['DELETE', `/api/v1/admin/tracing/selections/${uuidv7()}`],
  ] as const;
  for (const [method, url] of developerForbidden) {
    const response = await server.inject({
      method,
      url,
      headers: { cookie: developerCookie },
      payload: method === 'GET' || method === 'DELETE' ? undefined : {},
    });
    expect(response.statusCode, `${method} ${url} ${response.body}`).toBe(403);
    expect(response.headers['content-type']).toContain('application/problem+json');
  }

  const malformed = await readTrace('not-a-trace-id', developerCookie);
  expect(malformed.statusCode).toBe(400);
  expect(malformed.headers['content-type']).toContain('application/problem+json');
  const missingTarget = await server.inject({
    url: '/api/v1/try-it',
    headers: { cookie: developerCookie },
  });
  expect(missingTarget.statusCode).toBe(400);
  expect(missingTarget.headers['x-portal-trace-state']).toBe('off');
  expect(missingTarget.headers['content-type']).toContain('application/problem+json');

  const signedOut = await callTryIt();
  expect(signedOut.headers['x-portal-trace-state']).toBe('signed-out');
  expect(signedOut.headers['x-portal-trace-id']).toBeUndefined();

  const [selection] = await connection.db.select().from(tracingSelections);
  expect(selection?.id).toBeTruthy();
  const removed = await server.inject({
    method: 'DELETE',
    url: `/api/v1/admin/tracing/selections/${selection!.id}`,
    headers: { cookie: adminCookie },
  });
  expect(removed.statusCode, removed.body).toBe(204);
  const off = await callTryIt(developerCookie);
  expect(off.headers['x-portal-trace-state']).toBe('off');
  expect(off.headers['x-portal-trace-id']).toBeUndefined();
  expect(off.statusCode, off.body).not.toBe(401);
  const restored = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/tracing/selections',
    headers: { cookie: adminCookie },
    payload: { kind: 'api', targetId: apiId },
  });
  expect(restored.statusCode, restored.body).toBe(201);
  const coveredAgain = await callTryIt(developerCookie);
  expect(coveredAgain.headers['x-portal-trace-state']).toBe('traced');
  expect(String(coveredAgain.headers['x-portal-trace-id'])).toMatch(/^[0-9a-f]{32}$/);

  const first = await callTryIt(developerCookie);
  const firstId = String(first.headers['x-portal-trace-id']);
  const second = await callTryIt(developerCookie);
  const secondId = String(second.headers['x-portal-trace-id']);
  expect(secondId).not.toBe(firstId);
  const replaced = await readTrace(firstId, developerCookie);
  expect(replaced.statusCode).toBe(404);
  expect(replaced.headers['content-type']).toContain('application/problem+json');
  expect(replaced.body).not.toContain('key-auth');
  expect(replaced.body).not.toContain(secretBody);
  const rows = await connection.db
    .select()
    .from(tryItTraces)
    .where(eq(tryItTraces.userId, developerId));
  expect(rows.map((row) => row.traceId)).toEqual([secondId]);

  const [left, right] = await Promise.all([
    callTryIt(secondDeveloperCookie),
    callTryIt(secondDeveloperCookie),
  ]);
  const raced = [String(left.headers['x-portal-trace-id']), String(right.headers['x-portal-trace-id'])];
  expect(new Set(raced).size).toBe(2);
  const kept = await connection.db
    .select()
    .from(tryItTraces)
    .where(eq(tryItTraces.userId, secondDeveloperId));
  expect(kept).toHaveLength(1);
  expect(raced).toContain(kept[0]!.traceId);
  const dropped = raced.find((traceId) => traceId !== kept[0]!.traceId)!;
  expect((await readTrace(dropped, secondDeveloperCookie)).statusCode).toBe(404);

  await connection.db
    .update(session)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(session.userId, secondDeveloperId));
  const expired = await readTrace(kept[0]!.traceId, secondDeveloperCookie);
  expect(expired.statusCode).toBe(401);
  expect(expired.headers['content-type']).toContain('application/problem+json');
  const expiredAdmin = await server.inject({
    url: '/api/v1/admin/tracing',
    headers: { cookie: secondDeveloperCookie },
  });
  expect(expiredAdmin.statusCode).toBe(401);
}, 60_000);

it('027 AC9 and build notes: a refused gateway deletes a traced row, keeps an older row when tracing is off, and a timeout stays traced', async () => {
  const hanging = createServer((socket) => {
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', () => resolve()));
  const hangPort = (hanging.address() as AddressInfo).port;
  try {
    await pointGateway(`http://127.0.0.1:${hangPort}`);
    const timeout = await callTryIt(developerCookie);
    expect(timeout.statusCode, timeout.body).toBe(504);
    expect(timeout.headers['content-type']).toContain('application/problem+json');
    expect(timeout.headers['x-portal-trace-state']).toBe('traced');
    const timedId = String(timeout.headers['x-portal-trace-id']);
    const kept = await connection.db
      .select()
      .from(tryItTraces)
      .where(eq(tryItTraces.userId, developerId));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ traceId: timedId, spans: [] });
  } finally {
    hanging.close();
  }

  await pointGateway('http://127.0.0.1:9');
  const unavailable = await callTryIt(developerCookie);
  expect(unavailable.statusCode, unavailable.body).toBe(503);
  expect(unavailable.headers['content-type']).toContain('application/problem+json');
  expect(unavailable.headers['x-portal-trace-state']).toBe('unreachable');
  expect(unavailable.headers['x-portal-trace-id']).toBeUndefined();
  expect(
    await connection.db.select().from(tryItTraces).where(eq(tryItTraces.userId, developerId)),
  ).toEqual([]);

  // Tracing off still has to say the call never reached Kong. An older row stays.
  await connection.db.delete(tracingSelections);
  const olderId = 'c'.repeat(32);
  await connection.db.insert(tryItTraces).values({
    userId: developerId,
    traceId: olderId,
    apiId,
  });
  const offAndDown = await callTryIt(developerCookie);
  expect(offAndDown.statusCode, offAndDown.body).toBe(503);
  expect(offAndDown.headers['content-type']).toContain('application/problem+json');
  expect(offAndDown.json().type).toBe('/problems/gateway-unavailable');
  expect(offAndDown.json().detail).toContain("didn't respond");
  expect(offAndDown.headers['x-portal-trace-state']).toBe('unreachable');
  expect(offAndDown.headers['x-portal-trace-id']).toBeUndefined();
  const keptOlder = await connection.db
    .select()
    .from(tryItTraces)
    .where(eq(tryItTraces.userId, developerId));
  expect(keptOlder.map((row) => row.traceId)).toEqual([olderId]);

  const signedOutDown = await callTryIt();
  expect(signedOutDown.statusCode, signedOutDown.body).toBe(503);
  expect(signedOutDown.headers['x-portal-trace-state']).toBe('signed-out');
  expect(signedOutDown.headers['x-portal-trace-id']).toBeUndefined();
  expect(
    (
      await connection.db
        .select()
        .from(tryItTraces)
        .where(eq(tryItTraces.userId, developerId))
    ).map((row) => row.traceId),
  ).toEqual([olderId]);
}, 45_000);
