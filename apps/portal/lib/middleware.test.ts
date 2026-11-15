// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let middleware: typeof import('../middleware').middleware;

const { createAuthClient, createSdkClient, getSession, getSetup } = vi.hoisted(
  () => ({
    createAuthClient: vi.fn(),
    createSdkClient: vi.fn(),
    getSession: vi.fn(),
    getSetup: vi.fn(),
  }),
);
vi.mock('@portal/sdk', () => ({ createClient: createSdkClient }));
vi.mock('better-auth/client', () => ({
  createAuthClient,
}));

describe('protected portal routes', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    createAuthClient.mockReturnValue({ getSession });
    createSdkClient.mockReturnValue({ GET: getSetup });
    vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
    getSetup.mockResolvedValue({
      data: { adminRequired: false, setupTokenRequired: false },
    });
    vi.resetModules();
    middleware = (await import('../middleware')).middleware;
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each(['/', '/sign-in', '/sign-up', '/admin/apis', '/setup/gateway'])(
    'redirects %s to setup before an admin exists',
    async (path) => {
      getSetup.mockResolvedValue({ data: { adminRequired: true } });
      const response = await middleware(
        new NextRequest(`https://portal.example${path}`),
      );
      expect(new URL(response.headers.get('location')!).pathname).toBe(
        '/setup',
      );
      expect(getSession).not.toHaveBeenCalled();
    },
  );
  it('caches completion and redirects setup home', async () => {
    await middleware(new NextRequest('https://portal.example/'));
    const response = await middleware(
      new NextRequest('https://portal.example/setup'),
    );
    expect(getSetup).toHaveBeenCalledTimes(1);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/');
  });
  it('leaves public pages available during a server outage', async () => {
    getSetup.mockRejectedValue(new Error('offline'));
    expect(
      (await middleware(new NextRequest('https://portal.example/'))).status,
    ).toBe(200);
    expect(
      (await middleware(new NextRequest('https://portal.example/admin/apis')))
        .status,
    ).toBe(503);
  });
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

  it('reads the server URL at request time', async () => {
    vi.stubEnv('SERVER_URL', 'http://runtime-server.example:4400');
    getSession.mockResolvedValue({ data: { user: { role: 'developer' } } });
    await middleware(new NextRequest('https://portal.example/dashboard'));
    expect(createSdkClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://runtime-server.example:4400/api',
      }),
    );
    expect(createAuthClient).toHaveBeenCalledWith({
      baseURL: 'http://runtime-server.example:4400',
    });
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

  it('allows a non-admin to reach the Insights permission screen', async () => {
    getSession.mockResolvedValue({ data: { user: { role: 'developer' } } });
    const response = await middleware(
      new NextRequest('https://portal.example/admin/insights'),
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

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
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://portal.example/unavailable',
    );
  });
});
