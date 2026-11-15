// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDetail } from './app-detail';
vi.mock('./app-usage', () => ({ AppUsageCard: () => null }));
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
  setReveal: vi.fn(),
  setUser: vi.fn(),
  portalUser: undefined as
    | undefined
    | { email: string; emailVerified: boolean; verificationRequired: boolean },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../lib/client', () => ({
  api: { GET: mocks.get, POST: mocks.post, DELETE: mocks.del },
  retrySeconds: () => 0,
  networkProblem: () => ({
    status: 0,
    title: 'Network failure',
    type: '/network',
  }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({
    setReveal: mocks.setReveal,
    setUser: mocks.setUser,
    user: mocks.portalUser,
    reveal: null,
  }),
}));
const credential = {
  id: 'cred-1',
  kind: 'api-key',
  keyHint: '9fQa',
  status: 'active',
  createdAt: '2026-11-02T00:00:00Z',
};
const app = {
  id: 'app-1',
  name: 'Weather bot',
  createdAt: '2026-11-02T00:00:00Z',
  subscriptions: [{ apiId: 'api', slug: 'sample', title: 'Sample HTTP API' }],
  credentials: [credential],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.portalUser = undefined;
  mocks.get.mockResolvedValue({ data: app });
});
describe('app keys', () => {
  it('keeps a key active after a failed revoke and only marks it revoked after retry succeeds', async () => {
    const user = userEvent.setup();
    mocks.del
      .mockResolvedValueOnce({
        error: {
          type: '/problems/gateway-unavailable',
          title: 'gateway unavailable',
          status: 503,
        },
        response: new Response(null, { status: 503 }),
      })
      .mockResolvedValueOnce({ response: new Response(null, { status: 204 }) });
    render(<AppDetail appId="app-1" />);
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    let dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'the key is still active',
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '⚠ Gateway unavailable',
    );
    expect(within(dialog).getByRole('alert')).not.toHaveTextContent(
      '⚠ gateway unavailable',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('● Active')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    dialog = screen.getByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('○ Revoked')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke' }),
    ).not.toBeInTheDocument();
    expect(mocks.del).toHaveBeenCalledTimes(2);
  });
  it('disables additional keys at the contract limit with an accessible reason', async () => {
    mocks.get.mockResolvedValue({
      data: {
        ...app,
        credentials: Array.from({ length: 5 }, (_, i) => ({
          ...credential,
          id: `key-${i}`,
        })),
      },
    });
    const user = userEvent.setup();
    render(<AppDetail appId="app-1" />);
    const button = await screen.findByRole('button', { name: 'Create key' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(
      'This app has 5 active keys, the maximum. Revoke one to create another.',
    );
    await user.click(button);
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['gateway-disabled', 'gateway-not-connected'])(
    'shows the right new-key refusal for %s',
    async (code) => {
      mocks.post.mockResolvedValue({
        error: { type: `/problems/${code}`, title: code, status: 409 },
        response: new Response(null, { status: 409 }),
      });
      render(<AppDetail appId="app-1" />);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: 'Create key' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        code === 'gateway-disabled'
          ? 'New apps and keys are paused'
          : 'No API gateway is connected',
      );
      expect(screen.getByRole('alert')).not.toHaveTextContent('5 active keys');
      expect(mocks.setReveal).not.toHaveBeenCalled();
    },
  );
});

it.each([true, false])(
  'offers Try this API for every subscription with active keys=%s',
  async (active) => {
    const subscriptions = ['orders', 'returns', 'sample'].map((slug) => ({
      apiId: slug,
      slug,
      title: `${slug} API`,
    }));
    mocks.get.mockResolvedValue({
      data: { ...app, subscriptions, credentials: active ? [credential] : [] },
    });
    render(<AppDetail appId="app-1" />);
    expect(
      await screen.findByRole('link', { name: 'My apps' }),
    ).toHaveAttribute('href', '/dashboard');
    const list = within(screen.getByRole('list'));
    expect(list.getAllByRole('listitem')).toHaveLength(3);
    expect(list.getAllByRole('link')).toHaveLength(3);
    for (const subscription of subscriptions) {
      expect(
        list.getByRole('link', { name: `Try this API: ${subscription.title}` }),
      ).toHaveAttribute('href', `/apis/${subscription.slug}`);
    }
    expect(screen.queryByText('View reference')).not.toBeInTheDocument();
    expect(!!screen.queryByRole('heading', { name: 'Try your key' })).toBe(
      active,
    );
  },
);

it('keeps Create key focusable and prevents creation until email verification', async () => {
  mocks.portalUser = {
    email: 'ana@example.com',
    emailVerified: false,
    verificationRequired: true,
  };
  const actor = userEvent.setup();
  render(<AppDetail appId="app-1" />);
  const button = await screen.findByRole('button', { name: 'Create key' });
  await waitFor(() => expect(button).not.toBeDisabled());
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toHaveAccessibleDescription(
    'Verify your email address first. Use the button at the top of the page.',
  );
  await actor.click(button);
  expect(mocks.post).not.toHaveBeenCalled();
});

it('JSO-161 returns focus to the initiating Revoke button after Escape', async () => {
  const user = userEvent.setup();
  render(<AppDetail appId="app-1" />);
  const revoke = await screen.findByRole('button', { name: 'Revoke' });
  await user.click(revoke);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(revoke).toHaveFocus());
});
it('enforces the single active key rule on product subscriptions without hiding regeneration', async () => {
  mocks.get.mockResolvedValue({
    data: {
      ...app,
      role: 'member',
      plan: {
        id: 'free',
        name: 'Free',
        builtin: false,
        product: { id: 'orders', slug: 'orders', name: 'Orders' },
        rateLimit: 5,
        rateLimitUnit: 'second',
        monthlyQuota: 10000,
      },
    },
  });
  render(<AppDetail appId="app-1" />);
  expect(
    await screen.findByRole('button', { name: /Regenerate key/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /New key|Create key/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/5 requests per second/)).toBeInTheDocument();
});
