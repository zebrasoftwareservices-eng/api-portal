// SPDX-License-Identifier: Apache-2.0
'use client';
import { Badge, EmptyState, PageHeader, Table } from '@portal/ui';
import { useEffect, useRef } from 'react';
import { useTeams } from './team-context';
import { api } from '../lib/client';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
import { DateValue } from './date';

function AccessLabel({ title }: { title?: string }) {
  return title ? (
    <Badge className="active app-access-label">
      <span aria-hidden="true">● </span>Has access to {title}
    </Badge>
  ) : null;
}
export function Dashboard({ slug }: { slug?: string }) {
  const { current, unavailable } = useTeams();
  const readOnly = current?.role === 'read-only';
  const { data, error, loading, reload } = useResource(() =>
    unavailable
      ? Promise.resolve({
          error: {
            type: '/problems/team-unavailable',
            title: 'Team unavailable',
            status: 503,
            detail: 'Try loading your teams again.',
          },
        })
      : api.GET('/v1/apps', { params: { query: { teamId: current?.id } } }),
  );
  const loadedScope = useRef({ teamId: current?.id, unavailable });
  useEffect(() => {
    if (
      loadedScope.current.teamId === current?.id &&
      loadedScope.current.unavailable === unavailable
    )
      return;
    loadedScope.current = { teamId: current?.id, unavailable };
    void reload();
  }, [current?.id, unavailable, reload]);
  const apps = data?.items.map((app) => ({
    ...app,
    apiTitles: app.subscriptions.map((s) => s.title).join(', '),
    activeKeys:
      app.credentials.filter((c) => c.status === 'active').length || 'None',
    accessTitle: slug
      ? app.subscriptions.find((s) => s.slug === slug)?.title
      : undefined,
  }));
  return (
    <>
      <PageHeader
        title="My apps"
        actions={
          !readOnly &&
          !!apps?.length && (
            <div className="actions">
              <a className="button" href="/dashboard/apps/new">
                Create app
              </a>
            </div>
          )
        }
      />
      {readOnly && (
        <p className="muted">
          You have Read-only access to {current?.name}. Ask a team Admin to
          create apps.
        </p>
      )}
      {loading ? (
        <div role="status" className="skeleton">
          {current ? `Loading ${current.name}'s apps…` : 'Loading your apps…'}
        </div>
      ) : error ? (
        <ProblemAlert
          problem={error}
          message="We couldn't load your apps."
          onRetry={reload}
        />
      ) : !apps?.length ? (
        <EmptyState
          title={
            current && (!current.personal || readOnly)
              ? `No apps in ${current.name} yet`
              : 'Create your first app'
          }
          description={
            readOnly
              ? 'A team Admin or Member can create one.'
              : current && !current.personal
                ? 'Apps you create here belong to the team, so they keep working when people leave.'
                : "An app holds your API keys. Create one, choose the APIs it uses, and you'll get a key straight away."
          }
          action={
            !readOnly && (
              <a className="button" href="/dashboard/apps/new">
                Create app
              </a>
            )
          }
        />
      ) : (
        <>
          <Table className="apps-table">
            <caption className="sr-only">
              {current ? `Apps in ${current.name}` : 'My apps'}
            </caption>
            <thead>
              <tr>
                {['Name', 'APIs', 'Active keys', 'Created'].map((h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr
                  key={app.id}
                  className={app.accessTitle ? 'highlight' : undefined}
                >
                  <td>
                    <a href={`/dashboard/apps/${app.id}`}>{app.name}</a>
                    <AccessLabel title={app.accessTitle} />
                  </td>
                  <td>{app.apiTitles}</td>
                  <td>{app.activeKeys}</td>
                  <td>
                    <DateValue value={app.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <ul className="app-cards">
            {apps.map((app) => (
              <li
                key={app.id}
                className={`card stack ${app.accessTitle ? 'highlight' : ''}`}
              >
                <h2>{app.name}</h2>
                <AccessLabel title={app.accessTitle} />
                <dl>
                  <dt>APIs</dt>
                  <dd>{app.apiTitles}</dd>
                  <dt>Active keys</dt>
                  <dd>{app.activeKeys}</dd>
                  <dt>Created</dt>
                  <dd>
                    <DateValue value={app.createdAt} />
                  </dd>
                </dl>
                <div className="actions">
                  <a
                    className="button secondary"
                    href={`/dashboard/apps/${app.id}`}
                  >
                    Open app<span className="sr-only">: {app.name}</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
