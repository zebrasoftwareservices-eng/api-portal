---
id: 002
title: Static demo mode for the Vercel deployment
status: ready   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-04
linear: JSO-193
linear_stages: requirements=JSO-194 design=JSO-195 ux=JSO-196 backend=JSO-197 frontend=JSO-198 test=JSO-199 uat=JSO-200 review=JSO-201 release=JSO-202
---

# 002 — Static demo mode for the Vercel deployment

## Summary
The Vercel deployment shows the catalog and API reference for the seeded sample API with no
backend, and tells visitors to run the docker compose quickstart for sign-up, keys, try-it and admin.

## Problem
People who open the public Vercel URL to evaluate the project find a portal that looks broken,
which damages the reputation this project exists to build.

Vercel serves only the Next.js portal. `SERVER_URL` is unset there, so the `/api/*` rewrite falls
back to `http://localhost:4000`, which Vercel refuses (`DNS_HOSTNAME_RESOLVED_PRIVATE`). Checked
against https://api-portal-two.vercel.app/ on 2026-11-04:

| Route | What a visitor gets today |
| --- | --- |
| `/`, `/apis/sample` | 200, but the page shows "Loading…" (reported in JSO-193 as never finishing) |
| `/sign-up`, `/sign-in` | 200, but no server exists behind them |
| `/dashboard`, `/admin/apis` | 503 with a plain-text "portal server is unavailable" message |
| `/api/v1/health`, `/api/v1/apis` | 404 |

Elango chose this option on 2026-11-04 (JSO-193): ship a static demo on Vercel. A hosted Kong demo
may come later as its own spec.

It's solved when a signed-out visitor to the Vercel URL can read the sample API's reference, and
can tell without guessing that the live features need the quickstart.

## Users
- **Platform engineer** evaluating the project: reads the docs and decides whether to run the quickstart.
- **API consumer (developer)** who follows a shared link: sees what the developer experience looks like.
- **Portal admin self-hosting the portal:** must see no change at all from this feature.

## User stories
- As a platform engineer, I want to browse a real catalog and API reference on the public URL,
  so that I can judge the portal before installing anything.
- As a platform engineer, I want to be told clearly which features need the quickstart and how to
  run it, so that my next step is obvious.
- As a developer following a link, I want the demo to say what it can't do,
  so that I don't sign up or try a call and hit an error.
- As a portal admin self-hosting the portal, I want demo mode to stay off unless it's deliberately
  enabled, so that my portal never shows sample content in place of my real APIs.

## Acceptance criteria
"Demo deployment" means the portal built with demo mode enabled and no control-plane server.

1. **Given** the demo deployment **When** a visitor opens `/` **Then** the catalog shows a Sample
   HTTP API card with `v1.0.0`, its description and a link to `/apis/sample`, with no error page
   and no loading state left on screen.
2. **Given** the demo deployment **When** a visitor opens `/apis/sample` **Then** the API reference
   renders, and its title, version and operations (`GET /get`, `POST /post`, `GET /status/{code}`,
   `GET /uuid`, `GET /headers`) match `apps/server/seed/sample-api.openapi.yaml`, so that a change
   to the seed file shows up in the demo without a second copy to update.
3. **Given** the demo deployment **When** a visitor opens any page, at desktop or 375px mobile width
   **Then** a visible notice says this is a demo, names sign-up, API keys, try-it and admin as
   needing the quickstart, shows the command
   `docker compose -f deploy/docker-compose.yml up --build`, and links to quickstart instructions
   that open for a signed-out visitor with no GitHub access.
4. **Given** the demo deployment **When** a visitor looks at the header (including the mobile menu),
   the catalog and the API page **Then** no Sign in or Sign up link, "Get an API key" button, or
   copy telling them to create an account or paste a key is shown as if it were available; any
   control kept in its place leads to the quickstart instructions.
5. **Given** the demo deployment **When** a visitor uses the API reference **Then** they can't send
   a request, no request leaves the browser for `/api/v1/try-it` or `localhost:8000`, and the
   `http://localhost:8000/sample` base URL is labelled as the address in a local quickstart.
6. **Given** the demo deployment **When** a visitor goes directly to `/sign-in`, `/sign-up`,
   `/dashboard`, `/dashboard/apps/new` or `/admin/apis` **Then** they see a portal-styled page
   saying this feature needs the quickstart, with the same command and link as criterion 3, and
   not a 503, a plain-text error or a form that can't be submitted.
7. **Given** the demo deployment **When** a visitor opens an API that doesn't exist, such as
   `/apis/nope` **Then** the portal's API-not-found page appears with a link back to the catalog.
8. **Given** the demo deployment **When** a visitor loads `/` and `/apis/sample` **Then** the browser
   makes no request to `/api/*` or to any `localhost` address and logs no console errors; **and
   when** anyone requests `/api/v1/health` directly **Then** the response is a 404 and no proxy to a
   server is attempted.
9. **Given** demo mode is not enabled **When** the quickstart runs with
   `docker compose -f deploy/docker-compose.yml up --build` **Then** no demo notice appears, the
   spec 001 e2e journeys still pass (sign-up, key, try-it, admin import), and cold start stays under
   five minutes.
10. **Given** demo mode is not enabled and the server is unreachable **When** a visitor opens `/`
    **Then** they get the portal's existing error page, and not the sample catalog or the demo notice.

## Out of scope
- A hosted server, Postgres or Kong, and setting `SERVER_URL` on Vercel (possible later spec, per
  Elango's decision).
- A mocked try-it, fake sign-up or in-browser key flow. Cut because a fake success would misrepresent
  what the portal does against a real gateway.
- Showing any API other than the seeded sample in the demo.
- Marketing or landing-page content beyond the notice. Cut to keep this to one pull request.
- Analytics on demo visits.
- Any change to the server, the database or the gateway adapters.

## Open questions
- [x] The GitHub repo is private (checked 2026-11-04), so a README link returns 404 for visitors and
  they can't clone the code the command needs, since compose builds its images from source.
  **Decided (Elango, 2026-11-04): make the repo public before this merges.** Criterion 3 can't pass
  on the deployed site until then. Elango makes the change, after checking the code and git history
  are ready to be public.
- [x] Should pull request previews also run in demo mode, or only production? **Decided (Elango,
  2026-11-04): both previews and production.**
- [x] When is demo mode on? **Decided (Elango, 2026-11-04): whenever people visit the Vercel
  deployment.** It must still satisfy criteria 9 and 10, so it can't be inferred from `SERVER_URL`
  being unset or the server being down.
- [ ] How does the portal detect that it's running on Vercel, ideally with no variable to set by
  hand, and can someone deploying their own portal to Vercel with a real server turn it off?
  — tech-lead
- [ ] How does the `apps/portal` Vercel build read the seed file in `apps/server/seed/`, given
  criterion 2 rules out a second copy? — tech-lead
- [ ] Which Scalar configuration removes the send-request path for criterion 5, and does anything
  else in the reference still reach the network? — tech-lead
- [x] Spec 001 reserves "spec 002" for AWS API Gateway under its Out of scope list, and this spec now
  takes that number. **Decided (Elango, 2026-11-04): work only on Kong for now; other gateways come
  after that and take the next free number then.**

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/002-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
| Criterion | Test file | Result |
| --- | --- | --- |

### Bugs
<!-- One line per bug, each with its Linear issue: - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Screenshot |
| --- | --- | --- |

## Review  _(tech-lead)_

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
