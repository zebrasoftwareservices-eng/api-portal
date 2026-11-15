// SPDX-License-Identifier: Apache-2.0
import openapiFetch from 'openapi-fetch';
import type { paths } from './schema.js';
export type { paths, components, operations } from './schema.js';
export function createClient(
  options: Parameters<typeof openapiFetch<paths>>[0] = {},
) {
  return openapiFetch<paths>({ credentials: 'include', ...options });
}
export { searchCatalog } from './search.js';
export type { SearchApi, SearchResult, SearchResults } from './search.js';
