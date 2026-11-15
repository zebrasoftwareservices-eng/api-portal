// SPDX-License-Identifier: Apache-2.0
import { Card } from '@portal/ui';
import type { components } from '@portal/sdk';
import type { Api, Problem } from '../lib/types';
import { ProblemAlert } from './problem-alert';
type Product = components['schemas']['ProductSummary'];
export function ProductRow({
  product,
  apiTitles,
  isAdmin,
}: {
  product: Product;
  apiTitles: string[];
  isAdmin: boolean;
}) {
  const noPlans = product.planCount === 0;
  const manual = !product.selfService;
  const approval = product.allPlansRequireApproval;
  const label = noPlans
    ? 'Add a plan'
    : manual
      ? 'View product'
      : approval
        ? 'Request access'
        : 'Subscribe';
  const accessibleLabel = noPlans
    ? `Add a plan to ${product.name}`
    : manual
      ? `View product ${product.name}`
      : approval
        ? `Request access to ${product.name}`
        : `Subscribe to ${product.name}`;
  const description = product.description
    .split(/\r?\n/)[0]
    ?.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .trim();
  return (
    <li className="create-product-row">
      <div className="stack">
        <h3>{product.name}</h3>
        {description && (
          <p className="muted create-product-description">{description}</p>
        )}
        {apiTitles.length > 0 && <p>Includes: {apiTitles.join(', ')}</p>}
        {noPlans ? (
          <>
            <span
              className={`badge ${isAdmin ? 'create-product-warning' : 'create-product-unavailable'}`}
            >
              <span aria-hidden="true">{isAdmin ? '⚠' : '◷'}</span>{' '}
              {isAdmin ? 'Needs a plan' : 'Not available yet'}
            </span>
            <p className="hint">
              {isAdmin
                ? "Developers can't subscribe until it has a plan."
                : 'This product has no plans yet. Check back later.'}
            </p>
          </>
        ) : manual ? (
          <p className="hint">
            An admin assigns this product&apos;s plans to your team.
          </p>
        ) : approval ? (
          <p className="hint">Every plan needs approval from the API owner.</p>
        ) : null}
      </div>
      {(!noPlans || isAdmin) && (
        <a
          className="button secondary"
          aria-label={accessibleLabel}
          href={
            noPlans
              ? `/admin/products/${product.slug}`
              : `/products/${product.slug}`
          }
        >
          {label} <span aria-hidden="true">→</span>
        </a>
      )}
    </li>
  );
}
export function ProductList({
  resource,
  apis,
  isAdmin,
}: {
  resource: {
    data?: { items: Product[] };
    loading: boolean;
    error?: Problem;
    reload: () => void;
  };
  apis: Api[];
  isAdmin: boolean;
}) {
  if (!resource.loading && !resource.error && !resource.data?.items.length)
    return null;
  return (
    <section aria-labelledby="products-heading" className="stack">
      <h2 id="products-heading">Products</h2>
      <p className="muted">
        Products bundle APIs with a plan: rate limit, quota and, for some,
        approval. Subscribing creates an app with its own key.
      </p>
      <Card>
        {resource.loading ? (
          <div role="status" className="stack">
            <span className="sr-only">Loading products…</span>
            <div
              className="skeleton create-product-skeleton"
              aria-hidden="true"
            />
            <div
              className="skeleton create-product-skeleton"
              aria-hidden="true"
            />
          </div>
        ) : resource.error ? (
          <ProblemAlert
            problem={resource.error}
            message="We couldn't load the products."
            onRetry={resource.reload}
          />
        ) : (
          <ul className="create-product-list">
            {resource.data?.items.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                apiTitles={apis
                  .filter((api) =>
                    api.products?.some((p) => p.id === product.id),
                  )
                  .map((api) => api.title)}
                isAdmin={isAdmin}
              />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
