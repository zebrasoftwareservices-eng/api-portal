// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Input, PageHeader, Textarea } from '@portal/ui';
import { api, networkProblem, retrySeconds } from '../lib/client';
import type { Problem } from '../lib/types';
import { useResource } from './use-resource';
import { usePortal } from './providers';
import { Field, focusInvalid } from './field';
import { ProblemAlert } from './problem-alert';
export function CreateApp({ slug }: { slug?: string }) {
  const router = useRouter();
  const { setReveal } = usePortal();
  const resource = useResource(() => api.GET('/v1/apis'));
  const { data, loading, error, reload } = resource;
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
    if (restoreFocus.current && !loading && data?.items.length === 0) {
      page.current?.querySelector('h1')?.focus();
      restoreFocus.current = false;
    }
  }, [data, loading]);
  useEffect(() => {
    if (!data) return;
    const wasInitialized = initialized.current;
    setSelected((current) =>
      wasInitialized
        ? current.filter((id) => data.items.some((a) => a.id === id))
        : data.items
            .filter((a) => (slug ? a.slug === slug : data.items.length === 1))
            .map((a) => a.id),
    );
    initialized.current = true;
  }, [data, slug]);
  async function submit() {
    if (locked.current) return;
    const invalid: Record<string, string> = {};
    if (!name.trim()) invalid.name = 'Give your app a name.';
    else if (name.trim().length > 80)
      invalid.name = 'Use 80 characters or fewer.';
    if (description.length > 500)
      invalid.description = 'Use 500 characters or fewer.';
    if (!selected.length) invalid.apiIds = 'Choose at least one API.';
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
          name: name.trim(),
          ...(description ? { description } : {}),
          apiIds: selected,
        },
      });
      if (error) {
        setRetry(retrySeconds(response));
        if (error.type.endsWith('/app-name-taken')) {
          setErrors({
            name: `You already have an app called “${name.trim()}”. Choose a different name.`,
          });
          focusInvalid(form.current!);
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
        description="You'll get an API key as soon as it's created."
        breadcrumb={[
          { label: 'My apps', href: '/dashboard' },
          { label: 'New app' },
        ]}
      />
      {!loading && data?.items.length === 0 ? (
        <EmptyState
          title="No APIs to use yet"
          description="An app needs at least one API, and none have been published. Check back soon."
          action={<a href="/dashboard">Back to your apps</a>}
        />
      ) : (
        <>
          {problem && (
            <ProblemAlert
              problem={problem}
              title={
                problem.type.endsWith('/gateway-disabled')
                  ? 'New apps and keys are paused'
                  : problem.status === 503
                    ? 'Gateway unavailable'
                    : problem.status === 502
                      ? 'The gateway rejected the request'
                      : undefined
              }
              message={
                problem.type.endsWith('/gateway-disabled') ? (
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
                hint="Up to 80 characters. Only you can see it."
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
                <legend>APIs this app uses</legend>
                <p className="hint" id="api-hint">
                  This app&apos;s keys work only on the APIs you choose here. To
                  use another API later, create another app.
                </p>
                {slug && data && !data.items.some((a) => a.slug === slug) && (
                  <p className="muted">
                    The API you came from isn&apos;t available any more. Choose
                    from the list below.
                  </p>
                )}
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
                    {data?.items.map((a) => (
                      <label key={a.id}>
                        <span className="row">
                          <input
                            type="checkbox"
                            checked={selected.includes(a.id)}
                            disabled={
                              !selected.includes(a.id) && selected.length >= 10
                            }
                            aria-invalid={!!errors.apiIds}
                            onChange={(e) =>
                              setSelected((ids) =>
                                e.target.checked
                                  ? [...ids, a.id]
                                  : ids.filter((id) => id !== a.id),
                              )
                            }
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
                disabled={pending || loading || !!error || !data?.items.length}
                aria-busy={pending}
              >
                {pending ? 'Creating app…' : 'Create app and get key'}
              </Button>
              <a href="/dashboard">Cancel</a>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
