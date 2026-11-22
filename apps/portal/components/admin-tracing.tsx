// SPDX-License-Identifier: Apache-2.0
'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Badge,
  Button,
  Card,
  CopyButton,
  Dialog,
  Input,
  Table,
  toast,
} from '@portal/ui';
import {
  tracingApi,
  type Target,
  type Trace,
  type TraceSpan,
  type TracingSelection,
  type TracingSettings,
  type TracingState,
} from '../lib/tracing-api';

type Instrumentation = TracingSettings['instrumentations'][number];
const DEFAULT_INSTRUMENTATIONS: Instrumentation[] = [
  'request',
  'router',
  'balancer',
  'plugin_rewrite',
  'plugin_access',
  'plugin_header_filter',
];
const MORE_INSTRUMENTATIONS: Instrumentation[] = [
  'all',
  'db_query',
  'dns_query',
  'http_client',
  'off',
];
const failureCopy: Record<
  string,
  { title: string; body: (endpoint: string, node?: string) => string }
> = {
  'tracing-off': {
    title: 'tracing is off on the Kong node',
    body: (_endpoint, node = 'off') =>
      `The Kong node reports tracing_instrumentations as ${node}. Set KONG_TRACING_INSTRUMENTATIONS to include request (the block above has the full line), restart the Kong node, then test again.`,
  },
  'endpoint-unreachable': {
    title: "Kong can't reach the trace endpoint",
    body: (endpoint) =>
      `Kong took the test call but no trace reached ${endpoint} within 10 seconds. Check that Kong can reach this address. From a Kong container, localhost means Kong itself; use the portal server's service name.`,
  },
  'gateway-unreachable': {
    title: "the portal can't reach Kong",
    body: () =>
      "The Kong Admin API didn't answer. Check that Kong is running and that the address on the Gateways page is right.",
  },
  'proxy-unreachable': {
    title: "the portal can't reach Kong's proxy",
    body: () =>
      "The portal couldn't send a test call through Kong's proxy. Check KONG_PROXY_INTERNAL_URL on the portal server.",
  },
  'gateway-rejected': {
    title: 'Kong refused the test plugin',
    body: () =>
      'Kong refused the opentelemetry plugin. Make sure KONG_PLUGINS includes it (bundled does), then test again.',
  },
};

export function AdminTracing() {
  const [tracing, setTracing] = useState<TracingState>();
  const [error, setError] = useState<{ status?: number }>();
  const [loading, setLoading] = useState(true);
  const deniedTitle = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const result = await tracingApi.get();
    setError(result.error);
    if (result.data) setTracing(result.data);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (error?.status === 403) deniedTitle.current?.focus();
  }, [error]);
  useEffect(() => {
    if (tracing?.apply.status !== 'pending') return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load, tracing?.apply.status]);
  if (error?.status === 403)
    return (
      <Card className="stack tracing-denied">
        <span aria-hidden="true">🔒</span>
        <h1 ref={deniedTitle} tabIndex={-1}>
          You don't have access to Tracing
        </h1>
        <p>Tracing is only for portal admins.</p>
        <a className="button" href="/dashboard">
          Go to My apps
        </a>
      </Card>
    );
  if (loading && !tracing)
    return (
      <div className="stack tracing-page">
        <h1>Tracing</h1>
        {[1, 2, 3].map((n) => (
          <div className="card skeleton tracing-skeleton" key={n} />
        ))}
      </div>
    );
  if (error || !tracing)
    return (
      <div className="stack">
        <h1>Tracing</h1>
        <div className="alert error" role="alert">
          Couldn't load tracing settings.{' '}
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </div>
    );
  if (!tracing.supported)
    return (
      <div className="stack tracing-page">
        <h1>Tracing</h1>
        <Card className="stack">
          <span aria-hidden="true">ⓘ</span>
          <h2>Tracing isn't available for this gateway</h2>
          <p>
            Trace waterfalls work with Kong gateways. The connected gateway
            doesn't offer tracing yet.
          </p>
          <a className="button" href="/admin/gateways">
            Open Gateways
          </a>
        </Card>
      </div>
    );
  return (
    <div className="stack tracing-page">
      <header>
        <h1>Tracing</h1>
        <p className="muted">
          See where the time of one API call goes: Kong, each plugin, or your
          upstream.
        </p>
      </header>
      <TracingSettingsCard tracing={tracing} onSaved={setTracing} />
      <TracingSelections tracing={tracing} onChange={setTracing} />
      <LatestTraceCard
        enabled={tracing.configured}
        hasSelections={tracing.selections.length > 0}
        selections={tracing.selections}
      />
    </div>
  );
}

export function TracingSettingsCard({
  tracing,
  onSaved,
}: {
  tracing: TracingState;
  onSaved(value: TracingState): void;
}) {
  const [open, setOpen] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const rate = tracing.settings.samplingRate;
  const gloss =
    rate === 1
      ? 'every call'
      : rate === 0
        ? 'no calls'
        : `about ${Math.round(rate * 100)}% of calls`;
  return (
    <Card className="stack tracing-card">
      <div className="tracing-card-heading">
        <h2>Kong settings</h2>
        <Button
          ref={editButton}
          variant={tracing.configured ? 'secondary' : 'default'}
          onClick={() => setOpen(true)}
        >
          {tracing.configured ? 'Edit settings' : 'Turn on tracing'}
        </Button>
      </div>
      {tracing.configured ? (
        <>
          <dl className="tracing-settings">
            <dt>Trace endpoint</dt>
            <dd>
              <code>{tracing.settings.traceEndpoint}</code>
            </dd>
            <dt>Instrumentations</dt>
            <dd>
              <code>{tracing.settings.instrumentations.join(', ')}</code>
            </dd>
            <dt>Sampling rate</dt>
            <dd>
              {rate} ({gloss})
            </dd>
          </dl>
          <div className="tracing-status">
            <Status passed={tracing.lastTest?.passed} empty={!tracing.lastTest}>
              {tracing.lastTest
                ? tracing.lastTest.passed
                  ? 'Test passed'
                  : `Last test failed: ${failureCopy[tracing.lastTest.cause || '']?.title || 'the check did not finish'}`
                : 'Not tested yet'}
            </Status>
            <Status
              passed={tracing.apply.status === 'applied'}
              pending={tracing.apply.status === 'pending'}
            >
              {tracing.apply.status === 'pending'
                ? 'Applying to Kong…'
                : tracing.apply.status === 'applied'
                  ? 'Applied to Kong'
                  : "Kong didn't take the tracing plugins"}
            </Status>
          </div>
          {tracing.apply.status === 'failed' && (
            <div className="alert error">
              <strong>Kong didn't take the tracing plugins</strong>
              <p>{tracing.apply.message}</p>
              <p>
                The portal retries automatically. Fix the cause, then wait a
                minute or change a selection to retry now.
              </p>
            </div>
          )}
        </>
      ) : (
        <p>
          Tracing is off. Kong sends the portal a trace of each selected call
          once its node has tracing turned on and the portal has the address
          Kong can reach it at.
        </p>
      )}
      <TracingSettingsDialog
        open={open}
        tracing={tracing}
        onOpenChange={setOpen}
        onSaved={onSaved}
        returnFocusRef={editButton}
      />
    </Card>
  );
}
function Status({
  children,
  passed,
  pending,
  empty,
}: {
  children: React.ReactNode;
  passed?: boolean;
  pending?: boolean;
  empty?: boolean;
}) {
  return (
    <span
      className={
        passed ? 'status-success' : pending || empty ? 'muted' : 'error-text'
      }
    >
      {passed ? '✓' : pending ? '◌' : empty ? '○' : '✕'} {children}
    </span>
  );
}

type TestState = {
  kind: 'idle' | 'running' | 'passed' | 'failed' | 'unsupported' | 'rate';
  cause?: string;
  detail?: string;
  node?: string;
  report?: {
    node: { instrumentations: string[]; samplingRate?: number | null };
    warnings: string[];
  };
  stale?: boolean;
};
export function SaveGuardNotice({
  tone = 'warning',
}: {
  tone?: 'warning' | 'destructive';
}) {
  return (
    <div className={`alert ${tone === 'warning' ? 'warning' : 'error'}`}>
      {tone === 'warning'
        ? "The test hasn't passed with these values. You can still save, for example to restart Kong next, but no traces will arrive until the test passes."
        : 'Run a test that passes with these values before saving.'}
    </div>
  );
}
export function TracingSettingsDialog({
  open,
  tracing,
  onOpenChange,
  onSaved,
  returnFocusRef,
}: {
  open: boolean;
  tracing: TracingState;
  onOpenChange(value: boolean): void;
  onSaved(value: TracingState): void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [values, setValues] = useState(tracing.settings);
  const [result, setResult] = useState<TestState>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setValues(tracing.settings);
      setResult({ kind: 'idle' });
      setErrors({});
    }
  }, [open, tracing.settings]);
  const change = (next: TracingSettings) => {
    setValues(next);
    setResult((old) => (old.kind === 'idle' ? old : { ...old, stale: true }));
  };
  const toggle = (name: Instrumentation) => {
    const exclusive = name === 'all' || name === 'off';
    const selected = values.instrumentations.includes(name);
    const instrumentations: Instrumentation[] = selected
      ? values.instrumentations.filter((item) => item !== name)
      : exclusive
        ? [name]
        : [
            ...values.instrumentations.filter(
              (item) => item !== 'all' && item !== 'off',
            ),
            name,
          ];
    change({ ...values, instrumentations });
  };
  const validate = () => {
    const next: Record<string, string> = {};
    try {
      const url = new URL(values.traceEndpoint);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      next.traceEndpoint =
        'Enter an http or https address without a query string, for example http://server:4000/api/v1/internal/traces/kong.';
    }
    if (!values.instrumentations.length)
      next.instrumentations = 'Choose at least one instrumentation.';
    if (
      !Number.isFinite(values.samplingRate) ||
      values.samplingRate < 0 ||
      values.samplingRate > 1
    )
      next.samplingRate = 'Enter a number from 0 to 1.';
    setErrors(next);
    return !Object.keys(next).length;
  };
  const test = async () => {
    if (!validate()) return;
    setResult({ kind: 'running' });
    const response = await tracingApi.test(values);
    if (response.data) setResult({ kind: 'passed', report: response.data });
    else if (response.error?.status === 409) setResult({ kind: 'unsupported' });
    else if (response.error?.status === 429) setResult({ kind: 'rate' });
    else {
      const problem = response.error as {
        cause?: string;
        detail?: string;
        node?: { instrumentations?: string[] };
      };
      setResult({
        kind: 'failed',
        cause: problem?.cause,
        detail: problem?.detail,
        node: problem?.node?.instrumentations?.join(', '),
      });
    }
  };
  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const response = await tracingApi.save(values);
    setSaving(false);
    if (response.data) {
      onSaved(response.data);
      onOpenChange(false);
      toast.success('Tracing settings saved');
    } else if (response.error?.status === 409)
      setResult({ kind: 'failed', cause: 'test-required' });
    else if (response.error?.status === 400)
      setErrors({ traceEndpoint: 'Check this value and try again.' });
    else
      setResult({
        kind: 'failed',
        detail: "Couldn't save the settings. Try again.",
      });
  };
  const code = `KONG_TRACING_INSTRUMENTATIONS=${values.instrumentations.join(',')}\nKONG_TRACING_SAMPLING_RATE=${values.samplingRate}`;
  const busy = result.kind === 'running' || saving;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className="dialog tracing-dialog"
          aria-describedby="tracing-dialog-lead"
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current?.isConnected) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <div className="tracing-dialog-body stack">
            <Dialog.Title>
              {tracing.configured ? 'Tracing settings' : 'Turn on tracing'}
            </Dialog.Title>
            <Dialog.Description id="tracing-dialog-lead">
              Kong only traces calls when tracing is on for the whole node. Set
              these two node settings to match the fields below, then restart
              the Kong node — Kong reads them only at start.
            </Dialog.Description>
            <div className="tracing-code">
              <code>{code}</code>
              <CopyButton value={code} announce="Copied" />
            </div>
            <p className="muted">
              In kong.conf: <code>tracing_instrumentations</code> and{' '}
              <code>tracing_sampling_rate</code>.
            </p>
            <label htmlFor="trace-endpoint">Trace endpoint</label>
            <Input
              id="trace-endpoint"
              type="url"
              className="mono"
              value={values.traceEndpoint}
              disabled={busy}
              aria-invalid={!!errors.traceEndpoint}
              aria-describedby="trace-endpoint-help"
              onChange={(event) =>
                change({ ...values, traceEndpoint: event.target.value })
              }
            />
            <p
              id="trace-endpoint-help"
              className={errors.traceEndpoint ? 'error-text' : 'muted'}
            >
              {errors.traceEndpoint ||
                "The portal's trace address as Kong reaches it. Inside Docker this is the server's service name, not localhost."}
            </p>
            <fieldset disabled={busy} aria-describedby="instrumentations-help">
              <legend>Instrumentations</legend>
              <div className="tracing-checks">
                {DEFAULT_INSTRUMENTATIONS.map((name) => (
                  <Check
                    key={name}
                    name={name}
                    checked={values.instrumentations.includes(name)}
                    disabled={
                      values.instrumentations.includes('all') ||
                      values.instrumentations.includes('off')
                    }
                    onChange={() => toggle(name)}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={more}
                onClick={() => setMore(!more)}
              >
                More options
              </Button>
              {more && (
                <div className="tracing-checks">
                  {MORE_INSTRUMENTATIONS.map((name) => (
                    <Check
                      key={name}
                      name={name}
                      checked={values.instrumentations.includes(name)}
                      disabled={false}
                      onChange={() => toggle(name)}
                    />
                  ))}
                </div>
              )}
              <p
                id="instrumentations-help"
                className={errors.instrumentations ? 'error-text' : 'muted'}
              >
                {errors.instrumentations ||
                  (!values.instrumentations.includes('request') &&
                  !values.instrumentations.includes('all')
                    ? 'Without request, Kong records no root span and the Test will fail.'
                    : 'db_query, dns_query and http_client add many spans; leave them off unless you need them.')}
              </p>
            </fieldset>
            <label htmlFor="sampling-rate">Sampling rate</label>
            <Input
              id="sampling-rate"
              type="number"
              min="0"
              max="1"
              step="0.01"
              inputMode="decimal"
              value={values.samplingRate}
              disabled={busy}
              aria-invalid={!!errors.samplingRate}
              onChange={(event) =>
                change({ ...values, samplingRate: event.target.valueAsNumber })
              }
            />
            <p className={errors.samplingRate ? 'error-text' : 'muted'}>
              {errors.samplingRate ||
                (values.samplingRate < 1
                  ? `Kong will trace about ${Math.round(values.samplingRate * 100)}% of selected calls, so a single test call may not show up.`
                  : 'Share of calls Kong traces, 0 to 1. Use 1 to trace every selected call.')}
            </p>
            <TracingTestResult state={result} endpoint={values.traceEndpoint} />
            {result.kind !== 'passed' && (
              <SaveGuardNotice
                tone={
                  result.cause === 'test-required' ? 'destructive' : 'warning'
                }
              />
            )}
          </div>
          <div className="actions tracing-dialog-actions">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant="secondary"
              disabled={
                busy || result.kind === 'unsupported' || result.kind === 'rate'
              }
              onClick={() => void test()}
            >
              {result.kind === 'running' ? 'Testing…' : 'Test'}
            </Button>
            <Button
              type="button"
              disabled={busy || result.kind === 'unsupported'}
              onClick={() => void save()}
            >
              {saving
                ? 'Saving…'
                : tracing.configured
                  ? 'Save'
                  : 'Save and turn on'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Check({
  name,
  checked,
  disabled,
  onChange,
}: {
  name: Instrumentation;
  checked: boolean;
  disabled: boolean;
  onChange(): void;
}) {
  return (
    <label className="tracing-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />{' '}
      <code>{name}</code>
      {name === 'request' ? ' (required)' : ''}
    </label>
  );
}
export function TracingTestResult({
  state,
  endpoint,
}: {
  state: TestState;
  endpoint: string;
}) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'running')
    return (
      <div className="alert" role="status" aria-busy="true">
        Checking Kong. This can take up to 15 seconds.
      </div>
    );
  if (state.kind === 'passed' && state.report)
    return (
      <div className="alert success" role="status">
        <strong>✓ Test passed</strong>
        <p>Kong delivered a test trace to the portal.</p>
        <p>
          Kong reports: instrumentations{' '}
          <code>{state.report.node.instrumentations.join(', ')}</code>, sampling
          rate <code>{state.report.node.samplingRate ?? 'not reported'}</code>.
        </p>
        {state.report.warnings.length > 0 && (
          <ul>
            {state.report.warnings.map((warning) => (
              <li key={warning}>⚠ Note: {warning}</li>
            ))}
          </ul>
        )}
        {state.stale && (
          <p className="muted">
            You changed a value since this test. Test again to check the new
            values.
          </p>
        )}
      </div>
    );
  if (state.kind === 'unsupported')
    return (
      <div className="alert error" role="alert">
        Tracing works only with a Kong gateway. The connected gateway doesn't
        support it.
      </div>
    );
  if (state.kind === 'rate')
    return (
      <div className="alert warning" role="alert">
        Too many tests in a short time. Wait a minute, then test again.
      </div>
    );
  const copy = failureCopy[state.cause || ''];
  return (
    <div className="alert error" role="alert">
      <strong>
        ✕{' '}
        {state.detail?.startsWith("Couldn't save")
          ? state.detail
          : `Test failed: ${copy?.title || 'the check did not finish'}`}
      </strong>
      {!state.detail?.startsWith("Couldn't save") && (
        <p>
          {copy
            ? copy.body(endpoint, state.node)
            : state.detail ||
              'Something went wrong on the portal server. Try again.'}
        </p>
      )}
      {state.cause === 'gateway-unreachable' && (
        <a href="/admin/gateways">Open Gateways</a>
      )}
    </div>
  );
}

export function coversCopy(
  kind: TracingSelection['kind'],
  apps: number | null,
) {
  if (kind === 'api') return 'Every call to this API';
  if (kind === 'developer')
    return apps
      ? `${apps} ${apps === 1 ? 'app' : 'apps'} they created`
      : 'No active apps yet; calls start being traced when they create one';
  return apps
    ? `${apps} team ${apps === 1 ? 'app' : 'apps'}`
    : 'No active apps yet';
}
export function TracingSelections({
  tracing,
  onChange,
}: {
  tracing: TracingState;
  onChange(value: TracingState): void;
}) {
  const [kind, setKind] = useState<TracingSelection['kind']>('api');
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetId, setTargetId] = useState('');
  const [query, setQuery] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!tracing.configured) return;
    let active = true;
    const timer = setTimeout(() => {
      void tracingApi.targets(kind, query).then((response) => {
        if (active && response.data) setTargets(response.data.items);
      });
    }, kind === 'developer' ? 250 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, query, tracing.configured]);
  const changeKind = (next: TracingSelection['kind']) => {
    setKind(next);
    setTargets([]);
    setTargetId('');
    setQuery('');
    setError('');
  };
  const add = async () => {
    if (!targetId) return;
    setWorking(true);
    setError('');
    const response = await tracingApi.add(kind, targetId);
    setWorking(false);
    if (response.data) {
      const existed = tracing.selections.some(
        (item) => item.id === response.data?.id,
      );
      onChange({
        ...tracing,
        selections: existed
          ? tracing.selections
          : [response.data, ...tracing.selections],
        apply: { ...tracing.apply, status: 'pending' },
      });
      toast.success(
        existed
          ? `${response.data.label} is already traced.`
          : `Tracing ${response.data.label}`,
      );
      setTargetId('');
    } else
      setError(
        response.error?.status === 404
          ? `That ${kind} no longer exists. Pick another.`
          : response.error?.status === 409
            ? 'Turn on tracing first.'
            : "Couldn't update what's traced. Try again.",
      );
  };
  const remove = async (selection: TracingSelection) => {
    const previous = tracing.selections;
    onChange({
      ...tracing,
      selections: previous.filter((item) => item.id !== selection.id),
      apply: { ...tracing.apply, status: 'pending' },
    });
    const response = await tracingApi.remove(selection.id);
    if (!response.error || response.error.status === 404)
      toast.success(`Stopped tracing ${selection.label}`);
    else {
      onChange({ ...tracing, selections: previous });
      setError("Couldn't update what's traced. Try again.");
    }
  };
  const selectedIds = new Set(
    tracing.selections
      .filter((item) => item.kind === kind)
      .map((item) => item.targetId),
  );
  return (
    <Card className="stack tracing-card">
      <h2>What's traced</h2>
      <p>
        Calls that match any of these are traced. A call that matches more than
        one is traced once.
      </p>
      <div className="tracing-add">
        <label>
          Kind
          <select
            value={kind}
            disabled={!tracing.configured || working}
            onChange={(event) =>
              changeKind(event.target.value as TracingSelection['kind'])
            }
          >
            <option value="api">API</option>
            <option value="developer">Developer</option>
            <option value="team">Team</option>
          </select>
        </label>
        <label>
          Target
          {kind === 'developer' && (
            <Input
              aria-label="Search developers"
              placeholder="Search by name or email…"
              value={query}
              disabled={!tracing.configured || working}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          <select
            aria-label={`Select ${kind}`}
            value={targetId}
            disabled={!tracing.configured || working}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">
              {kind === 'api'
                ? 'Search APIs…'
                : kind === 'team'
                  ? 'Search teams…'
                  : 'Choose a developer…'}
            </option>
            {targets.map((target) => (
              <option
                key={target.id}
                value={target.id}
                disabled={selectedIds.has(target.id)}
              >
                {target.name}
                {target.email ? ` · ${target.email}` : ''}
                {selectedIds.has(target.id) ? ' — Already traced' : ''}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!tracing.configured || !targetId || working}
          onClick={() => void add()}
        >
          {working ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!tracing.configured ? (
        <p>
          Turn on tracing first. Then choose the APIs, developers or teams to
          trace.
        </p>
      ) : tracing.selections.length === 0 ? (
        <p>Nothing is traced yet. Add an API, a developer or a team.</p>
      ) : (
        <div className="table-wrap">
          <Table className="tracing-selections">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Name</th>
                <th>Covers</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tracing.selections.map((selection) => (
                <tr key={selection.id}>
                  <td>
                    <Badge>
                      {selection.kind.charAt(0).toUpperCase() +
                        selection.kind.slice(1)}
                    </Badge>
                  </td>
                  <td>{selection.label}</td>
                  <td>{coversCopy(selection.kind, selection.apps)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      aria-label={`Stop tracing ${selection.label}`}
                      onClick={() => void remove(selection)}
                    >
                      Stop tracing
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}

export function LatestTraceCard({
  enabled,
  hasSelections,
  selections,
  apiId: initialApiId,
}: {
  enabled: boolean;
  hasSelections: boolean;
  selections: TracingSelection[];
  apiId?: string;
}) {
  const [apiId, setApiId] = useState(initialApiId);
  const [apis, setApis] = useState<
    Array<{ id: string; name: string; receivedAt: string }>
  >([]);
  const [trace, setTrace] = useState<Trace | null>();
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const current = useRef('');
  const poll = useCallback(async () => {
    if (!enabled) return;
    const response = await tracingApi.latest(apiId);
    if (response.error) {
      setError(true);
      return;
    }
    setError(false);
    const next = response.data?.trace ?? null;
    const nextApis = response.data?.apis ?? [];
    setApis(nextApis);
    if (!apiId) setApiId(next?.api?.id ?? nextApis[0]?.id);
    const key = next ? `${next.traceId}:${next.receivedAt}` : '';
    if (next && current.current && current.current !== key)
      setAnnouncement(
        `New traced call: ${next.request?.method || 'Unknown'} ${next.request?.path || 'path unknown'}, ${next.request?.statusCode ?? 'no status'}, ${next.durationMs ?? 'unknown'} milliseconds.`,
      );
    current.current = key;
    setTrace((old) =>
      old &&
      next &&
      old.traceId === next.traceId &&
      old.receivedAt === next.receivedAt
        ? old
        : next,
    );
  }, [apiId, enabled]);
  useEffect(() => {
    setApiId(initialApiId);
  }, [initialApiId]);
  useEffect(() => {
    if (!enabled) return;
    void poll();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, 3000);
    const visible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, poll]);
  return (
    <Card className="stack tracing-card">
      <div className="tracing-card-heading">
        <h2>Latest traced call</h2>
        <div className="tracing-latest-controls">
          {apis.length > 0 && (
            <label>
              Show the latest call to:
              <select
                aria-label="Show the latest call to"
                value={apiId ?? ''}
                onChange={(event) => {
                  current.current = '';
                  setAnnouncement('');
                  setError(false);
                  setTrace(undefined);
                  setApiId(event.target.value);
                }}
              >
                {apis.map((api) => (
                  <option key={api.id} value={api.id}>
                    {api.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {trace && (
            <time
              dateTime={trace.receivedAt}
              title={new Date(trace.receivedAt).toISOString()}
            >
              Received {relative(trace.receivedAt)}
            </time>
          )}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <p className="muted">
        Only the latest call to each API is kept. The next traced call to this
        API replaces this one.
      </p>
      {!enabled ? (
        <p>Turn on tracing and choose what to trace to see calls here.</p>
      ) : !hasSelections ? (
        <p>Add an API, developer or team above, then make a call.</p>
      ) : trace === undefined && !error ? (
        <div aria-label="Loading latest trace">
          {[1, 2, 3, 4, 5].map((n) => (
            <div className="skeleton tracing-row-skeleton" key={n} />
          ))}
        </div>
      ) : error && trace === undefined ? (
        <div className="alert error">
          Couldn't load the latest trace.{' '}
          <Button variant="secondary" onClick={() => void poll()}>
            Try again
          </Button>
        </div>
      ) : trace ? (
        <TraceView trace={trace} />
      ) : (
        <div className="tracing-empty">
          <span aria-hidden="true">◉</span>
          <h3>No traced call yet</h3>
          <p>
            Make a call to a traced API, for example with Try it on the API
            page. It shows up here within a few seconds.
          </p>
          {selections.find((item) => item.kind === 'api' && item.slug) && (
            <a
              href={`/apis/${selections.find((item) => item.kind === 'api' && item.slug)?.slug}`}
            >
              Open{' '}
              {
                selections.find((item) => item.kind === 'api' && item.slug)
                  ?.label
              }
            </a>
          )}
        </div>
      )}
      {error && trace && (
        <p className="tracing-poll-warning">
          Can't check for new calls right now. Retrying.
        </p>
      )}
      {trace && <p className="muted">Checks for a new call every 3 seconds.</p>}
    </Card>
  );
}
function TraceView({ trace }: { trace: Trace }) {
  const request = trace.request;
  const slowest = trace.spans.find((span) => span.slowest);
  const pct =
    slowest && trace.durationMs
      ? Math.round((slowest.durationMs / trace.durationMs) * 100)
      : null;
  return (
    <>
      <div className="tracing-summary">
        <Badge>{request?.method || 'Unknown'}</Badge>
        <code>{request?.path || 'Path not known yet'}</code>
        <StatusCode code={request?.statusCode} />
        <strong>
          {trace.durationMs == null
            ? 'Total not known yet'
            : `${formatMs(trace.durationMs)} total`}
        </strong>
        <span>
          {trace.api ? (
            <>
              API:{' '}
              <a href={`/admin/apis/${trace.api.slug}`}>{trace.api.name}</a>
            </>
          ) : (
            'API: not matched'
          )}
        </span>
      </div>
      <div className="tracing-trace-id">
        <code>Trace ID {trace.traceId}</code>
        <CopyButton value={trace.traceId} ariaLabel="Copy trace ID" />
      </div>
      {(!request || trace.durationMs == null) && (
        <p className="muted">
          Kong is still sending this trace. The rest appears in a few seconds.
        </p>
      )}
      {slowest && (
        <p className="tracing-slowest">
          ⚠ Slowest: {displayName(slowest)}
          {slowest.label === 'plugin'
            ? ' plugin'
            : slowest.label === 'other'
              ? ' step'
              : ''}{' '}
          — {formatMs(slowest.durationMs)}
          {pct == null ? '' : `, ${pct}% of the call`}
        </p>
      )}
      <TraceWaterfall trace={trace} />
    </>
  );
}
function StatusCode({ code }: { code?: number | null }) {
  const text =
    code == null
      ? 'No status'
      : `${code}${reason[code] ? ` ${reason[code]}` : ''}`;
  return (
    <Badge
      className={
        code && code >= 500
          ? 'trace-status-error'
          : code && code >= 400
            ? 'trace-status-warning'
            : code && code < 300
              ? 'trace-status-success'
              : ''
      }
    >
      {code && code < 300
        ? '✓ '
        : code && code >= 500
          ? '✕ '
          : code && code >= 400
            ? '⚠ '
            : ''}
      {text}
    </Badge>
  );
}
const reason: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};
export function TraceWaterfall({
  trace,
  maxRows = 200,
  variant = 'admin',
}: {
  trace: Trace;
  maxRows?: number;
  variant?: 'admin' | 'try-it';
}) {
  const [all, setAll] = useState(false);
  const spans = all ? trace.spans : trace.spans.slice(0, maxRows);
  const axis =
    trace.durationMs ||
    Math.max(
      0,
      ...trace.spans.map((span) => span.startOffsetMs + span.durationMs),
    );
  const byId = useMemo(
    () => new Map(trace.spans.map((span) => [span.spanId, span])),
    [trace.spans],
  );
  const depth = (span: TraceSpan) => {
    let value = 0;
    let parent = span.parentSpanId ? byId.get(span.parentSpanId) : undefined;
    const seen = new Set<string>();
    while (parent && !seen.has(parent.spanId)) {
      seen.add(parent.spanId);
      value += 1;
      parent = parent.parentSpanId ? byId.get(parent.parentSpanId) : undefined;
    }
    return Math.min(2, value);
  };
  return (
    <div className="table-wrap">
      <Table className="trace-waterfall">
        <caption className="sr-only">
          {variant === 'try-it'
            ? 'Spans of your Try it call, in start order'
            : 'Spans of the latest traced call, in start order'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Start</th>
            <th scope="col">Duration</th>
            <th scope="col">
              <span className="trace-axis">
                {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
                  <span key={tick}>{formatMs(axis * tick)}</span>
                ))}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {spans.map((span) => {
            const parent = span.parentSpanId
              ? byId.get(span.parentSpanId)
              : undefined;
            return (
              <tr key={span.spanId}>
                <td
                  style={{
                    paddingInlineStart: `calc(12px + ${depth(span)} * 8px)`,
                  }}
                >
                  <Badge>
                    {span.label.charAt(0).toUpperCase() + span.label.slice(1)}
                  </Badge>{' '}
                  <strong>{displayName(span)}</strong>
                  {span.slowest && (
                    <Badge className="trace-slowest-badge">⚠ Slowest</Badge>
                  )}
                  {span.status === 'error' && (
                    <Badge className="trace-error-badge">✕ Error</Badge>
                  )}
                  <span className="trace-parent sr-only">
                    {parent ? ` inside ${displayName(parent)}` : ''}
                  </span>
                  {span.name !== displayName(span) && (
                    <code className="trace-raw">{span.name}</code>
                  )}
                </td>
                <td>{formatMs(span.startOffsetMs)}</td>
                <td>{formatMs(span.durationMs)}</td>
                <td aria-hidden="true">
                  <SpanBar
                    offsetPct={axis ? (span.startOffsetMs / axis) * 100 : 0}
                    widthPct={axis ? (span.durationMs / axis) * 100 : 0}
                    variant={
                      span.slowest
                        ? 'slowest'
                        : span.label === 'request'
                          ? 'root'
                          : 'span'
                    }
                    label={`${displayName(span)}: starts ${formatMs(span.startOffsetMs)}, takes ${formatMs(span.durationMs)}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {trace.spans.length > maxRows && !all && (
        <Button variant="secondary" onClick={() => setAll(true)}>
          Show all {trace.spans.length} spans
        </Button>
      )}
    </div>
  );
}
export function SpanBar({
  offsetPct,
  widthPct,
  variant,
  label,
}: {
  offsetPct: number;
  widthPct: number;
  variant: 'root' | 'span' | 'slowest';
  label: string;
}) {
  return (
    <div className="span-track" title={label}>
      <span
        className={`span-bar ${variant}`}
        style={{
          left: `${Math.max(0, Math.min(100, offsetPct))}%`,
          width: `${Math.max(0, Math.min(100 - offsetPct, widthPct))}%`,
        }}
      />
    </div>
  );
}
export function formatMs(value: number) {
  return `${value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : Math.round(value)} ms`;
}
function displayName(span: TraceSpan) {
  if (span.label === 'request') return 'Request';
  if (span.label === 'router') return 'Router';
  if (span.label === 'plugin') return span.plugin || span.name;
  if (span.label === 'upstream') return 'Upstream try';
  return span.name;
}
function relative(value: string) {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  return `${Math.floor(seconds / 3600)} hours ago`;
}
