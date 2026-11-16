// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { eq, ne, and, asc, desc, inArray, sql } from 'drizzle-orm';
import {
  apps,
  accessRequests,
  apis,
  apiVersions,
  products,
  plans,
  planApis,
  productApis,
  BUILTIN_PLAN_ID,
  credentials,
  gatewayConsumers,
  user as users,
  type Database,
} from '@portal/db';
import type { GatewayAdapter } from '@portal/adapter-sdk';
import {
  requireEnabled,
  requireGateway,
  type GatewayConnection,
} from './gateway-connection.js';
import { requireUser, type Auth } from './auth.js';
import { Problem, notFound } from './problem.js';
import { requireVerified } from './verified.js';
import {
  ensurePersonalTeam,
  currentTeamId,
  teamAccess,
  appAccess,
  type TeamRole,
} from './teams.js';
import { appApis, appPlan, planLimits } from './app-plans.js';
import { canSeeApi, teamViewer, visibleProductIds } from './access-policy.js';
import { requireSelfService, reasonSchema } from './access-requests.js';
import {
  pendingRequest,
  createPlanRequest,
  requestConflict,
} from './access-request-model.js';
import {
  provisionApp,
  applyAppPlan,
  compensate,
  type Compensations,
} from './app-provisioning.js';
import type { EnqueueMail } from './mail/queue.js';
import { generateKey } from './crypto.js';
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const createSchema = z
  .strictObject({
    name: z.string().min(1).max(80),
    teamId: z.uuid().optional(),
    description: z.string().max(500).optional(),
    apiIds: z
      .array(z.uuid())
      .min(1)
      .max(10)
      .refine((v) => new Set(v).size === v.length, 'API IDs must be unique')
      .optional(),
    planId: z.uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.apiIds) === Boolean(v.planId))
      ctx.addIssue({
        code: 'custom',
        path: [v.apiIds && v.planId ? 'planId' : 'apiIds'],
        message: 'Send exactly one of apiIds or planId.',
      });
  });
const appParams = z.object({ appId: z.uuid() });
function credentialView(c: typeof credentials.$inferSelect) {
  return {
    id: c.id,
    kind: c.kind as 'api-key',
    keyHint: c.keyHint,
    status: c.status as 'active' | 'revoked',
    createdAt: c.createdAt.toISOString(),
    revokedAt: c.revokedAt?.toISOString() ?? null,
  };
}
export async function appView(
  db: Database | Tx,
  app: typeof apps.$inferSelect,
  role: TeamRole,
) {
  const [subs, keys] = await Promise.all([
    appApis(db, app),
    db
      .select()
      .from(credentials)
      .where(eq(credentials.appId, app.id))
      .orderBy(desc(credentials.createdAt)),
  ]);
  return {
    status: app.status,
    origin: app.origin,
    keyIssued: app.keyIssued,
    revokedAt: app.revokedAt?.toISOString() ?? null,
    pendingRequest: await pendingRequest(db, app.id),
    id: app.id,
    teamId: app.teamId,
    role,
    name: app.name,
    description: app.description,
    plan: await appPlan(db, app.planId),
    subscriptions: subs.map(({ apiId, slug, title }) => ({
      apiId,
      slug,
      title,
    })),
    credentials: keys.map(credentialView),
    createdAt: app.createdAt.toISOString(),
  };
}
export function registerApps(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  connection: GatewayConnection,
  enqueue: EnqueueMail,
) {
  server.get('/api/v1/apps', async (request) => {
    const user = await requireUser(auth, request);
    await db.transaction((tx) => ensurePersonalTeam(tx, user.id));
    const query = z
      .object({ teamId: z.uuid().optional() })
      .parse(request.query);
    const teamId = query.teamId ?? (await currentTeamId(db, user.id));
    const membership = await teamAccess(db, teamId, user.id);
    const rows = await db
      .select()
      .from(apps)
      .where(eq(apps.teamId, teamId))
      .orderBy(desc(apps.createdAt));
    return {
      items: await Promise.all(
        rows.map((a) => appView(db, a, membership.role)),
      ),
    };
  });
  server.get('/api/v1/apps/:appId', async (request) => {
    const user = await requireUser(auth, request);
    const { appId } = appParams.parse(request.params);
    const { app, role } = await appAccess(db, appId, user.id);
    return appView(db, app, role);
  });
  server.post('/api/v1/apps', async (request, reply) => {
    const user = await requireUser(auth, request);
    await db.transaction((tx) => ensurePersonalTeam(tx, user.id));
    const target = z
      .object({
        teamId: z.uuid().optional(),
        planId: z.uuid().optional(),
        apiIds: z.unknown().optional(),
      })
      .parse(request.body);
    const appId = uuidv7(),
      id = uuidv7(),
      key = generateKey();
    const rollback: Compensations = [];
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
        const [owner] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, user.id))
          .for('key share');
        if (!owner) throw notFound();
        const teamId = target.teamId ?? (await currentTeamId(tx, user.id));
        const membership = await teamAccess(tx, teamId, user.id, 'write');
        await requireVerified(tx, user);
        // Reject mixed API/plan input before resolving its plan, while keeping
        // plan-only requests' visibility checks ahead of their other validation.
        const apiInput =
          target.apiIds === undefined
            ? undefined
            : createSchema.parse(request.body);
        const [plan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, target.planId ?? BUILTIN_PLAN_ID))
          .for('share');
        if (!plan || (target.planId && plan.builtin)) throw notFound();
        await requireSelfService(
          tx,
          plan.productId,
          teamId,
          user.id,
          user.role === 'admin',
        );
        const input = apiInput ?? createSchema.parse(request.body);
        if (plan.requiresApproval)
          throw new Problem(
            409,
            'approval-required',
            'Request access to this plan.',
          );
        // Serialize names before gateway writes, including simultaneous identical submissions.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${teamId + ':' + input.name},0))`,
        );
        const [duplicate] = await tx
          .select({ id: apps.id })
          .from(apps)
          .where(
            and(
              eq(apps.teamId, teamId),
              eq(apps.name, input.name),
              ne(apps.status, 'revoked'),
            ),
          );
        if (duplicate)
          throw new Problem(
            409,
            'app-name-taken',
            'This team already has an app with this name.',
          );

        const apiIds =
          input.apiIds ??
          (
            await tx.select().from(planApis).where(eq(planApis.planId, plan.id))
          ).map((a) => a.apiId);
        const selected = await tx
          .select()
          .from(apis)
          .where(inArray(apis.id, apiIds));
        if (selected.length !== apiIds.length) throw notFound();
        const viewer = await teamViewer(
          tx,
          [teamId],
          user.id,
          user.role === 'admin',
        );
        for (const apiId of apiIds)
          if (!(await canSeeApi(tx, viewer, apiId))) throw notFound();
        if (input.apiIds) {
          // Membership blocks direct access regardless of visibility; only visible
          // products can appear in the refusal after every API passed canSeeApi.
          const memberships = await tx
            .select({
              apiId: productApis.apiId,
              productId: productApis.productId,
            })
            .from(productApis)
            .where(inArray(productApis.apiId, apiIds));
          if (memberships.length) {
            const visible = await tx
              .select({
                id: products.id,
                slug: products.slug,
                name: products.name,
              })
              .from(products)
              .where(
                and(
                  inArray(
                    products.id,
                    memberships.map((m) => m.productId),
                  ),
                  visibleProductIds(tx, viewer),
                ),
              )
              .orderBy(asc(products.name), asc(products.id));
            const versions = await tx
              .select({ apiId: apis.id, title: apiVersions.title })
              .from(apis)
              .innerJoin(apiVersions, eq(apiVersions.id, apis.latestVersionId))
              .where(inArray(apis.id, apiIds));
            const errors = apiIds.flatMap((apiId, index) => {
              const links = memberships.filter((m) => m.apiId === apiId);
              if (!links.length) return [];
              const title =
                versions.find((v) => v.apiId === apiId)?.title ??
                selected.find((a) => a.id === apiId)!.slug;
              const names = visible
                .filter((p) => links.some((m) => m.productId === p.id))
                .map((p) => p.name)
                .join(', ');
              return [
                {
                  pointer: `/apiIds/${index}`,
                  message: `${title} is in ${names}.`,
                },
              ];
            });
            throw new Problem(
              409,
              'api-in-product',
              `${errors.map((e) => e.message).join(' ')} Subscribe to ${visible.map((p) => p.name).join(', ')} instead.`,
              errors,
              { products: visible },
            );
          }
        }
        const app = await provisionApp(
          tx,
          connection,
          {
            id: appId,
            planId: plan.id,
            teamId,
            name: input.name,
            description: input.description,
            createdBy: user.id,
            origin: 'self',
            apiIds: input.apiIds,
          },
          rollback,
        );
        const { adapter, row: gateway } = requireEnabled(
          await connection.load(tx),
        );
        const gatewayId = gateway.id;
        await adapter.issueCredential({ id: appId }, { id, key });
        const [credential] = await tx
          .insert(credentials)
          .values({
            id,
            appId,
            gatewayId,
            createdBy: user.id,
            keyHint: key.slice(-4),
            status: 'active',
          })
          .returning();
        if (!credential) throw new Error('Insert failed');
        return {
          app: await appView(tx, app, membership.role),
          credential: {
            ...credentialView(credential),
            key,
            headerName: 'apikey',
          },
        };
      });
      return reply
        .code(201)
        .header('Location', `/api/v1/apps/${appId}`)
        .send(result);
    } catch (error) {
      await compensate(rollback, server.log);
      throw error;
    }
  });
  server.post('/api/v1/apps/:appId/credentials', async (request, reply) => {
    const user = await requireUser(auth, request);
    const { appId } = appParams.parse(request.params);
    const id = uuidv7(),
      key = generateKey();
    let attempted = false;
    let adapter: GatewayAdapter | undefined;
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
        const { app } = await appAccess(tx, appId, user.id, 'write');
        if (app.status !== 'active')
          throw new Problem(
            409,
            'app-revoked',
            'This subscription has been revoked.',
          );
        const [plan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, app.planId));
        if (!plan) throw notFound();
        await requireVerified(tx, user);
        const active = await tx
          .select({ id: credentials.id })
          .from(credentials)
          .where(
            and(eq(credentials.appId, appId), eq(credentials.status, 'active')),
          );
        if (active.length >= (plan.builtin ? 5 : 1))
          throw new Problem(
            409,
            'credential-limit',
            'This app has reached its active key limit. Revoke one before creating another.',
          );
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
        const gateway = requireEnabled(await connection.load(tx));
        adapter = gateway.adapter;
        const gatewayId = gateway.row.id;
        attempted = true;
        const consumer = await adapter.ensureConsumer({ id: appId });
        const services = await appApis(tx, app);
        for (const serviceId of new Set(
          services.map((s) => s.gatewayServiceId),
        ))
          await adapter.grantAccess({ id: appId }, { id: serviceId });
        if (!plan.builtin)
          await adapter.applyPlanLimits({ id: appId }, planLimits(plan));
        await tx
          .insert(gatewayConsumers)
          .values({
            id: uuidv7(),
            appId,
            gatewayId,
            externalId: consumer.id,
            username: consumer.username,
          })
          .onConflictDoUpdate({
            target: [gatewayConsumers.appId, gatewayConsumers.gatewayId],
            set: { externalId: consumer.id, username: consumer.username },
          });
        await adapter.issueCredential({ id: appId }, { id, key });
        const [credential] = await tx
          .insert(credentials)
          .values({
            id,
            appId,
            gatewayId,
            createdBy: user.id,
            keyHint: key.slice(-4),
            status: 'active',
          })
          .returning();
        if (!credential) throw new Error('Insert failed');
        await tx
          .update(apps)
          .set({ keyIssued: true })
          .where(eq(apps.id, appId));
        return { ...credentialView(credential), key, headerName: 'apikey' };
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (attempted && adapter)
        await adapter
          .revokeCredential({ id: appId }, id)
          .catch(() =>
            server.log.warn(
              { appId, credentialId: id },
              'Credential compensation deferred to reconcile',
            ),
          );
      throw error;
    }
  });
  server.delete(
    '/api/v1/apps/:appId/credentials/:credentialId',
    async (request, reply) => {
      const user = await requireUser(auth, request);
      const { appId, credentialId } = appParams
        .extend({ credentialId: z.uuid() })
        .parse(request.params);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
        await appAccess(tx, appId, user.id, 'write');
        const [credential] = await tx
          .select()
          .from(credentials)
          .where(
            and(eq(credentials.appId, appId), eq(credentials.id, credentialId)),
          );
        if (!credential) throw notFound();
        if (credential.status === 'revoked') return;
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
        const { adapter } = requireGateway(await connection.load(tx));
        await adapter.revokeCredential({ id: appId }, credentialId);
        await tx
          .update(credentials)
          .set({ status: 'revoked', revokedAt: new Date() })
          .where(eq(credentials.id, credentialId));
      });
      return reply.code(204).send();
    },
  );
  server.put('/api/v1/apps/:appId/plan', async (request, reply) => {
    const user = await requireUser(auth, request);
    const { appId } = appParams.parse(request.params);
    const { planId } = z.object({ planId: z.uuid() }).parse(request.body);
    const rollback: Compensations = [];
    let pending = false;
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
        const { app, role } = await appAccess(tx, appId, user.id, 'write');
        await requireVerified(tx, user);
        const [oldPlan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, app.planId))
          .for('share');
        const [newPlan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, planId))
          .for('share');
        if (!newPlan) throw notFound();
        await requireSelfService(
          tx,
          newPlan.productId,
          app.teamId,
          user.id,
          user.role === 'admin',
        );
        const input = z
          .strictObject({ planId: z.uuid(), reason: reasonSchema.optional() })
          .parse(request.body);
        if (app.status !== 'active')
          throw new Problem(
            409,
            'app-revoked',
            'This subscription has been revoked.',
          );
        if (
          !oldPlan ||
          oldPlan.builtin ||
          newPlan.builtin ||
          oldPlan.productId !== newPlan.productId
        )
          throw new Problem(
            400,
            'validation',
            'Choose a plan of this subscription’s product.',
            [{ pointer: '/planId', message: 'Choose a plan of this product.' }],
          );
        if (await pendingRequest(tx, app.id))
          throw new Problem(
            409,
            'request-pending',
            'A plan change is already pending.',
          );
        if (newPlan.requiresApproval) {
          const reason = reasonSchema.parse(input.reason);
          pending = true;
          return createPlanRequest(tx, app, newPlan.id, reason, user.id);
        }
        return appView(
          tx,
          await applyAppPlan(tx, connection, app, newPlan, rollback),
          role,
        );
      });
      return reply.code(pending ? 202 : 200).send(result);
    } catch (e) {
      await compensate(rollback, server.log);
      requestConflict(e);
    }
  });
  server.delete('/api/v1/apps/:appId', async (request, reply) => {
    const user = await requireUser(auth, request);
    const { appId } = appParams.parse(request.params);
    const closed: string[] = [];
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
      await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
      const { app } = await appAccess(tx, appId, user.id, 'write');
      if (app.status === 'revoke-pending')
        throw new Problem(
          409,
          'revoke-pending',
          'Revocation is still being retried.',
        );
      if (app.status !== 'revoked') {
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
        const { adapter } = requireEnabled(await connection.load(tx));
        await adapter.deleteConsumer({ id: appId });
      }
      const requests = await tx
        .update(accessRequests)
        .set({
          status: 'rejected',
          decidedAt: new Date(),
          decidedBy: null,
          decisionNote: 'This subscription was cancelled.',
        })
        .where(
          and(
            eq(accessRequests.appId, appId),
            eq(accessRequests.status, 'pending'),
          ),
        )
        .returning();
      closed.push(...requests.map((r) => r.id));
      for (const requestId of closed)
        await enqueue({ template: 'access-rejected', requestId }, tx);
      if (app.origin === 'admin' && app.status !== 'revoked') {
        await tx
          .update(apps)
          .set({ status: 'revoked', revokedAt: new Date() })
          .where(eq(apps.id, appId));
        await tx
          .update(credentials)
          .set({ status: 'revoked', revokedAt: new Date() })
          .where(eq(credentials.appId, appId));
        await enqueue({ template: 'subscription-revoked', appId }, tx);
      } else await tx.delete(apps).where(eq(apps.id, appId));
    });
    return reply.code(204).send();
  });
  server.post(
    '/api/v1/apps/:appId/credentials/:credentialId/regenerate',
    async (request, reply) => {
      const user = await requireUser(auth, request);
      const { appId, credentialId } = appParams
        .extend({ credentialId: z.uuid() })
        .parse(request.params);
      const id = uuidv7(),
        key = generateKey();
      let adapter: GatewayAdapter | undefined;
      let attempted = false;
      try {
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
          await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
          const { app } = await appAccess(tx, appId, user.id, 'write');
          if (app.status !== 'active')
            throw new Problem(
              409,
              'app-revoked',
              'This subscription has been revoked.',
            );
          await requireVerified(tx, user);
          const [old] = await tx
            .select()
            .from(credentials)
            .where(
              and(
                eq(credentials.id, credentialId),
                eq(credentials.appId, appId),
              ),
            );
          if (!old) throw notFound();
          if (old.status !== 'active')
            throw new Problem(
              409,
              'credential-revoked',
              'This key has already been revoked.',
            );
          await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
          const gateway = requireEnabled(await connection.load(tx));
          adapter = gateway.adapter;
          await adapter.ensureConsumer({ id: appId });
          attempted = true;
          await adapter.issueCredential({ id: appId }, { id, key });
          await adapter.revokeCredential({ id: appId }, credentialId);
          const [row] = await tx
            .insert(credentials)
            .values({
              id,
              appId,
              gatewayId: gateway.row.id,
              createdBy: user.id,
              keyHint: key.slice(-4),
              status: 'active',
            })
            .returning();
          await tx
            .update(credentials)
            .set({ status: 'revoked', revokedAt: new Date() })
            .where(eq(credentials.id, credentialId));
          return { ...credentialView(row!), key, headerName: 'apikey' };
        });
        return reply.code(201).send(result);
      } catch (e) {
        if (attempted && adapter)
          await adapter
            .revokeCredential({ id: appId }, id)
            .catch(() =>
              server.log.warn(
                { appId, credentialId: id },
                'Credential compensation deferred to reconcile',
              ),
            );
        throw e;
      }
    },
  );
}
