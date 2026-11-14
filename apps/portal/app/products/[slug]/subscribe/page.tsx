// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from 'next/navigation';
import { signedInUser } from '../../../../lib/server';
import { productBySlug } from '../../../../lib/products-server';
import { Subscribe } from '../../../../components/product-actions';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { data } = await productBySlug((await params).slug);
  return { title: `Subscribe to ${data?.name || 'product'}` };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { slug } = await params;
  const { plan } = await searchParams;
  if (!(await signedInUser()))
    redirect(
      `/sign-in?next=${encodeURIComponent(`/products/${slug}/subscribe${plan ? `?plan=${plan}` : ''}`)}`,
    );
  const { data, error } = await productBySlug(slug);
  if (error?.status === 404) notFound();
  if (!data) throw new Error('Product unavailable');
  return (
    <div className="stack">
      <nav aria-label="Breadcrumb">
        <a href={`/products/${slug}`}>{data.name}</a> / Subscribe
      </nav>
      <h1>Subscribe to {data.name}</h1>
      <Subscribe product={data} initialPlan={plan} />
    </div>
  );
}
