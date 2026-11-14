// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import Catalog from '../app/page';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/server', () => ({
  serverClient: async () => ({ GET: m.get }),
  signedInUser: async () => null,
}));
vi.mock('../lib/demo', () => ({ isDemo: () => false }));
const product = {
  id: 'product',
  slug: 'orders',
  name: 'Orders bundle',
  description: 'Order APIs',
  apiCount: 2,
  planCount: 1,
  createdAt: '',
};
const apis = [
  {
    id: 'standalone',
    slug: 'standalone',
    title: 'Standalone API',
    version: '1',
    gatewayBaseUrl: '',
    products: [],
  },
  {
    id: 'orders',
    slug: 'orders',
    title: 'Orders API',
    version: '1',
    gatewayBaseUrl: '',
    products: [product],
  },
];
beforeEach(() => {
  m.get.mockReset();
  m.get.mockImplementation((path: string) =>
    Promise.resolve({
      data: { items: path === '/v1/products' ? [product] : apis },
    }),
  );
});
it('shows products and only APIs in no product on the server-rendered catalog', async () => {
  render(await Catalog());
  expect(screen.getByRole('link', { name: /Orders bundle/ })).toHaveAttribute(
    'href',
    '/products/orders',
  );
  expect(
    screen.getByRole('link', { name: /Standalone API/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /Orders API/ }),
  ).not.toBeInTheDocument();
});
it.each(['/v1/products', '/v1/apis'])(
  'preserves the other catalog section when %s fails',
  async (failed) => {
    m.get.mockImplementation((path: string) =>
      path === failed
        ? Promise.reject(new Error('Unavailable'))
        : Promise.resolve({
            data: { items: path === '/v1/products' ? [product] : apis },
          }),
    );
    render(await Catalog());
    expect(screen.getByRole('alert')).toHaveTextContent(
      failed === '/v1/products'
        ? "We couldn't load the products."
        : "We couldn't load the APIs.",
    );
    expect(
      screen.getByRole('link', {
        name: failed === '/v1/products' ? /Standalone API/ : /Orders bundle/,
      }),
    ).toBeInTheDocument();
  },
);
