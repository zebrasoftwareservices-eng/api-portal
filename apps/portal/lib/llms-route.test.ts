// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '../app/llms.txt/route';
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('forwards the anonymous text and cache headers through the generated client', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  vi.stubEnv('SERVER_URL', 'https://server.example');
  const fetch = vi.fn(async (request: Request) => {
    expect(request.url).toBe('https://server.example/api/v1/llms.txt');
    expect(request.credentials).toBe('omit');
    expect(request.headers.has('cookie')).toBe(false);
    expect(request.headers.has('apikey')).toBe(false);
    return new Response('# Developer Portal\n', {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=60',
      },
    });
  });
  vi.stubGlobal('fetch', fetch);
  const response = await GET();
  expect(await response.text()).toBe('# Developer Portal\n');
  expect(response.headers.get('content-type')).toBe(
    'text/plain; charset=utf-8',
  );
  expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  expect(fetch).toHaveBeenCalledOnce();
});
it('returns the designed 503 text when the server cannot be reached', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get('content-type')).toBe(
    'text/plain; charset=utf-8',
  );
  expect(await response.text()).toBe('The portal is starting or unavailable.');
});
it('preserves an upstream error status and text', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('Unavailable', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      }),
    ),
  );
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('Unavailable');
});
it('uses the default not-found response in demo builds without calling the server', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(GET()).rejects.toThrow('NOT_FOUND');
  expect(fetch).not.toHaveBeenCalled();
});
