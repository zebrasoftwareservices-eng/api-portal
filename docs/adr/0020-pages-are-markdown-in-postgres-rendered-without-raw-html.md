# ADR 0020 — Pages are Markdown in Postgres, rendered without raw HTML; navigation is one saved document

- Status: Proposed (accept by merging)
- Date: 2026-11-23
- Spec: 014 Pages and navigation (JSO-242). Extends ADR 0012 (search) and follows ADR 0016 (storage).

## Context
Admins must publish guides and edit the header and footer without a rebuild, and some pages are for
signed-in accounts only. Page text is free-form and is shown to every visitor, so it must never run
script. The install is single-tenant, may run several replicas, and the quickstart must not grow.
Spec 028 (articles, landing page sections) will build on this.

## Decision
1. **Storage.** A page is a row in a Postgres `pages` table. The body is stored as the Markdown
   source the admin typed. HTML is never stored and the API never returns it.
2. **Rendering.** The portal renders Markdown to React elements with `react-markdown` and
   `remark-gfm`, in one component. Raw HTML is dropped, not sanitized: no `rehype-raw`, no
   `dangerouslySetInnerHTML`. Link and image URLs pass an allowlist (links: `http`, `https`,
   `mailto` and URLs relative to the portal; images: absolute `https`). A refused link shows its
   text and a refused image shows its alt text.
3. **Who can read a page is decided in the server's SQL.** Drafts and signed-in-only pages never
   reach the portal process for a caller who may not see them, so they can't leak through HTML, the
   React payload, metadata, navigation or search. Not allowed and not existing give the same 404.
4. **Navigation** is one `navigation_settings` row holding the ordered header and footer as JSON, or
   no row for the default. Page links hold the page ID. The server resolves them per caller on every
   read and drops links to pages that are deleted, unpublished or not visible to the caller.
   Built-in entries are a fixed list of keys in code; a key that isn't in a saved header is added at
   its end, so a later release can add one without a migration.
5. **No cache.** Every render reads the live rows and responses are `private, no-store`, so a change
   shows on the next page load on every replica.
6. **Search** keeps ADR 0012: the candidate set is read at query time with the same visibility rule.
   Bodies are not searched, so the read stays small.

## Alternatives
- **Render and sanitize HTML on the server** (`rehype-sanitize` or DOMPurify). A sanitizer must be
  right about every tag and attribute. Dropping raw HTML leaves nothing to get wrong.
- **Extend `ProductDescription`.** It has no tables, images or nested lists; growing a hand-written
  parser is worse than a well-known library.
- **MDX or files in Git.** MDX runs code, and files need a developer and a rebuild.
- **A `navigation_items` table with a foreign key to pages.** Replacing an ordered list needs
  locking to stop two saves interleaving. One row gives an atomic, last-save-wins write, and
  filtering on read already covers a deleted page.
- **Cached rendering (ISR).** Signed-in-only content and shared caches don't mix, and a page view is
  a primary-key-sized read.

## Consequences
- Admins can't use HTML in pages. That is the product decision in spec 014, and this ADR makes
  relaxing it a security change that needs a new ADR.
- One more small server call per portal render (navigation). With no saved navigation it is one
  primary-key read.
- A saved navigation can hold the ID of a deleted page until the next save; readers and the
  editor never see that link.
- Articles in spec 028 reuse the renderer, the URL allowlist and the visibility rule.
