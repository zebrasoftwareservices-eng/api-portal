// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import { searchCatalog, type SearchApi } from './search.js';
const api: SearchApi = {
  slug: 'orders',
  title: 'Orders API',
  version: '1',
  description: 'Purchase history',
  document: {
    paths: {
      '/orders/{id}': {
        get: {
          summary: 'Find order',
          operationId: 'findOrder',
          tags: ['Orders'],
        },
        delete: { summary: 'Cancel order' },
        parameters: { summary: 'Fake' },
        servers: {},
      },
      '/orders': { post: { summary: 'Create order' } },
    },
  },
};
it('normalizes whitespace and case, uses AND tokens, and keeps API titles out of operations', () => {
  expect(searchCatalog([api], '  OrDeRs   API ').items).toEqual([
    { kind: 'api', api: { slug: 'orders', title: 'Orders API', version: '1' } },
  ]);
  expect(searchCatalog([api], 'cancel order').items).toMatchObject([
    { method: 'DELETE', path: '/orders/{id}', summary: 'Cancel order' },
  ]);
  expect(searchCatalog([api], 'findOrder').items).toHaveLength(1);
  expect(searchCatalog([api], 'purchase history').items[0]?.kind).toBe('api');
  expect(searchCatalog([api], 'cancel missing').items).toEqual([]);
  expect(searchCatalog([api], 'fake').items).toEqual([]);
  expect(searchCatalog([api], '  ').items).toEqual([]);
});
it('implements all score bands in descending order', () => {
  const rows: SearchApi[] = [
    {
      ...api,
      slug: 'description',
      title: 'Z',
      description: 'get /orders',
      document: {},
    },
    { ...api, slug: 'title-tokens', title: '/orders get extra', document: {} },
    { ...api, slug: 'exact-title', title: 'GET /orders', document: {} },
    {
      ...api,
      slug: 'operations',
      title: 'A',
      description: null,
      document: {
        paths: {
          '/other': { get: { summary: 'get /orders' } },
          '/orders/items': { get: {} },
          '/get /orders/details': { post: {} },
          '/orders': { get: {} },
        },
      },
    },
  ];
  expect(
    searchCatalog(rows, 'get /orders').items.map((r) =>
      r.kind === 'api' ? r.api.slug : r.path,
    ),
  ).toEqual([
    '/orders',
    'exact-title',
    '/get /orders/details',
    '/orders/items',
    'title-tokens',
    '/other',
    'description',
  ]);
});
it('sorts ties by title, path and method; limits and reports truncation', () => {
  const rows = [api, { ...api, slug: 'a', title: 'A' }];
  const result = searchCatalog(rows, 'orders', 2);
  expect(result.truncated).toBe(true);
  expect(result.items.map((r) => [r.api.title, r.path, r.method])).toEqual([
    ['A', '/orders', 'POST'],
    ['A', '/orders/{id}', 'DELETE'],
  ]);
  expect(searchCatalog([api], '/orders/{id}', 50).truncated).toBe(false);
});
it.each(['{}/*%_\\\'"', '日本語', 'café'])(
  'matches literal special characters and Unicode %s',
  (term) => {
    expect(
      searchCatalog(
        [
          {
            ...api,
            title: term,
            document: { paths: { [term]: { trace: { tags: ['tag', 1] } } } },
          },
        ],
        term,
      ).items,
    ).toHaveLength(2);
  },
);
it.each([
  null,
  [],
  'bad',
  {},
  { paths: null },
  { paths: [] },
  { paths: 'bad' },
  { paths: { '/bad': null, '/also': { get: null } } },
])('tolerates malformed documents %j', (document) => {
  expect(searchCatalog([{ ...api, document }], 'find').items).toEqual([]);
});
it('matches 300 APIs × 30 operations in under 50 ms', () => {
  const rows = Array.from({ length: 300 }, (_, n) => ({
    ...api,
    slug: `api-${n}`,
    document: {
      paths: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [
          `/orders/${i}`,
          { get: { summary: 'Find order' } },
        ]),
      ),
    },
  }));
  searchCatalog(rows, 'orders'); // warm up
  const start = performance.now();
  expect(searchCatalog(rows, 'orders').truncated).toBe(true);
  expect(performance.now() - start).toBeLessThan(50);
});
it('visits exactly the eight HTTP operation keys and skips path metadata', () => {
  const methods = [
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
  ];
  const item = Object.fromEntries(
    [...methods, 'parameters', 'servers', 'summary', 'x-custom'].map(
      (method) => [method, { summary: 'needle' }],
    ),
  );
  const result = searchCatalog(
    [{ ...api, document: { paths: { '/verbs': item } } }],
    'needle',
  );
  expect(result.items.map((row) => row.method).sort()).toEqual(
    methods.map((method) => method.toUpperCase()).sort(),
  );
});

it('adds page title and description matches without searching bodies', () => {
  const pages = [
    { slug: 'guide', title: 'Getting started', description: 'First API call' },
    { slug: 'exact', title: 'First API call', description: null },
  ];
  expect(searchCatalog([], 'first api call', 20, pages).items).toEqual([
    {
      kind: 'page',
      page: { slug: 'exact', title: 'First API call', description: null },
    },
    {
      kind: 'page',
      page: {
        slug: 'guide',
        title: 'Getting started',
        description: 'First API call',
      },
    },
  ]);
  expect(searchCatalog([api], 'orders')).toEqual(searchCatalog([api], 'orders', 20, []));
  expect(searchCatalog([], 'secret body', 20, pages).items).toEqual([]);
});
