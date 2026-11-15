// SPDX-License-Identifier: Apache-2.0
import { SearchResults } from '../../components/search-results';
import { demoData } from '../../lib/demo-data';
import { isDemo } from '../../lib/demo';
import { serverClient } from '../../lib/server';
import {
  searchFailed,
  searchResponse,
  type SearchState,
} from '../../lib/search-state';
type Props = { searchParams: Promise<{ q?: string | string[] }> };
function query(q: string | string[] | undefined) {
  return (Array.isArray(q) ? q[0] || '' : q || '').trim();
}
export async function generateMetadata({ searchParams }: Props) {
  const term = query((await searchParams).q);
  return { title: term ? `Search: ${term}` : 'Search' };
}
export default async function SearchPage({ searchParams }: Props) {
  const term = query((await searchParams).q);
  let initial: SearchState = { kind: 'start' };
  if (term.length > 100)
    initial = {
      kind: 'invalid',
      detail: 'Search terms can be at most 100 characters.',
    };
  else if (term) {
    if (isDemo()) initial = { kind: 'loading' };
    else
      try {
        const client = await serverClient();
        const { data, error, response } = await client.GET('/v1/search', {
          params: { query: { q: term } },
        });
        initial = searchResponse(data, error, response);
      } catch {
        initial = searchFailed;
      }
  }
  const sample = isDemo() ? demoData() : undefined;
  return (
    <SearchResults
      key={term}
      term={term}
      initial={initial}
      demoApi={
        sample
          ? {
              ...sample.api,
              description: sample.api.description || undefined,
              document: sample.document,
            }
          : undefined
      }
    />
  );
}
