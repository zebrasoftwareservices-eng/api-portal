// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { searchCatalog, type components } from '@portal/sdk';
import { Button, Card, EmptyState, Input, Label, PageHeader } from '@portal/ui';
import { quietApi } from '../lib/client';
import {
  searchFailed,
  searchResponse,
  type SearchState,
} from '../lib/search-state';
import { ProblemAlert } from './problem-alert';
import { SearchIcon } from './header-search';
import { SearchResultRow, searchResultHref } from './search-result-row';
type DemoApi = {
  slug: string;
  title: string;
  version: string;
  description?: string;
  document: Record<string, unknown>;
};
export function SearchLoading() {
  return (
    <>
      <p role="status" className="muted">
        Searching…
      </p>
      <Card>
        <ol
          className="search-results"
          aria-busy="true"
          aria-label="Search results"
        >
          {[0, 1, 2].map((key) => (
            <li className="search-skeleton" key={key}>
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
export function SearchResults({
  term,
  initial,
  demoApi,
}: {
  term: string;
  initial: SearchState;
  demoApi?: DemoApi;
}) {
  const [state, setState] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (demoApi && term && term.length <= 100)
      setState({
        kind: 'success',
        results: searchCatalog([demoApi], term, 20),
      });
  }, [demoApi, term]);
  useEffect(() => {
    if (state.kind === 'invalid') input.current?.focus();
  }, [state]);
  async function retry() {
    setState({ kind: 'loading' });
    try {
      const { data, error, response } = await quietApi.GET('/v1/search', {
        params: { query: { q: term } },
      });
      setState(searchResponse(data, error, response));
    } catch {
      setState(searchFailed);
    }
  }
  const results: components['schemas']['SearchResults'] | undefined =
    state.kind === 'success' ? state.results : undefined;
  const n = results?.items.length || 0;
  return (
    <section className="search-page">
      <PageHeader title="Search" />
      <form
        role="search"
        action="/search"
        method="get"
        className="search-form"
        onSubmit={(event) => {
          if (!input.current?.value.trim()) {
            event.preventDefault();
            setState({ kind: 'invalid', detail: 'Enter a search term.' });
            input.current?.focus();
          }
        }}
      >
        <div className="search-field">
          <Label htmlFor="search-q" className="sr-only">
            Search APIs and endpoints
          </Label>
          <div className="search-input">
            <SearchIcon />
            <Input
              ref={input}
              id="search-q"
              type="search"
              name="q"
              defaultValue={term}
              maxLength={100}
              autoComplete="off"
              enterKeyHint="search"
              autoFocus={!term}
              aria-invalid={state.kind === 'invalid' || undefined}
              aria-describedby={
                state.kind === 'invalid' ? 'search-error' : undefined
              }
            />
          </div>
          {state.kind === 'invalid' && (
            <p id="search-error" className="error-text">
              {state.detail}
            </p>
          )}
        </div>
        <Button type="submit">Search</Button>
      </form>
      {state.kind === 'start' && (
        <p className="muted">
          {demoApi
            ? 'Search API names, paths like /orders/{id}, or what an operation does.'
            : 'Search API names, paths like /orders/{id}, what an operation does, or page titles.'}
        </p>
      )}
      {state.kind === 'loading' && <SearchLoading />}
      {results && (
        <>
          <p role="status" className="muted">
            {results.truncated
              ? `Showing the top ${n} results for “${term}”. Add a word or part of a path to narrow them.`
              : n
                ? `${n} ${n === 1 ? 'result' : 'results'} for “${term}”`
                : `No results for “${term}”`}
          </p>
          {n ? (
            <Card>
              <ol className="search-results" aria-label="Search results">
                {results.items.map((result, index) => (
                  <SearchResultRow
                    key={index}
                    result={result}
                    href={searchResultHref(result)}
                  />
                ))}
              </ol>
            </Card>
          ) : (
            <EmptyState
              icon={
                <svg
                  className="search-empty-icon"
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m21 21-4.34-4.34" />
                  <circle cx="11" cy="11" r="8" />
                  <path d="m8 8 6 6m0-6-6 6" />
                </svg>
              }
              title={`Nothing matched “${term}”`}
              description="Check the spelling, use fewer words, or search for part of a path such as /orders."
              action={
                <Button asChild variant="secondary">
                  <a href="/">Browse all APIs</a>
                </Button>
              }
            />
          )}
        </>
      )}
      {state.kind === 'error' && (
        <ProblemAlert
          problem={state.problem}
          title={
            state.problem.status === 429
              ? 'Too many searches'
              : "Search didn't load"
          }
          message={
            state.problem.status === 429
              ? (remaining) =>
                  `You've searched a lot in the last minute. Try again in ${remaining}s.`
              : 'Check your connection and try again.'
          }
          retryAfterSeconds={state.retryAfter}
          onRetry={retry}
        />
      )}
    </section>
  );
}
