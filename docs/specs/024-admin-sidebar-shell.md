---
id: 024
title: Admin sidebar shell
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-18
linear:            # the one feature issue, e.g. JSO-117 — filled by `node scripts/factory.mjs linear-init 024`
---

# 024 — Admin sidebar shell

## Summary
Signed-in portal admins get the approved portal shell: a light left sidebar (APIs, Products,
Apps, Requests, Insights, and an Admin group), a read-only list of every team's apps, and an
admin session that is not a developer. The admin can't create apps or request access, and the
server refuses both.

## Problem
Portal admins today move between developer screens and admin screens in one top bar. They see
developer actions (My apps, Teams, Create app, Subscribe) that make no sense for the person
running the install. They can't see every team's apps in one place, so to answer "who holds a
key for this product?" they have to go through each product's access list. An admin who clicks
Subscribe creates an app and a gateway credential under the admin account. That credential then
looks like developer traffic in Insights. Every disclosure control (menus, selects, details)
also uses a different arrow.

We'll know it's solved when an admin can do every admin job from the sidebar, can see every
team's app and its key hint without being able to read or change the key, and has no path, in
the UI or through the API, to create an app or request access as an admin.

## Users
- **Portal admin.** Runs the install: imports and publishes APIs, connects gateways, configures
  mail, accounts and theme, approves requests and reads Insights. Primary user.
- **API consumer (developer).** Should see no change to their navigation, apps or teams.
- **Platform engineer** who installs the portal and also calls its APIs. Uses a separate developer
  account for the second job.

## User stories
- As a portal admin, I want one sidebar with my everyday pages and an Admin group for settings,
  so that I can find any admin job without hunting through the top bar.
- As a portal admin, I want the APIs page to show only published APIs and their reference docs,
  with products only on Products, so that each page has one job.
- As a portal admin, I want to see every team's apps with team, owner, plan, key hint and status,
  so that I can tell who has access without opening each product.
- As a portal admin, I want an app page that shows status and the key hint but can't reveal,
  regenerate, create or cancel anything, so that I can't take over a team's key by mistake.
- As a portal admin, I want developer-only actions hidden and refused by the server, so that
  my admin account never holds a gateway credential.
- As a portal admin, I want each Accounts rate limit as a maximum and a window in minutes, side by
  side with their units, so that I can read and set a limit without guessing its unit.
- As a developer, I want My apps and my team apps to work as before, so that the admin change
  doesn't get in my way.
- As any user, I want one chevron that behaves the same everywhere, so that I can tell at a glance
  what is open and what is closed.

## Acceptance criteria
1. **Given** a signed-in portal admin on any portal page **When** the page loads **Then** a light
   left sidebar shows, in this order, **APIs**, **Products**, **Apps**, **Requests**, **Insights**,
   then an **Admin** group whose children are **APIs** (import and publish), **Gateways**, **Mail**,
   **Accounts** and **Theme**. The search box stays in the top bar. **Profile** and **Sign out**
   are in the account menu and not in the sidebar.
2. **Given** a signed-in portal admin **When** they open **Admin** in the sidebar (or go to `/admin`)
   **Then** they land on the Gateways page, the Admin group is expanded, and Gateways is marked as
   the current page.
3. **Given** published APIs and at least one product **When** the admin opens **APIs** in the
   sidebar **Then** the page lists each published API with a link to its reference docs and lists
   no products. **And When** they open **Products** **Then** the products are listed there.
4. **Given** apps owned by at least two teams, one app with two active keys, one with a revoked
   key, and one on a plan **When** the admin opens **Apps** **Then** one row per app shows team,
   app, owner, plan, the last four characters of each active key (none for a revoked key), and
   status, with a **View** button. The page never sends or shows a full key or a key secret.
5. **Given** the admin opens **View** on another team's app **When** the app page loads **Then** it
   shows the app's status and key hint, and has no reveal, regenerate, create-key or **Cancel
   subscription** control. **And Given** the admin wants to stop that team's access **Then**
   **Revoke** is on the product's access screen, not on the app page.
6. **Given** a signed-in portal admin **When** they browse the portal (catalog, product pages, API
   pages, account menu) **Then** **My apps**, **Teams**, **Create app** and **Subscribe** are not
   shown anywhere in the admin session.
7. **Given** a signed-in session whose portal role is admin **When** it calls the server to create
   an app or to submit an access request (bypassing the UI) **Then** the server responds 403 with
   an RFC 9457 problem+json body that says a portal admin is not a developer, no app, request or
   subscription row is written, and no gateway call is made.
8. **Given** a signed-in developer who is a member of a team **When** they use the portal **Then**
   they still see **My apps** with their own and their team's apps, can create an app, and can
   subscribe or request access as before. They see no **Admin** group, no admin **Apps** page and no
   **Insights**, and `/admin` routes still refuse them.
9. **Given** the admin is on **Admin → Accounts** **When** they look at any rate limit **Then** it is
   two fields side by side: the maximum with its unit beside the number (attempts or emails) and the
   window with "minutes" beside the number, and **Save** is at the bottom left of the form. **And
   When** they enter 0, a negative number or a non-number in either field and press **Save** **Then**
   the field shows an inline error, nothing is saved, and reloading the page shows the old values.
10. **Given** any closed disclosure (the Admin group, a select, a details summary) **When** it is
    opened **Then** the same chevron icon turns from pointing right to pointing down, and back when
    closed. The account menu's chevron points down while closed and up while the menu is open.

## Out of scope
- **Pages, articles and navigation managed in the admin UI.** Spec 014 (JSO-242).
- **Registration approval, private portal and audit log.** Spec 015 (JSO-243).
- **The first-run "Publish the sample API" offer.** It already appears only after the first Kong
  connection (spec 005). This spec doesn't move or change it.
- **An act-as-developer or impersonation mode.** A person who installs the portal and also calls
  APIs uses a separate developer account.
- **Adding the admin to every team, or any team membership for admins.** Team roles still never
  grant portal admin access (spec 008), and portal admin doesn't grant team access.
- **Revoking or regenerating a single key from the admin Apps pages.** The team that owns the app
  revokes a single key. Admins stop access with **Revoke** on product access (spec 010).
- **Filtering, sorting or exporting the admin Apps list.** We cut these to keep this to one pull
  request. Follow-up if admins ask.
- **A sidebar for developers.** Only signed-in admins get the sidebar here (see Open questions).
- **Cleaning up apps or credentials an admin account created before this change.** This spec
  only stops new ones (see Open questions).
- **Staff roles that limit which admins see which sidebar entries.** Spec 015.

## Open questions
- [ ] Which document is the "approved portal shell"? `docs/design/jso-316-unified-api-portal.md`
      is the nearest design, but it has no admin sidebar. Should the ui-designer write the sidebar
      into `docs/design/024-*.md`, or is there a mock to follow? Elango
- [ ] Do developers (and anonymous visitors) keep the current top-bar navigation, or should they
      also get the sidebar later as a separate spec? Elango
- [ ] What should an admin see on a direct visit to a developer URL such as `/apps`, `/apps/new` or
      `/teams`: a redirect to the admin Apps page, or a page that says to use a developer account?
      Elango, ui-designer
- [ ] What happens to apps, subscriptions and keys an admin account already holds? Leave them, list
      them on the admin Apps page under a "portal admin" owner, or flag them for revocation? Elango
- [ ] Does the server already have an endpoint that lists every team's apps with owner, plan and key
      hints, or does this need a new admin endpoint in `openapi.yaml`? tech-lead
- [ ] Which Accounts rate limits exist today (for example sign-in attempts, password-reset emails,
      verification emails), and what are their units and current defaults? tech-lead
- [ ] This touches the shell, three pages, the Accounts form, a shared chevron and one server rule.
      If the design shows it won't fit one pull request, split it: the server refusal and hidden
      developer actions (criteria 6–8) first, then the sidebar, Apps pages, Accounts form and chevron.
      tech-lead
