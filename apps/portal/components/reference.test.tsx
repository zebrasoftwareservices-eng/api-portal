// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Reference } from './reference';

const { scalar, get } = vi.hoisted(() => ({ scalar: vi.fn(), get: vi.fn() }));
vi.mock('next/dynamic', () => ({
  default: () => (props: unknown) => {
    scalar(props);
    return null;
  },
}));
vi.mock('../lib/client', () => ({
  api: { GET: get },
  networkProblem: vi.fn(),
}));

it('uses the SDK document with safe display examples for the live reference', async () => {
  const document = {
    paths: {
      '/post': {
        post: {
          requestBody: { content: { 'application/json': { schema: {} } } },
        },
      },
    },
  };
  get.mockResolvedValue({ data: document });
  render(<Reference documentUrl="/api/v1/apis/sample/openapi.json" />);
  await waitFor(() => expect(scalar).toHaveBeenCalled());
  expect(get).toHaveBeenCalledWith('/v1/apis/{slug}/openapi.json', {
    params: { path: { slug: 'sample' } },
  });
  expect(scalar.mock.lastCall?.[0].configuration).toMatchObject({
    content: {
      paths: {
        '/post': {
          post: {
            requestBody: {
              content: { 'application/json': { schema: {}, example: {} } },
            },
          },
        },
      },
    },
    proxyUrl: '/api/v1/try-it',
  });
  expect(scalar.mock.lastCall?.[0].configuration).not.toHaveProperty('url');
  expect(
    document.paths['/post'].post.requestBody.content['application/json'],
  ).not.toHaveProperty('example');
});

it('uses the per-version SDK operation rather than inferring a slug from the document URL', async () => {
  get.mockResolvedValue({ data: {} });
  render(
    <Reference
      documentUrl="/api/v1/apis/orders/versions/1.0.0%2Bbuild.1/openapi.json"
      slug="orders"
      version="1.0.0+build.1"
    />,
  );
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith(
      '/v1/apis/{slug}/versions/{version}/openapi.json',
      { params: { path: { slug: 'orders', version: '1.0.0+build.1' } } },
    ),
  );
});

it('uses an already loaded version document without fetching it again', async () => {
  get.mockClear();
  scalar.mockClear();
  render(
    <Reference
      documentUrl="/api/v1/apis/orders/versions/1/openapi.json"
      slug="orders"
      version="1"
      initialDocument={{ openapi: '3.1.0' }}
    />,
  );
  await waitFor(() => expect(scalar).toHaveBeenCalled());
  expect(get).not.toHaveBeenCalled();
});

it('mounts the trace panel when Try it uses the page fetch', async () => {
  const original = globalThis.fetch;
  const windowFetch = window.fetch;
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const traced = new Response('{"ok":true}', {
    status: 200,
    headers: {
      'X-Portal-Trace-State': 'traced',
      'X-Portal-Trace-Id': traceId,
    },
  });
  globalThis.fetch = vi.fn().mockResolvedValue(traced);
  window.fetch = globalThis.fetch;
  get.mockImplementation(async (path: string) => {
    if (String(path).includes('try-it/traces')) {
      return {
        data: {
          traceId,
          state: 'waiting',
          issuedAt: '2026-11-22T00:00:00.000Z',
          trace: null,
        },
        response: { status: 200 },
      };
    }
    return { data: { openapi: '3.1.0' } };
  });
  const view = render(
    <Reference
      documentUrl="/api/v1/apis/sample/openapi.json"
      slug="sample"
      initialDocument={{ openapi: '3.1.0' }}
    />,
  );
  try {
    await waitFor(() => expect(scalar).toHaveBeenCalled());
    await globalThis.fetch(
      new Request(`http://localhost/api/v1/try-it?scalar_url=http://kong/sample/get`),
    );
    expect(await screen.findByRole('heading', { name: 'Trace' })).toBeVisible();
    expect(screen.getByText(/Waiting for the trace from Kong/)).toBeVisible();
  } finally {
    view.unmount();
    globalThis.fetch = original;
    window.fetch = windowFetch;
    get.mockReset();
  }
});
