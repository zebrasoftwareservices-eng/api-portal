// SPDX-License-Identifier: Apache-2.0
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

const DEFAULT_SERVER_URL = 'http://localhost:4000';
const HEALTH_TIMEOUT_MS = 2_000;

export interface IngressOptions {
  serverUrl?: string;
  trustedProxies?: string;
}

function normalizedAddress(address: string | undefined) {
  return (address || '').replace(/^::ffff:/, '');
}

function trustedProxyList(value: string) {
  const list = new BlockList();
  for (const entry of value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separator = entry.lastIndexOf('/');
    const address = separator === -1 ? entry : entry.slice(0, separator);
    const family = isIP(address);
    if (!family)
      throw new Error(`Invalid PORTAL_TRUSTED_PROXIES entry: ${entry}`);
    const maximum = family === 4 ? 32 : 128;
    const prefix =
      separator === -1 ? maximum : Number(entry.slice(separator + 1));
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maximum)
      throw new Error(`Invalid PORTAL_TRUSTED_PROXIES entry: ${entry}`);
    list.addSubnet(address, prefix, family === 4 ? 'ipv4' : 'ipv6');
  }
  return list;
}

function rightmostAddress(value: string | string[] | undefined) {
  const address = (Array.isArray(value) ? value.join(',') : value || '')
    .split(',')
    .map((part) => normalizedAddress(part.trim()))
    .filter(Boolean)
    .at(-1);
  return address && isIP(address) ? address : undefined;
}

function rightmostValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value.join(',') : value || '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .at(-1);
}

function headersFor(
  req: IncomingMessage,
  trustedProxies: BlockList,
): IncomingHttpHeaders {
  const headers = { ...req.headers };
  const peer = normalizedAddress(req.socket.remoteAddress) || 'unknown';
  const family = isIP(peer);
  const trusted =
    family !== 0 && trustedProxies.check(peer, family === 4 ? 'ipv4' : 'ipv6');
  const forwardedFor = trusted
    ? rightmostAddress(req.headers['x-forwarded-for']) || peer
    : peer;
  const forwardedProto =
    trusted && rightmostValue(req.headers['x-forwarded-proto']) === 'https'
      ? 'https'
      : 'http';
  // Never trust a public caller's forwarding metadata, including Connection
  // tokens that could cause the next hop to discard our sanitized address.
  for (const name of (headers.connection || '').split(','))
    delete headers[name.trim().toLowerCase()];
  for (const name of Object.keys(headers))
    if (
      name === 'forwarded' ||
      name === 'x-real-ip' ||
      name.startsWith('x-forwarded-')
    )
      delete headers[name];
  delete headers.connection;
  delete headers['proxy-connection'];
  headers['x-forwarded-for'] = forwardedFor;
  headers['x-forwarded-proto'] = forwardedProto;
  headers['x-forwarded-host'] = req.headers.host || 'localhost';
  headers['x-forwarded-port'] = String(req.socket.localPort);
  return headers;
}

function proxyRequest(
  req: IncomingMessage,
  target: URL,
  headers: IncomingHttpHeaders,
  onResponse: (response: IncomingMessage) => void,
) {
  const options: RequestOptions = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    // Keep the request target as a path. Passing it through new URL() would
    // allow a leading // to replace the configured upstream hostname.
    path: req.url || '/',
    method: req.method,
    headers,
  };
  return target.protocol === 'https:'
    ? httpsRequest(options, onResponse)
    : httpRequest(options, onResponse);
}

/** Public HTTP boundary. The Next listener must remain on loopback only. */
export function createIngress(port: number, options: IngressOptions = {}) {
  const serverUrl = new URL(
    options.serverUrl ?? process.env.SERVER_URL ?? DEFAULT_SERVER_URL,
  );
  if (!['http:', 'https:'].includes(serverUrl.protocol))
    throw new Error('SERVER_URL must use http or https');
  const trustedProxies = trustedProxyList(
    options.trustedProxies ?? process.env.PORTAL_TRUSTED_PROXIES ?? '',
  );
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      const health = httpRequest(
        { hostname: '127.0.0.1', port, path: '/', method: 'GET' },
        (response) => {
          response.resume();
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
        },
      );
      health.setTimeout(HEALTH_TIMEOUT_MS, () => health.destroy());
      health.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(503, { 'content-type': 'text/plain' });
          res.end('unavailable');
        }
      });
      health.end();
      return;
    }
    const path = req.url || '/';
    // Normalize encoded path segments before checking the private namespace.
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(path, 'http://portal.invalid').pathname,
      );
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (
      pathname === '/api/v1/internal' ||
      pathname.startsWith('/api/v1/internal/')
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const isApi = path === '/api' || path.startsWith('/api/');
    const target = isApi ? serverUrl : new URL(`http://127.0.0.1:${port}`);
    const upstream = proxyRequest(
      req,
      target,
      headersFor(req, trustedProxies),
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
        response.on('error', () => res.destroy());
      },
    );
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(
          'The portal is starting or unavailable. Try again in a moment.',
        );
      }
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  // Preserve Next development's HMR WebSocket without exposing its listener.
  server.on('upgrade', (req, socket, head) => {
    const upstream = httpRequest({
      hostname: '127.0.0.1',
      port,
      path: req.url,
      headers: {
        ...headersFor(req, trustedProxies),
        connection: 'Upgrade',
        upgrade: req.headers.upgrade || 'websocket',
      },
    });
    upstream.on('upgrade', (response, peer, peerHead) => {
      socket.write(
        `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`,
      );
      for (let i = 0; i < response.rawHeaders.length; i += 2)
        socket.write(
          `${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`,
        );
      socket.write('\r\n');
      if (peerHead.length) socket.write(peerHead);
      if (head.length) peer.write(head);
      peer.on('error', () => socket.destroy());
      socket.on('error', () => peer.destroy());
      socket.on('close', () => peer.destroy());
      peer.on('close', () => socket.destroy());
      socket.pipe(peer).pipe(socket);
    });
    upstream.on('response', (response) => {
      response.resume();
      socket.destroy();
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.end();
  });
  return server;
}
