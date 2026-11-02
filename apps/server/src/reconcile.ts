// SPDX-License-Identifier: Apache-2.0
import { apps, credentials, type Database } from '@portal/db';
import type { GatewayAdapter } from '@portal/adapter-sdk';
import type { FastifyBaseLogger } from 'fastify';
import { sql } from 'drizzle-orm';
export async function reconcile(
  db: Database,
  adapter: GatewayAdapter,
  log: Pick<FastifyBaseLogger, 'warn'>,
) {
  await db.transaction(async (tx) => {
    const lock = await tx.execute(
      sql`select pg_try_advisory_xact_lock(71833002) as acquired`,
    );
    if (!lock[0]?.acquired) return;
    const [owned, appRows, keyRows] = await Promise.all([
      adapter.listOwnedConsumers(),
      tx.select({ id: apps.id }).from(apps),
      tx.select().from(credentials),
    ]);
    const appIds = new Set(appRows.map((a) => a.id));
    const found = new Set<string>();
    for (const consumer of owned) {
      if (!appIds.has(consumer.appId)) {
        await adapter.deleteConsumer({ id: consumer.appId });
        continue;
      }
      for (const key of consumer.credentials) {
        found.add(key.id);
        const row = keyRows.find(
          (k) => k.id === key.id && k.appId === consumer.appId,
        );
        if (!row || row.status === 'revoked')
          await adapter.revokeCredential({ id: consumer.appId }, key.id);
      }
    }
    for (const row of keyRows)
      if (row.status === 'active' && !found.has(row.id))
        log.warn(
          { appId: row.appId, credentialId: row.id },
          'drift: active credential missing from gateway',
        );
  });
}
