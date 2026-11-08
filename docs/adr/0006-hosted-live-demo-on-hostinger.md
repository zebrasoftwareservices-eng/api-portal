# ADR 0006 — Host the live demo control plane on the existing Hostinger VPS

- Status: Proposed (accept by merging)
- Date: 2026-11-08
- Spec: 006-hosted-live-demo

## Context

The Vercel portal is currently a static demo. JSO-127 needs a reachable Fastify server,
portal database and sample upstream while reusing the purchased Hostinger KVM 1 plan. The
host already runs Kong and Caddy with only HTTP, HTTPS and SSH permitted by the provider and
host firewalls. Kong's database and administrator token must remain isolated from the portal
browser and from Vercel.

## Decision

Run a second Compose project on the VPS containing Fastify, a dedicated PostgreSQL container
and `httpbin`. PostgreSQL is attached only to an internal network and publishes no port.
Fastify publishes no port and is reachable only by the existing Caddy over a dedicated
external Docker network. Caddy terminates TLS for
`portal-api.189.72.147.38.sslip.io`; Vercel's server-side `SERVER_URL` rewrite points there.

Fastify uses the existing protected HTTPS Kong Admin URL and reads the Admin token only from
the VPS mode-600 environment file. Its internal and public gateway URL are the existing HTTPS
gateway. `httpbin` joins Kong's existing edge network without publishing a host port so the
seeded upstream name remains unchanged.

The public demo resets developer data daily at 03:00 UTC, after a daily logical backup.
Deleting developer users cascades their portal records; restarting Fastify schedules the
existing reconciliation job, which deletes the now-orphaned Kong consumers and credentials.
The admin and seeded sample catalog remain. Backups are mode 600, outside Git, and retained
for 14 days. The sample Kong service is capped at 120 requests/minute; try-it retains its
60 requests/minute/IP cap and one-MiB/ten-second bounds.

## Consequences

- The live portal remains single-tenant and uses no additional paid service.
- Caddy is the only public container; raw Postgres, Fastify, Kong proxy and Kong Admin ports
  stay private. SELinux-compatible labels remain on the apigw Caddy bind mount.
- Portal credentials cannot reach other key-auth services because the per-API access policy
  from ADR 0005 denies portal consumers outside their subscriptions.
- A VPS outage affects live mutations and try-it, while Vercel can still serve an error page.
- A reset invalidates visitor sessions and keys by design. This is acceptable for a public
  demonstration and is stated in the operations documentation.
- The local quickstart and build-time static-demo test mode are unchanged.
