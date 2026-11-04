// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminApis } from './admin-apis';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/client', () => ({
  api: { GET: mocks.get, POST: mocks.post },
  retrySeconds: () => 0,
  networkProblem: () => ({
    status: 0,
    title: 'Network failure',
    type: '/network',
  }),
}));
describe('admin import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: path.includes('services')
          ? {
              items: [
                {
                  id: 'svc',
                  name: 'sample-svc',
                  routes: [{ id: 'route', paths: ['/sample'] }],
                  keyAuth: true,
                },
              ],
            }
          : path.includes('health')
            ? { gateway: { reachable: true } }
            : { items: [] },
      }),
    );
  });
  it('submits URL source and shows the first validation error without losing form values', async () => {
    const user = userEvent.setup();
    const detail =
      "Invalid OpenAPI document: must have required property 'info' at /";
    mocks.post.mockResolvedValue({
      error: {
        status: 422,
        type: '/problems/invalid-openapi',
        title: 'Invalid OpenAPI',
        detail,
        errors: [{ pointer: '/', message: 'Missing info' }],
      },
      response: new Response(null, { status: 422 }),
    });
    render(<AdminApis />);
    await user.click(screen.getByLabelText('From a URL'));
    await user.type(
      screen.getByLabelText('Document URL'),
      'https://example.com/openapi.yaml',
    );
    await user.selectOptions(
      await screen.findByLabelText('Kong service'),
      'svc',
    );
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(detail);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nothing was published.',
    );
    expect(screen.getByLabelText('Document URL')).toHaveValue(
      'https://example.com/openapi.yaml',
    );
    expect(mocks.post).toHaveBeenCalledWith('/v1/admin/apis', {
      body: {
        spec: { url: 'https://example.com/openapi.yaml' },
        gatewayServiceId: 'svc',
      },
    });
  });
  it('reads files as content, resets after publishing and links to the reference', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({
      data: { id: 'api', title: 'Orders', slug: 'orders' },
      response: new Response(null, { status: 201 }),
    });
    render(<AdminApis />);
    const file = new File(['openapi: 3.1.0'], 'orders.yaml', {
      type: 'application/yaml',
    });
    Object.defineProperty(file, 'text', {
      value: async () => 'openapi: 3.1.0',
    });
    await user.upload(screen.getByLabelText('OpenAPI file'), file);
    await user.selectOptions(screen.getByLabelText('Kong service'), 'svc');
    await user.click(
      screen.getByRole('button', { name: 'Import and publish' }),
    );
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/v1/admin/apis', {
        body: { spec: { content: 'openapi: 3.1.0' }, gatewayServiceId: 'svc' },
      }),
    );
    expect(
      await screen.findByRole('link', { name: 'View Orders' }),
    ).toHaveAttribute('href', '/apis/orders');
    expect(screen.getByLabelText('Kong service')).toHaveValue('');
  });
});
