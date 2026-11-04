// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoEnabled, loadSampleDocument } from './demo-build';
import config from '../next.config';
afterEach(() => vi.unstubAllEnvs());
describe('build-time demo switch', () => {
  it.each([
    [{}, false],
    [{ SERVER_URL: 'http://server:4000' }, false],
    [{ VERCEL: '1' }, true],
    [{ VERCEL: '1', SERVER_URL: '' }, true],
    [{ VERCEL: '1', SERVER_URL: 'https://server.example' }, false],
    [{ PORTAL_DEMO_MODE: 'on' }, true],
    [{ PORTAL_DEMO_MODE: 'on', SERVER_URL: 'http://server:4000' }, true],
    [{ PORTAL_DEMO_MODE: 'off' }, false],
    [{ VERCEL: '0' }, false],
  ])('detects %j as %s', (env, expected) => {
    expect(demoEnabled(env)).toBe(expected);
  });
  it('inlines the original seed and gates live routes without an API proxy', async () => {
    vi.stubEnv('PORTAL_DEMO_MODE', 'on');
    const built = await config();
    expect(JSON.parse(built.env!.PORTAL_DEMO_SAMPLE_API!)).toEqual(
      await loadSampleDocument(),
    );
    expect(built.env!.PORTAL_DEMO_ACTIVE).toBe('true');
    expect(await built.rewrites!()).toEqual({
      beforeFiles: [
        '/sign-in',
        '/sign-up',
        '/dashboard/:path*',
        '/admin/:path*',
      ].map((source) => ({ source, destination: '/quickstart-required' })),
      afterFiles: [],
      fallback: [],
    });
  });
  it('keeps the live proxy and no demo data outside demo mode', async () => {
    vi.stubEnv('PORTAL_DEMO_MODE', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('SERVER_URL', 'http://server:4000');
    const built = await config();
    expect(built.env).toEqual({
      PORTAL_DEMO_ACTIVE: 'false',
      PORTAL_DEMO_SAMPLE_API: '',
    });
    expect(await built.rewrites!()).toEqual([
      { source: '/api/:path*', destination: 'http://server:4000/api/:path*' },
    ]);
  });
});
