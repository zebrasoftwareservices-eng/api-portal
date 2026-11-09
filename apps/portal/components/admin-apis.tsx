// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input, PageHeader, Table } from '@portal/ui';
import type { GatewayService, Problem } from '../lib/types';
import type { components } from '@portal/sdk';
import { api, networkProblem, retrySeconds } from '../lib/client';
import { useResource } from './use-resource';
import { Field } from './field';
import { ProblemAlert } from './problem-alert';
import { DateValue } from './date';
import {
  ImportProblem,
  LintWarnings,
  ReleaseNote,
  RulesetBanner,
  invalidVersionMessage,
} from './lint-findings';
export function serviceLabel(s: GatewayService) {
  const paths = s.routes.flatMap((r) => r.paths);
  return `${s.name} — ${paths.slice(0, 2).join(', ') || 'no route path'}${paths.length > 2 ? ` +${paths.length - 2} more` : ''} — key-auth ${s.keyAuth ? 'on' : 'off'}${s.linkedApiSlug ? ` · linked to /apis/${s.linkedApiSlug}` : ''}`;
}
export function AdminApis() {
  const services = useResource(
    () => api.GET('/v1/admin/gateway/services'),
    true,
  );
  const blocked =
    services.error?.type.endsWith('/gateway-disabled') ||
    services.error?.type.endsWith('/gateway-not-connected');
  const catalog = useResource(() => api.GET('/v1/apis'));
  const health = useResource(() => api.GET('/v1/health'));
  const [source, setSource] = useState('file');
  const [file, setFile] = useState<File>();
  const [url, setUrl] = useState('');
  const [service, setService] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const [slug, setSlug] = useState('');
  const [routePath, setRoute] = useState('');

  const [options, setOptions] = useState(false);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem>();
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [published, setPublished] =
    useState<components['schemas']['ImportedApi']>();
  const warningId = useId();
  const success = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Child alert effects run first. Focus invalid controls only after React has
  // committed their errors and re-enabled the fieldset after a request.
  useEffect(() => {
    if (!pending && Object.values(errors).some(Boolean))
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [errors, pending, problem]);
  const selected = services.data?.items.find((s) => s.id === service);
  const noRoute = selected && !selected.routes.some((r) => r.paths.length);
  function chooseFile(value: File | undefined) {
    setFile(value);
    setErrors((e) => ({
      ...e,
      file:
        value && value.size > 5 * 1024 * 1024
          ? `This file is ${(value.size / 1024 / 1024).toFixed(1)} MiB. The limit is 5 MiB.`
          : '',
    }));
  }
  async function submit() {
    if (lock.current) return;
    const invalid: Record<string, string> = {};
    if (source === 'file') {
      if (!file) invalid.file = 'Choose an OpenAPI file.';
      else if (file.size > 5 * 1024 * 1024)
        invalid.file = `This file is ${(file.size / 1024 / 1024).toFixed(1)} MiB. The limit is 5 MiB.`;
    } else {
      try {
        if (!['http:', 'https:'].includes(new URL(url).protocol))
          throw new Error();
      } catch {
        invalid.url = 'Enter a URL that starts with http:// or https://.';
      }
    }
    if (releaseNote.length > 5000) {
      invalid.releaseNote = 'Use up to 5,000 characters for the release note.';
      setOptions(true);
    }
    if (!service) invalid.gatewayServiceId = 'Choose a Kong service.';
    if (
      slug &&
      (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        slug.length < 2 ||
        slug.length > 64)
    )
      invalid.slug =
        'Use 2–64 lowercase letters, numbers and single hyphens, like orders-api.';
    if (routePath && !routePath.startsWith('/'))
      invalid.routePath = 'Start the route path with /.';
    if (noRoute && !routePath)
      invalid.routePath =
        'This service has no route path. Enter the path Kong serves this API on.';
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      if (invalid.slug || invalid.routePath || invalid.releaseNote)
        setOptions(true);
      return;
    }

    lock.current = true;
    setPending(true);
    setProblem(undefined);
    setPublished(undefined);
    try {
      const { data, error, response } = await api.POST('/v1/admin/apis', {
        body: {
          spec: source === 'file' ? { content: await file!.text() } : { url },
          gatewayServiceId: service,
          ...(releaseNote.trim() ? { releaseNote } : {}),
          ...(slug ? { slug } : {}),
          ...(routePath ? { routePath } : {}),
        },
      });
      if (error) {
        setProblem(error);
        setRetry(retrySeconds(response));
        const type = error.type.split('/').at(-1);
        if (type === 'lint-ruleset-unavailable') void health.reload();
        const mapping: Record<string, [string, string]> = {
          'invalid-api-version': [
            source === 'file' ? 'file' : 'url',
            invalidVersionMessage,
          ],
          'spec-url-unreachable': [
            'url',
            "We couldn't fetch this URL. Check that it's reachable from the portal server and responds within 10 seconds.",
          ],
          'gateway-service-not-found': [
            'gatewayServiceId',
            'This service no longer exists in Kong. Refresh the list and choose another.',
          ],
          'gateway-service-has-acl': [
            'gatewayServiceId',
            "This service has an ACL plugin the portal didn't create. Remove it in Kong and try again, or choose another service.",
          ],
          'gateway-service-already-linked': [
            'gatewayServiceId',
            'This service already serves a published API. Choose another service, or add a version to that API.',
          ],
          'gateway-service-has-no-route': [
            'routePath',
            'This service has no route path. Enter the path Kong serves this API on.',
          ],
          'api-slug-taken': [
            'slug',
            'Another API already uses this slug. Enter a different one.',
          ],
          'document-too-large': [
            source === 'file' ? 'file' : 'url',
            'This document is larger than 5 MiB, the import limit.',
          ],
        };
        const field = type ? mapping[type] : undefined;
        if (field) {
          setErrors({ [field[0]]: field[1] });
          if (['slug', 'routePath'].includes(field[0])) setOptions(true);
        } else if (error.status === 400) {
          setErrors(
            Object.fromEntries(
              (error.errors || []).map((e) => [
                e.pointer === '/spec/url'
                  ? 'url'
                  : e.pointer?.slice(1) || 'form',
                e.message,
              ]),
            ),
          );
          setOptions(true);
        }
        if (type === 'gateway-service-not-found') void services.reload();
      } else if (data) {
        setPublished(data);
        setFile(undefined);
        if (fileInput.current) fileInput.current.value = '';
        setSource('file');
        setUrl('');
        setService('');
        setSlug('');
        setReleaseNote('');
        setRoute('');
        setOptions(false);

        setErrors({});
        await catalog.reload();
        requestAnimationFrame(() => success.current?.focus());
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function importMessage() {
    if (
      problem?.type.endsWith('/gateway-disabled') ||
      problem?.type.endsWith('/gateway-not-connected')
    )
      return (
        <>
          {problem.type.endsWith('/gateway-disabled')
            ? 'Enable it in Admin → Gateways, then import again.'
            : 'Connect a Kong in Admin → Gateways, then import again.'}{' '}
          Nothing was published, and your entries are still here.{' '}
          <a href="/admin/gateways">Go to Gateways</a>
        </>
      );

    if (!problem) return undefined;
    if (problem.status === 503)
      return "Can't reach Kong's Admin API. Nothing was published. Try again in a moment.";
    if (problem.status === 502)
      return (
        <>
          <p>Kong rejected the request. Nothing was published.</p>
          <code>{problem.detail}</code>
        </>
      );
    return (
      <>
        <p>{problem.detail || problem.title}</p>
        {problem.errors?.[0]?.pointer && (
          <p className="mono">Location: {problem.errors[0].pointer}</p>
        )}
        {problem.type.endsWith('unsupported-openapi-version') && (
          <p>
            Only OpenAPI 3.0 and 3.1 are supported. Convert Swagger 2.0
            documents to OpenAPI 3 first.
          </p>
        )}
        <p>Nothing was published.</p>
        {problem.type.endsWith('gateway-service-already-linked') &&
          selected?.linkedApiSlug && (
            <a
              href={`/admin/apis/${selected.linkedApiSlug}${source === 'url' ? `?url=${encodeURIComponent(url)}` : ''}#add-version`}
            >
              Add a version to{' '}
              {catalog.data?.items.find(
                (a) => a.slug === selected.linkedApiSlug,
              )?.title || `/apis/${selected.linkedApiSlug}`}
            </a>
          )}
      </>
    );
  }
  return (
    <div className="stack">
      <PageHeader
        title="APIs"
        description="Import an OpenAPI document, link it to a Kong service and publish it."
      />
      <RulesetBanner lint={health.data?.lint} />
      {services.data &&
        !blocked &&
        !services.error &&
        health.data?.gateway?.reachable === false && (
          <div className="alert warning">
            ⚠ Kong&apos;s Admin API isn&apos;t responding. Imports, new apps and
            new keys will fail until it&apos;s back.
          </div>
        )}
      {published && (
        <div
          className="alert success"
          role="status"
          aria-describedby={
            [
              published.lintWarnings?.length ? `${warningId}-lint` : '',
              ...(published.warnings || []).map(
                (_, index) => `${warningId}-${index}`,
              ),
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          ref={success}

          tabIndex={-1}
        >
          ✓ Published {published.title}. It&apos;s now in the public catalog.{' '}
          <a href={`/apis/${published.slug}`}>View {published.title}</a>
        </div>
      )}
      {published?.warnings?.map((warning, index) => (
        <div
          className="alert warning"
          id={`${warningId}-${index}`}
          key={`${warningId}-${index}`}
        >
          ⚠ {warning.message}
        </div>
      ))}
      <LintWarnings
        findings={published?.lintWarnings}
        id={`${warningId}-lint`}
      />
      {services.loading && !services.data && (
        <p role="status">Loading Kong services…</p>
      )}
      {services.error &&
        (!services.data || blocked) &&
        (services.error.type.endsWith('/gateway-disabled') ||
        services.error.type.endsWith('/gateway-not-connected') ? (
          <section className="form stack">
            <h2>
              {services.error.type.endsWith('/gateway-disabled')
                ? 'Imports are off.'
                : 'Connect a Kong to import APIs.'}
            </h2>
            <p>
              {services.error.type.endsWith('/gateway-disabled')
                ? "This gateway is disabled, so the portal doesn't offer its services. Enable it to import an API."
                : 'No gateway is connected, so there are no services to choose from.'}
            </p>
            <a className="button" href="/admin/gateways">
              Go to Gateways
            </a>
          </section>
        ) : (
          <ProblemAlert
            problem={services.error}
            title="Gateway unavailable"
            message="Can't reach Kong's Admin API, so the service list is empty. Check that Kong is running. Nothing you entered is lost."
            onRetry={services.reload}
          />
        ))}
      {services.data && !blocked && (
        <form
          ref={form}
          noValidate
          className="form stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2>Import an API</h2>
          <fieldset disabled={pending} className="stack">
            <fieldset>
              <legend>Source</legend>
              <div className="row">
                {[
                  ['file', 'Upload a file'],
                  ['url', 'From a URL'],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="source"
                      value={value}
                      checked={source === value}
                      onChange={() => setSource(value!)}
                    />{' '}
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {source === 'file' ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!pending) chooseFile(e.dataTransfer.files[0]);
                }}
              >
                <Field
                  label="OpenAPI file"
                  error={errors.file}
                  hint="YAML or JSON, OpenAPI 3.0 or 3.1, up to 5 MiB"
                >
                  {(props) => (
                    <Input
                      {...props}
                      key="file"
                      ref={fileInput}
                      type="file"

                      accept=".yaml,.yml,.json,application/json,application/yaml"
                      onChange={(e) => chooseFile(e.target.files?.[0])}
                    />
                  )}
                </Field>
                {file && (
                  <div className="row">
                    <span>
                      {file.name} · {Math.ceil(file.size / 1024)} KB
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setFile(undefined);
                        if (fileInput.current) fileInput.current.value = '';
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Field
                label="Document URL"
                error={errors.url}
                hint="The portal server fetches it once, now. It must be reachable from the server."
              >
                {(props) => (
                  <Input
                    {...props}
                    key="url"
                    type="url"
                    placeholder="https://example.com/openapi.yaml"

                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                )}
              </Field>
            )}
            {services.error && (
              <ProblemAlert
                problem={services.error}
                title="Gateway unavailable"
                message="Can't reach Kong's Admin API, so the service list is empty. Check that Kong is running. Nothing you entered is lost."
                onRetry={services.reload}
                autoFocus={false}
              />
            )}
            {(services.data?.items.length || 0) > 10 && (
              <Field label="Search Kong services">
                {(props) => (
                  <Input
                    {...props}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                )}
              </Field>
            )}
            <Field
              label="Kong service"
              error={errors.gatewayServiceId}
              hint={
                selected?.keyAuth && !selected.linkedApiSlug
                  ? 'Publishing limits this service to apps that include this API. Other Kong consumers lose access until you add them to its group, and Kong stops forwarding API keys to the upstream. See the upgrade notes.'
                  : undefined
              }
            >
              {(props) => (
                <select
                  {...props}
                  required
                  disabled={services.loading}
                  value={service}
                  onChange={(e) => {
                    setService(e.target.value);
                    setErrors((current) => ({
                      ...current,
                      gatewayServiceId: '',
                    }));
                    if (
                      problem?.type.endsWith('/gateway-service-has-acl') ||
                      problem?.type.endsWith('/gateway-service-already-linked')
                    )
                      setProblem(undefined);
                    if (
                      !services.data?.items
                        .find((s) => s.id === e.target.value)
                        ?.routes.some((r) => r.paths.length)
                    )
                      setOptions(true);
                  }}
                >
                  <option value="">
                    {services.loading
                      ? 'Loading Kong services…'
                      : 'Choose a Kong service'}
                  </option>
                  {services.data?.items
                    .filter(
                      (s) =>
                        !search ||
                        s.name.toLowerCase().includes(search.toLowerCase()) ||
                        s.id === service,
                    )
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {serviceLabel(s)}
                      </option>
                    ))}
                </select>
              )}
            </Field>
            {!services.loading &&
              !services.error &&
              !services.data?.items.length && (
                <p className="hint">
                  Kong has no services yet. Create a service and a route in
                  Kong, then refresh the list.
                </p>
              )}
            <Button
              type="button"
              variant="secondary"
              disabled={services.loading}
              onClick={() => void services.reload()}
            >
              Refresh list
            </Button>
            {selected && (
              <p className="hint">
                Routes:{' '}
                {selected.routes.flatMap((r) => r.paths).join(', ') ||
                  'no route path'}
                .
              </p>
            )}
            {selected && !selected.linkedApiSlug && !selected.keyAuth && (
              <div className="alert warning">
                ⚠ This API will be public. Key-auth isn&apos;t enabled on this
                service, so anyone can call it without a key. To require keys,
                enable the key-auth plugin on the service in Kong, then select
                Refresh list.
              </div>
            )}
            {noRoute && (
              <div className="alert warning">
                ⚠ This service has no route path. Enter one under More options,
                or add a route to the service in Kong.
              </div>
            )}
            {selected?.linkedApiSlug && (
              <div className="alert warning">
                ⚠ This service already serves /apis/{selected.linkedApiSlug}. To
                publish a new version of that API, add a version to it instead.
                <a
                  href={`/admin/apis/${selected.linkedApiSlug}${source === 'url' ? `?url=${encodeURIComponent(url)}` : ''}#add-version`}
                >
                  Add a version to{' '}
                  {catalog.data?.items.find(
                    (a) => a.slug === selected.linkedApiSlug,
                  )?.title || `/apis/${selected.linkedApiSlug}`}
                </a>
              </div>
            )}

            <details
              open={options}
              onToggle={(e) => setOptions(e.currentTarget.open)}
            >
              <summary>More options</summary>
              <div className="stack">
                <Field
                  label="Slug"
                  error={errors.slug}
                  hint="Used in the URL /apis/<slug>. Leave blank to make one from the API title."
                >
                  {(props) => (
                    <Input
                      {...props}
                      className="mono"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label="Route path"
                  error={errors.routePath}
                  hint="The path on Kong where this API is served. Leave blank to use the service's first route path."
                >
                  {(props) => (
                    <Input
                      {...props}
                      className="mono"
                      value={routePath}
                      onChange={(e) => setRoute(e.target.value)}
                    />
                  )}
                </Field>
                <ReleaseNote value={releaseNote} onChange={setReleaseNote} />
              </div>
            </details>
          </fieldset>
          {problem &&
            (problem.type.endsWith('openapi-lint-failed') ||
            problem.type.endsWith('lint-ruleset-unavailable') ? (
              <ImportProblem problem={problem} />
            ) : (
              <ProblemAlert
                problem={problem}
                title={
                  problem.type.endsWith('/gateway-disabled')
                    ? 'This gateway is disabled.'
                    : problem.type.endsWith('/gateway-not-connected')
                      ? 'No gateway is connected.'
                      : problem.type.endsWith('invalid-openapi')
                        ? "This isn't a valid OpenAPI document"
                        : problem.type.endsWith('unsupported-openapi-version')
                          ? 'Unsupported OpenAPI version'
                          : undefined
                }
                message={importMessage()}
                onRetry={problem.status === 503 ? submit : undefined}
                retryAfterSeconds={retry}
              />
            ))}
          <div className="actions">
            <Button
              type="submit"
              disabled={
                pending || services.loading || !services.data?.items.length
              }
              aria-busy={pending}
            >
              {pending ? 'Linting and publishing…' : 'Import and publish'}
            </Button>
          </div>
        </form>
      )}
      <section className="stack">
        <h2>Published APIs</h2>
        {catalog.loading ? (
          <p role="status">Loading published APIs…</p>
        ) : catalog.error ? (
          <ProblemAlert problem={catalog.error} onRetry={catalog.reload} />
        ) : !catalog.data?.items.length ? (
          <p className="muted">
            Nothing published yet. Imported APIs appear here and in the public
            catalog.
          </p>
        ) : (
          <Table>
            <caption className="sr-only">Published APIs</caption>
            <thead>
              <tr>
                {[
                  'Title',
                  'Slug',
                  'Version',
                  'Base URL',
                  'Published',
                  'Versions',
                ].map((h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {catalog.data.items.map((a) => (
                <tr
                  key={a.id}
                  className={published?.id === a.id ? 'highlight' : ''}
                >
                  <td>
                    <a href={`/apis/${a.slug}`}>{a.title}</a>
                  </td>
                  <td>
                    <code>{a.slug}</code>
                  </td>
                  <td>{a.version}</td>
                  <td>
                    <code>{a.gatewayBaseUrl}</code>
                  </td>
                  <td>
                    <DateValue value={a.publishedAt} />
                  </td>
                  <td>
                    <a
                      href={`/admin/apis/${a.slug}`}
                      aria-label={`Manage versions for ${a.title}`}
                    >
                      Manage versions
                      <span className="sr-only"> for {a.title}</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
