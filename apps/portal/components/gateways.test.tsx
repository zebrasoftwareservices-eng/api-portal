// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayCard, Gateways, GatewayStatusBadge } from './gateways';
import type { Gateway } from '../lib/types';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  changed: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('../lib/client', () => ({
  api: {
    GET: mocks.get,
    POST: mocks.post,
    PATCH: mocks.patch,
    DELETE: mocks.del,
  },
  retrySeconds: () => 0,
  networkProblem: () => ({
    type: '/network',
    title: 'Network unavailable',
    status: 0,
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
const gateway: Gateway = {
  id: 'gw',
  kind: 'kong',
  adminUrl: 'http://kong:8001',
  proxyInternalUrl: 'http://kong:8000',
  proxyPublicUrl: 'http://localhost:8000',
  hasAdminToken: true,
  enabled: true,
  managedBy: 'admin',
  sampleAvailable: true,
  createdAt: '2026-11-07T00:00:00Z',
  updatedAt: '2026-11-07T00:00:00Z',
};
describe('gateway management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue({
      data: { gateway: { reachable: true, version: '3.9' } },
    });
  });
  it('hides all mutation actions for an environment-managed gateway', async () => {
    render(
      <GatewayCard
        gateway={{ ...gateway, managedBy: 'env' }}
        onChanged={mocks.changed}
      />,
    );
    expect(await screen.findByText('Set by environment')).toBeInTheDocument();
    for (const name of ['Edit', 'Disable', 'Enable', 'Remove'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });
  it('keeps a failed re-enable disabled and offers Edit connection', async () => {
    mocks.patch.mockResolvedValue({
      error: {
        type: '/problems/gateway-unreachable',
        title: "The portal couldn't reach that address",
        detail: 'Check the Admin API URL.',
        status: 422,
      },
      response: new Response(null, { status: 422 }),
    });
    render(
      <GatewayCard
        gateway={{ ...gateway, enabled: false }}
        onChanged={mocks.changed}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Enable' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The gateway stays disabled.',
    );
    expect(screen.getByText('○ Disabled')).toBeInTheDocument();
    expect(mocks.changed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Edit connection' }));
    expect(
      screen.getByRole('heading', { name: 'Edit connection' }),
    ).toBeInTheDocument();
  });
  it('requires Disable confirmation and sends only enabled false', async () => {
    mocks.patch.mockResolvedValue({ data: { ...gateway, enabled: false } });
    render(<GatewayCard gateway={gateway} onChanged={mocks.changed} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus();
    expect(dialog).toHaveTextContent('Existing keys keep working');
    await user.click(
      within(dialog).getByRole('button', { name: 'Disable gateway' }),
    );
    expect(mocks.patch).toHaveBeenCalledWith('/v1/admin/gateways/{gatewayId}', {
      params: { path: { gatewayId: 'gw' } },
      body: { enabled: false },
    });
    expect(mocks.changed).toHaveBeenCalled();
  });
  it('keeps removal refusal in the dialog with dependency counts', async () => {
    mocks.del.mockResolvedValue({
      error: {
        type: '/problems/gateway-in-use',
        status: 409,
        title: 'This gateway is still in use',
        apis: 2,
        activeKeys: 3,
      },
      response: new Response(null, { status: 409 }),
    });
    render(<GatewayCard gateway={gateway} onChanged={mocks.changed} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove gateway' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      '2 published APIs and 3 active keys depend on it. Nothing was removed.',
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove gateway' }),
    ).not.toBeInTheDocument();
  });
  it('treats null health as Enabled and prioritizes disabled status', () => {
    const { rerender } = render(
      <GatewayStatusBadge enabled health={null} loading={false} />,
    );
    expect(screen.getByText('● Enabled')).toBeInTheDocument();
    rerender(
      <GatewayStatusBadge
        enabled={false}
        health={{ kind: 'kong', reachable: true }}
        loading={false}
      />,
    );
    expect(screen.getByText('○ Disabled')).toBeInTheDocument();
  });
  it.each([false, true])(
    'offers sample only when saved gateway permits it: %s',
    async (available) => {
      mocks.get.mockResolvedValue({ data: { items: [], bundled: gateway } });
      mocks.post
        .mockResolvedValueOnce({
          data: { ...gateway, sampleAvailable: available },
        })
        .mockResolvedValue({
          error: {
            type: '/problems/gateway-disabled',
            title: 'Gateway disabled',
            status: 409,
          },
          response: new Response(null, { status: 409 }),
        });
      render(<Gateways setup />);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: 'Save connection' }),
      );
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          'Kong is connected.',
        ),
      );
      if (available) {
        await user.click(
          screen.getByRole('button', { name: 'Publish the sample API' }),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Enable it in Admin → Gateways to publish the sample. Nothing was published.',
        );
        expect(
          screen.getByRole('link', { name: 'Continue without it' }),
        ).toBeInTheDocument();
      } else {
        expect(
          screen.queryByRole('button', { name: 'Publish the sample API' }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole('link', { name: 'Import an API' }),
        ).toBeInTheDocument();
      }
    },
  );
});
