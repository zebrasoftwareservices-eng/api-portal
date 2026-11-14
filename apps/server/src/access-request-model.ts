// SPDX-License-Identifier: Apache-2.0
import { accessRequests, apps, plans, products, teams, user } from '@portal/db';
import { eq, and, ne } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Db } from './app-plans.js';
import { Problem, notFound } from './problem.js';
export function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? pgCode(error.cause) : undefined;
}
export function requestConflict(error: unknown): never {
  if (pgCode(error) === '23505')
    throw new Problem(409, 'request-pending', 'A request is already pending.');
  throw error;
}
export async function checkAppName(db: Db, teamId: string, name: string) {
  const [duplicate] = await db
    .select()
    .from(apps)
    .where(
      and(
        eq(apps.teamId, teamId),
        eq(apps.name, name),
        ne(apps.status, 'revoked'),
      ),
    );
  if (duplicate)
    throw new Problem(
      409,
      'app-name-taken',
      'This team already has an app with this name.',
    );
}
export async function requestView(
  db: Db,
  row: typeof accessRequests.$inferSelect,
) {
  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.id, row.teamId));
  const [plan] = await db.select().from(plans).where(eq(plans.id, row.planId));
  const [product] = plan?.productId
    ? await db
        .select({ id: products.id, slug: products.slug, name: products.name })
        .from(products)
        .where(eq(products.id, plan.productId))
    : [];
  if (!team || !plan || !product) throw notFound();
  const [fromPlan] = row.fromPlanId
    ? await db
        .select({ id: plans.id, name: plans.name })
        .from(plans)
        .where(eq(plans.id, row.fromPlanId))
    : [];
  const [app] = row.appId
    ? await db
        .select({ id: apps.id, name: apps.name })
        .from(apps)
        .where(eq(apps.id, row.appId))
    : [];
  const [requester] = row.requestedBy
    ? await db
        .select({ userId: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, row.requestedBy))
    : [];
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    team,
    product,
    plan: { id: plan.id, name: plan.name },
    fromPlan: fromPlan ?? null,
    app: app ?? null,
    name: row.name,
    reason: row.reason,
    requester: requester ?? null,
    submittedAt: row.submittedAt.toISOString(),
    decision: row.decidedAt
      ? {
          note: row.decisionNote,
          decidedAt: row.decidedAt.toISOString(),
          system: !row.decidedBy,
        }
      : null,
  };
}
export async function pendingRequest(db: Db, appId: string) {
  const [row] = await db
    .select()
    .from(accessRequests)
    .where(
      and(
        eq(accessRequests.appId, appId),
        eq(accessRequests.status, 'pending'),
      ),
    );
  return row ? requestView(db, row) : null;
}
export async function createPlanRequest(
  db: Db,
  app: typeof apps.$inferSelect,
  planId: string,
  reason: string,
  userId: string,
) {
  const [existing] = await db
    .select()
    .from(accessRequests)
    .where(
      and(
        eq(accessRequests.appId, app.id),
        eq(accessRequests.status, 'pending'),
      ),
    );
  if (existing)
    throw new Problem(
      409,
      'request-pending',
      'A plan change is already pending.',
    );
  const [row] = await db
    .insert(accessRequests)
    .values({
      id: uuidv7(),
      kind: 'plan-change',
      teamId: app.teamId,
      appId: app.id,
      fromPlanId: app.planId,
      planId,
      name: app.name,
      reason,
      requestedBy: userId,
    })
    .returning();
  return requestView(db, row!);
}
