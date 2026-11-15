// SPDX-License-Identifier: Apache-2.0
import { Badge, MethodBadge } from '@portal/ui';
import type { components } from '@portal/sdk';
import { operationAnchor } from '../lib/operation-anchor';
export type SearchResult = components['schemas']['SearchResult'];
export function searchResultHref(result: SearchResult) {
  const base = `/apis/${encodeURIComponent(result.api.slug)}`;
  return result.kind === 'api'
    ? base
    : `${base}#${operationAnchor({ method: result.method || '', path: result.path || '', tags: result.tags })}`;
}
export function SearchResultRow({
  result,
  href,
}: {
  result: SearchResult;
  href: string;
}) {
  const description = result.summary || result.operationId;
  return (
    <li>
      <a className="search-result" href={href}>
        {result.kind === 'api' ? (
          <>
            <Badge>API</Badge>
            <span className="search-result-title">{result.api.title}</span>
            <span className="search-result-detail muted">
              Version {result.api.version}
            </span>
          </>
        ) : (
          <>
            <MethodBadge method={result.method || ''} />
            <code className="search-result-title">{result.path}</code>
            <span className="search-result-detail muted">
              {description && <>{description} · </>}
              {result.api.title}
            </span>
          </>
        )}
      </a>
    </li>
  );
}
