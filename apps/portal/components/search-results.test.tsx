// SPDX-License-Identifier: Apache-2.0
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchResults } from './search-results';
import { operationAnchor } from '../lib/operation-anchor';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/client', () => ({ quietApi: { GET: mocks.get } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/search' }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
const api = { slug: 'orders', title: 'Orders API', version: '2.0.0' };
it('preserves ranking and links operations with their tag anchor and summary fallback', () => {
  render(
    <SearchResults
      term="orders"
      initial={{
        kind: 'success',
        results: {
          truncated: true,
          items: [
            {
              kind: 'operation',
              api,
              method: 'GET',
              path: '/orders/{id}',
              operationId: 'getOrder',
              tags: ['Orders'],
            },
            { kind: 'api', api },
          ],
        },
      }}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Showing the top 2 results',
  );
  const links = screen.getAllByRole('link');
  expect(links[0]).toHaveTextContent('GET/orders/{id}getOrder · Orders API');
  expect(links[0]).toHaveAttribute(
    'href',
    `/apis/orders#${operationAnchor({ method: 'GET', path: '/orders/{id}', tags: ['Orders'] })}`,
  );
  expect(links[1]).toHaveAttribute('href', '/apis/orders');
  expect(links[1]).toHaveTextContent('Version 2.0.0');
});
it('shows the start hint and rejects blank submission without making a request', () => {
  render(<SearchResults term="" initial={{ kind: 'start' }} />);
  const input = screen.getByRole('searchbox');
  expect(input).toHaveFocus();
  expect(screen.getByText(/Search API names/)).toBeVisible();
  fireEvent.submit(screen.getByRole('search'));
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('Enter a search term.');
  expect(mocks.get).not.toHaveBeenCalled();
});
it('shows the server validation detail inline and focuses the field', () => {
  render(
    <SearchResults
      term="bad"
      initial={{ kind: 'invalid', detail: 'Exact server detail.' }}
    />,
  );
  expect(screen.getByRole('searchbox')).toHaveFocus();
  expect(screen.getByRole('searchbox')).toHaveAccessibleDescription(
    'Exact server detail.',
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('searches the sample document in the browser without an API call', async () => {
  render(
    <SearchResults
      term="cancel order"
      initial={{ kind: 'loading' }}
      demoApi={{
        ...api,
        document: {
          paths: {
            '/orders/{id}/cancel': { post: { summary: 'Cancel an order' } },
          },
        },
      }}
    />,
  );
  expect(
    await screen.findByRole('link', { name: /POST.*Cancel an order/ }),
  ).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('1 result');
  expect(mocks.get).not.toHaveBeenCalled();
});
it('shows a calm empty state with a catalog link', () => {
  render(
    <SearchResults
      term="invoices"
      initial={{ kind: 'success', results: { items: [], truncated: false } }}
    />,
  );
  expect(
    screen.getByRole('heading', { name: 'Nothing matched “invoices”' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Browse all APIs' })).toHaveAttribute(
    'href',
    '/',
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('counts down a 429 and retries the same term through the SDK', async () => {
  vi.useFakeTimers();
  mocks.get.mockResolvedValue({
    data: { items: [], truncated: false },
    response: new Response(),
  });
  render(
    <SearchResults
      term="orders"
      initial={{
        kind: 'error',
        problem: {
          type: '/problems/rate-limited',
          title: 'Rate limited',
          status: 429,
        },
        retryAfter: 2,
      }}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Try again in 2s' }),
  ).toBeDisabled();
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Try again in 1s.');
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  });
  expect(mocks.get).toHaveBeenCalledWith('/v1/search', {
    params: { query: { q: 'orders' } },
  });
  expect(screen.getByRole('status')).toHaveTextContent('No results');
});
it('shows a recoverable network error and clears results during retry', async () => {
  mocks.get.mockRejectedValue(new Error('private stack'));
  render(
    <SearchResults
      term="orders"
      initial={{
        kind: 'error',
        problem: {
          type: '/problems/network',
          title: 'Private server detail',
          status: 0,
        },
        retryAfter: 0,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByRole('status')).toHaveTextContent('Searching…');
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent("Search didn't load"),
  );
  expect(screen.getByRole('alert')).not.toHaveTextContent('private stack');
});
