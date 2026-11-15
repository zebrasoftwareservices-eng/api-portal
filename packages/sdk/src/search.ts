// SPDX-License-Identifier: Apache-2.0
import type { components } from './schema.js';
export type SearchResult = components['schemas']['SearchResult'];
export type SearchResults = components['schemas']['SearchResults'];
export interface SearchApi {
  slug: string;
  title: string;
  version: string;
  description?: string | null;
  document: unknown;
}
const verbs = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown) => (typeof v === 'string' ? v : '');
/** Pure, literal search over the latest visible catalog supplied by the caller. */
export function searchCatalog(
  apis: readonly SearchApi[],
  term: string,
  limit = 20,
): SearchResults {
  const query = normalize(term);
  if (!query) return { items: [], truncated: false };
  const tokens = query.split(' ');
  const matches = (text: string) =>
    tokens.every((token) => text.includes(token));
  const ranked: { result: SearchResult; score: number }[] = [];
  for (const row of apis) {
    const api = { slug: row.slug, title: row.title, version: row.version };
    const title = normalize(row.title);
    if (matches(normalize(`${row.title} ${row.description ?? ''}`)))
      ranked.push({
        result: { kind: 'api', api },
        score: title === query ? 90 : matches(title) ? 50 : 30,
      });
    const paths = object(row.document) ? row.document.paths : undefined;
    if (!object(paths)) continue;
    for (const [path, item] of Object.entries(paths)) {
      if (!object(item)) continue;
      for (const verb of verbs) {
        const op = item[verb];
        if (!object(op)) continue;
        const method = verb.toUpperCase() as NonNullable<
          SearchResult['method']
        >;
        const methodPath = normalize(`${method} ${path}`);
        const normalizedPath = normalize(path);
        if (
          !matches(
            normalize(
              `${methodPath} ${string(op.summary)} ${string(op.operationId)}`,
            ),
          )
        )
          continue;
        ranked.push({
          result: {
            kind: 'operation',
            api,
            method,
            path,
            summary: typeof op.summary === 'string' ? op.summary : null,
            operationId:
              typeof op.operationId === 'string' ? op.operationId : null,
            tags: Array.isArray(op.tags)
              ? op.tags.filter((tag): tag is string => typeof tag === 'string')
              : [],
          },
          score:
            normalizedPath === query || methodPath === query
              ? 100
              : normalizedPath.includes(query)
                ? 80
                : matches(methodPath)
                  ? 60
                  : 40,
        });
      }
    }
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.result.api.title.localeCompare(b.result.api.title) ||
      (a.result.path ?? '').localeCompare(b.result.path ?? '') ||
      (a.result.method ?? '').localeCompare(b.result.method ?? ''),
  );
  const count = Math.max(0, Math.trunc(limit));
  return {
    items: ranked.slice(0, count).map(({ result }) => result),
    truncated: ranked.length > count,
  };
}
