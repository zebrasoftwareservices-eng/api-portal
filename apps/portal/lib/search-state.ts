// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';
import type { Problem } from './types';
export type SearchState =
  | { kind: 'start' | 'loading' }
  | { kind: 'success'; results: components['schemas']['SearchResults'] }
  | { kind: 'invalid'; detail: string }
  | { kind: 'error'; problem: Problem; retryAfter: number };
export function searchResponse(
  data: components['schemas']['SearchResults'] | undefined,
  error: Problem | undefined,
  response: Response,
): SearchState {
  if (data) return { kind: 'success', results: data };
  if (response.status === 400)
    return { kind: 'invalid', detail: error?.detail || 'Enter a search term.' };
  const value = response.headers.get('Retry-After');
  const retryAfter = value
    ? Math.max(
        0,
        Number.isFinite(Number(value))
          ? Number(value)
          : Math.ceil((Date.parse(value) - Date.now()) / 1000),
      ) || 0
    : 0;
  return {
    kind: 'error',
    problem: {
      type: '/problems/search',
      title: 'Search failed',
      status: response.status,
    },
    retryAfter,
  };
}
export const searchFailed: SearchState = {
  kind: 'error',
  problem: { type: '/problems/network', title: 'Search failed', status: 0 },
  retryAfter: 0,
};
