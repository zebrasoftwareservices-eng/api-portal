// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import {
  apps,
  subscriptions,
  apis,
  credentials,
  gatewayConsumers,
  type Database,
} from '@portal/db';
import type { GatewayAdapter } from '@portal/adapter-sdk';
import { requireUser, type Auth } from './auth.js';
import { Problem, notFound } from './problem.js';
import { generateKey } from './crypto.js';
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const createSchema = z.strictObject({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  apiIds: z
    .array(z.uuid())
    .min(1)
    .max(10)
    .refine((v) => new Set(v).size === v.length, 'API IDs must be unique'),
});
const appParams = z.object({ appId: z.uuid() });
function credentialView(c: typeof credentials.$inferSelect) {
  return {
    id: c.id,
    kind: c.kind as 'api-key',
    keyHint: c.keyHint,
    status: c.status as 'active' | 'revoked',
    createdAt: c.createdAt.toISOString(),
    revokedAt: c.revokedAt?.toISOString() ?? null,
  };
}
async function view(db: Database | Tx, app: typeof apps.$inferSelect) {
  const [subs, keys] = await Promise.all([
    db
      .select({ apiId: apis.id, slug: apis.slug, title: apis.title })
      .from(subscriptions)
      .innerJoin(apis, eq(subscriptions.apiId, apis.id))
      .where(eq(subscriptions.appId, app.id)),
    db
      .select()
      .from(credentials)
      .where(eq(credentials.appId, app.id))
      .orderBy(desc(credentials.createdAt)),
  ]);
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    subscriptions: subs,
    credentials: keys.map(credentialView),
    createdAt: app.createdAt.toISOString(),
  };
}
async function owned(
  db: Database | Tx,
  id: string,
  ownerId: string,
  lock = false,
) {
  const q = db
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), eq(apps.ownerId, ownerId)));
  const [app] = await (lock ? q.for('update') : q);
  if (!app) throw notFound();
  return app;
}
export function registerApps(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  adapter: GatewayAdapter,
  gatewayId: string,
) {
  server.get('/api/v1/apps', async (request) => {
    const user = await requireUser(auth, request);
    const rows = await db
      .select()
      .from(apps)
      .where(eq(apps.ownerId, user.id))
      .orderBy(desc(apps.createdAt));
    return { items: await Promise.all(rows.map((a) => view(db, a))) };
  });
  server.get('/api/v1/apps/:appId', async (request) => {
    const user = await requireUser(auth, request);
    const { appId } = appParams.parse(request.params);
    return view(db, await owned(db, appId, user.id));
  });
  server.post('/api/v1/apps', async (request, reply) => {
    const user = await requireUser(auth, request);
    const input = createSchema.parse(request.body);
    const appId = uuidv7(),
      id = uuidv7(),
      key = generateKey();
    let gatewayAttempted = false;
    try {
      const result = await db.transaction(async (tx) => {
        // Serialize names before gateway writes, including simultaneous identical submissions.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${user.id + ':' + input.name},0))`,
        );
        const [duplicate] = await tx
          .select({ id: apps.id })
          .from(apps)
          .where(and(eq(apps.ownerId, user.id), eq(apps.name, input.name)));
        if (duplicate)
          throw new Problem(
            409,
            'app-name-taken',
            'You already have an app with this name.',
          );
        const selected = await tx
          .select()
          .from(apis)
          .where(inArray(apis.id, input.apiIds));
        if (selected.length !== input.apiIds.length) throw notFound();
        if (selected.some((a) => a.gatewayId !== gatewayId))
          throw new Problem(
            400,
            'validation',
            'APIs must use the configured gateway.',
          );
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
        gatewayAttempted = true;
        const consumer = await adapter.ensureConsumer({ id: appId });
        for (const serviceId of new Set(
          selected.map((a) => a.gatewayServiceId),
        ))
          await adapter.grantAccess({ id: appId }, { id: serviceId });
        await adapter.issueCredential({ id: appId }, { id, key });
        const [app] = await tx
          .insert(apps)
          .values({
            id: appId,
            ownerId: user.id,
            name: input.name,
            description: input.description,
          })
          .returning();
        if (!app) throw new Error('Insert failed');
        await tx
          .insert(subscriptions)
          .values(selected.map((a) => ({ id: uuidv7(), appId, apiId: a.id })));
        await tx.insert(gatewayConsumers).values({
          id: uuidv7(),
          appId,
          gatewayId,
          externalId: consumer.id,
          username: consumer.username,
        });
        const [credential] = await tx
          .insert(credentials)
          .values({
            id,
            appId,
            gatewayId,
            keyHint: key.slice(-4),
            status: 'active',
          })
          .returning();
        if (!credential) throw new Error('Insert failed');
        return {
          app: await view(tx, app),
          credential: {
            ...credentialView(credential),
            key,
            headerName: 'apikey',
          },
        };
      });
      return reply
        .code(201)
        .header('Location', `/api/v1/apps/${appId}`)
        .send(result);
    } catch (error) {
      if (gatewayAttempted)
        await adapter
          .deleteConsumer({ id: appId })
          .catch(() =>
            server.log.warn(
              { appId },
              'Consumer compensation deferred to reconcile',
            ),
          );
      throw error;
    }
  });
  server.post('/api/v1/apps/:appId/credentials', async (request, reply) => {
    const user = await requireUser(auth, request);
    const { appId } = appParams.parse(request.params);
    const id = uuidv7(),
      key = generateKey();
    let attempted = false;
    try {
      const result = await db.transaction(async (tx) => {
        await owned(tx, appId, user.id, true);
        const active = await tx
          .select({ id: credentials.id })
          .from(credentials)
          .where(
            and(eq(credentials.appId, appId), eq(credentials.status, 'active')),
          );
        if (active.length >= 5)
          throw new Problem(
            409,
            'credential-limit',
            'This app already has five active keys. Revoke one before creating another.',
          );
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
        attempted = true;
        await adapter.issueCredential({ id: appId }, { id, key });
        const [credential] = await tx
          .insert(credentials)
          .values({
            id,
            appId,
            gatewayId,
            keyHint: key.slice(-4),
            status: 'active',
          })
          .returning();
        if (!credential) throw new Error('Insert failed');
        return { ...credentialView(credential), key, headerName: 'apikey' };
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (attempted)
        await adapter
          .revokeCredential({ id: appId }, id)
          .catch(() =>
            server.log.warn(
              { appId, credentialId: id },
              'Credential compensation deferred to reconcile',
            ),
          );
      throw error;
    }
  });
  server.delete(
    '/api/v1/apps/:appId/credentials/:credentialId',
    async (request, reply) => {
      const user = await requireUser(auth, request);
      const { appId, credentialId } = appParams
        .extend({ credentialId: z.uuid() })
        .parse(request.params);
      await db.transaction(async (tx) => {
        await owned(tx, appId, user.id, true);
        const [credential] = await tx
          .select()
          .from(credentials)
          .where(
            and(eq(credentials.appId, appId), eq(credentials.id, credentialId)),
          );
        if (!credential) throw notFound();
        if (credential.status === 'revoked') return;
        await adapter.revokeCredential({ id: appId }, credentialId);
        await tx
          .update(credentials)
          .set({ status: 'revoked', revokedAt: new Date() })
          .where(eq(credentials.id, credentialId));
      });
      return reply.code(204).send();
    },
  );
}
