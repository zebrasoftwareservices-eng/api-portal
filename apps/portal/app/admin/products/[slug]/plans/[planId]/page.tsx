// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { serverClient } from '../../../../../../lib/server';
import { PlanForm } from '../../../../../../components/admin-products';
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; planId?: string }>;
}) {
  const { slug, planId } = await params;
  const { data, error } = await (
    await serverClient()
  ).GET('/v1/products/{productSlug}', {
    params: { path: { productSlug: slug } },
  });
  if (error?.status === 404) notFound();
  if (!data) throw new Error('Product unavailable');
  const plan = planId ? data.plans.find((p) => p.id === planId) : undefined;
  if (planId && !plan) notFound();
  return <PlanForm product={data} plan={plan} />;
}
