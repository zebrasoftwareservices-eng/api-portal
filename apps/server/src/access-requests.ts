// SPDX-License-Identifier: Apache-2.0
import {
  accessRequests,
  plans,
  apps,
  products,
  type Database,
} from '@portal/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireUser, type Auth } from './auth.js';
import { ensurePersonalTeam, currentTeamId, teamAccess } from './teams.js';
import { requireVerified } from './verified.js';
import {
  canSelfSubscribe,
  productVisible,
  teamViewer,
} from './access-policy.js';
import {
  checkAppName,
  requestView,
  requestConflict,
} from './access-request-model.js';
import {
  applyAppPlan,
  provisionApp,
  compensate,
  type Compensations,
} from './app-provisioning.js';
import type { Db } from './app-plans.js';
import type { GatewayConnection } from './gateway-connection.js';
import type { EnqueueMail } from './mail/queue.js';
import { notFound, Problem } from './problem.js';
export const reasonSchema = z.string().trim().min(1).max(1000);
export async function requireSelfService(
  db: Db,
  productId: string | null,
  teamId: string,
  userId: string,
  admin = false,
) {
  if (!productId) return;
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId));
  if (
    !product ||
    !(await productVisible(
      db,
      await teamViewer(db, [teamId], userId, admin),
      productId,
    ))
  )
    throw notFound();
  if (!canSelfSubscribe(product))
    throw new Problem(
      403,
      'admin-assigned-only',
      'This product is assigned by an administrator.',
    );
}
export async function closeInvisibleRequests(db: Db, productId: string) {
  const pending = await db
    .select({ request: accessRequests })
    .from(accessRequests)
    .innerJoin(plans, eq(plans.id, accessRequests.planId))
    .where(
      and(eq(plans.productId, productId), eq(accessRequests.status, 'pending')),
    );
  const closed: string[] = [];
  for (const { request } of pending) {
    if (
      await productVisible(
        db,
        await teamViewer(db, [request.teamId]),
        productId,
      )
    )
      continue;
    const rows = await db
      .update(accessRequests)
      .set({
        status: 'rejected',
        decidedAt: new Date(),
        decidedBy: null,
        decisionNote: 'This product is no longer available to your team.',
      })
      .where(
        and(
          eq(accessRequests.id, request.id),
          eq(accessRequests.status, 'pending'),
        ),
      )
      .returning();
    if (rows.length) closed.push(request.id);
  }
  return closed;
}
export function registerAccessRequests(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  connection: GatewayConnection,
  enqueue: EnqueueMail,
) {
  server.get('/api/v1/access-requests', async (request) => {
    const user = await requireUser(auth, request);
    await db.transaction((tx) => ensurePersonalTeam(tx, user.id));
    const input = z
      .object({
        teamId: z.uuid().optional(),
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
      })
      .parse(request.query);
    const teamId = input.teamId ?? (await currentTeamId(db, user.id));
    await teamAccess(db, teamId, user.id);
    const rows = await db
      .select()
      .from(accessRequests)
      .where(
        and(
          eq(accessRequests.teamId, teamId),
          input.status ? eq(accessRequests.status, input.status) : undefined,
        ),
      )
      .orderBy(desc(accessRequests.submittedAt));
    return { items: await Promise.all(rows.map((r) => requestView(db, r))) };
  });
  server.post('/api/v1/access-requests', async (request, reply) => {
    const user = await requireUser(auth, request);
    await db.transaction((tx) => ensurePersonalTeam(tx, user.id));
    const target = z
      .object({ teamId: z.uuid().optional(), planId: z.uuid() })
      .parse(request.body);
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
        const teamId = target.teamId ?? (await currentTeamId(tx, user.id));
        await teamAccess(tx, teamId, user.id, 'write');
        await requireVerified(tx, user);
        const [plan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, target.planId))
          .for('share');
        if (!plan || !plan.productId) throw notFound();
        await requireSelfService(
          tx,
          plan.productId,
          teamId,
          user.id,
          user.role === 'admin',
        );
        const input = z
          .strictObject({
            planId: z.uuid(),
            teamId: z.uuid().optional(),
            name: z.string().min(1).max(80),
            description: z.string().max(500).optional(),
            reason: reasonSchema,
          })
          .parse(request.body);
        if (!plan.requiresApproval)
          throw new Problem(
            409,
            'approval-not-required',
            'This plan does not require approval.',
          );
        const [pending] = await tx
          .select()
          .from(accessRequests)
          .where(
            and(
              eq(accessRequests.teamId, teamId),
              eq(accessRequests.planId, plan.id),
              eq(accessRequests.kind, 'subscribe'),
              eq(accessRequests.status, 'pending'),
            ),
          );
        if (pending)
          throw new Problem(
            409,
            'request-pending',
            'A request is already pending.',
          );
        await checkAppName(tx, teamId, input.name);
        const [row] = await tx
          .insert(accessRequests)
          .values({
            id: uuidv7(),
            kind: 'subscribe',
            teamId,
            planId: plan.id,
            name: input.name,
            description: input.description,
            reason: input.reason,
            requestedBy: user.id,
          })
          .returning();
        return requestView(tx, row!);
      });
      return reply
        .code(201)
        .header('Location', `/api/v1/access-requests?teamId=${result.team.id}`)
        .send(result);
    } catch (e) {
      requestConflict(e);
    }
  });
  server.get('/api/v1/admin/access-requests', async (request) => {
    await requireUser(auth, request, true);
    const { status } = z
      .object({
        status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
      })
      .parse(request.query);
    const rows = await db
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.status, status))
      .orderBy(
        status === 'pending'
          ? asc(accessRequests.submittedAt)
          : desc(accessRequests.submittedAt),
        asc(accessRequests.id),
      );
    return { items: await Promise.all(rows.map((r) => requestView(db, r))) };
  });
  for (const decision of ['approve', 'reject'] as const)
    server.post(
      `/api/v1/admin/access-requests/:requestId/${decision}`,
      async (request) => {
        const user = await requireUser(auth, request, true);
        const { requestId } = z
          .object({ requestId: z.uuid() })
          .parse(request.params);
        const { note } = z
          .strictObject({
            note:
              decision === 'reject'
                ? reasonSchema
                : z.string().trim().max(1000).optional(),
          })
          .parse(request.body ?? {});
        const rollback: Compensations = [];
        let result;
        try {
          result = await db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
            // Same product lock as access updates prevents an approval from crossing a visibility save.
            const [target] = await tx
              .select({ productId: plans.productId })
              .from(accessRequests)
              .innerJoin(plans, eq(plans.id, accessRequests.planId))
              .where(eq(accessRequests.id, requestId));
            if (!target?.productId) throw notFound();
            await tx
              .select()
              .from(products)
              .where(eq(products.id, target.productId))
              .for('update');
            const [row] = await tx
              .select()
              .from(accessRequests)
              .where(eq(accessRequests.id, requestId))
              .for('update');
            if (!row) throw notFound();
            if (row.status !== 'pending')
              throw new Problem(
                409,
                'request-decided',
                'This request has already been decided.',
              );
            let appId = row.appId;
            if (decision === 'approve') {
              if (
                !(await productVisible(
                  tx,
                  await teamViewer(tx, [row.teamId]),
                  target.productId,
                ))
              )
                throw notFound();
              if (row.kind === 'subscribe') {
                const app = await provisionApp(
                  tx,
                  connection,
                  {
                    planId: row.planId,
                    teamId: row.teamId,
                    name: row.name,
                    description: row.description,
                    createdBy: user.id,
                    origin: 'request',
                  },
                  rollback,
                );
                appId = app.id;
              } else {
                const [app] = await tx
                  .select()
                  .from(apps)
                  .where(eq(apps.id, row.appId!))
                  .for('update');
                if (!app || app.status !== 'active')
                  throw new Problem(
                    409,
                    'app-revoked',
                    'This subscription has been revoked.',
                  );
                const [plan] = await tx
                  .select()
                  .from(plans)
                  .where(eq(plans.id, row.planId))
                  .for('share');
                await applyAppPlan(tx, connection, app, plan!, rollback);
              }
            }
            const [updated] = await tx
              .update(accessRequests)
              .set({
                status: decision === 'approve' ? 'approved' : 'rejected',
                appId,
                decidedBy: user.id,
                decidedAt: new Date(),
                decisionNote: note || null,
              })
              .where(eq(accessRequests.id, requestId))
              .returning();
            await enqueue(
              {
                template:
                  decision === 'approve'
                    ? 'access-approved'
                    : 'access-rejected',
                requestId,
              },
              tx,
            );
            return requestView(tx, updated!);
          });
        } catch (error) {
          await compensate(rollback);
          throw error;
        }
        return result;
      },
    );
}
