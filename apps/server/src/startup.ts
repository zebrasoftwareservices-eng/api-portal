// SPDX-License-Identifier: Apache-2.0
import { connect, migrate, instanceSettings, gateways } from '@portal/db';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import PgBoss from 'pg-boss';
import { GatewayUnavailableError } from '@portal/adapter-sdk';
import type { KongAdapter } from '@portal/adapter-kong';
import { gatewayConnection, requireEnabled } from './gateway-connection.js';
import { adminExists, createFirstAdmin, prepareSetupToken } from './setup.js';
import type { Config } from './config.js';
import { encrypt } from './crypto.js';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { seedSample } from './seed.js';
import { jobDb } from './job-db.js';
import { revokeApps } from './revocation.js';
import { reconcile } from './reconcile.js';
import { mailQueue, processMail } from './mail/queue.js';
import { housekeeping } from './auth-limits.js';
import { backgroundJob } from './background-job.js';
export async function start(config: Config) {
  await migrate(config.DATABASE_URL);
  const { db, client } = connect(config.DATABASE_URL);
  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    deleteAfterSeconds: 3600,
    archiveCompletedAfterSeconds: 60,
    archiveFailedAfterSeconds: 60,
  });
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
    await boss.start();
    await boss.createQueue('send-email');
    const enqueueMail = mailQueue(config, boss);
    const auth = createAuth(db, config, enqueueMail);
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
    const setupToken = await prepareSetupToken(
      db,
      config.PORTAL_ENCRYPTION_KEY,
      config.NODE_ENV === 'production',
    );
    const { app } = await createApp({
      db,
      config,
      auth,
      enqueueMail,
      enqueueRevocation: (appIds, tx) =>
        boss.send(
          'access-revoke',
          { appIds },
          {
            db: tx ? jobDb(tx) : undefined,
            singletonKey: appIds.slice().sort().join(':'),
            retryLimit: 10,
            retryBackoff: true,
            retryDelay: 5,
          },
        ),
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
    await boss.work(
      'send-email',
      { pollingIntervalSeconds: 2 },
      async (jobs) => {
        for (const job of jobs)
          await processMail(
            db,
            config,
            app.log,
            job as Parameters<typeof processMail>[3],
          );
      },
    );
    await boss.createQueue('access-revoke', {
      name: 'access-revoke',
      policy: 'singleton',
    });
    await boss.work<{ appIds: string[] }>('access-revoke', async (jobs) => {
      for (const job of jobs) {
        const result = await revokeApps(
          db,
          connection,
          job.data.appIds,
          enqueueMail,
        );
        if (result.pending) throw new Error('Access revocation is pending');
      }
    });
    await boss.createQueue('auth-housekeeping');
    await boss.work('auth-housekeeping', async () => {
      await housekeeping(db);
    });
    await boss.schedule('auth-housekeeping', '0 * * * *', {});
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
        reconcile(db, connection, app.log, enqueueMail),
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
