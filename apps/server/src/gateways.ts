// SPDX-License-Identifier: Apache-2.0
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { and, eq, sql, count } from 'drizzle-orm';
import { gateways, apis, credentials, type Database } from '@portal/db';
import {
  GatewayRejectedError,
  GatewayUnavailableError,
} from '@portal/adapter-sdk';
import type { KongAdapter } from '@portal/adapter-kong';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser, type Auth } from './auth.js';
import { Problem, notFound } from './problem.js';
import { encrypt } from './crypto.js';
import { apiDetail, publishedApis } from './catalog.js';
import { seedSample } from './seed.js';
import {
  normalizeUrl,
  resolveToken,
  checkConnection,
  connectionFailure,
  requireEnabled,
  type GatewayConnection,
  type GatewayRow,
  type DbConnection,
} from './gateway-connection.js';
const urls = z.object({
  adminUrl: z.string(),
  proxyInternalUrl: z.string(),
  proxyPublicUrl: z.string(),
});
const token = z.string().max(1024).nullable().optional();
const create = urls.extend({
  adminToken: z.string().min(1).max(1024).optional(),
});
const test = urls.extend({ gatewayId: z.uuid().optional(), adminToken: token });
const update = urls
  .partial()
  .extend({
    adminToken: token,
    enabled: z.boolean().optional(),
    confirmMissingKeys: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one change.');
class GatewayChanged extends Error {}
const params = z.object({ gatewayId: z.uuid() });
function editable(row: GatewayRow) {
  if (row.managedBy === 'env')
    throw new Problem(
      409,
      'gateway-env-managed',
      "KONG_ADMIN_URL sets this connection, so it can't be changed here. Change the server's environment and restart it.",
    );
}
function exists() {
  return new Problem(
    409,
    'gateway-exists',
    "A portal connects to one gateway, so this one wasn't added. The existing connection is unchanged.",
  );
}
async function find(db: DbConnection, id?: string) {
  const [row] = await db.select().from(gateways).limit(1);
  if (id && (!row || row.id !== id)) throw notFound();
  return row;
}
export async function sampleAvailable(
  db: DbConnection,
  row: GatewayRow,
  connection: GatewayConnection,
) {
  if (
    !row.enabled ||
    !connection.config.PORTAL_BUNDLED_KONG_ADMIN_URL ||
    normalizeUrl(row.adminUrl, 'adminUrl') !==
      normalizeUrl(connection.config.PORTAL_BUNDLED_KONG_ADMIN_URL, 'adminUrl')
  )
    return false;
  const [sample] = await db
    .select({ id: apis.id })
    .from(apis)
    .where(eq(apis.slug, 'sample'));
  return !sample;
}
async function view(
  db: DbConnection,
  row: GatewayRow,
  connection: GatewayConnection,
) {
  return {
    id: row.id,
    kind: row.kind,
    adminUrl: row.adminUrl,
    proxyInternalUrl: row.proxyInternalUrl,
    proxyPublicUrl: row.proxyPublicUrl,
    hasAdminToken: Boolean(row.adminTokenCiphertext),
    enabled: row.enabled,
    managedBy: row.managedBy,
    sampleAvailable: await sampleAvailable(db, row, connection),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
async function dependents(db: DbConnection, id: string) {
  const [[apiCount], [keyCount]] = await Promise.all([
    db.select({ value: count() }).from(apis).where(eq(apis.gatewayId, id)),
    db
      .select({ value: count() })
      .from(credentials)
      .where(
        and(eq(credentials.gatewayId, id), eq(credentials.status, 'active')),
      ),
  ]);
  return { apis: apiCount?.value ?? 0, activeKeys: keyCount?.value ?? 0 };
}
export async function registerGateways(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  connection: GatewayConnection,
  instanceId: string,
  enqueueReconcile: () => Promise<unknown>,
) {
  await server.register(async (app) => {
    const users = new WeakMap<FastifyRequest, string>();
    app.addHook('onRequest', async (request) => {
      users.set(request, (await requireUser(auth, request, true)).id);
    });
    await app.register(rateLimit, {
      global: false,
      hook: 'preHandler',
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (request) => users.get(request)!,
      errorResponseBuilder: () =>
        new Problem(
          429,
          'rate-limited',
          'Too many requests. Try again in a moment.',
        ),
    });
    const limited = {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    };
    app.get('/api/v1/admin/gateways', async () => {
      const row = await find(db);
      return {
        items: row ? [await view(db, row, connection)] : [],
        bundled: connection.config.PORTAL_BUNDLED_KONG_ADMIN_URL
          ? {
              adminUrl: connection.config.PORTAL_BUNDLED_KONG_ADMIN_URL,
              proxyInternalUrl: connection.config.KONG_PROXY_INTERNAL_URL,
              proxyPublicUrl: connection.config.KONG_PROXY_PUBLIC_URL,
            }
          : null,
      };
    });
    async function candidate(
      input: z.infer<typeof test>,
      previous?: GatewayRow,
    ) {
      const values = {
        adminUrl: normalizeUrl(input.adminUrl, 'adminUrl'),
        proxyInternalUrl: normalizeUrl(
          input.proxyInternalUrl,
          'proxyInternalUrl',
        ),
        proxyPublicUrl: normalizeUrl(input.proxyPublicUrl, 'proxyPublicUrl'),
      };
      const adminToken = resolveToken(
        input.adminToken,
        values.adminUrl,
        previous,
        connection.config,
      );
      const row = {
        id: uuidv7(),
        name: 'default',
        kind: 'kong',
        managedBy: 'admin',
        enabled: true,
        adminTokenCiphertext: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...previous,
        ...values,
      };
      const adapter = connection.adapterFor({ ...row, adminToken });
      const version = await checkConnection(values, adapter);
      const warnings: {
        code: 'active-keys-missing';
        message: string;
        affectedKeys: number;
      }[] = [];
      let found: Set<string> | undefined;
      if (
        previous &&
        normalizeUrl(previous.adminUrl, 'adminUrl') !== values.adminUrl
      ) {
        const keys = await db
          .select({ appId: credentials.appId })
          .from(credentials)
          .where(
            and(
              eq(credentials.gatewayId, previous.id),
              eq(credentials.status, 'active'),
            ),
          );
        {
          let owned;
          try {
            owned = await adapter.listOwnedConsumers();
          } catch (error) {
            if (error instanceof GatewayUnavailableError)
              throw connectionFailure('unreachable', values.adminUrl);
            if (error instanceof GatewayRejectedError)
              throw connectionFailure(
                [401, 403].includes(error.status)
                  ? 'refused'
                  : error.status >= 500
                    ? 'unreachable'
                    : 'not-gateway',
                values.adminUrl,
              );
            throw error;
          }
          found = new Set(owned.map((c) => c.appId));
          const affectedKeys = keys.filter(
            (key) => !found!.has(key.appId),
          ).length;
          if (affectedKeys)
            warnings.push({
              code: 'active-keys-missing',
              message:
                "Active keys have no consumer on this Kong and won't work there. Saving does not move keys or APIs. Clean up the old Kong separately.",
              affectedKeys,
            });
        }
      }
      return { values, adminToken, version, warnings, found };
    }
    app.post('/api/v1/admin/gateways/test', limited, async (request) => {
      const input = test.parse(request.body);
      const previous = input.gatewayId
        ? await find(db, input.gatewayId)
        : undefined;
      const { version, warnings } = await candidate(input, previous);
      return { version, warnings };
    });
    app.post('/api/v1/admin/gateways', limited, async (request, reply) => {
      if (await find(db)) throw exists();
      const input = create.parse(request.body);
      const checked = await candidate(input);
      const row = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833002)`);
        if (await find(tx)) throw exists();
        const [saved] = await tx
          .insert(gateways)
          .values({
            id: uuidv7(),
            name: 'default',
            kind: 'kong',
            ...checked.values,
            adminTokenCiphertext: checked.adminToken
              ? encrypt(
                  checked.adminToken,
                  connection.config.PORTAL_ENCRYPTION_KEY,
                )
              : null,
          })
          .returning();
        return saved!;
      });
      await enqueueReconcile();
      return reply.code(201).send(await view(db, row, connection));
    });
    app.patch('/api/v1/admin/gateways/:gatewayId', limited, async (request) => {
      const { gatewayId } = params.parse(request.params);
      const input = update.parse(request.body);
      for (;;) {
        const previous = (await find(db, gatewayId))!;
        editable(previous);
        const disableOnly =
          Object.keys(input).length === 1 && input.enabled === false;
        const checked = disableOnly
          ? undefined
          : await candidate({ ...previous, ...input }, previous);
        if (checked?.warnings.length && !input.confirmMissingKeys)
          throw new Problem(
            409,
            'gateway-keys-missing',
            'Active keys have no consumer on this Kong. Nothing was saved. Confirm to save anyway.',
            undefined,
            { affectedKeys: checked.warnings[0]!.affectedKeys },
          );
        let row: GatewayRow;
        try {
          row = await db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(71833002)`);
            const current = (await find(tx, gatewayId))!;
            editable(current);
            if (current.updatedAt.getTime() !== previous.updatedAt.getTime())
              throw new GatewayChanged();
            // Keys may have been created while the candidate checks ran or this save waited.
            if (checked?.found && !input.confirmMissingKeys) {
              const keys = await tx
                .select({ appId: credentials.appId })
                .from(credentials)
                .where(
                  and(
                    eq(credentials.gatewayId, gatewayId),
                    eq(credentials.status, 'active'),
                  ),
                );
              const affectedKeys = keys.filter(
                (key) => !checked.found!.has(key.appId),
              ).length;
              if (affectedKeys)
                throw new Problem(
                  409,
                  'gateway-keys-missing',
                  'Active keys have no consumer on this Kong. Nothing was saved. Confirm to save anyway.',
                  undefined,
                  { affectedKeys },
                );
            }
            const [saved] = await tx
              .update(gateways)
              .set({
                ...(checked
                  ? {
                      ...checked.values,
                      adminTokenCiphertext: checked.adminToken
                        ? encrypt(
                            checked.adminToken,
                            connection.config.PORTAL_ENCRYPTION_KEY,
                          )
                        : null,
                    }
                  : {}),
                ...(input.enabled !== undefined
                  ? { enabled: input.enabled }
                  : {}),
                updatedAt: new Date(),
              })
              .where(eq(gateways.id, gatewayId))
              .returning();
            return saved!;
          });
        } catch (error) {
          if (error instanceof GatewayChanged) continue;
          throw error;
        }
        await enqueueReconcile();
        return view(db, row, connection);
      }
    });
    app.delete('/api/v1/admin/gateways/:gatewayId', async (request, reply) => {
      const { gatewayId } = params.parse(request.params);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833002)`);
        const row = (await find(tx, gatewayId))!;
        editable(row);
        const counts = await dependents(tx, gatewayId);
        if (counts.apis || counts.activeKeys)
          throw new Problem(
            409,
            'gateway-in-use',
            "Published APIs or active keys depend on this gateway, so it wasn't removed.",
            undefined,
            counts,
          );
        await tx.delete(gateways).where(eq(gateways.id, gatewayId));
      });
      return reply.code(204).send();
    });
    app.post(
      '/api/v1/admin/gateways/:gatewayId/sample',
      async (request, reply) => {
        const { gatewayId } = params.parse(request.params);
        await find(db, gatewayId);
        let gateway = requireEnabled(await connection.load());
        if (!(await sampleAvailable(db, gateway.row, connection)))
          throw new Problem(
            409,
            'sample-not-available',
            'The sample is available only on the bundled Kong, before an API with slug sample is published.',
          );
        await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
          // Serialize the sample's fixed slug as shared locks permit simultaneous opt-ins.
          await tx.execute(sql`select pg_advisory_xact_lock(71833004)`);
          await find(tx, gatewayId);
          gateway = requireEnabled(await connection.load(tx));
          if (!(await sampleAvailable(tx, gateway.row, connection)))
            throw new Problem(
              409,
              'sample-not-available',
              'The sample API is no longer available.',
            );
          await seedSample(
            tx,
            gateway.adapter as KongAdapter,
            gatewayId,
            instanceId,
          );
        });
        await enqueueReconcile();
        const sample = (await publishedApis(db)).find(
          (row) => row.api.slug === 'sample',
        );
        return reply.code(201).send(apiDetail(sample!));
      },
    );
  });
}
