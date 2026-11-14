// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { signedInUser } from '../../../lib/server';
import { ProductDescription } from '../../../components/product-description';
import { productBySlug } from '../../../lib/products-server';
import { ProductActions } from '../../../components/product-actions';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { data } = await productBySlug((await params).slug);
  return { title: data?.name || 'Product not found' };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ data, error }, user] = await Promise.all([
    productBySlug(slug),
    signedInUser(),
  ]);
  if (error?.status === 404) notFound();
  if (!data) throw new Error('Product unavailable');
  return (
    <div className="stack">
      <nav aria-label="Breadcrumb">
        <a href="/">APIs</a> / {data.name}
      </nav>
      <h1>{data.name}</h1>
      {user?.role === 'admin' && (
        <a href={`/admin/products/${slug}`}>Edit product</a>
      )}
      <ProductDescription text={data.description} />
      <h2>APIs in this product</h2>
      <ul>
        {data.apis.map((a) => (
          <li key={a.id}>
            <a href={`/apis/${a.slug}`}>
              {a.title} v{a.version} — View reference
            </a>
          </li>
        ))}
      </ul>
      <h2>Plans</h2>
      {data.plans.length ? (
        <ProductActions product={data} />
      ) : (
        <div className="card">
          <h3>No plans yet</h3>
          <p>
            This product has no plans yet, so you can&apos;t subscribe. Check
            back soon.
          </p>
          {user?.role === 'admin' && (
            <a href={`/admin/products/${slug}/plans/new`}>Add a plan</a>
          )}
        </div>
      )}
    </div>
  );
}
