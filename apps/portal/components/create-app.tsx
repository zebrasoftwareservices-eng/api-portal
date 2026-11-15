// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Input, PageHeader, Textarea } from '@portal/ui';
import { useTeams } from './team-context';
import { api, networkProblem, retrySeconds } from '../lib/client';
import type { Problem } from '../lib/types';
import { useResource } from './use-resource';
import { usePortal } from './providers';
import { Field, focusInvalid } from './field';
import { ResendVerification } from './account-shared';
import { ProblemAlert } from './problem-alert';
import { ProductList } from './create-app-products';
export function CreateApp({ slug }: { slug?: string }) {
  const router = useRouter();
  const { current, unavailable } = useTeams();
  const { setReveal, user, setUser } = usePortal();
  const verificationBlocked =
    !!user?.verificationRequired && !user.emailVerified;
  const {
    data: allApis,
    loading,
    error,
    reload,
  } = useResource(() => api.GET('/v1/apis'));
  const products = useResource(() => api.GET('/v1/products'));
  const looseApis = allApis?.items.filter((a) => !a.products?.length);
  const hasProducts = !!products.data?.items.length;
  const sourceApi = allApis?.items.find((a) => a.slug === slug);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const initialized = useRef(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [problem, setProblem] = useState<Problem>();
  const [retry, setRetry] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (slug) nameInput.current?.focus();
  }, [slug]);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (
      restoreFocus.current &&
      !loading &&
      allApis &&
      !allApis.items.some((a) => !a.products?.length)
    ) {
      page.current?.querySelector('h1')?.focus();
      restoreFocus.current = false;
    }
  }, [allApis, loading]);
  useEffect(() => {
    if (!allApis) return;
    const items = allApis.items.filter((a) => !a.products?.length);
    const wasInitialized = initialized.current;
    setSelected((current) =>
      wasInitialized
        ? current.filter((id) => items.some((a) => a.id === id))
        : items.filter((a) => !!slug && a.slug === slug).map((a) => a.id),
    );
    initialized.current = true;
  }, [allApis, slug]);
  async function submit() {
    if (unavailable || current?.role === 'read-only') return;
    if (verificationBlocked) {
      document.getElementById('verification-banner')?.focus();
      return;
    }
    if (locked.current) return;
    const invalid: Record<string, string> = {};
    if (!name.trim()) invalid.name = 'Give your app a name.';
    else if (name.trim().length > 80)
      invalid.name = 'Use 80 characters or fewer.';
    if (description.length > 500)
      invalid.description = 'Use 500 characters or fewer.';
    if (!selected.length)
      invalid.apiIds =
        'Choose at least one API, or subscribe to a product above.';
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      focusInvalid(form.current!);
      return;
    }
    locked.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      const {
        data: result,
        error,
        response,
      } = await api.POST('/v1/apps', {
        body: {
          teamId: current?.id,
          name: name.trim(),
          ...(description ? { description } : {}),
          apiIds: selected,
        },
      });
      if (error) {
        if (error.type.endsWith('/team-role-forbidden')) router.refresh();
        if (error.type.endsWith('/email-not-verified')) {
          const current = await api.GET('/v1/me');
          if (current.data) setUser(current.data);
        }
        setRetry(retrySeconds(response));
        if (error.type.endsWith('/app-name-taken')) {
          setErrors({
            name: `An app in ${current?.name || 'this team'} already has this name. Choose another name.`,
          });
          focusInvalid(form.current!);
        } else if (
          error.status === 409 &&
          error.type.endsWith('/api-in-product')
        ) {
          setProblem(error);
          await Promise.all([reload(), products.reload()]);
        } else if (error.status === 404) {
          setProblem({
            ...error,
            detail:
              "One of the APIs you chose is no longer available. We've refreshed the list — check your choices and try again.",
          });
          await reload();
        } else if (error.status === 400 && error.errors?.length) {
          setErrors(
            Object.fromEntries(
              error.errors.map((e) => [
                e.pointer?.slice(1) || 'form',
                e.message,
              ]),
            ),
          );
          setProblem(error);
          focusInvalid(form.current!);
        } else setProblem(error);
      } else if (result) {
        setReveal({
          app: result.app,
          credential: result.credential,
          variant: 'first',
        });
        router.replace(`/dashboard/apps/${result.app.id}`);
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <div className="stack form" ref={page}>
      <PageHeader
        title="Create an app"
        description={
          hasProducts
            ? "Subscribe to a product to get a key on a plan, or create an app for an API that isn't in a product."
            : "You'll get an API key as soon as it's created."
        }
        breadcrumb={[
          { label: 'My apps', href: '/dashboard' },
          { label: 'New app' },
        ]}
      />
      {current && <p>This app will belong to {current.name}.</p>}
      {problem && (
        <ProblemAlert
          problem={problem}
          focusHeading={problem.type.endsWith('/api-in-product')}
          title={
            problem.type.endsWith('/api-in-product')
              ? 'That API is now in a product'
              : problem.type.endsWith('/team-role-forbidden')
                ? `You can't create apps in ${current?.name || 'this team'}`
                : problem.type.endsWith('/gateway-disabled')
                  ? 'New apps and keys are paused'
                  : problem.status === 503
                    ? 'Gateway unavailable'
                    : problem.status === 502
                      ? 'The gateway rejected the request'
                      : undefined
          }
          message={
            problem.type.endsWith('/api-in-product') ? (
              <>
                <p>{problem.detail}</p>
                {problem.products?.map((p) => (
                  <p key={p.id}>
                    <a href={`/products/${p.slug}`}>Subscribe to {p.name}</a>
                  </p>
                ))}
                <p>Nothing was created. We've refreshed the lists.</p>
              </>
            ) : problem.type.endsWith('/team-role-forbidden') ? (
              <>
                <p>
                  Your role in this team may have changed. Nothing was created.
                </p>
                <a href="/dashboard">Back to My apps</a>
              </>
            ) : problem.type.endsWith('/email-not-verified') ? (
              <>
                <p>{problem.detail}</p>
                <ResendVerification email={user?.email || ''} />
              </>
            ) : problem.type.endsWith('/gateway-disabled') ? (
              'The portal admin has turned off new apps and keys for now. Keys you already have keep working. Nothing was created.'
            ) : problem.status === 502 ? (
              <>
                <p>
                  Nothing was created. Try again, and if it keeps happening,
                  tell the portal admin.
                </p>
                {problem.detail}
              </>
            ) : undefined
          }
          onRetry={problem.status === 503 ? submit : undefined}
          retryAfterSeconds={retry}
        />
      )}
      {sourceApi?.products?.length ? (
        <p className="muted">
          {sourceApi.title} is offered in a product. Subscribe to{' '}
          {sourceApi.products.map((p) => p.name).join(', ')} below.
        </p>
      ) : slug && allApis && !sourceApi ? (
        <p className="muted">
          The API you came from isn't available any more. Choose from the list
          below.
        </p>
      ) : null}
      <ProductList
        resource={products}
        apis={error ? [] : allApis?.items || []}
        isAdmin={user?.role === 'admin'}
      />
      {current?.role === 'read-only' ? (
        <div className="stack">
          <p>
            You have Read-only access to {current.name}, so you can't create
            apps here. Switch to another team or ask a team Admin.
          </p>
          <a className="button secondary" href="/dashboard">
            Back to My apps
          </a>
        </div>
      ) : !loading &&
        !products.loading &&
        hasProducts &&
        looseApis?.length === 0 ? (
        <div className="stack">
          <p>
            Every API here is offered as a product. Subscribe to one above to
            get a key.
          </p>
          <a href="/dashboard">Cancel</a>
        </div>
      ) : !loading &&
        !products.loading &&
        !products.error &&
        looseApis?.length === 0 ? (
        <EmptyState
          title="No APIs to use yet"
          description="An app needs at least one API, and none have been published. Check back soon."
          action={<a href="/dashboard">Back to your apps</a>}
        />
      ) : (
        <>
          {hasProducts && (
            <h2>Or create an app for APIs that aren't in a product</h2>
          )}
          <form
            ref={form}
            noValidate
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={pending} className="stack">
              <Field
                label="App name"
                error={errors.name}
                hint="Up to 80 characters. Only your team can see it."
              >
                {(props) => (
                  <Input
                    ref={(node) => {
                      if (!node && document.activeElement === nameInput.current)
                        restoreFocus.current = true;
                      nameInput.current = node;
                    }}
                    {...props}
                    required
                    autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Description (optional)"
                error={errors.description}
                hint={
                  description.length >= 400
                    ? `${description.length}/500`
                    : undefined
                }
              >
                {(props) => (
                  <Textarea
                    {...props}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                )}
              </Field>
              <fieldset
                aria-describedby={
                  errors.apiIds ? 'api-hint api-error' : 'api-hint'
                }
              >
                <legend>
                  {hasProducts ? 'APIs not in a product' : 'APIs this app uses'}
                </legend>
                <p className="hint" id="api-hint">
                  This app&apos;s keys work only on the APIs you choose here.
                </p>
                {loading ? (
                  <p role="status">Loading APIs…</p>
                ) : error ? (
                  <ProblemAlert
                    problem={error}
                    message="We couldn't load the APIs."
                    onRetry={reload}
                  />
                ) : (
                  <div className="stack">
                    {looseApis?.map((a) => (
                      <label key={a.id}>
                        <span className="row">
                          <input
                            type="checkbox"
                            checked={selected.includes(a.id)}
                            disabled={
                              !selected.includes(a.id) && selected.length >= 10
                            }
                            aria-invalid={!!errors.apiIds}
                            aria-describedby={
                              errors.apiIds ? 'api-hint api-error' : 'api-hint'
                            }
                            onChange={(e) => {
                              if (e.target.checked)
                                setErrors((current) => ({
                                  ...current,
                                  apiIds: '',
                                }));
                              setSelected((ids) =>
                                e.target.checked
                                  ? [...ids, a.id]
                                  : ids.filter((id) => id !== a.id),
                              );
                            }}
                          />
                          {a.title}
                          <span className="badge">v{a.version}</span>
                        </span>
                        <code className="hint">{a.gatewayBaseUrl}</code>
                      </label>
                    ))}
                  </div>
                )}
                {selected.length >= 10 && (
                  <p className="hint">You can choose up to 10 APIs.</p>
                )}
                {errors.apiIds && (
                  <p className="field-error" id="api-error">
                    ⚠ {errors.apiIds}
                  </p>
                )}
              </fieldset>
            </fieldset>
            <div className="actions row">
              <Button
                type="submit"
                disabled={
                  unavailable ||
                  pending ||
                  loading ||
                  products.loading ||
                  !!error ||
                  !looseApis?.length
                }
                aria-busy={pending}
                aria-disabled={verificationBlocked}
                aria-describedby={
                  verificationBlocked ? 'verification-reason' : undefined
                }
              >
                {pending ? 'Creating app…' : 'Create app and get key'}
              </Button>
              {verificationBlocked && (
                <p id="verification-reason">
                  Verify your email address first. Use the button at the top of
                  the page.
                </p>
              )}
              <a href="/dashboard">Cancel</a>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
