// SPDX-License-Identifier: Apache-2.0
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@portal/ui';
import type { components } from '@portal/sdk';
import { api } from '../lib/client';
import {
  CollectionNotice,
  formatUtc,
  number,
  relative,
  StatTile,
  StatusIcon,
  UsageMeter,
  UsageSkeleton,
} from './usage-shared';
type AppUsage = components['schemas']['AppUsage'];
export function AppUsageCard({ appId }: { appId: string }) {
  const [data, setData] = useState<AppUsage>();
  const [error, setError] = useState(false);
  const [denied, setDenied] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const previousLevel = useRef<string | undefined>(undefined);
  const failures = useRef(0);
  const loaded = useRef(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await api.GET('/v1/apps/{appId}/usage', {
        params: { path: { appId } },
      });
      if (!alive.current) return;
      if (result.error) {
        if (result.error.status === 401 || result.error.status === 404) {
          setDenied(true);
          setData(undefined);
          return;
        }
        throw new Error('Usage unavailable');
      }
      if (result.data) {
        const d = result.data;
        const pct = d.quota && d.total !== null ? d.total / d.quota : 0;
        const levelKey =
          d.collection.status === 'behind'
            ? 'behind'
            : pct >= 1
              ? 'quota'
              : pct >= 0.8
                ? 'near'
                : 'normal';
        const level =
          d.collection.status === 'behind'
            ? 'Usage may be behind'
            : pct >= 1
              ? 'This app has reached its monthly quota.'
              : pct >= 0.8
                ? `${Math.floor(pct * 100)}% of this month's quota used.`
                : '';
        if (
          previousLevel.current !== undefined &&
          previousLevel.current !== levelKey
        )
          setAnnouncement(level);
        previousLevel.current = levelKey;
        setData(d);
        loaded.current = true;
        failures.current = 0;
        setError(false);
      }
    } catch {
      if (alive.current) {
        failures.current++;
        if (!loaded.current || failures.current >= 3) setError(true);
      }
    } finally {
      inFlight.current = false;
    }
  }, [appId]);
  useEffect(() => {
    alive.current = true;
    void reload();
    const refresh = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const interval = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      alive.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [reload]);
  const unavailable =
    data && ['unsupported', 'not-configured'].includes(data.collection.status);
  const missing =
    data?.collection.status === 'behind' && !data.collection.lastUpdatedAt;
  const pct =
    data?.quota && data.total !== null
      ? Math.floor((data.total / data.quota) * 100)
      : 0;
  return (
    <section
      className="card stack usage-card"
      aria-labelledby="app-usage-title"
      aria-busy={!data && !error && !denied}
    >
      <div className="usage-heading">
        <h2 id="app-usage-title">Usage this month</h2>
        {data?.collection.lastUpdatedAt && !unavailable && (
          <p className="muted">
            {data.collection.status === 'behind' ? 'Last updated' : 'Updated'}{' '}
            <time
              dateTime={data.collection.lastUpdatedAt}
              title={formatUtc(data.collection.lastUpdatedAt)}
            >
              {relative(data.collection.lastUpdatedAt)}
            </time>
          </p>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {denied ? (
        <p>
          You no longer have access to this app.{' '}
          <a href="/dashboard">Back to My apps</a>
        </p>
      ) : (
        <>
          {error && (
            <div className="alert error" role="alert">
              Couldn't load usage. Your calls are still counted.{' '}
              <Button variant="secondary" onClick={() => void reload()}>
                Try again
              </Button>
            </div>
          )}
          {!data && !error && <UsageSkeleton />}
          {data && (
            <>
              <CollectionNotice collection={data.collection} />
              {!unavailable && (
                <>
                  {!missing && data.total !== null && (
                    <>
                      <div className="usage-heading">
                        <p>
                          <strong>{number(data.total)}</strong>
                          {data.quota === null
                            ? ' calls'
                            : ` of ${number(data.quota)} calls`}
                        </p>
                        {data.quota === null ? (
                          <span className="badge">No monthly limit</span>
                        ) : (
                          <span>{pct}%</span>
                        )}
                      </div>
                      {data.quota !== null && (
                        <UsageMeter
                          value={data.total}
                          max={data.quota}
                          label="Calls this month"
                        />
                      )}
                      {data.quota !== null && pct >= 80 && (
                        <p
                          className={
                            pct >= 100 ? 'usage-danger' : 'usage-warning-text'
                          }
                        >
                          <StatusIcon
                            kind={pct >= 100 ? 'danger' : 'warning'}
                          />{' '}
                          {pct >= 100
                            ? `This app has reached its monthly quota. Kong may answer calls with 429 until ${formatUtc(data.period.resetsAt)}.`
                            : `${pct}% of this month's quota used. Kong starts rejecting calls at ${number(data.quota)}.`}
                        </p>
                      )}
                    </>
                  )}
                  {missing && (
                    <div
                      className="usage-meter"
                      role="meter"
                      aria-label="Calls this month"
                      aria-valuemin={0}
                      aria-valuemax={data.quota || 1}
                      aria-valuetext="Usage not received yet"
                    />
                  )}
                  <p className="muted">
                    Resets {formatUtc(data.period.resetsAt)}
                  </p>
                  {!missing && data.total === 0 && (
                    <p>
                      No calls yet this month. Calls made with this app's key
                      show up here within a minute.
                    </p>
                  )}
                  {!missing && data.byStatus && (
                    <>
                      <dl className="usage-stats">
                        {(
                          [
                            ['2xx', '2xx Success'],
                            ['4xx', '4xx Client errors'],
                            ['5xx', '5xx Server errors'],
                            ...(data.byStatus.other > 0
                              ? [['other', 'Other (1xx, 3xx)']]
                              : []),
                          ] as [
                            keyof NonNullable<AppUsage['byStatus']>,
                            string,
                          ][]
                        ).map(([key, label]) => (
                          <StatTile
                            key={key}
                            term={label}
                            value={number(data.byStatus![key])}
                          />
                        ))}
                      </dl>
                      <p className="muted">
                        4xx includes 429 answers from Kong when a limit is
                        reached.
                      </p>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
