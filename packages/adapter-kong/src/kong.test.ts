// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { KongAdapter } from './index.js';
import {
  GatewayUnavailableError,
  GatewayRejectedError,
} from '@portal/adapter-sdk';
describe('Kong transport', () => {
  const config = { adminUrl: 'http://kong:8001', instanceId: 'test' };
  it('maps failures without leaking gateway bodies', async () => {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      const adapter = new KongAdapter({
        ...config,
        fetch: vi.fn().mockResolvedValue(new Response('secret', { status })),
      });
      const error = await adapter
        .ensureConsumer({ id: 'app' })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(
        status >= 500 ? GatewayUnavailableError : GatewayRejectedError,
      );
      if (status >= 500) {
        expect(error).toMatchObject({
          message: 'The API gateway is unavailable',
          cause: { message: `Kong returned ${status}` },
        });
        expect(JSON.stringify(error)).not.toContain('secret');
      }
    }
    const transportError = new Error('secret');
    const unavailable = await new KongAdapter({
      ...config,
      fetch: vi.fn().mockRejectedValue(transportError),
    })
      .ensureConsumer({ id: 'app' })
      .catch((caught: unknown) => caught);
    expect(unavailable).toBeInstanceOf(GatewayUnavailableError);
    expect(unavailable).toMatchObject({
      message: 'The API gateway is unavailable',
      cause: transportError,
    });
    expect(JSON.stringify(unavailable)).not.toContain('secret');
  });
  it('keeps a JSON parse failure as the cause', async () => {
    const error = await new KongAdapter({
      ...config,
      fetch: vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })),
    })
      .request('/status')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GatewayUnavailableError);
    expect((error as GatewayUnavailableError).cause).toBeInstanceOf(SyntaxError);
  });
  it.each(['connection reset', 'timeout'])(
    'maps a grant %s to a secret-free gateway-unavailable error',
    async (failure) => {
      const cause =
        failure === 'timeout'
          ? new DOMException('sensitive-admin-token', 'TimeoutError')
          : new Error('sensitive-admin-token');
      const transport = vi.fn().mockRejectedValue(cause);
      const adapter = new KongAdapter({ ...config, fetch: transport });
      const error = await adapter
        .grantAccess({ id: 'app' }, { id: 'service' })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(GatewayUnavailableError);
      expect(error).toMatchObject({
        message: 'The API gateway is unavailable',
        cause,
      });
      expect(JSON.stringify(error)).not.toContain('sensitive-admin-token');
      expect(transport.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    },
  );
  it('follows pagination and sends optional token', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: [], next: '/consumers?offset=2' }),
      )
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: [] }));
    const adapter = new KongAdapter({
      ...config,
      adminToken: 'token',
      fetch: request,
    });
    await adapter.listOwnedConsumers();
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0]?.[1].headers['Kong-Admin-Token']).toBe(
      'token',
    );
  });
  it('rejects off-origin pagination', async () => {
    const adapter = new KongAdapter({
      ...config,
      fetch: vi
        .fn()
        .mockImplementation(async () =>
          Response.json({ data: [], next: 'http://evil.test' }),
        ),
    });
    await expect(adapter.listOwnedConsumers()).rejects.toBeInstanceOf(
      GatewayRejectedError,
    );
  });
});
