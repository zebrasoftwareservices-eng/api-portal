# ADR 0016 — Theme stored in Postgres, served as runtime CSS; admin area isolated

- Status: Proposed (accept by merging)
- Date: 2026-11-16
- Spec: 013 Theme editor (JSO-241)

## Context
Admins must brand the portal (logo, favicon, colours, font, radius, light/dark, custom CSS)
without a rebuild or restart. Design tokens are CSS variables in `packages/ui/src/styles.css`
and are compiled into the Next.js build. The portal is single-tenant, may run several replicas,
and the quickstart must stay `docker compose up` with nothing extra. Saved custom CSS can break
pages, and the admin area must stay usable whatever the custom CSS does.

## Decision
1. **Storage.** The theme lives in Postgres: a singleton `theme_settings` row (validated values
   as `jsonb`, custom CSS as `text`) and a `theme_assets` table holding the logo and favicon as
   `bytea`. No row means the shipped default. No object storage, volume or file path, so every
   replica sees the same theme and the quickstart needs nothing new.
2. **Delivery.** The server renders the theme at request time: `GET /v1/theme` (small JSON),
   `GET /v1/theme.css` (tokens generated from typed values, never from free text),
   `GET /v1/theme/custom.css` (custom CSS verbatim, as its own file, never inlined into HTML) and
   `GET /v1/theme/assets/{kind}`. Every URL carries `?v=<etag>`, where the etag is a content hash
   of the whole theme, so files cache forever and change the moment the theme changes. The portal
   root layout reads `/v1/theme` on each server render (`no-store`) and falls back to the
   built-in default if the server is unreachable (demo mode, outages).
3. **Admin isolation.** Theme stylesheets are linked by a client component that renders nothing
   on paths under `/admin`, so they are absent on a direct load and removed on client-side
   navigation into the admin area. Header links into `/admin` are full page loads as a second
   guard. The admin editor previews unsaved changes in a same-origin `<iframe>` of a public page
   that receives the draft by `postMessage`, so draft CSS never touches the admin document.
4. **Values are typed.** Colours are six-digit hex only, fonts come from a fixed self-hosted list,
   radius is an integer. Only custom CSS is free text, capped at 64 KB, with `@import` rejected.
   Shared types, defaults, the font list, the CSS generator and the contrast function live in a
   new dependency-free package `packages/theme` (`@portal/theme`, compiled with `tsc` like
   `@portal/db`, because the server runs compiled JS and cannot import `@portal/ui`'s TS source),
   so the server and the editor agree; a unit test keeps its defaults equal to the
   `packages/ui/src/styles.css` tokens.

## Consequences
- One extra primary-key read per server-rendered page. Acceptable; no in-process TTL cache, so a
  save is visible on every replica on the next request.
- Logo and favicon are capped (512 KB / 128 KB) because they live in the database and in export
  files. SVGs are not rasterised; they are rejected if they contain script-like content and are
  served with a sandboxing CSP and shown only through `<img>`.
- Brand colours and logo can later be shown in the admin area by linking `/v1/theme.css` there
  without `custom.css`; the split makes that a one-line change if Elango wants it.
- Applying a theme at boot (GitOps) can reuse the import validator later (spec 016).
- Alternatives rejected: writing CSS files to a volume (breaks multi-replica and the quickstart),
  rebuilding the portal on save (slow, needs a build toolchain at runtime), inlining CSS in a
  `<style>` tag (HTML injection risk with `</style>`), a CSS sanitiser library (cannot judge
  "breaks the page"; isolation is the real guarantee).
