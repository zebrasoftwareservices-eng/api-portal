// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from 'vitest';
const { middleware } = vi.hoisted(() => ({ middleware: vi.fn() }));
vi.mock('@portal/sdk', () => ({ createClient: () => ({ use: middleware }) }));
vi.mock('better-auth/react', () => ({ createAuthClient: () => ({}) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
import './client';
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
it('JSO-180 preserves the current app path and carries the session-ended toast across navigation', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', {
    location: { pathname: '/dashboard/apps/my-app', search: '', assign },
  });
  await middleware.mock.calls[0]![0].onResponse({
    response: new Response(null, { status: 401 }),
    schemaPath: '/v1/apps/{appId}/credentials',
  });
  expect(assign).toHaveBeenCalledWith(
    '/sign-in?next=%2Fdashboard%2Fapps%2Fmy-app',
  );
  expect(sessionStorage.getItem('portal-session-ended')).toBe('true');
});
it('keeps product permission refusals on the form so the UI can explain that nothing was saved', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { assign } });
  await middleware.mock.calls[0]![0].onResponse({
    response: new Response(JSON.stringify({ type: '/problems/forbidden' }), {
      status: 403,
    }),
    schemaPath: '/v1/admin/products/{productId}/plans',
  });
  expect(assign).not.toHaveBeenCalled();
});

it.each(['/v1/admin/insights', '/v1/admin/tracing'])(
  'leaves %s permission refusals for its no-access page',
  async (schemaPath) => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    await middleware.mock.calls[0]![0].onResponse({
      response: new Response(null, { status: 403 }),
      schemaPath,
    });
    expect(assign).not.toHaveBeenCalled();
  },
);
