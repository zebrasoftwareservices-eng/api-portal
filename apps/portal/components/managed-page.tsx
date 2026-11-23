// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';
import { Badge } from '@portal/ui';
import { DateValue } from './date';
import { MarkdownBody } from './markdown-body';

type Page = Pick<components['schemas']['PublicPage'], 'title' | 'body' | 'visibility' | 'updatedAt'>;

export function ManagedPage({ page, preview = false }: { page: Page; preview?: boolean }) {
  return (
    <article className="managed-page">
      <header className="managed-page-heading stack">
        <h1>{page.title}</h1>
        <div className="managed-page-meta">
          <span>
            Updated <DateValue value={page.updatedAt} />
          </span>
          {page.visibility === 'signed-in' && <Badge>Signed-in only</Badge>}
        </div>
      </header>
      {page.body ? (
        <MarkdownBody source={page.body} />
      ) : preview ? (
        <p className="muted">This page has no text yet.</p>
      ) : null}
    </article>
  );
}
