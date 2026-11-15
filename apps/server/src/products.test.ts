// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
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
  subscriptions,
  BUILTIN_PLAN_ID,
} from '@portal/db';
import { eq, and } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  GatewayUnavailableError,
  type GatewayAdapter,
} from '@portal/adapter-sdk';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { Auth } from './auth.js';
import { reconcile } from './reconcile.js';
import { gatewayConnection } from './gateway-connection.js';
let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
const adminId = uuidv7(),
  teamId = uuidv7(),
  gatewayId = uuidv7(),
  apiId = uuidv7(),
  secondApiId = uuidv7(),
  productId = uuidv7(),
  planId = uuidv7(),
  nextPlanId = uuidv7();
const enqueue = vi.fn(async () => {});
const adapter = {
  kind: 'kong',
  capabilities: () => ({
    apiKeys: true,
    accessControl: true,
    oauthClients: false,
    plans: true,
    usage: false,
  }),
  ensureConsumer: vi.fn(async () => ({ id: 'consumer', username: 'consumer' })),
  grantAccess: vi.fn(async () => {}),
  revokeAccess: vi.fn(async () => {}),
  applyPlanLimits: vi.fn(async () => {}),
  issueCredential: vi.fn(async (_app, cred) => ({ id: cred.id })),
  revokeCredential: vi.fn(async () => {}),
  deleteConsumer: vi.fn(async () => {}),
  listOwnedConsumers: vi.fn(async () => []),
  applyAccessPolicy: vi.fn(async () => ({ repairs: [], findings: [] })),
} as unknown as GatewayAdapter;
let role = 'admin';
let signedIn = true;
let viewerId = adminId;
const auth = {
  api: {
    getSession: async () =>
      signedIn
        ? {
            user: {
              id: viewerId,
              name: 'Admin',
              email: 'admin@example.com',
              role,
              emailVerified: true,
            },
          }
        : null,
  },
} as unknown as Auth;
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  await migrate(url);
  connection = connect(url);
  await connection.db.insert(user).values({
    id: adminId,
    name: 'Admin',
    email: 'admin@example.com',
    role: 'admin',
    emailVerified: true,
  });
  await connection.db.insert(teams).values({ id: teamId, name: 'Team' });
  await connection.db
    .insert(teamMembers)
    .values({ teamId, userId: adminId, role: 'admin' });
  await connection.db
    .insert(instanceSettings)
    .values({ id: 1, instanceId: uuidv7() });
  await connection.db.insert(gateways).values({
    id: gatewayId,
    name: 'Kong',
    kind: 'kong',
    adminUrl: 'http://kong',
    proxyPublicUrl: 'http://kong',
    proxyInternalUrl: 'http://kong',
  });
  for (const id of [apiId, secondApiId]) {
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
      version: '1',
      document: {},
    });
    await connection.db
      .update(apis)
      .set({ latestVersionId: id })
      .where(eq(apis.id, id));
  }
  await connection.db.insert(products).values({
    id: productId,
    slug: 'product',
    name: 'Product',
    description: 'Description',
  });
  await connection.db
    .insert(productApis)
    .values([apiId, secondApiId].map((apiId) => ({ productId, apiId })));
  await connection.db.insert(plans).values([
    {
      id: planId,
      productId,
      name: 'Free',
      rateLimit: 5,
      rateLimitUnit: 'second',
      monthlyQuota: 10,
    },
    {
      id: nextPlanId,
      productId,
      name: 'Large',
      rateLimit: 10,
      rateLimitUnit: 'minute',
      monthlyQuota: 100,
    },
  ]);
  await connection.db.insert(planApis).values([
    { planId, productId, apiId },
    { planId: nextPlanId, productId, apiId: secondApiId },
  ]);
  ({ app: server } = await createApp({
    db: connection.db,
    config: loadConfig({ DATABASE_URL: url }),
    auth,
    adapterFor: () => adapter,
    enqueueReconcile: enqueue,
  }));
});
afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await container?.stop();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  for (const method of [
    'ensureConsumer',
    'grantAccess',
    'revokeAccess',
    'applyPlanLimits',
    'issueCredential',
    'revokeCredential',
    'deleteConsumer',
    'listOwnedConsumers',
    'applyAccessPolicy',
  ] as const)
    vi.spyOn(adapter, method);
  vi.clearAllMocks();
  role = 'admin';
  signedIn = true;
  viewerId = adminId;
  await connection.db
    .update(teamMembers)
    .set({ role: 'admin' })
    .where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, adminId)),
    );
});
const subscribe = async () => {
  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name: uuidv7(), teamId, planId },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
};
const active = async (appId: string) =>
  await connection.db
    .select()
    .from(credentials)
    .where(and(eq(credentials.appId, appId), eq(credentials.status, 'active')));
it('lists product references in the catalog, ordered plans, and a bounded subscription with one key', async () => {
  const catalog = await server.inject({ url: '/api/v1/apis' });
  expect(catalog.json().items[0].products).toEqual([
    { id: productId, name: 'Product', slug: 'product' },
  ]);
  const product = await server.inject({ url: '/api/v1/products/product' });
  expect(product.json().plans.map((p: { id: string }) => p.id)).toEqual([
    planId,
    nextPlanId,
  ]);
  const created = await subscribe();
  expect(created.app.plan).toMatchObject({
    id: planId,
    name: 'Free',
    builtin: false,
    rateLimit: 5,
  });
  expect(created.app.subscriptions).toEqual([
    { apiId, slug: `api-${apiId}`, title: `API ${apiId}` },
  ]);
  expect(adapter.applyPlanLimits).toHaveBeenCalledWith(
    { id: created.app.id },
    { rate: { unit: 'second', limit: 5 }, monthlyQuota: 10 },
  );
  expect(
    (
      await server.inject({
        method: 'POST',
        url: `/api/v1/apps/${created.app.id}/credentials`,
      })
    ).statusCode,
  ).toBe(409);
  const runtime = gatewayConnection(
    connection.db,
    loadConfig({}),
    'test',
    { error: () => {} },
    () => adapter,
  );
  await reconcile(connection.db, runtime, { warn: () => {} });
  expect(adapter.applyAccessPolicy).toHaveBeenCalledWith(
    expect.objectContaining({
      apps: expect.arrayContaining([
        expect.objectContaining({
          app: { id: created.app.id },
          limits: { rate: { unit: 'second', limit: 5 }, monthlyQuota: 10 },
          services: [{ id: apiId }],
        }),
      ]),
    }),
  );
});
it('collects invalid plan fields and prevents direct product-API subscriptions without gateway calls', async () => {
  const response = await server.inject({
    method: 'POST',
    url: `/api/v1/admin/products/${productId}/plans`,
    payload: {
      name: '',
      rateLimit: 0,
      rateLimitUnit: 'hour',
      monthlyQuota: 2.5,
      apiIds: [],
    },
  });
  expect(response.statusCode).toBe(400);
  expect(
    response.json().errors.map((e: { pointer: string }) => e.pointer),
  ).toEqual(
    expect.arrayContaining([
      '/name',
      '/rateLimit',
      '/rateLimitUnit',
      '/monthlyQuota',
      '/apiIds',
    ]),
  );
  for (const invalid of [undefined, 0, -1, 2.5]) {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/admin/products/${productId}/plans`,
      payload: {
        name: 'Invalid',
        rateLimit: invalid,
        rateLimitUnit: 'second',
        monthlyQuota: 10,
        apiIds: [apiId],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors).toContainEqual(
      expect.objectContaining({ pointer: '/rateLimit' }),
    );
  }
  const direct = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { teamId, name: 'Bypass', apiIds: [apiId] },
  });
  expect(direct.statusCode).toBe(400);
  expect(direct.json().errors[0].pointer).toBe('/apiIds');
  expect(adapter.ensureConsumer).not.toHaveBeenCalled();
});
it('collects product membership and quota errors alongside missing fields', async () => {
  const response = await server.inject({
    method: 'POST',
    url: `/api/v1/admin/products/${productId}/plans`,
    payload: { rateLimit: 10, monthlyQuota: 5, apiIds: [uuidv7()] },
  });
  expect(response.statusCode).toBe(400);
  expect(
    response.json().errors.map((e: { pointer: string }) => e.pointer),
  ).toEqual(
    expect.arrayContaining([
      '/name',
      '/rateLimitUnit',
      '/monthlyQuota',
      '/apiIds',
    ]),
  );
});
it('admin product and plan writes enforce ownership, uniqueness, membership and enqueue reconciliation', async () => {
  role = 'developer';
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/api/v1/admin/products',
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  role = 'admin';
  const created = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/products',
    payload: {
      name: 'New product',
      description: 'Description',
      apiIds: [apiId],
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  const repeated = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/products',
    payload: {
      name: 'New product',
      description: 'Description',
      apiIds: [apiId],
    },
  });
  expect(repeated.statusCode).toBe(409);
  const patch = await server.inject({
    method: 'PATCH',
    url: `/api/v1/admin/products/${productId}`,
    payload: { apiIds: [secondApiId] },
  });
  expect(patch.statusCode).toBe(409);
  expect(patch.json().type).toBe('/problems/api-in-plan');
  const input = {
    name: 'Free',
    rateLimit: 5,
    rateLimitUnit: 'second',
    monthlyQuota: 10,
    apiIds: [apiId],
  };
  expect(
    (
      await server.inject({
        method: 'POST',
        url: `/api/v1/admin/products/${productId}/plans`,
        payload: input,
      })
    ).statusCode,
  ).toBe(409);
  const saved = await server.inject({
    method: 'PUT',
    url: `/api/v1/admin/products/${productId}/plans/${planId}`,
    payload: input,
  });
  expect(saved.statusCode, saved.body).toBe(200);
  expect(enqueue).toHaveBeenCalledOnce();
  expect(adapter.applyPlanLimits).not.toHaveBeenCalled();
});
it('changes plans, regenerates once, and cancels without exposing old keys', async () => {
  const created = await subscribe(),
    appId = created.app.id;
  const changed = await server.inject({
    method: 'PUT',
    url: `/api/v1/apps/${appId}/plan`,
    payload: { planId: nextPlanId },
  });
  expect(changed.statusCode, changed.body).toBe(200);
  expect(changed.json().plan.id).toBe(nextPlanId);
  const regenerated = await server.inject({
    method: 'POST',
    url: `/api/v1/apps/${appId}/credentials/${created.credential.id}/regenerate`,
  });
  expect(regenerated.statusCode, regenerated.body).toBe(201);
  expect(regenerated.json().key).not.toBe(created.credential.key);
  expect((await active(appId)).map((c) => c.id)).toEqual([
    regenerated.json().id,
  ]);
  expect(
    (
      await server.inject({
        method: 'POST',
        url: `/api/v1/apps/${appId}/credentials/${created.credential.id}/regenerate`,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await server.inject({ method: 'DELETE', url: `/api/v1/apps/${appId}` }))
      .statusCode,
  ).toBe(204);
  expect(
    await connection.db.select().from(apps).where(eq(apps.id, appId)),
  ).toEqual([]);
});
it.each([
  'ensureConsumer',
  'grantAccess',
  'applyPlanLimits',
  'issueCredential',
] as const)('compensates subscribe failure at %s', async (method) => {
  vi.spyOn(adapter, method).mockRejectedValueOnce(
    new GatewayUnavailableError(),
  );
  const name = uuidv7();
  const result = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name, teamId, planId },
  });
  expect(result.statusCode, result.body).toBe(503);
  expect(result.headers['retry-after']).toBe('5');
  expect(
    await connection.db.select().from(apps).where(eq(apps.name, name)),
  ).toEqual([]);
  expect(adapter.deleteConsumer).toHaveBeenCalledOnce();
});
it.each(['applyPlanLimits', 'grantAccess', 'revokeAccess'] as const)(
  'compensates plan-change failure at %s',
  async (method) => {
    const created = await subscribe();
    vi.spyOn(adapter, method).mockRejectedValueOnce(
      new GatewayUnavailableError(),
    );
    const result = await server.inject({
      method: 'PUT',
      url: `/api/v1/apps/${created.app.id}/plan`,
      payload: { planId: nextPlanId },
    });
    expect(result.statusCode, result.body).toBe(503);
    expect(
      (
        await connection.db
          .select()
          .from(apps)
          .where(eq(apps.id, created.app.id))
      )[0]!.planId,
    ).toBe(planId);
    expect(adapter.applyPlanLimits).toHaveBeenLastCalledWith(
      { id: created.app.id },
      { rate: { unit: 'second', limit: 5 }, monthlyQuota: 10 },
    );
    expect(adapter.grantAccess).toHaveBeenLastCalledWith(
      { id: created.app.id },
      { id: apiId },
    );
    expect(adapter.revokeAccess).toHaveBeenLastCalledWith(
      { id: created.app.id },
      { id: secondApiId },
    );
  },
);
it.each(['ensureConsumer', 'issueCredential', 'revokeCredential'] as const)(
  'rolls back regeneration failure at %s',
  async (method) => {
    const created = await subscribe();
    vi.spyOn(adapter, method).mockRejectedValueOnce(
      new GatewayUnavailableError(),
    );
    const result = await server.inject({
      method: 'POST',
      url: `/api/v1/apps/${created.app.id}/credentials/${created.credential.id}/regenerate`,
    });
    expect(result.statusCode, result.body).toBe(503);
    expect((await active(created.app.id)).map((c) => c.id)).toEqual([
      created.credential.id,
    ]);
    if (method !== 'ensureConsumer')
      expect(adapter.revokeCredential).toHaveBeenLastCalledWith(
        { id: created.app.id },
        expect.not.stringMatching(created.credential.id),
      );
  },
);
it('rolls back database insert failures and removes newly issued keys', async () => {
  const created = await subscribe();
  await connection.client.unsafe(
    `CREATE FUNCTION reject_product_key() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insert failure'; END $$; CREATE TRIGGER reject_product_key BEFORE INSERT ON credentials FOR EACH ROW EXECUTE FUNCTION reject_product_key();`,
  );
  try {
    const result = await server.inject({
      method: 'POST',
      url: `/api/v1/apps/${created.app.id}/credentials/${created.credential.id}/regenerate`,
    });
    expect(result.statusCode).toBe(500);
    expect((await active(created.app.id)).map((c) => c.id)).toEqual([
      created.credential.id,
    ]);
    expect(adapter.revokeCredential).toHaveBeenLastCalledWith(
      { id: created.app.id },
      expect.not.stringMatching(created.credential.id),
    );
    const name = uuidv7();
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/apps',
          payload: { teamId, name, planId },
        })
      ).statusCode,
    ).toBe(500);
    expect(
      await connection.db.select().from(apps).where(eq(apps.name, name)),
    ).toEqual([]);
    expect(adapter.deleteConsumer).toHaveBeenCalled();
  } finally {
    await connection.client.unsafe(
      'DROP TRIGGER reject_product_key ON credentials; DROP FUNCTION reject_product_key();',
    );
  }
});
it('failed cancel preserves the app; read-only members cannot invoke any gateway mutation', async () => {
  const created = await subscribe();
  vi.spyOn(adapter, 'deleteConsumer').mockRejectedValueOnce(
    new GatewayUnavailableError(),
  );
  expect(
    (
      await server.inject({
        method: 'DELETE',
        url: `/api/v1/apps/${created.app.id}`,
      })
    ).statusCode,
  ).toBe(503);
  expect(
    (await connection.db.select().from(apps).where(eq(apps.id, created.app.id)))
      .length,
  ).toBe(1);
  await connection.db
    .update(teamMembers)
    .set({ role: 'read-only' })
    .where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, adminId)),
    );
  vi.clearAllMocks();
  const requests = [
    {
      method: 'POST' as const,
      url: '/api/v1/apps',
      payload: { name: uuidv7(), teamId, planId },
    },
    {
      method: 'PUT' as const,
      url: `/api/v1/apps/${created.app.id}/plan`,
      payload: { planId: nextPlanId },
    },
    { method: 'DELETE' as const, url: `/api/v1/apps/${created.app.id}` },
    {
      method: 'POST' as const,
      url: `/api/v1/apps/${created.app.id}/credentials/${created.credential.id}/regenerate`,
    },
  ];
  for (const request of requests) {
    const res = await server.inject(request);
    expect(res.statusCode, res.body).toBe(403);
    expect(res.json().type).toBe('/problems/team-role-forbidden');
  }
  for (const method of [
    'ensureConsumer',
    'applyPlanLimits',
    'deleteConsumer',
    'issueCredential',
    'grantAccess',
    'revokeAccess',
    'revokeCredential',
  ] as const)
    expect(adapter[method]).not.toHaveBeenCalled();
});
it('keeps builtin apps Unlimited and rejects changing them to a product plan', async () => {
  const id = uuidv7();
  await connection.db
    .insert(apps)
    .values({ id, teamId, name: uuidv7(), planId: BUILTIN_PLAN_ID });
  await connection.db
    .insert(subscriptions)
    .values({ id: uuidv7(), appId: id, apiId });
  const view = await server.inject({ url: `/api/v1/apps/${id}` });
  expect(view.json().plan).toMatchObject({
    name: 'Unlimited',
    builtin: true,
    product: null,
    rateLimit: null,
  });
  const changed = await server.inject({
    method: 'PUT',
    url: `/api/v1/apps/${id}/plan`,
    payload: { planId },
  });
  expect(changed.statusCode).toBe(400);
  expect(changed.json().errors[0].pointer).toBe('/planId');
});

it('compensates a failed plan database update and continues compensation after a failed repair', async () => {
  const created = await subscribe();
  await connection.client.unsafe(
    `CREATE FUNCTION reject_plan_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test update failure'; END $$; CREATE TRIGGER reject_plan_change BEFORE UPDATE ON apps FOR EACH ROW EXECUTE FUNCTION reject_plan_change();`,
  );
  try {
    vi.spyOn(adapter, 'applyPlanLimits')
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new GatewayUnavailableError());
    const result = await server.inject({
      method: 'PUT',
      url: `/api/v1/apps/${created.app.id}/plan`,
      payload: { planId: nextPlanId },
    });
    expect(result.statusCode).toBe(500);
    expect(
      (
        await connection.db
          .select()
          .from(apps)
          .where(eq(apps.id, created.app.id))
      )[0]!.planId,
    ).toBe(planId);
    expect(adapter.grantAccess).toHaveBeenLastCalledWith(
      { id: created.app.id },
      { id: apiId },
    );
    expect(adapter.revokeAccess).toHaveBeenLastCalledWith(
      { id: created.app.id },
      { id: secondApiId },
    );
  } finally {
    await connection.client.unsafe(
      'DROP TRIGGER reject_plan_change ON apps; DROP FUNCTION reject_plan_change();',
    );
  }
});
it('revokes the new credential if marking the old credential revoked fails', async () => {
  const created = await subscribe();
  await connection.client.unsafe(
    `CREATE FUNCTION reject_key_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test key update failure'; END $$; CREATE TRIGGER reject_key_update BEFORE UPDATE ON credentials FOR EACH ROW EXECUTE FUNCTION reject_key_update();`,
  );
  try {
    const result = await server.inject({
      method: 'POST',
      url: `/api/v1/apps/${created.app.id}/credentials/${created.credential.id}/regenerate`,
    });
    expect(result.statusCode).toBe(500);
    expect((await active(created.app.id)).map((c) => c.id)).toEqual([
      created.credential.id,
    ]);
    expect(adapter.revokeCredential).toHaveBeenLastCalledWith(
      { id: created.app.id },
      expect.not.stringMatching(created.credential.id),
    );
  } finally {
    await connection.client.unsafe(
      'DROP TRIGGER reject_key_update ON credentials; DROP FUNCTION reject_key_update();',
    );
  }
});
it('compensates subscription and regeneration commit failures and fails closed on cancellation commit failure', async () => {
  const created = await subscribe();
  await connection.client.unsafe(
    `CREATE FUNCTION reject_plan_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test commit failure'; END $$; CREATE CONSTRAINT TRIGGER reject_plan_commit AFTER INSERT ON credentials DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_plan_commit();`,
  );
  try {
    const name = uuidv7();
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/apps',
          payload: { name, teamId, planId },
        })
      ).statusCode,
    ).toBe(500);
    expect(
      await connection.db.select().from(apps).where(eq(apps.name, name)),
    ).toEqual([]);
    expect(adapter.deleteConsumer).toHaveBeenCalled();
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/v1/apps/${created.app.id}/credentials/${created.credential.id}/regenerate`,
        })
      ).statusCode,
    ).toBe(500);
    expect((await active(created.app.id)).map((c) => c.id)).toEqual([
      created.credential.id,
    ]);
    expect(adapter.revokeCredential).toHaveBeenLastCalledWith(
      { id: created.app.id },
      expect.not.stringMatching(created.credential.id),
    );
  } finally {
    await connection.client.unsafe(
      'DROP TRIGGER reject_plan_commit ON credentials; DROP FUNCTION reject_plan_commit();',
    );
  }
  await connection.client.unsafe(
    `CREATE FUNCTION reject_cancel_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test cancel commit failure'; END $$; CREATE CONSTRAINT TRIGGER reject_cancel_commit AFTER DELETE ON apps DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_cancel_commit();`,
  );
  try {
    vi.clearAllMocks();
    expect(
      (
        await server.inject({
          method: 'DELETE',
          url: `/api/v1/apps/${created.app.id}`,
        })
      ).statusCode,
    ).toBe(500);
    expect(adapter.deleteConsumer).toHaveBeenCalledWith({ id: created.app.id });
    expect(
      (
        await connection.db
          .select()
          .from(apps)
          .where(eq(apps.id, created.app.id))
      ).length,
    ).toBe(1);
    // Keys cannot be recreated after Kong deleted the consumer; reconcile reports drift.
    expect(adapter.issueCredential).not.toHaveBeenCalled();
  } finally {
    await connection.client.unsafe(
      'DROP TRIGGER reject_cancel_commit ON apps; DROP FUNCTION reject_cancel_commit();',
    );
  }
});

it.each(['POST', 'PUT'] as const)(
  'AC2: %s rejects every invalid numeric field and API membership without saving',
  async (method) => {
    const before = await connection.db.select().from(plans);
    const beforeApis = await connection.db.select().from(planApis);
    const path = `/api/v1/admin/products/${productId}/plans${method === 'PUT' ? `/${planId}` : ''}`;
    for (const field of ['rateLimit', 'monthlyQuota'] as const) {
      for (const value of [undefined, 0, -1, 2.5]) {
        const result = await server.inject({
          method,
          url: path,
          payload: {
            name: 'Invalid QA',
            rateLimit: 5,
            rateLimitUnit: 'second',
            monthlyQuota: 10,
            apiIds: [apiId],
            [field]: value,
          },
        });
        expect(result.statusCode, result.body).toBe(400);
        expect(result.headers['content-type']).toContain(
          'application/problem+json',
        );
        expect(result.json().errors).toContainEqual(
          expect.objectContaining({ pointer: `/${field}` }),
        );
      }
    }
    for (const apiIds of [[], [uuidv7()]]) {
      const result = await server.inject({
        method,
        url: path,
        payload: {
          name: 'Invalid QA',
          rateLimit: 5,
          rateLimitUnit: 'second',
          monthlyQuota: 10,
          apiIds,
        },
      });
      expect(result.statusCode, result.body).toBe(400);
      expect(result.json().errors).toContainEqual(
        expect.objectContaining({ pointer: '/apiIds' }),
      );
    }
    expect(await connection.db.select().from(plans)).toEqual(before);
    expect(await connection.db.select().from(planApis)).toEqual(beforeApis);
    expect(adapter.applyPlanLimits).not.toHaveBeenCalled();
  },
);
it('duplicate subscriptions return a conflict without issuing another key or consumer', async () => {
  const created = await subscribe();
  vi.clearAllMocks();
  const result = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { name: created.app.name, teamId, planId },
  });
  expect(result.statusCode).toBe(409);
  expect(result.headers['content-type']).toContain('application/problem+json');
  expect(result.json().type).toBe('/problems/app-name-taken');
  expect((await active(created.app.id)).map((c) => c.id)).toEqual([
    created.credential.id,
  ]);
  expect(adapter.ensureConsumer).not.toHaveBeenCalled();
  expect(adapter.issueCredential).not.toHaveBeenCalled();
});
it('serializes simultaneous duplicate subscriptions before any second Kong write', async () => {
  const request = {
    method: 'POST' as const,
    url: '/api/v1/apps',
    payload: { name: 'Concurrent QA subscription', teamId, planId },
  };
  const results = await Promise.all([
    server.inject(request),
    server.inject(request),
  ]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
  const conflict = results.find((result) => result.statusCode === 409)!;
  expect(conflict.headers['content-type']).toContain(
    'application/problem+json',
  );
  expect(conflict.json().type).toBe('/problems/app-name-taken');
  expect(adapter.ensureConsumer).toHaveBeenCalledTimes(1);
  expect(adapter.issueCredential).toHaveBeenCalledTimes(1);
  const created = results.find((result) => result.statusCode === 201)!.json();
  expect(
    (await active(created.app.id)).map((credential) => credential.id),
  ).toEqual([created.credential.id]);
});
it('AC10: non-admins cannot create or edit products or plans and expired sessions cannot mutate subscriptions', async () => {
  const created = await subscribe();
  const before = await connection.db.select().from(products);
  const beforePlans = await connection.db.select().from(plans);
  const beforeApps = await connection.db.select().from(apps);
  const beforeCredentials = await connection.db.select().from(credentials);
  vi.clearAllMocks();
  role = 'developer';
  const input = {
    name: 'Denied',
    rateLimit: 5,
    rateLimitUnit: 'second',
    monthlyQuota: 10,
    apiIds: [apiId],
  };
  for (const request of [
    {
      method: 'POST' as const,
      url: '/api/v1/admin/products',
      payload: { name: 'Denied', description: 'Denied', apiIds: [apiId] },
    },
    {
      method: 'PATCH' as const,
      url: `/api/v1/admin/products/${productId}`,
      payload: { name: 'Denied' },
    },
    {
      method: 'POST' as const,
      url: `/api/v1/admin/products/${productId}/plans`,
      payload: input,
    },
    {
      method: 'PUT' as const,
      url: `/api/v1/admin/products/${productId}/plans/${planId}`,
      payload: input,
    },
  ]) {
    const result = await server.inject(request);
    expect(result.statusCode, result.body).toBe(403);
    expect(result.headers['content-type']).toContain(
      'application/problem+json',
    );
  }
  signedIn = false;
  for (const request of [
    {
      method: 'POST' as const,
      url: '/api/v1/apps',
      payload: { name: 'Expired', teamId, planId },
    },
    {
      method: 'PUT' as const,
      url: `/api/v1/apps/${created.app.id}/plan`,
      payload: { planId: nextPlanId },
    },
    { method: 'DELETE' as const, url: `/api/v1/apps/${created.app.id}` },
    {
      method: 'POST' as const,
      url: `/api/v1/apps/${created.app.id}/credentials/${created.credential.id}/regenerate`,
    },
  ]) {
    const result = await server.inject(request);
    expect(result.statusCode, result.body).toBe(401);
    expect(result.headers['content-type']).toContain(
      'application/problem+json',
    );
  }
  expect(await connection.db.select().from(products)).toEqual(before);
  expect(await connection.db.select().from(plans)).toEqual(beforePlans);
  expect(await connection.db.select().from(apps)).toEqual(beforeApps);
  expect(await connection.db.select().from(credentials)).toEqual(
    beforeCredentials,
  );
  for (const method of [
    'ensureConsumer',
    'issueCredential',
    'applyPlanLimits',
    'deleteConsumer',
    'grantAccess',
    'revokeAccess',
    'revokeCredential',
  ] as const)
    expect(adapter[method]).not.toHaveBeenCalled();
});

it('011 AC 8: initial and regenerated credentials record their own creator, including a teammate', async () => {
  const created = await subscribe();
  expect(await active(created.app.id)).toEqual([
    expect.objectContaining({ id: created.credential.id, createdBy: adminId }),
  ]);
  const teammate = uuidv7();
  await connection.db
    .insert(user)
    .values({
      id: teammate,
      name: 'Regenerator',
      email: `${teammate}@example.com`,
      role: 'developer',
      emailVerified: true,
    });
  await connection.db
    .insert(teamMembers)
    .values({ teamId, userId: teammate, role: 'member' });
  viewerId = teammate;
  role = 'developer';
  const regenerated = await server.inject({
    method: 'POST',
    url: `/api/v1/apps/${created.app.id}/credentials/${created.credential.id}/regenerate`,
  });
  expect(regenerated.statusCode, regenerated.body).toBe(201);
  expect(await active(created.app.id)).toEqual([
    expect.objectContaining({ id: regenerated.json().id, createdBy: teammate }),
  ]);
  const [old] = await connection.db
    .select()
    .from(credentials)
    .where(eq(credentials.id, created.credential.id));
  expect(old).toMatchObject({ status: 'revoked', createdBy: adminId });
});
