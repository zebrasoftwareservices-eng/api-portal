// SPDX-License-Identifier: Apache-2.0
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CopyButton } from '@portal/ui';
import type { Trace, TraceSpan } from '../lib/tracing-api';
import {
  getTryItTrace,
  type TryItTrace,
} from '../lib/try-it-trace-api';
import { formatMs, TraceWaterfall } from './admin-tracing';

export type TryItResponseTrace = {
  traceState: 'traced' | 'off' | 'signed-out' | 'unreachable';
  traceId?: string;
  responseStatus: number;
  sequence: number;
};

type LoadResult = Awaited<ReturnType<typeof getTryItTrace>>;
type PanelState =
  | { kind: 'waiting'; result?: TryItTrace; warning?: boolean }
  | { kind: 'ready'; result: TryItTrace & { trace: Trace } }
  | { kind: 'missing'; result: TryItTrace }
  | { kind: 'gone' }
  | { kind: 'signed-out' }
  | { kind: 'error' };

export function TryItTracePanel({
  response,
  isAdmin,
  loadTrace = getTryItTrace,
}: {
  response?: TryItResponseTrace;
  isAdmin: boolean;
  loadTrace?: (traceId: string) => Promise<LoadResult>;
}) {
  const [panel, setPanel] = useState<PanelState>({ kind: 'waiting' });
  const [elapsed, setElapsed] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [scopeOpen, setScopeOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const responseRef = useRef(response);
  responseRef.current = response;

  useEffect(() => {
    if (!response) return;
    if (response.traceState === 'off') {
      setAnnouncement('Tracing is off for this API');
      return;
    }
    if (response.traceState === 'signed-out') {
      setAnnouncement('Sign in to see traces');
      return;
    }
    if (response.traceState === 'unreachable') {
      setAnnouncement("The call didn't reach the gateway");
      return;
    }
    if (!response.traceId) return;
    startedAt.current = Date.now();
    setElapsed(0);
    setPanel({ kind: 'waiting' });
    setAnnouncement('Waiting for the trace');
  }, [response]);

  useEffect(() => {
    if (!response || response.traceState !== 'traced') return;
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [response]);

  useEffect(() => {
    if (!response || response.traceState !== 'traced' || !response.traceId)
      return;
    let active = true;
    let timer: number | undefined;
    let errorStarted: number | undefined;
    const traceId = response.traceId;

    const schedule = () => {
      timer = window.setTimeout(() => void poll(), 2000);
    };
    const poll = async () => {
      if (!active) return;
      if (document.hidden) return;
      const result = await loadTrace(traceId);
      if (!active || responseRef.current?.traceId !== traceId) return;
      if (result.error) {
        const status = result.error.status;
        if (status === 401) {
          setPanel({ kind: 'signed-out' });
          setAnnouncement('Sign in to see traces');
          return;
        }
        if (status === 404) {
          setPanel({ kind: 'gone' });
          return;
        }
        if (status === 400) {
          setPanel({ kind: 'error' });
          return;
        }
        errorStarted ??= Date.now();
        if (Date.now() - errorStarted >= 30_000) {
          setPanel({ kind: 'error' });
          return;
        }
        setPanel((current) =>
          current.kind === 'waiting'
            ? { ...current, warning: true }
            : { kind: 'waiting', warning: true },
        );
        schedule();
        return;
      }
      errorStarted = undefined;
      if (!result.data) {
        schedule();
        return;
      }
      if (result.data.state === 'ready' && result.data.trace) {
        setPanel({ kind: 'ready', result: { ...result.data, trace: result.data.trace } });
        setAnnouncement(readyAnnouncement(result.data.trace));
        return;
      }
      if (result.data.state === 'missing') {
        setPanel({ kind: 'missing', result: result.data });
        setAnnouncement('No trace arrived for this call');
        return;
      }
      setPanel({ kind: 'waiting', result: result.data });
      schedule();
    };
    const resume = () => {
      if (!document.hidden) {
        if (timer) window.clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener('visibilitychange', resume);
    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [attempt, loadTrace, response]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const checkAgain = useCallback(async () => {
    if (!response?.traceId) return;
    const result = await loadTrace(response.traceId);
    if (result.data?.state === 'ready' && result.data.trace) {
      setPanel({ kind: 'ready', result: { ...result.data, trace: result.data.trace } });
      setAnnouncement(readyAnnouncement(result.data.trace));
    } else if (result.data?.state === 'missing') {
      setAnnouncement('Still no trace.');
    } else {
      retry();
    }
  }, [loadTrace, response?.traceId, retry]);

  if (!response) return null;
  return (
    <Card className="try-it-trace">
      <section aria-labelledby={`try-it-trace-heading-${response.sequence}`}>
        <header className="try-it-trace-heading">
          <h3 id={`try-it-trace-heading-${response.sequence}`}>Trace</h3>
          <span className="try-it-trace-scope-wrap">
            <button
              className="try-it-trace-scope"
              type="button"
              aria-expanded={scopeOpen}
              aria-describedby={scopeOpen ? 'try-it-trace-scope-tip' : undefined}
              onClick={() => setScopeOpen((open) => !open)}
            >
              Your call only <span aria-hidden="true">ⓘ</span>
            </button>
            {scopeOpen && (
              <span id="try-it-trace-scope-tip" role="tooltip">
                Only you can see the traces of your Try it calls. Each new call
                replaces the last one.
              </span>
            )}
          </span>
        </header>
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>
        {response.traceState === 'off' ? (
          <ImmediateState
            icon="ⓘ"
            title="Tracing is off for this API"
            body={
              isAdmin
                ? "Calls to this API aren't in a tracing selection."
                : "Your call worked as usual. Calls to this API aren't traced for your account."
            }
            link={
              isAdmin
                ? { href: '/admin/tracing', label: 'Open tracing settings' }
                : undefined
            }
          />
        ) : response.traceState === 'signed-out' || panel.kind === 'signed-out' ? (
          <ImmediateState
            icon="↪"
            title="Sign in to see traces"
            body="Traces are shown only to the person who made the call."
            link={{ href: signInHref(), label: 'Sign in' }}
          />
        ) : response.traceState === 'unreachable' ? (
          <ImmediateState
            destructive
            icon="✕"
            title="The call didn't reach the gateway"
            body={`Kong didn't answer, so there's no trace for this call. Try again in a moment.${isAdmin ? ' Check that the gateway is running.' : ''}`}
            link={
              isAdmin
                ? { href: '/admin/gateways', label: 'Open Gateways' }
                : undefined
            }
          />
        ) : panel.kind === 'ready' ? (
          <TraceResult trace={panel.result.trace} isAdmin={isAdmin} />
        ) : panel.kind === 'missing' ? (
          <MissingState
            isAdmin={isAdmin}
            responseStatus={response.responseStatus}
            onCheck={() => void checkAgain()}
          />
        ) : panel.kind === 'gone' ? (
          <ImmediateState
            icon="ⓘ"
            title="This trace was replaced"
            body="You made a newer Try it call. Only the latest one is kept."
          />
        ) : panel.kind === 'error' ? (
          <div className="try-it-trace-state destructive" role="alert">
            <span aria-hidden="true">✕</span>
            <div>
              <strong>Couldn&apos;t load the trace.</strong>
              <Button variant="secondary" onClick={retry}>
                Try again
              </Button>
            </div>
          </div>
        ) : panel.result?.trace ? (
          <>
            <TraceResult trace={panel.result.trace} isAdmin={isAdmin} partial />
            {panel.warning && <PollWarning />}
          </>
        ) : (
          <WaitingState elapsed={elapsed} warning={panel.warning} />
        )}
      </section>
    </Card>
  );
}

function ImmediateState({
  icon,
  title,
  body,
  link,
  destructive,
}: {
  icon: string;
  title: string;
  body: string;
  link?: { href: string; label: string };
  destructive?: boolean;
}) {
  return (
    <div className={`try-it-trace-state${destructive ? ' destructive' : ''}`}>
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
        {link && <a href={link.href}>{link.label}</a>}
      </div>
    </div>
  );
}

function WaitingState({ elapsed, warning }: { elapsed: number; warning?: boolean }) {
  return (
    <div className="stack">
      <p className="try-it-trace-waiting">
        <span aria-hidden="true">◷</span> Waiting for the trace from Kong…{' '}
        <span aria-hidden="true">{elapsed} s</span>
      </p>
      {[1, 2, 3].map((row) => (
        <span className="skeleton try-it-trace-skeleton" key={row} />
      ))}
      {warning && <PollWarning />}
    </div>
  );
}

function PollWarning() {
  return <p className="tracing-poll-warning">Can&apos;t reach the portal right now. Retrying.</p>;
}

function MissingState({
  isAdmin,
  responseStatus,
  onCheck,
}: {
  isAdmin: boolean;
  responseStatus: number;
  onCheck: () => void;
}) {
  const body = isAdmin
    ? 'Kong didn\'t send spans within 30 seconds. Check that tracing_instrumentations is set on the Kong node, then run Test in the tracing settings.'
    : responseStatus < 500
      ? "Your call worked, but Kong didn't send its trace within 30 seconds."
      : "Kong didn't send the trace for this call within 30 seconds.";
  return (
    <div className="try-it-trace-state warning">
      <span aria-hidden="true">⚠</span>
      <div>
        <strong>No trace arrived for this call</strong>
        <p>{body}</p>
        <div className="actions">
          <Button variant="secondary" onClick={onCheck}>
            Check again
          </Button>
          {isAdmin && <a href="/admin/tracing">Open tracing page</a>}
        </div>
      </div>
    </div>
  );
}

function TraceResult({
  trace,
  isAdmin,
  partial,
}: {
  trace: Trace;
  isAdmin: boolean;
  partial?: boolean;
}) {
  const slowest = useMemo(
    () => trace.spans.find((span) => span.slowest),
    [trace.spans],
  );
  const pct =
    slowest && trace.durationMs
      ? Math.round((slowest.durationMs / trace.durationMs) * 100)
      : null;
  return (
    <div className="stack try-it-trace-result">
      <div className="tracing-summary">
        <Badge>{trace.request?.method || 'Unknown'}</Badge>
        <code>{trace.request?.path || 'Path not known yet'}</code>
        <Status code={trace.request?.statusCode} />
        <strong>
          {trace.durationMs == null
            ? 'Total not known yet'
            : `${formatMs(trace.durationMs)} total`}
        </strong>
      </div>
      <div className="tracing-trace-id">
        <code aria-label={`Trace ID ${trace.traceId}`}>Trace ID {middleTraceId(trace.traceId)}</code>
        <CopyButton
          value={trace.traceId}
          ariaLabel="Copy trace ID"
          copiedMessage="Trace ID copied"
        />
      </div>
      {partial && <p className="muted">Kong is still sending this trace.</p>}
      {slowest && <Slowest span={slowest} pct={pct} />}
      <TraceWaterfall trace={trace} variant="try-it" />
      <footer className="try-it-trace-footer">
        <span>Only your latest Try it call is kept.</span>
        {isAdmin && <a href="/admin/tracing">Open tracing page</a>}
      </footer>
    </div>
  );
}

function Slowest({ span, pct }: { span: TraceSpan; pct: number | null }) {
  return (
    <p className="tracing-slowest">
      ⚠ Slowest: {spanDisplayName(span)} — {formatMs(span.durationMs)}
      {pct == null ? '' : `, ${pct}% of the call`}
    </p>
  );
}

function Status({ code }: { code?: number | null }) {
  const label =
    code == null
      ? 'No status'
      : `${code}${statusReasons[code] ? ` ${statusReasons[code]}` : ''}`;
  const kind = code && code >= 500 ? 'error' : code && code >= 400 ? 'warning' : 'success';
  return <Badge className={`trace-status-${kind}`}>{code && code < 300 ? '✓ ' : code && code >= 500 ? '✕ ' : code && code >= 400 ? '⚠ ' : ''}{label}</Badge>;
}

const statusReasons: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

function spanDisplayName(span: TraceSpan) {
  if (span.label === 'request') return 'Request';
  if (span.label === 'router') return 'Router';
  if (span.label === 'plugin') return span.plugin || span.name;
  if (span.label === 'upstream') return 'Upstream try';
  return span.name;
}

function readyAnnouncement(trace: Trace) {
  const slowest = trace.spans.find((span) => span.slowest);
  return `Trace ready: ${trace.request?.method || 'Unknown'} ${trace.request?.path || 'path unknown'}, ${trace.request?.statusCode || 'status unknown'}, ${trace.durationMs ?? 0} milliseconds.${slowest ? ` Slowest: ${spanDisplayName(slowest)}, ${slowest.durationMs} milliseconds.` : ''}`;
}

function signInHref() {
  if (typeof window === 'undefined') return '/sign-in';
  return `/sign-in?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`;
}

function middleTraceId(traceId: string) {
  return traceId.length > 20 ? `${traceId.slice(0, 8)}…${traceId.slice(-7)}` : traceId;
}
