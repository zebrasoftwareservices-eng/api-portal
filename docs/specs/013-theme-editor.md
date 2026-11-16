---
id: 013
title: Theme editor
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-16
linear: JSO-241
---

# 013 — Theme editor

## Summary
Portal admins brand their self-hosted portal from **Admin → Theme**: logo, favicon, brand
colours, font, corner radius, light and dark mode, and custom CSS. Changes reach the live
portal without a rebuild, and the theme can be exported and imported as JSON.

## Problem
A company that installs the portal today gets our default look. To show its own logo and
colours it has to fork `packages/ui` tokens, rebuild the image and redeploy. Most platform teams
won't do that, so the portal looks like a third-party tool and developers trust it less.
Companies also need branding to be safe: one bad CSS rule must not lock admins out of the screen
they would use to fix it.

We'll know it's solved when an admin changes a colour and the logo, then a developer reloads the
public portal and sees the new brand with no restart or rebuild, and broken custom CSS never
breaks the admin area.

## Users
- **Portal admin**: sets and changes the theme.
- **Platform engineer**: keeps the theme in Git and applies it to other installs (GitOps).
- **API consumer (developer)**: sees the branded portal. They don't edit anything.

## User stories
- As a portal admin, I want to upload our logo and favicon and set our brand colours, so that the
  portal looks like part of our company.
- As a portal admin, I want to pick a font and a corner radius and set light and dark colours, so
  that the portal matches our design system in both modes.
- As a portal admin, I want to write custom CSS and see it in a live preview before I save, so that
  I can fine-tune the look without breaking the live portal.
- As a portal admin, I want to reset the theme to the default, so that I can recover from a bad
  change in one step.
- As a portal admin, I want the admin area to stay usable whatever custom CSS I save, so that I can
  always fix a mistake.
- As a platform engineer, I want to export the theme as JSON and import it on another install, so
  that branding lives in Git and every environment matches.

## Acceptance criteria
1. **Given** a portal admin on **Admin → Theme** **When** they change the primary brand colour and
   upload a PNG or SVG logo, then save **Then** a developer who loads any public portal page
   afterwards sees the new colour on primary buttons and links and the new logo in the header,
   with no server restart, container rebuild or redeploy.
2. **Given** a portal admin edits the theme **When** they change the light and dark colour values,
   the font (from the offered list) and the corner radius **Then** the preview pane updates before
   saving, and after saving the live portal uses those values in both light and dark mode.
3. **Given** a portal admin types custom CSS **When** they have not saved yet **Then** the preview
   shows the CSS applied and the live portal is unchanged; **When** they save **Then** the CSS
   applies to public and developer pages.
4. **Given** saved custom CSS that hides or breaks page elements (for example
   `body { display: none }`) **When** a portal admin opens any `/admin` page **Then** the admin area
   renders with the default theme and no custom CSS, and the admin can open **Admin → Theme** and
   remove the CSS.
5. **Given** a customised theme **When** a portal admin chooses **Reset to default** and confirms
   **Then** logo, favicon, colours, font, radius and custom CSS return to the shipped defaults on
   the live portal.
6. **Given** a customised theme **When** a portal admin exports it **Then** they download a JSON
   file that holds every theme setting, including the logo and favicon; **When** that file is
   imported on a second install **Then** the second portal shows the same theme.
7. **Given** a portal admin uploads a logo that is too large or not an allowed image type, or
   imports a JSON file that is malformed or has an invalid colour value **When** they submit
   **Then** they see an error that names the problem, nothing is saved, and the current theme stays
   live. The API answers 400 as problem+json.
8. **Given** a portal admin picks a text and background colour pair below WCAG AA contrast (4.5:1
   for body text) **When** they edit the theme **Then** the editor shows a contrast warning next to
   that pair before they save.
9. **Given** a signed-in developer who is not a portal admin, or a visitor **When** they open
   **Admin → Theme** or call the theme write or import API **Then** the page is not shown and the
   API answers 403 (signed in) or 401 (signed out), and the theme is unchanged.
10. **Given** a fresh `docker compose up` with no theme saved **When** anyone opens the portal
    **Then** it shows the shipped default theme, and the quickstart still finishes in under five
    minutes.

## Out of scope
- **Several themes, scheduled themes or per-team branding.** One theme per install proves the
  value; the portal is single-tenant.
- **Custom font uploads or arbitrary web-font URLs.** Admins pick from a fixed list. Font files
  add licensing and hosting questions; custom CSS can still load a font for those who need one.
- **Custom JavaScript, header or footer HTML.** Script injection is a security risk that needs its
  own design.
- **Editing email templates.** Spec 007 deferred it here; it is a follow-up, because emails need
  their own preview and inline-style rules.
- **Pages, articles and navigation.** Spec 014 (JSO-242).
- **Staff roles that limit who may edit the theme.** Every portal admin may edit it until spec 015.
- **Theme version history or undo beyond Reset to default.** Export gives a manual backup.
- **Applying a theme file at boot from config, Helm values or an environment variable.** See Open
  questions; export and import from the admin UI are in scope.
- **Custom CSS in the admin area.** The admin area always uses the default theme (criterion 4).
  Brand colours and logo in the admin header are an open question.

## Open questions
- [ ] Should the admin area show the brand logo and colours (but never custom CSS), or stay fully
      default? Fully default is the simplest safe mode. — Elango
- [ ] Should a platform engineer be able to apply a theme JSON at startup (file path or Helm value)
      for GitOps, or is admin-UI import enough for v0.7? Startup apply may fit better with
      spec 016. — Elango, tech lead
- [ ] Allowed logo formats and size limit (proposed PNG, SVG, WebP up to 512 KB) and whether
      uploaded SVG must be sanitised or rasterised. — tech lead
- [ ] Which fonts are on the offered list, and are they self-hosted so the portal makes no
      third-party font requests? — ui-designer, tech lead
- [ ] Does custom CSS need limits (size cap, blocking `@import` of remote URLs) for security or
      privacy? — tech lead
- [ ] Does the contrast warning block saving, or only warn? Proposed: warn only. — Elango

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Decision record: [ADR 0016](../adr/0016-theme-stored-in-postgres-served-as-runtime-css.md).
The theme is stored in Postgres and rendered as CSS by the server on request. The portal reads
it on every server render, so a save shows on the next page load with no rebuild. Custom CSS is
a separate stylesheet that is never linked under `/admin`.

**Open questions, tech-lead answers.** These are design defaults. Elango's questions stay open in
the spec, and each default is cheap to change.
- Logo: PNG, SVG or WebP, up to 512 KB. Favicon: PNG, SVG or ICO, up to 128 KB. SVG is not
  rasterised and no sanitiser library is added. The server rejects SVG that contains `<script`,
  `<foreignObject`, an `on*=` attribute, a `javascript:` URL or an external `href`. It serves
  assets with `nosniff` and a `sandbox` CSP, and the portal shows them only through `<img>`.
- Fonts: `system` (default), Inter, IBM Plex Sans, Source Sans 3, Noto Sans and Atkinson
  Hyperlegible. All are OFL-licensed and self-hosted in the image from `@fontsource` packages
  (latin subset), so the portal makes no third-party font requests. The ui-designer may shorten
  the list. Adding a font later is a contract change.
- Custom CSS: 64 KB cap, and `@import` is rejected, because an imported sheet changes outside the
  portal and is lost on export. `url()` is allowed, so custom CSS can still load a web font, as
  Out of scope promises.
- Admin branding (Elango): the default is fully default. The admin area links neither theme
  stylesheet and shows the built-in logo. Because tokens and custom CSS are separate files, admin
  brand colours later means linking `theme.css` in the admin area and nothing else.
- Startup apply (Elango): not built. The import validator is a plain function that spec 016 can
  call at boot.
- Contrast (Elango): warn only. The check runs in the editor, and the API never rejects on
  contrast.

#### Components
| Where | Change |
| --- | --- |
| `packages/theme` (new, `@portal/theme`) | Dependency-free TS, compiled with `tsc` the same way as `@portal/db` (the server runs compiled JS and can't import `@portal/ui` source). Holds the `ThemeValues` types, `DEFAULT_THEME`, `FONTS` (id → CSS family stack), `validateTheme(values)` returning field pointers, `renderThemeCss(values)`, `contrastRatio(a, b)` and `CONTRAST_PAIRS`, `themeEtag(values, assets)` (sha256 of canonical JSON plus asset hashes, first 16 hex characters). |
| `packages/db` | `theme_settings` and `theme_assets` tables and one migration. |
| `apps/server` | `src/theme.ts`: four public routes and five admin routes, asset sniffing and SVG checks, export/import. Admin routes use the existing admin guard. |
| `packages/ui` | Add dark-mode default tokens to `styles.css` (`@media (prefers-color-scheme: dark)` on `:root:not([data-theme=light])`, and `:root[data-theme=dark]`). They mirror `DEFAULT_THEME.colors.dark`. |
| `packages/sdk` | Regenerate `schema.d.ts`. |
| `apps/portal` | Root layout fetches `/v1/theme`. Adds a `ThemeLinks` client component, the favicon through `generateMetadata`, the header logo, the `data-theme` attribute, self-hosted fonts and the `/admin/theme` editor with an iframe preview. |

#### API contract (already in `apps/server/openapi.yaml`, tag `theme`)
Public routes, `security: []`:
- `GET /v1/theme` → `PublicTheme {isDefault, etag, defaultMode, font, stylesheetUrl, customCssUrl|null, logoUrl|null, faviconUrl|null}`, sent with `Cache-Control: no-store`. It never includes the CSS text.
- `GET /v1/theme.css?v=` → `text/css` holding the tokens only. Light tokens go on `:root`. Dark
  tokens go under `prefers-color-scheme` when `defaultMode` is `system`, and always under
  `[data-theme=dark]`. It also sets `--radius` and `--portal-font-sans`. The derived tokens
  (`card`, `popover`, `secondary`, `ring`, `--scalar-*`) follow because they are `var()`
  references in `styles.css`. When `v` equals the etag, the response is
  `Cache-Control: public, max-age=31536000, immutable`; otherwise `no-cache`. Every response
  sends `ETag` and answers `If-None-Match` with 304.
- `GET /v1/theme/custom.css?v=` → the custom CSS verbatim, an empty body when there is none, with
  the same caching.
- `GET /v1/theme/assets/{logo|favicon}?v=` → the bytes with the sniffed type, `nosniff`, and
  `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`. 404 when
  that asset isn't saved.

Admin routes. Signed out is 401 `/problems/unauthenticated`. Not an admin is 403
`/problems/forbidden` (AC 9).
- `GET /v1/admin/theme` → `ThemeSettings {isDefault, etag, values, defaults, logo|null, favicon|null, updatedAt|null}`. Assets appear as `{contentType, byteSize, url}` with no bytes.
- `PUT /v1/admin/theme` with `SaveThemeRequest {values, logo?, favicon?}`. For each asset, omit it
  to keep it, send `null` to remove it, or send `{contentType, data(base64)}` to replace it. The
  write is one transaction, with all validation done before it, so nothing is saved on error
  (AC 7). Returns 200 `ThemeSettings`, or 400 `/problems/validation` with `errors[].pointer`
  naming the field (`/values/colors/dark/primary`, `/logo/data`, `/values/customCss`) and a
  `detail` such as "Logo is 740 KB; the limit is 512 KB" or "Custom CSS can't use @import".
  413 when the body is over 2 MB (route `bodyLimit`).
- `DELETE /v1/admin/theme` deletes both tables' rows in one transaction and returns the default
  `ThemeSettings`. It is idempotent (AC 5).
- `GET /v1/admin/theme/export` returns `ThemeExport {format:"portal-theme", version:1, exportedAt, values, logo|null, favicon|null}`
  with the assets in base64 and `Content-Disposition: attachment; filename="portal-theme.json"` (AC 6).
- `POST /v1/admin/theme/import` takes a `ThemeExport` and replaces everything, so a `null` asset
  removes the stored one. It runs the same validation, and also rejects an unknown `format` or
  `version`. A body that isn't JSON answers 400 problem+json with the detail "The file is not
  valid JSON". That needs a route-level content-type parser error handler: the default Fastify
  error isn't problem+json.

Validation rules live in `@portal/theme`, and the server also enforces them with the route
schema:
- Colours must match `^#[0-9a-fA-F]{6}$`.
- `font` must be in the enum.
- `radius` is an integer from 0 to 24.
- `defaultMode` is `system`, `light` or `dark`.
- `customCss` is at most 65,536 characters, and a case-insensitive `@import` outside comments is
  rejected.
- For assets, the decoded size is checked against the limit, and the magic bytes must match
  `contentType`: PNG `89 50 4E 47`, WebP `RIFF....WEBP`, ICO `00 00 01 00`. SVG must be UTF-8
  text with an `<svg` root after an optional XML prolog, and passes the deny-list above.
  Favicons can't be WebP and logos can't be ICO.

#### Data model (`packages/db`, one forward-only migration from `drizzle-kit generate`)
- `theme_settings`: `id smallint pk default 1` (check `= 1`), `values jsonb not null` (the validated
  `ThemeValues` without `customCss`), `custom_css text not null default ''`, `updated_by uuid null`
  (references `user.id`, `on delete set null`), `updated_at timestamptz not null default now()`.
- `theme_assets`: `kind text pk` (check `in ('logo','favicon')`), `content_type text not null`
  (check in the four types), `data bytea not null` (use a Drizzle `customType` if pg-core lacks
  `bytea`), `byte_size integer not null` (check `between 1 and 524288`), `sha256 text not null`,
  `updated_at timestamptz not null default now()`.
- No rows means the default theme, so no seed is needed and a fresh install is unchanged (AC 10).
- Reading `values`: parse it and run `validateTheme`. If a stored row is ever invalid (from a
  manual DB edit, or a future version), log a warning without the values and serve the default.
  Never answer 500 to public pages.

#### Portal
- **Root layout.** A server fetch of `GET /v1/theme` (`cache: 'no-store'`, 1.5 s timeout). Any error
  or non-200 uses `DEFAULT_PUBLIC_THEME`. That covers the Vercel demo, which has no server
  (ADR 0004), and server outages. The result goes into a `ThemeProvider` context.
  `generateMetadata` sets `icons` to `faviconUrl` or the built-in favicon. `<html data-theme>`
  is set only when `defaultMode` isn't `system`.
- **`ThemeLinks` (client component, rendered in `<head>` from the root layout).** It uses
  `usePathname()`. Under `/admin` it renders nothing. Elsewhere it renders
  `<link rel="stylesheet" href={stylesheetUrl}>` and, when set, `customCssUrl`. Use plain
  `<link>` elements without React 19's `precedence`, because hoisted resources aren't removed on
  unmount. That way client navigation into `/admin` removes them (AC 4). The header's Admin link
  and the admin nav entry use `<a>` (a full page load) as a second guard.
- **Header logo.** Shows `logoUrl` through `<img alt="{portal name}">` (max height
  `--portal-header-height` minus padding) outside `/admin`, and the built-in logo under `/admin`.
- **Fonts.** Import the `@fontsource` CSS for the five named fonts in the root layout. The
  `@font-face` rules cost nothing until a family is used. `renderThemeCss` sets
  `--portal-font-sans: '<family>', <system stack>`. New dependencies:
  `@fontsource-variable/inter`, `@fontsource-variable/ibm-plex-sans`,
  `@fontsource-variable/source-sans-3`, `@fontsource-variable/noto-sans` and
  `@fontsource/atkinson-hyperlegible`. Reason: self-hosted OFL fonts with no runtime requests.
- **`/admin/theme` editor.** Fields for both palettes, font, radius, default mode, custom CSS
  (a plain `<textarea>` with a monospace font and a character count, no code-editor dependency),
  logo and favicon upload (read as base64 in the browser, with a client size check), Save,
  Reset to default (confirm dialog), Export and Import (file input, parsed client-side, then
  `POST`). The contrast warning shows next to each `CONTRAST_PAIRS` pair below 4.5:1
  (`contrastRatio` from `@portal/theme`). It warns only (AC 8).
- **Preview.** An `<iframe src="/?themePreview=1">` (same origin) inside the admin page. On load, the
  editor `postMessage`s `{type:'portal-theme-preview', css: renderThemeCss(draft) + draft.customCss, logo: objectURL, mode}`
  with `targetOrigin = location.origin`. On that page, `ThemeLinks` listens only when
  `themePreview=1` and `window.parent !== window`, checks `event.origin === location.origin`,
  drops the live links and writes the draft into a `<style>` element through `textContent`.
  Draft CSS never enters the admin document (AC 2, 3). The portal's framing headers must allow
  same-origin framing (`frame-ancestors 'self'` / `SAMEORIGIN`). Check this.
- **Route guard.** `/admin/theme` uses the existing admin layout guard (AC 9). Demo mode already
  rewrites `/admin/*`.

#### Gateway adapter calls
None. The theme stays inside the portal. Kong and AWS are untouched.

#### Risks and how to test them
- **Custom CSS leaking into admin** (AC 4). E2e: save `body{display:none}`, then (a) load `/admin`
  directly and (b) go from `/` to `/admin` by client navigation. Assert the admin heading is
  visible and no `link[href*="/v1/theme"]` exists. Then remove the CSS through the editor.
- **Stale theme after save** (AC 1). The etag changes on every save, `/v1/theme` is `no-store`, and
  the portal fetch is `no-store`. E2e: save a colour, then load a public page in a fresh context
  and assert the computed `--primary` and the logo `src`.
- **SVG script.** Unit tests with the deny-list fixtures. An integration test asserts the CSP,
  `nosniff` and the sniffed type on `/v1/theme/assets/logo`.
- **Big bodies.** Route `bodyLimit` is 2 MB. Base64 of 512 KB is about 683 KB, so the per-field
  `maxLength` of 700,000 catches an oversized asset before decoding. Integration test: a 600 KB
  PNG gets 400 with pointer `/logo/data`, and the theme is unchanged.
- **Import atomicity** (AC 7). Integration test: a valid file with one bad colour gets 400, and
  `GET /v1/admin/theme` still shows the old etag.
- **Quickstart** (AC 10). No new service or env var. The migration only creates tables.
  `docker compose up` with no theme serves the defaults. `/v1/theme` must not fail before the
  migration runs: the server migrates on boot.
- **Defaults drift.** A unit test in `packages/theme` parses `packages/ui/src/styles.css` and
  asserts that `DEFAULT_THEME` light and dark values match its tokens.
- **Extra per-page read.** One primary-key `select` on `theme_settings` plus a `select kind, sha256`
  on `theme_assets`. That's acceptable, and there's no TTL cache, so replicas never disagree.

### Tasks
- [ ] [backend] Create `packages/theme` (`@portal/theme`, tsc build, no runtime deps): types, `DEFAULT_THEME` (light from current `styles.css`, plus a dark palette that passes AA), `FONTS`, `validateTheme`, `renderThemeCss`, `contrastRatio`, `CONTRAST_PAIRS`, `themeEtag`, with unit tests including the styles.css drift test
- [ ] [backend] Add `theme_settings` and `theme_assets` to `packages/db/src/schema.ts` and generate the migration with `pnpm --filter @portal/db exec drizzle-kit generate`; add a migration test
- [ ] [backend] `apps/server/src/theme.ts`: public `GET /v1/theme`, `/v1/theme.css`, `/v1/theme/custom.css`, `/v1/theme/assets/{kind}` with etag/`If-None-Match`/cache headers, asset CSP and `nosniff`, and default fallback on a missing or invalid row
- [ ] [backend] Admin `GET/PUT/DELETE /v1/admin/theme`, `GET /v1/admin/theme/export`, `POST /v1/admin/theme/import`: admin guard, 2 MB `bodyLimit`, magic-byte sniffing, SVG deny-list, `@import` check, one transaction per write, problem+json 400 with field pointers (including invalid JSON on import)
- [ ] [backend] Integration tests (Testcontainers Postgres) for every route: 401/403, save → public etag changes, reset, export → import round trip, oversized and mismatched assets, bad colour, `@import`, invalid JSON; regenerate `packages/sdk`
- [ ] [frontend] Dark default tokens in `packages/ui/src/styles.css` matching `DEFAULT_THEME.colors.dark`, applied by `prefers-color-scheme` and `[data-theme]`
- [ ] [frontend] Root layout: fetch `/v1/theme` (no-store, timeout, default fallback), `ThemeProvider`, `generateMetadata` favicon, `data-theme`, `ThemeLinks` (nothing under `/admin`, plain `<link>`s), header logo (built-in under `/admin`), `<a>` for Admin entry links, self-hosted `@fontsource` fonts
- [ ] [frontend] Preview mode in `ThemeLinks` (`?themePreview=1`, framed, same-origin `postMessage`, `<style>` via `textContent`); confirm framing headers allow `'self'`
- [ ] [frontend] `/admin/theme` editor per the UX doc: palettes (light/dark), font, radius, default mode, custom CSS textarea, logo/favicon upload with client checks, live iframe preview, contrast warnings, Save, Reset (confirm), Export, Import; server errors shown against the named field; add the Admin nav entry
- [ ] [frontend] Docs: `docs/guides/theming.md` (limits, fonts, admin isolation, export/import for GitOps) and a README line
- [ ] [qa] Playwright e2e per criterion: AC 1 (colour and logo live in a fresh context, no restart), AC 2 (preview updates, both modes after save via `colorScheme`), AC 3 (preview shows CSS, live unchanged until save), AC 4 (`body{display:none}`: direct and client-nav `/admin` usable, then remove), AC 5 (reset), AC 6 (export, reset, import → same theme and same etag), AC 7 (oversized logo, wrong type, malformed JSON, bad colour → named error, theme unchanged), AC 8 (contrast warning shown, save still allowed), AC 9 (developer 403 and visitor 401 on API, page not shown)
- [ ] [qa] AC 10: fresh `docker compose up` timed under five minutes, default theme served, `/v1/theme` `isDefault: true`; demo build still renders with no server

## UX  _(ui-designer)_
Design: [docs/design/013-theme-editor.md](../design/013-theme-editor.md).
- `/admin/theme` (admin-only **Theme** nav entry): form cards for Logo and favicon, Colours
  (Light/Dark tabs, nine `ColorField`s), Font and shape (font select, radius slider, default
  mode) and Custom CSS, with a sticky live iframe preview at ≥1024px and an Edit/Preview tab
  pair below. A sticky action bar holds the unsaved state and **Save theme**.
- Contrast warnings sit under six named text/surface pairs (the `CONTRAST_PAIRS` list) and never
  block saving. Reset and Import use confirm dialogs; server 400s map by pointer to the field.
- Every state (loading, load error, default, dirty, saving, saved, 400/413/5xx, 401 mid-edit,
  403, preview unavailable) and all copy are specified. The editor always uses built-in tokens.
- New components: `ColorField`, `AssetField`. tokens.md now lists the dark default palette that
  `DEFAULT_THEME.colors.dark` and `styles.css` must match.

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/013.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/013.md`. The full report is `docs/uat/013/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/013.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
