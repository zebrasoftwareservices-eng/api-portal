# Portal HTTP ingress

`pnpm dev`, `pnpm start` and the Docker image start the public Node ingress on
`PORT` (default 3000). It forwards streaming HTTP and WebSocket traffic to Next
on `127.0.0.1:NEXT_INTERNAL_PORT` (default `PORT + 1`). Keep that internal listener
private. The standalone image runs the generated Next server as a supervised
child; termination signals stop both listeners.

The ingress replaces all caller-supplied forwarding metadata with the actual
socket peer. Next's same-origin API rewrite then carries that address to the
server, whose existing trusted-portal-hop rule remains in effect. Never start
the generated Next `server.js` directly on the public port: it preserves
caller-supplied X-Forwarded-For.

External reverse proxies are treated as clients: headers they supply are also
replaced, so clients behind one proxy share its rate-limit budget. For separate
budgets, expose this ingress directly with source-address-preserving networking.
There is intentionally no trusted external proxy setting in this slice. Managed
hosting such as Vercel does not run this launcher; its ingress must overwrite
client forwarding metadata itself before requests reach Next. Do not expose a
self-hosted Next listener as an alternative public entry point.
