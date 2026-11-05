---
id: 002
title: Static demo mode for the Vercel deployment
status: review   # draft → ready → designed → building → testing → uat → review → approved → done
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
| `apps/portal/lib/reference-document.ts` (added by JSO-220) | Display-only `{}` example for unconstrained JSON bodies, used by both references. The live reference now passes its loaded document as `content`. |

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
  content: referenceDocument(sampleDocument),   // replaces url: no document request; JSO-220 display example
  // proxyUrl removed
  hideTestRequestButton: true,
  hideClientButton: true,    // otherwise the sidebar links to client.scalar.com, a second way to send
  showDeveloperTools: 'never', // the installed types' name for showToolbar; otherwise Share and Deploy show on localhost (JSO-172)
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
- [x] [frontend] Fix JSO-221: API page version badge stretches across the full page width; it should hug its text as in design section 3.2 and on the catalog card, in both demo and live builds, at desktop and 375px. Elango asked for this in PR #3 on 2026-11-05.
- [x] [frontend] Fix JSO-220: Node.js (undici) sample for `POST /post` shows "Error generating snippet" and logs console errors on load once selected.
- [x] [frontend] Fix JSO-219: isolate intermittent quickstart signup/sign-in submissions that remain on the form, fix the cause and add deterministic regression coverage.
- [x] [backend] Fix JSO-218: investigate the 300-second quickstart timeout during server image packaging on the 4 GB QA host and verify startup within five minutes.
- [x] [backend] JSO-203 CI wiring for the demo suite (no server changes): add `deploy/playwright.demo.config.ts` (`testDir: ./e2e-demo`, a `webServer` that builds the portal with `PORTAL_DEMO_MODE=on`, with no `SERVER_URL`, and starts it on its own port with `reuseExistingServer: false`), a root `test:e2e:demo` script, and a `demo-smoke` CI job that needs no Docker
- [x] [backend] JSO-204 Extend `deploy/outage-smoke.mjs` for AC 10: with the server stopped, the portal's `/` shows the existing error page and contains neither the sample catalog nor the demo notice
- [x] [frontend] JSO-205 Build switch: `lib/demo-build.ts` with unit tests for every detection case, async `next.config.ts` (`env`, demo `rewrites()` per the design), `apps/portal/turbo.json`, `yaml` devDependency and lockfile; helper imported statically from `next.config.ts`, with `yaml` loaded lazily inside it; confirm with `turbo run build --dry=json` that the hash changes with `VERCEL` and the seed file
- [x] [frontend] JSO-206 Runtime seam: `lib/demo.ts`, server-only `lib/demo-data.ts`, early returns in `currentUser()` and `middleware.ts`, with unit tests
- [x] [frontend] JSO-207 Catalog and API page in demo mode (AC 1, 2, 4, 7): shared catalog view, slug `sample` or `notFound()` in the page and `generateMetadata`, no key button or paste-your-key copy, base URL labelled as the local quickstart address
- [x] [frontend] JSO-208 `components/demo-reference.tsx` with the exact Scalar configuration in the design (AC 2, 5), reusing the dynamic import and error boundary from `reference.tsx`
- [x] [frontend] JSO-209 Demo notice in the root layout and demo header in both navs (AC 3, 4), at desktop and 375px
- [x] [frontend] JSO-210 `app/quickstart-required/page.tsx`, 404 unless demo (AC 6), and the README demo-mode section
- [x] [qa] JSO-211 `deploy/e2e-demo/demo.test.ts` for AC 1 to 8 against the demo build: catalog card; reference title, version and all five operations read from the seed file at test time; notice, command and link `href` on every page at desktop and 375px; header including the mobile menu; no Test Request, Send, visible input or `client.scalar.com` link; each gated route; `/apis/nope`; a network listener failing on any `/api/*`, `localhost` or `scalar.com` request and on console errors; `/api/v1/health` is 404
- [x] [qa] JSO-212 `deploy/e2e/demo-off.test.ts` for AC 9: no notice on the quickstart and `/quickstart-required` is 404; run the full compose smoke, spec 001 journeys and the outage smoke; confirm cold start stays under five minutes
- [ ] [qa] JSO-213 Vercel preview check: signed in to Vercel, confirm the preview is in demo mode with no project env vars set; record that the signed-out check of AC 3 waits for the repo to go public and the merge
- [x] [frontend] Fix JSO-216: non-demo `/quickstart-required` returns a real 404 (`force-static`), in `b031ccc`; QA re-tests
- [x] [frontend] Fix JSO-217: unknown demo API title is `API not found · Developer Portal`, in `b031ccc`; QA re-tests

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

- Frontend (Fix JSO-221): badges now use `width: fit-content`, preventing the API page's grid from stretching the version badge while retaining its existing typography, padding and theme tokens. Added shared Playwright regressions at 1280px and 375px that compare the rendered badge width to its text plus padding; both failed before the fix and pass afterward in the production demo (3/3 reference tests) and real Compose portal (2/2 badge tests). These regressions run through the existing demo and live acceptance suites. `pnpm lint`, `pnpm typecheck`, `pnpm test`, direct test-file ESLint, Prettier and `git diff --check` pass; unchanged package results may use Turbo cache. JSO-221 awaits QA in In Review, so its Bugs entry stays unticked; JSO-222–225 and review suggestions are unchanged. The coordinator's existing status edit and task line are included; this worker did not change the spec status.

- Frontend (Fix JSO-220, commit `8cf603d`): isolated Scalar's undici failure to its object formatter receiving the generated JSON `null` for the seed's unconstrained `schema: {}`. A shared presentation helper adds a valid `{}` example only to unconstrained JSON request bodies without authored examples; the seed file, original document, schemas and explicit examples stay unchanged. Demo reference uses the helper, and the live reference now passes its already SDK-loaded document to Scalar instead of fetching it a second time.
- Added three document regression tests, a live-reference component test and a real Scalar browser regression that selects Node.js, verifies the POST sample, waits for persisted selection and reloads with no snippet or console errors. Run the demo regression with `pnpm exec playwright test --config apps/portal/playwright.reference.config.ts`; it is also imported by the existing Compose journeys. Initial test attempts needed an ESM config path correction, the actual tab/group locators and a polling assertion for Scalar's debounced persistence; the final regression passes without retries or longer timeouts.
- Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (59 portal tests; unchanged package results use Turbo cache), direct ESLint/Prettier checks pass, the dedicated production demo regression passes (1/1), `pnpm test:e2e:demo` passes (26/26), and `COMPOSE_PROJECT_NAME=portal-jso220-frontend pnpm test:e2e` passes (13/13, 28.3s) after a real `up -d --wait --build`. Removed only that test project's containers/network/database volume. JSO-220 moves to In Review for QA; its Bugs entry stays unticked, the spec status is unchanged, and minor UAT bugs JSO-221–224 remain outside this dispatched task.

- Frontend fix JSO-219 (`671cbe6`): reproduced the auth failure mode by holding JavaScript before hydration: the enabled SSR form accepted credentials and submitted a native GET, remained on `/sign-up`, and sent zero auth POSTs; the hydrated control sent one POST and reached `/dashboard`. The password field's native name also put its value into the query string in this reproduction. This establishes a concrete readiness defect, although the original QA failures did not capture enough request evidence to prove they had the same cause.
- Auth fields and submit controls now remain disabled in an HTML fieldset until the client effect runs after hydration; existing validation, auth calls and navigation are unchanged. Added SSR/hydration component coverage for both modes and two committed Playwright cases that hold script delivery, assert disabled controls before release, then submit and require one auth POST and the existing `/dashboard` redirect assertion. Both browser cases pass against a local Next dev server with a stub auth service (2/2, 4.0s); real Compose and the unchanged full journeys await QA. No retries, longer timeouts or relaxed assertions were added.
- Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (portal 53 tests, server 30; unchanged package results may use Turbo cache), and direct ESLint of the browser journeys plus Prettier checks pass. An initial browser attempt failed because the dev server had not started; both cases passed after startup. JSO-219 is In Review for QA; its Bugs item stays unticked. The spec status is unchanged, and this spec edit is intentionally uncommitted for the coordinator.

- Frontend (JSO-205–210, commit `b031ccc`): added the build-time switch, original-seed inlining, server-free catalog/reference, route gates, notice/mobile navigation and quickstart guidance; README includes cloning and mode detection. Added 24 tests (51 portal tests total); `pnpm lint`, `pnpm typecheck` and `pnpm test` pass (unchanged package checks may use Turbo cache), as do real demo-on and demo-off Turbopack builds.
- Verified Turbo cache invalidation with `turbo run build --dry=json`: default `9f90a9644a476a4b` → `VERCEL=1` `13f1db37cb29341c`; seed-only edit in an isolated copy → `8e381c91194964ed`. The shared server seed was never modified.
- Production Chromium smoke at 1280px and 375px passes: all five operations, no send controls/visible inputs/client link, no `/api/*`, localhost or Scalar network calls on catalog/reference, no load console errors, no horizontal overflow, mobile quickstart navigation, all gated routes and direct health HTTP 404. Repeatable local smoke: `/tmp/jso193-frontend-demo-smoke.mjs`; QA still owns the committed acceptance e2e suite.
- Installed Scalar types renamed `showToolbar` to `showDeveloperTools`; use `showDeveloperTools: 'never'` with the remaining design flags, without casts. Unknown API metadata returns the specified title while the page calls `notFound()`, matching the live-route metadata pattern. `/apis/nope` can stream HTTP 200: the smoke initially failed on its extra HTTP-404 assertion, and now verifies the required API-not-found h1, catalog link and exact title instead (AC 7).
- JSO-216: non-demo `/quickstart-required` initially streamed HTTP 200; marking this data-free route `force-static` resolves its `notFound()` at build time, verified HTTP 404 in the real non-demo build. JSO-217: unknown demo API initially used the generic title; corrected and verified `API not found · Developer Portal`. Both fixes await QA in In Review. No spec status or approval gate changed; public GitHub access still requires Elango's pre-merge action.

- Backend (JSO-203, commit `4d2ec03`): added the Docker-free demo CI job and root Playwright script; the demo config builds with `PORTAL_DEMO_MODE=on` and no `SERVER_URL`, then serves on 3100/3101 without reusing a server. Fixed config loading for the CommonJS root. Lint, tests and formatting pass; `test:e2e:demo --list` loads the config but reports no tests until QA adds JSO-211. After frontend commit `b031ccc`, re-ran `pnpm lint`, `pnpm typecheck` and `pnpm test`: all pass.
- Backend (JSO-204, commit `91df2ba`): the outage smoke now opens a fresh Chromium page with the control-plane server stopped, checks the existing error page, and rejects sample content and the demo notice; it restarts the server in `finally`. Verified against real Compose project `portal-jso193-backend`: quickstart built, started and rendered the seeded home page in 220.3s; outage smoke exited 0 with both Kong recovery and server-outage assertions passing. Removed the stack and its disposable volume afterward.

- Backend (Fix JSO-218, commit `13d89d5`): separated a frozen, offline, filtered production install from the build toolchain; runtime retains the server, workspace imports, migrations and original seed but excludes Scalar UI, Testcontainers and the auth CLI. The image shrank from 1,435,690,936 to 890,463,272 bytes (38%); `node_modules` from 952.9 to 509.9 MiB. Better Auth's existing locked optional peers still include Next; no lockfile or dependency versions changed. Added `node deploy/server-image-smoke.mjs`, which passes on the updated image and rejects the original image; real first-call smoke passes signup, key creation, Kong auth, try-it, one-time key and revocation. `pnpm lint`, `pnpm typecheck`, `pnpm test`, plus direct ESLint/Prettier on the new smoke pass.
- JSO-218 performance: the oversized runtime packaging predates demo mode (`6b007a4` introduced the unchanged original Dockerfile). On the same 4 GB Docker host with no running services, successive server-only `docker build --no-cache` measurements with cached Node base images and freshly downloaded dependency stores were **100.59s original → 77.58s updated**; image export/unpack **32.6s → 16.7s**. An earlier original run including Node base pulls took 94.78s, demonstrating host/network variance rather than an exact speed guarantee. Rebuilding **both** application images with `docker compose build --no-cache`, then running the unchanged quickstart against a new project/database, completed in **149.84s total**; its own `up --build`/home check took **39.9s**. That measurement used cached Node base images, redownloaded dependencies and pulled service images as needed; it is not a pristine-machine cold-start claim and no shared image/cache was deleted. Removed only `portal-jso218-backend` containers/network/database volume; bug remains for QA in In Review, spec status unchanged.

## Test report  _(qa-tester)_
| Criterion | Test file | Result |
| --- | --- | --- |
| 1 — seeded catalog, version, description and link; no loading state | `deploy/e2e-demo/demo.test.ts` | PASS at 1280px and 375px |
| 2 — original seed title, version, paths, methods and summaries | `deploy/e2e-demo/demo.test.ts`; `apps/portal/lib/demo-build.test.ts` | PASS; reads original server seed at test time, no duplicate fixture |
| 3 — notice, limitations, command and quickstart link on every route | `deploy/e2e-demo/demo.test.ts` | Local PASS at both widths on catalog, reference, missing API, guidance and all gated routes; signed-out destination accessibility BLOCKED pending public repo/merge (JSO-213) |
| 4 — desktop/mobile navigation and content do not offer unavailable auth/keys | `deploy/e2e-demo/demo.test.ts` | PASS at both widths, including mobile menu |
| 5 — reference cannot send requests; local base URL labelled | `deploy/e2e-demo/demo.test.ts` | PASS; no Test Request/Send controls, visible inputs, Scalar client link or forbidden requests |
| 6 — direct live routes show styled quickstart guidance | `deploy/e2e-demo/demo.test.ts` | PASS; HTTP 200, command/link, no forms, including nested dashboard/admin paths |
| 7 — unknown API shows not-found content, catalog link and title | `deploy/e2e-demo/demo.test.ts` | PASS; JSO-217 verified (streamed HTTP status is not an AC 7 assertion) |
| 8 — no API/localhost/Scalar requests or load errors; health 404 | `deploy/e2e-demo/demo.test.ts`; `apps/portal/e2e/reference-snippets.test.ts`; `apps/portal/lib/demo-build.test.ts` | PASS including persisted Node.js client/reload at both widths; listeners precede navigation; no demo API proxy |
| 9 — normal quickstart and spec 001 journeys; no notice; guidance 404; startup budget | `deploy/e2e/demo-off.test.ts`; `apps/portal/e2e/journeys.ts`; `deploy/quickstart-smoke.mjs`; `deploy/smoke.mjs`; `deploy/server-image-smoke.mjs` | PASS on recorded host/cache conditions: current both-image no-cache rebuild plus startup/home in 281.81s; current full suite 13/13; prior three fresh-stack runs 12/12 each; pristine-machine cold start remains unmeasured |
| 10 — server outage keeps existing error page | `deploy/outage-smoke.mjs` | PASS against real Compose; both Kong recovery and server-outage checks pass |

2026-11-05 post-fix re-test at `7d49a03` (includes server fix `13d89d5` and frontend fix `671cbe6`), with QA-only auth failure-path tests added afterward:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: PASS. An initial typecheck caught an unsupported Testing Library option in the new QA test; corrected before final validation. Unchanged package tasks used Turbo cache; additionally `pnpm exec turbo run test --force` passed all 12 tasks with zero cached tasks (90 tests: portal 55, server 30, Kong adapter 4, database 1), including real Testcontainers Postgres/Kong and pg-boss retries.
- `pnpm test:e2e:demo`: **26/26 PASS (1.2m)** against the real production demo build with no `SERVER_URL` and no Compose server running. All criteria 1–8 have automated coverage; deployed public accessibility in AC 3 is still blocked. The auth test file passes Prettier and the workspace lint.
- Complete **unmodified** `COMPOSE_PROJECT_NAME=portal-jso193-qa pnpm test:e2e`: **12/12 PASS (32.8s)**, **12/12 PASS (35.5s)**, **12/12 PASS (23.4s)**. Before each run, only this project's stack and database volume were removed and recreated with the same rebuilt app images. The first run immediately followed the timed startup, without a targeted warmup; later runs also followed fresh stack startup. No retries, longer timeouts, diagnostic hooks or relaxed assertions were added.
- JSO-219: both committed delayed-JavaScript browser regressions passed in all three runs against real Compose. Sign-in and sign-up inputs and submit controls stay disabled before hydration; no auth POST or query string appears, and releasing scripts enables input and submission, produces exactly one auth POST and redirects to `/dashboard`. This prevents accepting values before the handler is ready and confirms recovery when slow script delivery resumes. New `apps/portal/components/auth-form.test.tsx` cases also verify both modes preserve entered values through a transport failure and permit a successful retry. Three fresh-stack passes plus deterministic readiness coverage support closing the observed symptom; the original QA failure had no request trace, so this does **not** prove it had the same cause or rule out every possible intermittent cause.
- JSO-218: Docker Desktop aarch64, 8 CPUs, **3.825 GiB RAM**, no initial containers, no concurrent validation during timing. `docker compose -f deploy/docker-compose.yml build --no-cache` under `portal-jso193-qa` rebuilt both application images in **108.29s**; the unchanged `deploy/quickstart-smoke.mjs` then completed Compose `up --build`, fresh-volume initialization and seeded home rendering in **22.3s**. Combined monotonic wall time was **131.65s**, comfortably below 300s. Node 22 Alpine base layers and Postgres/Kong/httpbin service images were cached; application build/install/package steps reran, downloading the dependency tarballs again, and the script's subsequent build reused those freshly built layers. No shared images or caches were removed. This verifies startup within the budget **with both app images rebuilt**; a pristine-machine cold start remains unmeasured.
- `node deploy/server-image-smoke.mjs`: PASS for the unprivileged production runtime, workspace imports, original seed, migration journal/SQL files and exclusion of Scalar UI/Testcontainers/auth CLI. Fresh databases migrated and seeded successfully in all three stacks; `deploy/smoke.mjs` passes signup, key creation, real Kong auth, try-it, one-time key and revocation. `deploy/outage-smoke.mjs` passes both Kong recovery and server-unreachable error-page/no-demo assertions. A sandbox-blocked localhost smoke invocation was rerun with access and passed; it supplies no application failure evidence.

Failure-path coverage includes stale demo sessions, repeated invalid demo mutations, unknown API and nested gated routes (`deploy/e2e-demo/demo.test.ts`); delayed hydration and reference-load failure/retry (`apps/portal/e2e/journeys.ts`); auth transport failure/value retention/retry (`apps/portal/components/auth-form.test.tsx`); expired stored sessions, missing permissions, invalid input, duplicate requests and compensation (`apps/server/src/app.test.ts`); malformed imports (`apps/server/src/security.test.ts` and browser journeys); real gateway outage/idempotence (`apps/portal/e2e/gateway.ts`); and real pg-boss failure/retry (`apps/server/src/background-job.test.ts`).

Historical failures from 2026-11-04 remain relevant: the original quickstart exceeded 300s during server image export, and the first full browser run passed 8/10 with two auth redirect failures; two later fresh-stack runs passed 10/10. The new timing supersedes the cached-only 60.1s rerun as evidence for JSO-218, and the deterministic readiness fix plus three complete fresh-stack runs support closing JSO-219 with the causation limitation above. No equivalent failures or new bugs occurred during this re-test.

Disposition: JSO-218 and JSO-219 verified **Done**; JSO-212 **Done** and ticked; JSO-216/217 remain verified Done. No blocker or major bug remains open, so status is **uat** under the factory rule. **JSO-213 stays blocked and unticked**: QA did not push or open a PR, no preview exists, and signed-out AC 3 waits for Elango to make the repo public and merge. JSO-199 remains **In Progress** solely for that outstanding preview/public-access acceptance, with the local QA work complete. Only `portal-jso193-qa` containers/network/database volume were removed after validation; shared caches/images and other projects were untouched. Application code and approval gates were unchanged.

2026-11-05 JSO-220 QA cycle at `ea2e2c4` (application fix `8cf603d`), with QA-only demo regressions added afterward:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: PASS. Also ran `pnpm exec turbo run test --force`: all 12 tasks passed with zero cached tasks, including 94 tests (portal 59, server 30, Kong adapter 4, database 1) and real Postgres/Kong Testcontainers. Direct ESLint, Prettier and `git diff --check` pass for the changed test.
- `pnpm test:e2e:demo`: **27/27 PASS (21.1s)** against a production demo build with no `SERVER_URL`. The demo acceptance command now imports the shared JSO-220 browser regression, so CI covers Node.js selection, persisted `node/undici`, reload, rendered POST body and console errors. AC 8 additionally checks forbidden requests and console errors after persisted selection/reload at both 1280px and 375px.
- Expanded failure-path coverage repeats invalid POSTs to app creation, sign-in, sign-up and try-it with an expired session cookie; all return 404 in demo mode. Existing live coverage retains invalid inputs, missing permission, expired sessions, duplicate requests, auth failure/retry, failed reference load/retry and real gateway failure/recovery.
- Current Compose quickstart: both app images rebuilt with `--no-cache` in **127.59s**, followed by the unchanged `deploy/quickstart-smoke.mjs` in **153.8s**; combined monotonic time **281.81s**. The latter rebuilt additional layers after the generated `next-env.d.ts` formatting was restored, then initialized a fresh project/database and rendered the seeded home. Docker Desktop aarch64, 8 CPUs, 3.825 GiB RAM; Node base/service images cached, no shared caches/images removed. The final demo suite and workspace checks overlapped the initial rebuild, so this is a measured pass under these conditions rather than an isolated performance benchmark or pristine-machine cold-start claim.
- Complete unmodified `COMPOSE_PROJECT_NAME=portal-jso193-qa pnpm test:e2e`: **13/13 PASS (31.6s)** against the fresh stack, including both delayed-hydration auth cases, account/key/try-it/admin import, Node.js persistence/reload, reference retry, gateway outage/idempotence, seed convergence and ingress security. No retries, timeout increases or relaxed assertions.
- `node deploy/server-image-smoke.mjs`, `node deploy/smoke.mjs` and `COMPOSE_PROJECT_NAME=portal-jso193-qa node deploy/outage-smoke.mjs`: PASS. Real Kong accepts the created key and rejects missing/revoked keys; try-it succeeds; Kong outage compensates and retries without duplicates; server outage shows the existing error page with no demo fallback (AC 10).

Disposition for this cycle: **JSO-220 verified Done** in demo and live builds; its checklist item is ticked below. The four existing minor bugs JSO-221–224 remain open; no new bug or flaky failure was observed. Every criterion remains mapped above, and no blocker or major remains, so status is **uat**. JSO-213 remains an explicit deferred deployment/public-access check, and AC 3's signed-out destination access is still unverified pending Elango's repository visibility action and a preview; this report does not claim all acceptance criteria are fully passed. The current local QA dispatch is complete (JSO-199 Done); the earlier report's In Progress disposition is historical. Removed only this run's `portal-jso193-qa` containers/network/database volume; left shared images/caches and the pre-existing untracked portal AGENTS file untouched. No application code or approval gates changed.


2026-11-05 JSO-221 focused QA re-check at `cf7d174` (scope agreed by Elango through the coordinator):

- `pnpm exec playwright test --config apps/portal/playwright.reference.config.ts`: **5/5 PASS** against the production demo with no `SERVER_URL`. The existing version-badge regressions pass at 1280px and 375px, as does the Node.js returning-visitor regression. Added catalog regressions in `apps/portal/e2e/reference-snippets.test.ts` assert the shared-CSS badge still hugs its text and remains inside its card at both widths.
- `pnpm lint`, `pnpm typecheck`: PASS; `pnpm exec turbo run test --force`: **12/12 tasks, zero cached, 94 tests PASS**, including real Postgres/Kong integration coverage. Direct ESLint, Prettier and diff checks pass for the added test.
- `pnpm exec playwright test --config deploy/playwright.config.ts --grep 'version badge|Node.js POST samples'`: **5/5 PASS (8.3s)** against a freshly rebuilt, healthy real Compose stack (`portal-jso221-qa`). Both API badges and catalog badges pass at 1280px and 375px; inspected live catalog screenshots at both widths confirm compact, readable badges.
- `gh pr checks 3`: **all required checks PASS** at `cf7d174813d75f026566d775a8ae3285075f3c53`, for both push and PR runs. [PR CI run 42006422544](https://github.com/zebrasoftwareservices-eng/api-portal/actions/runs/42006422544) records **29/29 demo tests**, **15/15 live tests**, workspace lint/typecheck/test and SDK freshness, first-call and outage smokes. Its unchanged quickstart timer reports **173.0s** for Compose build/start plus seeded home on the GitHub runner; job duration includes setup and the other checks. These CI results cover the wider run and precede this cycle's two added catalog tests, which passed locally on both builds.

Disposition: **JSO-221 verified Done** and ticked below; no new bug or flaky failure observed. Remaining JSO-222–225 are minor, so status returns to **uat** and JSO-199 is Done for this scoped re-check. Removed only this run's Compose containers/network/database volume; no application code, shared images/caches, generated-file commits, pushes or approval gates changed.

The acceptance-to-test mapping and failure-path coverage above remain applicable. Per the agreed scope, this cycle does not repeat the full local browser suite, three-run validation, outage smokes or quickstart timing; the earlier local results remain historical evidence. Deployment/public-access AC 3 verification remains tracked separately by JSO-213.

### Bugs
- [x] JSO-220 Node.js (undici) POST snippet and returning-visitor load errors (major; fixed in `8cf603d`, production demo and real Compose selection/persistence/reload verified by QA and re-tested in the browser; Done)
- [x] JSO-221 API page version badge stretches across the full page width (minor; fixed in `cf7d174`, QA badge/catalog regressions pass on production demo and real Compose at 1280px/375px; Done)
- [ ] JSO-222 Catalog browser tab title is "APIs" without "· Developer Portal" (minor)
- [ ] JSO-223 Real portal's 404 at `/quickstart-required` has the tab title "Quickstart required" (minor)
- [ ] JSO-224 API page has two h1 headings (minor)
- [ ] JSO-225 Quickstart API reference lists operations in a different order from the OpenAPI document (minor)
- [x] JSO-219 Intermittent quickstart signup/sign-in fail to redirect (major; fixed in `671cbe6`, three fresh-stack full runs and deterministic hydration regressions pass; original causation unproven; Done)
- [x] JSO-218 Quickstart exceeds five-minute budget on 4 GB Docker QA host (major; fixed in `13d89d5`, both app images rebuilt plus startup/home in 131.65s with cached base/service images; pristine cold start unmeasured; Done)
- [x] JSO-216 Non-demo quickstart-required streamed HTTP 200 (fixed in `b031ccc`, real Compose HTTP/browser 404 verified; Done)
- [x] JSO-217 Unknown demo API used generic browser title (fixed in `b031ccc`, production Playwright regression verified; Done)

## User testing  _(user-tester)_
**Latest round: limited to the version badge, not a full UAT** (2026-11-05 at `24005c0`, scope agreed by Elango through the coordinator). The only application change since the last full round is the one CSS line in `cf7d174`, confirmed with `git diff 521abd0..HEAD`. User stories and acceptance criteria were not re-walked, and `.badge` uses outside these two pages weren't checked.

| Page | Width | Local production demo | Quickstart | Screenshots |
| --- | --- | --- | --- | --- |
| Catalog card | 1280px | Pass | Pass | `49`, `53` |
| `/apis/sample` | 1280px | Pass | Pass | `50`, `54` |
| Catalog card | 375px | Pass | Pass | `51`, `55` |
| `/apis/sample` | 375px | Pass | Pass | `52`, `56` |

The badge is 48.6px wide everywhere, exactly its text plus padding and border. No console errors, failed requests or new bugs turned up on these pages. The catalog card's base URL still runs into "View reference →", which is the known minor JSO-162. Details and the screenshot crop note are in `docs/uat/002/badge-retest-notes.md`.

**Previous full round** (the results below still stand for everything except the badge):

Re-tested 2026-11-05 at `4134640`, after the JSO-220 fix (`8cf603d`), in Orca's built-in browser. Criteria 1–8 ran against a local production demo build (`PORTAL_DEMO_MODE=on`, no `SERVER_URL`), and criteria 9–10 against the Compose quickstart. No Vercel deployment was tested. Evidence is in `docs/uat/002/`: `36`–`48` are from this round, and `01`–`35` from the first round at `7d49a03`.

| User story | Result | Screenshot |
| --- | --- | --- |
| Platform engineer browses a real catalog and API reference | Pass. The earlier failure (JSO-220) is fixed | `01-catalog-desktop.png`, `36-retest-demo-node-undici-post-after-reload.png`, `39-retest-mobile-reference-undici.png` |
| Platform engineer is told what needs the quickstart and how to run it | Pass locally; the GitHub link is known-blocked until the repo is public | `37-retest-gated-sign-in.png`, `23-quickstart-link-private-repo-404.png` |
| Developer following a link is told what the demo can't do | Pass | `37-retest-gated-sign-in.png`, `38-retest-not-found.png`, `40-retest-mobile-menu.png` |
| Self-hosting admin never sees demo content | Pass, with minor JSO-223 and JSO-225 | `41-retest-quickstart-catalog.png`, `45-retest-quickstart-try-it-post-200.png`, `47-retest-quickstart-admin-import.png`, `48-retest-quickstart-server-down-error.png` |

| Criterion | Browser result |
| --- | --- |
| 1 Catalog | Pass at desktop and 375px |
| 2 Reference matches the seed | Pass: title, version and five operations, in the seed's order |
| 3 Notice on every page | Pass for the notice and command on all 11 routes at desktop and 4 routes at 375px. The link's `href` is correct. **Known-blocked:** the link returns GitHub's 404 until Elango makes the repo public before merge (JSO-213) |
| 4 No unavailable auth or key controls | Pass, including the mobile menu |
| 5 Can't send a request | Pass: no visible Send, Test Request or input, and no request to `/api/v1/try-it` or `localhost:8000`. A direct POST to `/api/v1/try-it` returns 404 |
| 6 Gated routes | Pass on all five, plus nested `/dashboard/apps/abc` and `/admin/foo/bar` |
| 7 Unknown API | Pass; **Go to APIs** returns to the catalog |
| 8 No forbidden requests or console errors | **Pass, including a returning visitor** with Node.js undici remembered, at desktop and 375px. `/api/v1/health` and `/api/v1/apis` return 404 |
| 9 Quickstart with demo off | Pass: no notice, `/quickstart-required` is 404. Walked sign-up, key (200 through real Kong, 401 without), try-it and admin import (an invalid file publishes nothing, a valid one publishes). `up -d --wait --build` took 30s **with cached layers, so this is not a cold-start measurement** |
| 10 Server unreachable | Pass: the existing error page, with no sample catalog or notice |

**JSO-220 re-test** (stays Done)

| Check | Demo | Quickstart |
| --- | --- | --- |
| Shell curl sample for `POST /post` | `--data '{}'`, no null body | Same |
| Node.js undici sample | `body: JSON.stringify({})`, no snippet error | Same |
| Reload as a returning visitor | `node/undici` remembered, sample correct, 0 console errors | Same |
| 375px as a returning visitor | Correct | Correct |
| Try-it `POST /post` with a real key | Not available, by design | 200 through Kong; `{}` echoed back |

**Notes**
- **Other clients:** on the demo build, all 39 clients in the picker showed no snippet error and logged no console errors. They were checked with a pattern match on the rendered text, and only the samples it flagged were read in full. Those were valid, but with two quirks in how the samples treat an empty body: clj-http leaves the body out, and PHP cURL and Guzzle encode it as `[]`. Neither is filed, because nothing errors and the sample API accepts any body. On the quickstart, only curl and undici were checked.
- **New this round:** JSO-225 (minor). The quickstart reference lists `/status/{code}` last, not in the seed's order. It was already visible in first-round screenshot `26`, so the fix didn't cause it, and the demo isn't affected.
- **Worked well:** the wrong-password message, the empty-form validation, keyboard order and Enter on the catalog card, focus returning to the menu button after Escape, and no sideways page scrolling at 375px.
- **Standalone Chromium evidence:** `36` and `43` were taken with Playwright's Chromium against the same two builds, because Orca's capture couldn't show that part of the page. The text readings in the table above are from Orca's browser, and the Chromium run independently confirmed undici after reload, with no snippet or console errors.
- **Test tool artifacts, not bugs:** Orca's `screenshot` often comes out white once the page is scrolled well down, whichever client is selected, while the DOM has the right content there. Chromium painted the same offsets normally. Forcing a tall `orca viewport` gave a tiled or blank image. The first round's note that sidebar jumps paint normally doesn't always hold.
- **Not covered this round:** ⌘↵ on the demo and the clipboard contents after Copy were checked in the first round and not repeated; this round confirmed only the "Copied" state. Expired sessions weren't tested. The mobile quickstart check covered the reference only. Mobile used 375px (the width in the criteria), not the role file's 390px. JSO-213 (Vercel preview and signed-out link) waits for the PR.
- The reference's Developer Tools, Share and Deploy toolbar on the localhost quickstart is the known JSO-172 behaviour, so it isn't filed. The temporary API keys were kept out of the screenshots, and this run's test stack and database were removed afterward.

## Review  _(tech-lead)_
Reviewed `521abd0` on 2026-11-05 against `origin/main` (`65a203b`). **Result: no blocking findings, status `approved`.** Three things must still happen before merge; see **Before merge**.

The local `main` has diverged and doesn't contain spec 001, so `git diff main...HEAD` shows 404 files. The real change is 46 files. Local `main` also holds `b93205b`, which isn't on `origin/main`, so Elango should sort that out before updating it.

**Checks run**

| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | Pass |
| `pnpm exec turbo run test --force` | Pass: 12 of 12 tasks, none cached, because `pnpm test` itself was all cache hits |
| Real `VERCEL=1` build through Turbo, with no `PORTAL_DEMO_MODE` or `SERVER_URL` | Demo on: gated rewrites present, no `/api/*` rewrite, notice prerendered, no seed text in the client chunks. Every test suite forces `PORTAL_DEMO_MODE=on`, so this was the only run of the Vercel detection path through a full build |
| HTTP and Chromium probes of that build (1280px, 375px) | Gated routes 200; `/api`, `/api/v1/health` and `/api/auth/session` 404; server and auth cards `display: none`; the only visible `localhost:8000` text outside the Scalar samples is the labelled base URL; no external requests |

**Not re-run by this review:** `pnpm test:e2e:demo`, the Compose quickstart and the e2e journeys. QA passed them at `4134640`, and only docs have changed since. Their results are in the Test report.

**Against the checklist**
- **Acceptance criteria:** all 10 are implemented and tested, except that AC 3's signed-out link can't pass until the repo is public, and AC 9's cold start hasn't been measured on a clean machine.
- **Design and contract:** the code matches the design. `apps/server/openapi.yaml` and `packages/sdk` are unchanged. This review updated the Technical design for `showDeveloperTools` and `reference-document.ts`.
- **Errors, secrets, inputs, gateway:** no new endpoints, secrets or gateway calls.
- **Quickstart:** `SERVER_URL` is set in the portal Dockerfile, so its build stays non-demo. `next.config.ts` opens the seed and loads `yaml` only in demo mode.
- **Changes on the live path:** the ADR describes non-demo paths as unchanged, but the bug fixes changed four: `apps/server/Dockerfile` (JSO-218), `auth-form.tsx` (JSO-219), `reference.tsx` (JSO-220) and the `header.tsx` import. The first three each fixed a major bug and the Compose journeys cover them. The PR description should name all four.

**Blocking**

None.

**Suggestions** (each is a Backlog follow-up; none blocks merge)

- `suggestion` JSO-226, `deploy/e2e-demo/demo.test.ts:169`: no e2e asserts the hidden server and auth cards, though the design says the e2e must. They're hidden today, but a Scalar class rename would bring back an unlabelled base URL with no failing test.
- `suggestion` JSO-227, `apps/portal/components/header.tsx:43`: the dynamic import sits outside any error handling, so a chunk load failure makes sign-out fail silently on the live portal. The import isn't needed, because `lib/client` makes no request on load (`reference.tsx:7` imports it statically on the demo API page).
- `suggestion` JSO-228, `apps/portal/app/apis/[slug]/page.tsx:32`: `/apis/nope` shows the right page but answers HTTP 200, because `loading.tsx` starts the stream first. AC 7 passes; it's a soft 404 on a public site.
- `suggestion` JSO-229, `.github/workflows/ci.yml:56`, `apps/portal/playwright.reference.config.ts`, `AGENTS.md:44`: `server-image-smoke.mjs` isn't in CI, the reference config duplicates the demo config, and `pnpm test:e2e:demo` isn't documented.
- `suggestion` JSO-230, `apps/portal/AGENTS.md`, `apps/portal/next-env.d.ts:3`: Next's generated files dirty the worktree after a dev run or a build.
- `apps/portal/app/quickstart-required/page.tsx:6`: a side effect of `force-static`, added as a comment on JSO-223 rather than a new issue.

The open minor bugs JSO-221 to JSO-225 don't block either. JSO-221 (stretched version badge) is on the demo's main page, so it's the one most worth fixing before going public.

**Before merge** (not code findings, so they don't send the spec back to `building`)
1. **Push the branch and get CI green.** The branch isn't on GitHub, so no CI job has ever run on it, including the new `demo-smoke`. `compose-smoke` will also give the first cold-start measurement on a clean runner. QA's slowest local run was 281.81s against the 300s limit, with base images cached.
2. **Run JSO-213 on the PR's Vercel preview.** Nothing has run on Vercel itself yet, and this feature exists only for that platform.
3. **Elango makes the repo public**, per the decision above. Until then the quickstart link in AC 3 returns 404 for visitors.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
