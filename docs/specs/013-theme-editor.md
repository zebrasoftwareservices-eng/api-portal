---
id: 013
title: Theme editor
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
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
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/013-*.md`

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
