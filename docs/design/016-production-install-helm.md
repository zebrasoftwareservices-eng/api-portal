# 016 — Production install: UX design

Spec: [`docs/specs/016-production-install-helm.md`](../specs/016-production-install-helm.md) · Feature issue JSO-244

## Scope
This spec has **no UI change** (spec Out of scope: "Any UI change. No new screens; the
ui-designer stage has no work."). There are no new or changed screens, flows, states, copy,
components or tokens. `docs/design/tokens.md` is unchanged.

## What the [frontend] tasks touch
The four `[frontend]` tasks are the portal container, not the portal UI:

1. The portal ingress proxies `/api/*` to `SERVER_URL` read at runtime (middleware and
   `lib/server.ts` read it at runtime too).
2. The portal ingress answers `GET /healthz`: 200 when the Next child answers on loopback,
   503 otherwise. It is a machine endpoint for probes, not a page; it renders no HTML and
   needs no copy beyond what the technical design specifies.
3. `PORTAL_TRUSTED_PROXIES`: client IP and `https` are kept only from a trusted peer.
4. The portal Dockerfile: `PORTAL_VERSION` build arg, OCI labels, read-only root filesystem.

## Flow, screens and states
None. The developer and admin experience is identical to the evaluation stack; every existing
screen keeps its current design and states.

## Copy
None. The operator-facing text for this spec is the install guide and chart README, owned by
the technical design and the developers, not by the portal UI.

## Accessibility and responsive behaviour
Unchanged. No screen changes, so the existing WCAG 2.2 AA behaviour and the 375px / 1280px
layouts of every screen stay as designed in their own specs. If the frontend developer finds the
runtime `SERVER_URL` change alters any rendered page, that is a regression against the existing
design, not new design.
