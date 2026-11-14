// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { serverClient } from '../../../../../lib/server';
import { ProductForm } from '../../../../../components/admin-products';
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await serverClient();
  const [product, apis] = await Promise.all([
    client.GET('/v1/products/{productSlug}', {
      params: { path: { productSlug: slug } },
    }),
    client.GET('/v1/apis'),
  ]);
  if (product.error?.status === 404) notFound();
  if (!product.data || !apis.data) throw new Error('Product unavailable');
  return <ProductForm product={product.data} apis={apis.data.items} />;
}
