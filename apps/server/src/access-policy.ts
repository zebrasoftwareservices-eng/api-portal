// SPDX-License-Identifier: Apache-2.0
import {
  products,
  productTeams,
  productApis,
  teamMembers,
  apps,
  plans,
} from '@portal/db';
import { and, eq, exists, inArray, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { headersFor, type Auth } from './auth.js';
import type { Db } from './app-plans.js';
export interface Viewer {
  userId: string | null;
  admin: boolean;
  teamIds: string[];
  assignedProductIds: string[];
}
export const anonymous: Viewer = {
  userId: null,
  admin: false,
  teamIds: [],
  assignedProductIds: [],
};
export async function loadViewer(
  db: Db,
  auth: Auth,
  request: FastifyRequest,
): Promise<Viewer> {
  const session = await auth.api.getSession({ headers: headersFor(request) });
  if (!session) return anonymous;
  const memberships = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.userId, session.user.id));
  return teamViewer(
    db,
    memberships.map((m) => m.teamId),
    session.user.id,
    session.user.role === 'admin',
  );
}
export async function teamViewer(
  db: Db,
  teamIds: string[],
  userId = 'team',
  admin = false,
): Promise<Viewer> {
  const assigned = teamIds.length
    ? await db
        .select({ productId: plans.productId })
        .from(apps)
        .innerJoin(plans, eq(plans.id, apps.planId))
        .where(
          and(
            inArray(apps.teamId, teamIds),
            eq(apps.origin, 'admin'),
            eq(apps.status, 'active'),
          ),
        )
    : [];
  return {
    userId,
    admin,
    teamIds,
    assignedProductIds: assigned.flatMap((a) =>
      a.productId ? [a.productId] : [],
    ),
  };
}
export function canSeeProduct(
  viewer: Viewer,
  product: { id: string; visibility: string },
  namedTeamIds: string[] = [],
): boolean {
  return (
    viewer.admin ||
    product.visibility === 'open' ||
    (product.visibility === 'hidden' && viewer.userId !== null) ||
    (product.visibility === 'internal' &&
      namedTeamIds.some((id) => viewer.teamIds.includes(id))) ||
    (product.visibility === 'manual' &&
      viewer.assignedProductIds.includes(product.id))
  );
}
export function canSelfSubscribe(product: { visibility: string }) {
  return product.visibility !== 'manual';
}
export function visibleProductIds(db: Db, viewer: Viewer) {
  if (viewer.admin) return sql`true`;
  return or(
    eq(products.visibility, 'open'),
    viewer.userId ? eq(products.visibility, 'hidden') : sql`false`,
    and(
      eq(products.visibility, 'internal'),
      exists(
        db
          .select()
          .from(productTeams)
          .where(
            and(
              eq(productTeams.productId, products.id),
              viewer.teamIds.length
                ? inArray(productTeams.teamId, viewer.teamIds)
                : sql`false`,
            ),
          ),
      ),
    ),
    and(
      eq(products.visibility, 'manual'),
      viewer.assignedProductIds.length
        ? inArray(products.id, viewer.assignedProductIds)
        : sql`false`,
    ),
  )!;
}
export async function productVisible(
  db: Db,
  viewer: Viewer,
  productId: string,
) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId));
  if (!product) return false;
  const named =
    product.visibility === 'internal'
      ? await db
          .select({ teamId: productTeams.teamId })
          .from(productTeams)
          .where(eq(productTeams.productId, productId))
      : [];
  return canSeeProduct(
    viewer,
    product,
    named.map((t) => t.teamId),
  );
}
export async function canSeeApi(db: Db, viewer: Viewer, apiId: string) {
  const links = await db
    .select()
    .from(productApis)
    .where(eq(productApis.apiId, apiId));
  if (!links.length) return true;
  for (const link of links)
    if (await productVisible(db, viewer, link.productId)) return true;
  return false;
}
export function affectedSubscriptions<
  T extends { status: string; origin: string; teamId: string },
>(rows: T[], namedTeamIds: string[] = []) {
  return rows.filter(
    (a) =>
      a.status === 'active' &&
      a.origin !== 'admin' &&
      !namedTeamIds.includes(a.teamId),
  );
}
export const requiresConfirmation = (rows: unknown[]) => rows.length > 0;
