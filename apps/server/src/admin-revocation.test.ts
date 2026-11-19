// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
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
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { KongAdapter } from '@portal/adapter-kong';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { Auth } from './auth.js';
import { gatewayConnection } from './gateway-connection.js';
import { revokeApps } from './revocation.js';
import { reconcile } from './reconcile.js';

let network: StartedNetwork;
let postgres: StartedPostgreSqlContainer;
let kong: StartedTestContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
let adapter: KongAdapter;
let proxyUrl: string;
const adminId = uuidv7(),
  developerId = uuidv7(),
  teamId = uuidv7(),
  gatewayId = uuidv7(),
  instanceId = uuidv7();
let actor: 'admin' | 'developer' = 'admin';
const enqueue = vi.fn(
  async (_payload: { template?: string; appId?: string }, _tx?: unknown) => {},
);

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
  proxyUrl = `http://${kong.getHost()}:${kong.getMappedPort(8000)}`;
  adapter = new KongAdapter({ adminUrl, instanceId });
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
  await connection.db
    .insert(gateways)
    .values({
      id: gatewayId,
      name: 'Kong',
      kind: 'kong',
      adminUrl,
      proxyPublicUrl: proxyUrl,
      proxyInternalUrl: proxyUrl,
    });
  const auth = {
    api: {
      getSession: async () => ({
        user:
          actor === 'admin'
            ? {
                id: adminId,
                role: 'admin',
                emailVerified: true,
                name: 'Admin',
                email: 'admin@example.com',
              }
            : {
                id: developerId,
                role: 'developer',
                emailVerified: true,
                name: 'Developer',
                email: 'dev@example.com',
              },
      }),
    },
  } as unknown as Auth;
  ({ app: server } = await createApp({
    db: connection.db,
    config: loadConfig({ DATABASE_URL: postgres.getConnectionUri() }),
    auth,
    adapterFor: () => adapter,
    enqueueReconcile: async () => {},
    enqueueMail: enqueue,
    enqueueRevocation: async () => {},
  }));
}, 120000);

afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await kong?.stop();
  await postgres?.stop();
  await network?.stop();
});

async function fixture(visibility: 'open' | 'manual') {
  const apiId = uuidv7(),
    productId = uuidv7(),
    planId = uuidv7();
  await adapter.request(`/services/${apiId}`, 'PUT', {
    id: apiId,
    name: apiId,
    url: 'http://unused.invalid',
  });
  await adapter.request(`/services/${apiId}/routes`, 'POST', {
    paths: [`/${apiId}`],
  });
  // A local response verifies gateway authentication without an external upstream.
  await adapter.request(`/services/${apiId}/plugins`, 'POST', {
    name: 'key-auth',
  });
  await adapter.request(`/services/${apiId}/plugins`, 'POST', {
    name: 'request-termination',
    config: { status_code: 200, body: 'ok' },
  });
  await connection.db
    .insert(apis)
    .values({
      id: apiId,
      slug: apiId,
      gatewayId,
      gatewayServiceId: apiId,
      gatewayServiceName: apiId,
      routePath: `/${apiId}`,
    });
  await connection.db
    .insert(apiVersions)
    .values({ id: apiId, apiId, title: 'API', version: '1', document: {} });
  await connection.db
    .update(apis)
    .set({ latestVersionId: apiId })
    .where(eq(apis.id, apiId));
  await connection.db
    .insert(products)
    .values({
      id: productId,
      slug: productId,
      name: 'Product',
      description: 'Regression fixture',
      visibility,
    });
  await connection.db.insert(productApis).values({ productId, apiId });
  await connection.db
    .insert(plans)
    .values({
      id: planId,
      productId,
      name: 'Free',
      rateLimit: 100,
      rateLimitUnit: 'second',
      monthlyQuota: 1000,
    });
  await connection.db.insert(planApis).values({ planId, productId, apiId });
  const assigned = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/subscriptions',
    payload: { teamId, planId, name: uuidv7() },
  });
  expect(assigned.statusCode, assigned.body).toBe(201);
  const appId = assigned.json().id as string;
  actor = 'developer';
  const revealed = await server.inject({
    method: 'POST',
    url: `/api/v1/apps/${appId}/credentials`,
  });
  actor = 'admin';
  expect(revealed.statusCode, revealed.body).toBe(201);
  const key = revealed.json().key as string;
  const call = async () => {
    const response = await fetch(`${proxyUrl}/${apiId}`, {
      headers: { apikey: key },
    });
    await response.body?.cancel();
    return response.status;
  };
  expect(await call()).toBe(200);
  enqueue.mockClear();
  return { apiId, productId, planId, appId, call };
}

async function assertRevoked(appId: string, call: () => Promise<number>) {
  expect(await call()).toBe(401);
  expect(
    (await connection.db.select().from(apps).where(eq(apps.id, appId)))[0]!
      .status,
  ).toBe('revoked');
  expect(
    (
      await connection.db
        .select()
        .from(credentials)
        .where(eq(credentials.appId, appId))
    )[0]!.status,
  ).toBe('revoked');
  const conn = gatewayConnection(
    connection.db,
    loadConfig({ DATABASE_URL: postgres.getConnectionUri() }),
    instanceId,
    server.log,
    () => adapter,
  );
  await revokeApps(connection.db, conn, [appId], enqueue, server.log);
  await reconcile(connection.db, conn, server.log, enqueue);
  expect(await call()).toBe(401);
  expect(
    enqueue.mock.calls.filter(
      ([p]) => p.template === 'subscription-revoked' && p.appId === appId,
    ),
  ).toHaveLength(1);
}

it.each(['open', 'manual'] as const)(
  '%s admin assignment is counted and revoked on Open → Hidden, including after Manual → Open',
  async (initial) => {
    const { productId, appId, call } = await fixture(initial);
    const url = `/api/v1/admin/products/${productId}/access`;
    if (initial === 'manual') {
      const opened = await server.inject({
        method: 'PUT',
        url,
        payload: { visibility: 'open' },
      });
      expect(opened.statusCode, opened.body).toBe(200);
      expect(await call()).toBe(200);
    }
    const confirmation = await server.inject({
      method: 'PUT',
      url,
      payload: { visibility: 'hidden' },
    });
    expect(confirmation.statusCode).toBe(409);
    expect(confirmation.json()).toMatchObject({
      affectedTeams: 1,
      affectedSubscriptions: 1,
    });
    expect(await call()).toBe(200);
    const revoked = await server.inject({
      method: 'PUT',
      url,
      payload: { visibility: 'hidden', existingSubscriptions: 'revoke' },
    });
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect(revoked.json().revocation).toEqual({ revoked: 1, pending: 0 });
    await assertRevoked(appId, call);
  },
);

it('requires approval confirms admin assignment, Keep preserves its key, and Revoke invalidates it', async () => {
  const { apiId, productId, planId, appId, call } = await fixture('manual');
  const url = `/api/v1/admin/products/${productId}/plans/${planId}`;
  const payload = {
    name: 'Free',
    rateLimit: 100,
    rateLimitUnit: 'second',
    monthlyQuota: 1000,
    apiIds: [apiId],
    requiresApproval: true,
  };
  const confirmation = await server.inject({ method: 'PUT', url, payload });
  expect(confirmation.statusCode).toBe(409);
  expect(confirmation.json()).toMatchObject({
    affectedTeams: 1,
    affectedSubscriptions: 1,
  });
  const kept = await server.inject({
    method: 'PUT',
    url,
    payload: { ...payload, existingSubscriptions: 'keep' },
  });
  expect(kept.statusCode, kept.body).toBe(200);
  expect(await call()).toBe(200);
  expect(enqueue).not.toHaveBeenCalled();
  const reset = await server.inject({
    method: 'PUT',
    url,
    payload: { ...payload, requiresApproval: false },
  });
  expect(reset.statusCode, reset.body).toBe(200);
  const revoked = await server.inject({
    method: 'PUT',
    url,
    payload: { ...payload, existingSubscriptions: 'revoke' },
  });
  expect(revoked.statusCode, revoked.body).toBe(200);
  await assertRevoked(appId, call);
});

it('AC13: admin-assigned revocation persists on gateway failure and retries once without restoring access', async () => {
  const { productId, appId, call } = await fixture('open');
  const deletion = vi
    .spyOn(adapter, 'deleteConsumer')
    .mockRejectedValueOnce(new Error('Gateway unavailable'));
  try {
    const restricted = await server.inject({
      method: 'PUT',
      url: `/api/v1/admin/products/${productId}/access`,
      payload: { visibility: 'hidden', existingSubscriptions: 'revoke' },
    });
    expect(restricted.statusCode, restricted.body).toBe(200);
    expect(restricted.json().revocation).toEqual({ revoked: 0, pending: 1 });
    expect(
      (
        await connection.db
          .select()
          .from(products)
          .where(eq(products.id, productId))
      )[0]!.visibility,
    ).toBe('hidden');
    expect(
      (await connection.db.select().from(apps).where(eq(apps.id, appId)))[0]!
        .status,
    ).toBe('revoke-pending');
    expect(enqueue).not.toHaveBeenCalled();
    expect(await call()).toBe(200);
  } finally {
    deletion.mockRestore();
  }
  const conn = gatewayConnection(
    connection.db,
    loadConfig({ DATABASE_URL: postgres.getConnectionUri() }),
    instanceId,
    server.log,
    () => adapter,
  );
  await revokeApps(connection.db, conn, [appId], enqueue, server.log);
  await assertRevoked(appId, call);
});

it.each(['keep', 'revoke'] as const)(
  'Manual → Internal %s protects unnamed assignments with a real Kong credential',
  async (decision) => {
    const { productId, planId, appId, call } = await fixture('manual');
    const namedId = uuidv7();
    await connection.db
      .insert(teams)
      .values({ id: namedId, name: 'Named team' });
    const url = `/api/v1/admin/products/${productId}/access`;
    const payload = { visibility: 'internal', teamIds: [namedId] };
    const confirmation = await server.inject({ method: 'PUT', url, payload });
    expect(confirmation.statusCode, confirmation.body).toBe(409);
    expect(confirmation.json()).toMatchObject({
      type: '/problems/confirmation-required',
      affectedTeams: 1,
      affectedSubscriptions: 1,
    });
    expect(await call()).toBe(200);
    const applied = await server.inject({
      method: 'PUT',
      url,
      payload: { ...payload, existingSubscriptions: decision },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    if (decision === 'revoke') await assertRevoked(appId, call);
    else {
      expect(await call()).toBe(200);
      expect(enqueue).not.toHaveBeenCalled();
    }
    const before = await adapter.request('/consumers', 'GET');
    const denied = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/subscriptions',
      payload: { teamId, planId, name: uuidv7() },
    });
    expect(denied.statusCode, denied.body).toBe(409);
    expect(denied.json().type).toBe('/problems/team-not-named');
    expect(await adapter.request('/consumers', 'GET')).toEqual(before);
    const allowed = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/subscriptions',
      payload: { teamId: namedId, planId, name: uuidv7() },
    });
    expect(allowed.statusCode, allowed.body).toBe(201);
    expect(allowed.json()).toMatchObject({ origin: 'admin', keyIssued: false });
  },
);
