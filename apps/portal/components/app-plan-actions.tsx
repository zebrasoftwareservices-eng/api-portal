// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertDialog, Button, Card, Dialog } from '@portal/ui';
import { api, networkProblem } from '../lib/client';
import type { App, Credential, Problem } from '../lib/types';
import { usePortal } from './providers';
import { ChangeProblem } from './product-actions';
import { PlanLimits, PlanRadios, type Product } from './plans';
import { ProblemAlert } from './problem-alert';
export function AppPlanActions({
  app,
  reload,
  setApp,
  section = 'all',
}: {
  app: App;
  reload: () => Promise<void>;
  setApp: (app: App) => void;
  section?: 'all' | 'plan' | 'danger';
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'change' | 'cancel' | null>(null);
  const [product, setProduct] = useState<Product>();
  const [planId, setPlanId] = useState(app.plan?.id || '');
  const [loading, setLoading] = useState(false);
  const [loadProblem, setLoadProblem] = useState<Problem>();
  const [problem, setProblem] = useState<Problem>();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const dialogBody = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dialog === 'change' && !loading)
      dialogBody.current
        ?.querySelector<HTMLInputElement>('input:checked')
        ?.focus();
  }, [dialog, loading]);
  const statusRef = useRef<HTMLDivElement>(null);
  const readOnly = app.role === 'read-only';
  const selected = product?.plans.find((p) => p.id === planId);
  async function loadPlans() {
    if (!app.plan?.product) return;
    setLoading(true);
    setLoadProblem(undefined);
    try {
      const result = await api.GET('/v1/products/{productSlug}', {
        params: { path: { productSlug: app.plan.product.slug } },
      });
      setProduct(result.data);
      setLoadProblem(result.error);
    } catch {
      setLoadProblem(networkProblem());
    } finally {
      setLoading(false);
    }
  }
  async function submit() {
    if (lock.current || readOnly) return;
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      if (dialog === 'change') {
        const result = await api.PUT('/v1/apps/{appId}/plan', {
          params: { path: { appId: app.id } },
          body: { planId },
        });
        if (result.error) {
          setProblem(result.error);
          if (result.error.status === 400) {
            setProblem({
              ...result.error,
              detail: 'This plan is no longer available. Choose another plan.',
            });
            await loadPlans();
          }
        } else if (result.data) {
          setApp(result.data);
          setDialog(null);
          setStatus(
            `Changed to ${result.data.plan.name}. Your key stays the same, and the new limits apply now.`,
          );
          requestAnimationFrame(() => statusRef.current?.focus());
        }
        if (result.error?.type.endsWith('/team-role-forbidden')) {
          setDialog(null);
          await reload();
        }
      } else if (dialog === 'cancel') {
        const result = await api.DELETE('/v1/apps/{appId}', {
          params: { path: { appId: app.id } },
        });
        if (!result.error || result.error.status === 404) {
          router.push(
            `/dashboard?notice=${encodeURIComponent(`Cancelled ${app.name}. Its key has stopped working.`)}`,
          );
          router.refresh();
        } else {
          setProblem(result.error);
          if (result.error.type.endsWith('/team-role-forbidden')) {
            setDialog(null);
            await reload();
          }
        }
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const unchanged =
    dialog === 'change'
      ? `your plan didn't change. Your key still works on ${app.plan?.name}`
      : "the subscription wasn't cancelled. Its key still works";
  return (
    <>
      <div ref={statusRef} tabIndex={-1} role="status">
        {status && <p className="alert">{status}</p>}
      </div>
      {problem && !dialog && (
        <ChangeProblem problem={problem} unchanged="Nothing changed" />
      )}
      {section !== 'danger' && (
        <Card className="stack">
          <h2>Plan</h2>
          <div className="row">
            <span className="badge">{app.plan?.name || 'Unlimited'}</span>
            {app.plan?.product && (
              <a href={`/products/${app.plan.product.slug}`}>
                {app.plan.product.name}
              </a>
            )}
            {app.plan?.product && !readOnly && (
              <Button
                variant="secondary"
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setProblem(undefined);
                  setStatus('');
                  setDialog('change');
                  setPlanId(app.plan.id);
                  void loadPlans();
                }}
              >
                Change plan…
              </Button>
            )}
          </div>
          {app.plan ? (
            <PlanLimits plan={app.plan} />
          ) : (
            <p>No rate limit or monthly quota</p>
          )}
          {app.plan?.builtin ? (
            <p>This app was made for APIs that are in no product.</p>
          ) : (
            <>
              <p>
                Resets 00:00 UTC on the 1st. Covers{' '}
                {app.subscriptions.map((a) => a.title).join(', ')} together.
              </p>
            </>
          )}
        </Card>
      )}
      {section !== 'plan' && !readOnly && (
        <section className="card stack">
          <h2>Danger zone</h2>
          <p>
            {app.plan?.product
              ? 'Cancel this subscription.'
              : 'Delete this app.'}{' '}
            Its key stops working at once.
          </p>
          <Button
            variant="destructive"
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setProblem(undefined);
              setDialog('cancel');
            }}
          >
            {app.plan?.product ? 'Cancel subscription…' : 'Delete app…'}
          </Button>
        </section>
      )}
      <Dialog.Root
        open={dialog === 'change'}
        onOpenChange={(open) => {
          if (!open && !pending) setDialog(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content
            ref={dialogBody}
            className="dialog stack"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (!status) trigger.current?.focus();
            }}
            onPointerDownOutside={(e) => {
              if (pending) e.preventDefault();
            }}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              requestAnimationFrame(() =>
                dialogBody.current
                  ?.querySelector<HTMLInputElement>('input:checked')
                  ?.focus(),
              );
            }}
            onEscapeKeyDown={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            <Dialog.Title>Change plan for {app.name}</Dialog.Title>
            <Dialog.Description>
              Your key stays the same. The new limits apply now, and this
              month&apos;s usage carries over.
            </Dialog.Description>
            {loading ? (
              <div role="status">Loading plans…</div>
            ) : loadProblem ? (
              <ProblemAlert
                problem={loadProblem}
                message="We couldn't load the plans."
                onRetry={loadPlans}
              />
            ) : (
              product && (
                <>
                  <p>Current: {app.plan?.name}</p>
                  <PlanRadios
                    current={app.plan?.id}
                    plans={product.plans}
                    value={planId}
                    onChange={setPlanId}
                    disabled={pending}
                  />
                  {selected &&
                    app.subscriptions.some(
                      (a) => !selected.apis.some((x) => x.id === a.apiId),
                    ) && (
                      <p className="alert warning">
                        {selected.name} doesn&apos;t include{' '}
                        {app.subscriptions
                          .filter(
                            (a) => !selected.apis.some((x) => x.id === a.apiId),
                          )
                          .map((a) => a.title)
                          .join(', ')}
                        . Calls to those APIs with this key will be refused.
                      </p>
                    )}
                  {selected &&
                    selected.monthlyQuota < (app.plan?.monthlyQuota || 0) && (
                      <p>
                        This month&apos;s requests so far count toward the new
                        quota.
                      </p>
                    )}
                </>
              )
            )}
            {problem && (
              <ChangeProblem
                problem={problem}
                unchanged={unchanged}
                retry={submit}
              />
            )}
            <div className="actions">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  pending || loading || !selected || planId === app.plan?.id
                }
                aria-busy={pending}
                onClick={submit}
              >
                {pending
                  ? 'Changing…'
                  : `Change to ${selected?.name || 'plan'}`}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root
        open={dialog === 'cancel'}
        onOpenChange={(open) => {
          if (!open && !pending) setDialog(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog stack"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              trigger.current?.focus();
            }}
            onEscapeKeyDown={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            <AlertDialog.Title>Cancel {app.name}?</AlertDialog.Title>
            <AlertDialog.Description>
              Its key stops working at once and calls through the gateway are
              refused. This can&apos;t be undone. To use these APIs again,
              subscribe again and you&apos;ll get a new key.
            </AlertDialog.Description>
            {problem && (
              <ChangeProblem
                problem={problem}
                unchanged={unchanged}
                retry={submit}
              />
            )}
            <div className="actions">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" disabled={pending}>
                  Keep subscription
                </Button>
              </AlertDialog.Cancel>
              <Button
                variant="destructive"
                disabled={pending}
                aria-busy={pending}
                onClick={submit}
              >
                {pending
                  ? 'Cancelling…'
                  : app.plan?.product
                    ? 'Cancel subscription'
                    : 'Delete app'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
export function RegenerateKeyButton({
  app,
  credential,
  reload,
}: {
  app: App;
  credential: Credential;
  reload: () => Promise<void>;
}) {
  const { setReveal } = usePortal();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<Problem>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current || app.role === 'read-only') return;
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      const result = await api.POST(
        '/v1/apps/{appId}/credentials/{credentialId}/regenerate',
        { params: { path: { appId: app.id, credentialId: credential.id } } },
      );
      if (result.error) {
        setProblem(result.error);
        if (result.error.type.endsWith('/team-role-forbidden')) {
          setOpen(false);
          await reload();
        }
      } else if (result.data) {
        setOpen(false);
        setReveal({
          app,
          credential: result.data,
          variant: 'additional',
          notice: `The old key (…${credential.keyHint}) has stopped working.`,
        });
        await reload();
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  if (app.role === 'read-only') return null;
  return (
    <>
      <AlertDialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!pending) {
            setOpen(value);
            if (!value) void reload();
          }
        }}
      >
        <AlertDialog.Trigger asChild>
          <Button
            variant="ghost"
            aria-label={`Regenerate key …${credential.keyHint}`}
            onClick={() => setProblem(undefined)}
          >
            Regenerate…
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog stack"
            onEscapeKeyDown={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            <AlertDialog.Title>
              Regenerate key …{credential.keyHint}?
            </AlertDialog.Title>
            <AlertDialog.Description>
              You&apos;ll get a new key, shown once. The old key (…
              {credential.keyHint}) stops working at once, so update your code
              right after.
            </AlertDialog.Description>
            {problem && (
              <ChangeProblem
                problem={problem}
                unchanged="no new key was made. Your current key still works"
                retry={submit}
              />
            )}
            <div className="actions">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button
                disabled={
                  pending || problem?.type.endsWith('/credential-revoked')
                }
                aria-busy={pending}
                onClick={submit}
              >
                {pending ? 'Regenerating…' : 'Regenerate key'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {problem && !open && (
        <ChangeProblem problem={problem} unchanged="Nothing changed" />
      )}
    </>
  );
}
