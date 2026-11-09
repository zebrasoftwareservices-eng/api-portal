// SPDX-License-Identifier: Apache-2.0
import { randomBytes } from 'node:crypto';
import { connect, migrate, instanceSettings, gateways } from '@portal/db';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import PgBoss from 'pg-boss';
import { GatewayUnavailableError } from '@portal/adapter-sdk';
import type { KongAdapter } from '@portal/adapter-kong';
import { gatewayConnection, requireEnabled } from './gateway-connection.js';
import { adminExists, createFirstAdmin } from './setup.js';
import type { Config } from './config.js';
import { encrypt } from './crypto.js';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { seedSample } from './seed.js';
import { reconcile } from './reconcile.js';
import { backgroundJob } from './background-job.js';
export async function start(config: Config) {
  await migrate(config.DATABASE_URL);
  const { db, client } = connect(config.DATABASE_URL);
  const boss = new PgBoss(config.DATABASE_URL);
  try {
    await db
      .insert(instanceSettings)
      .values({ id: 1, instanceId: uuidv7() })
      .onConflictDoNothing();
    const [instance] = await db.select().from(instanceSettings);
    if (!instance) throw new Error('Instance missing');
    if (config.KONG_ADMIN_URL) {
      const values = {
        kind: 'kong',
        adminUrl: config.KONG_ADMIN_URL,
        adminTokenCiphertext: config.KONG_ADMIN_TOKEN
          ? encrypt(config.KONG_ADMIN_TOKEN, config.PORTAL_ENCRYPTION_KEY)
          : null,
        proxyPublicUrl: config.KONG_PROXY_PUBLIC_URL,
        proxyInternalUrl: config.KONG_PROXY_INTERNAL_URL,
        managedBy: 'env',
        enabled: true,
      };
      await db
        .insert(gateways)
        .values({ id: uuidv7(), name: 'default', ...values })
        .onConflictDoUpdate({
          target: gateways.name,
          set: { ...values, updatedAt: new Date() },
        });
    } else {
      await db
        .update(gateways)
        .set({ managedBy: 'admin', updatedAt: new Date() })
        .where(eq(gateways.managedBy, 'env'));
    }
    const auth = createAuth(db, config);
    if (
      config.ADMIN_EMAIL &&
      config.ADMIN_PASSWORD &&
      !(await adminExists(db))
    ) {
      try {
        await createFirstAdmin(db, auth, {
          email: config.ADMIN_EMAIL,
          password: config.ADMIN_PASSWORD,
        });
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'setup-complete'
        ))
          throw error;
      }
    }
    const setupToken =
      config.NODE_ENV === 'production' && !(await adminExists(db))
        ? randomBytes(32).toString('hex')
        : undefined;
    const { app } = await createApp({
      db,
      config,
      auth,
      setupToken,
      enqueueReconcile: () =>
        boss.send(
          'gateway-reconcile',
          {},
          { singletonKey: 'gateway-reconcile' },
        ),
    });
    if (setupToken)
      app.log.info(`Setup token for the first admin: ${setupToken}`);
    const connection = gatewayConnection(
      db,
      config,
      instance.instanceId,
      app.log,
    );
    async function seedIfEnabled() {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
        const loaded = await connection.load(tx);
        if (!loaded || !loaded.row.enabled) {
          app.log.warn('Sample seed skipped: no enabled gateway is connected');
          return;
        }
        const gateway = requireEnabled(loaded);
        await seedSample(
          tx,
          gateway.adapter as KongAdapter,
          gateway.row.id,
          instance!.instanceId,
        );
      });
    }

    let seedPending = false;
    if (config.SEED_SAMPLE)
      try {
        await seedIfEnabled();
      } catch (err) {
        seedPending = true;
        app.log.warn(
          { err },
          err instanceof GatewayUnavailableError
            ? 'Sample seed deferred: gateway unavailable'
            : 'Sample seed deferred: unexpected failure',
        );
      }
    boss.on('error', (err) => app.log.error({ err }, 'Background job failed'));
    await boss.start();
    await boss.createQueue('gateway-reconcile', {
      name: 'gateway-reconcile',
      policy: 'singleton',
    });
    await boss.createQueue('seed-sample', {
      name: 'seed-sample',
      policy: 'singleton',
    });
    await boss.work(
      'gateway-reconcile',
      backgroundJob('gateway-reconcile', app.log, () =>
        reconcile(db, connection, app.log),
      ),
    );
    await boss.work(
      'seed-sample',
      backgroundJob('seed-sample', app.log, () => seedIfEnabled()),
    );
    await boss.schedule(
      'gateway-reconcile',
      '*/5 * * * *',
      {},
      { singletonKey: 'gateway-reconcile' },
    );
    await boss.send(
      'gateway-reconcile',
      {},
      { singletonKey: 'gateway-reconcile' },
    );
    if (seedPending)
      await boss.send(
        'seed-sample',
        {},
        {
          singletonKey: 'seed-sample',
          retryLimit: 20,
          retryDelay: 5,
          retryBackoff: true,
        },
      );
    app.addHook('onClose', async () => {
      await boss.stop();
      await client.end();
    });
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    return app;
  } catch (error) {
    await boss.stop().catch(() => {});
    await client.end();
    throw error;
  }
}
