# Portal HTTP ingress

`pnpm dev`, `pnpm start` and the Docker image start the public Node ingress on
`PORT` (default 3000). It forwards streaming HTTP and WebSocket traffic to Next
on `127.0.0.1:NEXT_INTERNAL_PORT` (default `PORT + 1`). Keep that internal listener
private. The standalone image runs the generated Next server as a supervised
child; termination signals stop both listeners.

The ingress sends `/api/*` directly to the runtime `SERVER_URL`; all other
traffic goes to Next. It replaces caller-supplied forwarding metadata with the
actual socket peer. Never start
the generated Next `server.js` directly on the public port: it preserves
caller-supplied X-Forwarded-For.

External reverse proxies are clients unless their IP or CIDR is listed in
`PORTAL_TRUSTED_PROXIES`. A trusted peer may supply the rightmost client address
and an `https` scheme; every other forwarding header remains sanitized. Managed
hosting such as Vercel does not run this launcher. Do not expose a self-hosted
Next listener as an alternative public entry point.
