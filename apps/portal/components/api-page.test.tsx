// SPDX-License-Identifier: Apache-2.0
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ApiPage from '../app/apis/[slug]/page';

const { get, user, apps, referenceRender } = vi.hoisted(() => ({
  get: vi.fn(),
  user: vi.fn().mockResolvedValue(null),
  apps: vi.fn(),
  referenceRender: vi.fn(),
}));
vi.mock('../lib/server', () => ({
  serverClient: async () => ({ GET: get }),
  signedInUser: user,
}));
vi.mock('../lib/client', () => ({ quietApi: { GET: apps } }));
vi.mock('./reference', () => ({
  Reference: () => {
    referenceRender();
    return <input aria-label="Reference value" />;
  },
}));

it('explains the auth selector and Value field without assuming an apikey field (JSO-281)', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  get.mockResolvedValue({
    data: {
      slug: 'orders',
      title: 'Orders API',
      version: '1.0.0',
      gatewayBaseUrl: 'http://localhost:8000/orders',
      documentUrl: '/api/v1/apis/orders/openapi.json',
    },
  });
  try {
    render(await ApiPage({ params: Promise.resolve({ slug: 'orders' }) }));
    expect(screen.getByText(/To try a request/)).toHaveTextContent(
      "ⓘ To try a request, go to Authentication and paste a key from an app that includes this API into the Value field. If you see Select Auth Type instead, open it and choose this API's key scheme first. Then choose an operation and select Send. If you get a 403, select Get an API key to create an app that includes this API.",
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

it('uses the canonical slug, renders reference before access resolves, and preserves its render and input', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  user.mockResolvedValueOnce({ id: 'developer' });
  get.mockResolvedValue({
    data: {
      slug: 'orders',
      title: 'Orders API',
      version: '1',
      gatewayBaseUrl: 'https://gateway.example/orders',
      documentUrl: '/api/v1/apis/orders/openapi.json',
    },
  });
  let resolve!: (value: unknown) => void;
  apps.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  referenceRender.mockClear();
  try {
    render(await ApiPage({ params: Promise.resolve({ slug: 'route-alias' }) }));
    expect(
      screen.getByRole('heading', { name: 'Orders API' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Get an API key' }),
    ).not.toBeInTheDocument();
    const reference = screen.getByLabelText(
      'Reference value',
    ) as HTMLInputElement;
    reference.value = 'existing-key';
    await act(async () =>
      resolve({ response: { status: 200 }, data: { items: [] } }),
    );
    expect(
      screen.getByRole('link', { name: 'Get an API key' }),
    ).toHaveAttribute('href', '/dashboard/apps/new?api=orders');
    expect(referenceRender).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Reference value')).toBe(reference);
    expect(reference).toHaveValue('existing-key');
  } finally {
    vi.unstubAllEnvs();
  }
});
