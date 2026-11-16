// SPDX-License-Identifier: Apache-2.0
import {
  apps,
  plans,
  planApis,
  apis,
  gatewayConsumers,
  subscriptions,
  type Database,
} from '@portal/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { GatewayAdapter, ConsumerRef } from '@portal/adapter-sdk';
import { appApis, planLimits, type Db } from './app-plans.js';
import {
  requireEnabled,
  type GatewayConnection,
} from './gateway-connection.js';
import { checkAppName } from './access-request-model.js';
import type { FastifyBaseLogger } from 'fastify';
import { notFound, Problem } from './problem.js';
import { redactSecrets } from './log-safety.js';
import {
  beginOperation,
  endOperation,
  gatewayChanged,
} from './gateway-operation.js';
export type Compensation = {
  appId: string;
  credentialId?: string;
  gatewayId: string;
  gatewayObject: { consumer?: string; credential?: string };
  run: () => Promise<unknown>;
};
export type Compensations = Compensation[];
export async function compensate(
  operations: Compensations,
  log: Pick<FastifyBaseLogger, 'error'>,
) {
  for (const operation of operations.reverse()) {
    try {
      await operation.run();
    } catch (error) {
      log.error(
        {
          err: redactSecrets(error),
          appId: operation.appId,
          credentialId: operation.credentialId,
          gatewayId: operation.gatewayId,
          gatewayObject: operation.gatewayObject,
        },
        'Gateway compensation failed; reconcile will retry',
      );
    }
  }
}
export type AppInput = {
  id?: string;
  credentialId?: string;
  apiIds?: string[];
  planId: string;
  teamId: string;
  name: string;
  description?: string | null;
  createdBy: string;
  origin: 'self' | 'request' | 'admin';
};
export type AppPlan = {
  operationId: string;
  appId: string;
  credentialId?: string;
  input: AppInput;
  plan: typeof plans.$inferSelect;
  selected: { api: typeof apis.$inferSelect }[];
  gatewayId: string;
  adapter: GatewayAdapter;
  consumer?: ConsumerRef;
};
async function assertAppPlan(
  db: Db,
  connection: GatewayConnection,
  input: AppInput,
  expectedGatewayId?: string,
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
  const loaded = await connection.load(db);
  if (
    expectedGatewayId !== undefined &&
    (!loaded || loaded.row.id !== expectedGatewayId)
  )
    throw gatewayChanged();
  const { adapter, row: gateway } = requireEnabled(loaded);
  if (selected.some((a) => a.api.gatewayId !== gateway.id))
    throw new Problem(
      400,
      'validation',
      'APIs must use the configured gateway.',
    );
  return { plan, selected, gatewayId: gateway.id, adapter };
}
export async function prepareApp(
  db: Db,
  connection: GatewayConnection,
  input: AppInput,
): Promise<AppPlan> {
  const checked = await assertAppPlan(db, connection, input);
  const appId = input.id ?? uuidv7();
  const operationId = await beginOperation(db, {
    kind: 'create-app',
    appId,
    credentialId: input.credentialId,
    gatewayId: checked.gatewayId,
  });
  return { operationId, appId, credentialId: input.credentialId, input, ...checked };
}
export async function applyAppToGateway(
  adapter: GatewayAdapter,
  plan: AppPlan,
  rollback: Compensations,
) {
  rollback.push({
    appId: plan.appId,
    credentialId: plan.credentialId,
    gatewayId: plan.gatewayId,
    gatewayObject: {
      consumer: plan.appId,
      ...(plan.credentialId ? { credential: plan.credentialId } : {}),
    },
    run: () => adapter.deleteConsumer({ id: plan.appId }),
  });
  const consumer = await adapter.ensureConsumer({ id: plan.appId });
  for (const id of new Set(plan.selected.map((a) => a.api.gatewayServiceId)))
    await adapter.grantAccess({ id: plan.appId }, { id });
  if (!plan.plan.builtin)
    await adapter.applyPlanLimits({ id: plan.appId }, planLimits(plan.plan));
  return consumer;
}
export async function commitApp(
  db: Db,
  connection: GatewayConnection,
  plan: AppPlan,
) {
  await assertAppPlan(db, connection, plan.input, plan.gatewayId);
  if (!plan.consumer) throw new Error('Gateway consumer missing');
  const [app] = await db
    .insert(apps)
    .values({
      id: plan.appId,
      planId: plan.plan.id,
      teamId: plan.input.teamId,
      name: plan.input.name,
      description: plan.input.description,
      createdBy: plan.input.createdBy,
      origin: plan.input.origin,
      keyIssued: plan.input.origin === 'self',
    })
    .returning();
  if (plan.plan.builtin && plan.selected.length)
    await db.insert(subscriptions).values(
      plan.selected.map(({ api }) => ({
        id: uuidv7(),
        appId: plan.appId,
        apiId: api.id,
      })),
    );
  await db.insert(gatewayConsumers).values({
    id: uuidv7(),
    appId: plan.appId,
    gatewayId: plan.gatewayId,
    externalId: plan.consumer.id,
    username: plan.consumer.username,
  });
  await endOperation(db, plan.operationId);
  return app!;
}
export async function runGatewayPhase<T>(
  db: Database,
  log: Pick<FastifyBaseLogger, 'error'>,
  work: {
    prepare: () => Promise<AppPlan>;
    gateway: (plan: AppPlan, rollback: Compensations) => Promise<void>;
    commit: (plan: AppPlan) => Promise<T>;
    keepOperationOnCommitFailure?: boolean;
  },
): Promise<T> {
  const rollback: Compensations = [];
  let plan: AppPlan | undefined;
  let stage: 'prepare' | 'gateway' | 'commit' = 'prepare';
  try {
    plan = await work.prepare();
    stage = 'gateway';
    await work.gateway(plan, rollback);
    stage = 'commit';
    return await work.commit(plan);
  } catch (error) {
    await compensate(rollback, log);
    if (plan && !(work.keepOperationOnCommitFailure && stage === 'commit'))
      await endOperation(db, plan.operationId).catch((endError) => {
        log.error(
          {
            err: redactSecrets(endError),
            appId: plan!.appId,
            gatewayId: plan!.gatewayId,
          },
          'Gateway operation cleanup failed; reconcile will retry',
        );
      });
    throw error;
  }
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
  const { adapter, row: gateway } = requireEnabled(await connection.load(db));
  const restore = [
    () => adapter.applyPlanLimits({ id: app.id }, planLimits(oldPlan)),
    ...[...oldServices].map(
      (id) => () => adapter.grantAccess({ id: app.id }, { id }),
    ),
    ...[...newServices]
      .filter((id) => !oldServices.has(id))
      .map((id) => () => adapter.revokeAccess({ id: app.id }, { id })),
  ];
  rollback.push(
    ...restore.reverse().map((run) => ({
      appId: app.id,
      gatewayId: gateway.id,
      gatewayObject: { consumer: app.id },
      run,
    })),
  );
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
