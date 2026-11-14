// SPDX-License-Identifier: Apache-2.0
import { Card, EmptyState, PageHeader } from '@portal/ui';
import { VisibilityBadge } from './access-shared';
import type { ProductSummary } from './plans';
import type { Api, User } from '../lib/types';
export function CatalogView({
  items,
  user,
  demo = false,
  products = [],
  productsFailed = false,
  apisFailed = false,
}: {
  items: Pick<
    Api,
    'slug' | 'title' | 'version' | 'description' | 'gatewayBaseUrl'
  >[];
  user: User | null;
  demo?: boolean;
  products?: ProductSummary[];
  productsFailed?: boolean;
  apisFailed?: boolean;
}) {
  return (
    <>
      <PageHeader
        title="APIs"
        description={
          demo
            ? 'Read the reference for a sample API.'
            : 'Read the reference, get a key and try a call from your browser.'
        }
      />
      {!demo && !user && (
        <Card>
          <h2>How it works</h2>
          <ol>
            <li>Pick an API</li>
            <li>Create a free account and get a key</li>
            <li>Try a call in the docs</li>
          </ol>
        </Card>
      )}
      {!!products.length && (
        <section className="stack">
          <h2>Products</h2>
          <p>Bundles of APIs with plans. Subscribe to a plan to get a key.</p>
          <div className="portal-grid">
            {products.map((p) => (
              <a className="card stack" key={p.id} href={`/products/${p.slug}`}>
                <h3>{p.name}</h3>
                {user?.role === 'admin' && (
                  <VisibilityBadge visibility={p.visibility} />
                )}
                <p className="clamp muted">
                  {p.description
                    .replace(/[#*_`~]/g, '')
                    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')}
                </p>
                <p>
                  {p.apiCount} {p.apiCount === 1 ? 'API' : 'APIs'} ·{' '}
                  {p.planCount
                    ? `${p.planCount} ${p.planCount === 1 ? 'plan' : 'plans'}`
                    : 'No plans yet'}
                </p>
                <span>View plans →</span>
              </a>
            ))}
          </div>
        </section>
      )}
      {productsFailed && (
        <div role="alert" className="alert error">
          We couldn&apos;t load the products. <a href="/">Try again</a>
        </div>
      )}
      {(!products.length || !!items.length || apisFailed) && (
        <div style={{ marginTop: 24 }}>
          {!!products.length && (
            <>
              <h2>APIs</h2>
              <p>APIs you can get a key for on their own.</p>
            </>
          )}
          {apisFailed ? (
            <div role="alert" className="alert error">
              We couldn&apos;t load the APIs. <a href="/">Try again</a>
            </div>
          ) : !items.length ? (
            <EmptyState
              title="No APIs yet"
              description={
                user?.role === 'admin'
                  ? 'Import an OpenAPI document to publish your first API.'
                  : 'No APIs have been published yet. Check back soon.'
              }
              action={
                user?.role === 'admin' && (
                  <a href="/admin/apis" className="button">
                    Import an API
                  </a>
                )
              }
            />
          ) : (
            <div className="portal-grid">
              {items.map((api) => (
                <a
                  key={api.slug}
                  className="card api-card stack"
                  href={`/apis/${api.slug}`}
                >
                  <div className="row">
                    <h2>{api.title}</h2>
                    <span className="badge">v{api.version}</span>
                  </div>
                  {api.description && (
                    <p className="clamp muted">
                      {api.description
                        .split('\n\n')[0]
                        ?.replace(/[#*_`~]/g, '')
                        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')}
                    </p>
                  )}
                  {demo && (
                    <div className="hint">Base URL in a local quickstart</div>
                  )}
                  <div className="catalog-card-links">
                    <p className="mono muted">{api.gatewayBaseUrl}</p>{' '}
                    <span>View reference →</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
