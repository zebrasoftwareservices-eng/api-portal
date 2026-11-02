// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  Button,
  Card,
  KeyHint,
  StatusBadge,
  Table,
  toast,
} from '@portal/ui';
import { api, networkProblem, retrySeconds } from '../lib/client';
import type { Credential, Problem } from '../lib/types';
import { useResource } from './use-resource';
import { usePortal } from './providers';
import { ProblemAlert } from './problem-alert';
import { KeyRevealDialog } from './key-reveal-dialog';
import { DateValue } from './date';
export function AppDetail({ appId }: { appId: string }) {
  const {
    data: app,
    error,
    loading,
    reload,
    setData,
  } = useResource(() =>
    api.GET('/v1/apps/{appId}', { params: { path: { appId } } }),
  );
  const { reveal, setReveal } = usePortal();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [problem, setProblem] = useState<Problem>();
  const [retry, setRetry] = useState(0);
  const [revoke, setRevoke] = useState<Credential>();
  const [revokeProblem, setRevokeProblem] = useState<Problem>();
  const [highlight, setHighlight] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  useEffect(() => {
    if (app) {
      document.title = `${app.name} · Developer Portal`;
      heading.current?.focus();
    }
  }, [app?.id, app?.name]);
  const active =
    app?.credentials.filter((c) => c.status === 'active').length || 0;
  function focusRow(id: string) {
    setHighlight(id);
    requestAnimationFrame(() => document.getElementById(`key-${id}`)?.focus());
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(undefined), 3000);
  }
  async function createKey() {
    if (lock.current || !app || active >= 5) return;
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      const { data, error, response } = await api.POST(
        '/v1/apps/{appId}/credentials',
        { params: { path: { appId } } },
      );
      if (error) {
        setProblem(error);
        setRetry(retrySeconds(response));
        if (error.status === 409) await reload();
      } else if (data) {
        const summary: Credential = {
          id: data.id,
          kind: data.kind,
          keyHint: data.keyHint,
          status: data.status,
          createdAt: data.createdAt,
        };
        setData({ ...app, credentials: [...app.credentials, summary] });
        setReveal({ app, credential: data, variant: 'additional' });
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function revokeKey() {
    if (lock.current || !revoke || !app) return;
    lock.current = true;
    setPending(true);
    setRevokeProblem(undefined);
    try {
      const { error, response } = await api.DELETE(
        '/v1/apps/{appId}/credentials/{credentialId}',
        { params: { path: { appId, credentialId: revoke.id } } },
      );
      if (error) {
        setRetry(retrySeconds(response));
        if (error.status === 404) {
          setRevoke(undefined);
          setProblem(error);
        } else setRevokeProblem(error);
      } else {
        const id = revoke.id;
        const hint = revoke.keyHint;
        setData({
          ...app,
          credentials: app.credentials.map((c) =>
            c.id === id
              ? { ...c, status: 'revoked', revokedAt: new Date().toISOString() }
              : c,
          ),
        });
        setRevoke(undefined);
        toast.success(`Key …${hint} revoked.`);
        focusRow(id);
      }
    } catch {
      setRevokeProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  if (loading && !app)
    return (
      <div role="status" className="stack">
        <div className="skeleton" />
        <div className="skeleton" style={{ height: 200 }}>
          Loading app…
        </div>
      </div>
    );
  if (error?.status === 404 || problem?.status === 404)
    return (
      <>
        <h1>App not found</h1>
        <p>
          We can&apos;t find that app. Check the link, or go back to your apps.
        </p>
        <a href="/dashboard" className="button">
          Back to your apps
        </a>
      </>
    );
  if (error || !app)
    return (
      <ProblemAlert
        problem={error || networkProblem()}
        message="We couldn't load this app."
        onRetry={reload}
      />
    );
  const shown = reveal?.app.id === appId ? reveal : null;
  return (
    <div className="stack">
      <nav aria-label="Breadcrumb">
        <a href="/dashboard">Your apps</a> / {app.name}
      </nav>
      <h1 ref={heading} tabIndex={-1}>
        {app.name}
      </h1>
      {app.description && <p>{app.description}</p>}
      <p className="muted">
        Created <DateValue value={app.createdAt} />
      </p>
      {active > 0 && (
        <Card>
          <h2>Try your key</h2>
          <p>
            Open an API reference, paste your key into the apikey field and
            select Send.
          </p>
          {app.subscriptions.length <= 2 ? (
            <div className="row">
              {app.subscriptions.map((s) => (
                <a
                  key={s.apiId}
                  className="button secondary"
                  href={`/apis/${s.slug}`}
                >
                  Open {s.title} reference
                </a>
              ))}
            </div>
          ) : (
            <a href="#subscriptions">Go to APIs</a>
          )}
        </Card>
      )}
      <section id="subscriptions">
        <h2>APIs</h2>
        <ul>
          {app.subscriptions.map((s) => (
            <li key={s.apiId}>
              <a href={`/apis/${s.slug}`}>{s.title}</a> — View reference
            </li>
          ))}
        </ul>
      </section>
      <section className="stack">
        <div className="page-header">
          <div>
            <h2>API keys</h2>
            <p id="key-limit" className="muted">
              {active >= 5
                ? 'This app has 5 active keys, the maximum. Revoke one to create another.'
                : "Keys are shown once, when they're created. Up to 5 can be active."}
            </p>
          </div>
          <Button
            variant="secondary"
            aria-describedby="key-limit"
            aria-disabled={active >= 5}
            disabled={pending}
            aria-busy={pending && !revoke}
            onClick={createKey}
          >
            {pending && !revoke ? 'Creating key…' : 'Create key'}
          </Button>
        </div>
        {!active && (
          <p className="muted">
            This app has no active keys. Create one to call its APIs.
          </p>
        )}
        {problem && (
          <ProblemAlert
            problem={problem}
            message={
              problem.status === 409
                ? 'This app already has 5 active keys. Revoke one, then create a new key.'
                : problem.status === 502
                  ? 'The gateway rejected the request. No key was created. Try again, and if it keeps happening, tell the portal admin.'
                  : undefined
            }
            onRetry={problem.status === 503 ? createKey : undefined}
            retryAfterSeconds={retry}
          />
        )}
        <Table>
          <caption className="sr-only">API keys for {app.name}</caption>
          <thead>
            <tr>
              {['Key', 'Status', 'Created', 'Revoked', 'Actions'].map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...app.credentials]
              .sort(
                (a, b) =>
                  Number(b.status === 'active') -
                    Number(a.status === 'active') ||
                  b.createdAt.localeCompare(a.createdAt),
              )
              .map((c) => (
                <tr
                  key={c.id}
                  className={
                    highlight === c.id
                      ? 'highlight'
                      : c.status === 'revoked'
                        ? 'muted'
                        : ''
                  }
                >
                  <td id={`key-${c.id}`} tabIndex={-1}>
                    <KeyHint hint={c.keyHint} />
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td>
                    <DateValue value={c.createdAt} />
                  </td>
                  <td>
                    {c.revokedAt ? (
                      <DateValue value={c.revokedAt} />
                    ) : (
                      <span aria-label="Not revoked">—</span>
                    )}
                  </td>
                  <td>
                    {c.status === 'active' && (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          setRevoke(c);
                          setRevokeProblem(undefined);
                        }}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </Table>
      </section>
      {shown && (
        <KeyRevealDialog
          open
          credential={shown.credential}
          appName={app.name}
          apiTitles={app.subscriptions.map((s) => s.title)}
          variant={shown.variant}
          onDone={() => {
            const id = shown.credential.id;
            setReveal(null);
            void reload().then(() => focusRow(id));
          }}
        />
      )}
      <AlertDialog.Root
        open={!!revoke}
        onOpenChange={(open) => {
          if (!open && !pending) setRevoke(undefined);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog stack"
            onEscapeKeyDown={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            <AlertDialog.Title asChild>
              <h2>Revoke key …{revoke?.keyHint}?</h2>
            </AlertDialog.Title>
            <AlertDialog.Description>
              Anything using this key will get 401 errors from the gateway
              straight away. You can&apos;t undo this.
            </AlertDialog.Description>
            {revokeProblem && (
              <ProblemAlert
                problem={revokeProblem}
                message={
                  revokeProblem.status === 503
                    ? "The gateway didn't respond, so the key is still active. Try again in a moment."
                    : revokeProblem.status === 502
                      ? 'The gateway rejected the request, so the key is still active. Try again, and if it keeps happening, tell the portal admin.'
                      : undefined
                }
                onRetry={revokeProblem.status === 503 ? revokeKey : undefined}
                retryAfterSeconds={retry}
              />
            )}
            <div className="actions row">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              {!(revokeProblem?.status === 503) && (
                <Button
                  variant="destructive"
                  disabled={pending}
                  aria-busy={pending}
                  onClick={revokeKey}
                >
                  {pending
                    ? 'Revoking…'
                    : revokeProblem
                      ? 'Try again'
                      : 'Revoke key'}
                </Button>
              )}
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
