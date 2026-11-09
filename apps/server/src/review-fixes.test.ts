// SPDX-License-Identifier: Apache-2.0
import Fastify from 'fastify';
import { describe, it, expect, vi } from 'vitest';
import { portalProxy } from './trusted-proxy.js';
import { registerProxy, tryItResetToken } from './proxy.js';
import { problemHandler } from './problem.js';
import type { Database } from '@portal/db';

describe('trusted portal rate limiting', () => {
  it('gives clients separate budgets and ignores spoofed untrusted hops', async () => {
    const proxy = portalProxy('127.0.0.1');
    const app = Fastify({ trustProxy: proxy.trust });
    app.addHook('onRequest', proxy.refresh);
    problemHandler(app);
    await registerProxy(app, {} as Database, () => {
      throw new Error('unused');
    });
    try {
      const call = (peer: string, client: string) =>
        app.inject({
          url: '/api/v1/try-it',
          remoteAddress: peer,
          headers: { 'x-forwarded-for': client },
        });
      for (let i = 0; i < 60; i++) {
        expect((await call('127.0.0.1', '198.51.100.1')).statusCode).toBe(400);
        expect((await call('127.0.0.1', '198.51.100.2')).statusCode).toBe(400);
      }
      const limited = await call('127.0.0.1', '198.51.100.1');
      expect(limited.statusCode).toBe(429);
      expect(limited.json().type).toBe('/problems/rate-limited');
      expect(limited.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect((await call('127.0.0.1', '198.51.100.2')).statusCode).toBe(429);
      expect((await call('127.0.0.1', '198.51.100.3')).statusCode).toBe(400);
      // An untrusted socket cannot rotate XFF to evade its own bucket.
      for (let i = 0; i < 60; i++)
        expect((await call('203.0.113.1', `192.0.2.${i}`)).statusCode).toBe(
          400,
        );
      expect((await call('203.0.113.1', '192.0.2.200')).statusCode).toBe(429);
      // Only the immediate forwarded address is trusted, never earlier hops.
      expect(
        (await call('127.0.0.1', '192.0.2.100, 198.51.100.1')).statusCode,
      ).toBe(429);
      expect(proxy.trust('::ffff:127.0.0.1', 0)).toBe(true);
      expect(proxy.trust('127.0.0.1', 1)).toBe(false);
    } finally {
      await app.close();
    }
  });
  it('clears the try-it budget for the next run without a restart', async () => {
    const app = Fastify({ trustProxy: true });
    problemHandler(app);
    await registerProxy(
      app,
      {} as Database,
      () => {
        throw new Error('unused');
      },
      fetch,
      { resetToken: 'test-reset' },
    );
    try {
      const call = () =>
        app.inject({ url: '/api/v1/try-it', remoteAddress: '203.0.113.9' });
      for (let i = 0; i < 60; i++) expect((await call()).statusCode).toBe(400);
      expect((await call()).statusCode).toBe(429);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/test/reset-try-it-limit',
            remoteAddress: '203.0.113.9',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/test/reset-try-it-limit',
            remoteAddress: '203.0.113.9',
            headers: { 'x-portal-rate-limit-reset': 'test-reset' },
          })
        ).statusCode,
      ).toBe(204);
      expect((await call()).statusCode).toBe(400);
      expect(tryItResetToken({ NODE_ENV: 'production' }, 'test-reset')).toBe(
        undefined,
      );
    } finally {
      await app.close();
    }
  });
  it('fails closed when the portal cannot be resolved', async () => {
    const proxy = portalProxy('invalid host');
    await proxy.refresh();
    expect(proxy.trust('127.0.0.1', 0)).toBe(false);
  });
});

describe('unexpected error diagnostics', () => {
  it('logs the error message, stack and request id without returning details or logging keys', async () => {
    const { createApp } = await import('./app.js');
    const { loadConfig } = await import('./config.js');
    const logs: string[] = [];
    const err = Object.assign(new Error('Database write failed'), {
      key: 'pk_do_not_log',
    });
    const { app } = await createApp({
      db: {
        select: () => ({
          from: () => ({
            limit: async () => [{ instanceId: 'test', id: 'test' }],
          }),
        }),
      } as unknown as Database,
      config: loadConfig(),
      adapterFor: () =>
        ({
          health: vi.fn().mockRejectedValue(err),
        }) as unknown as import('@portal/adapter-sdk').GatewayAdapter,
      auth: {} as import('./auth.js').Auth,
      logger: {
        stream: {
          write: (line: string) => {
            logs.push(line);
          },
        },
      },
    });
    try {
      const response = await app.inject({
        url: '/api/v1/health?secret=pk_query_secret',
        headers: { apikey: 'pk_header_secret' },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().detail).toBe('An unexpected error occurred.');
      expect(response.body).not.toContain('Database');
      const entry = logs
        .map((line) => JSON.parse(line))
        .find((line) => line.msg === 'Request failed');
      expect(entry.err.message).toBe('Database write failed');
      expect(entry.err.stack).toContain('Database write failed');
      expect(entry.err.key).toBe('[REDACTED]');
      expect(entry.reqId).toBeTruthy();
      expect(logs.join('')).not.toContain('pk_');
    } finally {
      await app.close();
    }
  });
});
