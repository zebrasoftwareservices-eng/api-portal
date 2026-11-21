// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import type { components } from '@portal/sdk';
import { Badge, Button, Card, KeyHint, PageHeader, Table } from '@portal/ui';
import { api, networkProblem } from '../lib/client';
import type { Problem } from '../lib/types';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
type AdminApp = components['schemas']['AdminApp'];
function Status({ value }: { value: AdminApp['status'] }) {
  return <Badge className={value === 'active' ? 'active' : value === 'revoke-pending' ? 'warning' : ''}>{value === 'active' ? '● Active' : value === 'revoke-pending' ? '◐ Revoke pending' : '○ Revoked'}</Badge>;
}
function Team({ app }: { app: AdminApp }) { return <>{app.team.personal ? 'Personal' : app.team.name}{app.team.personal && app.owner && <small className="muted block">({app.owner.email})</small>}</>; }
function Owner({ owner }: { owner: AdminApp['owner'] }) {
  if (!owner) return <span title="Owner account deleted">—<span className="sr-only"> Owner account deleted</span></span>;
  return <>{owner.name || owner.email}<small className="muted block">{owner.email}</small>{owner.role === 'admin' && <Badge>Portal admin</Badge>}</>;
}
function Plan({ plan }: { plan: AdminApp['plan'] }) { return <>{plan.product ? `${plan.product.name} · ${plan.name}` : plan.name || '—'}</>; }
function Keys({ hints }: { hints: string[] }) { return hints.length ? <>{hints.map((hint) => <span className="block" key={hint}><KeyHint hint={hint} /></span>)}</> : <span>—<span className="sr-only"> No active keys</span></span>; }
export function AdminApps() {
  const resource = useResource(() => api.GET('/v1/admin/apps', { params: { query: { limit: 50 } } }));
  const [items, setItems] = useState<AdminApp[]>();
  const [cursor, setCursor] = useState<string | null>();
  const [moreProblem, setMoreProblem] = useState<Problem>();
  const [loadingMore, setLoadingMore] = useState(false);
  const firstNew = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (resource.data) { setItems(resource.data.items); setCursor(resource.data.nextCursor); }
  }, [resource.data]);
  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true); setMoreProblem(undefined);
    try {
      const result = await api.GET('/v1/admin/apps', { params: { query: { limit: 50, cursor } } });
      if (result.error) setMoreProblem(result.error);
      else if (result.data) {
        setItems((old) => [...(old || []), ...result.data.items]);
        setCursor(result.data.nextCursor);
        requestAnimationFrame(() => firstNew.current?.focus());
      }
    } catch { setMoreProblem(networkProblem()); }
    finally { setLoadingMore(false); }
  }
  return <div className="stack">
    <PageHeader title="Apps" description="Every app in every team. Keys are shown by their last four characters only." />
    {resource.loading && !items ? <div aria-busy="true"><div className="skeleton admin-apps-skeleton" /></div>
      : resource.error ? <ProblemAlert problem={resource.error} onRetry={resource.reload} />
      : !items?.length ? <Card>No apps yet. Apps appear here when developers create them or subscribe to a product.</Card>
      : <>
        <div className="table-wrap"><Table className="admin-apps-table"><caption className="sr-only">Apps</caption><thead><tr><th scope="col">Team</th><th scope="col">App</th><th scope="col">Owner</th><th scope="col">Plan</th><th scope="col">Keys</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map((app, index) => <tr key={app.id}><td data-label="Team"><Team app={app} /></td><td data-label="App">{app.name}</td><td data-label="Owner"><Owner owner={app.owner} /></td><td data-label="Plan"><Plan plan={app.plan} /></td><td data-label="Keys"><Keys hints={app.activeKeyHints} /></td><td data-label="Status"><Status value={app.status} /></td><td><a ref={index === items.length - (resource.data?.items.length || 0) ? firstNew : undefined} className="button secondary" href={`/admin/apps/${app.id}`} aria-label={`View ${app.name} (${app.team.name})`}>View</a></td></tr>)}</tbody></Table></div>
        {moreProblem && <ProblemAlert problem={moreProblem} onRetry={loadMore} />}
        {cursor && <div><Button variant="secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more'}</Button></div>}
      </>}
  </div>;
}
export { Status as AdminAppStatus, Owner as AdminAppOwner, Plan as AdminAppPlan };
