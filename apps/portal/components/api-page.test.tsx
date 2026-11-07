// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ApiPage from '../app/apis/[slug]/page';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/server', () => ({
  serverClient: async () => ({ GET: get }),
  currentUser: async () => null,
}));
vi.mock('./reference', () => ({ Reference: () => <div>API reference</div> }));

it('explains the auth selector and Value field without assuming an apikey field (JSO-281)', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  get.mockResolvedValue({
    data: {
      title: 'Orders API',
      version: '1.0.0',
      gatewayBaseUrl: 'http://localhost:8000/orders',
      documentUrl: '/api/v1/apis/orders/openapi.json',
    },
  });
  try {
    render(await ApiPage({ params: Promise.resolve({ slug: 'orders' }) }));
    expect(screen.getByText(/To try a request/)).toHaveTextContent(
      "ⓘ To try a request, go to Authentication and paste a key from an app that includes this API into the Value field. If you see Select Auth Type instead, open it and choose this API's key scheme first. Then choose an operation and select Send. If you get a 403, select Get an API key to create an app that includes it.",
    );
    expect(
      screen.getByRole('link', { name: 'Get an API key' }),
    ).toHaveAttribute(
      'href',
      '/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dorders',
    );
    expect(get).toHaveBeenCalledWith('/v1/apis/{slug}', {
      params: { path: { slug: 'orders' } },
    });
  } finally {
    vi.unstubAllEnvs();
  }
});
