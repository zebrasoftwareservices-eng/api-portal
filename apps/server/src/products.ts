// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import {
  products,
  productApis,
  plans,
  planApis,
  apis,
  apiVersions,
  type Database,
} from '@portal/db';
import { requireUser, type Auth } from './auth.js';
import { Problem, notFound } from './problem.js';
import type { GatewayConnection } from './gateway-connection.js';
import type { EnqueueMail } from './mail/queue.js';
import {
  markRevocations,
  revokeApps,
  type EnqueueRevocation,
} from './revocation.js';
import {
  productSubscriptions,
  confirmSubscriptions,
} from './product-access.js';
import {
  loadViewer,
  visibleProductIds,
  productVisible,
  canSelfSubscribe,
  type Viewer,
} from './access-policy.js';
import { publishedApis, apiSummary } from './catalog.js';
import type { Db } from './app-plans.js';
const ids = z
  .array(z.uuid())
  .min(1)
  .max(50)
  .refine((v) => new Set(v).size === v.length, 'API IDs must be unique');
const productFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().min(1).max(2000),
  apiIds: ids,
};
const slug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const planSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(40),
    description: z.string().max(280).optional(),
    rateLimit: z.number().int().min(1).max(1000000),
    rateLimitUnit: z.enum(['second', 'minute']),
    monthlyQuota: z.number().int().min(1).max(2000000000),
    apiIds: ids,
    requiresApproval: z.boolean().default(false),
    existingSubscriptions: z.enum(['keep', 'revoke']).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.monthlyQuota < v.rateLimit)
      ctx.addIssue({
        code: 'custom',
        path: ['monthlyQuota'],
        message: 'Monthly quota must be at least the rate limit.',
      });
  });
const params = z.object({ productId: z.uuid() });
async function checkApis(db: Db, apiIds: string[]) {
  if (
    (
      await db
        .select({ id: apis.id })
        .from(apis)
        .where(inArray(apis.id, apiIds))
    ).length !== apiIds.length
  )
    throw notFound();
}
async function planView(db: Db, plan: typeof plans.$inferSelect) {
  const included = await db
    .select({ id: apis.id, slug: apis.slug, title: apiVersions.title })
    .from(planApis)
    .innerJoin(apis, eq(apis.id, planApis.apiId))
    .innerJoin(apiVersions, eq(apiVersions.id, apis.latestVersionId))
    .where(eq(planApis.planId, plan.id))
    .orderBy(asc(apiVersions.title));
  return {
    id: plan.id,
    productId: plan.productId,
    name: plan.name,
    description: plan.description,
    rateLimit: plan.rateLimit,
    rateLimitUnit: plan.rateLimitUnit,
    monthlyQuota: plan.monthlyQuota,
    requiresApproval: plan.requiresApproval,
    quotaPeriod: 'calendar-month-utc',
    apis: included,
    createdAt: plan.createdAt.toISOString(),
  };
}
async function detail(
  db: Database,
  product: typeof products.$inferSelect,
  viewer?: Viewer,
) {
  const links = await db
    .select()
    .from(productApis)
    .where(eq(productApis.productId, product.id));
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.productId, product.id))
    .orderBy(asc(plans.createdAt), asc(plans.id));
  const included = (await publishedApis(db, viewer))
    .filter((r) => links.some((l) => l.apiId === r.api.id))
    .sort((a, b) => a.version.title.localeCompare(b.version.title));
  return {
    visibility: product.visibility,
    selfService: canSelfSubscribe(product),
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    apiCount: links.length,
    planCount: rows.length,
    createdAt: product.createdAt.toISOString(),
    apis: included.map(apiSummary),
    plans: await Promise.all(rows.map((p) => planView(db, p))),
  };
}
function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? pgCode(error.cause) : undefined;
}
export function registerProducts(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  enqueue: () => Promise<unknown>,
  connection: GatewayConnection,
  enqueueMail: EnqueueMail,
  enqueueRevocation: EnqueueRevocation,
) {
  server.get('/api/v1/products', async (request) => ({
    items: await Promise.all(
      (
        await db
          .select()
          .from(products)
          .where(visibleProductIds(db, await loadViewer(db, auth, request)))
          .orderBy(asc(products.name))
      ).map(async (p) => {
        const result = await detail(db, p, await loadViewer(db, auth, request));
        return {
          visibility: result.visibility,
          id: result.id,
          slug: result.slug,
          name: result.name,
          description: result.description,
          apiCount: result.apiCount,
          planCount: result.planCount,
          createdAt: result.createdAt,
        };
      }),
    ),
  }));
  server.get('/api/v1/products/:productSlug', async (request) => {
    const { productSlug } = z
      .object({ productSlug: z.string() })
      .parse(request.params);
    const [row] = await db
      .select()
      .from(products)
      .where(eq(products.slug, productSlug));
    const viewer = await loadViewer(db, auth, request);
    if (!row || !(await productVisible(db, viewer, row.id))) throw notFound();
    return detail(db, row, viewer);
  });
  server.post('/api/v1/admin/products', async (request, reply) => {
    const user = await requireUser(auth, request, true);
    const input = z
      .strictObject({ ...productFields, slug: slug.optional() })
      .parse(request.body);
    const productSlug = slug.parse(
      input.slug ??
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 64)
          .replace(/-$/, ''),
    );
    let row: typeof products.$inferSelect;
    try {
      row = await db.transaction(async (tx) => {
        await checkApis(tx, input.apiIds);
        const [p] = await tx
          .insert(products)
          .values({
            id: uuidv7(),
            name: input.name,
            description: input.description,
            slug: productSlug,
            createdBy: user.id,
          })
          .returning();
        await tx
          .insert(productApis)
          .values(input.apiIds.map((apiId) => ({ productId: p!.id, apiId })));
        return p!;
      });
    } catch (e) {
      if (pgCode(e) === '23505')
        throw new Problem(
          409,
          'product-slug-taken',
          'A product already uses this slug.',
        );
      throw e;
    }
    return reply
      .code(201)
      .header('Location', `/api/v1/products/${row.slug}`)
      .send(await detail(db, row));
  });
  server.patch('/api/v1/admin/products/:productId', async (request) => {
    await requireUser(auth, request, true);
    const { productId } = params.parse(request.params);
    const input = z
      .strictObject(productFields)
      .partial()
      .refine((v) => Object.keys(v).length > 0)
      .parse(request.body);
    let row: typeof products.$inferSelect;
    try {
      row = await db.transaction(async (tx) => {
        const [p] = await tx
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .for('update');
        if (!p) throw notFound();
        if (input.apiIds) {
          await checkApis(tx, input.apiIds);
          const existing = await tx
            .select()
            .from(productApis)
            .where(eq(productApis.productId, productId));
          const removed = existing
            .filter((x) => !input.apiIds!.includes(x.apiId))
            .map((x) => x.apiId);
          if (removed.length)
            await tx
              .delete(productApis)
              .where(
                and(
                  eq(productApis.productId, productId),
                  inArray(productApis.apiId, removed),
                ),
              );
          await tx
            .insert(productApis)
            .values(input.apiIds.map((apiId) => ({ productId, apiId })))
            .onConflictDoNothing();
        }
        const [result] = await tx
          .update(products)
          .set({
            name: input.name,
            description: input.description,
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId))
          .returning();
        return result!;
      });
    } catch (e) {
      if (pgCode(e) === '23503')
        throw new Problem(
          409,
          'api-in-plan',
          'Remove the API from its plans first.',
        );
      throw e;
    }
    return detail(db, row);
  });
  const savePlan = async (request: FastifyRequest, update: boolean) => {
    await requireUser(auth, request, true);
    const { productId, planId } = params
      .extend({ planId: z.uuid().optional() })
      .parse(request.params);
    const parsed = planSchema.safeParse(request.body);
    let revokeIds: string[] = [];
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71833005)`);
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .for('update');
        if (!product) throw notFound();
        const allowed = await tx
          .select()
          .from(productApis)
          .where(eq(productApis.productId, productId));
        const errors = parsed.success
          ? []
          : parsed.error.issues.map((issue) => ({
              pointer: '/' + issue.path.join('/'),
              message: issue.message,
            }));
        const limits = z
          .object({ rateLimit: z.number(), monthlyQuota: z.number() })
          .safeParse(request.body);
        if (
          limits.success &&
          limits.data.monthlyQuota < limits.data.rateLimit &&
          !errors.some((e) => e.pointer === '/monthlyQuota')
        )
          errors.push({
            pointer: '/monthlyQuota',
            message: 'Monthly quota must be at least the rate limit.',
          });
        const selected = z
          .object({ apiIds: z.array(z.uuid()) })
          .safeParse(request.body);
        if (
          selected.success &&
          selected.data.apiIds.some(
            (id) => !allowed.some((a) => a.apiId === id),
          ) &&
          !errors.some((e) => e.pointer === '/apiIds')
        )
          errors.push({
            pointer: '/apiIds',
            message: 'Choose APIs in this product.',
          });
        if (errors.length)
          throw new Problem(
            400,
            'validation',
            'Request validation failed.',
            errors,
          );
        if (!parsed.success) throw parsed.error;
        const input = parsed.data;
        let row: typeof plans.$inferSelect;
        const values = {
          name: input.name,
          description: input.description ?? null,
          rateLimit: input.rateLimit,
          rateLimitUnit: input.rateLimitUnit,
          monthlyQuota: input.monthlyQuota,
          requiresApproval: input.requiresApproval,
        };
        if (update) {
          const [old] = await tx
            .select()
            .from(plans)
            .where(and(eq(plans.id, planId!), eq(plans.productId, productId)));
          if (!old) throw notFound();
          if (!old.requiresApproval && input.requiresApproval) {
            const affected = (
              await productSubscriptions(tx, productId, old.id)
            ).filter((r) => r.app.status === 'active');
            confirmSubscriptions(affected, input.existingSubscriptions);
            if (input.existingSubscriptions === 'revoke') {
              revokeIds = affected.map((r) => r.app.id);
              await markRevocations(tx, revokeIds, 'approval');
            }
          }
          [row] = (await tx
            .update(plans)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(plans.id, old.id))
            .returning()) as [typeof plans.$inferSelect];
          await tx.delete(planApis).where(eq(planApis.planId, row.id));
        } else {
          [row] = (await tx
            .insert(plans)
            .values({ id: uuidv7(), productId, ...values })
            .returning()) as [typeof plans.$inferSelect];
        }
        await tx
          .insert(planApis)
          .values(
            input.apiIds.map((apiId) => ({ planId: row.id, productId, apiId })),
          );
        if (revokeIds.length) await enqueueRevocation(revokeIds, tx);
        return planView(tx, row);
      });
      if (revokeIds.length) {
        await revokeApps(db, connection, revokeIds, enqueueMail);
      }
      return result;
    } catch (e) {
      if (pgCode(e) === '23505')
        throw new Problem(
          409,
          'plan-name-taken',
          'A plan already uses this name in this product.',
        );
      throw e;
    }
  };
  server.post(
    '/api/v1/admin/products/:productId/plans',
    async (request, reply) =>
      reply.code(201).send(await savePlan(request, false)),
  );
  server.put(
    '/api/v1/admin/products/:productId/plans/:planId',
    async (request) => {
      const result = await savePlan(request, true);
      await enqueue();
      return result;
    },
  );
}
