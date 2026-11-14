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
import { useTeams } from './team-context';
import { api, networkProblem, retrySeconds } from '../lib/client';
import type { Credential, Problem } from '../lib/types';
import { useResource } from './use-resource';
import { usePortal } from './providers';
import { ResendVerification } from './account-shared';
import { ProblemAlert } from './problem-alert';
import { KeyRevealDialog } from './key-reveal-dialog';
import { AppPlanActions, RegenerateKeyButton } from './app-plan-actions';
import { AccessStatus } from './access-shared';
import { DateValue } from './date';
export function AppDetail({ appId }: { appId: string }) {
  const { teams } = useTeams();
  const {
    data: app,
    error,
    loading,
    reload,
    setData,
  } = useResource(() =>
    api.GET('/v1/apps/{appId}', { params: { path: { appId } } }),
  );
  const { reveal, setReveal, user, setUser } = usePortal();
  const verificationBlocked =
    !!user?.verificationRequired && !user.emailVerified;
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [problem, setProblem] = useState<Problem>();
  const [retry, setRetry] = useState(0);
  const [revoke, setRevoke] = useState<Credential>();
  const [revokeProblem, setRevokeProblem] = useState<Problem>();
  const [highlight, setHighlight] = useState<string>();
  const tryHeading = useRef<HTMLHeadingElement>(null);
  const revokeTrigger = useRef<HTMLButtonElement | null>(null);
  const revokedId = useRef<string | null>(null);
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
    if (verificationBlocked) {
      document.getElementById('verification-banner')?.focus();
      return;
    }
    if (
      lock.current ||
      !app ||
      app.role === 'read-only' ||
      (app.status && app.status !== 'active') ||
      active >= (app?.plan?.builtin === false ? 1 : 5)
    )
      return;
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
        if (error.type.endsWith('/email-not-verified')) {
          const current = await api.GET('/v1/me');
          if (current.data) setUser(current.data);
        }
        setRetry(retrySeconds(response));
        if (
          error.type.endsWith('/app-revoked') ||
          error.type.endsWith('/credential-limit') ||
          error.type.endsWith('/team-role-forbidden')
        )
          await reload();
      } else if (data) {
        const summary: Credential = {
          id: data.id,
          kind: data.kind,
          keyHint: data.keyHint,
          status: data.status,
          createdAt: data.createdAt,
        };
        setData({
          ...app,
          keyIssued: true,
          credentials: [...app.credentials, summary],
        });
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
    if (lock.current || !revoke || !app || app.role === 'read-only') return;
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
        if (error.type.endsWith('/team-role-forbidden')) {
          setRevoke(undefined);
          setProblem(error);
          await reload();
        } else if (error.status === 404) {
          setRevoke(undefined);
          setProblem(error);
        } else setRevokeProblem(error);
      } else {
        const id = revoke.id;
        revokedId.current = id;
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
          We can&apos;t find this app. It may have been deleted, or you may no
          longer be in its team.
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
        <a href="/dashboard">My apps</a> / {app.name}
      </nav>
      <h1 ref={heading} tabIndex={-1}>
        {app.name}
      </h1>
      {app.status && app.status !== 'active' && (
        <AccessStatus status={app.status} />
      )}
      {app.origin === 'request' && <p className="muted">Approved request</p>}
      {app.origin === 'admin' && <p className="muted">Set up by your admin</p>}
      {app.status === 'revoke-pending' && (
        <div className="alert warning">
          Access to this product was removed. We&apos;re deleting this key from
          the gateway.
        </div>
      )}
      {app.status === 'revoked' && (
        <div className="alert error">
          An admin removed access to {app.plan?.product?.name || 'this product'}
          . This key no longer works.
        </div>
      )}
      {app.pendingRequest && (
        <div className="alert">
          <h2>◷ Plan change requested</h2>
          <p>
            Change to {app.pendingRequest.plan.name} is waiting for an admin.
            Your key keeps working on {app.plan?.name} until then.
          </p>
          <p>You already have a plan change waiting.</p>
        </div>
      )}
      {app.status === 'active' && app.keyIssued === false && (
        <Card className="stack access-ready">
          <h2>✓ Your key is ready</h2>
          <p>
            {app.origin === 'admin'
              ? `Your admin gave your team access to ${app.plan?.name}.`
              : `An admin approved access to ${app.plan?.name}.`}{' '}
            Reveal the key once and store it somewhere safe — you won&apos;t see
            it again.
          </p>
          {app.role === 'read-only' ? (
            <p>A team Admin or Member can reveal the key.</p>
          ) : (
            <Button disabled={pending} onClick={createKey}>
              {pending ? 'Revealing…' : 'Reveal key'}
            </Button>
          )}
        </Card>
      )}
      {app.teamId && (
        <p>
          Team:{' '}
          <a href={`/dashboard/teams/${app.teamId}`}>
            {teams.find((t) => t.id === app.teamId)?.name || 'Team settings'}
          </a>{' '}
          · You're{' '}
          {app.role === 'admin'
            ? 'an Admin'
            : app.role === 'member'
              ? 'a Member'
              : 'a Read-only member'}
        </p>
      )}
      {app.role === 'read-only' && (
        <div className="alert" role="note">
          ⓘ You have Read-only access. Ask a team Admin or Member to change the
          plan or keys.
        </div>
      )}
      <AppPlanActions
        app={app}
        reload={reload}
        setApp={setData}
        section="plan"
      />
      {app.description && <p>{app.description}</p>}
      <p className="muted">
        Created <DateValue value={app.createdAt} />
      </p>
      {active > 0 && (
        <Card>
          <h2 ref={tryHeading} tabIndex={-1}>
            Try your key
          </h2>
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
        <ul className="subscription-list">
          {app.subscriptions.map((s) => (
            <li key={s.apiId}>
              <span>{s.title}</span>
              <a className="button secondary" href={`/apis/${s.slug}`}>
                Try this API<span className="sr-only">: {s.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="stack">
        <div className="page-header">
          <div>
            <h2>API keys</h2>
            <p id="key-limit" className="muted">
              {app.plan?.builtin === false
                ? 'A subscription has one active key. Regenerate it to get a new one.'
                : active >= 5
                  ? 'This app has 5 active keys, the maximum. Revoke one to create another.'
                  : "Keys are shown once, when they're created. Up to 5 can be active."}
            </p>
          </div>
          {app.role !== 'read-only' &&
            app.keyIssued !== false &&
            (!app.status || app.status === 'active') &&
            !(app.plan?.builtin === false && active > 0) && (
              <Button
                variant="secondary"
                aria-describedby={
                  verificationBlocked ? 'verification-reason' : 'key-limit'
                }
                aria-disabled={
                  verificationBlocked ||
                  active >= (app?.plan?.builtin === false ? 1 : 5)
                }
                disabled={pending}
                aria-busy={pending && !revoke}
                onClick={createKey}
              >
                {pending && !revoke
                  ? 'Creating key…'
                  : app.plan?.builtin === false
                    ? 'New key'
                    : 'Create key'}
              </Button>
            )}
        </div>
        {verificationBlocked && (
          <p id="verification-reason">
            Verify your email address first. Use the button at the top of the
            page.
          </p>
        )}
        {!active && (
          <p className="muted">
            This app has no active keys. Create one to call its APIs.
          </p>
        )}
        {problem && (
          <ProblemAlert
            problem={problem}
            title={
              problem.type.endsWith('/team-role-forbidden')
                ? `You can't change keys in ${teams.find((t) => t.id === app.teamId)?.name || 'this team'}`
                : problem.type.endsWith('/gateway-disabled')
                  ? 'New apps and keys are paused'
                  : problem.type.endsWith('/gateway-not-connected')
                    ? 'No API gateway is connected'
                    : undefined
            }
            message={
              problem.type.endsWith('/team-role-forbidden') ? (
                'Your role in this team may have changed. No key was created or revoked.'
              ) : problem.type.endsWith('/email-not-verified') ? (
                <>
                  <p>{problem.detail}</p>
                  <ResendVerification email={user?.email || ''} />
                </>
              ) : problem.type.endsWith('/gateway-disabled') ? (
                'The portal admin has turned off new apps and keys for now. Keys you already have keep working. No key was created.'
              ) : problem.type.endsWith('/gateway-not-connected') ? (
                "This portal isn't connected to an API gateway right now. No key was created. Tell the portal admin."
              ) : problem.type.endsWith('/credential-limit') ? (
                app.plan?.builtin === false ? (
                  'A subscription has one active key. Regenerate it to get a new one.'
                ) : (
                  'This app already has 5 active keys. Revoke one, then create a new key.'
                )
              ) : problem.status === 503 ? (
                "The gateway is unavailable, so we couldn't create your key. Try again in a minute."
              ) : problem.status === 502 ? (
                'The gateway rejected the request. No key was created. Try again, and if it keeps happening, tell the portal admin.'
              ) : undefined
            }
            onRetry={problem.status === 503 ? createKey : undefined}
            retryAfterSeconds={retry}
          />
        )}
        <Table>
          <caption className="sr-only">API keys for {app.name}</caption>
          <thead>
            <tr>
              {[
                'Key',
                'Status',
                'Created',
                'Revoked',
                ...(app.role !== 'read-only' ? ['Actions'] : []),
              ].map((h) => (
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
                  {app.role !== 'read-only' && (
                    <td>
                      {c.status === 'active' &&
                        (!app.status || app.status === 'active') && (
                          <RegenerateKeyButton
                            app={app}
                            credential={c}
                            reload={reload}
                          />
                        )}
                      {c.status === 'active' &&
                        (!app.status || app.status === 'active') && (
                          <Button
                            variant="ghost"
                            disabled={
                              pending ||
                              (!!app.status && app.status !== 'active')
                            }
                            onClick={(event) => {
                              revokeTrigger.current = event.currentTarget;
                              revokedId.current = null;
                              setRevoke(c);
                              setRevokeProblem(undefined);
                            }}
                          >
                            Revoke
                          </Button>
                        )}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </Table>
      </section>
      <AppPlanActions
        app={app}
        reload={reload}
        setApp={setData}
        section="danger"
      />
      {shown && app.role !== 'read-only' && (
        <KeyRevealDialog
          open
          credential={shown.credential}
          appName={app.name}
          apiTitles={app.subscriptions.map((s) => s.title)}
          variant={shown.variant}
          notice={shown.notice}
          onCloseAutoFocus={() =>
            shown.notice
              ? document
                  .getElementById(`key-${shown.credential.id}`)
                  ?.parentElement?.querySelector<HTMLButtonElement>('button')
                  ?.focus()
              : tryHeading.current?.focus()
          }
          onDone={() => {
            const id = shown.credential.id;
            setReveal(null);
            setHighlight(id);
            clearTimeout(highlightTimer.current);
            highlightTimer.current = setTimeout(
              () => setHighlight(undefined),
              3000,
            );
            void reload();
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
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (revokedId.current)
                document.getElementById(`key-${revokedId.current}`)?.focus();
              else revokeTrigger.current?.focus();
            }}
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
