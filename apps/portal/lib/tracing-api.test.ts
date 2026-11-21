// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, it, vi } from 'vitest';
import { tracingApi } from './tracing-api';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./client', () => ({
  api: { GET: get },
  networkProblem: () => ({ status: 0, title: 'Network error' }),
}));
const ok = new Response(null, { status: 200 });

beforeEach(() => vi.resetAllMocks());

it('lists API targets from the catalog the admin session can see, named by title', async () => {
  get.mockResolvedValue({
    data: {
      items: [
        { id: 'a1', slug: 'sample', title: 'Sample API', version: '1.0.0' },
        { id: 'a2', slug: 'internal', title: 'Internal API', version: '2.0.0' },
      ],
    },
    response: ok,
  });
  const result = await tracingApi.targets('api');
  expect(get).toHaveBeenCalledWith('/v1/apis');
  expect(result.data?.items).toEqual([
    { id: 'a1', slug: 'sample', name: 'Sample API' },
    { id: 'a2', slug: 'internal', name: 'Internal API' },
  ]);
});

it('uses the admin teams and developer search endpoints for the other kinds', async () => {
  get.mockResolvedValue({ data: { items: [] }, response: ok });
  await tracingApi.targets('team');
  await tracingApi.targets('developer', 'dana');
  expect(get).toHaveBeenNthCalledWith(1, '/v1/admin/teams');
  expect(get).toHaveBeenNthCalledWith(2, '/v1/admin/tracing/developers', {
    params: { query: { q: 'dana' } },
  });
});

it('keeps the problem when the API list fails', async () => {
  get.mockResolvedValue({
    error: { title: 'Forbidden' },
    response: new Response(null, { status: 403 }),
  });
  const result = await tracingApi.targets('api');
  expect(result.data).toBeUndefined();
  expect(result.error?.status).toBe(403);
});
