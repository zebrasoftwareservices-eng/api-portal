---
id: 014
title: Pages and navigation managed in the admin UI
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-23
linear: JSO-242
---

# 014 — Pages and navigation managed in the admin UI

## Summary
Portal admins write and publish Markdown pages (guides, about, terms), choose who can read each
one, and edit the header and footer links, all from the admin UI and without a developer.

JSO-242 asks for more than one pull request can hold. This spec is the first of two. Articles and
landing page sections move to a follow-up spec that builds on this one (see Out of scope and the
first open question).

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
**Follow-up spec, after this one** (number not reserved; needs its own Linear issue):
- **Articles**: tags (news, release notes, events), drafts, publishing and article lists.
- **Landing page sections**: hero, features, featured products and latest articles. The latest
  articles section needs articles, so the two ship together. Until then the home page is unchanged.

**Not in this spec:**
- **Uploading images.** Page images and the Open Graph image are `https` URLs (see Open questions).
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
- **Pages in `/llms.txt` and Markdown versions of pages** (see Open questions). No page appears in
  agent output in this spec, so a signed-in-only page can't leak there.
- **A sitemap, translations, comments, and importing pages from Git.**
- **Content in the static Vercel demo** (spec 002). It has no backend and keeps its header.

## Open questions
- [ ] Is the split right: pages and navigation here, then articles and landing page sections in the
  next spec? Recommended, because all five areas of JSO-242 don't fit one pull request. If yes,
  merging this spec closes JSO-242, the Sprint 6 demo and JSO-242's "Done when" (landing page and
  article) are met only after the follow-up, and the roadmap needs a row for it. — Elango
- [ ] Should admins upload images instead of pasting an `https` URL? Recommended: URLs only here,
  uploads with the follow-up spec. — Elango
- [ ] Should published public pages also appear in `/llms.txt` with a Markdown version? Spec 021
  left them to this spec. Recommended: a small follow-up, to keep this one pull request. — Elango
- [ ] Should a signed-out visitor who opens a signed-in-only page get a 404 with **Sign in**
  (criterion 4), or go straight to sign-in? Recommended: the 404, so the page's existence stays
  hidden. — Elango
- [ ] Do signed-in admins, who have spec 024's sidebar, also see the edited header and footer links
  on public pages? Recommended: yes on public pages, no in the admin area. — ui-designer

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/014-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/014.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

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
