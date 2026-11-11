---
id: 019
title: Unified portal — developer journey
status: done # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-07
linear: JSO-316
linear_stages: requirements=JSO-353 design=JSO-354 ux=JSO-355 backend=JSO-356 frontend=JSO-357 test=JSO-358 uat=JSO-359 review=JSO-360 release=JSO-361
---

# 019 — Unified portal: developer journey

## Summary

Developers get consistent navigation and an API page that shows the right next step for their
access, the first shippable slice of the
[unified portal UX](../design/jso-316-unified-api-portal.md).

## Problem

A developer moving from reading an API to making a first request has to work out the next step
alone. Every signed-in developer sees **Get an API key** on an API page, even when one of their
apps already has access, so the obvious action leads them to create an app they don't need. The
try-it instruction repeats that advice. The navigation says **Dashboard**, the page says **Your
apps**, and My apps is an unadapted table on a phone. A faster first successful request is what
adoption depends on.

JSO-316 asked for implementation-ready UX, and its design document is committed (f6a782a). That
document covers far more than one pull request, and much of it depends on features that don't
exist yet (specs 005, 009, 010, 012). This spec ships only the part that works on today's API, with
no server or contract change. It is also the migration the design document requires: the shipped
001/004 screens stay authoritative except for the changes the criteria below name.

We'll know it's solved when a developer who already has access is sent to their app instead of
being told to create another, and the journey from the catalog to a successful request works at
375 px with no outside help.

## Users

- **API consumer (developer):** the main audience, from first visit to first request.
- **Visitor:** reads APIs before signing up.
- **Portal admin:** sees the same navigation, plus **Admin**.

## User stories

- As a developer, I want an API page to show the next step for my access, so that I don't create
  an app I don't need.
- As a visitor, I want to go from an API to a key without losing my place, so that signing up
  doesn't interrupt me.
- As a developer, I want to go from an app to making a call in one step, so that I can test
  my new key straight away.
- As a developer on a phone, I want navigation and My apps to work at my screen width, so that I
  can check my apps without zooming or scrolling sideways.
- As a developer, I want the portal to say when it can't confirm my access, so that a temporary
  failure doesn't send me off to create a duplicate app.

## Acceptance criteria

"Has access" means an app in `GET /v1/apps` has this API in its `subscriptions`, whether or not it
has an active key. Plans and approval don't exist yet, so this is the only access state. The access
check has failed when `GET /v1/apps` returns anything other than 200 or 401, the request fails
at the network level, or no response arrives within 10 seconds. A 401 means the session has ended,
so the page treats the person as signed out, on the first check or on a retry.

| Person on `/apis/{slug}`                 | Action shown                      | Goes to                                         |
| ---------------------------------------- | --------------------------------- | ----------------------------------------------- |
| Signed out, or access check returned 401 | **Get an API key**                | Sign-up, then create app with this API selected |
| Signed in, access check running          | No access action; see criterion 5 | —                                               |
| Signed in, no app has access             | **Get an API key**                | Create app with this API selected               |
| Signed in, one app has access            | **Open in {app name}**            | That app's page                                 |
| Signed in, several apps have access      | **View your apps**                | My apps, with those apps highlighted            |
| Signed in, access check failed           | No access action; see criterion 6 | —                                               |

1. **Given** a visitor, a developer and an admin at 1280 px **When** each opens `/` **Then** the
   navigation links read, in order: visitor APIs, Sign in, Sign up; developer APIs, My apps; admin APIs,
   My apps, Admin. The word Dashboard appears nowhere in the header and `/dashboard` still loads.
   **And** exactly one link has `aria-current="page"`: APIs on `/` and `/apis/{slug}`, My apps on
   `/dashboard` and `/dashboard/apps/{id}`, and Admin on `/admin/apis`. **When** the developer opens
   My apps, create app and an app's page **Then** My apps has the heading "My apps" and the page title
   "My apps · Developer Portal", including while loading, and the breadcrumb on the other two pages
   starts with My apps. The label "Your apps" appears on none of them. Sentences and actions that
   say "your apps", such as **View your apps** and "We couldn't load your apps.", stay as they are.
2. **Given** a signed-in developer at 375 px **When** they open the menu by keyboard, press Tab past
   the last item and close it with **Close menu** or Escape **Then** focus starts on the close
   button, stays inside the menu while it is open, and returns to the menu button. **When** they
   reopen it and select My apps **Then** My apps loads with the menu closed.
3. **Given** a signed-out visitor on an API page **When** they select **Get an API key** and sign up
   **Then** they arrive at create app with that API's checkbox checked and focus in the app name
   field. **Given** a signed-in developer whose apps have no access to that API **When** they select
   **Get an API key** **Then** they reach the same screen in the same state. **Given** a signed-out
   developer with an account **When** they select **Get an API key**, follow **Sign in** or **Sign in
   instead** from the sign-up page and sign in **Then** they arrive at that API's page, not create app,
   with the action the table gives them. **When** they instead follow **Create an account** from that
   sign-in page and sign up **Then** they arrive at create app as above. A sign-in that began with a
   signed-out visit to `/dashboard/apps/new?api={slug}` still returns to create app.
4. **Given** a developer with access through exactly one app, including an app whose keys are all
   revoked **When** they open that API's page **Then** the action is **Open in {app name}** and opens
   `/dashboard/apps/{id}`, and "Get an API key" appears nowhere on the page. With an 80-character app
   name at 375 px, the page doesn't scroll sideways. **Given** a developer
   with access through two apps and a third app without access **When** they
   select **View your apps** **Then** My apps lists all three apps in their usual order, with no filter
   control. Both apps with access carry a text label naming the API, separate from the APIs column and
   not color alone, and the third doesn't. **When** they open My apps without that link **Then** no app
   has the label. **When** a My apps link names an API none of their apps can reach **Then** the normal
   list loads with no label and no error.
5. **Given** a signed-in developer and `GET /v1/apps` delayed by 5 seconds **When** they open an API
   page **Then** the title, base URL and reference render before the response arrives, and neither an
   access action nor a failure message is shown. **When** the response arrives **Then** the action
   from the table appears. **Given** `GET /v1/apps` returns 401 **When** they open an API page **Then**
   the signed-out row applies: **Get an API key** goes to sign-up, and no failure message is shown.
6. **Failure path. Given** a signed-in developer and an access check that fails with 500, 503, a
   network error or no response within 10 seconds **When** they open an API page **Then** the title,
   base URL and reference still render, the page says "Access status couldn't be confirmed" with
   **Try again**, no access action is shown, and no status code or problem detail appears. A response
   that arrives after the 10 seconds doesn't change this. **When** the check then succeeds and they
   select **Try again** **Then**, without a page reload, the action from the table replaces the
   message and takes keyboard focus, and a value typed into the reference's Authentication Value
   field is still there. **When** the check fails again **Then** the message stays.
7. **Given** each row of the table above **When** the try-it instruction renders **Then** its 403
   recovery step is exactly the sentence for that row, and it names no action that isn't on the page:
   - Signed out, 401 or no access: "If you get a 403, select Get an API key to create an app that
     includes this API."
   - One app: "If you get a 403, select Open in {app name} and use one of its active keys."
   - Several apps: "If you get a 403, select View your apps and use a key from an app with access."
   - Check running or failed: "If you get a 403, use a key from an app that includes this API."
8. **Given** a developer with three apps, one with an unbroken 80-character name and one with 10 APIs
   **When** they open My apps at 1280 px **Then** the table columns are Name, APIs, Active keys and
   Created. **When** they open it at 375 px **Then** the apps are a list of cards, each with its name,
   APIs, active key count, created date and **Open app**, which opens that app. **And** at 375 px and
   at 640 px (1280 px at 200% zoom), the page's scroll width doesn't exceed its viewport width.
9. **Given** an app with three APIs, tested with and without an active key **When** the developer
   opens its page **Then** every row of its APIs list has **Try this API**, and selecting one opens
   `/apis/{slug}` for that API. The **Try your key** card behaves as it does today.
10. **Given** the static demo build (spec 002) **When** a visitor opens `/` and `/apis/sample` **Then**
    the navigation offers only APIs and **Run the quickstart**, no My apps or access action appears, and
    the browser makes no request to `/api/v1/apps`.

## Out of scope

What we cut from the design document, and where it belongs:

- **Admin overview and local navigation:** only one admin screen exists, so tabs would have a single
  entry. Comes with 005; the **Admin** link keeps pointing at `/admin/apis`.
- **Gateway list, health, sync and secret replacement:** 005 and later; they need new contracts.
- **Access requests, approval states, tier labels and the Request access action:** 009 and 010.
- **"No key required" access state:** the API contract can't tell us an API is public.
- **Key rotation:** no contract yet; 009 owns regenerating keys.
- **Catalog search and filters:** 012. The design says to omit controls until they work.
- **Account settings in the account menu:** 007.
- **Overview / API reference / Access tabs on the API page:** there's no content for Overview or
  Access yet, and tabs risk losing Scalar's request state.
- **Access, Credentials and Updated columns on My apps:** every app has at least one API
  (`CreateAppRequest.apiIds` has `minItems: 1`, and no endpoint removes one), so **No API access**
  can't occur, and "{n} active" would replace the API names shown today. Apps also have no updated
  time. The shipped columns stay until access has more states (JSO-363, with 010).
- **Filtering My apps:** **View your apps** highlights matching apps and keeps every app listed. A
  filter would also need a clear control and its own states.
- **Gateway setup form and API import placement (design §7.2, §7.4):** settled in 005 (JSO-362).
- **Changes to key handling:** this spec doesn't touch the key reveal or credential API, so the
  checks from 001 and 004 still apply and it adds no new secret criterion.
- **Server, contract and database changes:** none. This is a frontend-only pull request, so the
  backend stage (JSO-356) has no work.
- **New shared component library:** only build what these screens use. `ResponsiveCollection` and
  the other components in design §11.2 are added when their first feature needs them.

## Open questions

None open. Elango accepted every recommendation at the spec gate on 2026-11-07; the decisions are
recorded here.

- [x] Is this the right scope for JSO-316, given that the issue's own criteria are about the design
      document already committed? — Elango
  - **Decision:** Keep this slice on JSO-316 and add it to the issue's description.
  - **Reason:** The worktree and all nine stage issues already hang off JSO-316, and a new issue would redo that setup for no benefit.
- [x] The issue calls `work/api-portal-wireframes.html` the approved direction, but it isn't in the
      repo or its history. Does the design document match what was approved? — Elango
  - **Decision:** The design document is the source of truth. Add the file to the repo only if a comparison is still wanted.
  - **Reason:** This slice comes from the shipped screens and the document, so the missing file doesn't block it.
- [x] Should spec 019 get a sprint in `docs/roadmap.md`? — Elango
  - **Decision:** Sprint 1, as an extra feature, started when 003 reaches testing. Recorded in the roadmap.
  - **Reason:** Later sprints don't move, and 003's frontend fixes may touch the same screens, so running them side by side risks conflicts.
- [x] Should sign-in from the sign-up page return to the API page instead of create app? — Elango
  - **Decision:** Yes. Added to criterion 3.
  - **Reason:** Otherwise existing developers can still be led to create the duplicate app this spec exists to prevent.
- [x] How long should the portal wait for the access check? — Elango
  - **Decision:** 10 seconds with no response is a failed check. Added to the access-check definition and criterion 6.
  - **Reason:** The failure message already gives developers a way to recover, and the reference stays usable during the wait.
- [x] What should the API page do if `GET /v1/apps` returns 401? — Elango
  - **Decision:** Show the signed-out row of the table. Added to the table and criterion 5.
  - **Reason:** A 401 is a definite answer that the session has ended, so there's no failure to report and the signed-out action still works.
- [x] Should **View your apps** filter My apps or highlight the matching apps? — Elango, with the ui-designer
  - **Decision:** Highlight, with text on the matching apps, and keep every app in the list. Added to criterion 4. The ui-designer sets the label's wording.
  - **Reason:** A filter also needs a clear control and its own states, which is more to build for very little gain.
- [x] Should the My apps heading and breadcrumbs become "My apps"? — Elango, with the ui-designer
  - **Decision:** Yes. Rename the headings, breadcrumbs and page title, and keep the action label **View your apps**. Added to criterion 1.
  - **Reason:** The Problem section names this mismatch, and changing only the navigation label would leave it in place.
- [x] What is the exact 403 recovery copy for each row of the access table? — Elango, with the ui-designer
  - **Decision:** The four sentences in criterion 7.
  - **Reason:** Each sentence names only what's on the page.
- [x] Design §7.2 (gateway setup: page or dialog) and §7.4 (where import lives) still defer to a
      feature spec. Should 019 wait for them? — Elango, with the ui-designer and the 005 product manager
  - **Decision:** No. Settle both in spec 005, tracked in JSO-362.
  - **Reason:** 005 is the first feature that needs these screens, and nothing in this slice depends on them.

---

<!-- Sections below are filled by later stages. -->

## Technical design _(tech-lead)_

Frontend-only, as the spec requires. `apps/server/openapi.yaml`, the database and the gateway
adapters don't change, and neither does `packages/sdk`. There are no `[backend]` tasks, so the
backend stage (JSO-356) has no work.

No ADR. Nothing here is a lasting architecture choice: it is one page's client state, a small
helper for one sign-in link, and a card layout for one screen.

### Components

| File | Change |
| ---- | ------ |
| `apps/portal/lib/access.ts` (new) | Access rules as plain functions, with no React, so all six table rows can be unit-tested. |
| `apps/portal/lib/client.ts` | Add `quietApi`, a second generated client with no middleware. Share the base URL with `api`. |
| `apps/portal/components/api-access.tsx` (new) | `ApiAccessProvider` holds the access state. `ApiAccessAction`, `ApiAccessStatus` and `TryItRecovery` read it. |
| `apps/portal/app/apis/[slug]/page.tsx` | Non-demo branch only: wrap the page in the provider and use the three components. The demo branch stays as it is, so it never mounts the check. |
| `apps/portal/lib/navigation.ts`, `components/auth-form.tsx` | Compute the link between sign-up and sign-in (criterion 3). |
| `apps/portal/components/create-app.tsx` | Focus the app name when `slug` is set; rename the breadcrumb. |
| `apps/portal/components/header.tsx` | Rename the link, fix `aria-current`, set the menu's initial focus. |
| `apps/portal/components/dashboard.tsx`, `app/dashboard/page.tsx`, `app/dashboard/loading.tsx` | Rename to My apps, read `?api=`, add the access label and the cards. |
| `apps/portal/components/app-detail.tsx` | Rename the breadcrumb, add **Try this API** to each APIs row. |
| `packages/ui/src/styles.css` | Card list, table/card switch, wrapping for long names in actions. |

### Access check

**Why it runs in the browser.** Criterion 5 needs the title, base URL and reference on screen
before the response arrives, and criterion 6 needs a retry with no page reload. The server page
keeps deciding `signedIn` with its existing `currentUser()` call and passes it to the provider. A
signed-out person therefore gets **Get an API key** in the server-rendered HTML and makes no
`GET /v1/apps` request.

**Why it can't use `api` or `useResource`.** The middleware on `api` in `lib/client.ts` breaks the
spec on this one call:

| Response | What `api` does | What the spec needs |
| -------- | --------------- | ------------------- |
| 401 | Toast, then redirects to `/sign-in` | Signed-out row, no message (criterion 5) |
| 403 | Redirects to `/not-found` | Failed check (anything other than 200 or 401) |
| 429 | Toast | Failed check, with only the one message |
| Network error | Toast | Failed check, with only the one message |

`useResource` has no timeout and clears its error while reloading, but the failure message has to
stay on screen during a retry. So `lib/access.ts` calls `quietApi.GET('/v1/apps', { signal, cache: 'no-store' })`
directly. `quietApi` is for this check only; everything else keeps `api`.

**`lib/access.ts`**

```ts
export type Access =
  | { kind: 'signed-out' } // signed out, or the check returned 401
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'one'; app: { id: string; name: string } }
  | { kind: 'several' }
  | { kind: 'failed' };

export function accessFromApps(apps: App[], slug: string): Access; // match on subscriptions[].slug; key status is ignored
export async function checkAccess(slug: string, signal: AbortSignal): Promise<Access>;
export function accessAction(access: Access, slug: string): { label: string; href: string } | null;
export function recoverySentence(access: Access): string; // the exact sentences in criterion 7
```

- `checkAccess` returns `signed-out` on 401, `accessFromApps` on a 200 whose `items` is an array,
  and `failed` for everything else, including a thrown error or an abort. A 200 that can't be read
  as a list of apps counts as failed. It reads only `response.status`, so no problem detail can
  reach the screen.
- `accessAction` returns:
  - `signed-out`: **Get an API key**, `keyDestination(slug, false)`
  - `none`: **Get an API key**, `keyDestination(slug, true)`
  - `one`: **Open in {name}**, `/dashboard/apps/{id}`
  - `several`: **View your apps**, `/dashboard?api={slug}`
  - `checking` and `failed`: `null`
- Pass `data.slug` from `GET /v1/apis/{slug}`, not the route parameter.

**`ApiAccessProvider` state**

- `access` starts as `signedIn ? checking : signed-out`, so the server and client render the same
  thing. `retrying` is a separate boolean.
- Each attempt gets a new `AbortController` and a `setTimeout(abort, 10_000)`. Aborting covers the
  body as well as the headers, so a late response can't change anything (criterion 6). The effect
  cleanup aborts too. After each `await`, ignore the result unless this attempt's controller is
  still the current one, so React Strict Mode's second effect run and an unmount can't write stale
  state.
- **Try again** sets `retrying` and leaves `access` as `failed`, so the message stays. Use
  `aria-disabled` and `aria-busy` during the retry and ignore clicks, not `disabled`, which would
  drop keyboard focus when a retry fails.
- When a retry ends with an action, including 401 → signed out, focus moves to that action in an
  effect. The first check never moves focus.
- Rerun the check when `signedIn` or `slug` changes.

**Keeping the reference's state (criterion 6).** `Reference` builds a new `configuration` object
every time it renders, so re-rendering it on an access change could reset Scalar. The page therefore
passes the reference to the provider as `children`, created in the server component:

```tsx
<ApiAccessProvider slug={data.slug} signedIn={!!user}>
  <div className="stack">
    <PageHeader /* title, breadcrumb */ actions={<ApiAccessAction />} />
    {/* version badge, base URL */}
    <ApiAccessStatus />
    <div className="alert">{/* existing instruction */} <TryItRecovery /></div>
    <Reference documentUrl={data.documentUrl} />
  </div>
</ApiAccessProvider>
```

A state change re-renders only the context readers, because the `children` element keeps its
identity. Don't move `Reference` inside a component that reads the context, and don't give it a key
that depends on access. Only an e2e test against the real Scalar can prove this.

### Sign-in and sign-up links (criterion 3)

The middleware and the **Get an API key** link both produce `next=/dashboard/apps/new?api={slug}`,
so the sign-in page can't tell them apart from `next` alone. The difference is made when the person
crosses between the two forms. Add to `lib/navigation.ts`:

- `signInLink(next)`, used on the sign-up page: if `safeNext(next)` is create app with an `api`
  value, return `/sign-in?next=/apis/{slug}`. Otherwise keep today's link.
- `signUpLink(next)`, used on the sign-in page: if `safeNext(next)` is exactly `/apis/{slug}`,
  return `/sign-up?next=/dashboard/apps/new?api={slug}`. Otherwise keep today's link.

`AuthForm`'s `link` uses these, which also covers **Sign in instead**, since it renders the same
value. Encode the slug when building the link. The middleware's direct redirect to
`/sign-in?next=/dashboard/apps/new?api={slug}` doesn't go through either function, so it still
returns to create app. `auth-form.test.tsx:57` asserts the old link and has to change.

### My apps (criteria 1, 4, 8)

- `app/dashboard/page.tsx` reads `searchParams.api` and passes it to `Dashboard` only if it's a
  string, because a repeated parameter arrives as an array. This follows `CreateApp`.
- The label's API name comes from the matching `subscriptions[].title`, so no extra request is
  needed. No match means no label and no error. Don't sort or filter `items`.
- **Render the cards as a separate `<ul>` next to the table** and switch between them with CSS at
  the existing 768 px breakpoint: cards below it, table from it up. Both 375 px and 640 px get
  cards, so the design's "compact table only when all cells fit" case never arises.
- Don't reuse the `.responsive-table` stacking CSS. It has no column labels, would need a fifth
  column for **Open app** that must not appear at 1280 px, and `display: grid` on `tr` removes the
  table semantics. The criterion asks for a list. Leave that CSS alone, because the keys and admin
  tables use it.
- In the table, the label goes in the Name cell, which keeps the four columns. On both layouts, use
  `overflow-wrap: anywhere` and `min-width: 0` for names.
- Keep the API list and active key count logic in one place, so the two layouts can't disagree.
- `caption` changes to "My apps" too. "Your app" in `app/dashboard/apps/[appId]/page.tsx` is a
  fallback page title, isn't the "Your apps" label, and stays.

### Header (criteria 1, 2)

- APIs is current when `pathname === '/' || pathname.startsWith('/apis/')`. My apps and Admin keep
  their `startsWith` checks. Only one nav is mounted at a time at 1280 px, because the menu's nav
  renders only while the dialog is open.
- Radix focuses the first link by default, but criterion 2 wants the close button. Use
  `onOpenAutoFocus` on `Dialog.Content`: call `preventDefault()`, then focus a ref on **Close menu**.
  Radix already handles the focus trap, Escape and returning focus to the trigger. Links are plain
  `<a href>`, so selecting My apps is a full load with the menu closed.

### Create app (criterion 3)

Focus the app name once on mount when `slug` is set, through a ref on `Input`. Without `slug` the
page behaves as it does today.

### API contract

No change. This spec relies only on what's already in the contract:

| Call | Fields used | Handling |
| ---- | ----------- | -------- |
| `GET /v1/apps` | `items[].id`, `name`, `subscriptions[].slug`, `subscriptions[].title`, `credentials[].status`, `createdAt` | 200 → access from the list; 401 → signed out; anything else, a network error or 10 s → failed |

The server returns every app for the owner with no pagination, so the check sees all of them.

### Data model

No change.

### Gateway adapter calls

None.

### Risks and how to test them

| Risk | Test |
| ---- | ---- |
| Scalar loses the typed value on an access change | e2e against the real reference: fill Authentication Value, fail then recover the check, assert the value and that the page didn't reload. |
| A timed-out or superseded request changes the page | Unit tests with fake timers: a response after 10 s, and a retry racing an older attempt. |
| The global client's redirect or toast leaks into the check | e2e for 401, 403 and a network abort: URL unchanged, no toast. Component test that the check never calls `api`. |
| A stubbed 401 with a live session redirects `/sign-up` to `/dashboard`, because the sign-up page sees a valid cookie | For the end-to-end path, make it real with `context.clearCookies()`. A stubbed 401 can only assert the link's `href`. |
| Unbroken 80-character names overflow, or Scalar itself overflows, at 375 px | e2e `scrollWidth` checks on the API page and My apps at 375 and 640. If Scalar is the cause, file a bug instead of targeting its classes (design §9). |
| Table and cards are both in the DOM | Playwright `getByRole` ignores the hidden layout, but `getByText` doesn't. Component tests run without the CSS, so scope queries with `within`. |
| Conflict with 003's frontend fixes, which run alongside this spec (roadmap) | Rebase before review; `header.tsx`, `app-detail.tsx` and `auth-form.tsx` are the likely overlaps. |

Accepted limits, with no change here:

- After a 401, the header still shows the signed-in links until the next page load. **My apps**
  goes through the middleware to sign-in, so nothing breaks.
- If `/v1/me` itself fails, `currentUser()` returns null, so the page shows the signed-out row. The
  sign-up page shows its form and doesn't create an app, so this can't produce a duplicate app. The
  underlying behaviour is already tracked in JSO-191.

### Tasks

- [x] [frontend] JSO-382 `lib/access.ts` and `quietApi`: add the `Access` type, `accessFromApps`, `checkAccess`, `accessAction` and `recoverySentence` from the design, with unit tests for every table row, each failure response and each criterion 7 sentence.
- [x] [frontend] JSO-383 `components/api-access.tsx`: build the provider and its three readers, with the 10-second abort, stale-attempt guard, retry state and focus move after a successful retry, plus component tests with fake timers.
- [x] [frontend] JSO-384 API page: wrap the non-demo branch in the provider with `Reference` as stable `children`, replace the fixed action and 403 sentence, and update `api-page.test.tsx`.
- [x] [frontend] JSO-385 Auth links: add `signInLink` and `signUpLink` to `lib/navigation.ts`, use them in `AuthForm`, and update `navigation.test.ts` and `auth-form.test.tsx`.
- [x] [frontend] JSO-386 Create app: focus the app name on mount when `slug` is set, and rename the breadcrumb to My apps.
- [x] [frontend] JSO-387 Header: rename Dashboard to My apps, make APIs current on `/apis/{slug}`, and focus **Close menu** on open, with a new `header.test.tsx`.
- [x] [frontend] JSO-388 My apps naming and label: rename the heading, page title, loading heading and caption, read `?api=`, and show the text label on apps with access in the Name cell, with a new `dashboard.test.tsx`.
- [x] [frontend] JSO-389 My apps cards: add the card list and the 768 px switch in `packages/ui/src/styles.css`, and wrap long names and action labels so nothing overflows at 375 or 640 px.
- [x] [frontend] JSO-390 App page: rename the breadcrumb to My apps and add **Try this API** to every APIs row, leaving the **Try your key** card as it is, and update `app-detail.test.tsx`.
- [ ] [qa] JSO-391 AC 1, 2: e2e navigation for visitor, developer and admin at 1280 px, including `aria-current`, naming and page titles, and mobile menu focus and Escape at 375 px.
- [ ] [qa] JSO-392 AC 3: e2e for all four sign-up and sign-in paths from an API page and the direct `/dashboard/apps/new?api={slug}` visit, asserting the checked API and focus.
- [ ] [qa] JSO-393 AC 4, 7: e2e for one and two apps with access, including revoked keys, an 80-character name at 375 px, the highlight and its absence, an unknown `?api=`, and the 403 sentence for each row.
- [ ] [qa] JSO-394 AC 5, 6: e2e for the delayed check, 401, 500, 503, network failure and the 10-second timeout, and retry recovery that keeps a typed Authentication Value in the real Scalar reference.
- [ ] [qa] JSO-395 AC 8, 9: e2e for My apps columns and cards with a 10-API app and an unbroken 80-character name at 1280, 640 and 375 px, and **Try this API** with and without an active key.
- [ ] [qa] JSO-396 AC 10: extend `deploy/e2e-demo/demo.test.ts` so `/` and `/apis/sample` show no My apps or access action and the browser never requests `/api/v1/apps`.

## UX _(ui-designer)_

Full design: [`docs/design/019-unified-portal-developer-journey.md`](../design/019-unified-portal-developer-journey.md).
No new routes, tokens or shared components.

- **API page:** while the check runs, the action area shows a placeholder that holds its space and
  isn't a link. The action then appears without moving focus. A failed check shows a warning message
  below the base URL with **Try again**, which reads **Checking…** during a retry and keeps focus. Only
  a successful retry moves focus to the action.
- **My apps:** the table keeps its four columns from 768 px, and each app is a card below that. The
  access label reads "● Has access to {API title}", with the existing highlight tint. Cards have one
  link, **Open app**.
- **App page:** each APIs row has one link, **Try this API**, in place of the title link and "View
  reference".
- **Mobile menu:** **Close menu** moves above the links, so the order on screen matches the focus order
  that starts on it. The menu stays the existing centred dialog, not the north star's side sheet.
- **Long names:** names and titles wrap and are never truncated. The access action is at most 320 px
  wide at 1280 px.
- **Screen readers:** one live region stays mounted for the check's result, and repeated links carry
  hidden context, such as "Try this API: Orders API".

Known gap: the server's 403 detail still says "Select Get an API key on this page", even when the page
shows another action. It needs a server change, so it's tracked as a follow-up in JSO-397.

## Build notes _(backend-developer, frontend-developer)_

- 2026-11-07 — Frontend (JSO-357), implementation commit `36f6aa2`: completed JSO-382–JSO-390.
  Added access-aware API actions and exact recovery copy using the quiet generated client, a
  10-second abort, stale-result protection, inline retry and focus recovery. The server-created
  reference remains stable during access updates; the demo never mounts the check. Updated auth
  continuation links, My apps naming and access labels, mobile cards, menu focus and API row links.
- Validation: `pnpm lint` and `pnpm typecheck` passed; `NODE_OPTIONS=--no-experimental-webstorage pnpm test` passed (117 portal tests; unchanged server, database and gateway results reused Turbo's
  cache). Tests needed local socket access outside the sandbox. This machine runs Node 26; the
  flag lets jsdom provide browser storage instead of Node's incompatible storage globals.
- QA: the component tests cover timeout/late results, Strict Mode cleanup, retry focus (including
  401), unchanged reference rendering/input, app preselection focus, menu trapping and both app
  layouts. The real Scalar input, browser widths/zoom and demo network assertions remain the
  assigned JSO-391–JSO-396 e2e tasks. Existing follow-up JSO-397 remains unchanged.

## Test report _(qa-tester)_

QA run 2026-11-07. Browser coverage is registered by
`deploy/e2e/unified-journey.test.ts`; the tests live in
`apps/portal/e2e/unified-journey.test.ts` (abbreviated **journey** below).
Browser routes stub only the access-list response where deterministic access/failure states
are needed; authentication, server pages and the Scalar reference are real. The app-link test
creates real gateway services, imported APIs, an app and a key, then revokes the key.

| Criterion | Test file | Result |
| --------- | --------- | ------ |
| 1 — navigation by role, current page, naming, titles and loading | journey `AC1`, `AC1,4,9`; `components/header.test.tsx`, `components/dashboard.test.tsx` | PASS — unit and browser, including loading |
| 2 — keyboard mobile menu, focus trap/return, Close/Escape, link navigation | journey `AC2`; `components/header.test.tsx` | PASS — unit and browser |
| 3 — signup, no-access, existing-account Sign in/Sign in instead, round trip, direct create-app continuation | journey six `AC3` tests; `lib/navigation.test.ts`, `components/auth-form.test.tsx`, `components/create-app.test.tsx` | PASS — unit and browser |
| 4 — one/revoked-key app, long name, several apps, unfiltered labels and unknown API | journey `AC4,7,8`, `AC1,4,9`; `lib/access.test.ts`, `components/dashboard.test.tsx` | PASS — unit and browser |
| 5 — delayed access response, reference available, 401 treated as signed out | journey `AC5,7` and `AC5,6,7: access 401`; `components/api-access.test.tsx` | PASS — unit and browser |
| 6 — 500/503/network/timeout, late result ignored, failed/successful retry, focus and real Scalar value retained | journey parameterized `AC5,6,7`, `AC6`; `components/api-access.test.tsx`, `lib/access.test.ts` | PASS — unit and browser |
| 7 — exact 403 recovery copy for every access state | journey `AC3`, `AC4,7,8`, `AC5,7`, `AC5,6,7`; `lib/access.test.ts` | PASS — unit exact sentences and browser |
| 8 — four desktop columns; three mobile cards, 80-character name, ten APIs at 1280/640/375 px | journey `AC4,7,8`; `components/dashboard.test.tsx` | PASS — unit and browser |
| 9 — three API links with and without an active key; existing Try your key behavior | journey `AC1,4,9`; `components/app-detail.test.tsx` | PASS — unit and browser |
| 10 — demo navigation, no access action, no apps request | `deploy/e2e-demo/demo.test.ts` `019 AC10`, existing desktop/mobile demo journeys; `components/api-page.test.tsx` | PASS — 32 demo browser tests |

Validation:

- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS, including the new browser tests.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm test`: PASS from Turbo cache;
  fresh parallel `turbo run test --force` hit the database test's 120-second timeout while
  Docker and demo builds ran. The fresh serial retry
  (`NODE_OPTIONS=--no-experimental-webstorage pnpm exec turbo run test --force --concurrency=1`)
  PASSED: 195 tests across 28 files (1 database, 117 portal, 39 Kong adapter, 38 server),
  12/12 Turbo tasks successful with zero cache hits.
- `pnpm test:e2e:demo`: PASS, 32 tests, production static demo build.
- `pnpm test:e2e`: PASS, 42/42 in one complete final run (19 new spec-019 cases).
  The real first-call journey (signup, key reveal, Kong call and revoke) PASSED, as did the
  real gateway outage, duplicate retry and restart/reconciliation checks.
- Quickstart `docker compose -f deploy/docker-compose.yml up -d --build --wait`: PASS,
  all services healthy in 134 seconds after the coordinated port handoff and project-network
  recreation. An earlier attempt was blocked by another worktree using port 8000; the initial
  reused network also had a PostgreSQL DNS failure. Only this project was recreated, with
  volumes preserved; no other worktree containers were touched.
- Failure coverage includes invalid auth/import input, duplicate submissions/accounts,
  non-admin permission, expired session and real gateway outage in the existing full suite,
  plus new deterministic 401/403/500/503/network/timeout access checks and retry focus.
- No Bug-labelled children of JSO-316 were In Review at QA start; none required retest.
- Test development initially exposed selector assumptions: duplicate imported sample titles,
  Next's empty route-announcer alert, Scalar's unnamed global-auth region, hidden-label spacing
  and in-page hashes. These test assertions were corrected; no application code changed.
  A consecutive full-suite rerun also inherited the security test's exhausted in-memory
  rate-limit bucket (429); restarting this project server before the final run restored a
  clean test state. The repeat-run isolation follow-up is **JSO-408**, unparented in Backlog.
  No remaining spec-019 flakiness was observed.
- This worktree's Compose project was torn down after verification, preserving volumes and
  releasing the standard ports. No blocker or major bug is open; disposition: **uat**.

### Bugs

None found. No blocker, major or minor product bug was opened during this QA run.

UAT 2026-11-07: no bugs were In Review to re-test, and user testing found no new spec-019 bugs. The one
out-of-scope problem I saw is already tracked as JSO-162 (Backlog). I cancelled my duplicate, JSO-409.

## User testing _(user-tester)_

UAT run 2026-11-07 (JSO-359) on the local quickstart, which was healthy in 111 s, in Orca's built-in browser
at 1280, about 805, 390 and 375 px. Twenty-one journeys, with screenshots, are in
[`docs/uat/019/notes.md`](../uat/019/notes.md).

| User story | Result | Screenshot |
| ---------- | ------ | ---------- |
| API page shows the next step for my access (no access, one app incl. revoked keys, several apps, highlighted My apps) | Pass | `docs/uat/019/19-api-page-no-access.png`, `07-api-page-one-app.png`, `17-api-page-revoked-key-app.png`, `10-api-page-several-apps.png`, `11-my-apps-highlighted.png` |
| Visitor goes from an API to a key without losing their place (sign-up, Sign in, Sign in instead, Create an account) | Pass | `02-api-page-visitor.png`, `03-signup-from-api.png`, `04-create-app-preselected.png`, `23-sign-in-returns-to-api.png`, `24-signup-duplicate-sign-in-instead.png`, `25-create-account-round-trip.png` |
| From an app to a call in one step (Try this API → paste key → 200 OK through Kong) | Pass | `06-app-page.png`, `07-api-page-one-app.png`, `08-try-it-200.png`, `18-app-page-ten-apis.png` |
| Navigation and My apps work on a phone (cards, keyboard menu, 80-character names, no sideways scroll) | Pass | `13-my-apps-mobile-cards.png`, `14-mobile-menu-open.png`, `15-mobile-menu-my-apps.png`, `16-api-page-long-name-375.png` |
| Portal says when it can't confirm access (failure message, failed and successful Try again, typed value kept) | Pass | `20-access-check-failed.png`, `21-retry-success.png` |

Navigation by role and current link (AC1): visitor, developer and admin all pass (`01-home-visitor.png`,
`09-my-apps-one.png`, `26-admin-nav.png`). The console was clean. The only failed request was a deliberate
duplicate sign-up (422).

Notes:
- Not walked in the browser: the 5-second delay, 500/503 and the 10-second timeout. Orca's browser can only
  abort a request, so I walked the network-error case and nothing else. Also not walked: a 401 mid-session, the
  static demo (AC10) and the 640 px width. QA's browser tests cover all of these.
- The catalog card's long base URL running into **View reference →** comes from spec 001 and is already
  tracked as JSO-162 (Backlog). I cancelled my duplicate, JSO-409.
- Leftover QA APIs, including five titled "Sample HTTP API", make the catalog and the create-app list noisy
  locally. That's test data (JSO-408), not product behaviour.

## Review _(tech-lead)_

Review 2026-11-07 (JSO-360) of `git diff main...HEAD` (`aa3626c`…`bb2cd4d`). **No blocking findings.
Status: approved.**

Checks run in this worktree:

- `pnpm lint`: PASS. `pnpm typecheck`: PASS.
- `pnpm test`: one failure on this machine's Node 26 in `components/key-reveal-dialog.test.tsx:57`,
  a file this branch doesn't touch. Node's own `localStorage` global hides jsdom's. With
  `NODE_OPTIONS=--no-experimental-webstorage`, all 117 portal tests pass, and the other packages are
  unchanged. CI pins Node 22 through `.nvmrc`, so CI is unaffected. Follow-up JSO-410 (Backlog).
- I didn't rerun e2e or the quickstart. I relied on QA's runs of 2026-11-07: 42/42 e2e, 32 demo e2e,
  Compose healthy in 134 s. The branch doesn't change the server, Compose or the images.
- `main` has one newer commit (`4668cac`, factory config and docs). `git merge-tree` shows it merges
  cleanly.

Against the design:

- **Contract and data:** no change to `openapi.yaml`, the database, the adapters or `packages/sdk`,
  as designed. The access check reads only `response.status` and the fields the design lists, so no
  problem detail or secret reaches the page.
- **Access check** (`components/api-access.tsx`, `lib/access.ts`): matches the design. Each attempt
  has its own `AbortController`, a 10-second abort, and a guard that ignores a superseded attempt. A
  `Promise.race` against the abort covers a transport that ignores the signal. Retry keeps `failed`
  on screen, uses `aria-disabled`, and moves focus only after a retry that ends in an action. The
  check uses `quietApi`, so the global 401/403/429 redirects and toasts can't fire. A 200 that can't
  be read as a list of apps counts as failed, not as no access.
- **Reference state:** `Reference` is created in the server component and passed as `children`, so an
  access change doesn't re-render it. QA's e2e proves this against the real Scalar.
- **Auth links** (`lib/navigation.ts`): both functions go through `safeNext`, encode the slug, and
  leave the middleware's direct create-app redirect alone. The tests cover open redirects and
  encoded slugs.
- **Header, My apps, create app, app page:** match criteria 1, 2, 4, 8 and 9 and the UX section. The
  cards are a separate `<ul>`, switched at 768 px. Table semantics are kept, and the shared
  `.responsive-table` CSS is untouched. The API list and key count are worked out once for both
  layouts.
- **Tests:** every criterion has a unit or component test and a browser test (see Test report).
  Criterion 10 is covered by `deploy/e2e-demo/demo.test.ts`.

### Blocking

None.

### Suggestions

- `apps/portal/components/api-access.tsx:140` — **Try again** sits inside the `role="status"` live
  region, so some screen readers read the whole message again when its label changes to
  **Checking…**. Consider keeping only the message and the hidden announcement inside the live
  region, with the button next to it. Not blocking: the design asks for one mounted live region,
  and this has one.
- `apps/portal/components/create-app.tsx:35` — restoring focus after an empty API result finds
  `PageHeader`'s `h1` through `querySelector`. This depends on `PageHeader`'s markup. If another
  screen needs the same thing, give `PageHeader` a heading ref instead. The behaviour itself is a
  good addition and is tested (`create-app.test.tsx`).
- `package.json` allows Node `>=22`, but `pnpm test` fails on Node 25 and later without the
  webstorage flag. This was here before the branch and is tracked in JSO-410.
- Rebase on `main` before merging (one commit behind, no conflicts).

## Definition of Done

- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
