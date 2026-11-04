# 002 — Static demo mode for the Vercel deployment: UX design

- Spec: [`docs/specs/002-vercel-static-demo-mode.md`](../specs/002-vercel-static-demo-mode.md)
- Decision record: [ADR 0004](../adr/0004-demo-mode-is-a-build-time-switch.md)
- Base design: [`001-kong-quickstart-slice.md`](001-kong-quickstart-slice.md). Anything not mentioned
  here stays as it is there.
- Tokens: [`tokens.md`](tokens.md). This design adds none.
- API: no calls. All content comes from the seed document inlined at build time.
- Owner: ui-designer · 2026-11-04

## 0. Principles

1. **It must look finished, not broken.** The visitor sees a real catalog and a real reference, and
   nothing on screen fails, spins forever or leads to a dead end.
2. **Say it once, plainly, on every page.** One notice says what this is, what needs the quickstart
   and how to run it. Other pages don't repeat it at length.
3. **Remove what can't work.** Controls that can't work are removed, not disabled. A greyed-out
   **Get an API key** would make the visitor wonder what they did wrong.
4. **Information, not a warning.** Nothing is wrong, so the notice uses the calm `--accent` colours,
   not the warning or error colours.
5. **A real portal doesn't change.** With demo mode off, none of this renders and all existing copy
   stays (AC 9, 10).

Everything marked "demo" below renders only when `isDemo()` is true.

---

## 1. User flows

### Flow A — Platform engineer evaluating the project (AC 1, 2, 3, 5)
1. Opens `/` → **Catalog**. Sees the header, the **demo notice** and the Sample HTTP API card.
2. Selects the card → **API reference** `/apis/sample`. The notice is still there.
3. Reads the operations and code samples. There's nothing to send, and a one-line note says why.
4. Decides to try it. Either:
   - selects **Copy** in the notice and runs the command in a clone of the repo, or
   - selects **Quickstart instructions on GitHub** (notice) or **Run the quickstart** (header, which
     stays on screen while scrolling).
5. Done: they've left for GitHub or a terminal, and know what they'll get.

### Flow B — Developer following a shared link (AC 2, 3, 4)
1. Lands directly on `/apis/sample`, with the notice above the reference.
2. Reads the reference. No key button and no paste-your-key note, so they never try to sign up.

### Flow C — Visitor goes to a live route directly (AC 6)
1. Opens `/sign-in`, `/sign-up`, `/dashboard`, `/dashboard/apps/new`, `/admin/apis` or anything else
   under `/dashboard` or `/admin`, for example from an old link.
2. The address stays as typed. **Quickstart required** appears with a `200`.
3. Selects **Quickstart instructions on GitHub**, or **Go to APIs** to keep browsing.

### Flow D — Visitor opens an API that doesn't exist (AC 7)
1. Opens `/apis/nope` → the existing **API not found** page, with the notice above it.
2. Selects **Go to APIs** → Catalog.

### Flow E — Portal admin self-hosting
There's no demo flow. No notice, the normal header, and `/quickstart-required` is a 404.

---

## 2. Global layout in demo mode

### Header (AC 4)
```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ Developer Portal    APIs   [ Run the quickstart ]                            │
└──────────────────────────────────────────────────────────────────────────────┘
375px                                   menu open (existing Dialog)
┌───────────────────────────────────┐   ┌───────────────────────────────┐
│ Developer Portal             [☰]  │   │ Menu                          │
└───────────────────────────────────┘   │ APIs                          │
                                        │ [ Run the quickstart ]        │
                                        │ [ Close menu ]                │
                                        └───────────────────────────────┘
```
- **Sign in** and **Sign up** are gone from both navs. **Run the quickstart** takes the place of
  **Sign up**, with the same `.button` style, and links to `QUICKSTART_URL` in the same tab.
- The header is sticky, so this link is always on screen, including once the notice has scrolled away.
- `user` is always `null` in demo mode, so the signed-in branch can't show.

### Demo notice (AC 3) — on every page
A full-width band between the header and `<main>`, rendered from the root layout, so it also appears
on not-found and error pages. It doesn't stick and can't be dismissed.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ header                                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ This is a demo with a sample API. Sign-up, API keys, try-it and admin need   │ --accent band
│ the quickstart.                                                              │
│ Clone the repo, then run:                                                    │
│ ┌────────────────────────────────────────────────────────┐                   │
│ │ docker compose -f deploy/docker-compose.yml up --build │                   │
│ └────────────────────────────────────────────────────────┘                   │
│ [ Copy ]  Quickstart instructions on GitHub                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ page content                                                                 │

375px (about 240px tall)
┌───────────────────────────────────┐
│ header                            │
├───────────────────────────────────┤
│ This is a demo with a sample API. │
│ Sign-up, API keys, try-it and     │
│ admin need the quickstart.        │
│ Clone the repo, then run:         │
│ ┌───────────────────────────────┐ │
│ │ docker compose -f             │ │  wraps at spaces, never scrolls sideways
│ │ deploy/docker-compose.yml up  │ │
│ │ --build                       │ │
│ └───────────────────────────────┘ │
│ [ Copy ]  Quickstart instructions │
│           on GitHub               │
├───────────────────────────────────┤
│ page content                      │
```

| Part | Spec |
| --- | --- |
| Element | `<section aria-label="Demo notice">`, placed after `<Header />` and before `<main>`. Not a live region. |
| Band | Background `--accent`, text `--accent-foreground`, `--portal-text-sm`, bottom border `--border`. |
| Inner width | `--portal-page-max-width` and `--portal-page-gutter`, so it lines up with the page. 12px vertical padding. |
| Lead sentence | No heading element, so each page keeps its h1 as the first heading. "This is a demo" is `font-weight: 600`. |
| Command | `QuickstartCommand` (§4). |
| Link | Text link, `--primary`, same tab. |
| Rendering | The text, command and link are in the server-rendered HTML, so they show without JavaScript. Only **Copy** needs it. |

### Unchanged
Skip link, footer, `<main id="main">` and the one-h1-per-page rule all stay.

### Metadata
In demo mode the root `description` becomes: "A demo of the Developer Portal with a sample API.
Run the quickstart for sign-up, API keys and try-it." Link previews are often the first thing someone
reads when a link is shared, and the current text promises a key.

---

## 3. Screens

### 3.1 Catalog — `/` (AC 1, 4)
**Purpose:** show a real catalog entry and get the visitor to the reference in one click.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ header + demo notice                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ APIs (h1)                                                                    │
│ Read the reference for a sample API.                                         │
│                                                                              │
│ ┌──────────────────────┐                                                     │
│ │ Sample HTTP API  v1.0.0│                                                   │
│ │ A small HTTP API for   │                                                   │
│ │ trying your portal API │                                                   │
│ │ key.                   │                                                   │
│ │ Base URL in a local    │                                                   │
│ │ quickstart             │                                                   │
│ │ http://localhost:8000/ │                                                   │
│ │ sample                 │                                                   │
│ │ View reference →       │                                                   │
│ └──────────────────────┘                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
375px: same order, card full width.
```

**Changes from 001:**
- Description becomes "Read the reference for a sample API."
- The **How it works** card is not rendered. Removing the account and key steps leaves only "Pick an
  API", which isn't worth a card, and the notice already gives the next step.
- The card labels its address: "Base URL in a local quickstart" (`--portal-text-sm`, muted) above
  the `gatewayBaseUrl`. A bare `localhost` address on a public site looks like a bug. It stays plain
  text: the whole card is one link, and the address wouldn't work for a visitor anyway.
- The card links to `/apis/sample`, with the existing grid and hover.

**The seed description stays word for word.** "A small HTTP API for trying your portal API key."
AC 1 and AC 2 require it, and editing the seed would change the quickstart. It describes the API and
doesn't tell the visitor to do anything, and the notice directly above says keys need the quickstart.
The notice needs no extra wording. This answers the question the technical design left to UX.

**Primary action:** open the API.

| State | Content |
| --- | --- |
| Loading | The content is inlined, so nothing waits on data. If the existing `app/loading.tsx` shows during navigation, it clears as soon as the page renders. It must never remain on screen (AC 1). |
| Success | As wireframe. |
| Empty | Can't happen: the build fails if the seed file is missing (ADR 0004). No demo copy is needed. |
| Error | Existing `error.tsx`, with the notice above it. |
| No permission | n/a (public). |

### 3.2 API reference — `/apis/sample` (AC 2, 4, 5)
**Purpose:** let the visitor judge the reference. It's read-only.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ header + demo notice                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ APIs / Sample HTTP API                                                       │
│ Sample HTTP API (h1)                                                         │
│ [v1.0.0]                                                                     │
│ Base URL in a local quickstart                                               │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ http://localhost:8000/sample                                             │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ [ Copy ]                                                                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ⓘ This reference is read-only here, so you can't send requests from it.  │ │
│ │   To send real requests, run the quickstart.                             │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌────────────────────────────────────────────────────────┐ │
│ │ Scalar sidebar │ │ GET /get  Inspect a GET request                        │ │
│ │  GET  /get     │ │ responses and code samples (no Test Request)           │ │
│ │  POST /post    │ │                                                        │ │
│ │  …             │ │                                                        │ │
│ └───────────────┘ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
375px: same order in one column; Scalar uses its own mobile layout (menu button, single column).
```

**Changes from 001:**
- **Get an API key is removed**, with nothing in its place. The header and the notice both reach the
  quickstart already, and a third control would add noise above the reference. Don't pass `actions`.
- The paste-your-key alert is replaced by the read-only line above. It has no link, because the notice
  and header cover that. Keep the same `.alert` style.
- `CodeValue` label becomes "Base URL in a local quickstart" (AC 5).
- Scalar uses the demo configuration from the technical design. It shows no authentication card,
  server card, Test Request button, client button or toolbar.

Code samples still show `localhost:8000` and the `apikey` header. That's correct: they show how the
API is called, and the address is labelled above them.

**Primary action:** none on this page; reading is the point. The next step is in the header and notice.

| State | Content |
| --- | --- |
| Loading | Existing `apis/[slug]/loading.tsx`, then "Loading API reference…" (`role="status"`) while the Scalar chunk loads. Header strip and notice are already visible. |
| Success | As wireframe, with all five operations. |
| Reference failed to render | Existing boundary: "The API reference didn't load." + **Try again**. Header strip and notice stay. |
| Not found (`/apis/nope`) | §3.4. |
| No permission | n/a (public). |

### 3.3 Quickstart required — `/quickstart-required`, also served at gated routes (AC 6)
**Purpose:** tell someone who went straight to a live route why it isn't here and what to do.

The same page serves every gated route, so its copy doesn't name one feature. That keeps a single
route with no path-based logic and no risk of a hydration mismatch.

```
1280px (content left-aligned, --portal-form-max-width)
┌──────────────────────────────────────────────────────────────────────────────┐
│ header + demo notice                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ This feature needs the quickstart (h1)                                       │
│                                                                              │
│ Sign-up, API keys, try-it and admin need a portal server and a Kong gateway. │
│ This hosted demo has neither, so they're turned off here.                    │
│                                                                              │
│ Run the portal on your own machine to use them. It needs Docker with Compose │
│ and starts in under five minutes.                                            │
│                                                                              │
│ Clone the repo, then run:                                                    │
│ ┌────────────────────────────────────────────────────────┐                   │
│ │ docker compose -f deploy/docker-compose.yml up --build │                   │
│ └────────────────────────────────────────────────────────┘                   │
│ [ Copy ]                                                                     │
│                                                                              │
│ [ Quickstart instructions on GitHub ]   [ Go to APIs ]                       │
└──────────────────────────────────────────────────────────────────────────────┘
375px: one column; both buttons full width and 44px tall, instructions first.
```

**Primary action:** **Quickstart instructions on GitHub** (`.button`). **Go to APIs** is
`.button.secondary`.

**Why the command appears twice on this page.** The notice has to be on every page (AC 3), and this
page has to carry the command and link itself (AC 6). The page is what the visitor came to read, so
the repetition is accepted. Don't hide the notice here: it would need path logic in the layout and
would break AC 3.

| State | Content |
| --- | --- |
| Loading | n/a: static page, no data. |
| Success | As wireframe. Status `200`. The address stays as typed; any `?next=` is ignored. |
| Empty, error | n/a: nothing to load or submit. |
| Copy failed | See `QuickstartCommand` in §4. |
| No permission | This page is the no-permission state for gated routes. No redirect to sign-in. |
| Demo mode off | `notFound()`: the portal's normal "Page not found" (AC 9). |

### 3.4 Not found (AC 7)
The existing pages, unchanged, with the notice above them:
- `/apis/nope`: h1 "API not found", body "We can't find that API. It may have been unpublished, or the
  link is wrong.", button **Go to APIs**. `<title>`: "API not found · Developer Portal".
- Any other unknown path: h1 "Page not found", body and button as in 001.

### 3.5 Error page
The existing `error.tsx`, unchanged, with the notice above it. Its copy suits demo mode too.

---

## 4. Components

### Reused
`Button`, `CopyButton`, `CodeValue`, `PageHeader`, `Card`, `Badge`, `Dialog` (mobile menu), and the
existing `.alert`, `.button`, `.code-value` and `.row` styles. Follow the markup already in
`packages/ui`; there's no new visual language.

### New, in `apps/portal/components`

**`DemoNotice`** — the band in §2. No props. Renders nothing when `isDemo()` is false, so the layout
stays one line.

**`QuickstartCommand`** — the label, command and **Copy** button, used by the notice and by Quickstart
required so the two can't drift. Client component, but all its text is in the server-rendered HTML.

| Prop | Type | Notes |
| --- | --- | --- |
| `children` | `ReactNode` | Optional, rendered beside **Copy**. The notice passes its link here so they share a row. |

Renders, in order:
1. "Clone the repo, then run:" as plain text.
2. `QUICKSTART_COMMAND` in `<code className="code-value">`, with `color: var(--foreground)` so it
   doesn't inherit the band's text colour. It wraps at spaces first, then anywhere, and never scrolls
   sideways. From 768px up, use `width: fit-content; max-width: 100%` so the box hugs the command
   instead of filling the page.
3. A `.row` with `CopyButton` and `children`.

| State | Behaviour |
| --- | --- |
| Default | **Copy**. Accessible name "Copy quickstart command". |
| Copied | Label "✓ Copied" for 2 s; the live region says "Quickstart command copied." |
| Copy failed | Label stays **Copy**. Below the row, `.hint`: "Couldn't copy automatically. Select the command and copy it." It stays until the page reloads, so `CopyButton` needs no success callback. |
| No JavaScript | The button does nothing, but the command is ordinary text that can be selected. |

### Changed, in `packages/ui`

**`CopyButton`** gets one optional prop, `copiedMessage?: string`, the text for its live region. The
current fallback builds it from `ariaLabel`, which would announce "Copy quickstart command copied."
Default behaviour is unchanged when the prop is absent.

**`CodeValue`** passes `copiedMessage={`${label} copied.`}`, so the base URL announces "Base URL in a
local quickstart copied."

### New CSS (tokens only)
Add `.demo-notice` and its inner container. Use only the tokens named in §2. No literal colours, so a
customer theme still works by overriding variables.

---

## 5. Copy reference

Voice as in 001: plain, short, second person, sentence case, no blame.

| Where | Text |
| --- | --- |
| Notice, sentence | This is a demo with a sample API. Sign-up, API keys, try-it and admin need the quickstart. |
| Command label | Clone the repo, then run: |
| Command | `docker compose -f deploy/docker-compose.yml up --build` |
| Notice link | Quickstart instructions on GitHub |
| Header link (both navs) | Run the quickstart |
| Catalog description | Read the reference for a sample API. |
| Address label (card and API page) | Base URL in a local quickstart |
| API page note | ⓘ This reference is read-only here, so you can't send requests from it. To send real requests, run the quickstart. |
| Gated page h1 | This feature needs the quickstart |
| Gated page, first paragraph | Sign-up, API keys, try-it and admin need a portal server and a Kong gateway. This hosted demo has neither, so they're turned off here. |
| Gated page, second paragraph | Run the portal on your own machine to use them. It needs Docker with Compose and starts in under five minutes. |
| Gated page buttons | Quickstart instructions on GitHub · Go to APIs |
| Copy failed | Couldn't copy automatically. Select the command and copy it. |
| Copy announced | Quickstart command copied. |
| Meta description | A demo of the Developer Portal with a sample API. Run the quickstart for sign-up, API keys and try-it. |

The command and link come from `QUICKSTART_COMMAND` and `QUICKSTART_URL` in `lib/demo.ts`. Don't
retype them in components.

### Page titles (`<title>`)
| Route | Title |
| --- | --- |
| `/` | APIs · Developer Portal |
| `/apis/sample` | Sample HTTP API · Developer Portal |
| `/apis/nope` | API not found · Developer Portal |
| Gated routes, `/quickstart-required` | Quickstart required · Developer Portal |

### Must not appear in demo mode (AC 4)
Sign in · Sign up · Get an API key · Create a free account and get a key · any instruction to paste
a key or select Send. The seed's own description is the one deliberate exception (§3.1).

---

## 6. Accessibility (WCAG 2.2 AA)

### Keyboard path
Tab order on any page: **Skip to content** → brand → **APIs** → **Run the quickstart** → notice
**Copy** → **Quickstart instructions on GitHub** → page content → footer.

- **Skip to content** goes to `<main>`, past the notice. Screen reader users can still find it as the
  "Demo notice" region, and it comes before `<main>` in reading order.
- At 375px, **Open menu** replaces the two header links. The existing dialog traps focus and returns
  it on close.
- All navigation is ordinary page loads, so no focus management is needed.
- On the catalog, Tab reaches the card link next; Enter opens it. On the API page: breadcrumb → base
  URL **Copy** → Scalar. On Quickstart required: **Copy** → **Quickstart instructions on GitHub** →
  **Go to APIs**.

### Focus
- The site-wide focus ring applies. `--ring` on `--accent` is 6.2:1.
- **Focus not obscured (2.4.11):** the sticky header can cover the notice when someone tabs backwards
  from further down the page. Give the notice's links and buttons
  `scroll-margin-top: calc(var(--portal-header-height) + 16px)`, as `h1` has now.

### Labels and semantics
- The notice is a named region, not `role="alert"` or a live region: it's page content that doesn't
  change, and it shouldn't interrupt a screen reader on every page load.
- The notice has no heading, so a page's first heading is still its h1.
- The API note's `ⓘ` is decorative: wrap it in `aria-hidden="true"`.
- On the API page, the two **Copy** buttons have distinct names: "Copy quickstart command" and "Copy
  base url in a local quickstart". On Quickstart required, both are "Copy quickstart command", which
  is correct because they do the same thing.
- The links to the instructions say where they lead, so they make sense out of context.

### Contrast, size, motion
| Pair | Ratio |
| --- | --- |
| `--accent-foreground` on `--accent` (notice text) | 9.5:1 |
| `--primary` on `--accent` (notice link) | 6.2:1 |
| `--foreground` on `--muted` (command text) | 16.3:1 |
| `--muted-foreground` on `--accent` (card address label on hover) | 7.0:1 |

- Buttons are at least 40px, 44px on the gated page at 375px. The notice link is a text link on its
  own line, so give it at least 24px of height (2.5.8).
- No animation is added.

---

## 7. Responsive behaviour

Tailwind's default breakpoints, as in 001. No horizontal page scrolling at any width from 320px up.

| Element | 375px | 1280px |
| --- | --- | --- |
| Header | Brand + menu; **Run the quickstart** in the menu | Inline nav |
| Notice | About 240px tall; command wraps to two or three lines depending on the system font; **Copy** and the link share a row, wrapping if needed | Command on one line; **Copy** and the link on the row below |
| Notice position | Scrolls with the page | Scrolls with the page |
| Catalog | One column; h1 and description show on the first screen below the notice | Three-column grid with one card |
| API page | Stacked; base URL wraps; Scalar's mobile layout | Stacked header strip; Scalar sidebar + content |
| Quickstart required | Full width; buttons stacked, full width, 44px | `--portal-form-max-width` column; buttons inline |

At 375px the notice takes about a third of a 667px screen. That's accepted because it's the point of
the page for most visitors, and it scrolls away. If it needs shrinking later, cut the sentence, not the
command or the link.

---

## 8. Notes for frontend and QA

- **Test hooks.** Use roles and names: `getByRole('region', { name: 'Demo notice' })`, heading "This
  feature needs the quickstart", link "Quickstart instructions on GitHub", link "Run the quickstart".
  No `data-testid`.
- **Scope assertions.** On gated routes the command and link appear twice by design. Scope them to the
  region for AC 3 and to `main` for AC 6, or strict mode will fail.
- **Mobile menu.** AC 4 needs the menu opened at 375px, then checked for Sign in and Sign up.
- **Link not working yet.** The GitHub link returns 404 until the repo is public (spec risk table).
  Assert the `href`; don't file the 404 as a design bug. There's no fallback design, because Elango
  decided the repo goes public before merge.
- **README (JSO-210).** The notice says "Clone the repo, then run:", but the README's Quickstart starts
  at "Install Docker with Compose". Someone following the link from the demo needs the clone step, so
  add it there as part of the README change in that task.
- **Copy wording on the seed.** Don't flag "your portal API key" in the card as an AC 4 failure (§3.1).
