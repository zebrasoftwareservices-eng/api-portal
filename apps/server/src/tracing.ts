// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { and, desc, eq, inArray, ilike, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import {
  apis,
  apiVersions,
  apps,
  gatewayConsumers,
  teams,
  traceLatest,
  tracingSelections,
  tracingSettings,
  user,
  type Database,
} from '@portal/db';
import {
  GatewayUnavailableError,
  InvalidTraceBatchError,
  TracingUnavailableError,
  type TraceBatch,
  type TracingPlan,
} from '@portal/adapter-sdk';
import { decrypt, encrypt } from './crypto.js';
import { requireUser, type Auth } from './auth.js';
import { normalizeUrl, requireEnabled, type GatewayConnection } from './gateway-connection.js';
import { Problem, notFound } from './problem.js';

export const TRACING_REQUIRE_PASSING_TEST = false;
export const traceScopeKey = (batch: TraceBatch) => {
  if (!batch.resource.apiId) throw new Error('Trace batch API scope was not resolved.');
  return batch.resource.apiId;
};
const settingsInput = z.strictObject({
  traceEndpoint: z.string().max(2048),
  instrumentations: z
    .array(
      z.enum([
        'all',
        'off',
        'request',
        'router',
        'balancer',
        'plugin_rewrite',
        'plugin_access',
        'plugin_header_filter',
        'db_query',
        'dns_query',
        'http_client',
      ]),
    )
    .min(1)
    .refine((values) => new Set(values).size === values.length),
  samplingRate: z.number().min(0).max(1),
});

function defaultSettings(config: GatewayConnection['config']) {
  return {
    traceEndpoint:
      config.PORTAL_TRACE_INGEST_URL ??
      'http://server:4000/api/v1/internal/traces/kong',
    instrumentations: [
      'request',
      'router',
      'balancer',
      'plugin_rewrite',
      'plugin_access',
      'plugin_header_filter',
    ],
    samplingRate: 1,
  };
}

async function token(db: Database, connection: GatewayConnection) {
  const [row] = await db.select().from(tracingSettings).limit(1);
  return row
    ? decrypt(row.tokenCiphertext, connection.config.PORTAL_ENCRYPTION_KEY)
    : null;
}

export async function resolveSelectionApps(
  db: Database,
  selection: typeof tracingSelections.$inferSelect,
) {
  if (selection.kind === 'api') return [];
  const condition =
    selection.kind === 'developer'
      ? eq(apps.createdBy, selection.userId!)
      : eq(apps.teamId, selection.teamId!);
  return db
    .select({ appId: apps.id, consumerId: gatewayConsumers.externalId })
    .from(apps)
    .innerJoin(gatewayConsumers, eq(gatewayConsumers.appId, apps.id))
    .where(and(eq(apps.status, 'active'), condition));
}

export async function applyTracing(
  db: Database,
  connection: GatewayConnection,
  log?: Pick<FastifyBaseLogger, 'warn'>,
) {
  const [settings] = await db.select().from(tracingSettings).limit(1);
  if (!settings) return;
  const gateway = requireEnabled(await connection.load());
  const selections = await db.select().from(tracingSelections);
  const targets: TracingPlan['targets'] = [];
  for (const selection of selections) {
    if (selection.kind === 'api') {
      const [api] = await db
        .select({ service: apis.gatewayServiceId })
        .from(apis)
        .where(eq(apis.id, selection.apiId!));
      if (api)
        targets.push({
          scope: { service: api.service },
          selections: [selection.id],
          apiId: selection.apiId!,
        });
    } else {
      for (const app of await resolveSelectionApps(db, selection))
        targets.push({ scope: { app: app.appId }, selections: [selection.id] });
    }
  }
  try {
    await gateway.adapter.applyTracing({
      endpoint: settings.traceEndpoint,
      token: decrypt(
        settings.tokenCiphertext,
        connection.config.PORTAL_ENCRYPTION_KEY,
      ),
      targets,
    });
    await db
      .update(tracingSettings)
      .set({ applyStatus: 'applied', applyMessage: null, appliedAt: new Date() })
      .where(eq(tracingSettings.id, 1));
  } catch (error) {
    if (error instanceof GatewayUnavailableError) throw error;
    const message =
      error instanceof TracingUnavailableError
        ? error.message
        : 'The tracing configuration could not be applied.';
    await db
      .update(tracingSettings)
      .set({ applyStatus: 'failed', applyMessage: message })
      .where(eq(tracingSettings.id, 1));
    log?.warn({ error: error instanceof Error ? error.name : 'unknown' }, message);
  }
}

async function selectionView(
  db: Database,
  selection: typeof tracingSelections.$inferSelect,
) {
  let label: string = selection.kind;
  if (selection.apiId) {
    const [row] = await db.select({ label: apis.slug }).from(apis).where(eq(apis.id, selection.apiId));
    label = row?.label ?? label;
  } else if (selection.userId) {
    const [row] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, selection.userId));
    label = row ? `${row.name} (${row.email})` : label;
  } else if (selection.teamId) {
    const [row] = await db.select({ label: teams.name }).from(teams).where(eq(teams.id, selection.teamId));
    label = row?.label ?? label;
  }
  return {
    id: selection.id,
    kind: selection.kind,
    targetId: selection.apiId ?? selection.userId ?? selection.teamId!,
    label,
    createdAt: selection.createdAt.toISOString(),
    apps:
      selection.kind === 'api'
        ? null
        : (await resolveSelectionApps(db, selection)).length,
  };
}

async function tracingView(db: Database, connection: GatewayConnection) {
  const [gateway, row, selections] = await Promise.all([
    connection.load(),
    db.select().from(tracingSettings).limit(1).then((rows) => rows[0]),
    db.select().from(tracingSelections).orderBy(desc(tracingSelections.createdAt)),
  ]);
  return {
    supported: gateway?.adapter?.capabilities().tracing === true,
    configured: Boolean(row),
    settings: row
      ? {
          traceEndpoint: row.traceEndpoint,
          instrumentations: row.instrumentations,
          samplingRate: row.samplingRate,
        }
      : defaultSettings(connection.config),
    selections: await Promise.all(selections.map((selection) => selectionView(db, selection))),
    lastTest: row?.lastTestAt
      ? {
          passed: row.lastTestPassed === true,
          at: row.lastTestAt.toISOString(),
          cause: row.lastTestCause,
        }
      : null,
    apply: {
      status: row?.applyStatus ?? 'pending',
      at: row?.appliedAt?.toISOString() ?? null,
      message: row?.applyMessage ?? null,
    },
  };
}

export function traceView(
  row: typeof traceLatest.$inferSelect,
  adapter: { classifySpan(name: string): { label: string; plugin?: string } },
) {
  const startedNs = BigInt(row.startedAt.getTime()) * 1_000_000n;
  const root = row.spans.find((span) => span.spanId === row.rootSpanId);
  const nonRoot = row.spans.filter((span) => span.spanId !== row.rootSpanId);
  const slowest = [...nonRoot].sort((a, b) => {
    const duration = BigInt(b.durationNs) - BigInt(a.durationNs);
    return duration === 0n ? Number(BigInt(a.startNs) - BigInt(b.startNs)) : duration > 0n ? 1 : -1;
  })[0]?.spanId;
  return {
    traceId: row.traceId,
    receivedAt: row.receivedAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    durationMs: root ? Number(BigInt(root.durationNs)) / 1e6 : null,
    request: row.request,
    spans: row.spans.map((span) => {
      const classification = adapter.classifySpan(span.name);
      return {
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        label: classification.label,
        plugin: classification.plugin ?? null,
        startOffsetMs: Number(BigInt(span.startNs) - startedNs) / 1e6,
        durationMs: Number(BigInt(span.durationNs)) / 1e6,
        status: span.status === '2' ? 'error' : span.status === '1' ? 'ok' : 'unset',
        slowest: span.spanId === slowest,
      };
    }),
  };
}

export function registerTracing(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  connection: GatewayConnection,
  enqueueApply: () => Promise<unknown> = () => applyTracing(db, connection),
) {
  server.get('/api/v1/admin/tracing', async (request) => {
    await requireUser(auth, request, true);
    return tracingView(db, connection);
  });
  server.put('/api/v1/admin/tracing', async (request) => {
    await requireUser(auth, request, true);
    const input = settingsInput.parse(request.body);
    const traceEndpoint = normalizeUrl(input.traceEndpoint, 'traceEndpoint');
    const previous = await token(db, connection);
    const value = previous ?? randomBytes(32).toString('base64url');
    await db
      .insert(tracingSettings)
      .values({
        id: 1,
        ...input,
        traceEndpoint,
        tokenCiphertext: encrypt(value, connection.config.PORTAL_ENCRYPTION_KEY),
      })
      .onConflictDoUpdate({
        target: tracingSettings.id,
        set: {
          traceEndpoint,
          instrumentations: input.instrumentations,
          samplingRate: input.samplingRate,
          configuredAt: new Date(),
          applyStatus: 'pending',
          applyMessage: null,
        },
      });
    await enqueueApply();
    return tracingView(db, connection);
  });
  server.post('/api/v1/admin/tracing/test', async (request) => {
    await requireUser(auth, request, true);
    const input = settingsInput.parse(request.body);
    const gateway = requireEnabled(await connection.load());
    if (!gateway.adapter.capabilities().tracing)
      throw new Problem(409, 'tracing-unsupported', 'Tracing is not available for this gateway.');
    let node;
    try {
      node = await gateway.adapter.inspectTracing();
    } catch {
      throw new Problem(
        422,
        'tracing-check-failed',
        'Kong could not be reached.',
        undefined,
        { cause: 'gateway-unreachable' },
      );
    }
    if (!node.instrumentations.some((value) => value === 'request' || value === 'all'))
      throw new Problem(
        422,
        'tracing-check-failed',
        'Tracing is off on this Kong.',
        undefined,
        { cause: 'tracing-off', node },
      );
    const nonce = randomBytes(16).toString('hex');
    const [settings] = await db.select().from(tracingSettings).limit(1);
    const probeToken = settings
      ? decrypt(settings.tokenCiphertext, connection.config.PORTAL_ENCRYPTION_KEY)
      : randomBytes(32).toString('base64url');
    await db
      .insert(tracingSettings)
      .values({
        id: 1,
        ...input,
        tokenCiphertext: encrypt(probeToken, connection.config.PORTAL_ENCRYPTION_KEY),
        probeNonce: nonce,
      })
      .onConflictDoUpdate({ target: tracingSettings.id, set: { probeNonce: nonce, probeReceivedAt: null } });
    let probePath: string;
    try {
      ({ probePath } = await gateway.adapter.ensureTraceProbe({ endpoint: normalizeUrl(input.traceEndpoint, 'traceEndpoint'), token: probeToken, nonce }));
    } catch (error) {
      throw new Problem(
        422,
        'tracing-check-failed',
        error instanceof TracingUnavailableError
          ? 'Kong refused the tracing plugin.'
          : 'The trace probe could not be configured.',
        undefined,
        {
          cause:
            error instanceof TracingUnavailableError
              ? 'gateway-rejected'
              : 'gateway-unreachable',
          node,
        },
      );
    }
    if (!(await gateway.adapter.checkProxy(gateway.row.proxyInternalUrl + probePath)))
      throw new Problem(
        422,
        'tracing-check-failed',
        "The portal couldn't reach Kong's proxy.",
        undefined,
        { cause: 'proxy-unreachable', node },
      );
    const deadline = Date.now() + 10_000;
    let received = false;
    while (Date.now() < deadline) {
      const [check] = await db.select({ at: tracingSettings.probeReceivedAt }).from(tracingSettings).where(eq(tracingSettings.id, 1));
      if (check?.at) { received = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const at = new Date();
    await db.update(tracingSettings).set({ lastTestPassed: received, lastTestCause: received ? null : 'endpoint-unreachable', lastTestAt: at }).where(eq(tracingSettings.id, 1));
    if (!received)
      throw new Problem(
        422,
        'tracing-check-failed',
        'The trace endpoint did not receive the probe.',
        undefined,
        { cause: 'endpoint-unreachable', node },
      );
    return { passed: true, at: at.toISOString(), node, warnings: [] };
  });
  server.post('/api/v1/admin/tracing/selections', async (request, reply) => {
    const admin = await requireUser(auth, request, true);
    if (!(await token(db, connection))) throw new Problem(409, 'tracing-not-configured', 'Save tracing settings first.');
    const input = z.strictObject({ kind: z.enum(['api', 'developer', 'team']), targetId: z.uuid() }).parse(request.body);
    const target = input.kind === 'api' ? apis : input.kind === 'developer' ? user : teams;
    const [exists] = await db.select({ id: target.id }).from(target as typeof apis).where(eq(target.id, input.targetId));
    if (!exists) throw notFound();
    const values = {
      id: uuidv7(), kind: input.kind, createdBy: admin.id,
      apiId: input.kind === 'api' ? input.targetId : null,
      userId: input.kind === 'developer' ? input.targetId : null,
      teamId: input.kind === 'team' ? input.targetId : null,
    };
    const inserted = await db.insert(tracingSelections).values(values).onConflictDoNothing().returning();
    const selection = inserted[0] ?? (await db.select().from(tracingSelections).where(or(eq(tracingSelections.apiId, input.targetId), eq(tracingSelections.userId, input.targetId), eq(tracingSelections.teamId, input.targetId))).limit(1))[0]!;
    await db.update(tracingSettings).set({ applyStatus: 'pending' }).where(eq(tracingSettings.id, 1));
    await enqueueApply();
    return reply.code(inserted.length ? 201 : 200).send(await selectionView(db, selection));
  });
  server.delete('/api/v1/admin/tracing/selections/:selectionId', async (request, reply) => {
    await requireUser(auth, request, true);
    const { selectionId } = z.object({ selectionId: z.uuid() }).parse(request.params);
    const deleted = await db.delete(tracingSelections).where(eq(tracingSelections.id, selectionId)).returning();
    if (!deleted.length) throw notFound();
    await db.update(tracingSettings).set({ applyStatus: 'pending' }).where(eq(tracingSettings.id, 1));
    await enqueueApply();
    return reply.code(204).send();
  });
  server.get('/api/v1/admin/tracing/developers', async (request) => {
    await requireUser(auth, request, true);
    const { q = '' } = z.object({ q: z.string().max(100).optional() }).parse(request.query);
    const rows = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(and(eq(user.role, 'developer'), or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`)))).limit(20);
    return { items: rows };
  });
  server.get('/api/v1/admin/tracing/latest', async (request) => {
    await requireUser(auth, request, true);
    const { apiId } = z.object({ apiId: z.uuid().optional() }).parse(request.query);
    const gateway = await connection.load();
    const rows = await db
      .select({ trace: traceLatest, apiId: apis.id, apiSlug: apis.slug, apiTitle: apiVersions.title })
      .from(traceLatest)
      .innerJoin(apis, eq(traceLatest.apiId, apis.id))
      .leftJoin(apiVersions, eq(apis.latestVersionId, apiVersions.id))
      .orderBy(desc(traceLatest.receivedAt));
    const selected = apiId ? rows.find((row) => row.apiId === apiId) : rows[0];
    const choices = rows.map((row) => ({
      id: row.apiId,
      name: row.apiTitle ?? row.apiSlug,
      receivedAt: row.trace.receivedAt.toISOString(),
    }));
    if (!selected || !gateway?.adapter) return { trace: null, apis: choices };
    return {
      trace: {
        ...traceView(selected.trace, gateway.adapter),
        api: { id: selected.apiId, slug: selected.apiSlug, name: selected.apiTitle ?? selected.apiSlug },
      },
      apis: choices,
    };
  });

  server.register(async (ingest) => {
    ingest.addContentTypeParser('application/x-protobuf', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    ingest.post('/api/v1/internal/traces/kong', {
      bodyLimit: 1024 * 1024,
      config: { rateLimit: false },
      // Media type first (ingest flow step 1): JSON would otherwise reach the global parser and the selection checks.
      onRequest: async (request) => {
        const type = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
        if (type !== 'application/x-protobuf') throw new Problem(415, 'unsupported-media-type', 'Trace ingest accepts application/x-protobuf only.');
      },
    }, async (request, reply) => {
      const expected = await token(db, connection);
      const supplied = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? '';
      const hash = (value: string) => createHash('sha256').update(value).digest();
      if (!expected || !timingSafeEqual(hash(expected), hash(supplied))) throw new Problem(401, 'unauthenticated', 'Trace ingest token required.');
      const gateway = await connection.load();
      if (!gateway?.adapter) throw new Problem(422, 'trace-not-selected', 'Trace does not belong to an active selection.');
      let batch: TraceBatch;
      try { batch = gateway.adapter.parseTraceBatch(request.body as Buffer); }
      catch (error) { if (error instanceof InvalidTraceBatchError) throw new Problem(400, 'validation', 'Invalid OTLP trace batch.'); throw error; }
      const [settings] = await db.select().from(tracingSettings).limit(1);
      if (batch.resource.probe && batch.resource.probe === settings?.probeNonce) {
        await db.update(tracingSettings).set({ probeReceivedAt: new Date() }).where(eq(tracingSettings.id, 1));
        return reply.type('application/x-protobuf').send(Buffer.alloc(0));
      }
      const [instance] = await db.execute<{ instance_id: string }>(sql`select instance_id from instance_settings limit 1`);
      const active = batch.resource.selections.length ? await db.select({ id: tracingSelections.id }).from(tracingSelections).where(inArray(tracingSelections.id, batch.resource.selections)) : [];
      if (batch.resource.instance !== instance?.instance_id || !active.length) throw new Problem(422, 'trace-not-selected', 'Trace does not belong to an active selection.');
      if (!batch.resource.apiId) {
        const routePath = batch.spans.find((span) => span.parentSpanId === null)?.routePath;
        const [api] = routePath
          ? await db.select({ id: apis.id }).from(apis).where(eq(apis.routePath, routePath)).limit(1)
          : [];
        if (!api) throw new Problem(422, 'trace-not-selected', 'Trace does not match a published API.');
        batch = { ...batch, resource: { ...batch.resource, apiId: api.id } };
      }
      const scopeKey = traceScopeKey(batch);
      const groups = new Map<string, TraceBatch['spans']>();
      for (const span of batch.spans) groups.set(span.traceId, [...(groups.get(span.traceId) ?? []), span]);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833026)`);
        for (const [traceId, spans] of groups) {
          const root = spans.find((span) => span.parentSpanId === null);
          const started = new Date(Number(BigInt((root ?? spans[0]!).startNs) / 1_000_000n));
          const [previous] = await tx.select().from(traceLatest).where(eq(traceLatest.scopeKey, scopeKey)).for('update');
          if (previous && previous.traceId !== traceId && previous.startedAt > started) continue;
          const sameTrace = previous?.traceId === traceId;
          const merged = sameTrace ? [...previous.spans] : [];
          for (const span of spans) {
            const stored = { spanId: span.spanId, parentSpanId: span.parentSpanId, name: span.name, startNs: span.startNs, durationNs: span.durationNs, status: span.status };
            const index = merged.findIndex((value) => value.spanId === span.spanId);
            if (index >= 0) merged[index] = stored; else if (merged.length < 1000) merged.push(stored);
          }
          const traceStarted = sameTrace && previous.startedAt < started ? previous.startedAt : started;
          await tx.insert(traceLatest).values({ scopeKey, traceId, apiId: scopeKey, startedAt: traceStarted, receivedAt: new Date(), rootSpanId: root?.spanId ?? previous?.rootSpanId ?? spans[0]!.spanId, request: root?.request ?? previous?.request ?? null, spans: merged }).onConflictDoUpdate({ target: traceLatest.scopeKey, set: { traceId, apiId: scopeKey, startedAt: traceStarted, receivedAt: new Date(), rootSpanId: root?.spanId ?? previous?.rootSpanId ?? spans[0]!.spanId, request: root?.request ?? previous?.request ?? null, spans: merged } });
        }
      });
      server.log.info({ traceIds: [...groups.keys()], spanCount: batch.spans.length }, 'Trace batch accepted');
      return reply.type('application/x-protobuf').send(Buffer.alloc(0));
    });
  });
}
