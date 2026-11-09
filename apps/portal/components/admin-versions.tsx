// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, PageHeader, Table } from '@portal/ui';
import type { components } from '@portal/sdk';
import type { ApiDetail, Problem } from '../lib/types';
import { api, networkProblem } from '../lib/client';
import { useResource } from './use-resource';
import { Field } from './field';
import { DateValue } from './date';
import { ProblemAlert } from './problem-alert';
import {
  ImportProblem,
  LintWarnings,
  ReleaseNote,
  RulesetBanner,
  invalidVersionMessage,
} from './lint-findings';
import { versionHref } from '../lib/version-links';
export function AdminVersions({
  initial,
  initialUrl = '',
}: {
  initial: ApiDetail;
  initialUrl?: string;
}) {
  const [detail, setDetail] = useState(initial);
  const health = useResource(() => api.GET('/v1/health'));
  const [source, setSource] = useState(initialUrl ? 'url' : 'file');
  const [url, setUrl] = useState(initialUrl);
  const [file, setFile] = useState<File>();
  const [note, setNote] = useState('');
  const [keepLatest, setKeepLatest] = useState(false);
  const [pending, setPending] = useState(false);
  const [setting, setSetting] = useState('');
  const [failedVersion, setFailedVersion] = useState('');
  const [problem, setProblem] = useState<Problem>();
  const [rowProblem, setRowProblem] = useState<Problem>();
  const [fieldError, setFieldError] = useState('');
  const [status, setStatus] = useState('');
  const [published, setPublished] =
    useState<components['schemas']['ImportedApiVersion']>();
  const lock = useRef(false);
  const success = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (status) success.current?.focus();
  }, [status]);
  useEffect(() => {
    if (fieldError && !pending)
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [fieldError, pending]);
  async function latest(version: string) {
    if (lock.current) return;
    lock.current = true;
    setSetting(version);
    setFailedVersion(version);
    setRowProblem(undefined);
    setStatus('');
    try {
      const { data, error } = await api.PUT(
        '/v1/admin/apis/{slug}/latest-version',
        { params: { path: { slug: detail.slug } }, body: { version } },
      );
      if (error)
        setRowProblem({
          ...error,
          detail:
            error.status === 404
              ? `Version ${version} no longer exists. Refresh the page to see the current versions.`
              : "The latest version wasn't changed. Try again.",
        });
      else if (data) {
        setDetail(data);
        setStatus(
          `${version} is now the latest version. Developers see it first on /apis/${detail.slug}.`,
        );
      }
    } catch {
      setRowProblem({
        ...networkProblem(),
        detail: "The latest version wasn't changed. Try again.",
      });
    } finally {
      lock.current = false;
      setSetting('');
    }
  }
  async function publish() {
    if (lock.current) return;
    setFieldError('');
    setProblem(undefined);
    if (note.length > 5000) {
      form.current?.querySelector<HTMLElement>('textarea')?.focus();
      return;
    }
    if (source === 'file' && (!file || file.size > 5 * 1024 * 1024)) {
      setFieldError(
        file
          ? 'This document is larger than 5 MiB, the import limit.'
          : 'Choose an OpenAPI file.',
      );
      return;
    }
    if (source === 'url') {
      try {
        if (!['http:', 'https:'].includes(new URL(url).protocol))
          throw new Error();
      } catch {
        setFieldError('Enter a URL that starts with http:// or https://.');
        return;
      }
    }
    lock.current = true;
    setPending(true);
    setPublished(undefined);
    setStatus('');
    try {
      const { data, error } = await api.POST('/v1/admin/apis/{slug}/versions', {
        params: { path: { slug: detail.slug } },
        body: {
          spec: source === 'file' ? { content: await file!.text() } : { url },
          ...(note.trim() ? { releaseNote: note } : {}),
          makeLatest: !keepLatest,
        },
      });
      if (error) {
        if (error.type.endsWith('lint-ruleset-unavailable'))
          void health.reload();
        if (error.type.endsWith('spec-url-unreachable'))
          setFieldError(
            "We couldn't fetch this URL. Check that it's reachable from the portal server and responds within 10 seconds.",
          );
        if (error.type.endsWith('invalid-api-version'))
          setFieldError(invalidVersionMessage);
        if (error.status === 409) {
          const message = `${error.detail || 'This API already has a version with this number.'} Change info.version in the document, then publish again.`;
          setFieldError(message);
          setProblem({ ...error, detail: message });
        } else if (error.status === 413) {
          setFieldError(
            'This document is larger than 5 MiB, the import limit.',
          );
          setProblem(error);
        } else
          setProblem(
            error.status === 404
              ? {
                  ...error,
                  detail: 'This API no longer exists. Nothing was published.',
                }
              : error,
          );
      } else if (data) {
        setDetail(data.api);
        setPublished(data);
        setStatus(
          `Published version ${data.version.version}. ${keepLatest ? `Developers still see ${data.api.version} first.` : "It's now the latest version, so developers see it first."}`,
        );
        setFile(undefined);
        if (fileInput.current) fileInput.current.value = '';
        setUrl('');
        setSource('file');
        setNote('');
        setKeepLatest(false);
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="stack">
      <PageHeader
        title={`${detail.title} versions`}
        description={`Kong service ${detail.gatewayService.name} · Base URL ${detail.gatewayBaseUrl}`}
        breadcrumb={[
          { label: 'Admin' },
          { label: 'APIs', href: '/admin/apis' },
          { label: detail.title },
        ]}
        actions={<a href={`/apis/${detail.slug}`}>View public page</a>}
      />
      <RulesetBanner lint={health.data?.lint} />
      {status && (
        <div
          ref={success}
          role="status"
          tabIndex={-1}
          className="alert success"
          aria-describedby={
            published?.lintWarnings.length ? 'version-warnings' : undefined
          }
        >
          ✓ {status}{' '}
          {published && (
            <>
              <a
                href={versionHref(
                  detail.slug,
                  published.version.version,
                  published.api.version === published.version.version,
                )}
              >
                View {published.version.version}
              </a>{' '}
              · <a href={`/apis/${detail.slug}/changelog`}>View changelog</a>
            </>
          )}
        </div>
      )}
      <LintWarnings findings={published?.lintWarnings} id="version-warnings" />
      <section className="stack">
        <h2>Versions</h2>
        {rowProblem && (
          <ProblemAlert
            problem={rowProblem}
            onRetry={
              rowProblem.status === 404
                ? () => window.location.reload()
                : () => void latest(failedVersion)
            }
          />
        )}
        <Table>
          <caption className="sr-only">API versions</caption>
          <thead>
            <tr>
              {['Version', 'Status', 'Published', 'Actions'].map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.versions.map((v) => (
              <tr
                key={v.version}
                className={
                  published?.version.version === v.version ? 'highlight' : ''
                }
              >
                <td>
                  <code>{v.version}</code>
                </td>
                <td>
                  {v.isLatest && <span className="badge latest">✓ Latest</span>}
                </td>
                <td>
                  <DateValue value={v.publishedAt} />
                </td>
                <td>
                  <div className="row">
                    <a
                      href={versionHref(detail.slug, v.version, v.isLatest)}
                      aria-label={`View version ${v.version}`}
                    >
                      View<span className="sr-only"> version {v.version}</span>
                    </a>
                    {!v.isLatest && (
                      <Button
                        variant="secondary"
                        disabled={pending || !!setting}
                        aria-label={`Set ${v.version} as latest`}
                        aria-busy={setting === v.version}
                        onClick={() => void latest(v.version)}
                      >
                        {setting === v.version ? 'Setting…' : 'Set as latest'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          The latest version is what developers see first on /apis/{detail.slug}
          . Older versions stay readable at their own URLs.{' '}
          <a href={`/apis/${detail.slug}/changelog`}>View changelog</a>
        </p>
      </section>
      <form
        className="form stack"
        ref={form}
        noValidate
        aria-labelledby="add-version-heading"
        onSubmit={(e) => {
          e.preventDefault();
          void publish();
        }}
      >
        <div id="add-version">
          <h2 id="add-version-heading">Add a version</h2>
        </div>
        <p>
          Publishes a new OpenAPI document for this API. It uses the same Kong
          service, route, apps and keys, so nothing changes in Kong.
        </p>
        <fieldset className="stack" disabled={pending || !!setting}>
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
                    checked={source === value}
                    onChange={() => {
                      setSource(value!);
                      setFieldError('');
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {source === 'file' ? (
            <Field
              label="OpenAPI file"
              error={fieldError}
              hint="YAML or JSON, OpenAPI 3.0 or 3.1, up to 5 MiB. The version number is read from info.version and must be new for this API."
            >
              {(props) => (
                <>
                  <Input
                    {...props}
                    type="file"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      setFile(e.dataTransfer.files[0]);
                    }}
                    key="file"
                    ref={fileInput}
                    accept=".yaml,.yml,.json"
                    onChange={(e) => setFile(e.target.files?.[0])}
                  />
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
                </>
              )}
            </Field>
          ) : (
            <Field label="Document URL" error={fieldError}>
              {(props) => (
                <Input
                  {...props}
                  key="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              )}
            </Field>
          )}
          <ReleaseNote value={note} onChange={setNote} />
          <label>
            <input
              type="checkbox"
              checked={keepLatest}
              aria-describedby="latest-hint"
              onChange={(e) => setKeepLatest(e.target.checked)}
            />{' '}
            Don&apos;t make this the default version
          </label>
          <p className="hint" id="latest-hint">
            Developers keep seeing {detail.version} first. You can change this
            later with Set as latest.
          </p>
        </fieldset>
        {problem && (
          <>
            <ImportProblem problem={problem} versionForm />
            {problem.status === 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void publish()}
              >
                Try again
              </Button>
            )}
            {problem.status === 404 && <a href="/admin/apis">Back to APIs</a>}
          </>
        )}
        <Button
          type="submit"
          disabled={pending || !!setting}
          aria-busy={pending}
        >
          {pending ? 'Linting and publishing…' : 'Publish version'}
        </Button>
      </form>
    </div>
  );
}
