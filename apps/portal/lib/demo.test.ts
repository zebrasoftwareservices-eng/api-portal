// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { isDemo } from './demo';
import { demoData } from './demo-data';
import { loadSampleDocument } from './demo-build';
import { currentUser } from './server';
const { cookies, createClient } = vi.hoisted(() => ({
  cookies: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies }));
vi.mock('@portal/sdk', () => ({ createClient }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it('only reads the baked flag, regardless of runtime deployment settings', () => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  expect(isDemo()).toBe(false);
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  expect(isDemo()).toBe(true);
});
it('derives the catalog from the inlined seed without invented fields', async () => {
  const document = await loadSampleDocument();
  vi.stubEnv('PORTAL_DEMO_SAMPLE_API', JSON.stringify(document));
  const data = demoData();
  expect(data.document).toEqual(document);
  expect(data.api).toEqual({
    slug: 'sample',
    ...data.document.info,
    gatewayBaseUrl: data.document.servers[0]!.url,
  });
});
it('does not create a client or read cookies in demo mode', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  expect(await currentUser()).toBeNull();
  expect(cookies).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
});
it('keeps a server outage signed out without enabling demo mode', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  cookies.mockRejectedValue(new Error('unavailable'));
  expect(await currentUser()).toBeNull();
  expect(isDemo()).toBe(false);
});
