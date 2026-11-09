// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from 'vitest';
import { KongAdapter } from './index.js';
const root = {
  tagline: 'Welcome to kong',
  version: '3.9.4',
  configuration: { database: 'postgres' },
};
const adapter = (fetcher: typeof fetch) =>
  new KongAdapter({
    adminUrl: 'http://kong/admin-api',
    adminToken: 'unique-secret',
    instanceId: 'instance',
    fetch: fetcher,
  });
it.each([
  [401, '', 'refused'],
  [403, '', 'refused'],
  [500, '', 'unreachable'],
  [302, '', 'not-gateway'],
  [404, '', 'not-gateway'],
  [200, 'not json', 'not-gateway'],
  [200, JSON.stringify({ version: '3' }), 'not-gateway'],
  [
    200,
    JSON.stringify({ ...root, configuration: { database: 'off' } }),
    'read-only',
  ],
  [
    200,
    JSON.stringify({ ...root, configuration: { role: 'data_plane' } }),
    'read-only',
  ],
])('maps %s to a fixed outcome %s', async (status, body, outcome) => {
  expect(
    await adapter(async () => new Response(body, { status })).checkConnection(),
  ).toEqual({ outcome });
});
it('checks Kong without redirects and never sends the admin token to the proxy', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(root));
  const a = adapter(fetcher);
  expect(await a.checkConnection()).toEqual({
    outcome: 'ok',
    version: '3.9.4',
  });
  expect(fetcher.mock.calls[0]?.[0]).toBe('http://kong/admin-api/');
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    redirect: 'manual',
    headers: { 'Kong-Admin-Token': 'unique-secret' },
  });
  expect(await a.checkProxy('http://kong:8000')).toBe(true);
  expect(fetcher.mock.calls[1]?.[1]?.headers).toBeUndefined();
});
it('refuses oversized streamed bodies and network errors', async () => {
  expect(
    await adapter(
      async () => new Response('x'.repeat(1024 * 1024 + 1)),
    ).checkConnection(),
  ).toEqual({ outcome: 'not-gateway' });
  const a = adapter(async () => {
    throw new Error('echo unique-secret');
  });
  expect(await a.checkConnection()).toEqual({ outcome: 'unreachable' });
  expect(await a.checkProxy('http://kong:8000')).toBe(false);
});

it('maps a timeout while reading the Admin API body to unreachable', async () => {
  const a = adapter(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new DOMException('timeout', 'TimeoutError'));
          },
        }),
      ),
  );
  expect(await a.checkConnection()).toEqual({ outcome: 'unreachable' });
});
