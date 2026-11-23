// SPDX-License-Identifier: Apache-2.0
import { Button, Input, SelectField, Switch } from '@portal/ui';
import {
  builtinLabel,
  pageAudience,
  pageOptionLabel,
  rowName,
  type NavRow,
  type PageSummary,
} from '../lib/navigation-editor';

const LIMIT = { header: 12, footer: 20 } as const;

export function NavigationList({
  area,
  items,
  pages,
  pagesFailed,
  onRetryPages,
  errors,
  disabled,
  onChange,
  onAnnounce,
}: {
  area: 'header' | 'footer';
  items: NavRow[];
  pages?: PageSummary[];
  pagesFailed: boolean;
  onRetryPages: () => void;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (items: NavRow[]) => void;
  onAnnounce: (message: string) => void;
}) {
  const title = area === 'header' ? 'Header' : 'Footer';
  const full = items.length >= LIMIT[area];
  function update(index: number, row: NavRow) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? row : item)));
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(target, 0, row);
    onChange(next);
    const name = rowName(row, target);
    onAnnounce(`${name} moved to position ${target + 1} of ${next.length} in the ${area}.`);
    const control =
      direction === -1 ? (target === 0 ? 'down' : 'up') : target === next.length - 1 ? 'up' : 'down';
    requestAnimationFrame(() => document.getElementById(`${row.clientId}-${control}`)?.focus());
  }
  function remove(index: number) {
    const row = items[index];
    if (!row) return;
    const next = items.filter((_, itemIndex) => itemIndex !== index);
    onChange(next);
    onAnnounce(`${rowName(row, index)} removed. Save to apply.`);
    const focusRow = next[index] || next[index - 1];
    requestAnimationFrame(() => {
      if (focusRow) document.getElementById(`${focusRow.clientId}-up`)?.focus();
      else document.getElementById(`${area}-add-external`)?.focus();
    });
  }
  function add(kind: 'page' | 'link') {
    const clientId = crypto.randomUUID();
    const row: NavRow =
      kind === 'page'
        ? { clientId, kind: 'page', label: '', pageId: '' }
        : { clientId, kind: 'link', label: '', url: '' };
    onChange([...items, row]);
    requestAnimationFrame(() => document.getElementById(`${clientId}-label`)?.focus());
  }
  return (
    <section className="card stack nav-area" aria-labelledby={`${area}-heading`}>
      <h2 id={`${area}-heading`}>{title}</h2>
      {area === 'footer' && items.length === 0 && <p>No footer links.</p>}
      <ol className="nav-rows">
        {items.map((row, index) => {
          const name = rowName(row, index);
          const group = `${title} link ${index + 1}: ${name}`;
          const labelError = errors[`/${area}/${index}/label`];
          const targetError = errors[`/${area}/${index}/${row.kind === 'page' ? 'pageId' : 'url'}`];
          return (
            <li key={row.clientId} className="nav-editor-row" role="group" aria-label={group}>
              <span className="nav-index">{index + 1}</span>
              <span className="nav-moves">
                <Button id={`${row.clientId}-up`} type="button" variant="ghost" className="nav-move" aria-label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</Button>
                <Button id={`${row.clientId}-down`} type="button" variant="ghost" className="nav-move" aria-label={`Move ${name} down`} disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)}>↓</Button>
              </span>
              {row.kind === 'builtin' ? (
                <>
                  <span className={row.hidden ? 'muted' : undefined}>
                    <strong>{builtinLabel(row.key)}</strong>
                    {row.hidden && <span> Hidden</span>}
                  </span>
                  <span className="muted">
                    {row.key === 'apis' ? 'Built-in. Everyone sees it.' : 'Built-in. Signed-in developers see it.'}
                  </span>
                  <label className="nav-show">
                    <span aria-hidden="true">Show</span>
                    <Switch
                      checked={!row.hidden}
                      disabled={disabled}
                      aria-label={`Show ${builtinLabel(row.key)}`}
                      onCheckedChange={(checked) => update(index, { ...row, hidden: !checked })}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="stack">
                    Label
                    <Input
                      id={`${row.clientId}-label`}
                      maxLength={60}
                      value={row.label}
                      disabled={disabled}
                      aria-invalid={labelError ? true : undefined}
                      aria-describedby={labelError ? `${row.clientId}-label-error` : undefined}
                      onChange={(event) => update(index, { ...row, label: event.target.value.replace(/[\r\n]+/g, ' ') })}
                    />
                    {labelError && <span id={`${row.clientId}-label-error`} className="error-text">{labelError}</span>}
                  </label>
                  {row.kind === 'page' ? (
                    <label className="stack">
                      Page
                      {pagesFailed ? (
                        <span>{row.page?.title || 'Saved page'}</span>
                      ) : (
                        <SelectField
                          id={`${row.clientId}-page`}
                          value={row.pageId}
                          disabled={disabled}
                          aria-invalid={targetError ? true : undefined}
                          aria-describedby={[row.pageId ? `${row.clientId}-audience` : '', targetError ? `${row.clientId}-page-error` : ''].filter(Boolean).join(' ') || undefined}
                          onChange={(event) => {
                            const pageId = event.target.value;
                            const page = pages?.find((item) => item.id === pageId);
                            update(index, {
                              ...row,
                              pageId,
                              label: row.label.trim() || page?.title.slice(0, 60) || '',
                              page: page && { slug: page.slug, title: page.title, visibility: page.visibility, status: page.status },
                            });
                          }}
                        >
                          <option value="">Choose a page</option>
                          {(pages || []).map((page) => (
                            <option key={page.id} value={page.id}>{pageOptionLabel(page)}</option>
                          ))}
                          {row.pageId && pages && !pages.some((page) => page.id === row.pageId) && (
                            <option value={row.pageId}>{row.page?.title || 'Missing page'}</option>
                          )}
                        </SelectField>
                      )}
                      {row.page && <span id={`${row.clientId}-audience`} className="muted">{pageAudience(row.page)}</span>}
                      {targetError && <span id={`${row.clientId}-page-error`} className="error-text">{targetError}</span>}
                    </label>
                  ) : (
                    <label className="stack">
                      Web address
                      <Input
                        id={`${row.clientId}-url`}
                        className="mono"
                        type="url"
                        value={row.url}
                        disabled={disabled}
                        aria-invalid={targetError ? true : undefined}
                        aria-describedby={targetError ? `${row.clientId}-url-error` : undefined}
                        onChange={(event) => update(index, { ...row, url: event.target.value.replace(/[\r\n]+/g, ' ') })}
                      />
                      {targetError && <span id={`${row.clientId}-url-error`} className="error-text">{targetError}</span>}
                    </label>
                  )}
                  <Button type="button" variant="ghost" disabled={disabled} aria-label={`Remove ${name}`} onClick={() => remove(index)}>
                    Remove
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <div className="nav-add row">
        <Button type="button" variant="secondary" disabled={disabled || full || pagesFailed || !pages?.length} onClick={() => add('page')}>
          Add page link
        </Button>
        <Button id={`${area}-add-external`} type="button" variant="secondary" disabled={disabled || full} onClick={() => add('link')}>
          Add external link
        </Button>
      </div>
      {full && (
        <p className="muted">
          {area === 'header'
            ? 'The header can have up to 12 links, including built-ins.'
            : 'The footer can have up to 20 links.'}
        </p>
      )}
      {!full && pagesFailed && (
        <p className="muted">
          We couldn&apos;t load the pages.{' '}
          <Button type="button" variant="ghost" onClick={onRetryPages}>Try again</Button>
        </p>
      )}
      {!full && !pagesFailed && pages && pages.length === 0 && (
        <p className="muted">
          No pages yet. <a href="/admin/pages/new">New page</a>
        </p>
      )}
      {area === 'header' && (
        <p className="muted">Search, Sign in, Sign up and the account menu always come after these links and can&apos;t be hidden or moved.</p>
      )}
    </section>
  );
}
