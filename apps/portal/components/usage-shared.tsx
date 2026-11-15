// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import type { components } from '@portal/sdk';
export type Collection = components['schemas']['UsageCollection'];
export const number = (value: number) =>
  new Intl.NumberFormat('en-US').format(value);
export function formatUtc(value: string) {
  return (
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC'
  );
}
export function relative(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 60000),
  );
  return minutes < 1
    ? 'less than a minute ago'
    : minutes < 60
      ? `${minutes} minutes ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} hours ago`
        : formatUtc(value);
}
export function formatDuration(seconds: number) {
  const s = Math.floor(seconds);
  const [a, unit, b, next] =
    s < 60
      ? [s, 's', 0, '']
      : s < 3600
        ? [Math.floor(s / 60), 'min', s % 60, 's']
        : s < 86400
          ? [Math.floor(s / 3600), 'h', Math.floor((s % 3600) / 60), 'min']
          : [Math.floor(s / 86400), 'd', Math.floor((s % 86400) / 3600), 'h'];
  return `${a} ${unit}${b ? ` ${b} ${next}` : ''}`;
}
export function Duration({ seconds }: { seconds: number }) {
  return <time dateTime={`PT${seconds}S`}>{formatDuration(seconds)}</time>;
}
export function UtcTime({ value }: { value: string }) {
  return <time dateTime={value}>{formatUtc(value)}</time>;
}
export function StatusIcon({
  kind = 'warning',
}: {
  kind?:
    | 'warning'
    | 'clock'
    | 'info'
    | 'lock'
    | 'success'
    | 'chart'
    | 'user'
    | 'danger';
}) {
  const paths = {
    warning: (
      <>
        <path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4m0 4h.01" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4m0-4h.01" />
      </>
    ),
    lock: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    success: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18M8 16v-4m5 4V8m5 8V5" />
      </>
    ),
    user: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21v-2a7 7 0 0 1 14 0v2m4-14v6m-3-3h6" />
      </>
    ),
    danger: (
      <>
        <path d="m7 2-5 5v10l5 5h10l5-5V7l-5-5ZM12 8v4m0 4h.01" />
      </>
    ),
  };
  return (
    <svg
      className="usage-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}
export function StatTile({
  term,
  value,
  caption,
  badge,
}: {
  term: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="usage-stat">
      <dt>{term}</dt>
      <dd>
        <strong>{value}</strong> {badge}
      </dd>
      {caption && <dd className="muted">{caption}</dd>}
    </div>
  );
}
export function UsageMeter({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const pct = Math.floor((value / max) * 100);
  return (
    <div
      className="usage-meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={`${number(value)} of ${number(max)} calls, ${pct >= 100 ? 'monthly quota reached' : `${pct}%`}`}
    >
      <span
        className={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : ''}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}
export function CollectionNotice({
  collection,
  admin = false,
}: {
  collection: Collection;
  admin?: boolean;
}) {
  if (collection.status === 'ok') return null;
  if (collection.status === 'behind')
    return (
      <div className="alert usage-warning">
        <strong>
          <StatusIcon kind="clock" /> Usage may be behind
        </strong>
        <p>
          {collection.lastUpdatedAt
            ? `The portal last received usage from Kong ${relative(collection.lastUpdatedAt)} (${formatUtc(collection.lastUpdatedAt)}).`
            : "The portal hasn't received any usage from Kong yet."}{' '}
          {admin ? (
            <>
              Check that Kong can reach the server at{' '}
              <code>PORTAL_USAGE_INGEST_URL</code>.
            </>
          ) : collection.lastUpdatedAt ? (
            'These are the last counts it has. New calls will show up when Kong reconnects.'
          ) : (
            'Calls will show up here once Kong starts reporting them.'
          )}
        </p>
      </div>
    );
  return (
    <div className="alert">
      <strong>
        <StatusIcon kind="info" /> Usage isn't available for this gateway.
      </strong>
      <p>
        {collection.status === 'unsupported' ? (
          admin ? (
            "The connected gateway doesn't report calls, so active apps, top APIs and time to first call can't be shown."
          ) : (
            "The connected gateway doesn't report calls to the portal."
          )
        ) : admin ? (
          <>
            Usage collection isn't set up. Connect a Kong gateway and set{' '}
            <code>PORTAL_USAGE_INGEST_URL</code> on the server.
          </>
        ) : (
          "Usage collection isn't set up on this portal. Ask your portal admin."
        )}
      </p>
      {admin && collection.status === 'not-configured' && (
        <a href="/admin/gateways">Go to Gateways</a>
      )}
    </div>
  );
}
export function UsageSkeleton({ insights = false }: { insights?: boolean }) {
  return (
    <div
      className="stack"
      role="status"
      aria-label={insights ? 'Loading insights' : 'Loading usage'}
    >
      <div className="skeleton usage-placeholder" />
      <div className="skeleton usage-placeholder" />
      <div className="usage-stats">
        {[0, 1, 2].map((n) => (
          <div key={n} className="skeleton usage-placeholder" />
        ))}
      </div>
      {insights &&
        [0, 1].map((n) => (
          <div key={n} className="stack">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="skeleton usage-placeholder" />
            ))}
          </div>
        ))}
    </div>
  );
}
