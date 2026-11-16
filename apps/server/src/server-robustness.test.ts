// SPDX-License-Identifier: Apache-2.0
import http from 'node:http';
import { request as forwardRequest } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import type { Logger } from 'drizzle-orm/logger';
import { uuidv7 } from 'uuidv7';
import { KongAdapter } from '@portal/adapter-kong';
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
  plans,
  planApis,
  apps,
  credentials,
  gatewayOperations,
  session as authSession,
} from '@portal/db';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createAuth, type Auth } from './auth.js';
import { gatewayConnection } from './gateway-connection.js';
import { reconcile } from './reconcile.js';
import { seedSample } from './seed.js';

type Mode =
  | 'pass'
  | 'hold'
  | 'fail'
  | 'stall-first'
  | 'fail-consumer-delete'
  | 'hold-acl';

const sqlLog: string[] = [];
let captureSql = false;
const logger: Logger = {
  logQuery(query) {
    if (captureSql) sqlLog.push(query);
  },
};
const logs: string[] = [];
const adminId = uuidv7();
const developerId = uuidv7();
const teamId = uuidv7();
const gatewayId = uuidv7();
const instanceId = uuidv7();
const looseApiId = uuidv7();
const productApiId = uuidv7();
const productId = uuidv7();
const planId = uuidv7();
const approvalPlanId = uuidv7();
let session: {
  id: string;
  role: string;
  email: string;
  name: string;
  emailVerified: boolean;
} | null = null;

let network: StartedNetwork;
let postgresContainer: StartedPostgreSqlContainer;
let kong: StartedTestContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
let kongAdmin: string;
let proxyUrl: string;
let proxyAdminUrl = '';
let runtime: ReturnType<typeof gatewayConnection>;
let proxy: ReturnType<typeof startProxy>;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function pathOf(url: string | undefined) {
  return (url ?? '').split('?')[0] ?? '';
}
function isConsumerDelete(method: string, path: string) {
  return method === 'DELETE' && /^\/consumers\/portal-app-[^/]+$/.test(path);
}
function isAclPut(method: string, path: string) {
  return method === 'PUT' && /\/consumers\/[^/]+\/acls\//.test(path);
}

function startProxy(target: { host: string; port: number }) {
  let mode: Mode = 'pass';
  let heldCount = 0;
  const queued: (() => void)[] = [];
  const waiters: {
    count: number;
    timer: NodeJS.Timeout;
    resolve: () => void;
  }[] = [];
  const signal = () => {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (!waiter || heldCount < waiter.count) continue;
      clearTimeout(waiter.timer);
      waiters.splice(index, 1);
      waiter.resolve();
    }
  };
  const dispatch = (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => {
    const path = pathOf(req.url);
    const method = req.method ?? 'GET';
    const fail =
      mode === 'fail' ||
      (mode === 'fail-consumer-delete' && isConsumerDelete(method, path));
    if (fail) {
      req.resume();
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"message":"injected gateway failure"}');
      return;
    }
    if (mode === 'stall-first') {
      mode = 'pass';
      req.resume();
      return;
    }
    const upstream = forwardRequest(
      {
        host: target.host,
        port: target.port,
        method,
        path: req.url,
        headers: { ...req.headers, host: `${target.host}:${target.port}` },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  };
  const server = http.createServer((req, res) => {
    const path = pathOf(req.url);
    const method = req.method ?? 'GET';
    const hold =
      mode === 'hold' || (mode === 'hold-acl' && isAclPut(method, path));
    if (hold) {
      heldCount += 1;
      queued.push(() => dispatch(req, res));
      signal();
      return;
    }
    dispatch(req, res);
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  return {
    listen: () =>
      new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          resolve(typeof address === 'object' && address ? address.port : 0);
        });
      }),
    setMode(next: Mode) {
      mode = next;
      if (next === 'pass') heldCount = 0;
    },
    waitForHold(count = 1) {
      if (heldCount >= count) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`proxy held ${heldCount}, wanted ${count}`)),
          15_000,
        );
        waiters.push({ count, timer, resolve });
      });
    },
    release() {
      const runs = queued.splice(0);
      for (const run of runs) run();
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function publishService(id: string) {
  const adapter = new KongAdapter({ adminUrl: kongAdmin, instanceId });
  await adapter.request(`/services/${id}`, 'PUT', {
    id,
    name: id,
    url: 'http://unused.invalid',
  });
  await adapter.request(`/services/${id}/routes`, 'POST', { paths: [`/${id}`] });
  await adapter.request(`/services/${id}/plugins`, 'POST', { name: 'key-auth' });
  await adapter.request(`/services/${id}/plugins`, 'POST', {
    name: 'request-termination',
    config: { status_code: 200, body: 'ok' },
  });
  await connection.db.insert(apis).values({
    id,
    slug: `api-${id}`,
    gatewayId,
    gatewayServiceId: id,
    gatewayServiceName: id,
    routePath: `/${id}`,
  });
  await connection.db.insert(apiVersions).values({
    id,
    apiId: id,
    title: `API ${id}`,
    version: '1.0.0',
    document: {
      openapi: '3.0.3',
      info: { title: `API ${id}`, version: '1.0.0' },
      paths: {},
    },
  });
  await connection.db
    .update(apis)
    .set({ latestVersionId: id })
    .where(eq(apis.id, id));
}

async function openTransactions() {
  const rows = await connection.client<
    { state: string; xact_start: Date | null; query: string }[]
  >`
    select state, xact_start, left(query, 160) as query
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and backend_type = 'client backend'
  `;
  const cutoff = Date.now() - 1000;
  return rows.filter(
    (row) =>
      (row.state ?? '').includes('idle in transaction') ||
      (row.xact_start !== null && new Date(row.xact_start).getTime() < cutoff),
  );
}

async function duringKong<T>(
  mode: 'hold' | 'hold-acl',
  work: () => Promise<T>,
  during: () => Promise<void>,
) {
  proxy.setMode(mode);
  const pending = work();
  try {
    await proxy.waitForHold();
    if (mode === 'hold') await delay(1200);
    await during();
  } finally {
    proxy.release();
    proxy.setMode('pass');
  }
  return pending;
}

function compensationLogs() {
  return logs.flatMap((chunk) =>
    chunk
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as {
            msg?: string;
            err?: { message?: string; type?: string; cause?: unknown };
            appId?: string;
            credentialId?: string;
            gatewayId?: string;
            gatewayObject?: { consumer?: string; credential?: string };
          };
          return parsed.msg ===
            'Gateway compensation failed; reconcile will retry'
            ? [parsed]
            : [];
        } catch {
          return [];
        }
      }),
  );
}

async function ownedAppIds() {
  const adapter = new KongAdapter({ adminUrl: kongAdmin, instanceId });
  return (await adapter.listOwnedConsumers()).map((consumer) => consumer.appId);
}

beforeAll(async () => {
  network = await new Network().start();
  postgresContainer = await new PostgreSqlContainer('postgres:17-alpine')
    .withNetwork(network)
    .withNetworkAliases('postgres')
    .start();
  const url = postgresContainer.getConnectionUri();
  await migrate(url);
  connection = connect(url, { logger });
  await connection.client.unsafe('CREATE DATABASE kong');
  const env = {
    KONG_DATABASE: 'postgres',
    KONG_PG_HOST: 'postgres',
    KONG_PG_USER: postgresContainer.getUsername(),
    KONG_PG_PASSWORD: postgresContainer.getPassword(),
    KONG_PG_DATABASE: 'kong',
    KONG_ADMIN_LISTEN: '0.0.0.0:8001',
    KONG_WORKER_CONSISTENCY: 'strict',
    KONG_NGINX_WORKER_PROCESSES: '1',
  };
  const migration = await new GenericContainer('kong:3.9')
    .withNetwork(network)
    .withEnvironment(env)
    .withCommand(['kong', 'migrations', 'bootstrap'])
    .withWaitStrategy(Wait.forOneShotStartup())
    .start();
  await migration.stop();
  kong = await new GenericContainer('kong:3.9')
    .withNetwork(network)
    .withEnvironment(env)
    .withExposedPorts(8000, 8001)
    .withWaitStrategy(Wait.forHttp('/status', 8001))
    .start();
  kongAdmin = `http://${kong.getHost()}:${kong.getMappedPort(8001)}`;
  proxyUrl = `http://${kong.getHost()}:${kong.getMappedPort(8000)}`;
  proxy = startProxy({
    host: kong.getHost(),
    port: kong.getMappedPort(8001),
  });
  const proxyPort = await proxy.listen();
  proxyAdminUrl = `http://127.0.0.1:${proxyPort}`;
  await connection.db.insert(user).values([
    {
      id: adminId,
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      emailVerified: true,
    },
    {
      id: developerId,
      name: 'Developer',
      email: 'dev@example.com',
      role: 'developer',
      emailVerified: true,
    },
  ]);
  await connection.db.insert(teams).values({ id: teamId, name: 'Team' });
  await connection.db.insert(teamMembers).values([
    { teamId, userId: adminId, role: 'admin' },
    { teamId, userId: developerId, role: 'member' },
  ]);
  await connection.db.insert(instanceSettings).values({ id: 1, instanceId });
  await connection.db.insert(gateways).values({
    id: gatewayId,
    name: 'Kong',
    kind: 'kong',
    adminUrl: proxyAdminUrl,
    proxyPublicUrl: proxyUrl,
    proxyInternalUrl: proxyUrl,
  });
  await publishService(looseApiId);
  await publishService(productApiId);
  await connection.db.insert(products).values({
    id: productId,
    slug: 'robust',
    name: 'Robust',
    description: 'Robustness fixture',
    visibility: 'open',
  });
  await connection.db.insert(productApis).values({ productId, apiId: productApiId });
  await connection.db.insert(plans).values([
    {
      id: planId,
      productId,
      name: 'Free',
      rateLimit: 10,
      rateLimitUnit: 'second',
      monthlyQuota: 100,
    },
    {
      id: approvalPlanId,
      productId,
      name: 'Reviewed',
      rateLimit: 10,
      rateLimitUnit: 'second',
      monthlyQuota: 100,
      requiresApproval: true,
    },
  ]);
  await connection.db.insert(planApis).values([
    { planId, productId, apiId: productApiId },
    { planId: approvalPlanId, productId, apiId: productApiId },
  ]);
  session = {
    id: adminId,
    role: 'admin',
    email: 'admin@example.com',
    name: 'Admin',
    emailVerified: true,
  };
  const auth = {
    api: { getSession: async () => (session ? { user: session } : null) },
  } as unknown as Auth;
  ({ app: server } = await createApp({
    db: connection.db,
    config: loadConfig({ DATABASE_URL: url, NODE_ENV: 'test' }),
    auth,
    enqueueReconcile: async () => {},
    enqueueMail: async () => {},
    enqueueRevocation: async () => {},
    logger: {
      level: 'info',
      stream: { write: (chunk: string) => logs.push(String(chunk)) },
    },
  }));
  runtime = gatewayConnection(
    connection.db,
    loadConfig({ DATABASE_URL: url, NODE_ENV: 'test' }),
    instanceId,
    { error() {} },
  );
}, 300_000);

afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await proxy?.close();
  await kong?.stop();
  await postgresContainer?.stop();
  await network?.stop();
});

beforeEach(() => {
  proxy.release();
  proxy.setMode('pass');
  logs.length = 0;
  captureSql = false;
  sqlLog.length = 0;
  session = {
    id: adminId,
    role: 'admin',
    email: 'admin@example.com',
    name: 'Admin',
    emailVerified: true,
  };
});

async function createLooseApp(name = `app-${uuidv7()}`) {
  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name, teamId, apiIds: [looseApiId] },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json() as {
    app: { id: string; name: string };
    credential: { id: string; key: string };
  };
}

it('rejects invalid input, a missing session, a developer calling an admin route, a duplicate name, and an unreachable gateway', async () => {
  const invalid = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name: 'Mixed', apiIds: [looseApiId], planId },
  });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.headers['content-type']).toContain('application/problem+json');
  expect(invalid.json().type).toBe('/problems/validation');

  session = null;
  const anonymous = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name: 'Anonymous', apiIds: [looseApiId] },
  });
  expect(anonymous.statusCode).toBe(401);
  expect(anonymous.json().type).toBe('/problems/unauthenticated');

  session = {
    id: developerId,
    role: 'developer',
    email: 'dev@example.com',
    name: 'Developer',
    emailVerified: true,
  };
  const forbidden = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/subscriptions',
    payload: { planId, teamId, name: 'Not allowed' },
  });
  expect(forbidden.statusCode).toBe(403);
  expect(forbidden.json().type).toBe('/problems/forbidden');

  session = {
    id: adminId,
    role: 'admin',
    email: 'admin@example.com',
    name: 'Admin',
    emailVerified: true,
  };
  const name = `dup-${uuidv7()}`;
  await createLooseApp(name);
  const before = await ownedAppIds();
  const duplicate = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name, teamId, apiIds: [looseApiId] },
  });
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json().type).toBe('/problems/app-name-taken');
  expect(sorted(await ownedAppIds())).toEqual(sorted(before));
  const rows = await connection.db
    .select()
    .from(apps)
    .where(eq(apps.name, name));
  expect(rows).toHaveLength(1);

  const closed = await new Promise<number>((resolve, reject) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
  const down = `down-${uuidv7()}`;
  const ownedBeforeOutage = await ownedAppIds();
  await connection.db
    .update(gateways)
    .set({ adminUrl: `http://127.0.0.1:${closed}` })
    .where(eq(gateways.id, gatewayId));
  try {
    const unreachable = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      payload: { name: down, teamId, apiIds: [looseApiId] },
    });
    expect(unreachable.statusCode).toBe(503);
    expect(unreachable.headers['content-type']).toContain('application/problem+json');
    expect(unreachable.json().type).toBe('/problems/gateway-unavailable');
    expect(
      await connection.db.select().from(apps).where(eq(apps.name, down)),
    ).toEqual([]);
    expect(sorted(await ownedAppIds())).toEqual(sorted(ownedBeforeOutage));
  } finally {
    await connection.db
      .update(gateways)
      .set({ adminUrl: proxyAdminUrl })
      .where(eq(gateways.id, gatewayId));
  }
});

it('rejects an expired session on app, key, subscription and approval routes with no Kong writes', async () => {
  const config = loadConfig({
    DATABASE_URL: postgresContainer.getConnectionUri(),
    NODE_ENV: 'test',
  });
  const auth = createAuth(connection.db, config, async () => {});
  const { app: authed } = await createApp({
    db: connection.db,
    config,
    auth,
    enqueueReconcile: async () => {},
    enqueueMail: async () => {},
    enqueueRevocation: async () => {},
  });
  try {
    const email = `expired-${uuidv7()}@example.com`;
    const signup = await authed.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Expired', email, password: 'test-password-123' },
    });
    expect(signup.statusCode, signup.body).toBe(200);
    const cookie = signup.headers['set-cookie']?.toString().split(';')[0] ?? '';
    expect(cookie).toContain('session_token');
    const me = await authed.inject({ url: '/api/v1/me', headers: { cookie } });
    expect(me.statusCode, me.body).toBe(200);
    await connection.db
      .update(authSession)
      .set({ expiresAt: new Date(0) })
      .where(eq(authSession.userId, signup.json().user.id));
    const ownedBefore = await ownedAppIds();
    const appCount = (await connection.db.select({ id: apps.id }).from(apps))
      .length;
    const name = `expired-app-${uuidv7()}`;
    const created = await authed.inject({
      method: 'POST',
      url: '/api/v1/apps',
      headers: { cookie },
      payload: { name, teamId, apiIds: [looseApiId] },
    });
    expect(created.statusCode).toBe(401);
    expect(created.headers['content-type']).toContain('application/problem+json');
    expect(created.json().type).toBe('/problems/unauthenticated');
    expect(await appsNamed(name)).toEqual([]);

    const existing = await createLooseApp();
    const keysBefore = await activeKeys(existing.app.id);
    const issued = await authed.inject({
      method: 'POST',
      url: `/api/v1/apps/${existing.app.id}/credentials`,
      headers: { cookie },
    });
    expect(issued.statusCode).toBe(401);
    expect(issued.json().type).toBe('/problems/unauthenticated');
    const revoked = await authed.inject({
      method: 'DELETE',
      url: `/api/v1/apps/${existing.app.id}/credentials/${existing.credential.id}`,
      headers: { cookie },
    });
    expect(revoked.statusCode).toBe(401);
    expect(await activeKeys(existing.app.id)).toEqual(keysBefore);

    const subscribed = await authed.inject({
      method: 'POST',
      url: '/api/v1/admin/subscriptions',
      headers: { cookie },
      payload: { planId, teamId, name: `expired-sub-${uuidv7()}` },
    });
    expect(subscribed.statusCode).toBe(401);
    expect(subscribed.json().type).toBe('/problems/unauthenticated');
    const approved = await authed.inject({
      method: 'POST',
      url: `/api/v1/admin/access-requests/${uuidv7()}/approve`,
      headers: { cookie },
      payload: {},
    });
    expect(approved.statusCode).toBe(401);
    expect(approved.json().type).toBe('/problems/unauthenticated');
    expect(sorted(await ownedAppIds())).toEqual(
      sorted([...ownedBefore, existing.app.id]),
    );
    expect(
      await connection.db.select({ id: apps.id }).from(apps),
    ).toHaveLength(appCount + 1);
  } finally {
    await authed.close();
  }
});

it('returns problem+json and compensates when the gateway is disabled during app create or key issue', async () => {
  const name = `disabled-${uuidv7()}`;
  const ownedBefore = await ownedAppIds();
  const opsBefore = (
    await connection.db.select({ id: gatewayOperations.id }).from(gatewayOperations)
  ).length;
  let created: Awaited<ReturnType<typeof server.inject>> | undefined;
  try {
    created = await duringKong(
      'hold',
      () =>
        server.inject({
          method: 'POST',
          url: '/api/v1/apps',
          payload: { name, teamId, apiIds: [looseApiId] },
        }),
      async () => {
        await connection.db
          .update(gateways)
          .set({ enabled: false })
          .where(eq(gateways.id, gatewayId));
      },
    );
  } finally {
    await connection.db
      .update(gateways)
      .set({ enabled: true })
      .where(eq(gateways.id, gatewayId));
  }
  expect(created?.statusCode, created?.body.slice(0, 400)).toBe(409);
  expect(created?.headers['content-type']).toContain('application/problem+json');
  expect(created?.json().type).toBe('/problems/gateway-disabled');
  expect(await appsNamed(name)).toEqual([]);
  expect(sorted(await ownedAppIds())).toEqual(sorted(ownedBefore));
  expect(
    await connection.db.select({ id: gatewayOperations.id }).from(gatewayOperations),
  ).toHaveLength(opsBefore);

  const existing = await createLooseApp();
  const keysBefore = await activeKeys(existing.app.id);
  const adapter = new KongAdapter({ adminUrl: kongAdmin, instanceId });
  const beforeIds = (await adapter.listOwnedConsumers())
    .find((row) => row.appId === existing.app.id)
    ?.credentials.map((key) => key.id)
    .sort();
  let issued: Awaited<ReturnType<typeof server.inject>> | undefined;
  try {
    issued = await duringKong(
      'hold',
      () =>
        server.inject({
          method: 'POST',
          url: `/api/v1/apps/${existing.app.id}/credentials`,
        }),
      async () => {
        await connection.db
          .update(gateways)
          .set({ enabled: false })
          .where(eq(gateways.id, gatewayId));
      },
    );
  } finally {
    await connection.db
      .update(gateways)
      .set({ enabled: true })
      .where(eq(gateways.id, gatewayId));
  }
  expect(issued?.statusCode, issued?.body.slice(0, 400)).toBe(409);
  expect(issued?.json().type).toBe('/problems/gateway-disabled');
  expect(await activeKeys(existing.app.id)).toEqual(keysBefore);
  expect(
    (await adapter.listOwnedConsumers())
      .find((row) => row.appId === existing.app.id)
      ?.credentials.map((key) => key.id)
      .sort(),
  ).toEqual(beforeIds);
  expect(
    await connection.db.select({ id: gatewayOperations.id }).from(gatewayOperations),
  ).toHaveLength(opsBefore);
});

function sorted(ids: string[]) {
  return [...ids].sort();
}
async function appsNamed(name: string) {
  return connection.db.select({ id: apps.id }).from(apps).where(eq(apps.name, name));
}
async function activeKeys(appId: string) {
  const rows = await connection.db
    .select({ id: credentials.id, status: credentials.status })
    .from(credentials)
    .where(eq(credentials.appId, appId));
  return rows.filter((row) => row.status === 'active');
}
function documentQueries() {
  return sqlLog.filter((query) => query.toLowerCase().includes('document'));
}
async function pathText(apiId: string) {
  const [row] = await connection.client<{ paths: string }[]>`
    select (document->'paths')::text as paths
    from api_versions
    where api_id = ${apiId}
    order by published_at desc
    limit 1
  `;
  return row?.paths ?? '';
}
function expectPathOrder(text: string, paths: string[]) {
  let previous = -1;
  for (const path of paths) {
    const index = text.indexOf(`"${path}"`);
    expect(index, text).toBeGreaterThan(previous);
    previous = index;
  }
}
const samplePaths = ['/get', '/post', '/status/{code}', '/uuid', '/headers'];
const orderedDocument = {
  openapi: '3.0.3',
  info: { title: 'Ordered API', version: '1.0.0' },
  paths: {
    '/m': { get: { responses: { '200': { description: 'm' } } } },
    '/a': { get: { responses: { '200': { description: 'a' } } } },
    '/z': { get: { responses: { '200': { description: 'z' } } } },
  },
};

it('keeps database transactions closed while Kong is slow for all four create paths', async () => {
  const name = `slow-${uuidv7()}`;
  const created = await duringKong(
    'hold',
    () =>
      server.inject({
        method: 'POST',
        url: '/api/v1/apps',
        payload: { name, teamId, apiIds: [looseApiId] },
      }),
    async () => {
      expect(await openTransactions()).toEqual([]);
    },
  );
  expect(created.statusCode, created.body.slice(0, 400)).toBe(201);
  const app = created.json() as { app: { id: string }; credential: { id: string } };
  expect(await appsNamed(name)).toEqual([{ id: app.app.id }]);

  const issued = await duringKong(
    'hold',
    () =>
      server.inject({
        method: 'POST',
        url: `/api/v1/apps/${app.app.id}/credentials`,
      }),
    async () => {
      expect(await openTransactions()).toEqual([]);
    },
  );
  expect(issued.statusCode, issued.body.slice(0, 400)).toBe(201);
  expect(await activeKeys(app.app.id)).toHaveLength(2);

  const subscriptionName = `sub-${uuidv7()}`;
  const subscription = await duringKong(
    'hold',
    () =>
      server.inject({
        method: 'POST',
        url: '/api/v1/admin/subscriptions',
        payload: { planId, teamId, name: subscriptionName },
      }),
    async () => {
      expect(await openTransactions()).toEqual([]);
    },
  );
  expect(subscription.statusCode, subscription.body.slice(0, 400)).toBe(201);
  expect(subscription.json()).toMatchObject({ id: expect.any(String), name: subscriptionName });

  const requestName = `ask-${uuidv7()}`;
  const requested = await server.inject({
    method: 'POST',
    url: '/api/v1/access-requests',
    payload: {
      planId: approvalPlanId,
      teamId,
      name: requestName,
      reason: 'Need this API for the robustness test',
    },
  });
  expect(requested.statusCode, requested.body.slice(0, 400)).toBe(201);
  const approved = await duringKong(
    'hold',
    () =>
      server.inject({
        method: 'POST',
        url: `/api/v1/admin/access-requests/${requested.json().id}/approve`,
        payload: {},
      }),
    async () => {
      expect(await openTransactions()).toEqual([]);
    },
  );
  expect(approved.statusCode, approved.body.slice(0, 500)).toBe(200);
  expect(approved.json()).toMatchObject({
    status: 'approved',
    app: { id: expect.any(String) },
  });
  expect(await appsNamed(requestName)).toHaveLength(1);
});

it('returns problem+json and leaves no app, key, or Kong consumer when Kong fails or times out', async () => {
  const before = await ownedAppIds();
  proxy.setMode('fail');
  try {
    const failedApp = `fail-app-${uuidv7()}`;
    const appResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      payload: { name: failedApp, teamId, apiIds: [looseApiId] },
    });
    expect(appResponse.statusCode).toBe(503);
    expect(appResponse.headers['content-type']).toContain('application/problem+json');
    expect(appResponse.json().type).toBe('/problems/gateway-unavailable');
    expect(await appsNamed(failedApp)).toEqual([]);
    expect(sorted(await ownedAppIds())).toEqual(sorted(before));

    proxy.setMode('pass');
    const existing = await createLooseApp();
    const keysBefore = await activeKeys(existing.app.id);
    const ownedWithApp = await ownedAppIds();
    proxy.setMode('fail');
    const keyResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/apps/${existing.app.id}/credentials`,
    });
    expect(keyResponse.statusCode).toBe(503);
    expect(keyResponse.headers['content-type']).toContain('application/problem+json');
    expect(keyResponse.json().type).toBe('/problems/gateway-unavailable');
    expect(await activeKeys(existing.app.id)).toEqual(keysBefore);
    expect(sorted(await ownedAppIds())).toEqual(sorted(ownedWithApp));
  } finally {
    proxy.setMode('pass');
  }

  const owned = await ownedAppIds();
  proxy.setMode('stall-first');
  try {
    const stalled = `stall-${uuidv7()}`;
    const timedOut = await server.inject({
      method: 'POST',
      url: '/api/v1/apps',
      payload: { name: stalled, teamId, apiIds: [looseApiId] },
    });
    expect(timedOut.statusCode).toBe(503);
    expect(timedOut.json().type).toBe('/problems/gateway-unavailable');
    expect(await appsNamed(stalled)).toEqual([]);
    expect(sorted(await ownedAppIds())).toEqual(sorted(owned));
  } finally {
    proxy.setMode('pass');
  }
});

it('logs one redacted compensation error when undoing a Kong consumer fails', async () => {
  const name = `race-${uuidv7()}`;
  proxy.setMode('hold');
  const first = server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name, teamId, apiIds: [looseApiId] },
  });
  const second = server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name, teamId, apiIds: [looseApiId] },
  });
  try {
    await proxy.waitForHold(2);
    proxy.setMode('fail-consumer-delete');
    proxy.release();
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    const conflict = responses.find((response) => response.statusCode === 409);
    expect(conflict?.json().type).toBe('/problems/app-name-taken');
    expect(await appsNamed(name)).toHaveLength(1);
    const entries = compensationLogs();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry?.err?.message).toBe('The API gateway is unavailable');
    expect(entry?.err?.cause).toMatchObject({ message: 'Kong returned 500' });
    expect(entry?.appId).toEqual(expect.any(String));
    expect(entry?.credentialId).toEqual(expect.any(String));
    expect(entry?.gatewayId).toBe(gatewayId);
    expect(entry?.gatewayObject?.consumer).toBe(entry?.appId);
    expect(entry?.gatewayObject?.credential).toBe(entry?.credentialId);
    expect(logs.join('\n')).not.toMatch(/pk_[A-Za-z0-9_-]{8,}/);
  } finally {
    proxy.release();
    proxy.setMode('pass');
  }
});

it('does not delete an in-flight consumer when reconcile runs during create', async () => {
  const before = new Set(await ownedAppIds());
  proxy.setMode('hold-acl');
  const pending = server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name: `flight-${uuidv7()}`, teamId, apiIds: [looseApiId] },
  });
  try {
    await proxy.waitForHold();
    const arrived = (await ownedAppIds()).filter((id) => !before.has(id));
    expect(arrived).toHaveLength(1);
    await reconcile(connection.db, runtime, { warn() {} });
    expect(await ownedAppIds()).toContain(arrived[0]);
  } finally {
    proxy.release();
    proxy.setMode('pass');
  }
  const response = await pending;
  expect(response.statusCode, response.body.slice(0, 400)).toBe(201);
  const appId = (response.json() as { app: { id: string } }).app.id;
  expect(await ownedAppIds()).toContain(appId);
  const [op] = await connection.db
    .select({ id: gatewayOperations.id })
    .from(gatewayOperations)
    .where(eq(gatewayOperations.appId, appId));
  expect(op).toBeUndefined();
});

it('finishes a revoked key on the next reconcile when the database update fails', async () => {
  const created = await createLooseApp();
  const credentialId = created.credential.id;
  if (!/^[0-9a-f-]{36}$/i.test(credentialId))
    throw new Error('credential id is not a uuid');
  await connection.client.unsafe(`
    create or replace function robust_block_revoke() returns trigger
    language plpgsql as $fn$
    begin
      if new.id = '${credentialId}'::uuid and new.status = 'revoked' then
        raise exception 'injected commit failure';
      end if;
      return new;
    end
    $fn$
  `);
  await connection.client.unsafe(
    'create trigger robust_block_revoke before update on credentials for each row execute function robust_block_revoke()',
  );
  try {
    const revoked = await server.inject({
      method: 'DELETE',
      url: `/api/v1/apps/${created.app.id}/credentials/${credentialId}`,
    });
    expect(revoked.statusCode).toBeGreaterThanOrEqual(500);
    expect(await activeKeys(created.app.id)).toEqual([
      { id: credentialId, status: 'active' },
    ]);
    const pending = await connection.db
      .select({ kind: gatewayOperations.kind })
      .from(gatewayOperations)
      .where(eq(gatewayOperations.credentialId, credentialId));
    expect(pending).toEqual([{ kind: 'revoke-credential' }]);
    const adapter = new KongAdapter({ adminUrl: kongAdmin, instanceId });
    const owned = await adapter.listOwnedConsumers();
    const consumer = owned.find((row) => row.appId === created.app.id);
    expect(consumer?.credentials.some((key) => key.id === credentialId)).toBe(false);
  } finally {
    await connection.client.unsafe(
      'drop trigger if exists robust_block_revoke on credentials',
    );
    await connection.client.unsafe('drop function if exists robust_block_revoke()');
  }
  const first = await reconcile(connection.db, runtime, { warn() {} });
  expect(await activeKeys(created.app.id)).toEqual([]);
  const [row] = await connection.db
    .select({ status: credentials.status })
    .from(credentials)
    .where(eq(credentials.id, credentialId));
  expect(row?.status).toBe('revoked');
  expect(
    await connection.db
      .select({ id: gatewayOperations.id })
      .from(gatewayOperations)
      .where(eq(gatewayOperations.credentialId, credentialId)),
  ).toEqual([]);
  expect(first.drift.credentialIds).not.toContain(credentialId);
  const second = await reconcile(connection.db, runtime, { warn() {} });
  expect(second.drift.credentialIds).not.toContain(credentialId);
});

it('skips seeding an admin-published sample and refreshes a seed-created one', async () => {
  const sampleId = uuidv7();
  const versionId = uuidv7();
  const title = 'Admin sample that must survive';
  const document = {
    openapi: '3.0.3',
    info: { title, version: '9.9.9' },
    paths: {
      '/kept': { get: { responses: { '200': { description: 'kept' } } } },
    },
  };
  await connection.db.insert(apis).values({
    id: sampleId,
    slug: 'sample',
    gatewayId,
    gatewayServiceId: 'admin-sample',
    gatewayServiceName: 'admin-sample',
    routePath: '/admin-sample',
    seeded: false,
    createdBy: adminId,
  });
  await connection.db.insert(apiVersions).values({
    id: versionId,
    apiId: sampleId,
    title,
    version: '9.9.9',
    document,
  });
  await connection.db
    .update(apis)
    .set({ latestVersionId: versionId })
    .where(eq(apis.id, sampleId));
  const adapter = new KongAdapter({ adminUrl: kongAdmin, instanceId });
  expect(await adapter.getService('portal-sample')).toBeNull();
  const messages: string[] = [];
  await seedSample(connection.db, adapter, gatewayId, instanceId, {
    info(message) {
      messages.push(message);
    },
  });
  expect(messages).toContain(
    'Sample seed skipped: slug "sample" is taken by an admin-published API',
  );
  expect(await adapter.getService('portal-sample')).toBeNull();
  const [stored] = await connection.db
    .select({ title: apiVersions.title, document: apiVersions.document })
    .from(apiVersions)
    .where(eq(apiVersions.id, versionId));
  expect(stored).toEqual({ title, document });
  expect(
    await connection.db
      .select({ id: apiVersions.id })
      .from(apiVersions)
      .where(eq(apiVersions.apiId, sampleId)),
  ).toHaveLength(1);

  await connection.db
    .update(apis)
    .set({ latestVersionId: null })
    .where(eq(apis.id, sampleId));
  await connection.db.delete(apiVersions).where(eq(apiVersions.apiId, sampleId));
  await connection.db.delete(apis).where(eq(apis.id, sampleId));
  await seedSample(connection.db, adapter, gatewayId, instanceId, {
    info(message) {
      messages.push(message);
    },
  });
  const [seeded] = await connection.db
    .select({ id: apis.id, seeded: apis.seeded })
    .from(apis)
    .where(eq(apis.slug, 'sample'));
  expect(seeded?.seeded).toBe(true);
  expectPathOrder(await pathText(seeded!.id), samplePaths);
  await connection.db
    .update(apiVersions)
    .set({
      document: {
        openapi: '3.0.3',
        info: { title: 'Changed', version: '1.0.0' },
        paths: {
          '/zzz': { get: { responses: { '200': { description: 'moved' } } } },
        },
      },
    })
    .where(eq(apiVersions.apiId, seeded!.id));
  await seedSample(connection.db, adapter, gatewayId, instanceId);
  expectPathOrder(await pathText(seeded!.id), samplePaths);
  expect(await pathText(seeded!.id)).not.toContain('"/zzz"');
});

it('stores authored path order on import and serves that document through spec and try-it', async () => {
  const serviceId = uuidv7();
  const adapter = new KongAdapter({ adminUrl: kongAdmin, instanceId });
  await adapter.request(`/services/${serviceId}`, 'PUT', {
    id: serviceId,
    name: serviceId,
    url: 'http://unused.invalid',
  });
  await adapter.request(`/services/${serviceId}/routes`, 'POST', {
    paths: ['/ordered'],
  });
  const imported = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/apis',
    payload: {
      slug: 'ordered',
      routePath: '/ordered',
      gatewayServiceId: serviceId,
      spec: { content: JSON.stringify(orderedDocument) },
    },
  });
  expect(imported.statusCode, imported.body.slice(0, 600)).toBe(201);
  const [api] = await connection.db
    .select({ id: apis.id })
    .from(apis)
    .where(eq(apis.slug, 'ordered'));
  expectPathOrder(await pathText(api!.id), ['/m', '/a', '/z']);
  const reference = await server.inject({ url: '/api/v1/apis/ordered/openapi.json' });
  expect(reference.statusCode).toBe(200);
  expect(Object.keys(reference.json().paths)).toEqual(['/m', '/a', '/z']);
  const spec = await server.inject({ url: '/api/v1/apis/ordered/spec' });
  expect(spec.statusCode).toBe(200);
  expect(JSON.parse(spec.body).openapi).toBe('3.0.3');

  const upstream = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, path: request.url }));
  });
  const origin = await new Promise<string>((resolve) => {
    upstream.listen(0, '127.0.0.1', () => {
      const address = upstream.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
  await connection.db
    .update(gateways)
    .set({ proxyPublicUrl: origin, proxyInternalUrl: origin })
    .where(eq(gateways.id, gatewayId));
  try {
    const tried = await server.inject({
      url: `/api/v1/try-it?scalar_url=${encodeURIComponent(`${origin}/ordered/m`)}`,
    });
    expect(tried.statusCode, tried.body.slice(0, 300)).toBe(200);
    expect(tried.json()).toMatchObject({ ok: true, path: '/ordered/m' });
  } finally {
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
    await connection.db
      .update(gateways)
      .set({ proxyPublicUrl: proxyUrl, proxyInternalUrl: proxyUrl })
      .where(eq(gateways.id, gatewayId));
  }
});

it('reads no full document for the catalog list or slug page, and one for the reference', async () => {
  const description = 'x'.repeat(1_000_000);
  const firstSlug = 'bulk-0';
  for (let index = 0; index < 20; index += 1) {
    const id = uuidv7();
    const slug = `bulk-${index}`;
    const title = `Bulk ${index}`;
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
      title,
      version: '1.0.0',
      description: 'short summary',
      document: {
        openapi: '3.0.3',
        info: { title, version: '1.0.0', description },
        paths: {},
      },
    });
    await connection.db
      .update(apis)
      .set({ latestVersionId: id })
      .where(eq(apis.id, id));
  }
  sqlLog.length = 0;
  captureSql = true;
  try {
    const list = await server.inject({ url: '/api/v1/apis' });
    expect(list.statusCode).toBe(200);
    expect(documentQueries()).toEqual([]);
    const item = (
      list.json() as { items: { slug: string; document?: unknown }[] }
    ).items.find((row) => row.slug === firstSlug);
    expect(item).toBeTruthy();
    expect(item).not.toHaveProperty('document');
    expect(Object.keys(item!).sort()).toEqual([
      'description',
      'gatewayBaseUrl',
      'id',
      'products',
      'publishedAt',
      'slug',
      'title',
      'version',
    ]);
    expect(item).toMatchObject({
      slug: firstSlug,
      title: 'Bulk 0',
      version: '1.0.0',
      description: 'short summary',
      products: [],
    });
  } finally {
    captureSql = false;
  }
  sqlLog.length = 0;
  captureSql = true;
  try {
    const page = await server.inject({ url: `/api/v1/apis/${firstSlug}` });
    expect(page.statusCode).toBe(200);
    expect(documentQueries()).toEqual([]);
    expect(page.json()).not.toHaveProperty('document');
  } finally {
    captureSql = false;
  }
  sqlLog.length = 0;
  captureSql = true;
  try {
    const reference = await server.inject({
      url: `/api/v1/apis/${firstSlug}/openapi.json`,
    });
    expect(reference.statusCode).toBe(200);
    expect(documentQueries()).toHaveLength(1);
    const length = (
      reference.json() as { info: { description: string } }
    ).info.description.length;
    expect(length).toBe(1_000_000);
  } finally {
    captureSql = false;
  }
});
