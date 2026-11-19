// SPDX-License-Identifier: Apache-2.0
import { Card, EmptyState, PageHeader } from '@portal/ui';
import { serverClient, signedInUser } from '../../lib/server';
export const metadata = { title: 'APIs' };
export default async function ApisPage() {
  const [client, user] = await Promise.all([serverClient(), signedInUser()]);
  const { data } = await client.GET('/v1/apis');
  if (!data) throw new Error('APIs unavailable');
  return <div className="stack">
    <PageHeader title="APIs" description="Published APIs and their reference documentation." />
    {!data.items.length ? <EmptyState
      title={user?.role === 'admin' ? 'No published APIs yet.' : 'No APIs are published yet.'}
      description=""
      action={user?.role === 'admin' ? <a className="button" href="/admin/apis">Import an API</a> : undefined}
    /> : <div className="api-index-list">
      {data.items.map((api) => <Card key={api.id} className="api-index-row">
        <a href={`/apis/${api.slug}`} aria-label={`View reference for ${api.title}`}>
          <span><strong>{api.title}</strong>{api.description && <small className="muted">{api.description.split('\n\n')[0]}</small>}</span>
          <span>View reference</span>
        </a>
      </Card>)}
    </div>}
  </div>;
}
