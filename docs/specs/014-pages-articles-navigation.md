---
id: 014
title: Pages and navigation managed in the admin UI
status: testing   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-23
linear: JSO-242
---

# 014 — Pages and navigation managed in the admin UI

## Summary
Portal admins write and publish Markdown pages (guides, about, terms), choose who can read each
one, and edit the header and footer links, all from the admin UI and without a developer.

JSO-242 asks for more than one pull request can hold, so it is split in two (Elango, 2026-11-23).
This spec ships pages and navigation. Spec 028 (`articles-landing-page`), built after this one,
ships articles, landing page sections and image uploads.

**Merging this spec closes JSO-242.** Its remaining scope is carried by spec 028, not by JSO-242.
JSO-242's "Done when" is only partly met here: the guide, the reordered navigation and the hidden
signed-in-only page ship now; publishing a landing page and an article waits for spec 028. Spec 028
has no Linear feature issue yet and needs one before work on it starts.

## Problem
A company that installs the portal can brand it (spec 013) but can't add its own words. A getting
started guide, terms of use or a support link needs a code change and a rebuild, so admins keep
that content on another site or leave it out. Developers then look for it elsewhere or ask support.

It is solved when an admin with no code access can publish a guide, restrict a page to signed-in
developers, and reorder the navigation, with each change live without a rebuild or restart.

## Users
- **Portal admin**: writes pages and edits the navigation.
- **API consumer (developer)**, signed in or signed out: reads pages and follows the links.

## User stories
- As a portal admin, I want to write a page in Markdown, preview it and publish it when it's ready,
  so that I don't need a developer to add a guide.
- As a portal admin, I want to restrict a page to signed-in developers, so that internal guidance
  isn't readable by everyone.
- As a portal admin, I want to choose and order the header and footer links, including links to
  other sites, so that visitors find our content and our support pages.
- As a portal admin, I want to set a page's title, description and image for search engines and
  link previews, so that shared links look right.
- As a developer, I want to find a guide from the navigation or the search box, so that I can start
  without asking anyone.

## Acceptance criteria
1. **Given** an install with no pages and no saved navigation (a fresh quickstart, or an upgrade
   from the previous release) **When** a visitor, a developer and an admin open the portal **Then**
   the header, footer and existing pages are as they were before this feature, and the quickstart
   still works in under five minutes.
2. **Given** a signed-in admin **When** they create a page with a title, a slug and a Markdown body,
   save it as a draft and open its preview **Then** the preview shows the rendered page, and the
   page's URL `/pages/{slug}` answers 404 to everyone else.
3. **Given** a draft page set to **Public** **When** the admin publishes it **Then** a signed-out
   visitor can read it at `/pages/{slug}` with headings, lists, links, tables, images and code
   blocks rendered. **When** the admin edits and saves it **Then** the next page load shows the new
   text without a rebuild or restart.
4. **Given** a published page set to **Signed-in only** **When** a signed-out visitor opens its URL
   or requests it from the API **Then** they get the same 404 as for a slug that doesn't exist, and
   its title, description and body appear nowhere in the response. The 404 page offers every
   signed-out visitor **Sign in**, whether or not the page exists, and signing in returns them to
   the same URL. **When** any signed-in account opens the URL **Then** it shows the page.
5. **Given** one published public page, one published signed-in-only page and one draft **When** a
   signed-out visitor searches for words in their titles or descriptions **Then** only the public
   page is returned. **When** a signed-in developer runs the same searches **Then** both published
   pages are returned and the draft is not.
6. **Given** a page body containing a `<script>` tag, an `onerror` attribute, an `<iframe>`, and
   Markdown links and images using `javascript:` or `data:` URLs **When** the page is previewed or
   published **Then** no script runs, none of those elements, attributes or URLs are in the HTML,
   and the rest of the page renders normally.
7. **Given** a signed-in admin in the navigation editor **When** they add a header link to a page
   and one to an external `https` URL, hide a built-in header entry, reorder the header, add a
   footer link and save **Then** visitors and developers see exactly that order on the next page
   load. Sign in and the account menu can't be hidden or moved. **When** they use **Reset to
   default** **Then** criterion 1's header and footer return.
8. **Given** navigation links to a draft page, a signed-in-only page and a published public page
   **When** a signed-out visitor opens the portal **Then** only the public page's link is shown.
   **When** the admin deletes or unpublishes a linked page, after a confirmation that names the
   header or footer link it affects, **Then** that link disappears and the page's URL answers 404.
9. **Given** a signed-in admin **When** they save a page with an empty title, an invalid slug or a
   slug another page uses, or a navigation link with no label, a `javascript:` URL or a page that
   doesn't exist **Then** the save is refused with an RFC 9457 problem, the form names the field and
   keeps what the admin typed, and the stored page or navigation is unchanged. **When** a signed-out
   visitor or a developer calls any endpoint that creates, changes or deletes pages or navigation,
   or reads drafts, **Then** they get 401 or 403 and nothing changes.
10. **Given** a published public page with an SEO title, description and Open Graph image URL
    **When** its HTML is fetched signed out **Then** the title, meta description and Open Graph tags
    hold those values. Empty fields fall back to the page title and leave the description and image
    out. **Given** a signed-in-only page **When** a signed-in account fetches it **Then** it is
    marked `noindex` and can't be stored by a shared cache.

## Out of scope
**Moved to spec 028** (reserved in `docs/roadmap.md`, Needs 014; no Linear feature issue yet):
- **Articles**: tags (news, release notes, events), drafts, publishing and article lists.
- **Landing page sections**: hero, features, featured products and latest articles. The latest
  articles section needs articles, so the two ship together. Until then the home page is unchanged.
- **Uploading images.** Here, page images and the Open Graph image are `https` URLs.

**Not in this spec:**
- **A visual (WYSIWYG) editor, raw HTML, embeds, scripts and custom components.** Markdown with
  preview proves the value, and spec 013 ruled out script injection.
- **Visibility by team, product or role.** Public or signed-in only. Spec 015 owns a fully private
  portal and staff roles; every portal admin may edit content until then.
- **Version history, scheduled publishing, approval, and several admins editing one page at once.**
  The last save wins.
- **Redirects when a slug changes.** The old URL answers 404. Navigation links follow the page.
- **Nested menus, icons, and a page tree or guide sidebar.** Header and footer are flat lists.
- **Changing the admin sidebar** beyond adding entries for Pages and Navigation. Spec 024 owns it.
- **Search inside page bodies.** Search matches titles and descriptions, like spec 020's fields.
- **Pages in `/llms.txt` and Markdown versions of pages.** A small follow-up, number not reserved.
  No page appears in agent output in this spec, so a signed-in-only page can't leak there.
- **A sitemap, translations, comments, and importing pages from Git.**
- **Content in the static Vercel demo** (spec 002). It has no backend and keeps its header.

## Open questions
- [x] Is the split right: pages and navigation here, then articles and landing page sections in the
  next spec? **Decided (Elango, 2026-11-23): yes.** Spec 028 carries the rest. Merging this spec
  closes JSO-242, and the Sprint 6 demo in `docs/roadmap.md` loses its landing page and article.
- [x] Should admins upload images instead of pasting an `https` URL? **Decided (Elango,
  2026-11-23): `https` URLs only here.** Uploads go with spec 028.
- [x] Should published public pages also appear in `/llms.txt` with a Markdown version? **Decided
  (Elango, 2026-11-23): later, in a small follow-up.** Not in this spec.
- [x] Should a signed-out visitor who opens a signed-in-only page get a 404 with **Sign in**, or go
  straight to sign-in? **Decided (Elango, 2026-11-23): the 404 with Sign in**, as criterion 4 says.
- [ ] Do signed-in admins, who have spec 024's sidebar, also see the edited header and footer links
  on public pages? Recommended: yes on public pages, no in the admin area. — ui-designer

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Decisions that outlive this spec are in
`docs/adr/0020-pages-are-markdown-in-postgres-rendered-without-raw-html.md`.

### Components
| Where | What and why |
| --- | --- |
| `packages/db` | `pages` and `navigation_settings` tables, one generated migration. |
| `apps/server/src/pages.ts` (new) | `GET /v1/pages/{slug}` and admin CRUD. Also exports `readablePages(viewer)`, the only SQL condition that decides who reads a page. The public page, navigation and search all use it. |
| `apps/server/src/navigation.ts` (new) | Public navigation resolved per caller, admin read, save and reset. |
| `apps/server/src/search.ts`, `packages/sdk/src/search.ts` | Pages join the search candidates. `searchCatalog` takes an optional fourth argument, `pages`, so the demo call is unchanged. |
| `packages/sdk` | Regenerated types. `DEFAULT_NAVIGATION` (header `apis`, `my-apps`; empty footer) is exported here so the server and the portal's fallback share it. |
| `apps/portal/components/markdown-body.tsx` (new) | The one Markdown renderer, used by the public page and the preview. |
| `apps/portal/app/pages/[slug]` (new) | `page.tsx`, `not-found.tsx`, `error.tsx`. No `loading.tsx`: a loading boundary would send a 200 before the 404 is known. |
| `apps/portal/app/page-preview/[pageId]` (new) | Saved-draft preview. It is outside `/admin`, so it has the portal's theme, and outside `/pages`, so no slug can collide with it. |
| `apps/portal/app/admin/pages` (list, `new`, `[pageId]`), `app/admin/navigation` (new) | Editors. Two entries in `admin-sidebar.tsx`. |
| `app/layout.tsx`, `header.tsx`, `portal-shell.tsx`, new `lib/navigation-server.ts` | Load navigation with the caller's cookie next to the theme, pass it down, render header links and footer links. |
| `next.config.ts` | `htmlLimitedBots: /.*/`. Next 16 otherwise streams `<title>`, description and Open Graph tags into the body for most user agents, and criterion 10 needs them in the fetched HTML's head. |

New dependencies, portal only: `react-markdown` (Markdown to React elements with no HTML string;
MIT) and `remark-gfm` (tables in Markdown; MIT). Nothing new in compose, Helm or configuration.

### API contract
Written in `apps/server/openapi.yaml`, tag `content`. Errors are problem+json.

| Operation | Success | Errors |
| --- | --- | --- |
| `GET /v1/pages/{slug}` (session optional) | 200 `PublicPage` | 404 |
| `GET /v1/navigation` (session optional) | 200 `PublicNavigation` | |
| `GET /v1/search` (extended) | `SearchResult` is now `CatalogSearchResult` (`api`, `operation`) or `PageSearchResult` (`page`) | unchanged |
| `GET /v1/admin/pages` | 200 `{ items: PageSummary[] }` | 401, 403 |
| `POST /v1/admin/pages` | 201 `PageDetail` | 400, 401, 403, 409 `page-slug-taken`, 413 |
| `GET /v1/admin/pages/{pageId}` | 200 `PageDetail` | 401, 403, 404 |
| `PUT /v1/admin/pages/{pageId}` (replace; `status` publishes and unpublishes) | 200 `PageDetail` | 400, 401, 403, 404, 409, 413 |
| `DELETE /v1/admin/pages/{pageId}` | 204 | 401, 403, 404 |
| `GET`, `PUT`, `DELETE /v1/admin/navigation` (read, replace, reset) | 200 `NavigationSettings` | 400 (`PUT`), 401, 403 |

Rules for handlers:
- Authorize before reading the body or parameters, with `requireUser(auth, request, true)`. An
  invalid `pageId` UUID is a 404.
- Every public and admin response here sends `Cache-Control: private, no-store`.
- **404 parity (criterion 4).** `GET /v1/pages/{slug}` never validates the slug and throws the same
  `notFound()` in every case. It only asks whether there is a session; it doesn't look at role, team
  or email verification. Admins get 404 for a draft here too.
- **Body checks.** Limits are in `PageWrite`. `title`, `seoTitle`, `description` and labels are one
  line. Refuse U+0000 in every string, because Postgres text can't hold it and would turn it into a
  500. `https` URLs are parsed with `new URL`: protocol `https:`, no username or password.
- **Pointers.** Use `z.discriminatedUnion('kind', …)` so a navigation error points at
  `/header/2/url`, not at the item. A missing page is a 400 at `/header/2/pageId`; a missing or
  repeated built-in is a 400 at `/header`.
- A slug collision comes from the unique index (`pgCode(error) === '23505'`), not a prior read, with
  `errors: [{ pointer: '/slug', … }]`. Add the `page-slug-taken` title to `problem.ts`.

`description` is one field: it feeds search, the meta description and `og:description`.

### Data model
One migration, generated with drizzle-kit. No data is seeded; no rows means today's portal.

`pages`
| Column | Type |
| --- | --- |
| `id` | uuid primary key (UUIDv7) |
| `slug` | text, unique; check: the `Slug` pattern and 2–64 characters |
| `title` | text not null; check: 1–120 after `btrim` |
| `body` | text not null default `''`; check: at most 100,000 characters |
| `description`, `seo_title`, `og_image_url` | text, null when empty |
| `visibility` | text not null; check `public`, `signed-in` |
| `status` | text not null default `draft`; check `draft`, `published` |
| `created_by`, `updated_by` | uuid, references `user`, `on delete set null` |
| `created_at`, `updated_at` | timestamptz |

`navigation_settings`: `id` smallint primary key, default 1, check `id = 1`; `header` jsonb not null;
`footer` jsonb not null; `updated_by`; `updated_at`. The arrays are stored in the request's shape.

Reading navigation: no row gives `DEFAULT_NAVIGATION` with `isDefault: true`, without a session
lookup. Otherwise parse the JSON with the request schema; if it doesn't parse, log a warning with
`event: 'navigation-invalid'` and serve the default, as `theme.ts` does. Drop unknown built-in keys
before parsing, so a downgrade doesn't lose the rest, and append missing ones at the end, visible.
Load the linked pages in one query and drop links whose page is gone. The public view also drops
hidden built-ins and pages outside `readablePages(viewer)`. Deleting a page doesn't rewrite the row.

Saving upserts the row in one statement, after checking in the same transaction that every `pageId`
exists. A page deleted between that check and the write is dropped on read, so no lock is needed.

### Portal behaviour
- **Page.** `GET /v1/pages/{slug}` through `serverClient()`, wrapped in React `cache` so
  `generateMetadata` and the page share one call. 404 calls `notFound()`; a 5xx shows the existing
  unavailable page. The page title is the `h1`; a `#` heading in the body becomes `h2`. In demo
  builds call `notFound()` before any fetch.
- **Metadata.** Title: `{ absolute: seoTitle }`, or the page title through the portal's template.
  Description: the value, or `null`, so the root layout's default isn't inherited. `openGraph`:
  `title` is `seoTitle` or the page title, `description` and `images` only when set, `type: article`.
  Signed-in-only pages and previews set `robots: { index: false, follow: false }`. For a 404 return
  only `title: 'Page not found'`, the same for every slug. The layout reads cookies, so Next already
  answers `private, no-cache, no-store`.
- **404.** `app/pages/[slug]/not-found.tsx` shows **Sign in** when the session state is `signed-out`
  and it isn't a demo build. It is a plain `<a href={signInLink(pathname)}>`; `safeNext` and the sign-in form
  already return the visitor there, and an admin with a `next` too.
- **Markdown.** `skipHtml`, `remark-gfm`, no rehype plugins. Override `urlTransform`: parse with
  `new URL(value, 'https://portal.invalid')`, which also normalises `java\tscript:`. Links keep
  `http:`, `https:` and `mailto:`; images keep only absolute `https:`. For a refused URL return
  `undefined` and let the `a` and `img` components render the text or the alt text alone, never an
  empty `href` or `src`. Images get `loading="lazy"` and `referrerPolicy="no-referrer"`. External
  links get `rel="noopener noreferrer"`. Tables and code blocks scroll inside their own container.
- **Header and footer.** Only the links move. Brand, search, Sign in, Sign up and the account menu
  stay fixed after them, on desktop and in the mobile menu. `apis` and `my-apps` keep today's label,
  link, `aria-current` and role rule (`my-apps` only for signed-in developers). Footer links go
  beside the existing "Powered by" line, which stays. Link URLs come from the server only; still
  render nothing whose `href` isn't `https:` or under `/pages/`.
- **Fallback.** Navigation load copies `fetchPublicTheme`: 1.5 s timeout, any failure gives
  `DEFAULT_NAVIGATION`. Demo builds never fetch.
- **Admins and criterion 1.** The admin topbar has no nav links today. Whatever the ui-designer
  decides about the open question, a default navigation (`isDefault`) must leave it as it is, and
  `/admin` never shows the edited links. The data is in the layout for every caller, so either
  answer needs no API change.
- **Confirm before unpublish or delete.** Fetch the page again when the dialog opens and list its
  `navigation` entries (area and label). With no entries, unpublish needs no confirmation; delete
  always does.
- **Search row.** A page result links to `/pages/{slug}` and shows its description when it has one.

### Adapter calls
None. Nothing here reads or writes the gateway, and no reconcile job changes.

### Risks and how to test them
| Risk | Guard and test |
| --- | --- |
| A signed-in-only page or a draft leaks in HTML, React payload, metadata, navigation or search | One SQL condition. Integration test with unique marker strings in title, description and body; e2e fetches the raw HTML of the page, `/`, `/search` and the 404 signed out and asserts no marker. |
| The 404 reveals that a page exists | Compare the two API 404s field by field, and the two HTML 404s after removing the slug. |
| Script runs from Markdown | Renderer unit tests over a payload table: raw tags (block and inline), attributes, entity-encoded, mixed-case and whitespace-split schemes, reference links, autolinks, image URLs. e2e asserts no dialog, `<script>` or `<iframe>` inside the article, in preview and published. |
| The default portal changes | Header, footer and sidebar tests for visitor, developer and admin with `DEFAULT_NAVIGATION`; the upgrade smoke test; existing e2e unchanged. |
| Server slow or down takes the header down | Fallback unit test: timeout, 500, malformed JSON. |
| Two admins save at once | Last save wins, one statement. Concurrent `PUT` test: the result is one of the two bodies, never a mix. |
| A pathological body (deep nesting) fails to render | It breaks only that page, behind `error.tsx`; the admin area shows source, so it can be fixed. Not guarded further. |
| `htmlLimitedBots` delays first byte on pages with slow metadata | Catalog, product and page metadata share a cached call with the page, so nothing new blocks. |
| `SearchResult` becoming a union breaks callers | TypeScript finds them: `search-result-row.tsx`, `search-results.tsx`, `packages/sdk/src/search.ts`. |

### Tasks
- [x] [backend] Add `pages` and `navigation_settings` to the Drizzle schema with the checks above and
  generate one migration. Upgrade from the previous release leaves both empty.
- [x] [backend] Regenerate `packages/sdk` types, export `DEFAULT_NAVIGATION`, and extend
  `searchCatalog` with the optional `pages` argument (title and description; scores as documented).
  Unit tests, including unchanged results without pages.
- [x] [backend] Build `pages.ts`: `readablePages`, the public read and the admin CRUD, with the body
  checks, pointers, `page-slug-taken`, 404 parity and cache headers. Integration tests for criteria
  2, 3, 4 and 9, including 401 and 403 on every admin route with nothing changed.
- [x] [backend] Build `navigation.ts`: per-caller resolution, save, reset, unknown and missing
  built-ins, invalid stored JSON. Integration tests for criteria 7, 8 and 9 and for concurrent saves.
- [x] [backend] Add pages to `GET /v1/search` through `readablePages`. Integration test for
  criterion 5 signed out, as a developer and as an admin, and that bodies aren't matched.
- [x] [frontend] Add `react-markdown` and `remark-gfm` and build `markdown-body.tsx` with the URL
  rules. Unit tests with the payload table (criterion 6).
- [x] [frontend] Build `/pages/[slug]` with metadata, its 404 with Sign in, its error page, and
  `/page-preview/[pageId]` (not 200 from the admin API gives the 404). Set `htmlLimitedBots`. Tests
  for criteria 4 and 10, including that empty fields leave the tags out.
- [x] [frontend] Load navigation in the root layout and render the header, mobile menu and footer
  links, with the fallback and demo behaviour. Tests that the default matches today's markup for
  visitor, developer and admin (criterion 1) and for criterion 7's order.
- [x] [frontend] Build Admin → Pages: list, create, edit, preview link, publish, unpublish, delete,
  the confirmations that name header and footer links, and field errors by pointer that keep what
  was typed (criteria 2, 3, 8, 9). Add the sidebar entry.
- [x] [frontend] Build Admin → Navigation: add page and external links, hide built-ins, reorder by
  keyboard as well as pointer, remove, save, Reset to default, field errors by pointer (criteria 7,
  8, 9). Add the sidebar entry.
- [x] [frontend] Show page results in search, with copy that covers APIs, endpoints and pages
  (criterion 5).
- [x] [frontend] Add a short admin guide in `docs/guides/` on pages, visibility and navigation.
- [x] [qa] End-to-end tests for criteria 1–10 against the compose stack, with the leak, 404 parity
  and script checks from the risk table, and the raw-HTML metadata check with a plain user agent.
- [x] [qa] Run the upgrade smoke test and the quickstart under five minutes with no pages and no
  saved navigation, and the demo e2e (criterion 1).
- [x] [frontend] Fix: Unknown and hidden API pages return HTTP 200
- [x] [backend] Fix: Pre-upgrade restore cannot drop user_pkey
## UX  _(ui-designer)_
Full design: [`docs/design/014-pages-articles-navigation.md`](../design/014-pages-articles-navigation.md).
One new token: `--portal-prose-max-width`.

- **Open question decided:** admins see the saved header and footer links on pages outside `/admin`,
  never inside it, and never **My apps**. With the default navigation their top bar is today's.
  Header links show to admins from 1024px, because spec 024's drawer isn't changed.
- **Pages** (Admin → Pages): a list and one editor with a Publishing panel. Drafts get **Publish**,
  **Save draft** and **Preview** (the last save). Published pages get **Save changes** (live at once),
  **View page** and **Unpublish**. Unpublish asks only when links are affected; Delete always asks.
  Both name each header or footer link.
- **Navigation** (Admin → Navigation): one ordered list per area, with Move up and Move down buttons
  and no drag. Built-ins have a Show switch. Saving with no changes sends nothing, so an untouched
  default is never stored.
- **Header**: with more than 4 links, 3 show and the rest go in **More**. 3 or more links use the
  mobile menu below 1024px. The default navigation keeps today's markup and breakpoints.
- **404**: one page for every slug. Signed-out visitors also get **Sign in** and one fixed sentence.
- **Search**: page rows and the `/search` help text. The header search label stays as it is
  (criterion 1).

## Build notes  _(backend-developer, frontend-developer)_
Backend added `pages` and `navigation_settings` in migration `0013_flashy_excalibur`. An upgrade with no rows keeps the default header (`apis`, `my-apps`) and an empty footer, and that read does not look up a session. `readablePages` is the only SQL filter for the public page, navigation links and search, so a draft or a signed-in-only page is the same 404 as an unknown slug and is absent from search. Every pages and navigation response sends `Cache-Control: private, no-store`. Slug conflicts are `/problems/page-slug-taken` at `/slug`; navigation errors point at the item (`/header/2/url`, `/header/2/pageId`) and a missing or repeated built-in points at `/header`. Deleting a page does not rewrite the navigation row: the link drops on the next read. Invalid stored JSON is logged as `navigation-invalid` and served as the default.

Frontend renders pages with `react-markdown` and `remark-gfm` (`skipHtml`, no rehype). Links keep `http`, `https`, `mailto` and same-portal paths; images keep absolute `https` with no credentials. `htmlLimitedBots` is `/.*/`. The root layout loads navigation with a 1.5s timeout and falls back to the default. A demo build does not fetch it, and `isDefault` keeps today's header markup, the Powered-by footer line, and the admin top bar. Existing CSS already hides `.desktop-nav` below 1024px, so that breakpoint was not changed and the design's gap under 1024px is empty. Admin page and navigation calls use `quietApi` so a 401 or 403 does not wipe the form. Saved header links show to admins only outside `/admin`, from 1024px, and never include My apps. `@portal/portal` lint, typecheck and 478 tests passed. Unknown and hidden API pages now 404 in `app/apis/[slug]/layout.tsx` before any loading UI. The index skeleton lives in `app/apis/(catalog)/loading.tsx`, so it no longer wraps `/apis/[slug]` and cannot flush HTTP 200 ahead of `notFound()`. QA should recheck `GET /apis/nope` and a hidden API page: status 404, title Developer Portal, and the API not found page, with no index skeleton in the HTML. `docs/guides/pages.md` and the `pnpm-lock.yaml` entries for `react-markdown` and `remark-gfm` are in the worktree. The frontend guard does not allow those two paths, so they are not in this commit. CI uses a frozen lockfile and will fail until a role that owns the lockfile commits it.

A pre-upgrade restore drops public relations and foreign keys that the dump does not contain before `pg_restore --clean`. `pages` and `navigation_settings` go away with the foreign keys that blocked `user_pkey`, and the rows from the dump are loaded again. `@portal/db` lint, typecheck and 14 tests passed. QA should rerun `node deploy/upgrade-smoke.mjs`; this change was not run through the upgrade smoke.

## Test report  _(qa-tester)_
Commit tested: `3a067b8` · Portal: http://localhost:3012 (API http://127.0.0.1:4012, Kong proxy http://localhost:18012). The worktree stack is still up.

| Criterion | Test file | Result |
| --- | --- | --- |
| 1 | `apps/portal/e2e/pages-navigation.test.ts`, `apps/portal/components/header.test.tsx`, `deploy/e2e-demo/demo.test.ts`, `packages/db/src/pages-migration.test.ts` | pass |
| 2 | `pages-navigation.test.ts`, `apps/server/src/content.test.ts`, `apps/portal/components/admin-pages.test.tsx` | pass |
| 3 | `pages-navigation.test.ts`, `content.test.ts` | pass |
| 4 | `pages-navigation.test.ts`, `content.test.ts`, `apps/portal/lib/page-metadata.test.ts` | pass |
| 5 | `pages-navigation.test.ts`, `content.test.ts` | pass |
| 6 | `pages-navigation.test.ts`, `apps/portal/components/markdown-body.test.tsx` | pass |
| 7 | `pages-navigation.test.ts`, `content.test.ts`, `header-navigation.test.tsx`, `admin-navigation.test.tsx` | pass |
| 8 | `pages-navigation.test.ts`, `content.test.ts`, `admin-pages.test.tsx` | pass |
| 9 | `pages-navigation.test.ts`, `content.test.ts` | pass |
| 10 | `pages-navigation.test.ts`, `page-metadata.test.ts` | pass |

Failure paths for invalid pages, duplicate slugs, 401 and 403, an ended session, and a missing navigation page are in `content.test.ts` and `pages-navigation.test.ts`. Pages do not call the gateway. Navigation fallback for a timeout, a 500, and malformed JSON is in `apps/portal/lib/navigation-server.test.ts`.

Lint 8/8 and typecheck 14/14 passed. `pnpm test` passed: portal 478, server 395, db 14, sdk 17, theme 13, adapter-kong 77. `pnpm test:e2e` was 113 passed, 2 skipped, 17 failed. Criteria 1–6, 9, and 10 passed in that run. AC7 failed there because the web-address field did not keep `javascript:alert(1)` on that attempt. A rerun of that test kept the value, refused the save, left the default navigation stored, and passed the rest of AC7 and AC8. `node scripts/worktree-compose.mjs up -d --build --wait` finished in 273.93s. The portal answered 200 and Kong was reachable. `GET /apis/nope` is HTTP 404 with title Developer Portal, the root "Page not found" heading, and no index skeleton. Hidden API, changelog, and product pages in the spec 010 journey are HTTP 404 with no index skeleton. `packages/db/src/restore-preupgrade.test.ts` passed, including the `user_pkey` restore. `node deploy/upgrade-smoke.mjs` stopped while building the candidate portal image (`write .../metadata_v2.db: read-only file system`) and never reached the restore. The data volume had 182MB free. The pre-upgrade major stays open. The other 16 e2e failures start the default Compose project `portal` and hit Mailpit port 8025, which this worktree already holds, or they stop that project's Kong. They are not pages-product failures.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [x] Unknown and hidden API pages return HTTP 200 (major)
- [ ] Pre-upgrade restore cannot drop user_pkey (major)
- [ ] Unknown API pages show the root Page not found copy (minor)

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/014.md`. The full report is `docs/uat/014/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/014.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR

### Deferred Linear
- **Bug** — Bug: Unknown and hidden API pages return HTTP 200 (major)
  - parent: JSO-242
  - priority: high
  - create when the Linear limit allows
  - body: On the worktree portal http://localhost:3012, GET /apis/nope returns HTTP 200 with title Developer Portal. The HTML is the apis/loading.tsx skeleton plus NEXT_HTTP_ERROR_FALLBACK;404. The API GET /api/v1/apis/nope is 404. The same 200 happens for a hidden API page whose API returns 404 (access-4e9aa4d2-a05e-4423-a74e-d3c6810a55f2); the slug appears only as the requested route. Playwright backlog-regressions JSO-223 and access-requests visibility checks both expected 404 and received 200. /pages/does-not-exist and /products/nope still return 404. This branch adds htmlLimitedBots: /.*/ and an async root layout that loads navigation, so the API route flushes loading.tsx before notFound().
- **Bug** — Bug: Pre-upgrade restore cannot drop user_pkey (major)
  - parent: JSO-242
  - priority: high
  - create when the Linear limit allows
  - body: node deploy/upgrade-smoke.mjs failed while restoring the pre-upgrade dump onto the upgraded database. pg_restore --clean stopped with: cannot drop constraint user_pkey on table public.user because navigation_settings_updated_by_user_id_fk, pages_created_by_user_id_fk and pages_updated_by_user_id_fk depend on it. The candidate server had already become healthy and written a post-upgrade dump. The baseline was merge-base 650c9ae. The script then removed the api-portal stack. Forward quickstart on an empty database reached /setup in 19.9s.
