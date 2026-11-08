// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, it, vi } from 'vitest';
import {
  accessAction,
  accessFromApps,
  checkAccess,
  recoverySentence,
  type Access,
} from './access';
import type { App } from './types';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./client', () => ({ quietApi: { GET: get } }));
const app = {
  id: 'one',
  name: 'Worker',
  subscriptions: [{ slug: 'orders' }],
  credentials: [{ status: 'revoked' }],
} as App;
beforeEach(() => vi.resetAllMocks());
it('matches subscriptions regardless of active keys and preserves the app identity', () => {
  expect(accessFromApps([], 'orders')).toEqual({ kind: 'none' });
  expect(accessFromApps([app], 'other')).toEqual({ kind: 'none' });
  expect(accessFromApps([app], 'orders')).toEqual({
    kind: 'one',
    app: { id: 'one', name: 'Worker' },
  });
  expect(accessFromApps([app, { ...app, id: 'two' }], 'orders')).toEqual({
    kind: 'several',
  });
});
it.each([
  [
    { kind: 'signed-out' },
    'Get an API key',
    '/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dorders',
    'If you get a 403, select Get an API key to create an app that includes this API.',
  ],
  [
    { kind: 'none' },
    'Get an API key',
    '/dashboard/apps/new?api=orders',
    'If you get a 403, select Get an API key to create an app that includes this API.',
  ],
  [
    { kind: 'one', app },
    'Open in Worker',
    '/dashboard/apps/one',
    'If you get a 403, select Open in Worker and use one of its active keys.',
  ],
  [
    { kind: 'several' },
    'View your apps',
    '/dashboard?api=orders',
    'If you get a 403, select View your apps and use a key from an app with access.',
  ],
  [
    { kind: 'checking' },
    null,
    null,
    'If you get a 403, use a key from an app that includes this API.',
  ],
  [
    { kind: 'failed' },
    null,
    null,
    'If you get a 403, use a key from an app that includes this API.',
  ],
] as const)(
  'maps %j to its exact action and recovery copy',
  (access, label, href, sentence) => {
    expect(accessAction(access as Access, 'orders')).toEqual(
      label ? { label, href } : null,
    );
    expect(recoverySentence(access as Access)).toBe(sentence);
  },
);
it.each([401, 403, 429, 500, 503, 201])(
  'handles response %s without global middleware',
  async (status) => {
    get.mockResolvedValue({ response: { status }, data: { items: [app] } });
    expect(await checkAccess('orders', new AbortController().signal)).toEqual({
      kind: status === 401 ? 'signed-out' : 'failed',
    });
  },
);
it.each([undefined, {}, { items: null }, { items: [{}] }])(
  'rejects unreadable 200 data %j',
  async (data) => {
    get.mockResolvedValue({ response: { status: 200 }, data });
    expect(await checkAccess('orders', new AbortController().signal)).toEqual({
      kind: 'failed',
    });
  },
);
it('uses the quiet generated client with a signal and no cache', async () => {
  const signal = new AbortController().signal;
  get.mockResolvedValue({ response: { status: 200 }, data: { items: [app] } });
  expect((await checkAccess('orders', signal)).kind).toBe('one');
  expect(get).toHaveBeenCalledWith('/v1/apps', { signal, cache: 'no-store' });
});
it('handles network errors and ignores an aborted response', async () => {
  get.mockRejectedValueOnce(new TypeError('network'));
  expect(await checkAccess('orders', new AbortController().signal)).toEqual({
    kind: 'failed',
  });
  const controller = new AbortController();
  controller.abort();
  get.mockResolvedValue({ response: { status: 200 }, data: { items: [app] } });
  expect(await checkAccess('orders', controller.signal)).toEqual({
    kind: 'failed',
  });
});
