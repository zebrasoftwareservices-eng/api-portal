// SPDX-License-Identifier: Apache-2.0
import { connect, migrate, instanceSettings, gateways, user } from '@portal/db';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import PgBoss from 'pg-boss';
import { KongAdapter } from '@portal/adapter-kong';
import type { Config } from './config.js';
import { encrypt } from './crypto.js';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { seedSample } from './seed.js';
import { reconcile } from './reconcile.js';
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
    const auth = createAuth(db, config);
    const { app } = await createApp({
      db,
      config,
      adapter,
      gatewayId: gateway.id,
      auth,
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
        const created = await auth.api.signUpEmail({
          body: {
            email: config.ADMIN_EMAIL,
            password: config.ADMIN_PASSWORD,
            name: 'Administrator',
          },
        });
        await tx
          .update(user)
          .set({ role: 'admin' })
          .where(eq(user.id, created.user.id));
        app.log.info({ email: config.ADMIN_EMAIL }, 'admin created');
      }
    });
    let seedPending = false;
    if (config.SEED_SAMPLE)
      try {
        await seedSample(db, adapter, gateway.id, instance.instanceId);
      } catch {
        seedPending = true;
        app.log.warn('Sample seed deferred: gateway unavailable');
      }
    boss.on('error', () => app.log.error('Background job failed'));
    await boss.start();
    await boss.createQueue('gateway-reconcile', {
      name: 'gateway-reconcile',
      policy: 'singleton',
    });
    await boss.createQueue('seed-sample', {
      name: 'seed-sample',
      policy: 'singleton',
    });
    await boss.work('gateway-reconcile', async () => {
      await reconcile(db, adapter, app.log);
    });
    await boss.work('seed-sample', async () => {
      await seedSample(db, adapter, gateway.id, instance.instanceId);
    });
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
