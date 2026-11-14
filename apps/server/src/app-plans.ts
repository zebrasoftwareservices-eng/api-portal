// SPDX-License-Identifier: Apache-2.0
import {
  apps,
  apis,
  apiVersions,
  plans,
  products,
  planApis,
  subscriptions,
  type Database,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import type { PlanLimits } from '@portal/adapter-sdk';
import { notFound } from './problem.js';
export type Db =
  Database | Parameters<Parameters<Database['transaction']>[0]>[0];
export async function appApis(db: Db, app: typeof apps.$inferSelect) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, app.planId));
  if (!plan) throw notFound();
  const selection = {
    apiId: apis.id,
    slug: apis.slug,
    title: apiVersions.title,
    gatewayServiceId: apis.gatewayServiceId,
  };
  const base = db
    .select(selection)
    .from(apis)
    .innerJoin(apiVersions, eq(apis.latestVersionId, apiVersions.id));
  return plan.builtin
    ? base
        .innerJoin(subscriptions, eq(subscriptions.apiId, apis.id))
        .where(eq(subscriptions.appId, app.id))
    : base
        .innerJoin(planApis, eq(planApis.apiId, apis.id))
        .where(eq(planApis.planId, plan.id));
}
export function planLimits(plan: typeof plans.$inferSelect): PlanLimits | null {
  return plan.builtin
    ? null
    : {
        rate: { unit: plan.rateLimitUnit!, limit: plan.rateLimit! },
        monthlyQuota: plan.monthlyQuota!,
      };
}
export async function appPlan(db: Db, planId: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw notFound();
  const [product] = plan.productId
    ? await db
        .select({ id: products.id, slug: products.slug, name: products.name })
        .from(products)
        .where(eq(products.id, plan.productId))
    : [];
  return {
    id: plan.id,
    name: plan.name,
    builtin: plan.builtin,
    product: product ?? null,
    rateLimit: plan.rateLimit,
    rateLimitUnit: plan.rateLimitUnit,
    monthlyQuota: plan.monthlyQuota,
  };
}
