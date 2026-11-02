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
      await expect(
        adapter.ensureConsumer({ id: 'app' }),
      ).rejects.toBeInstanceOf(
        status >= 500 ? GatewayUnavailableError : GatewayRejectedError,
      );
    }
    await expect(
      new KongAdapter({
        ...config,
        fetch: vi.fn().mockRejectedValue(new Error('secret')),
      }).ensureConsumer({ id: 'app' }),
    ).rejects.toBeInstanceOf(GatewayUnavailableError);
  });
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
