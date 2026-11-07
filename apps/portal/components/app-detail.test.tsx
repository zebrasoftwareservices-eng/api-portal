// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDetail } from './app-detail';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
  setReveal: vi.fn(),
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
  usePortal: () => ({ setReveal: mocks.setReveal, reveal: null }),
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
describe('app keys', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue({ data: app });
  });
  it('keeps a key active after a failed revoke and only marks it revoked after retry succeeds', async () => {
    const user = userEvent.setup();
    mocks.del
      .mockResolvedValueOnce({
        error: {
          type: '/problems/gateway-unavailable',
          title: 'Gateway unavailable',
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
