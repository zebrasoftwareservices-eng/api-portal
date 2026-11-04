# ADR 0004 — Demo mode is a build-time switch of the portal

- Status: Proposed (accept by merging)
- Date: 2026-11-04
- Spec: 002-vercel-static-demo-mode (answers its tech-lead open questions on detection and the seed file)

## Context
The Vercel deployment serves only the Next.js portal, with no control-plane server behind it. It has
to show the seeded sample API and say what needs the quickstart. A self-hosted portal must never
show that content, even when its server is down (spec 002 AC 9 and 10), and Elango wants no variable
to set by hand on Vercel.

## Decision
**Decide once, in `next.config.ts`, while the portal is built, and bake the answer into the bundle.**

```
demo = PORTAL_DEMO_MODE == "on"  or  (VERCEL == "1" and SERVER_URL is empty)
```

| Build | Result |
| --- | --- |
| Quickstart image (no `VERCEL`, `SERVER_URL` set by the Dockerfile) | off |
| Local `pnpm build` or `pnpm dev` | off |
| This project on Vercel, production or preview (`VERCEL=1`, no `SERVER_URL`) | **on**, nothing to set |
| Someone's own portal on Vercel with a real server (`SERVER_URL` set) | off |
| Test builds with `PORTAL_DEMO_MODE=on` | on |

- `next.config.ts` inlines the answer through `env` as `PORTAL_DEMO_ACTIVE`, so server components,
  client components and middleware all read the same value. A running portal can't change mode, and
  nothing at runtime (a failed request, a missing variable) can turn demo mode on.
- Turning it off needs no extra setting. A portal on Vercel can't work without `SERVER_URL`, so
  setting it is the off switch. That also means a future hosted demo (JSO-127) turns this mode off
  by connecting a server.
- `PORTAL_DEMO_MODE` accepts only `on`. It exists so tests can build a demo portal off Vercel, and as
  a fallback if Vercel ever stops exposing `VERCEL`.

**In demo mode, read the seed file at build time too.** The same step reads
`apps/server/seed/sample-api.openapi.yaml`, parses it and inlines it as `PORTAL_DEMO_SAMPLE_API`.
There's no second copy and no generated file. A non-demo build never opens the file, so the
quickstart image's build and contents don't change. If the file is missing, a demo build fails loudly.

Rejected:
- **Runtime detection** (checking `VERCEL` or probing the server on each request). `/api/*` rewrites
  are fixed at build time anyway, and a runtime check is one bug away from showing sample content on
  a real portal.
- **Inferring demo mode from `SERVER_URL` alone, or from the server being down.** It breaks AC 9 and
  10 (Elango, 2026-11-04).
- **A generated, git-ignored data file.** Every task that imports it (`dev`, `typecheck`, `test`, the
  Docker build) would need the generator to run first, and the Dockerfile would have to change.
- **A bundler raw-file import, or tracing the file into the function and reading it at runtime.**
  Both depend on bundler or tracing behaviour outside the app root, and the second also adds the file
  to the quickstart image.
- **A committed copy of the seed with a test comparing them.** AC 2 rules out a second copy.

## Consequences
- Changing mode, or the sample, needs a rebuild. That's already true of the `/api/*` rewrite.
- Because a Turborepo build cached on Vercel depends on these inputs, `apps/portal/turbo.json` must
  declare `VERCEL`, `SERVER_URL` and `PORTAL_DEMO_MODE` as `env`, and the seed file as an input.
  Without that, strict env mode hides the variables from the build and the remote cache can serve a
  build from the wrong mode.
- `next.config.ts` can import a relative TypeScript helper statically, but not with a dynamic
  `import()` (checked on Next 16.4.4), so the helper loads only `yaml` lazily.
- Demo branches sit in a small number of places in `apps/portal` and are covered by a separate
  Playwright suite against a real demo build.
