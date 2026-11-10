// SPDX-License-Identifier: Apache-2.0
import { render, waitFor } from '@testing-library/react';
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
