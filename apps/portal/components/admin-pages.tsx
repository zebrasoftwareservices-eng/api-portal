// SPDX-License-Identifier: Apache-2.0
'use client';
import type { components } from '@portal/sdk';
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Table,
  Textarea,
  toast,
} from '@portal/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { quietApi } from '../lib/client';
import { assignLocation } from '../lib/navigate';
import { signInLink } from '../lib/navigation';
import {
  clientPageErrors,
  linkedAreas,
  oneLine,
  pageFieldMessage,
  slugify,
  type PageWrite,
} from '../lib/page-form';
import type { Problem } from '../lib/types';
import { DateValue } from './date';
import { useResource } from './use-resource';

type Detail = components['schemas']['PageDetail'];

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

function statusCopy(status: number) {
  if (status === 413)
    return { title: "The page wasn't saved", detail: "It's too large. Shorten the body and try again." };
  if (status === 401)
    return {
      title: "The page wasn't saved",
      detail: 'Your session has ended. Sign in again in a new tab, then save here.',
    };
  if (status === 403)
    return { title: "The page wasn't saved", detail: "Your account can't edit pages." };
  if (status === 404)
    return {
      title: 'This page was deleted',
      detail: 'Another admin deleted it. Copy your text if you need it.',
    };
  return {
    title: "The page wasn't saved",
    detail: "The portal server didn't respond. Your text is still here; try again.",
  };
}

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  const published = status === 'published';
  return (
    <Badge className={published ? 'active' : undefined}>
      <span aria-hidden="true">{published ? '●' : '○'}</span> {published ? 'Published' : 'Draft'}
    </Badge>
  );
}

function NewTab({ children }: { children: string }) {
  return (
    <>
      {children} <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </>
  );
}

export function AdminPages() {
  const pages = useResource(async () => {
    const { data, error, response } = await quietApi.GET('/v1/admin/pages');
    return {
      data: data?.items,
      error: error ? problem(error, response.status) : undefined,
    };
  });
  return (
    <section className="stack">
      <PageHeader
        title="Pages"
        description="Guides and other pages you write in Markdown."
        actions={
          <Button asChild>
            <a href="/admin/pages/new">New page</a>
          </Button>
        }
      />
      {pages.loading ? (
        <Card aria-busy="true">
          <span className="sr-only">Loading pages…</span>
          {[0, 1, 2].map((row) => (
            <div className="skeleton admin-page-skeleton" key={row} />
          ))}
        </Card>
      ) : pages.error ? (
        <div className="alert error stack" role="alert">
          <strong>⚠ We couldn&apos;t load the pages. Try again in a moment.</strong>
          <Button type="button" variant="secondary" onClick={() => pages.reload()}>
            Try again
          </Button>
        </div>
      ) : pages.data?.length ? (
        <Card>
          <Table className="admin-pages-table">
            <caption className="sr-only">Pages</caption>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">Who can read</th>
                <th scope="col">Linked from</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {pages.data.map((page) => {
                const linked = linkedAreas(page.navigation);
                return (
                  <tr key={page.id}>
                    <td data-label="Title">
                      <a href={`/admin/pages/${page.id}`}>
                        <strong>{page.title}</strong>
                      </a>
                      <div>
                        <code className="mono muted">/pages/{page.slug}</code>
                      </div>
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={page.status} />
                    </td>
                    <td data-label="Who can read">
                      {page.visibility === 'public' ? 'Public' : 'Signed-in only'}
                    </td>
                    <td data-label="Linked from">
                      {linked.text}
                      {linked.unlinked && <span className="sr-only">Not linked</span>}
                    </td>
                    <td data-label="Updated">
                      <DateValue value={page.updatedAt} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title="No pages yet"
          description="Write a guide, an about page or your terms. Nobody sees a page until you publish it."
          action={
            <Button asChild>
              <a href="/admin/pages/new">New page</a>
            </Button>
          }
        />
      )}
    </section>
  );
}

const empty: PageWrite = {
  title: '',
  slug: '',
  body: '',
  visibility: 'public',
  status: 'draft',
  description: null,
  seoTitle: null,
  ogImageUrl: null,
};

function writeFrom(page: Detail): PageWrite {
  return {
    title: page.title,
    slug: page.slug,
    body: page.body,
    visibility: page.visibility,
    status: page.status,
    description: page.description,
    seoTitle: page.seoTitle,
    ogImageUrl: page.ogImageUrl,
  };
}

export function AdminPageEditor({ pageId }: { pageId?: string }) {
  const router = useRouter();
  const [id, setId] = useState(pageId);
  const [form, setForm] = useState<PageWrite>(empty);
  const [saved, setSaved] = useState<Detail>();
  const [loading, setLoading] = useState(Boolean(pageId));
  const [loadError, setLoadError] = useState<Problem>();
  const [slugEdited, setSlugEdited] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [deleted, setDeleted] = useState(false);
  const [failure, setFailure] = useState<Problem>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<'delete' | 'unpublish'>();
  const [checking, setChecking] = useState(false);
  const [confirmError, setConfirmError] = useState<Problem>();
  const [confirmPage, setConfirmPage] = useState<Detail>();
  const alertHeading = useRef<HTMLHeadingElement>(null);
  const publishing = useRef<HTMLDivElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const unpublishButton = useRef<HTMLButtonElement>(null);
  const helpId = useId();

  async function load(target = pageId) {
    if (!target) return;
    setLoading(true);
    setLoadError(undefined);
    try {
      const { data, error, response } = await quietApi.GET('/v1/admin/pages/{pageId}', {
        params: { path: { pageId: target } },
      });
      if (!data) setLoadError(problem(error, response.status));
      else {
        setSaved(data);
        setForm(writeFrom(data));
        setId(data.id);
      }
    } catch {
      setLoadError(problem(undefined));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (pageId) void load(pageId);
  }, [pageId]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  useEffect(() => {
    if (failure) alertHeading.current?.focus();
  }, [failure]);

  function change<K extends keyof PageWrite>(key: K, value: PageWrite[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`/${key}`];
      return next;
    });
  }
  function applySaved(page: Detail, message: string) {
    setSaved(page);
    setForm(writeFrom(page));
    setDirty(false);
    setFailure(undefined);
    setFieldErrors({});
    setDeleted(false);
    toast.success(message);
    if (!id) {
      setId(page.id);
      sessionStorage.setItem('portal-page-focus', page.id);
      router.replace(`/admin/pages/${page.id}`);
    }
    requestAnimationFrame(() => publishing.current?.querySelector('button')?.focus());
  }
  async function save(status: 'draft' | 'published', action: string, inDialog = false) {
    const errors = clientPageErrors({ ...form, status });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setFailure(problem({ title: "The page wasn't saved", status: 400, detail: 'Check the fields below.', errors: [] }));
      setConfirm(undefined);
      return;
    }
    setBusy(action);
    if (inDialog) setConfirmError(undefined);
    else setFailure(undefined);
    const body = { ...form, status };
    try {
      const result = id
        ? await quietApi.PUT('/v1/admin/pages/{pageId}', { params: { path: { pageId: id } }, body })
        : await quietApi.POST('/v1/admin/pages', { body });
      if (!result.data) {
        const next = problem(result.error, result.response.status);
        if (inDialog) setConfirmError(next);
        else showFailure(next);
        return;
      }
      const message =
        status === 'published'
          ? saved?.status === 'published'
            ? "Changes saved. They're live now."
            : 'Page published.'
          : saved?.status === 'published'
            ? "Page unpublished. It's a draft now."
            : 'Draft saved.';
      setConfirm(undefined);
      applySaved(result.data, message);
    } catch {
      const next = problem(undefined);
      if (inDialog) setConfirmError(next);
      else showFailure(next);
    } finally {
      setBusy(undefined);
    }
  }
  function showFailure(next: Problem) {
    const pointers = next.errors || [];
    const mapped: Record<string, string> = {};
    for (const item of pointers) {
      if (!item.pointer) continue;
      mapped[item.pointer] = pageFieldMessage(item.pointer, form, next.status, item.message);
    }
    if (next.status === 409 && !mapped['/slug'])
      mapped['/slug'] = pageFieldMessage('/slug', form, 409);
    setFieldErrors(mapped);
    setFailure(next);
    if (next.status === 404) setDeleted(true);
  }
  async function readLinks() {
    if (!id) return;
    setChecking(true);
    setConfirmError(undefined);
    setConfirmPage(undefined);
    try {
      const result = await quietApi.GET('/v1/admin/pages/{pageId}', { params: { path: { pageId: id } } });
      if (!result.data) setConfirmError(problem(result.error, result.response.status));
      else setConfirmPage(result.data);
      return result.data;
    } catch {
      setConfirmError(problem(undefined));
      return undefined;
    } finally {
      setChecking(false);
    }
  }
  async function openUnpublish() {
    setBusy('Checking');
    setFailure(undefined);
    const page = await readLinks();
    setBusy(undefined);
    if (!page) {
      setFailure(
        problem({
          title: "The page wasn't saved",
          status: 0,
          detail: "We couldn't check where this page is linked. Nothing changed.",
        }),
      );
      return;
    }
    if (page.navigation.length === 0) {
      await save('draft', 'Unpublishing');
      return;
    }
    setConfirm('unpublish');
  }
  async function openDelete() {
    setConfirm('delete');
    await readLinks();
  }
  async function remove() {
    if (!id) return;
    setBusy('Deleting');
    setConfirmError(undefined);
    try {
      const result = await quietApi.DELETE('/v1/admin/pages/{pageId}', { params: { path: { pageId: id } } });
      if (result.response.status === 204) {
        toast.success('Page deleted.');
        assignLocation('/admin/pages');
        return;
      }
      setConfirmError(problem(result.error, result.response.status));
    } catch {
      setConfirmError(problem(undefined));
    } finally {
      setBusy(undefined);
    }
  }
  function closeConfirm() {
    setConfirm(undefined);
    (confirm === 'delete' ? deleteButton : unpublishButton).current?.focus();
  }

  if (pageId && loading)
    return (
      <div aria-busy="true">
        <a href="/admin/pages">← Pages</a>
        <span className="sr-only">Loading page…</span>
        <div className="skeleton admin-editor-skeleton" />
      </div>
    );
  if (pageId && loadError && !saved)
    return loadError.status === 404 ? (
      <section className="stack">
        <h1>Page not found</h1>
        <p>It may have been deleted.</p>
        <Button asChild>
          <a href="/admin/pages">Back to pages</a>
        </Button>
      </section>
    ) : (
      <div className="alert error stack" role="alert">
        <strong>⚠ We couldn&apos;t load this page. Try again in a moment.</strong>
        <Button type="button" variant="secondary" onClick={() => load(pageId)}>
          Try again
        </Button>
      </div>
    );

  const status = saved?.status || 'draft';
  const locked = Boolean(busy);
  const field = (pointer: string, hint: string) => {
    const errorId = fieldErrors[pointer] ? `${pointer.slice(1)}-error` : undefined;
    return {
      'aria-invalid': fieldErrors[pointer] ? true : undefined,
      'aria-describedby': [hint, errorId].filter(Boolean).join(' ') || undefined,
    };
  };
  const namedErrors = Object.entries(fieldErrors).map(([pointer, message]) => ({
    pointer,
    message,
    id: pointer.slice(1),
  }));
  const failureCopy = failure ? statusCopy(failure.status) : undefined;
  const fieldAlert = failure && failure.status !== 401 && failure.status !== 403 && failure.status !== 413 && failure.status !== 404 && failure.status !== 0 && failure.status < 500 && namedErrors.length > 0;

  return (
    <section className="stack">
      <a href="/admin/pages">← Pages</a>
      <div className="row spread">
        <h1>{saved?.title || 'New page'}</h1>
        <StatusBadge status={status} />
      </div>
      {failure && (
        <div className="alert error stack" role="alert">
          <h2 ref={alertHeading} tabIndex={-1}>
            ⚠ {fieldAlert ? "The page wasn't saved" : failureCopy?.title}
          </h2>
          {fieldAlert ? (
            <ul>
              {namedErrors.map((item) => (
                <li key={item.pointer}>
                  <a
                    href={`#${item.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(item.id)?.focus();
                    }}
                  >
                    {item.message}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>{failure.detail || failureCopy?.detail}</p>
          )}
          {failure.status === 401 && (
            <Button asChild>
              <a href={signInLink(id ? `/admin/pages/${id}` : '/admin/pages/new')} target="_blank" rel="noopener noreferrer">
                <NewTab>Sign in</NewTab>
              </a>
            </Button>
          )}
          {failure.status === 404 && (
            <Button asChild>
              <a href="/admin/pages">Back to pages</a>
            </Button>
          )}
          {failure.status === 0 && failure.detail?.includes("couldn't check") && (
            <Button type="button" variant="secondary" onClick={() => openUnpublish()}>
              Try again
            </Button>
          )}
        </div>
      )}
      <form
        className="page-editor"
        aria-busy={locked || undefined}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="page-editor-fields stack">
          <label htmlFor="title">Title</label>
          <Input
            id="title"
            required
            maxLength={120}
            value={form.title}
            disabled={locked}
            {...field('/title', 'title-hint')}
            onChange={(event) => {
              const title = oneLine(event.target.value);
              setForm((current) => ({
                ...current,
                title,
                slug: !slugEdited && !saved ? slugify(title) : current.slug,
              }));
              setDirty(true);
              setFieldErrors((current) => {
                const next = { ...current };
                delete next['/title'];
                if (!slugEdited && !saved) delete next['/slug'];
                return next;
              });
            }}
          />
          <span className="hint" id="title-hint">Shown as the page heading.</span>
          {fieldErrors['/title'] && <p id="title-error" className="error-text">{fieldErrors['/title']}</p>}

          <label htmlFor="slug">Slug</label>
          <div className="slug-field">
            <span>/pages/</span>
            <Input
              id="slug"
              className="mono"
              required
              maxLength={64}
              value={form.slug}
              disabled={locked}
              {...field('/slug', 'slug-hint')}
              onChange={(event) => {
                setSlugEdited(true);
                change('slug', oneLine(event.target.value));
              }}
            />
          </div>
          <span className="hint" id="slug-hint">The page&apos;s address. Lowercase letters, numbers and hyphens.</span>
          {fieldErrors['/slug'] && <p id="slug-error" className="error-text">{fieldErrors['/slug']}</p>}
          {saved?.status === 'published' && form.slug !== saved.slug && (
            <p className="warning-text" role="status">
              <span aria-hidden="true">⚠ </span>
              The old address <code>/pages/{saved.slug}</code> stops working when you save. Header and footer links follow the page.
            </p>
          )}

          <label htmlFor="body">Body</label>
          <Textarea
            id="body"
            className="mono page-body"
            rows={20}
            spellCheck
            value={form.body}
            disabled={locked}
            {...field('/body', 'body-hint')}
            onChange={(event) => change('body', event.target.value)}
          />
          <span className="hint" id="body-hint">Write in Markdown. HTML tags are removed. Images must be https links.</span>
          {form.body.length >= 90_000 && (
            <p className={form.body.length > 100_000 ? 'error-text' : 'muted'} aria-live={form.body.length > 100_000 ? 'polite' : undefined}>
              {form.body.length.toLocaleString()} of 100,000 characters
            </p>
          )}
          {fieldErrors['/body'] && <p id="body-error" className="error-text">{fieldErrors['/body']}</p>}
          <details>
            <summary>Markdown help</summary>
            <ul>
              <li>Headings: <code>## Heading</code></li>
              <li>Bold: <code>**bold**</code></li>
              <li>Lists: <code>- item</code></li>
              <li>Links: <code>[label](https://example.com)</code></li>
              <li>Images: <code>![alt](https://example.com/a.png)</code></li>
              <li>Tables: a header row, then <code>| --- |</code>, then the cells</li>
              <li>Code blocks: a line of <code>```</code>, the code, then <code>```</code></li>
            </ul>
            <p id={helpId}>Start headings at <code>##</code>; the title is the top heading.</p>
          </details>

          <h2>Search and sharing</h2>
          <label htmlFor="description">Description (optional)</label>
          <Textarea
            id="description"
            rows={3}
            maxLength={300}
            value={form.description || ''}
            disabled={locked}
            {...field('/description', 'description-hint')}
            onChange={(event) => change('description', event.target.value || null)}
          />
          <span className="hint" id="description-hint">Shown in search and link previews. Portal search finds it too.</span>
          {fieldErrors['/description'] && <p id="description-error" className="error-text">{fieldErrors['/description']}</p>}

          <label htmlFor="seoTitle">Search engine title (optional)</label>
          <Input
            id="seoTitle"
            maxLength={120}
            value={form.seoTitle || ''}
            disabled={locked}
            {...field('/seoTitle', 'seoTitle-hint')}
            onChange={(event) => change('seoTitle', oneLine(event.target.value) || null)}
          />
          <span className="hint" id="seoTitle-hint">Leave empty to use the page title.</span>
          {fieldErrors['/seoTitle'] && <p id="seoTitle-error" className="error-text">{fieldErrors['/seoTitle']}</p>}

          <label htmlFor="ogImageUrl">Link preview image (optional)</label>
          <Input
            id="ogImageUrl"
            className="mono"
            type="url"
            maxLength={2048}
            value={form.ogImageUrl || ''}
            disabled={locked}
            {...field('/ogImageUrl', 'ogImageUrl-hint')}
            onChange={(event) => change('ogImageUrl', oneLine(event.target.value) || null)}
          />
          <span className="hint" id="ogImageUrl-hint">A full https address. Leave empty for no image.</span>
          {fieldErrors['/ogImageUrl'] && <p id="ogImageUrl-error" className="error-text">{fieldErrors['/ogImageUrl']}</p>}
        </div>
        <div className="card publishing stack" ref={publishing}>
          <h2>Publishing</h2>
          <fieldset disabled={locked}>
            <legend>Who can read this page</legend>
            <label>
              <input type="radio" name="visibility" checked={form.visibility === 'public'} onChange={() => change('visibility', 'public')} /> Public
            </label>
            <p className="muted">Anyone with the link can read it.</p>
            <label>
              <input type="radio" name="visibility" checked={form.visibility === 'signed-in'} onChange={() => change('visibility', 'signed-in')} /> Signed-in only
            </label>
            <p className="muted">Any signed-in account can read it. Signed-out visitors get a “Page not found” page and don&apos;t see links to it.</p>
          </fieldset>
          {status === 'published' ? (
            <>
              <p>This page is live. Saving changes what readers see.</p>
              <Button type="button" disabled={locked || deleted} onClick={() => save('published', 'Saving')}>
                {busy === 'Saving' ? 'Saving…' : 'Save changes'}
              </Button>
              <Button asChild variant="link">
                <a href={`/pages/${saved?.slug || form.slug}`} target="_blank" rel="noopener noreferrer">
                  <NewTab>View page</NewTab>
                </a>
              </Button>
              <Button ref={unpublishButton} type="button" variant="secondary" disabled={locked || deleted} onClick={() => openUnpublish()}>
                {busy === 'Checking' ? 'Checking links…' : busy === 'Unpublishing' ? 'Unpublishing…' : 'Unpublish'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" disabled={locked || deleted} onClick={() => save('published', 'Publishing')}>
                {busy === 'Publishing' ? 'Publishing…' : 'Publish'}
              </Button>
              <Button type="button" variant="secondary" disabled={locked || deleted} onClick={() => save('draft', 'Saving')}>
                {busy === 'Saving' ? 'Saving…' : 'Save draft'}
              </Button>
              {saved && (
                <Button asChild variant="link">
                  <a href={`/page-preview/${saved.id}`} target="_blank" rel="noopener noreferrer">
                    <NewTab>Preview</NewTab>
                  </a>
                </Button>
              )}
            </>
          )}
          {dirty && (
            <p role="status">
              Unsaved changes.{status === 'draft' && saved ? ' Preview shows the last save.' : ''}
            </p>
          )}
          {saved && (
            <>
              <hr />
              <Button
                ref={deleteButton}
                type="button"
                variant="ghost"
                className="destructive-text"
                disabled={locked || deleted}
                onClick={() => openDelete()}
              >
                Delete page
              </Button>
            </>
          )}
        </div>
      </form>
      <AlertDialog.Root open={Boolean(confirm)} onOpenChange={(open) => { if (!open && !busy) closeConfirm(); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog content-dialog stack"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('page-confirm-cancel')?.focus();
            }}
          >
            <AlertDialog.Title>
              {confirm === 'delete' ? `Delete “${saved?.title}”?` : `Unpublish “${saved?.title}”?`}
            </AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="stack">
                {confirm === 'delete' ? (
                  <p>The page and its text are deleted. This can&apos;t be undone.</p>
                ) : (
                  <p>It becomes a draft and <code>/pages/{saved?.slug}</code> stops working.</p>
                )}
                {checking && <p role="status">Checking where this page is linked…</p>}
                {confirmError && (
                  <p>
                    {confirmError.status === 404
                      ? 'Another admin deleted it. Copy your text if you need it.'
                      : confirm === 'delete' && !confirmPage
                        ? "We couldn't check where this page is linked. Nothing changed."
                        : statusCopy(confirmError.status).detail}
                  </p>
                )}
                {!checking && confirmPage && confirmPage.navigation.length > 0 && (
                  <>
                    <p>
                      These links disappear
                      {confirm === 'unpublish' ? ' until you publish it again' : ''}:
                    </p>
                    <ul>
                      {confirmPage.navigation.map((link, index) => (
                        <li key={`${link.area}-${index}`}>
                          {link.area === 'header' ? 'Header' : 'Footer'}: {link.label}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {confirm === 'unpublish' && dirty && <p>Unsaved changes are saved in the draft.</p>}
              </div>
            </AlertDialog.Description>
            {confirmError && !confirmPage && confirm === 'delete' && (
              <Button type="button" variant="secondary" onClick={() => readLinks()}>
                Try again
              </Button>
            )}
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <Button id="page-confirm-cancel" type="button" variant="secondary" disabled={locked}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button
                type="button"
                variant="destructive"
                disabled={locked || checking || !confirmPage || Boolean(confirmError && !confirmPage)}
                onClick={() => (confirm === 'delete' ? remove() : save('draft', 'Unpublishing', true))}
              >
                {busy === 'Deleting' ? 'Deleting…' : busy === 'Unpublishing' ? 'Unpublishing…' : confirm === 'delete' ? 'Delete page' : 'Unpublish'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
