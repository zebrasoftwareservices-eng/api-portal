// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from '../middleware';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('better-auth/client', () => ({
  createAuthClient: () => ({ getSession }),
}));

describe('protected portal routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('skips session requests for gated demo routes', async () => {
    vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
    const response = await middleware(
      new NextRequest('https://portal.example/admin/apis'),
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('preserves the requested path and API preselection when signing in', async () => {
    getSession.mockResolvedValue({ data: null });
    const response = await middleware(
      new NextRequest('https://portal.example/dashboard/apps/new?api=sample'),
    );
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('next')).toBe(
      '/dashboard/apps/new?api=sample',
    );
  });

  it('forwards the session cookie when allowing a developer dashboard', async () => {
    getSession.mockResolvedValue({ data: { user: { role: 'developer' } } });
    const response = await middleware(
      new NextRequest('https://portal.example/dashboard', {
        headers: { cookie: 'session=example' },
      }),
    );
    expect(getSession).toHaveBeenCalledWith({
      fetchOptions: { headers: { cookie: 'session=example' } },
    });
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([{ role: 'developer' }, {}])(
    'returns a 404 for a non-admin %j',
    async (user) => {
      getSession.mockResolvedValue({ data: { user } });
      const response = await middleware(
        new NextRequest('https://portal.example/admin/apis'),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get('x-middleware-rewrite')).toBe(
        'https://portal.example/not-found',
      );
    },
  );

  it('allows an admin to open the import page', async () => {
    getSession.mockResolvedValue({ data: { user: { role: 'admin' } } });
    const response = await middleware(
      new NextRequest('https://portal.example/admin/apis'),
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('returns a retryable unavailable response if the session lookup throws', async () => {
    getSession.mockRejectedValue(new Error('Server unavailable'));
    const response = await middleware(
      new NextRequest('https://portal.example/dashboard'),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('Try again');
  });
});
