// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, expect, it } from 'vitest';
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
import {
  BUILTIN_PLAN_ID,
  accessRequests,
  apis,
  apiVersions,
  apps,
  connect,
  credentials,
  gateways,
  instanceSettings,
  migrate,
  planApis,
  plans,
  productApis,
  products,
  subscriptions,
  teamMembers,
  teams,
  user,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { KongAdapter } from '@portal/adapter-kong';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { Auth } from './auth.js';

let network: StartedNetwork;
let postgres: StartedPostgreSqlContainer;
let kong: StartedTestContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
let adapter: KongAdapter;
const adminId = uuidv7();
const developerId = uuidv7();
const teamId = uuidv7();
const gatewayId = uuidv7();
const instanceId = uuidv7();
const apiId = uuidv7();
const looseApiId = uuidv7();
const productId = uuidv7();
const productPlanId = uuidv7();
let actor: 'admin' | 'developer' | null = 'developer';
let appA = '';
let appB = '';
let appC = '';
let activeKey = '';
let revokedKey = '';
let personalKey = '';
let activeCredentialId = '';
let revokedCredentialId = '';

const adminUser = {
  id: adminId,
  role: 'admin' as const,
  emailVerified: true,
  name: 'Admin',
  email: 'admin@example.com',
};
const developerUser = {
  id: developerId,
  role: 'developer' as const,
  emailVerified: true,
  name: 'Developer',
  email: 'dev@example.com',
};

async function publishService(id: string, slug: string, title: string) {
  await adapter.request(`/services/${id}`, 'PUT', {
    id,
    name: id,
    url: 'http://unused.invalid',
  });
  await adapter.request(`/services/${id}/routes`, 'POST', {
    paths: [`/${id}`],
  });
  await adapter.request(`/services/${id}/plugins`, 'POST', {
    name: 'key-auth',
  });
  await connection.db.insert(apis).values({
    id,
    slug,
    gatewayId,
    gatewayServiceId: id,
    gatewayServiceName: id,
    routePath: `/${id}`,
  });
  await connection.db.insert(apiVersions).values({
    id,
    apiId: id,
    title,
    version: '1',
    document: {},
  });
  await connection.db
    .update(apis)
    .set({ latestVersionId: id })
    .where(eq(apis.id, id));
}

async function counts() {
  const [appRows, requestRows, subscriptionRows, credentialRows, teamRows] =
    await Promise.all([
      connection.db.select({ id: apps.id }).from(apps),
      connection.db.select({ id: accessRequests.id }).from(accessRequests),
      connection.db.select({ id: subscriptions.id }).from(subscriptions),
      connection.db.select({ id: credentials.id }).from(credentials),
      connection.db.select({ id: teams.id }).from(teams),
    ]);
  return {
    apps: appRows.length,
    accessRequests: requestRows.length,
    subscriptions: subscriptionRows.length,
    credentials: credentialRows.length,
    teams: teamRows.length,
  };
}

async function owned() {
  return (await adapter.listOwnedConsumers())
    .map((consumer) => ({
      appId: consumer.appId,
      credentials: consumer.credentials.map((key) => key.id).sort(),
    }))
    .sort((left, right) => left.appId.localeCompare(right.appId));
}

beforeAll(async () => {
  network = await new Network().start();
  postgres = await new PostgreSqlContainer('postgres:17-alpine')
    .withNetwork(network)
    .withNetworkAliases('postgres')
    .start();
  connection = connect(postgres.getConnectionUri());
  await migrate(postgres.getConnectionUri());
  await connection.client.unsafe('CREATE DATABASE kong');
  const env = {
    KONG_DATABASE: 'postgres',
    KONG_PG_HOST: 'postgres',
    KONG_PG_USER: postgres.getUsername(),
    KONG_PG_PASSWORD: postgres.getPassword(),
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
  const adminUrl = `http://${kong.getHost()}:${kong.getMappedPort(8001)}`;
  const proxyUrl = `http://${kong.getHost()}:${kong.getMappedPort(8000)}`;
  adapter = new KongAdapter({ adminUrl, instanceId });
  await connection.db.insert(user).values([adminUser, developerUser]);
  await connection.db.insert(teams).values({ id: teamId, name: 'Shared' });
  await connection.db.insert(teamMembers).values([
    { teamId, userId: developerId, role: 'admin' },
    { teamId, userId: adminId, role: 'member' },
  ]);
  await connection.db.insert(instanceSettings).values({ id: 1, instanceId });
  await connection.db.insert(gateways).values({
    id: gatewayId,
    name: 'Kong',
    kind: 'kong',
    adminUrl,
    proxyPublicUrl: proxyUrl,
    proxyInternalUrl: proxyUrl,
  });
  await publishService(looseApiId, 'pets', 'Pets');
  await publishService(apiId, 'billing-api', 'Billing API');
  await connection.db.insert(products).values({
    id: productId,
    slug: 'billing',
    name: 'Billing',
    description: 'Billing APIs',
  });
  await connection.db.insert(productApis).values({ productId, apiId });
  await connection.db.insert(plans).values({
    id: productPlanId,
    productId,
    name: 'Free',
    rateLimit: 10,
    rateLimitUnit: 'second',
    monthlyQuota: 100,
    requiresApproval: true,
  });
  await connection.db
    .insert(planApis)
    .values({ planId: productPlanId, productId, apiId });
  const auth = {
    api: {
      getSession: async () =>
        actor === null
          ? null
          : { user: actor === 'admin' ? adminUser : developerUser },
    },
  } as unknown as Auth;
  ({ app: server } = await createApp({
    db: connection.db,
    config: loadConfig({ DATABASE_URL: postgres.getConnectionUri() }),
    auth,
    adapterFor: () => adapter,
    enqueueReconcile: async () => {},
    enqueueMail: async () => {},
    enqueueRevocation: async () => {},
  }));

  const created = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name: 'Keys', teamId, apiIds: [looseApiId] },
  });
  expect(created.statusCode, created.body).toBe(201);
  appA = created.json().app.id as string;
  revokedKey = created.json().credential.key as string;
  revokedCredentialId = created.json().credential.id as string;
  const second = await server.inject({
    method: 'POST',
    url: `/api/v1/apps/${appA}/credentials`,
  });
  expect(second.statusCode, second.body).toBe(201);
  activeKey = second.json().key as string;
  activeCredentialId = second.json().id as string;
  const revoked = await server.inject({
    method: 'DELETE',
    url: `/api/v1/apps/${appA}/credentials/${revokedCredentialId}`,
  });
  expect(revoked.statusCode, revoked.body).toBe(204);
  const personal = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name: 'Personal app', apiIds: [looseApiId] },
  });
  expect(personal.statusCode, personal.body).toBe(201);
  appB = personal.json().app.id as string;
  personalKey = personal.json().credential.key as string;
  appC = uuidv7();
  await connection.db.insert(apps).values({
    id: appC,
    teamId,
    createdBy: adminId,
    name: 'Legacy',
    planId: productPlanId,
    origin: 'admin',
    keyIssued: false,
    description: 'Assigned earlier',
  });
  const stamp = (id: string, iso: string) =>
    connection.db
      .update(apps)
      .set({ createdAt: new Date(iso) })
      .where(eq(apps.id, id));
  await stamp(appC, '2026-01-01T00:00:00.001Z');
  await stamp(appA, '2026-01-01T00:00:00.002Z');
  await stamp(appB, '2026-01-01T00:00:00.003Z');
}, 300_000);

afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await kong?.stop();
  await postgres?.stop();
  await network?.stop();
});

it('refuses the five developer writes for a portal admin before any row or Kong change', async () => {
  const beforeCounts = await counts();
  const beforeOwned = await owned();
  actor = 'admin';
  const attempts = [
    {
      method: 'POST' as const,
      url: '/api/v1/apps',
      payload: { name: 'Admin app', teamId, apiIds: [looseApiId] },
    },
    {
      method: 'POST' as const,
      url: '/api/v1/access-requests',
      payload: {
        teamId,
        planId: productPlanId,
        name: 'Ask',
        reason: 'Need it',
      },
    },
    {
      method: 'PUT' as const,
      url: `/api/v1/apps/${appA}/plan`,
      payload: { planId: productPlanId },
    },
    {
      method: 'POST' as const,
      url: `/api/v1/apps/${appA}/credentials`,
    },
    {
      method: 'POST' as const,
      url: `/api/v1/apps/${appA}/credentials/${activeCredentialId}/regenerate`,
    },
    {
      method: 'POST' as const,
      url: '/api/v1/apps',
      payload: {},
    },
  ];
  for (const attempt of attempts) {
    const response = await server.inject(attempt);
    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject({
      type: '/problems/admin-not-developer',
      title: 'A portal admin is not a developer',
      status: 403,
      detail:
        'Use a developer account to create apps, request access or hold API keys.',
    });
  }
  expect(await counts()).toEqual(beforeCounts);
  expect(await owned()).toEqual(beforeOwned);
  expect(beforeOwned.map((consumer) => consumer.appId).sort()).toEqual(
    [appA, appB].sort(),
  );
});

it('lists and reads apps with active key hints, owner, plan and team, and pages stably', async () => {
  actor = 'admin';
  const activeHint = activeKey.slice(-4);
  const revokedHint = revokedKey.slice(-4);
  const listed = await server.inject({ url: '/api/v1/admin/apps' });
  expect(listed.statusCode, listed.body).toBe(200);
  const list = listed.json() as {
    items: {
      id: string;
      activeKeyHints: string[];
      owner: { id: string; role: string } | null;
      team: { name: string; personal: boolean };
      plan: { id: string; builtin: boolean; product: { id: string } | null };
    }[];
    nextCursor: string | null;
  };
  expect(list.nextCursor).toBeNull();
  expect(list.items.map((item) => item.id)).toEqual([appB, appA, appC]);
  const keys = list.items.find((item) => item.id === appA);
  const personal = list.items.find((item) => item.id === appB);
  const legacy = list.items.find((item) => item.id === appC);
  expect(keys).toMatchObject({
    activeKeyHints: [activeHint],
    owner: { id: developerId, role: 'developer' },
    team: { id: teamId, name: 'Shared', personal: false },
    plan: {
      id: BUILTIN_PLAN_ID,
      name: 'Unlimited',
      builtin: true,
      product: null,
      rateLimit: null,
      rateLimitUnit: null,
      monthlyQuota: null,
    },
  });
  expect(personal).toMatchObject({
    owner: { id: developerId, name: 'Developer', email: 'dev@example.com' },
    team: { name: 'Personal', personal: true },
  });
  expect(personal?.activeKeyHints).toHaveLength(1);
  expect(personal?.activeKeyHints?.[0]).toMatch(/^.{4}$/);
  expect(personal?.activeKeyHints?.[0]).toBe(personalKey.slice(-4));
  expect(legacy).toMatchObject({
    activeKeyHints: [],
    owner: {
      id: adminId,
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
    },
    plan: {
      id: productPlanId,
      builtin: false,
      product: { id: productId, slug: 'billing', name: 'Billing' },
    },
  });
  expect(JSON.stringify(list)).not.toContain(activeKey);
  expect(JSON.stringify(list)).not.toContain(revokedKey);
  expect(JSON.stringify(list)).not.toContain(personalKey);
  if (revokedHint !== activeHint)
    expect(JSON.stringify(list)).not.toContain(`"${revokedHint}"`);

  const detailResponse = await server.inject({
    url: `/api/v1/admin/apps/${appA}`,
  });
  expect(detailResponse.statusCode, detailResponse.body).toBe(200);
  const detail = detailResponse.json();
  expect(detail.activeKeyHints).toEqual([activeHint]);
  expect(detail.credentials).toEqual([
    expect.objectContaining({
      id: activeCredentialId,
      status: 'active',
      keyHint: activeHint,
      revokedAt: null,
    }),
    expect.objectContaining({
      id: revokedCredentialId,
      status: 'revoked',
      keyHint: revokedHint,
    }),
  ]);
  expect(detail.credentials[1].revokedAt).toEqual(expect.any(String));
  expect(detail.subscriptions).toEqual([
    { apiId: looseApiId, slug: 'pets', title: 'Pets' },
  ]);
  expect(detail).not.toHaveProperty('key');
  expect(JSON.stringify(detail)).not.toContain(activeKey);
  expect(JSON.stringify(detail)).not.toContain(revokedKey);
  expect(JSON.stringify(detail)).toContain(`"${revokedHint}"`);

  const legacyDetail = await server.inject({
    url: `/api/v1/admin/apps/${appC}`,
  });
  expect(legacyDetail.statusCode, legacyDetail.body).toBe(200);
  expect(legacyDetail.json()).toMatchObject({
    origin: 'admin',
    keyIssued: false,
    revokedAt: null,
    description: 'Assigned earlier',
    activeKeyHints: [],
    credentials: [],
    subscriptions: [{ apiId, slug: 'billing-api', title: 'Billing API' }],
    owner: { role: 'admin' },
  });

  const first = await server.inject({ url: '/api/v1/admin/apps?limit=2' });
  expect(first.statusCode, first.body).toBe(200);
  const page = first.json() as {
    items: { id: string }[];
    nextCursor: string;
  };
  expect(page.items.map((item) => item.id)).toEqual([appB, appA]);
  expect(page.nextCursor).toEqual(expect.any(String));
  const second = await server.inject({
    url: `/api/v1/admin/apps?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`,
  });
  expect(second.statusCode, second.body).toBe(200);
  expect(second.json()).toMatchObject({
    items: [{ id: appC }],
    nextCursor: null,
  });
  const ids = [
    ...page.items.map((item) => item.id),
    ...second.json().items.map((item: { id: string }) => item.id),
  ];
  expect(new Set(ids).size).toBe(ids.length);
});

it('refuses developers and anonymous callers, and rejects a bad cursor or unknown app', async () => {
  actor = 'developer';
  for (const url of ['/api/v1/admin/apps', `/api/v1/admin/apps/${appA}`]) {
    const response = await server.inject({ url });
    expect(response.statusCode, response.body).toBe(403);
    expect(response.json().type).toBe('/problems/forbidden');
  }
  actor = null;
  const anonymous = await server.inject({ url: '/api/v1/admin/apps' });
  expect(anonymous.statusCode).toBe(401);
  expect(anonymous.json().type).toBe('/problems/unauthenticated');
  actor = 'admin';
  const cursor = Buffer.from('not-a-cursor').toString('base64url');
  const invalid = await server.inject({
    url: `/api/v1/admin/apps?cursor=${cursor}`,
  });
  expect(invalid.statusCode, invalid.body).toBe(400);
  expect(invalid.json().type).toBe('/problems/validation');
  expect(invalid.json().errors[0].pointer).toBe('/cursor');
  const missing = await server.inject({
    url: `/api/v1/admin/apps/${uuidv7()}`,
  });
  expect(missing.statusCode).toBe(404);
  expect(missing.json().type).toBe('/problems/not-found');
});
