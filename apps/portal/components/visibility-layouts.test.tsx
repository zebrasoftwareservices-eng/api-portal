// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, it, vi } from 'vitest';
import ProductLayout from '../app/products/[slug]/layout';
import ChangelogLayout from '../app/apis/[slug]/changelog/layout';
const m = vi.hoisted(() => ({ get: vi.fn(), user: vi.fn() }));
vi.mock('../lib/server', () => ({
  serverClient: async () => ({ GET: m.get }),
  signedInUser: m.user,
}));
vi.mock('../lib/demo', () => ({ isDemo: () => false }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('./team-context', () => ({ TeamBar: () => null }));
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue(null);
});
it.each([ProductLayout, ChangelogLayout])(
  'rejects invisible and missing resources before returning the loading boundary',
  async (layout) => {
    let resolve!: (value: unknown) => void;
    m.get.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    let returned = false;
    const result = layout({
      params: Promise.resolve({ slug: 'missing' }),
      children: <p>Loading boundary</p>,
    });
    void result.then(
      () => {
        returned = true;
      },
      () => {},
    );
    await vi.waitFor(() => expect(m.get).toHaveBeenCalled());
    expect(returned).toBe(false);
    const rejected = expect(result).rejects.toThrow('NOT_FOUND');
    resolve({ error: { status: 404 } });
    await rejected;
    expect(m.user).not.toHaveBeenCalled();
  },
);
it.each([ProductLayout, ChangelogLayout])(
  'returns visible content after validation',
  async (layout) => {
    m.get.mockResolvedValue({ data: { items: [] } });
    const children = <p>Visible content</p>;
    expect(
      await layout({ params: Promise.resolve({ slug: 'visible' }), children }),
    ).toBe(children);
  },
);
it('checks the changelog endpoint as well as API detail before streaming', async () => {
  m.get.mockImplementation(async (path: string) =>
    path.endsWith('/changelog') ? { error: { status: 404 } } : { data: {} },
  );
  await expect(
    ChangelogLayout({
      params: Promise.resolve({ slug: 'missing' }),
      children: null,
    }),
  ).rejects.toThrow('NOT_FOUND');
});
