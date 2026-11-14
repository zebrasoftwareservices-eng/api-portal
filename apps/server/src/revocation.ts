// SPDX-License-Identifier: Apache-2.0
import { apps, credentials, type Database } from '@portal/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { GatewayConnection } from './gateway-connection.js';
import { requireGateway } from './gateway-connection.js';
import type { EnqueueMail } from './mail/queue.js';
import type { Db } from './app-plans.js';
export type EnqueueRevocation = (
  appIds: string[],
  transaction?: Db,
) => Promise<unknown>;
export async function markRevocations(
  db: Db,
  appIds: string[],
  reason: 'visibility' | 'approval',
) {
  if (appIds.length)
    await db
      .update(apps)
      .set({
        status: 'revoke-pending',
        revokeReason: reason,
        updatedAt: new Date(),
      })
      .where(and(inArray(apps.id, appIds), eq(apps.status, 'active')));
}
export async function revokeApps(
  db: Database,
  connection: GatewayConnection,
  appIds: string[],
  enqueueMail: EnqueueMail,
) {
  let revoked = 0;
  for (const appId of appIds) {
    try {
      const changed = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
        const [app] = await tx
          .select()
          .from(apps)
          .where(eq(apps.id, appId))
          .for('update');
        if (!app || app.status !== 'revoke-pending') return false;
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
        const { adapter } = requireGateway(await connection.load(tx));
        await adapter.deleteConsumer({ id: app.id });
        await tx
          .update(credentials)
          .set({ status: 'revoked', revokedAt: new Date() })
          .where(eq(credentials.appId, app.id));
        await tx
          .update(apps)
          .set({
            status: 'revoked',
            revokedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(apps.id, app.id));
        await enqueueMail({ template: 'subscription-revoked', appId }, tx);
        return true;
      });
      if (changed) revoked++;
    } catch {
      /* The persisted pending row is retried by the queue and reconcile. */
    }
  }
  const pending = appIds.length
    ? await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(inArray(apps.id, appIds), eq(apps.status, 'revoke-pending')))
    : [];
  return { revoked, pending: pending.length };
}
