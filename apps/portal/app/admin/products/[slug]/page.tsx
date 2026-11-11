// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { serverClient } from '../../../../lib/server';
import { AdminProduct } from '../../../../components/admin-products';
export default async function Page({
  params,
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data, error } = await (
    await serverClient()
  ).GET('/v1/products/{productSlug}', {
    params: { path: { productSlug: slug } },
  });
  if (error?.status === 404) notFound();
  if (!data) throw new Error('Product unavailable');
  return <AdminProduct product={data} notice={(await searchParams).notice} />;
}
