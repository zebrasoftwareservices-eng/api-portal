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
  accessRequests,
  productTeams,
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
import { revokeApps } from './revocation.js';
import { renderMail } from './mail/templates.js';
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
const enqueue = vi.fn(
  async (_payload: { template?: string }, _tx?: unknown) => {},
);
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
const auth = {
  api: {
    getSession: async () =>
      signedIn
        ? {
            user: {
              id: adminId,
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
    enqueueReconcile: async () => {},
    enqueueMail: enqueue,
    enqueueRevocation: async () => {},
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
  role = 'developer';
  signedIn = true;
  await connection.db.delete(accessRequests);
  await connection.db.delete(apps);
  await connection.db.delete(productTeams);
  await connection.db.update(products).set({ visibility: 'open' });
  await connection.db.update(plans).set({ requiresApproval: false });
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

const requestAccess = async () => {
  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/access-requests',
    payload: {
      teamId,
      planId: nextPlanId,
      name: 'Requested',
      reason: '  Need partner access  ',
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
};
const decide = (
  id: string,
  decision = 'approve',
  note = ' Approved <script> ',
) =>
  server.inject({
    method: 'POST',
    url: `/api/v1/admin/access-requests/${id}/${decision}`,
    payload: { note },
  });
it('creates a request without Kong, serializes concurrent approvals, then reveals the first key', async () => {
  await connection.db
    .update(plans)
    .set({ requiresApproval: true })
    .where(eq(plans.id, nextPlanId));
  const pending = await requestAccess();
  expect(pending.reason).toBe('Need partner access');
  expect(adapter.ensureConsumer).not.toHaveBeenCalled();
  role = 'admin';
  const results = await Promise.all([decide(pending.id), decide(pending.id)]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const approved = results.find((r) => r.statusCode === 200)!.json();
  expect(approved.decision.note).toBe('Approved <script>');
  expect(adapter.issueCredential).not.toHaveBeenCalled();
  expect(
    enqueue.mock.calls.filter(([p]) => p.template === 'access-approved'),
  ).toHaveLength(1);
  const detail = await server.inject({
    url: `/api/v1/apps/${approved.app.id}`,
  });
  expect(detail.json()).toMatchObject({
    origin: 'request',
    keyIssued: false,
    status: 'active',
    pendingRequest: null,
    credentials: [],
  });
  role = 'developer';
  const key = await server.inject({
    method: 'POST',
    url: `/api/v1/apps/${approved.app.id}/credentials`,
  });
  expect(key.statusCode, key.body).toBe(201);
  expect(key.json().key).toBeTruthy();
  expect(
    (await server.inject({ url: `/api/v1/apps/${approved.app.id}` })).json()
      .keyIssued,
  ).toBe(true);
});
it('keeps the request pending and compensates when the gateway fails; retry succeeds', async () => {
  await connection.db
    .update(plans)
    .set({ requiresApproval: true })
    .where(eq(plans.id, nextPlanId));
  const pending = await requestAccess();
  role = 'admin';
  vi.mocked(adapter.applyPlanLimits).mockRejectedValueOnce(
    new GatewayUnavailableError(),
  );
  const failed = await decide(pending.id);
  expect(failed.statusCode).toBe(503);
  expect(adapter.deleteConsumer).toHaveBeenCalledOnce();
  expect(await connection.db.select().from(apps)).toEqual([]);
  expect((await connection.db.select().from(accessRequests))[0]!.status).toBe(
    'pending',
  );
  expect(enqueue).not.toHaveBeenCalled();
  expect((await decide(pending.id)).statusCode).toBe(200);
});
it('checks pending uniqueness, rejects with a required trimmed note and rechecks name collisions on approval', async () => {
  await connection.db
    .update(plans)
    .set({ requiresApproval: true })
    .where(eq(plans.id, nextPlanId));
  const pending = await requestAccess();
  const duplicate = await server.inject({
    method: 'POST',
    url: '/api/v1/access-requests',
    payload: { teamId, planId: nextPlanId, name: 'Other', reason: 'Please' },
  });
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json().type).toBe('/problems/request-pending');
  await connection.db
    .insert(apps)
    .values({ id: uuidv7(), teamId, planId, name: 'Requested' });
  role = 'admin';
  expect((await decide(pending.id)).json().type).toBe(
    '/problems/app-name-taken',
  );
  expect((await decide(pending.id, 'reject', '  ')).statusCode).toBe(400);
  const rejected = await decide(
    pending.id,
    'reject',
    '  Ask your team admin  ',
  );
  expect(rejected.json().decision.note).toBe('Ask your team admin');
  expect(adapter.ensureConsumer).not.toHaveBeenCalled();
  const filtered = await server.inject({
    url: `/api/v1/access-requests?teamId=${teamId}&status=pending`,
  });
  expect(filtered.json().items).toEqual([]);
});
it('keeps the old plan and key during a plan-change request; rejection and cancellation close it', async () => {
  const { app, credential } = await subscribe();
  await connection.db
    .update(plans)
    .set({ requiresApproval: true })
    .where(eq(plans.id, nextPlanId));
  vi.clearAllMocks();
  const changed = await server.inject({
    method: 'PUT',
    url: `/api/v1/apps/${app.id}/plan`,
    payload: { planId: nextPlanId, reason: ' More capacity ' },
  });
  expect(changed.statusCode, changed.body).toBe(202);
  expect(adapter.applyPlanLimits).not.toHaveBeenCalled();
  expect(
    (await server.inject({ url: `/api/v1/apps/${app.id}` })).json(),
  ).toMatchObject({
    plan: { id: planId },
    pendingRequest: { id: changed.json().id },
    credentials: [{ id: credential.id }],
  });
  role = 'admin';
  expect((await decide(changed.json().id, 'reject', 'No')).statusCode).toBe(
    200,
  );
  role = 'developer';
  const again = await server.inject({
    method: 'PUT',
    url: `/api/v1/apps/${app.id}/plan`,
    payload: { planId: nextPlanId, reason: ' More capacity ' },
  });
  expect(again.statusCode).toBe(202);
  expect(
    (await server.inject({ method: 'DELETE', url: `/api/v1/apps/${app.id}` }))
      .statusCode,
  ).toBe(204);
  const [closed] = await connection.db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, again.json().id));
  expect(closed).toMatchObject({
    status: 'rejected',
    decidedBy: null,
    appId: null,
    decisionNote: 'This subscription was cancelled.',
  });
});
it('approves a plan change using the existing limits/grants routine without issuing another key', async () => {
  const { app, credential } = await subscribe();
  await connection.db
    .update(plans)
    .set({ requiresApproval: true })
    .where(eq(plans.id, nextPlanId));
  const changed = await server.inject({
    method: 'PUT',
    url: `/api/v1/apps/${app.id}/plan`,
    payload: { planId: nextPlanId, reason: 'More capacity' },
  });
  vi.clearAllMocks();
  role = 'admin';
  expect((await decide(changed.json().id)).statusCode).toBe(200);
  expect(adapter.applyPlanLimits).toHaveBeenCalledWith(
    { id: app.id },
    { rate: { unit: 'minute', limit: 10 }, monthlyQuota: 100 },
  );
  expect(adapter.issueCredential).not.toHaveBeenCalled();
  expect(
    (await server.inject({ url: `/api/v1/apps/${app.id}` })).json(),
  ).toMatchObject({
    plan: { id: nextPlanId },
    pendingRequest: null,
    credentials: [{ id: credential.id }],
  });
});
it('saves a restriction atomically, closes invisible pending requests, retries partial revocation and never resurrects', async () => {
  const first = await subscribe();
  const second = await subscribe();
  await connection.db
    .update(plans)
    .set({ requiresApproval: true })
    .where(eq(plans.id, nextPlanId));
  await requestAccess();
  const outsiderTeam = uuidv7();
  await connection.db
    .insert(teams)
    .values({ id: outsiderTeam, name: 'Insider' });
  role = 'admin';
  const url = `/api/v1/admin/products/${productId}/access`;
  const payload = { visibility: 'internal', teamIds: [outsiderTeam] };
  const confirmation = await server.inject({ method: 'PUT', url, payload });
  expect(confirmation.statusCode).toBe(409);
  expect(confirmation.json()).toMatchObject({
    affectedTeams: 1,
    affectedSubscriptions: 2,
  });
  expect((await connection.db.select().from(products))[0]!.visibility).toBe(
    'open',
  );
  vi.mocked(adapter.deleteConsumer).mockRejectedValueOnce(
    new GatewayUnavailableError(),
  );
  const saved = await server.inject({
    method: 'PUT',
    url,
    payload: { ...payload, existingSubscriptions: 'revoke' },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  expect(saved.json().revocation).toEqual({ revoked: 1, pending: 1 });
  expect((await connection.db.select().from(accessRequests))[0]).toMatchObject({
    status: 'rejected',
    decidedBy: null,
    decisionNote: 'This product is no longer available to your team.',
  });
  const conn = gatewayConnection(
    connection.db,
    loadConfig({ DATABASE_URL: container.getConnectionUri() }),
    uuidv7(),
    server.log,
    () => adapter,
  );
  const ids = [first.app.id, second.app.id];
  await revokeApps(connection.db, conn, ids, enqueue);
  await revokeApps(connection.db, conn, ids, enqueue);
  expect(
    enqueue.mock.calls.filter(([p]) => p.template === 'subscription-revoked'),
  ).toHaveLength(2);
  await reconcile(connection.db, conn, server.log, enqueue);
  expect(adapter.applyAccessPolicy).toHaveBeenLastCalledWith(
    expect.objectContaining({ apps: [] }),
  );
  const refused = await server.inject({
    method: 'POST',
    url: `/api/v1/apps/${first.app.id}/credentials`,
  });
  expect(refused.statusCode).toBe(409);
});
it('Manual assignments provide visibility and no key until reveal; cancelling emails the team', async () => {
  await connection.db.update(products).set({ visibility: 'manual' });
  expect(
    (await server.inject({ url: '/api/v1/products/product' })).statusCode,
  ).toBe(404);
  role = 'admin';
  const assigned = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/subscriptions',
    payload: { teamId, planId, name: 'Assigned' },
  });
  expect(assigned.statusCode, assigned.body).toBe(201);
  expect(assigned.json()).toMatchObject({
    keyIssued: false,
    origin: 'admin',
    credentials: [],
  });
  role = 'developer';
  const product = await server.inject({ url: '/api/v1/products/product' });
  expect(product.statusCode).toBe(200);
  expect(product.json().selfService).toBe(false);
  const self = await server.inject({
    method: 'POST',
    url: '/api/v1/apps',
    payload: { teamId, planId, name: 'Self' },
  });
  expect(self.json().type).toBe('/problems/admin-assigned-only');
  expect(
    (
      await server.inject({
        method: 'DELETE',
        url: `/api/v1/apps/${assigned.json().id}`,
      })
    ).statusCode,
  ).toBe(204);
  expect(
    enqueue.mock.calls.filter(([p]) => p.template === 'subscription-revoked'),
  ).toHaveLength(1);
  expect(
    (await server.inject({ url: '/api/v1/products/product' })).statusCode,
  ).toBe(404);
});
it('approval flag confirmation excludes admin-created subscriptions and keep leaves keys active', async () => {
  await subscribe();
  role = 'admin';
  const url = `/api/v1/admin/products/${productId}/plans/${planId}`;
  const payload = {
    name: 'Free',
    rateLimit: 5,
    rateLimitUnit: 'second',
    monthlyQuota: 10,
    apiIds: [apiId],
    requiresApproval: true,
  };
  expect(
    (await server.inject({ method: 'PUT', url, payload })).statusCode,
  ).toBe(409);
  expect(
    (
      await server.inject({
        method: 'PUT',
        url,
        payload: { ...payload, existingSubscriptions: 'keep' },
      })
    ).statusCode,
  ).toBe(200);
  expect((await connection.db.select().from(apps))[0]!.status).toBe('active');
  expect(adapter.deleteConsumer).not.toHaveBeenCalled();
});
it('filters every public API surface and denies admin routes before reading target ids', async () => {
  await connection.db.update(products).set({ visibility: 'hidden' });
  signedIn = false;
  for (const url of [
    '/api/v1/products/product',
    `/api/v1/apis/api-${apiId}`,
    `/api/v1/apis/api-${apiId}/openapi.json`,
    `/api/v1/apis/api-${apiId}/changelog`,
    `/api/v1/apis/api-${apiId}/versions/1/openapi.json`,
    `/api/v1/try-it?scalar_url=${encodeURIComponent('http://kong/' + apiId)}`,
  ])
    expect((await server.inject({ url })).statusCode, url).toBe(404);
  expect(
    (await server.inject({ url: '/api/v1/products' })).json().items,
  ).toEqual([]);
  expect((await server.inject({ url: '/api/v1/apis' })).json().items).toEqual(
    [],
  );
  signedIn = true;
  for (const [method, url] of [
    ['GET', '/api/v1/admin/access-requests'],
    ['POST', `/api/v1/admin/access-requests/${uuidv7()}/approve`],
    ['POST', `/api/v1/admin/access-requests/${uuidv7()}/reject`],
    ['GET', `/api/v1/admin/products/${productId}/access`],
    ['PUT', `/api/v1/admin/products/${productId}/access`],
    ['GET', '/api/v1/admin/teams'],
    ['POST', '/api/v1/admin/subscriptions'],
  ] as const)
    expect((await server.inject({ method, url })).statusCode, url).toBe(403);
});
it('escapes decision notes in HTML email and never includes an API key', () => {
  const rendered = renderMail('access-approved', {
    name: 'User',
    email: 'user@example.com',
    link: 'https://portal/apps/1',
    portalUrl: 'https://portal',
    productName: 'Partner',
    planName: 'Free',
    appName: 'Prod',
    note: '<script>alert(1)</script>',
  });
  expect(rendered.html).toContain('&lt;script&gt;');
  expect(rendered.html).not.toContain('<script>');
  expect(rendered.text).toContain('<script>alert(1)</script>');
});

it('searches teams by any member email with the contract limits', async () => {
  role = 'admin';
  const found = await server.inject({
    url: '/api/v1/admin/teams?q=admin%40example.com',
  });
  expect(found.statusCode, found.body).toBe(200);
  expect(found.json().items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: teamId,
        personal: false,
        ownerEmail: null,
        memberCount: 1,
      }),
    ]),
  );
  expect(
    (await server.inject({ url: '/api/v1/admin/teams?limit=51' })).statusCode,
  ).toBe(400);
});
