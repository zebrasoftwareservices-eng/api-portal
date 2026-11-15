// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef } from 'react';
import { Button } from '@portal/ui';
import type { components } from '@portal/sdk';
import { api } from '../lib/client';
import { isDemo } from '../lib/demo';
import { useResource } from './use-resource';
import {
  CollectionNotice,
  Duration,
  number,
  StatTile,
  StatusIcon,
  UsageSkeleton,
  UtcTime,
} from './usage-shared';
type Insights = components['schemas']['AdminInsights'];
export function AdminInsights() {
  const r = useResource(() => api.GET('/v1/admin/insights'));
  const deniedTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (r.error?.status === 403) deniedTitle.current?.focus();
  }, [r.error]);
  useEffect(() => {
    const main = document.getElementById('main');
    if (r.loading) main?.setAttribute('aria-busy', 'true');
    else main?.removeAttribute('aria-busy');
    return () => main?.removeAttribute('aria-busy');
  }, [r.loading]);
  if (r.error?.status === 403)
    return (
      <section className="card stack">
        <StatusIcon kind="lock" />
        <h1 ref={deniedTitle} tabIndex={-1}>
          You don't have access to Insights
        </h1>
        <p>Insights are only for portal admins.</p>
        <a className="button" href={isDemo() ? '/' : '/dashboard'}>
          {isDemo() ? 'Back to the APIs' : 'Go to My apps'}
        </a>
      </section>
    );
  return (
    <div className="stack insights">
      <h1>Insights</h1>
      {r.loading ? (
        <UsageSkeleton insights />
      ) : r.error ? (
        <div role="alert" className="alert error">
          Couldn't load insights.{' '}
          <Button variant="secondary" onClick={() => void r.reload()}>
            Try again
          </Button>
        </div>
      ) : (
        r.data && <InsightsContent data={r.data} />
      )}
    </div>
  );
}
function InsightsContent({ data }: { data: Insights }) {
  const unavailable = ['unsupported', 'not-configured'].includes(
    data.collection.status,
  );
  const t = data.timeToFirstCall;
  const shortDate = (value: string, year = false) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' as const } : {}),
      timeZone: 'UTC',
    }).format(new Date(value));
  return (
    <>
      <p className="muted">
        Last 30 days · {shortDate(data.window.from)} –{' '}
        {shortDate(data.window.to, true)} (UTC)
      </p>
      <CollectionNotice collection={data.collection} admin />
      <dl className="insights-stats">
        <StatTile
          term="New sign-ups"
          value={number(data.signups)}
          caption="Developer accounts created"
        />
        <StatTile
          term="Active apps"
          value={
            unavailable || data.activeApps === null
              ? 'Not available'
              : number(data.activeApps)
          }
          caption="With at least one call"
        />
        <StatTile
          term="Median time to first call"
          value={
            unavailable ? (
              'Not available'
            ) : t.medianSeconds === null ? (
              'No calls yet'
            ) : (
              <Duration seconds={t.medianSeconds} />
            )
          }
          badge={
            !unavailable && t.medianSeconds !== null ? (
              <span
                className={`badge ${t.medianSeconds <= t.targetSeconds ? 'usage-success' : 'usage-warning'}`}
              >
                <StatusIcon
                  kind={
                    t.medianSeconds <= t.targetSeconds ? 'success' : 'warning'
                  }
                />{' '}
                {t.medianSeconds <= t.targetSeconds
                  ? 'Within target'
                  : 'Over target'}
              </span>
            ) : undefined
          }
          caption={
            <>
              Target <Duration seconds={t.targetSeconds} /> ·{' '}
              {number(t.covered)} of {number(t.total)} developers
            </>
          }
        />
      </dl>
      <section className="card stack" aria-labelledby="top-apis-title">
        <h2 id="top-apis-title">Top APIs</h2>
        {unavailable ? (
          <p>Not available for this gateway.</p>
        ) : !data.topApis?.length ? (
          <div>
            <StatusIcon kind="chart" />
            <p>No calls yet</p>
            <p className="muted">
              APIs appear here once developers call them through Kong.
            </p>
          </div>
        ) : (
          <ol className="insights-top">
            {data.topApis.map((item, index) => (
              <li key={item.apiId}>
                <span aria-hidden="true">{index + 1}</span>
                <div>
                  <a href={`/admin/apis/${encodeURIComponent(item.slug)}`}>
                    {item.name}
                  </a>
                  <div className="mono muted">{item.slug}</div>
                </div>
                <div className="usage-meter" aria-hidden="true">
                  <span
                    style={{
                      width: `${(item.calls / data.topApis![0]!.calls) * 100}%`,
                    }}
                  />
                </div>
                <span>
                  {number(item.calls)}
                  <span className="sr-only"> calls</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="card stack" aria-labelledby="first-call-title">
        <h2 id="first-call-title">Time to first call</h2>
        <p>
          New developers, newest first. A first call is a 2xx response with a
          key the developer created.
        </p>
        {!t.total ? (
          <p>
            <StatusIcon kind="user" /> No developers signed up in the last 30
            days.
          </p>
        ) : (
          <>
            <table className="insights-table">
              <caption className="sr-only">Time to first call</caption>
              <thead>
                <tr>
                  {[
                    'Developer',
                    'Signed up',
                    'First successful call',
                    'Time to first call',
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.developers.map((d) => (
                  <tr key={d.userId}>
                    <th scope="row">
                      {d.name}
                      <div className="muted">{d.email}</div>
                    </th>
                    <td>
                      <UtcTime value={d.signedUpAt} />
                    </td>
                    <td>
                      {unavailable ? (
                        'Not available'
                      ) : d.firstCallAt ? (
                        <UtcTime value={d.firstCallAt} />
                      ) : (
                        <span className="muted">No call yet</span>
                      )}
                    </td>
                    <td>
                      <FirstCallTime
                        developer={d}
                        unavailable={unavailable}
                        target={t.targetSeconds}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="insights-developers">
              {t.developers.map((d) => (
                <article className="card stack" key={d.userId}>
                  <h3>{d.name}</h3>
                  <p className="muted">{d.email}</p>
                  <dl>
                    <div>
                      <dt>Signed up</dt>
                      <dd>
                        <UtcTime value={d.signedUpAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>First successful call</dt>
                      <dd>
                        {unavailable ? (
                          'Not available'
                        ) : d.firstCallAt ? (
                          <UtcTime value={d.firstCallAt} />
                        ) : (
                          'No call yet'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Time to first call</dt>
                      <dd>
                        <FirstCallTime
                          developer={d}
                          unavailable={unavailable}
                          target={t.targetSeconds}
                        />
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
        {t.developers.length < t.total && (
          <p className="muted">
            Showing the {number(t.developers.length)} newest of{' '}
            {number(t.total)} developers.
          </p>
        )}
      </section>
    </>
  );
}
function FirstCallTime({
  developer: d,
  unavailable,
  target,
}: {
  developer: Insights['timeToFirstCall']['developers'][number];
  unavailable: boolean;
  target: number;
}) {
  if (unavailable) return <span className="muted">Not available</span>;
  if (d.secondsToFirstCall === null)
    return (
      <>
        —<span className="sr-only">No call yet</span>
      </>
    );
  return (
    <>
      {d.secondsToFirstCall > target && (
        <span className="usage-warning-text">
          <StatusIcon />
          <span className="sr-only">over the 10-minute target </span>
        </span>
      )}
      <Duration seconds={d.secondsToFirstCall} />
    </>
  );
}
