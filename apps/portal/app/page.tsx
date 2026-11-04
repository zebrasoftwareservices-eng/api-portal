// SPDX-License-Identifier: Apache-2.0
import { Card, EmptyState, PageHeader } from '@portal/ui';
import { serverClient, currentUser } from '../lib/server';
export const metadata = { title: 'APIs' };
export default async function Catalog() {
  const client = await serverClient();
  const [{ data, error }, user] = await Promise.all([
    client.GET('/v1/apis'),
    currentUser(),
  ]);
  if (error) throw new Error('Catalog unavailable');
  return (
    <>
      <PageHeader
        title="APIs"
        description="Read the reference, get a key and try a call from your browser."
      />
      {!user && (
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
        {!data?.items.length ? (
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
          <div className="grid">
            {data.items.map((api) => (
              <a
                key={api.id}
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
                <code className="muted">{api.gatewayBaseUrl}</code>
                <span>View reference →</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
