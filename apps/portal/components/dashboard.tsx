// SPDX-License-Identifier: Apache-2.0
'use client';
import { EmptyState, PageHeader, Table } from '@portal/ui';
import { api } from '../lib/client';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
import { DateValue } from './date';
export function Dashboard() {
  const { data, error, loading, reload } = useResource(() =>
    api.GET('/v1/apps'),
  );
  return (
    <>
      <PageHeader
        title="Your apps"
        actions={
          !!data?.items.length && (
            <a className="button" href="/dashboard/apps/new">
              Create app
            </a>
          )
        }
      />
      {loading ? (
        <div role="status" className="skeleton">
          Loading your apps…
        </div>
      ) : error ? (
        <ProblemAlert
          problem={error}
          message="We couldn't load your apps."
          onRetry={reload}
        />
      ) : !data?.items.length ? (
        <EmptyState
          title="Create your first app"
          description="An app holds your API keys. Create one, choose the APIs it uses, and you'll get a key straight away."
          action={
            <a className="button" href="/dashboard/apps/new">
              Create app
            </a>
          }
        />
      ) : (
        <Table>
          <caption className="sr-only">Your apps</caption>
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
            {data.items.map((app) => (
              <tr key={app.id}>
                <td>
                  <a href={`/dashboard/apps/${app.id}`}>{app.name}</a>
                </td>
                <td>{app.subscriptions.map((s) => s.title).join(', ')}</td>
                <td>
                  {app.credentials.filter((c) => c.status === 'active')
                    .length || 'None'}
                </td>
                <td>
                  <DateValue value={app.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
