---
id: 002
title: Static demo mode for the Vercel deployment
status: building   # draft → ready → designed → building → testing → uat → review → approved → done
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
Decision record: [ADR 0004](../adr/0004-demo-mode-is-a-build-time-switch.md).

**Approach.** Demo mode is decided once while the portal is built and baked into the bundle. A demo
build never talks to a server: it reads the sample from the seed file at build time, gates the live
routes with rewrites, and drops the `/api/*` proxy. A non-demo build behaves exactly as it does today.

**Answers to the tech-lead open questions**

| Question | Answer | How it was checked |
| --- | --- | --- |
| How does the portal detect Vercel, and can it be turned off? | `demo = PORTAL_DEMO_MODE == "on"` or (`VERCEL == "1"` and `SERVER_URL` empty). Nothing to set by hand. Someone with a real server on Vercel sets `SERVER_URL`, which they need anyway, and that turns it off. | Built a scratch Next 16.4.4 app (with `--webpack`) for each case and read `routes-manifest.json`: `VERCEL=1` on; `VERCEL=1` + `SERVER_URL` off; neither off. The Vercel project has no env vars set today. |
| How does the Vercel build read the seed file? | `next.config.ts` reads and parses it at build time in demo mode and inlines it through `env`. | Vercel clones the whole repo and runs `turbo run build` (deployment log for `65a203b`), so the file is on disk. In the scratch app, the parsed title rendered on the page. |
| Which Scalar config removes the send path, and what else reaches the network? | See **Scalar configuration** below. Nothing else reached the network. | Ran the installed Scalar 1.46.4 standalone bundle in headless Chromium with the seed document. On load, with the final flags: no external requests, no console errors, no Test Request or Send control, no visible input. Clicking through the buttons and pressing the shortcuts (flags as final, auth card still visible) also made no external requests and opened no send path. Not yet run through the React wrapper; the demo e2e covers that. |

**Components**

| Where | Change |
| --- | --- |
| `apps/portal/lib/demo-build.ts` (new) | `demoEnabled(env)` and `loadSampleDocument()`. Build-time only, imported only by `next.config.ts`. |
| `apps/portal/next.config.ts` | Becomes an async config function. Inlines `PORTAL_DEMO_ACTIVE` and `PORTAL_DEMO_SAMPLE_API` through `env`. In demo mode, `rewrites()` returns the gated `beforeFiles` list below and no `/api/*` rewrite. |
| `apps/portal/turbo.json` (new) | Package config: `{ "extends": ["//"], "tasks": { "build": { "env": ["VERCEL", "SERVER_URL", "PORTAL_DEMO_MODE"], "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/apps/server/seed/sample-api.openapi.yaml"] } } }`. |
| `apps/portal/lib/demo.ts` (new) | `isDemo()` reads `process.env.PORTAL_DEMO_ACTIVE`, spelled out literally so it's inlined. Holds `QUICKSTART_COMMAND` and `QUICKSTART_URL` (`https://github.com/zebrasoftwareservices-eng/api-portal#quickstart`). Safe in client code. |
| `apps/portal/lib/demo-data.ts` (new) | Server-only. Parses `PORTAL_DEMO_SAMPLE_API` into the document and a catalog entry: `slug: 'sample'`, with title, version, description and `gatewayBaseUrl` from `info` and `servers[0].url`. No invented IDs or dates; the catalog view takes a `Pick` of `Api`. |
| `apps/portal/lib/server.ts` | `currentUser()` returns `null` first thing in demo mode. Without this the root layout calls `localhost:4000` on every page. |
| `apps/portal/middleware.ts` | Returns `NextResponse.next()` first thing in demo mode, before creating the auth client. |
| `apps/portal/app/page.tsx` | Move the card grid into a view both modes share. Demo renders the sample entry and skips the "How it works" card's account and key steps. |
| `apps/portal/app/apis/[slug]/page.tsx` | Demo branch in the page and in `generateMetadata`: slug `sample` renders, anything else calls `notFound()`. No "Get an API key" button (or it links to the quickstart), no paste-your-key alert, base URL labelled as the local quickstart address. |
| `apps/portal/components/reference.tsx` | Export the dynamic Scalar import and the error boundary. |
| `apps/portal/components/demo-reference.tsx` (new) | Takes the document as a prop and renders Scalar with the demo configuration. Never calls `api.GET`. |
| `apps/portal/components/demo-notice.tsx` (new), `app/layout.tsx` | Notice rendered from the root layout, so it's on every page including not-found. |
| `apps/portal/components/header.tsx` | In demo mode, no sign-in or sign-up links in either nav; a quickstart link if the UX calls for one. |
| `apps/portal/app/quickstart-required/page.tsx` (new) | The page for AC 6. Calls `notFound()` unless `isDemo()`, so it doesn't exist on a real portal. |
| `README.md` | Short section on demo mode and the rule above. |

Copy and layout come from the UX section; only the behaviour is fixed here.

**Gated routes (AC 6).** `rewrites()` in demo mode returns `beforeFiles` rules sending `/sign-in`,
`/sign-up`, `/dashboard/:path*` and `/admin/:path*` to `/quickstart-required`. The URL stays as the
visitor typed it, the response is 200, and `:path*` also covers `/dashboard` and
`/dashboard/apps/[appId]`. Middleware runs before `beforeFiles`, which is why it needs the early
return. Checked in the scratch app: `/dashboard`, `/dashboard/apps/new` and `/sign-in` served the
rewrite target in demo mode, and a non-demo build kept its normal middleware response.

**`/api/*` (AC 8).** No rule exists in demo mode, so `/api/v1/health` gets Next's own 404 and no proxy
is attempted. Checked in the scratch app.

**Scalar configuration (AC 5).** The existing config, with these changes:

```ts
{
  content: sampleDocument,   // replaces url: no document request
  // proxyUrl removed
  hideTestRequestButton: true,
  hideClientButton: true,    // otherwise the sidebar links to client.scalar.com, a second way to send
  showToolbar: 'never',      // otherwise Share and Deploy show on localhost (JSO-172)
  telemetry: false,
  customCss: '.scalar-reference-intro-auth, .scalar-reference-intro-server { display: none !important; }',
}
```

- Hiding the auth card removes the key input, which has no purpose without a send path (AC 4). Code
  samples keep the `apikey` header, so the reference still shows how the API authenticates. The
  document isn't edited, so it still matches the seed (AC 2).
- `!important` is required: without it the rule loses the cascade and the card stays visible.
- Hiding the server card leaves the portal's own labelled base URL as the only address on show, apart
  from the code samples (AC 5). The auth rule was run in the browser; the server rule uses the same
  mechanism and the e2e must confirm it.

**API contract.** No change. `apps/server/openapi.yaml` and `packages/sdk` stay as they are: the demo
makes no API calls, and the 404 on `/api/*` comes from the portal having no route, not from the server.

**Data model.** No change. **Gateway adapter calls.** None.

**Dependencies.** `yaml` as a devDependency of `apps/portal`: the parser the server already uses to
read this file. Update `pnpm-lock.yaml` with it, or the quickstart's frozen install fails.

**Acceptance criteria to tests**

| AC | Covered by |
| --- | --- |
| 1, 2, 3, 4, 5, 6, 7, 8 | `deploy/e2e-demo/demo.test.ts` against a real demo build with no server |
| 9 | Existing quickstart journeys, plus `deploy/e2e/demo-off.test.ts` (no notice; `/quickstart-required` is 404) |
| 10 | `deploy/outage-smoke.mjs` with the server stopped |
| Detection rule | Unit tests on `demoEnabled` for every row in ADR 0004 |

**Risks**

| Risk | How it's handled |
| --- | --- |
| The Turborepo cache or strict env mode gives the Vercel build the wrong mode, leaving the site broken or showing a stale sample. | `apps/portal/turbo.json`. Check with `turbo run build --dry=json` that the hash changes with `VERCEL` and with the seed file, then confirm on a real preview. If `VERCEL` ever stops reaching the build, setting `PORTAL_DEMO_MODE=on` on the project is the fallback. |
| The quickstart breaks (the one rule). | Non-demo paths are unchanged, the seed isn't read, and the Dockerfile doesn't change. compose-smoke stays the gate, and the lockfile must be updated. |
| `env` inlining was proven with webpack only, because the scratch app's symlinks stop Turbopack, and the real build uses Turbopack. | The demo e2e runs against the default `next build`, so it proves it on first run. It's documented Next behaviour. |
| `createAuthClient()` in `lib/client.ts` is still imported by the header and might call `/api/auth/*`. | Not verified. AC 8's network assertion catches it. If it does, the header must load the auth client only outside demo mode. |
| A Scalar upgrade renames the CSS class or changes a flag. `scalar-reference-intro-auth` isn't a public API. | The e2e asserts no visible input, no Test Request or Send control and no `client.scalar.com` link, so an upgrade fails CI. |
| AC 3's link 404s until the repo is public. Checked on 2026-11-04: the repo URL returns 404 to a signed-out visitor. | Elango's decision: public before merge. Automated tests assert the link's `href`; the user-tester opens it signed out once the repo is public. **AC 3 can't pass on a deployed site before then.** |
| Previews need a Vercel login (`ssoProtection: all_except_custom_domains`; a deployment URL returned 302 and the production alias 200). So previews do run in demo mode as decided, but only team members can open them. | Not a defect. The user-tester signs in to test previews, and the signed-out checks (AC 3) can only be done on the production alias after merge. Testers shouldn't report the login as a bug. |
| Clicking through Scalar's controls with the auth card visible logged a `getSnippet` console error from Scalar. Which control caused it wasn't isolated, and the same run logged clipboard errors that only come from the headless browser. The page load was clean, which is what AC 8 tests. | The e2e fails on console errors during load. The user-tester switches code sample languages with the console open and files a bug if it reproduces with the auth card hidden. |
| The seed's description says "for trying your portal API key", and AC 1 requires that description. | Left as it is, because editing the seed would change the quickstart. UX can decide if the notice needs to address it. |

### Tasks
- [ ] [backend] JSO-203 CI wiring for the demo suite (no server changes): add `deploy/playwright.demo.config.ts` (`testDir: ./e2e-demo`, a `webServer` that builds the portal with `PORTAL_DEMO_MODE=on`, with no `SERVER_URL`, and starts it on its own port with `reuseExistingServer: false`), a root `test:e2e:demo` script, and a `demo-smoke` CI job that needs no Docker
- [ ] [backend] JSO-204 Extend `deploy/outage-smoke.mjs` for AC 10: with the server stopped, the portal's `/` shows the existing error page and contains neither the sample catalog nor the demo notice
- [ ] [frontend] JSO-205 Build switch: `lib/demo-build.ts` with unit tests for every detection case, async `next.config.ts` (`env`, demo `rewrites()` per the design), `apps/portal/turbo.json`, `yaml` devDependency and lockfile; helper imported statically from `next.config.ts`, with `yaml` loaded lazily inside it; confirm with `turbo run build --dry=json` that the hash changes with `VERCEL` and the seed file
- [ ] [frontend] JSO-206 Runtime seam: `lib/demo.ts`, server-only `lib/demo-data.ts`, early returns in `currentUser()` and `middleware.ts`, with unit tests
- [ ] [frontend] JSO-207 Catalog and API page in demo mode (AC 1, 2, 4, 7): shared catalog view, slug `sample` or `notFound()` in the page and `generateMetadata`, no key button or paste-your-key copy, base URL labelled as the local quickstart address
- [ ] [frontend] JSO-208 `components/demo-reference.tsx` with the exact Scalar configuration in the design (AC 2, 5), reusing the dynamic import and error boundary from `reference.tsx`
- [ ] [frontend] JSO-209 Demo notice in the root layout and demo header in both navs (AC 3, 4), at desktop and 375px
- [ ] [frontend] JSO-210 `app/quickstart-required/page.tsx`, 404 unless demo (AC 6), and the README demo-mode section
- [ ] [qa] JSO-211 `deploy/e2e-demo/demo.test.ts` for AC 1 to 8 against the demo build: catalog card; reference title, version and all five operations read from the seed file at test time; notice, command and link `href` on every page at desktop and 375px; header including the mobile menu; no Test Request, Send, visible input or `client.scalar.com` link; each gated route; `/apis/nope`; a network listener failing on any `/api/*`, `localhost` or `scalar.com` request and on console errors; `/api/v1/health` is 404
- [ ] [qa] JSO-212 `deploy/e2e/demo-off.test.ts` for AC 9: no notice on the quickstart and `/quickstart-required` is 404; run the full compose smoke, spec 001 journeys and the outage smoke; confirm cold start stays under five minutes
- [ ] [qa] JSO-213 Vercel preview check: signed in to Vercel, confirm the preview is in demo mode with no project env vars set; record that the signed-out check of AC 3 waits for the repo to go public and the merge

## UX  _(ui-designer)_
Full design: [`docs/design/002-vercel-static-demo-mode.md`](../design/002-vercel-static-demo-mode.md).
No new design tokens.

- **Demo notice:** a calm `--accent` band between the header and page content on every page. It says
  what needs the quickstart and has the command, **Copy** and **Quickstart instructions on GitHub**.
  It doesn't stick and can't be dismissed.
- **Header:** **Sign in** and **Sign up** are replaced by **Run the quickstart** in both navs.
- **Catalog:** no **How it works** card, and the card's address is labelled "Base URL in a local
  quickstart".
- **API page:** **Get an API key** is removed with nothing in its place, and a read-only note replaces
  the paste-your-key alert.
- **Quickstart required:** one page for every gated route, with the command, the link and **Go to APIs**.
  It repeats the notice's command by design, because AC 3 and AC 6 both require it.
- **Seed description:** stays word for word on the card. The notice directly above says keys need the
  quickstart, so it needs no extra wording (answers the question in the risk table).
- **Shared components:** `CopyButton` gets an optional `copiedMessage` prop so screen readers hear a
  sensible message, and new `DemoNotice` and `QuickstartCommand` components are specified.
- **README:** the design asks JSO-210 to add a clone step to the Quickstart section.

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
