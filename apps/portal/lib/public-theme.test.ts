// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PUBLIC_THEME } from './theme';

const createClient = vi.hoisted(() => vi.fn());
vi.mock('@portal/sdk', () => ({ createClient }));

import { fetchPublicTheme } from './public-theme';

afterEach(() => {
  createClient.mockReset();
  delete process.env.PORTAL_DEMO_ACTIVE;
  delete process.env.SERVER_URL;
  vi.useRealTimers();
});

describe('fetchPublicTheme', () => {
  it('uses the default theme in demo mode without calling the server', async () => {
    process.env.PORTAL_DEMO_ACTIVE = 'true';
    await expect(fetchPublicTheme()).resolves.toEqual(DEFAULT_PUBLIC_THEME);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('requests /v1/theme with no-store and prefixes asset urls', async () => {
    process.env.SERVER_URL = 'http://server.test';
    createClient.mockReturnValue({
      GET: vi.fn().mockResolvedValue({
        response: { ok: true },
        data: {
          isDefault: false,
          etag: 'abc',
          defaultMode: 'dark',
          font: 'inter',
          stylesheetUrl: '/v1/theme.css?v=abc',
          customCssUrl: '/v1/theme/custom.css?v=abc',
          logoUrl: '/v1/theme/assets/logo?v=abc',
          faviconUrl: null,
        },
      }),
    });
    const theme = await fetchPublicTheme();
    expect(createClient).toHaveBeenCalledWith({
      baseUrl: 'http://server.test/api',
      cache: 'no-store',
    });
    expect(theme.stylesheetUrl).toBe('/api/v1/theme.css?v=abc');
    expect(theme.logoUrl).toBe('/api/v1/theme/assets/logo?v=abc');
    expect(theme.defaultMode).toBe('dark');
    expect(theme.font).toBe('inter');
  });

  it('falls back when the server answers with an error', async () => {
    createClient.mockReturnValue({
      GET: vi.fn().mockResolvedValue({ response: { ok: false }, data: undefined }),
    });
    await expect(fetchPublicTheme()).resolves.toEqual(DEFAULT_PUBLIC_THEME);
  });

  it('falls back when the request exceeds 1.5 seconds', async () => {
    vi.useFakeTimers();
    createClient.mockReturnValue({
      GET: vi.fn((_path: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      })),
    });
    const pending = fetchPublicTheme();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toEqual(DEFAULT_PUBLIC_THEME);
  });
});
