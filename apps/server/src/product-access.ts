// SPDX-License-Identifier: Apache-2.0
import {
  products,
  productTeams,
  teams,
  teamMembers,
  user,
  apps,
  plans,
  type Database,
} from '@portal/db';
import { and, asc, eq, inArray, ilike, or, sql, exists } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireUser, type Auth } from './auth.js';
import { affectedSubscriptions } from './access-policy.js';
import { closeInvisibleRequests } from './access-requests.js';
import {
  prepareApp,
  applyAppToGateway,
  commitApp,
  runGatewayPhase,
} from './app-provisioning.js';
import { appView } from './apps.js';
import {
  markRevocations,
  revokeApps,
  type EnqueueRevocation,
} from './revocation.js';
import type { GatewayConnection } from './gateway-connection.js';
import type { EnqueueMail } from './mail/queue.js';
import type { Db } from './app-plans.js';
import { Problem, notFound } from './problem.js';
const choice = z.enum(['keep', 'revoke']);
export async function productSubscriptions(
  db: Db,
  productId: string,
  planId?: string,
) {
  return db
    .select({
      app: apps,
      team: { id: teams.id, name: teams.name },
      plan: { id: plans.id, name: plans.name },
    })
    .from(apps)
    .innerJoin(plans, eq(plans.id, apps.planId))
    .innerJoin(teams, eq(teams.id, apps.teamId))
    .where(
      and(
        eq(plans.productId, productId),
        planId ? eq(plans.id, planId) : undefined,
      ),
    )
    .orderBy(asc(teams.name));
}
export function confirmSubscriptions(
  rows: Awaited<ReturnType<typeof productSubscriptions>>,
  selected?: 'keep' | 'revoke',
) {
  if (rows.length && !selected)
    throw new Problem(
      409,
      'confirmation-required',
      'Choose whether existing subscriptions keep working or are revoked.',
      undefined,
      {
        affectedTeams: new Set(rows.map((r) => r.team.id)).size,
        affectedSubscriptions: rows.length,
      },
    );
}
async function accessView(
  db: Db,
  productId: string,
  revocation = { revoked: 0, pending: 0 },
) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId));
  if (!product) throw notFound();
  const named = await db
    .select({ id: teams.id, name: teams.name, owner: teams.personalOwnerId })
    .from(productTeams)
    .innerJoin(teams, eq(teams.id, productTeams.teamId))
    .where(eq(productTeams.productId, productId))
    .orderBy(asc(teams.name));
  const rows = await productSubscriptions(db, productId);
  return {
    productId,
    visibility: product.visibility,
    teams: named.map((t) => ({ id: t.id, name: t.name, personal: !!t.owner })),
    subscriptions: rows
      .filter(
        (r) =>
          r.app.status !== 'revoked' ||
          (r.app.revokedAt &&
            r.app.revokedAt.getTime() >= Date.now() - 30 * 86400000),
      )
      .map(({ app, team, plan }) => ({
        appId: app.id,
        name: app.name,
        status: app.status,
        origin: app.origin,
        team,
        plan,
      })),
    revocation,
  };
}
export function registerProductAccess(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  connection: GatewayConnection,
  enqueue: EnqueueMail,
  enqueueRevocation: EnqueueRevocation,
) {
  server.get('/api/v1/admin/products/:productId/access', async (request) => {
    await requireUser(auth, request, true);
    const { productId } = z
      .object({ productId: z.uuid() })
      .parse(request.params);
    return accessView(db, productId);
  });
  server.put('/api/v1/admin/products/:productId/access', async (request) => {
    await requireUser(auth, request, true);
    const { productId } = z
      .object({ productId: z.uuid() })
      .parse(request.params);
    const input = z
      .strictObject({
        visibility: z.enum(['open', 'hidden', 'internal', 'manual']),
        teamIds: z
          .array(z.uuid())
          .min(1)
          .max(200)
          .refine((v) => new Set(v).size === v.length)
          .optional(),
        existingSubscriptions: choice.optional(),
      })
      .superRefine((v, ctx) => {
        if ((v.visibility === 'internal') !== !!v.teamIds)
          ctx.addIssue({
            code: 'custom',
            path: ['teamIds'],
            message: 'Named teams are required only for Internal visibility.',
          });
      })
      .parse(request.body);
    let revokeIds: string[] = [];
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .for('update');
      if (!product) throw notFound();
      const oldNamed = await tx
        .select()
        .from(productTeams)
        .where(eq(productTeams.productId, productId));
      if (input.teamIds) {
        const found = await tx
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.id, input.teamIds));
        const missing = input.teamIds.findIndex(
          (id) => !found.some((team) => team.id === id),
        );
        if (missing !== -1)
          throw new Problem(404, 'not-found', 'A named team was not found.', [
            { pointer: `/teamIds/${missing}`, message: 'Team not found.' },
          ]);
      }
      const changed =
        product.visibility !== input.visibility ||
        (input.visibility === 'internal' &&
          (oldNamed.length !== input.teamIds!.length ||
            oldNamed.some((t) => !input.teamIds!.includes(t.teamId))));
      const rows = await productSubscriptions(tx, productId);
      const restricting =
        changed &&
        (product.visibility === 'open' ||
          (product.visibility === 'manual' &&
            input.visibility === 'internal') ||
          (product.visibility === 'hidden' &&
            ['internal', 'manual'].includes(input.visibility)) ||
          (product.visibility === 'internal' &&
            (input.visibility === 'manual' ||
              (input.visibility === 'internal' &&
                oldNamed.some((t) => !input.teamIds!.includes(t.teamId))))));
      const affected =
        restricting && input.visibility !== 'open'
          ? affectedSubscriptions(
              rows.map((r) => r.app),
              input.visibility === 'internal' ? input.teamIds : [],
            )
          : [];
      const affectedRows = rows.filter((r) =>
        affected.some((a) => a.id === r.app.id),
      );
      confirmSubscriptions(affectedRows, input.existingSubscriptions);
      await tx
        .update(products)
        .set({ visibility: input.visibility, updatedAt: new Date() })
        .where(eq(products.id, productId));
      await tx
        .delete(productTeams)
        .where(eq(productTeams.productId, productId));
      if (input.visibility === 'internal')
        await tx
          .insert(productTeams)
          .values(input.teamIds!.map((teamId) => ({ productId, teamId })));
      if (input.existingSubscriptions === 'revoke') {
        revokeIds = affected.map((a) => a.id);
        await markRevocations(tx, revokeIds, 'visibility');
      }
      const closed = await closeInvisibleRequests(tx, productId);
      for (const requestId of closed)
        await enqueue({ template: 'access-rejected', requestId }, tx);
      if (revokeIds.length) await enqueueRevocation(revokeIds, tx);
      return closed;
    });
    const result = await revokeApps(
      db,
      connection,
      revokeIds,
      enqueue,
      server.log,
    );
    const pending = await db
      .select({ id: apps.id })
      .from(apps)
      .innerJoin(plans, eq(plans.id, apps.planId))
      .where(
        and(eq(plans.productId, productId), eq(apps.status, 'revoke-pending')),
      );
    return accessView(db, productId, { ...result, pending: pending.length });
  });
  server.get('/api/v1/admin/teams', async (request) => {
    await requireUser(auth, request, true);
    const { q, limit } = z
      .object({
        q: z.string().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(request.query);
    const rows = await db
      .select({
        team: teams,
        ownerEmail: user.email,
        memberCount: sql<number>`(select count(*)::int from ${teamMembers} where ${teamMembers.teamId} = ${teams.id})`,
      })
      .from(teams)
      .leftJoin(user, eq(user.id, teams.personalOwnerId))
      .where(
        q
          ? or(
              ilike(teams.name, `%${q}%`),
              exists(
                db
                  .select()
                  .from(teamMembers)
                  .innerJoin(user, eq(user.id, teamMembers.userId))
                  .where(
                    and(
                      eq(teamMembers.teamId, teams.id),
                      ilike(user.email, `%${q}%`),
                    ),
                  ),
              ),
            )
          : undefined,
      )
      .orderBy(asc(teams.name), asc(teams.id))
      .limit(limit);
    return {
      items: rows.map(({ team, ownerEmail, memberCount }) => ({
        id: team.id,
        name: team.name,
        personal: !!team.personalOwnerId,
        ownerEmail: ownerEmail ?? null,
        memberCount,
      })),
    };
  });
  server.post('/api/v1/admin/subscriptions', async (request, reply) => {
    const user = await requireUser(auth, request, true);
    const input = z
      .strictObject({
        planId: z.uuid(),
        teamId: z.uuid(),
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional(),
      })
      .parse(request.body);
    const assertSubscription = async (tx: Db) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId));
      if (!team) throw notFound();
      const [target] = await tx
        .select({ productId: plans.productId })
        .from(plans)
        .where(eq(plans.id, input.planId));
      if (!target?.productId) throw notFound();
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, target.productId))
        .for('update');
      if (!product) throw notFound();
      if (product.visibility === 'internal') {
        const [named] = await tx
          .select()
          .from(productTeams)
          .where(
            and(
              eq(productTeams.productId, product.id),
              eq(productTeams.teamId, input.teamId),
            ),
          );
        if (!named)
          throw new Problem(
            409,
            'team-not-named',
            'Add the team to this product first.',
          );
      }
    };
    const app = await runGatewayPhase(db, server.log, {
      prepare: () =>
        db.transaction(async (tx) => {
          await assertSubscription(tx);
          return prepareApp(tx, connection, {
            ...input,
            origin: 'admin',
            createdBy: user.id,
          });
        }),
      gateway: async (plan, rollback) => {
        plan.consumer = await applyAppToGateway(plan.adapter, plan, rollback);
      },
      commit: (plan) =>
        db.transaction(async (tx) => {
          await assertSubscription(tx);
          const created = await commitApp(tx, connection, plan);
          await enqueue(
            { template: 'subscription-assigned', appId: created.id },
            tx,
          );
          return created;
        }),
    });
    return reply.code(201).send(await appView(db, app, 'admin'));
  });
}
