// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { and, eq, gte, lt, inArray, sql, desc } from 'drizzle-orm';
import {
  apps,
  credentials,
  usageDaily,
  usageCollection,
  usageIngestBatches,
  developerFirstCalls,
  user,
  apis,
  apiVersions,
  plans,
  type Database,
} from '@portal/db';
import type { UsageEvent } from '@portal/adapter-sdk';
import type { GatewayConnection, DbConnection } from './gateway-connection.js';
import type { Config } from './config.js';
import { encrypt, decrypt } from './crypto.js';
import { requireUser, type Auth } from './auth.js';
import { appAccess } from './teams.js';
import { Problem } from './problem.js';

export async function usageToken(db: DbConnection, config: Config) {
  const [existing] = await db
    .select()
    .from(usageCollection)
    .where(eq(usageCollection.id, 1));
  if (existing)
    return decrypt(existing.tokenCiphertext, config.PORTAL_ENCRYPTION_KEY);
  await db
    .insert(usageCollection)
    .values({
      id: 1,
      tokenCiphertext: encrypt(
        randomBytes(32).toString('base64url'),
        config.PORTAL_ENCRYPTION_KEY,
      ),
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(usageCollection)
    .where(eq(usageCollection.id, 1));
  return decrypt(row!.tokenCiphertext, config.PORTAL_ENCRYPTION_KEY);
}
export function monthPeriod(now: Date) {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ),
  };
}
export function collectionState(
  supported: boolean | undefined,
  configured: boolean,
  row: typeof usageCollection.$inferSelect | undefined,
  now: Date,
) {
  const lastUpdatedAt = row?.lastReceivedAt?.toISOString() ?? null;
  const status =
    supported === false
      ? 'unsupported'
      : !configured
        ? 'not-configured'
        : row?.configuredAt &&
            now.getTime() - row.configuredAt.getTime() > 300000 &&
            (!row.lastReceivedAt ||
              now.getTime() - row.lastReceivedAt.getTime() > 300000)
          ? 'behind'
          : 'ok';
  return { status, lastUpdatedAt };
}
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.floor((sorted[middle - 1]! + sorted[middle]!) / 2);
}
async function collection(
  db: Database,
  connection: GatewayConnection,
  now: Date,
) {
  const gateway = await connection.load();
  const [row] = await db
    .select()
    .from(usageCollection)
    .where(eq(usageCollection.id, 1));
  return collectionState(
    gateway?.adapter?.capabilities().usage,
    Boolean(gateway && connection.config.PORTAL_USAGE_INGEST_URL),
    row,
    now,
  );
}
export async function acceptUsage(
  db: Database,
  digest: string,
  events: UsageEvent[],
  now: Date,
) {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(usageIngestBatches)
      .values({ digest, receivedAt: now })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return;
    const calls = events.filter((e) => !e.heartbeat);
    const keys = calls.length
      ? await tx
          .select({ credential: credentials })
          .from(credentials)
          .innerJoin(apps, eq(apps.id, credentials.appId))
          .where(
            inArray(credentials.id, [
              ...new Set(calls.map((e) => e.credentialId)),
            ]),
          )
      : [];
    const keyMap = new Map(
      keys.map(({ credential }) => [credential.id, credential]),
    );
    const rows = new Map<string, typeof usageDaily.$inferInsert>();
    const firsts = new Map<string, typeof developerFirstCalls.$inferInsert>();
    for (const event of calls) {
      const key = keyMap.get(event.credentialId);
      if (!key || key.appId !== event.appId) continue;
      const day = event.startedAt.toISOString().slice(0, 10);
      const id = JSON.stringify([event.appId, day, event.serviceId]);
      const row = rows.get(id) ?? {
        appId: event.appId,
        day,
        serviceId: event.serviceId,
        count2xx: 0,
        count4xx: 0,
        count5xx: 0,
        countOther: 0,
      };
      const field =
        event.status < 300 && event.status >= 200
          ? 'count2xx'
          : event.status >= 400 && event.status < 500
            ? 'count4xx'
            : event.status >= 500
              ? 'count5xx'
              : 'countOther';
      row[field] = (row[field] ?? 0) + 1;
      rows.set(id, row);
      if (
        field === 'count2xx' &&
        key.createdBy &&
        (!firsts.has(key.createdBy) ||
          firsts.get(key.createdBy)!.firstCallAt > event.startedAt)
      )
        firsts.set(key.createdBy, {
          userId: key.createdBy,
          appId: event.appId,
          credentialId: key.id,
          firstCallAt: event.startedAt,
        });
    }
    // Consistent lock order prevents deadlocks between overlapping batches.
    const daily = [...rows.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => row);
    if (daily.length)
      await tx
        .insert(usageDaily)
        .values(daily)
        .onConflictDoUpdate({
          target: [usageDaily.appId, usageDaily.day, usageDaily.serviceId],
          set: {
            count2xx: sql`${usageDaily.count2xx} + excluded.count_2xx`,
            count4xx: sql`${usageDaily.count4xx} + excluded.count_4xx`,
            count5xx: sql`${usageDaily.count5xx} + excluded.count_5xx`,
            countOther: sql`${usageDaily.countOther} + excluded.count_other`,
          },
        });
    for (const [, row] of [...firsts].sort(([a], [b]) => a.localeCompare(b)))
      await tx
        .insert(developerFirstCalls)
        .values(row)
        .onConflictDoUpdate({
          target: developerFirstCalls.userId,
          set: {
            firstCallAt: sql`least(${developerFirstCalls.firstCallAt}, excluded.first_call_at)`,
            appId: sql`case when excluded.first_call_at < ${developerFirstCalls.firstCallAt} then excluded.app_id else ${developerFirstCalls.appId} end`,
            credentialId: sql`case when excluded.first_call_at < ${developerFirstCalls.firstCallAt} then excluded.credential_id else ${developerFirstCalls.credentialId} end`,
          },
        });
    await tx
      .update(usageCollection)
      .set({
        lastReceivedAt: now,
        ...(events.some((e) => e.heartbeat) ? { lastHeartbeatAt: now } : {}),
      })
      .where(eq(usageCollection.id, 1));
  });
}
export function registerUsage(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  connection: GatewayConnection,
) {
  // Encapsulation keeps the raw JSON parser and bearer-only auth confined to ingest.
  server.register(async (ingest) => {
    ingest.removeContentTypeParser('application/json');
    ingest.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
    ingest.post(
      '/api/v1/internal/usage/kong',
      {
        bodyLimit: 2 * 1024 * 1024,
        config: { rateLimit: false },
        onRequest: async (request) => {
          const [row] = await db
            .select()
            .from(usageCollection)
            .where(eq(usageCollection.id, 1));
          const expected = row
            ? decrypt(
                row.tokenCiphertext,
                connection.config.PORTAL_ENCRYPTION_KEY,
              )
            : '';
          const supplied =
            request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? '';
          const hash = (s: string) => createHash('sha256').update(s).digest();
          if (!expected || !timingSafeEqual(hash(expected), hash(supplied)))
            throw new Problem(
              401,
              'unauthenticated',
              'Usage ingest token required.',
            );
        },
      },
      async (request, reply) => {
        const raw = request.body as Buffer;
        let body: unknown;
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          throw new Problem(
            400,
            'validation',
            'Expected a JSON object or array.',
          );
        }
        if (!body || typeof body !== 'object')
          throw new Problem(
            400,
            'validation',
            'Expected a JSON object or array.',
          );
        if (Array.isArray(body) && body.length > 5000)
          throw new Problem(
            413,
            'payload-too-large',
            'At most 5000 entries are accepted.',
          );
        const gateway = await connection.load();
        const events = gateway?.adapter?.capabilities().usage
          ? gateway.adapter.parseUsageEvents(body)
          : [];
        await acceptUsage(
          db,
          createHash('sha256').update(raw).digest('hex'),
          events,
          new Date(),
        );
        return reply.code(204).send();
      },
    );
  });
  server.get('/api/v1/apps/:appId/usage', async (request) => {
    const viewer = await requireUser(auth, request);
    const { appId } = z.object({ appId: z.uuid() }).parse(request.params);
    const { app } = await appAccess(db, appId, viewer.id);
    const now = new Date(),
      period = monthPeriod(now),
      state = await collection(db, connection, now);
    const available =
      state.status !== 'unsupported' && state.status !== 'not-configured';
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, app.planId));
    const [row] = available
      ? await db
          .select({
            two: sql<number>`coalesce(sum(${usageDaily.count2xx}),0)`.mapWith(
              Number,
            ),
            four: sql<number>`coalesce(sum(${usageDaily.count4xx}),0)`.mapWith(
              Number,
            ),
            five: sql<number>`coalesce(sum(${usageDaily.count5xx}),0)`.mapWith(
              Number,
            ),
            other:
              sql<number>`coalesce(sum(${usageDaily.countOther}),0)`.mapWith(
                Number,
              ),
          })
          .from(usageDaily)
          .where(
            and(
              eq(usageDaily.appId, appId),
              gte(usageDaily.day, period.start.toISOString().slice(0, 10)),
              lt(usageDaily.day, period.resetsAt.toISOString().slice(0, 10)),
            ),
          )
      : [];
    return {
      appId,
      period: {
        start: period.start.toISOString(),
        resetsAt: period.resetsAt.toISOString(),
      },
      quota: plan?.monthlyQuota ?? null,
      total: row ? row.two + row.four + row.five + row.other : null,
      byStatus: row
        ? { '2xx': row.two, '4xx': row.four, '5xx': row.five, other: row.other }
        : null,
      collection: state,
    };
  });
  server.get('/api/v1/admin/insights', async (request) => {
    await requireUser(auth, request, true);
    const now = new Date(),
      from = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - 29,
        ),
      );
    const state = await collection(db, connection, now),
      available = !['unsupported', 'not-configured'].includes(state.status);
    const developers = await db
      .select({ user, first: developerFirstCalls.firstCallAt })
      .from(user)
      .leftJoin(developerFirstCalls, eq(user.id, developerFirstCalls.userId))
      .where(and(eq(user.role, 'developer'), gte(user.createdAt, from)))
      .orderBy(desc(user.createdAt), desc(user.id));
    const seconds = (createdAt: Date, first: Date | null) =>
      available && first
        ? Math.max(
            0,
            Math.floor((first.getTime() - createdAt.getTime()) / 1000),
          )
        : null;
    const times = developers.flatMap((d) => {
      const value = seconds(d.user.createdAt, d.first);
      return value === null ? [] : [value];
    });
    const totalCalls =
      sql<number>`sum(${usageDaily.count2xx} + ${usageDaily.count4xx} + ${usageDaily.count5xx} + ${usageDaily.countOther})`.mapWith(
        Number,
      );
    const window = and(
      gte(usageDaily.day, from.toISOString().slice(0, 10)),
      lt(
        usageDaily.day,
        new Date(now.getTime() + 86400000).toISOString().slice(0, 10),
      ),
    );
    const [active] = available
      ? await db
          .select({
            value: sql<number>`count(distinct ${usageDaily.appId})`.mapWith(
              Number,
            ),
          })
          .from(usageDaily)
          .where(
            and(
              window,
              sql`(${usageDaily.count2xx} + ${usageDaily.count4xx} + ${usageDaily.count5xx} + ${usageDaily.countOther}) > 0`,
            ),
          )
      : [];
    const topApis = available
      ? await db
          .select({
            apiId: apis.id,
            slug: apis.slug,
            name: apiVersions.title,
            calls: totalCalls,
          })
          .from(usageDaily)
          .innerJoin(apis, eq(apis.gatewayServiceId, usageDaily.serviceId))
          .innerJoin(apiVersions, eq(apiVersions.id, apis.latestVersionId))
          .where(window)
          .groupBy(apis.id, apis.slug, apiVersions.title)
          .having(sql`${totalCalls} > 0`)
          .orderBy(desc(totalCalls), apis.slug)
          .limit(5)
      : null;
    return {
      window: { from: from.toISOString(), to: now.toISOString() },
      signups: developers.length,
      activeApps: active?.value ?? null,
      topApis,
      timeToFirstCall: {
        targetSeconds: 600,
        medianSeconds: median(times),
        covered: times.length,
        total: developers.length,
        developers: developers.slice(0, 500).map((d) => ({
          userId: d.user.id,
          name: d.user.name,
          email: d.user.email,
          signedUpAt: d.user.createdAt.toISOString(),
          firstCallAt: available ? (d.first?.toISOString() ?? null) : null,
          secondsToFirstCall: seconds(d.user.createdAt, d.first),
        })),
      },
      collection: state,
    };
  });
}
export async function ensureUsage(
  db: DbConnection,
  connection: GatewayConnection,
  log: Pick<FastifyBaseLogger, 'warn'>,
) {
  if (!connection.config.PORTAL_USAGE_INGEST_URL) return null;
  try {
    const gateway = await connection.load(db);
    if (!gateway?.adapter?.capabilities().usage || !gateway.row.enabled)
      return null;
    const result = await gateway.adapter.ensureUsageCollection();
    await db
      .update(usageCollection)
      .set({
        configuredAt: sql`coalesce(${usageCollection.configuredAt}, now())`,
      })
      .where(eq(usageCollection.id, 1));
    connection.usageHeartbeatPath = result.heartbeatPath;
    return { ...result, proxyInternalUrl: gateway.row.proxyInternalUrl };
  } catch {
    log.warn(
      { code: 'usage-unavailable' },
      'Usage collection could not be configured',
    );
    return null;
  }
}
export async function usageHeartbeat(
  _db: Database,
  connection: GatewayConnection,
  log: Pick<FastifyBaseLogger, 'warn'>,
  fetcher = fetch,
) {
  if (
    !connection.config.PORTAL_USAGE_INGEST_URL ||
    !connection.usageHeartbeatPath
  )
    return;
  try {
    const gateway = await connection.load();
    if (!gateway?.adapter?.capabilities().usage || !gateway.row.enabled) return;
    const response = await fetcher(
      gateway.row.proxyInternalUrl.replace(/\/$/, '') +
        connection.usageHeartbeatPath,
      { signal: AbortSignal.timeout(5000), redirect: 'manual' },
    );
    await response.body?.cancel();
    if (!response.ok) throw new Error('Heartbeat refused');
  } catch {
    log.warn({ code: 'usage-heartbeat-failed' }, 'Usage heartbeat failed');
  }
}
export async function usageHousekeeping(
  db: Database,
  retentionDays: number,
  now = new Date(),
) {
  await db
    .delete(usageDaily)
    .where(
      lt(
        usageDaily.day,
        new Date(now.getTime() - retentionDays * 86400000)
          .toISOString()
          .slice(0, 10),
      ),
    );
  await db
    .delete(usageIngestBatches)
    .where(
      lt(usageIngestBatches.receivedAt, new Date(now.getTime() - 86400000)),
    );
}
