// SPDX-License-Identifier: Apache-2.0
import { connect, migrate, instanceSettings, gateways, user } from '@portal/db';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import PgBoss from 'pg-boss';
import { GatewayUnavailableError } from '@portal/adapter-sdk';
import { KongAdapter } from '@portal/adapter-kong';
import type { Config } from './config.js';
import { encrypt } from './crypto.js';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { seedSample } from './seed.js';
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
    const values = {
      kind: 'kong',
      adminUrl: config.KONG_ADMIN_URL,
      adminTokenCiphertext: config.KONG_ADMIN_TOKEN
        ? encrypt(config.KONG_ADMIN_TOKEN, config.PORTAL_ENCRYPTION_KEY)
        : null,
      proxyPublicUrl: config.KONG_PROXY_PUBLIC_URL,
      proxyInternalUrl: config.KONG_PROXY_INTERNAL_URL,
    };
    const [gateway] = await db
      .insert(gateways)
      .values({ id: uuidv7(), name: 'default', ...values })
      .onConflictDoUpdate({
        target: gateways.name,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    if (!gateway) throw new Error('Gateway missing');
    const adapter = new KongAdapter({
      adminUrl: config.KONG_ADMIN_URL,
      instanceId: instance.instanceId,
      adminToken: config.KONG_ADMIN_TOKEN,
    });
    await boss.start();
    await boss.createQueue('send-email');
    const enqueueMail = mailQueue(config, boss);
    const auth = createAuth(db, config, enqueueMail);
    const { app } = await createApp({
      db,
      config,
      adapter,
      gatewayId: gateway.id,
      auth,
      enqueueMail,
    });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71833003)`);
      const [admin] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, 'admin'))
        .limit(1);
      if (!admin) {
        const [existing] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, config.ADMIN_EMAIL));
        if (existing)
          throw new Error(
            'Admin bootstrap email already belongs to a developer; configure another email',
          );
        const context = await auth.$context;
        const created = await context.internalAdapter.createUser({
          email: config.ADMIN_EMAIL,
          name: 'Administrator',
          role: 'admin',
          emailVerified: true,
        });
        await context.internalAdapter.linkAccount({
          userId: created.id,
          providerId: 'credential',
          accountId: created.id,
          password: await context.password.hash(config.ADMIN_PASSWORD),
        });
        app.log.info({ email: config.ADMIN_EMAIL }, 'admin created');
      }
    });
    let seedPending = false;
    if (config.SEED_SAMPLE)
      try {
        await seedSample(db, adapter, gateway.id, instance.instanceId);
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
        reconcile(db, adapter, app.log),
      ),
    );
    await boss.work(
      'seed-sample',
      backgroundJob('seed-sample', app.log, () =>
        seedSample(db, adapter, gateway.id, instance.instanceId),
      ),
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
