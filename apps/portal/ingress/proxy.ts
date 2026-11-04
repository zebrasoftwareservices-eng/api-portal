// SPDX-License-Identifier: Apache-2.0
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from 'node:http';

function headersFor(req: IncomingMessage): IncomingHttpHeaders {
  const headers = { ...req.headers };
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
  headers['x-forwarded-for'] =
    req.socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown';
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-host'] = req.headers.host || 'localhost';
  headers['x-forwarded-port'] = String(req.socket.localPort);
  return headers;
}

/** Public HTTP boundary. The Next listener must remain on loopback only. */
export function createIngress(port: number) {
  const server = createServer((req, res) => {
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port,
        path: req.url,
        method: req.method,
        headers: headersFor(req),
      },
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
    const upstream = request({
      hostname: '127.0.0.1',
      port,
      path: req.url,
      headers: {
        ...headersFor(req),
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
