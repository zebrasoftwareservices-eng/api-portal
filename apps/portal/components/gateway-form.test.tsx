// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GatewayForm,
  gatewayFieldErrors,
  normaliseGatewayUrl,
} from './gateway-form';
import type { Gateway } from '../lib/types';
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  saved: vi.fn(),
}));
vi.mock('../lib/client', () => ({
  api: { POST: mocks.post, PATCH: mocks.patch },
  retrySeconds: () => 0,
  networkProblem: () => ({
    type: '/network',
    title: 'Network unavailable',
    status: 0,
  }),
}));
export const gateway: Gateway = {
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
function mount(edit = false) {
  render(
    <GatewayForm
      mode={edit ? 'edit' : 'add'}
      gateway={edit ? gateway : undefined}
      bundled={gateway}
      onSaved={mocks.saved}
    />,
  );
}
describe('gateway connection form', () => {
  beforeEach(() => vi.resetAllMocks());
  it('tests bundled values without saving and clears the pass after editing', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({ data: { version: '3.9', warnings: [] } });
    mount();
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nothing has been saved yet.',
    );
    expect(mocks.post).toHaveBeenCalledWith('/v1/admin/gateways/test', {
      body: {
        adminUrl: gateway.adminUrl,
        proxyInternalUrl: gateway.proxyInternalUrl,
        proxyPublicUrl: gateway.proxyPublicUrl,
      },
    });
    expect(mocks.saved).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Public proxy URL'), '/changed');
    expect(
      screen.queryByText(/Nothing has been saved yet/),
    ).not.toBeInTheDocument();
  });
  it('saves without requiring Test and omits an empty token on add', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({ data: gateway });
    mount();
    await user.click(screen.getByRole('button', { name: 'Save connection' }));
    expect(mocks.post.mock.calls[0]![0]).toBe('/v1/admin/gateways');
    expect(mocks.post.mock.calls[0]![1].body).not.toHaveProperty('adminToken');
    expect(mocks.saved).toHaveBeenCalledWith(gateway);
  });
  it('retains a typed token on failure and focuses the field', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({
      error: {
        type: '/problems/gateway-token-refused',
        title: 'Kong refused the token',
        detail: 'Check the token.',
        status: 422,
      },
      response: new Response(null, { status: 422 }),
    });
    mount();
    await user.type(
      screen.getByLabelText('Admin API token (optional)'),
      'private-token',
    );
    await user.click(screen.getByRole('button', { name: 'Save connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was saved.',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Admin API token (optional)')).toHaveFocus(),
    );
    expect(screen.getByLabelText('Admin API token (optional)')).toHaveValue(
      'private-token',
    );
    expect(screen.getByText('⚠ Kong refused this token.')).toBeInTheDocument();
  });
  it('keeps the stored token on Test and sends null only after explicit selection', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({ data: { version: '3.9', warnings: [] } });
    mocks.patch.mockResolvedValue({ data: gateway });
    mount(true);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(mocks.post.mock.calls[0]![1].body).toMatchObject({
      gatewayId: gateway.id,
    });
    expect(mocks.post.mock.calls[0]![1].body).not.toHaveProperty('adminToken');
    await user.click(screen.getByLabelText('This Kong needs no token'));
    expect(screen.getByLabelText('Admin API token (optional)')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save connection' }));
    expect(mocks.patch).toHaveBeenCalledWith('/v1/admin/gateways/{gatewayId}', {
      params: { path: { gatewayId: gateway.id } },
      body: { adminToken: null },
    });
  });
  it('requires explicit missing-key confirmation and decline makes no request', async () => {
    const user = userEvent.setup();
    mocks.patch
      .mockResolvedValueOnce({
        error: {
          type: '/problems/gateway-keys-missing',
          title: 'Some keys will not work',
          status: 409,
          affectedKeys: 3,
        },
        response: new Response(null, { status: 409 }),
      })
      .mockResolvedValue({ data: gateway });
    mount(true);
    await user.clear(screen.getByLabelText('Admin API URL'));
    await user.type(
      screen.getByLabelText('Admin API URL'),
      'http://new-kong:8001',
    );
    await user.type(
      screen.getByLabelText('Admin API token (optional)'),
      'new-token',
    );
    await user.click(screen.getByRole('button', { name: 'Save connection' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      '3 active keys',
    );
    await user.click(
      screen.getByRole('button', { name: 'Keep current connection' }),
    );
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Admin API URL')).toHaveValue(
      'http://new-kong:8001',
    );
    mocks.patch.mockResolvedValueOnce({
      error: {
        type: '/problems/gateway-keys-missing',
        status: 409,
        affectedKeys: 3,
      },
      response: new Response(null, { status: 409 }),
    });
    await user.click(screen.getByRole('button', { name: 'Save connection' }));
    await user.click(
      await screen.findByRole('button', { name: 'Save anyway' }),
    );
    expect(mocks.patch.mock.calls.at(-1)?.[1].body.confirmMissingKeys).toBe(
      true,
    );
  });
  it.each([
    ['gateway-unreachable', 'adminUrl'],
    ['gateway-token-refused', 'adminToken'],
    ['gateway-not-kong', 'adminUrl'],
    ['gateway-read-only', 'adminUrl'],
    ['gateway-proxy-unreachable', 'proxyInternalUrl'],
    ['gateway-token-required', 'adminToken'],
  ])('maps %s to %s', (code, field) => {
    expect(
      Object.keys(
        gatewayFieldErrors({
          type: `/problems/${code}`,
          status: 422,
          title: 'failed',
        }),
      ),
    ).toEqual([field]);
  });
  it('compares normalized origins and paths', () => {
    expect(normaliseGatewayUrl('HTTP://KONG:80/admin/')).toBe(
      normaliseGatewayUrl('http://kong/admin'),
    );
  });
});
