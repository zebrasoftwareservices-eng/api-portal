// SPDX-License-Identifier: Apache-2.0
import { Card, EmptyState, PageHeader } from '@portal/ui';
import type { Api, User } from '../lib/types';
export function CatalogView({
  items,
  user,
  demo = false,
}: {
  items: Pick<
    Api,
    'slug' | 'title' | 'version' | 'description' | 'gatewayBaseUrl'
  >[];
  user: User | null;
  demo?: boolean;
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
      <div style={{ marginTop: 24 }}>
        {!items.length ? (
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
                  <p className="mono muted">{api.gatewayBaseUrl}</p>
                  {' '}
                  <span>View reference →</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
