// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it } from 'vitest';
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { createIngress } from '../ingress/proxy';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '::', resolve));
  return (server.address() as AddressInfo).port;
}
async function call(
  port: number,
  headers: IncomingHttpHeaders = {},
  hostname = '127.0.0.1',
  body = '',
  path = '/api/v1/try-it?scalar_url=sample',
  method = 'POST',
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      {
        hostname,
        port,
        path,
        method,
        headers,
      },
      (res) => {
        let content = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          content += chunk;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode!, body: content }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

it('replaces forged forwarding metadata with the socket address and streams the request intact', async () => {
  const upstream = await listen(
    createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () =>
        res.end(
          JSON.stringify({
            headers: req.headers,
            body,
            url: req.url,
            method: req.method,
          }),
        ),
      );
    }),
  );
  const port = await listen(
    createIngress(upstream, { serverUrl: `http://127.0.0.1:${upstream}` }),
  );
  const response = await call(
    port,
    {
      'x-forwarded-for': '198.51.100.1, 198.51.100.2',
      forwarded: 'for=198.51.100.3',
      'x-real-ip': '198.51.100.4',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-port': '443',
      'x-forwarded-custom': 'untrusted',
      connection: 'x-forwarded-for',
      cookie: 'session=test',
      apikey: 'test-key',
      host: 'portal.example',
      'content-type': 'application/json',
    },
    '127.0.0.1',
    '{"hello":"world"}',
  );
  expect(response.status).toBe(200);
  const data = JSON.parse(response.body);
  expect(data.headers).toMatchObject({
    'x-forwarded-for': '127.0.0.1',
    'x-forwarded-proto': 'http',
    'x-forwarded-host': 'portal.example',
    'x-forwarded-port': String(port),
    cookie: 'session=test',
    apikey: 'test-key',
    'content-type': 'application/json',
  });
  expect(data.headers).not.toHaveProperty('forwarded');
  expect(data.headers).not.toHaveProperty('x-real-ip');
  expect(data.headers).not.toHaveProperty('x-forwarded-custom');
  expect(data).toMatchObject({
    body: '{"hello":"world"}',
    method: 'POST',
    url: '/api/v1/try-it?scalar_url=sample',
  });
});

it('keeps one exhausted budget when XFF rotates and preserves separate real client budgets', async () => {
  const budgets = new Map<string, number>();
  const upstream = await listen(
    createServer((req, res) => {
      const address = String(req.headers['x-forwarded-for']);
      const count = (budgets.get(address) || 0) + 1;
      budgets.set(address, count);
      res.writeHead(count > 60 ? 429 : 400);
      res.end();
    }),
  );
  const port = await listen(
    createIngress(upstream, { serverUrl: `http://127.0.0.1:${upstream}` }),
  );
  for (let i = 0; i < 60; i++)
    expect(
      (await call(port, { 'x-forwarded-for': `198.51.100.${i}` })).status,
    ).toBe(400);
  expect((await call(port, { 'x-forwarded-for': '203.0.113.1' })).status).toBe(
    429,
  );
  expect(
    (await call(port, { 'x-forwarded-for': '127.0.0.1' }, '::1')).status,
  ).toBe(400);
  expect(budgets.size).toBe(2);
});

it('proxies API requests to the runtime SERVER_URL instead of the Next child', async () => {
  const next = await listen(
    createServer((_req, res) => res.end('next child')),
  );
  const api = await listen(
    createServer((req, res) => res.end(`api server ${req.url}`)),
  );
  const port = await listen(
    createIngress(next, { serverUrl: `http://127.0.0.1:${api}` }),
  );
  expect((await call(port)).body).toBe(
    'api server /api/v1/try-it?scalar_url=sample',
  );
  expect((await call(port, {}, '127.0.0.1', '', '/sign-in')).body).toBe(
    'next child',
  );
});

it('keeps the rightmost client address and https from a trusted peer', async () => {
  const upstream = await listen(
    createServer((req, res) => res.end(JSON.stringify(req.headers))),
  );
  const port = await listen(
    createIngress(upstream, { trustedProxies: '127.0.0.0/8' }),
  );
  const response = await call(
    port,
    {
      'x-forwarded-for': '198.51.100.10, 203.0.113.20',
      'x-forwarded-proto': 'http, https',
      'x-forwarded-host': 'spoofed.example',
    },
    '127.0.0.1',
    '',
    '/trusted',
  );
  expect(JSON.parse(response.body)).toMatchObject({
    'x-forwarded-for': '203.0.113.20',
    'x-forwarded-proto': 'https',
  });
  expect(JSON.parse(response.body)['x-forwarded-host']).not.toBe(
    'spoofed.example',
  );
});

it('does not keep trusted-proxy headers from an untrusted peer', async () => {
  const upstream = await listen(
    createServer((req, res) => res.end(JSON.stringify(req.headers))),
  );
  const port = await listen(
    createIngress(upstream, { trustedProxies: '192.0.2.0/24' }),
  );
  const response = await call(
    port,
    {
      'x-forwarded-for': '198.51.100.10',
      'x-forwarded-proto': 'https',
    },
    '127.0.0.1',
    '',
    '/untrusted',
  );
  expect(JSON.parse(response.body)).toMatchObject({
    'x-forwarded-for': '127.0.0.1',
    'x-forwarded-proto': 'http',
  });
});

it('answers healthz only when the loopback Next child answers', async () => {
  const upstreamServer = createServer((_req, res) => res.end('ready'));
  const upstream = await listen(upstreamServer);
  const port = await listen(createIngress(upstream));
  expect((await call(port, {}, '127.0.0.1', '', '/healthz', 'GET')).status).toBe(
    200,
  );

  await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  expect((await call(port, {}, '127.0.0.1', '', '/healthz', 'GET')).status).toBe(
    503,
  );
});

it('returns a recoverable response when Next is unavailable', async () => {
  const placeholder = createServer();
  const upstream = await listen(placeholder);
  await new Promise<void>((resolve) => placeholder.close(() => resolve()));
  const port = await listen(createIngress(upstream));
  const response = await call(port, {}, '127.0.0.1', '', '/sign-in');
  expect(response.status).toBe(502);
  expect(response.body).toContain('Try again');
});
