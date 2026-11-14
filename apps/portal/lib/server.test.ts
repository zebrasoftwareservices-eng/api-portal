// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { currentUser, serverClient } from './server';
const { createSdkClient, get, middleware } = vi.hoisted(() => ({
  createSdkClient: vi.fn(),
  get: vi.fn(),
  middleware: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => '' }),
}));
vi.mock('@portal/sdk', () => ({
  createClient: createSdkClient,
}));
beforeEach(() => {
  vi.clearAllMocks();
  createSdkClient.mockReturnValue({ GET: get, use: middleware });
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
});
afterEach(() => vi.unstubAllEnvs());
it.each([401, 500, 503])(
  'JSO-191 distinguishes unknown session from signed-out on %i',
  async (status) => {
    get.mockResolvedValue({ response: { status } });
    expect(await currentUser()).toEqual({
      state: status === 401 ? 'signed-out' : 'unknown',
    });
  },
);
it('retains a known signed-in user', async () => {
  get.mockResolvedValue({
    data: { id: 'developer' },
    response: { status: 200 },
  });
  expect(await currentUser()).toEqual({
    state: 'signed-in',
    user: { id: 'developer' },
  });
});
it('JSO-190 marks network and server errors so production error boundaries recognize them', async () => {
  await serverClient();
  const handlers = middleware.mock.lastCall![0];
  expect(() => handlers.onError()).toThrow(
    expect.objectContaining({ digest: 'PORTAL_SERVER_UNAVAILABLE' }),
  );
  expect(() =>
    handlers.onResponse({ response: new Response(null, { status: 503 }) }),
  ).toThrow(expect.objectContaining({ digest: 'PORTAL_SERVER_UNAVAILABLE' }));
});
it('reads the server URL at request time', async () => {
  vi.stubEnv('SERVER_URL', 'http://runtime-server.example:4400');
  await serverClient();
  expect(createSdkClient).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: 'http://runtime-server.example:4400/api',
    }),
  );
});
