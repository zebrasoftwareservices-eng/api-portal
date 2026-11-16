// SPDX-License-Identifier: Apache-2.0
import { ensureUsage } from './usage.js';
import {
  apps,
  credentials,
  apis,
  plans,
  gatewayOperations,
  type Database,
} from '@portal/db';
import {
  requireGateway,
  type GatewayConnection,
} from './gateway-connection.js';
import type { FastifyBaseLogger } from 'fastify';
import { appApis, planLimits } from './app-plans.js';
import type { EnqueueMail } from './mail/queue.js';
import { revokeApps } from './revocation.js';
import { sql, eq, lt } from 'drizzle-orm';
import { PENDING_OPERATION_GRACE_MS } from './gateway-operation.js';
export async function reconcile(
  db: Database,
  connection: GatewayConnection,
  log: Pick<FastifyBaseLogger, 'warn'>,
  enqueueMail: EnqueueMail = async () => {},
) {
  await ensureUsage(db, connection, log);
  const pending = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.status, 'revoke-pending'));
  await revokeApps(
    db,
    connection,
    pending.map((a) => a.id),
    enqueueMail,
    log,
  );
  const credentialIds: string[] = [];
  await db.transaction(async (tx) => {
    const lock = await tx.execute(
      sql`select pg_try_advisory_xact_lock(71833002) as acquired`,
    );
    if (!lock[0]?.acquired) return;
    const gateway = await connection.load(tx);
    if (!gateway) return;
    const { adapter } = requireGateway(gateway);
    const [owned, appRows, keyRows, ops] = await Promise.all([
      adapter.listOwnedConsumers(),
      tx.select().from(apps),
      tx.select().from(credentials),
      tx.select().from(gatewayOperations),
    ]);
    const now = Date.now();
    const recent = (startedAt: Date) =>
      now - startedAt.getTime() < PENDING_OPERATION_GRACE_MS;
    const appIds = new Set(
      appRows.filter((a) => a.status === 'active').map((a) => a.id),
    );
    const found = new Set<string>();
    for (const consumer of owned) {
      if (!appIds.has(consumer.appId)) {
        if (ops.some((op) => op.appId === consumer.appId && recent(op.startedAt)))
          continue;
        await adapter.deleteConsumer({ id: consumer.appId });
        continue;
      }
      for (const key of consumer.credentials) {
        found.add(key.id);
        const row = keyRows.find(
          (k) => k.id === key.id && k.appId === consumer.appId,
        );
        if (!row || row.status === 'revoked') {
          if (ops.some((op) => op.credentialId === key.id && recent(op.startedAt)))
            continue;
          await adapter.revokeCredential({ id: consumer.appId }, key.id);
        }
      }
    }
    for (const row of keyRows) {
      if (row.status !== 'active' || found.has(row.id)) continue;
      const revokeOp = ops.find(
        (op) => op.kind === 'revoke-credential' && op.credentialId === row.id,
      );
      if (revokeOp) {
        await tx
          .update(credentials)
          .set({ status: 'revoked', revokedAt: new Date() })
          .where(eq(credentials.id, row.id));
        await tx
          .delete(gatewayOperations)
          .where(eq(gatewayOperations.id, revokeOp.id));
        continue;
      }
      log.warn(
        { appId: row.appId, credentialId: row.id },
        'drift: active credential missing from gateway',
      );
      credentialIds.push(row.id);
    }
    for (const op of ops) {
      if (op.kind !== 'revoke-credential' || !op.credentialId) continue;
      if (recent(op.startedAt) || !found.has(op.credentialId)) continue;
      await adapter.revokeCredential({ id: op.appId }, op.credentialId);
      await tx
        .update(credentials)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(eq(credentials.id, op.credentialId));
      await tx.delete(gatewayOperations).where(eq(gatewayOperations.id, op.id));
    }
    await tx
      .delete(gatewayOperations)
      .where(
        lt(
          gatewayOperations.startedAt,
          new Date(now - PENDING_OPERATION_GRACE_MS),
        ),
      );
    const apiRows = await tx
      .select({ id: apis.gatewayServiceId, slug: apis.slug })
      .from(apis);
    const desired = await Promise.all(
      appRows
        .filter((a) => a.status === 'active')
        .map(async (app) => {
          const [plan] = await tx
            .select()
            .from(plans)
            .where(eq(plans.id, app.planId));
          return {
            app: { id: app.id },
            services: [
              ...new Set(
                (await appApis(tx, app)).map((a) => a.gatewayServiceId),
              ),
            ].map((id) => ({ id })),
            limits: planLimits(plan!),
          };
        }),
    );
    const report = await adapter.applyAccessPolicy({
      services: apiRows.map((a) => ({ id: a.id })),
      apps: desired,
    });
    for (const repair of report.repairs)
      log.warn(repair, 'drift: access policy repaired');
    for (const finding of report.findings)
      log.warn(
        {
          ...finding,
          ...(finding.code === 'service-shared'
            ? {
                apiSlugs: apiRows
                  .filter((a) => a.id === finding.serviceId)
                  .map((a) => a.slug),
              }
            : {}),
        },
        'drift: access policy finding',
      );
  });
  return { drift: { credentialIds } };
}
