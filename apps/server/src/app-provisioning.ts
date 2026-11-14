// SPDX-License-Identifier: Apache-2.0
import {
  apps,
  plans,
  planApis,
  apis,
  gatewayConsumers,
  subscriptions,
} from '@portal/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { appApis, planLimits, type Db } from './app-plans.js';
import {
  requireEnabled,
  type GatewayConnection,
} from './gateway-connection.js';
import { checkAppName } from './access-request-model.js';
import { notFound, Problem } from './problem.js';
export type Compensations = (() => Promise<unknown>)[];
export async function compensate(operations: Compensations) {
  for (const operation of operations.reverse())
    await operation().catch(() => {});
}
export async function provisionApp(
  db: Db,
  connection: GatewayConnection,
  input: {
    id?: string;
    apiIds?: string[];
    planId: string;
    teamId: string;
    name: string;
    description?: string | null;
    createdBy: string;
    origin: 'self' | 'request' | 'admin';
  },
  rollback: Compensations,
) {
  await db.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${input.teamId + ':' + input.name},0))`,
  );
  await checkAppName(db, input.teamId, input.name);
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, input.planId))
    .for('share');
  if (!plan || (plan.builtin && input.origin !== 'self')) throw notFound();
  const selected = input.apiIds
    ? (await db.select().from(apis).where(inArray(apis.id, input.apiIds))).map(
        (api) => ({ api }),
      )
    : await db
        .select({ api: apis })
        .from(planApis)
        .innerJoin(apis, eq(apis.id, planApis.apiId))
        .where(eq(planApis.planId, plan.id));
  await db.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
  const { adapter, row: gateway } = requireEnabled(await connection.load(db));
  if (selected.some((a) => a.api.gatewayId !== gateway.id))
    throw new Problem(
      400,
      'validation',
      'APIs must use the configured gateway.',
    );
  const appId = input.id ?? uuidv7();
  rollback.push(() => adapter.deleteConsumer({ id: appId }));
  const consumer = await adapter.ensureConsumer({ id: appId });
  for (const id of new Set(selected.map((a) => a.api.gatewayServiceId)))
    await adapter.grantAccess({ id: appId }, { id });
  if (!plan.builtin)
    await adapter.applyPlanLimits({ id: appId }, planLimits(plan));
  const [app] = await db
    .insert(apps)
    .values({
      id: appId,
      planId: plan.id,
      teamId: input.teamId,
      name: input.name,
      description: input.description,
      createdBy: input.createdBy,
      origin: input.origin,
      keyIssued: input.origin === 'self',
    })
    .returning();
  if (plan.builtin && selected.length)
    await db
      .insert(subscriptions)
      .values(
        selected.map(({ api }) => ({ id: uuidv7(), appId, apiId: api.id })),
      );
  await db
    .insert(gatewayConsumers)
    .values({
      id: uuidv7(),
      appId,
      gatewayId: gateway.id,
      externalId: consumer.id,
      username: consumer.username,
    });
  return app!;
}
export async function applyAppPlan(
  db: Db,
  connection: GatewayConnection,
  app: typeof apps.$inferSelect,
  newPlan: typeof plans.$inferSelect,
  rollback: Compensations,
) {
  const [oldPlan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, app.planId))
    .for('share');
  if (!oldPlan) throw notFound();
  const oldServices = new Set(
    (await appApis(db, app)).map((a) => a.gatewayServiceId),
  );
  const newServices = new Set(
    (await appApis(db, { ...app, planId: newPlan.id })).map(
      (a) => a.gatewayServiceId,
    ),
  );
  await db.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
  const { adapter } = requireEnabled(await connection.load(db));
  rollback.push(async () => {
    const restore = [
      () => adapter.applyPlanLimits({ id: app.id }, planLimits(oldPlan)),
      ...[...oldServices].map(
        (id) => () => adapter.grantAccess({ id: app.id }, { id }),
      ),
      ...[...newServices]
        .filter((id) => !oldServices.has(id))
        .map((id) => () => adapter.revokeAccess({ id: app.id }, { id })),
    ];
    for (const operation of restore) await operation().catch(() => {});
  });
  await adapter.applyPlanLimits({ id: app.id }, planLimits(newPlan));
  for (const id of newServices)
    await adapter.grantAccess({ id: app.id }, { id });
  for (const id of oldServices)
    if (!newServices.has(id))
      await adapter.revokeAccess({ id: app.id }, { id });
  const [updated] = await db
    .update(apps)
    .set({ planId: newPlan.id, updatedAt: new Date() })
    .where(and(eq(apps.id, app.id), eq(apps.status, 'active')))
    .returning();
  if (!updated)
    throw new Problem(
      409,
      'app-revoked',
      'This subscription has been revoked.',
    );
  return updated;
}
