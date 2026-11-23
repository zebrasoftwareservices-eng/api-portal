// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PUBLIC_NAVIGATION } from './portal-nav';

const createClient = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'sid=1' }),
}));
vi.mock('@portal/sdk', async () => {
  const actual = await vi.importActual<typeof import('@portal/sdk')>('@portal/sdk');
  return { ...actual, createClient };
});

import { fetchPublicNavigation } from './navigation-server';

afterEach(() => {
  createClient.mockReset();
  delete process.env.PORTAL_DEMO_ACTIVE;
  vi.useRealTimers();
});

it('does not fetch navigation in a demo build', async () => {
  process.env.PORTAL_DEMO_ACTIVE = 'true';
  await expect(fetchPublicNavigation()).resolves.toEqual(DEFAULT_PUBLIC_NAVIGATION);
  expect(createClient).not.toHaveBeenCalled();
});

it('falls back on a 500 and on malformed JSON', async () => {
  createClient.mockReturnValue({
    GET: vi.fn().mockResolvedValue({ response: { ok: false, status: 500 }, data: undefined }),
  });
  await expect(fetchPublicNavigation()).resolves.toEqual(DEFAULT_PUBLIC_NAVIGATION);
  createClient.mockReturnValue({
    GET: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
  });
  await expect(fetchPublicNavigation()).resolves.toEqual(DEFAULT_PUBLIC_NAVIGATION);
});

it('falls back when navigation takes longer than 1.5 seconds', async () => {
  vi.useFakeTimers();
  createClient.mockReturnValue({
    GET: vi.fn((_path: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })),
  });
  const pending = fetchPublicNavigation();
  await vi.advanceTimersByTimeAsync(1500);
  await expect(pending).resolves.toEqual(DEFAULT_PUBLIC_NAVIGATION);
});
