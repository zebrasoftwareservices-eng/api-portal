// SPDX-License-Identifier: Apache-2.0
'use client';
import type { components } from '@portal/sdk';
import { Badge, Card, KeyHint, PageHeader } from '@portal/ui';
import { api, networkProblem } from '../lib/client';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
import { DateValue } from './date';
import { AdminAppOwner, AdminAppPlan, AdminAppStatus } from './admin-apps';
type Detail = components['schemas']['AdminAppDetail'];
export function AdminAppDetail({ appId }: { appId: string }) {
  const resource = useResource(() => api.GET('/v1/admin/apps/{appId}', { params: { path: { appId } } }));
  if (resource.loading) return <div className="stack" aria-busy="true"><div className="skeleton" /><div className="skeleton app-detail-skeleton" /><div className="skeleton app-detail-skeleton" /></div>;
  if (resource.error?.status === 404) return <div className="stack"><h1>App not found</h1><p>This app doesn&apos;t exist or was deleted.</p><a href="/admin/apps">Back to Apps</a></div>;
  if (resource.error || !resource.data) return <ProblemAlert problem={resource.error || networkProblem()} onRetry={resource.reload} />;
  const app: Detail = resource.data;
  return <div className="stack">
    <a href="/admin/apps">← Apps</a>
    <PageHeader title={app.name} titleSuffix={<AdminAppStatus value={app.status} />} description={<>{app.team.personal ? 'Personal' : app.team.name} · Owner <AdminAppOwner owner={app.owner} /> · Created <DateValue value={app.createdAt} />{app.revokedAt && <> · Revoked <DateValue value={app.revokedAt} /></>}</>} />
    {app.description && <p>{app.description}</p>}
    {app.status === 'revoke-pending' && <div className="alert warning">Access is being removed from the gateway.</div>}
    <Card className="stack"><h2>Plan</h2><p><AdminAppPlan plan={app.plan} /></p>{app.plan ? <>{app.subscriptions.length > 0 && <p>APIs: {app.subscriptions.map((api) => api.title).join(', ')}</p>}{app.plan.product ? <a className="button secondary manage-access" href={`/admin/products/${app.plan.product.slug}`}>Manage access →</a> : <p>This app&apos;s plan is not part of a product.</p>}</> : <p>No plan.</p>}</Card>
    <Card className="stack"><h2>Keys</h2>{app.credentials.length ? <div className="table-wrap"><table><thead><tr><th>Key</th><th>Status</th><th>Created</th><th>Revoked</th></tr></thead><tbody>{app.credentials.map((key) => <tr key={key.id}><td>{key.keyHint ? <KeyHint hint={key.keyHint} /> : '—'}</td><td><Badge className={key.status === 'active' ? 'active' : ''}>{key.status === 'active' ? '● Active' : '○ Revoked'}</Badge></td><td><DateValue value={key.createdAt} /></td><td>{key.revokedAt ? <DateValue value={key.revokedAt} /> : '—'}</td></tr>)}</tbody></table></div> : <p>This app has no keys.</p>}<div className="alert"><span aria-hidden="true">ⓘ </span>Only the team can see or change a key. To stop this app&apos;s access, revoke it on the product&apos;s access screen.</div></Card>
  </div>;
}
