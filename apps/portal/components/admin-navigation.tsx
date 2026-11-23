// SPDX-License-Identifier: Apache-2.0
'use client';
import type { components } from '@portal/sdk';
type SaveNavigation = components['schemas']['SaveNavigationRequest'];
import { AlertDialog, Button, PageHeader, toast } from '@portal/ui';
import { useEffect, useRef, useState } from 'react';
import { quietApi } from '../lib/client';
import {
  clientNavigationErrors,
  navigationFieldMessage,
  rowFromSettings,
  sameNavigation,
  type NavRow,
  type PageSummary,
} from '../lib/navigation-editor';
import type { Problem } from '../lib/types';
import { NavigationList } from './navigation-list';

type Settings = components['schemas']['NavigationSettings'];

function problem(value: unknown, status = 0): Problem {
  const candidate = value as Partial<Problem> | undefined;
  return {
    type: candidate?.type || '/problems/request',
    title: candidate?.title || 'Request failed',
    status: candidate?.status || status,
    detail: candidate?.detail,
    errors: candidate?.errors,
  };
}

function failureCopy(status: number) {
  if (status === 401)
    return 'Your session has ended. Sign in again in a new tab, then save here.';
  if (status === 403) return "Your account can't edit the navigation.";
  return "The portal server didn't respond. Your changes are still here; try again.";
}

function areaMessage(pointer: string, rows: NavRow[], pages: PageSummary[] | undefined, serverMessage?: string) {
  const match = /^\/(header|footer)\/(\d+)\/(label|url|pageId)$/.exec(pointer);
  if (!match) return serverMessage || 'Check this field.';
  const index = Number(match[2]);
  const row = rows[index];
  return navigationFieldMessage(pointer, row, Boolean(pages), pages || []);
}

export function AdminNavigation() {
  const [header, setHeader] = useState<NavRow[]>([]);
  const [footer, setFooter] = useState<NavRow[]>([]);
  const [savedHeader, setSavedHeader] = useState<NavRow[]>([]);
  const [savedFooter, setSavedFooter] = useState<NavRow[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [pages, setPages] = useState<PageSummary[]>();
  const [pagesFailed, setPagesFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Problem>();
  const [busy, setBusy] = useState<string>();
  const [failure, setFailure] = useState<Problem>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const dirty = !sameNavigation(header, savedHeader) || !sameNavigation(footer, savedFooter);

  function apply(settings: Settings, pageItems = pages) {
    let sequence = 0;
    const nextId = () => `saved-${sequence++}`;
    const nextHeader = settings.header.map((item) => rowFromSettings(item, nextId()));
    const nextFooter = settings.footer.map((item) => rowFromSettings(item, nextId()));
    setHeader(nextHeader);
    setFooter(nextFooter);
    setSavedHeader(nextHeader);
    setSavedFooter(nextFooter);
    setIsDefault(settings.isDefault);
    setErrors({});
    setFailure(undefined);
    void pageItems;
  }
  async function loadPages() {
    try {
      const { data, error } = await quietApi.GET('/v1/admin/pages');
      if (!data || error) {
        setPagesFailed(true);
        setPages(undefined);
        return;
      }
      setPagesFailed(false);
      setPages(data.items);
    } catch {
      setPagesFailed(true);
    }
  }
  async function load() {
    setLoading(true);
    setLoadError(undefined);
    try {
      const [settings] = await Promise.all([
        quietApi.GET('/v1/admin/navigation'),
        loadPages(),
      ]);
      if (!settings.data) setLoadError(problem(settings.error, settings.response.status));
      else apply(settings.data);
    } catch {
      setLoadError(problem(undefined));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  useEffect(() => {
    if (failure) heading.current?.focus();
  }, [failure]);

  function showErrors(next: Problem, rows: { header: NavRow[]; footer: NavRow[] }) {
    const mapped: Record<string, string> = {};
    let areaLevel = false;
    for (const item of next.errors || []) {
      if (!item.pointer) continue;
      if (item.pointer === '/header' || item.pointer === '/footer') areaLevel = true;
      const source = item.pointer.startsWith('/header') ? rows.header : rows.footer;
      mapped[item.pointer] = areaMessage(item.pointer, source, pages, item.message);
    }
    setErrors(mapped);
    setFailure(areaLevel ? problem({ ...next, detail: next.errors?.find((item) => item.pointer === '/header' || item.pointer === '/footer')?.message || next.detail }) : next);
  }
  async function save() {
    if (!dirty) {
      setNotice('No changes to save.');
      return;
    }
    const found = {
      ...clientNavigationErrors('header', header, pagesFailed ? undefined : pages),
      ...clientNavigationErrors('footer', footer, pagesFailed ? undefined : pages),
    };
    if (Object.keys(found).length) {
      setErrors(found);
      setFailure(problem({ title: "The navigation wasn't saved", status: 400 }));
      setNotice('');
      return;
    }
    setBusy('Saving');
    setFailure(undefined);
    setNotice('');
    const body: SaveNavigation = { header: [], footer: [] };
    for (const row of header) {
      if (row.kind === 'builtin') body.header.push({ kind: 'builtin', key: row.key, hidden: row.hidden });
      else if (row.kind === 'page') body.header.push({ kind: 'page', label: row.label.trim(), pageId: row.pageId });
      else body.header.push({ kind: 'link', label: row.label.trim(), url: row.url.trim() });
    }
    for (const row of footer) {
      if (row.kind === 'page') body.footer.push({ kind: 'page', label: row.label.trim(), pageId: row.pageId });
      else if (row.kind === 'link') body.footer.push({ kind: 'link', label: row.label.trim(), url: row.url.trim() });
    }
    try {
      const result = await quietApi.PUT('/v1/admin/navigation', { body });
      if (!result.data) {
        showErrors(problem(result.error, result.response.status), { header, footer });
        return;
      }
      apply(result.data);
      toast.success('Navigation saved. Visitors see it on their next page load.');
      saveButton.current?.focus();
    } catch {
      setFailure(problem(undefined, 500));
    } finally {
      setBusy(undefined);
    }
  }
  async function reset() {
    setBusy('Resetting');
    setResetError('');
    try {
      if (isDefault) {
        setHeader(savedHeader);
        setFooter(savedFooter);
        setErrors({});
        setFailure(undefined);
        setResetOpen(false);
        toast.success('Navigation reset to default.');
        return;
      }
      const result = await quietApi.DELETE('/v1/admin/navigation');
      if (!result.data) {
        setResetError("The navigation wasn't reset. Nothing changed; try again.");
        return;
      }
      apply(result.data);
      setResetOpen(false);
      toast.success('Navigation reset to default.');
    } catch {
      setResetError("The navigation wasn't reset. Nothing changed; try again.");
    } finally {
      setBusy(undefined);
    }
  }
  const named = Object.entries(errors)
    .map(([pointer, message]) => {
      const match = /^\/(header|footer)\/(\d+)\//.exec(pointer);
      if (!match) return { pointer, message, id: '' };
      const area = match[1] === 'header' ? 'Header' : 'Footer';
      const index = Number(match[2]);
      const rows = match[1] === 'header' ? header : footer;
      const id = pointer.endsWith('/label')
        ? `${rows[index]?.clientId}-label`
        : pointer.endsWith('/url')
          ? `${rows[index]?.clientId}-url`
          : `${rows[index]?.clientId}-page`;
      return { pointer, message: `${area} link ${index + 1}: ${message}`, id };
    })
    .filter((item) => !item.pointer.endsWith('/header') && item.pointer !== '/header' && item.pointer !== '/footer');
  const areaProblem = (failure?.errors || []).some((item) => item.pointer === '/header' || item.pointer === '/footer');

  if (loading)
    return (
      <section className="stack" aria-busy="true">
        <PageHeader title="Navigation" description="Links in the portal's header and footer. Not shown in the admin area." />
        <span className="sr-only">Loading navigation…</span>
        <div className="card stack">{[0, 1].map((row) => <div key={row} className="skeleton admin-page-skeleton" />)}</div>
        <div className="card stack">{[0, 1].map((row) => <div key={row} className="skeleton admin-page-skeleton" />)}</div>
      </section>
    );
  if (loadError)
    return (
      <section className="stack">
        <PageHeader title="Navigation" description="Links in the portal's header and footer. Not shown in the admin area." />
        <div className="alert error stack" role="alert">
          <strong>⚠ We couldn&apos;t load the navigation. Try again in a moment.</strong>
          <Button type="button" variant="secondary" onClick={() => load()}>Try again</Button>
        </div>
      </section>
    );

  return (
    <section className="stack">
      <PageHeader
        title="Navigation"
        description="Links in the portal's header and footer. Not shown in the admin area."
        actions={
          <Button asChild variant="link">
            <a href="/" target="_blank" rel="noopener noreferrer">
              Open the portal <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        }
      />
      {failure && (
        <div className="alert error stack" role="alert">
          <h2 ref={heading} tabIndex={-1}>⚠ The navigation wasn&apos;t saved</h2>
          {areaProblem ? (
            <p>{failure.detail || failure.errors?.find((item) => item.pointer === '/header' || item.pointer === '/footer')?.message}</p>
          ) : named.length ? (
            <ul>
              {named.map((item) => (
                <li key={item.pointer}>
                  <a href={`#${item.id}`} onClick={(event) => { event.preventDefault(); document.getElementById(item.id)?.focus(); }}>
                    {item.message}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>{failure.status === 401 || failure.status === 403 || failure.status >= 500 || failure.status === 0 ? failureCopy(failure.status) : failure.detail}</p>
          )}
          {areaProblem && (
            <Button type="button" variant="secondary" onClick={() => load()}>
              Reload
            </Button>
          )}
          {areaProblem && <p className="muted">Reload to get the current links. Unsaved changes are lost.</p>}
        </div>
      )}
      <p role="status" className="sr-only">{notice}</p>
      <NavigationList area="header" items={header} pages={pages} pagesFailed={pagesFailed} onRetryPages={() => loadPages()} errors={errors} disabled={Boolean(busy)} onAnnounce={setNotice} onChange={(items) => { setHeader(items); setErrors({}); }} />
      <NavigationList area="footer" items={footer} pages={pages} pagesFailed={pagesFailed} onRetryPages={() => loadPages()} errors={errors} disabled={Boolean(busy)} onAnnounce={setNotice} onChange={(items) => { setFooter(items); setErrors({}); }} />
      <div className="nav-save row">
        <Button ref={saveButton} type="button" disabled={Boolean(busy)} onClick={() => save()}>
          {busy === 'Saving' ? 'Saving…' : 'Save navigation'}
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(busy) || (isDefault && !dirty)} onClick={() => { setResetError(''); setResetOpen(true); }}>
          Reset to default
        </Button>
        {dirty && <p role="status">Unsaved changes.</p>}
        {!dirty && notice && <p>{notice}</p>}
      </div>
      <AlertDialog.Root open={resetOpen} onOpenChange={(open) => { if (!busy) setResetOpen(open); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog content-dialog stack"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('nav-reset-cancel')?.focus();
            }}
          >
            <AlertDialog.Title>Reset navigation to default?</AlertDialog.Title>
            <AlertDialog.Description>
              The header goes back to APIs and My apps, and your footer links are removed. Your pages don&apos;t change. This can&apos;t be undone.
            </AlertDialog.Description>
            {resetError && <p className="error-text">{resetError}</p>}
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <Button id="nav-reset-cancel" type="button" variant="secondary" disabled={Boolean(busy)}>Cancel</Button>
              </AlertDialog.Cancel>
              <Button type="button" variant="destructive" disabled={Boolean(busy)} onClick={() => reset()}>
                {busy === 'Resetting' ? 'Resetting…' : 'Reset to default'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
