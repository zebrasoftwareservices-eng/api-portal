# 014 — Pages and navigation managed in the admin UI

Spec: [`docs/specs/014-pages-articles-navigation.md`](../specs/014-pages-articles-navigation.md).
Decision: [ADR 0020](../adr/0020-pages-are-markdown-in-postgres-rendered-without-raw-html.md).
Tokens: [`tokens.md`](tokens.md). One new token: `--portal-prose-max-width`.

Admins write pages in plain Markdown and arrange flat header and footer lists. Readers get a calm,
readable page in the portal's theme. An install with nothing saved looks as it does today.

## Decisions

- **Admins and the edited links (the spec's open question).** An admin sees the saved header and
  footer links on every page outside `/admin`, and never inside it. With `isDefault: true` the admin
  top bar and footer are exactly today's. `My apps` is never shown to an admin, as today.
- **Reordering is Move up and Move down buttons**, for pointer and keyboard alike. No drag and drop.
- **Saving a published page is live.** There is no separate draft of a published page, so the editor
  says so next to the button.
- **Preview shows the last save**, so the editor says when there are unsaved changes.
- **Header search text stays** "Search APIs and endpoints", so criterion 1 holds in the header.
  Only the `/search` help text mentions pages.
- **Navigation links open in the same tab**, with no icon. Their accessible name is the label.

## Data the screens use

No new fields. Every value comes from the contract.

| Need | Source |
| --- | --- |
| Pages list; page choices in the navigation editor | `GET /v1/admin/pages` → `items: PageSummary[]` |
| Editor and preview | `GET /v1/admin/pages/{pageId}` → `PageDetail` |
| Save, publish, unpublish | `POST /v1/admin/pages`, `PUT /v1/admin/pages/{pageId}` with `PageWrite` |
| Links named in a confirmation | `PageDetail.navigation[]` (`area`, `label`), read when the dialog opens |
| Navigation editor | `GET`, `PUT`, `DELETE /v1/admin/navigation` → `NavigationSettings` |
| Header and footer | `GET /v1/navigation` → `isDefault`, `header[]`, `footer[]` |
| Public page | `GET /v1/pages/{slug}` → `PublicPage` |
| Search | `GET /v1/search` → `kind: 'page'`, `page.{slug,title,description}` |

## User flows

**A. Publish a guide (criteria 2, 3)**
1. Admin opens **Admin → Pages** and presses **New page**.
2. They type a title. The slug fills itself. They write the body.
3. **Save draft**. The address becomes `/admin/pages/{pageId}`, a toast says "Draft saved."
4. **Preview** opens the rendered page in a new tab. They go back to the editor tab.
5. **Publish**. The badge reads **Published** and **View page** opens `/pages/{slug}`.
6. Later they edit and press **Save changes**. The next page load shows the new text.

**B. Restrict a page (criterion 4)**
1. In the editor they choose **Signed-in only** and save.
2. A signed-out visitor opens the link, sees "Page not found" and presses **Sign in**.
3. After signing in they land on the same address and read the page.

**C. Arrange the navigation (criterion 7)**
1. Admin opens **Admin → Navigation**.
2. **Add page link** and **Add external link** add rows at the end of the header list.
3. They turn off **Show** on a built-in and press **Move up** on another row.
4. They add a footer link and press **Save navigation**. A toast confirms it.
5. **Open the portal** shows the result. **Reset to default** undoes all of it.

**D. Remove a linked page (criterion 8)**
1. In the editor they press **Unpublish** or **Delete page**.
2. The dialog names each header or footer link that disappears. They confirm or cancel.

## Screen 1 — Admin sidebar

Two entries at the end of the **Admin** group: **Pages** → `/admin/pages`, **Navigation** →
`/admin/navigation`. Current-page and group rules are spec 024's. Nothing else in the sidebar moves.

## Screen 2 — Pages list (`/admin/pages`)

**Purpose:** find a page or start one. **Primary action:** New page.

```
1280px
┌───────────────────────────────────────────────────────────────────────────────┐
│ Pages                                                             [New page]  │
│ Guides and other pages you write in Markdown.                                 │
│ ┌───────────────────────────────────────────────────────────────────────────┐ │
│ │ Title                  Status        Who can read   Linked from  Updated  │ │
│ │ Getting started        ● Published   Public         Header       23 Nov   │ │
│ │ /pages/getting-started                                                    │ │
│ │ Partner notes          ● Published   Signed-in only Footer       22 Nov   │ │
│ │ /pages/partner-notes                                                      │ │
│ │ Terms of use           ○ Draft       Public         —            20 Nov   │ │
│ │ /pages/terms                                                              │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
375px: one card per page, in the same order
┌───────────────────────────────┐
│ Pages                         │
│ Guides and other pages you…   │
│ [New page]            (full)  │
│ ┌───────────────────────────┐ │
│ │ Getting started           │ │
│ │ /pages/getting-started    │ │
│ │ ● Published · Public      │ │
│ │ Linked from: Header       │ │
│ │ Updated 23 Nov 2026       │ │
│ └───────────────────────────┘ │
└───────────────────────────────┘
```

- `PageHeader`, `Table`, `Badge`. The title links to the editor. The slug is mono, `--muted-foreground`.
- Order is the server's (most recently updated first). No paging, search or row actions.
- **Linked from**: `Header`, `Footer`, `Header, Footer`, or `—` with sr-only "Not linked". Each area
  once, even with two links.
- Badges have a shape and a word: `● Published` (`.badge.active`), `○ Draft` (plain badge). The
  shape is `aria-hidden`.

| State | What shows |
| --- | --- |
| Loading | Header and **New page**, then 3 skeleton rows, `aria-busy`, sr-only "Loading pages…" |
| Empty | `EmptyState`: **No pages yet** / "Write a guide, an about page or your terms. Nobody sees a page until you publish it." / **New page** |
| Error | Error alert: "We couldn't load the pages. Try again in a moment." + **Try again** |
| Signed out, not an admin | Today's `/admin` behaviour |

## Screen 3 — Page editor (`/admin/pages/new`, `/admin/pages/{pageId}`)

**Purpose:** write, save and publish one page. **Primary action:** **Publish** on a draft,
**Save changes** on a published page.

```
1280px
┌───────────────────────────────────────────────────────────────────────────────┐
│ ← Pages                                                                       │
│ Getting started                                                  ○ Draft      │
│ ┌─────────────────────────────────────────────┐ ┌───────────────────────────┐ │
│ │ Title                                       │ │ Publishing                │ │
│ │ [ Getting started                         ] │ │ Who can read this page    │ │
│ │ Slug                                        │ │ (•) Public                │ │
│ │ /pages/ [ getting-started                 ] │ │     Anyone with the link… │ │
│ │ Body                                        │ │ ( ) Signed-in only        │ │
│ │ ┌─────────────────────────────────────────┐ │ │     Any signed-in account…│ │
│ │ │ ## Get a key                            │ │ │                           │ │
│ │ │ 1. Sign up …                  (20 rows) │ │ │ [Publish]                 │ │
│ │ └─────────────────────────────────────────┘ │ │ [Save draft]              │ │
│ │ Write in Markdown. HTML tags are removed.   │ │ Preview ↗                 │ │
│ │ ▸ Markdown help                             │ │ Unsaved changes. Preview  │ │
│ │                                             │ │ shows the last save.      │ │
│ │ Search and sharing                          │ │ ───────────────────────── │ │
│ │ Description (optional)                      │ │ Delete page               │ │
│ │ [                                         ] │ └───────────────────────────┘ │
│ │ Search engine title (optional)              │   320px, sticky below top bar │
│ │ [                                         ] │                               │
│ │ Link preview image (optional)               │                               │
│ │ [ https://                                ] │                               │
│ └─────────────────────────────────────────────┘                               │
└───────────────────────────────────────────────────────────────────────────────┘
375px: one column, same order: fields, Search and sharing, then Publishing (not sticky),
buttons full width, 44px tall. Body textarea 14 rows.
```

The heading is **New page** on the new form, else the saved title. The badge is the saved status.
The two columns start at 1024px. Below that it is the 375px layout.

### Fields

| Field | Control | Hint | Limit |
| --- | --- | --- | --- |
| **Title** (required) | `Input` | "Shown as the page heading." | 120 |
| **Slug** (required) | `Input`, mono, `/pages/` prefix | "The page's address. Lowercase letters, numbers and hyphens." | 2–64 |
| **Body** | `Textarea`, mono, vertical resize, spellcheck on | "Write in Markdown. HTML tags are removed. Images must be https links." | 100,000 |
| **Who can read this page** | Radio group: **Public** / **Signed-in only** | "Anyone with the link can read it." / "Any signed-in account can read it. Signed-out visitors get a “Page not found” page and don't see links to it." | Default Public |
| **Description (optional)** | `Textarea`, 3 rows | "Shown in search and link previews. Portal search finds it too." | 300 |
| **Search engine title (optional)** | `Input` | "Leave empty to use the page title." | 120 |
| **Link preview image (optional)** | `Input type="url"`, mono | "A full https address. Leave empty for no image." | 2,048 |

- **Slug from title.** On a new page the slug follows the title (lowercase; other characters become
  single hyphens; trimmed to 64) until the admin edits the slug. It never changes by itself after
  the first save. Nothing usable in the title leaves the slug empty.
- **Slug change on a published page**: warning text under the field, icon and words, `aria-live`:
  "The old address `/pages/{saved slug}` stops working when you save. Header and footer links follow
  the page."
- **Body counter** appears from 90,000 characters: "{n} of 100,000 characters". Announced only when
  it passes the limit.
- `Enter` in a one-line field never submits. Line breaks pasted into a one-line field become spaces.
- **Markdown help** is a `<details>`: headings (`## Heading`), **bold**, lists, links, images, tables
  and code blocks, one example each, then "Start headings at `##`; the title is the top heading."

### Actions

| Saved status | Buttons, in order |
| --- | --- |
| New, never saved | **Publish** (primary), **Save draft** (secondary) |
| Draft | **Publish** (primary), **Save draft** (secondary), **Preview** (link, new tab), **Delete page** |
| Published | **Save changes** (primary), **View page** (link, new tab), **Unpublish** (secondary), **Delete page** |

- Published note above the buttons: "This page is live. Saving changes what readers see."
- New-tab links end in `↗` (`aria-hidden`) with sr-only "(opens in a new tab)".
- **Delete page** is a ghost button in `--destructive`, below a divider.
- Every save sends all fields. **Publish** and **Unpublish** send the form as it is now, with the new
  status, so unsaved edits are saved too.
- While busy: the pressed button reads **Saving…**, **Publishing…**, **Unpublishing…** or
  **Deleting…**; all fields and buttons are disabled; the form has `aria-busy`.
- Unsaved changes: "Unsaved changes." in Publishing (drafts add "Preview shows the last save."), and
  the browser's leave warning.

### States

| State | What shows |
| --- | --- |
| Loading | "← Pages", skeletons for heading, fields and Publishing, sr-only "Loading page…" |
| Saved | Toast: "Draft saved." / "Page published." / "Changes saved. They're live now." / "Page unpublished. It's a draft now." The form takes the returned values. Focus stays on, or returns to, the first button in Publishing |
| Field errors (client, 400, 409) | Error alert above the form, then each message under its field. Everything typed stays |
| 413 | Alert: **The page wasn't saved** / "It's too large. Shorten the body and try again." |
| 401 | Alert: **The page wasn't saved** / "Your session has ended. Sign in again in a new tab, then save here." + **Sign in** (new tab). Everything typed stays |
| 403 | Alert: **The page wasn't saved** / "Your account can't edit pages." |
| 404 while saving or confirming | Alert: **This page was deleted** / "Another admin deleted it. Copy your text if you need it." + **Back to pages**. Fields stay readable; every button is disabled |
| 5xx, network | Alert: **The page wasn't saved** / "The portal server didn't respond. Your text is still here; try again." |
| Load 404 or invalid ID | **Page not found** / "It may have been deleted." + **Back to pages** |
| Load error | Alert: "We couldn't load this page. Try again in a moment." + **Try again** |
| Deleted | Go to `/admin/pages`, toast "Page deleted." |

The field error alert's heading is **The page wasn't saved** and it takes focus. It lists each
message as a link that focuses the field.

| Pointer | Message |
| --- | --- |
| `/title` | Empty: "Enter a title." Long: "Use 120 characters or fewer." |
| `/slug` | Pattern or length: "Use 2–64 lowercase letters, numbers and single hyphens, like getting-started." 409: "Another page already uses this slug. Choose a different one." |
| `/body` | "The body can be at most 100,000 characters." |
| `/description` | "Use 300 characters or fewer." |
| `/seoTitle` | "Use 120 characters or fewer." |
| `/ogImageUrl` | "Enter a full https:// address without a user name or password." |
| anything else | The server's message, under the field if the pointer names one, else in the alert |

Client checks run on save, use the same messages, and send nothing when one fails. A field's message
clears when that field changes.

### Confirmations (`AlertDialog`, focus starts on Cancel)

**Unpublish.** Pressing it reads the page again (**Checking links…**). With no links it unpublishes
at once. With links:

```
┌─────────────────────────────────────────────┐
│ Unpublish “Getting started”?                │
│ It becomes a draft and /pages/getting-      │
│ started stops working. These links          │
│ disappear until you publish it again:       │
│   • Header: Start here                      │
│   • Footer: Getting started                 │
│ Unsaved changes are saved in the draft.     │  only when there are some
│                      [Cancel]  [Unpublish]  │
└─────────────────────────────────────────────┘
```

**Delete page.** Always asks. It opens at once and reads the page while open.

```
┌─────────────────────────────────────────────┐
│ Delete “Getting started”?                   │
│ The page and its text are deleted. This     │
│ can't be undone. These links disappear:     │
│   • Header: Start here                      │
│                    [Cancel]  [Delete page]  │  destructive
└─────────────────────────────────────────────┘
```

- With no links, Delete leaves out "These links disappear:" and the list.
- While it reads: "Checking where this page is linked…" (`role="status"`), confirm disabled.
- The read fails: "We couldn't check where this page is linked. Nothing changed." + **Try again**;
  confirm stays disabled. For Unpublish the same text shows in the form alert.
- The action fails: the message from the states table inside the dialog, which stays open.
- `Escape` or **Cancel** returns focus to the button that opened it. Busy: both buttons disabled.

## Screen 4 — Preview (`/page-preview/{pageId}`)

**Purpose:** see the saved page as readers will, in the portal theme. **Primary action:** Back to editor.

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠ Preview. Only admins can see this draft.     Back to editor   │
├─────────────────────────────────────────────────────────────────┤
│ (Screen 5, exactly)                                             │
└─────────────────────────────────────────────────────────────────┘
```

- `.alert.warning`, above the article, not sticky. It is not a live region. **Back to editor** goes
  to `/admin/pages/{pageId}`.
- A published page reads: "Preview. This page is published at `/pages/{slug}`."
- Empty body: "This page has no text yet." in `--muted-foreground`, preview only.
- Tab title: `Preview: {title}`.
- Not an admin, signed out, deleted or invalid ID: today's "Page not found" page, nothing else.
- Server down: today's unavailable page. The body fails to render: Screen 7.

## Screen 5 — Public page (`/pages/{slug}`)

**Purpose:** read. **Primary action:** none; links in the text.

```
1280px                                              375px
┌──────────────────────────────────────────────┐    ┌─────────────────────────┐
│ header                                       │    │ header                  │
│                                              │    │ Getting started         │
│ Getting started                       (h1)   │    │ Updated 23 Nov 2026     │
│ Updated 23 Nov 2026   [Signed-in only]       │    │ [Signed-in only]        │
│                                              │    │                         │
│ Text, max 720px, left-aligned                │    │ Text, full width        │
│ ## Get a key                          (h2)   │    │ ┌─────────────────────┐ │
│ ┌──────────────────────────────────────┐     │    │ │ code scrolls inside │→│
│ │ curl https://…                       │     │    │ └─────────────────────┘ │
│ └──────────────────────────────────────┘     │    │                         │
│ footer                                       │    │ footer                  │
└──────────────────────────────────────────────┘    └─────────────────────────┘
```

- Content in `<article>`, max width `--portal-prose-max-width`. The description isn't shown.
- **Signed-in only** is a plain `Badge`, shown only for that visibility. Public pages have no badge.
- No edit link: the public contract has no page ID.

### `MarkdownBody` (new component, `markdown-body.tsx`)

Prop: `source: string`. No variants. Styles are scoped to `.markdown-body`, tokens only.

| Element | Style |
| --- | --- |
| Paragraph, list | `--portal-text-base`, 16px between blocks; lists indented 24px with markers |
| `#`, `##` → `h2` | `--portal-text-2xl`, 32px above, 12px below |
| `###` → `h3` | `--portal-text-lg`, 24px above, 8px below |
| `h4`–`h6` | `--portal-text-base`, weight 600, 16px above |
| Link | `--primary`, always underlined; hover removes the underline |
| Inline code | `--portal-font-mono`, `--muted` fill, 2px 4px padding |
| Code block | `--portal-font-mono`, `--portal-text-sm`, `--muted` fill, 16px padding, `--radius`, scrolls sideways |
| Table | `--portal-text-sm`, `--border` lines, `--muted` header; its wrapper scrolls sideways |
| Quote | 3px left border `--input`, 16px padding, `--muted-foreground` |
| Image | Max width 100%, height auto, `--radius` |
| Rule | 1px `--border`, 32px above and below |
| Task list item | Disabled checkbox with `aria-label` "Done" or "Not done" |
| Refused link or image | The link text or the alt text as plain text; nothing when the alt is empty |

Long words and URLs wrap (`overflow-wrap: anywhere`), so the page never scrolls sideways.

| State | What shows |
| --- | --- |
| Loading | The browser's own; no skeleton (the 404 must be known first) |
| Empty body | Title and date only |
| An image doesn't load | The browser shows the alt text |
| 404, server down, render failure | Screens 6 and 7 |

## Screen 6 — Page not found (`/pages/{slug}`)

The same page for a slug that doesn't exist, a draft and a signed-in-only page. It never repeats the slug.

```
Signed out                                      Signed in, or session unknown
Page not found                                  Page not found
We can't find that page. Check the address,     We can't find that page. Check the address,
or go back to the APIs.                         or go back to the APIs.
Some pages are for signed-in developers only.   [Go to APIs]
[Sign in]   [Go to APIs]
```

- **Sign in** is primary and a plain link (`signInLink(pathname)`). **Go to APIs** is secondary when
  Sign in is there, else primary.
- "Some pages are for signed-in developers only." shows to every signed-out visitor, so it reveals
  nothing. Demo builds show the signed-in column.
- A signed-in reader who lands here again after signing in sees the right column, so there is no loop.
- Tab title: "Page not found".

## Screen 7 — Page can't be shown

| Cause | What shows |
| --- | --- |
| Server 5xx or down | Today's `ServerUnavailable` page |
| The body fails to render | **This page couldn't be shown** / "Something in its text stopped it from loading. Try again, or go back to the APIs." + **Try again**, **Go to APIs** |

## Screen 8 — Navigation editor (`/admin/navigation`)

**Purpose:** choose and order header and footer links. **Primary action:** Save navigation.

```
1280px
┌───────────────────────────────────────────────────────────────────────────────┐
│ Navigation                                                 Open the portal ↗  │
│ Links in the portal's header and footer. Not shown in the admin area.         │
│ ┌ Header ───────────────────────────────────────────────────────────────────┐ │
│ │ 1 [↑][↓]  APIs           Built-in. Everyone sees it.         Show [●  ]   │ │
│ │ 2 [↑][↓]  Label             Page                              [Remove]    │ │
│ │           [ Start here   ]  [ Getting started        ⌄ ]                  │ │
│ │                             Public. Everyone sees this link.              │ │
│ │ 3 [↑][↓]  Label             Web address                       [Remove]    │ │
│ │           [ Status       ]  [ https://status.acme.com  ]                  │ │
│ │ 4 [↑][↓]  My apps        Built-in. Signed-in developers see it. Show [ ○]│ │
│ │ [Add page link]  [Add external link]                                      │ │
│ │ Search, Sign in, Sign up and the account menu always come after these     │ │
│ │ links and can't be hidden or moved.                                       │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│ ┌ Footer ───────────────────────────────────────────────────────────────────┐ │
│ │ No footer links.                                                          │ │
│ │ [Add page link]  [Add external link]                                      │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│ [Save navigation]  [Reset to default]   Unsaved changes.                      │
└───────────────────────────────────────────────────────────────────────────────┘

375px: each row is a stacked block
┌───────────────────────────────┐
│ 2  Page link        [↑] [↓]   │
│ Label                         │
│ [ Start here                ] │
│ Page                          │
│ [ Getting started         ⌄ ] │
│ Public. Everyone sees this…   │
│ [Remove]                      │
└───────────────────────────────┘
Add, Save and Reset buttons are full width, stacked; arrows are 44×44px.
```

### `NavigationList` (new component)

Props: `area: 'header' | 'footer'`, `items`, `pages: PageSummary[]`, `errors` (by pointer),
`onChange`. An `<ol>` of rows; row keys are client IDs, so inputs keep focus when a row moves.

- **Built-in row**: name, note and a `Switch` labelled **Show**. `hidden` is its opposite. No Remove,
  label or address. Off adds the word "Hidden" and mutes the name.
  Notes: "Built-in. Everyone sees it." / "Built-in. Signed-in developers see it."
- **Page row**: **Label** `Input` (60) and **Page** `SelectField`. First option "Choose a page". Each
  option is the title, then ", draft" or ", signed-in only" when it applies, in the pages list's order.
  Choosing a page fills an empty label with its title, cut to 60.
- **External row**: **Label** `Input` (60) and **Web address** `Input type="url"`, mono.
- Text under a chosen page: "Public. Everyone sees this link." / "Signed-in only. Signed-out visitors
  don't see this link." / "Draft. Nobody sees this link until you publish the page."
- **Move up** is disabled on the first row, **Move down** on the last. Footer rows can't move to the
  header or back.
- **Add** puts a row at the end and focuses its Label. **Remove** doesn't ask; nothing is saved yet.
- At 12 header items (built-ins count) or 20 footer items both Add buttons are disabled, with "The
  header can have up to 12 links, including built-ins." / "The footer can have up to 20 links."
- No pages exist: **Add page link** is disabled, with "No pages yet." and a **New page** link.

### States

| State | What shows |
| --- | --- |
| Loading | Heading, two cards with 2 skeleton rows each, sr-only "Loading navigation…" |
| Load error | Alert: "We couldn't load the navigation. Try again in a moment." + **Try again** |
| Pages list fails, navigation loads | Saved page rows use their own `page` title and can't change page; **Add page link** is disabled with "We couldn't load the pages." + **Try again** |
| Default | Header: APIs, My apps. Footer: "No footer links." **Reset to default** disabled unless there are unsaved changes |
| Unsaved | "Unsaved changes." beside Save (`role="status"`), and the browser's leave warning |
| Save with no changes | No request. "No changes to save." So an untouched default is never stored |
| Saving | **Saving…**, everything disabled, `aria-busy` |
| Saved | Toast: "Navigation saved. Visitors see it on their next page load." Focus returns to Save |
| Field errors (client, 400) | Alert **The navigation wasn't saved** takes focus and links to each field; messages under fields; all rows stay as typed |
| Error at `/header` or `/footer` | The server's message in the alert + **Reload** ("Reload to get the current links. Unsaved changes are lost.") |
| 401 | As Screen 3, with **The navigation wasn't saved** |
| 403 | **The navigation wasn't saved** / "Your account can't edit the navigation." |
| 5xx, network | **The navigation wasn't saved** / "The portal server didn't respond. Your changes are still here; try again." |

| Pointer | Message |
| --- | --- |
| `…/label` | Empty: "Enter a label." Long: "Use 60 characters or fewer." |
| `…/url` | "Enter a full https:// address without a user name or password." |
| `…/pageId` | Nothing chosen: "Choose a page." Gone: "This page no longer exists. Choose another page or remove the link." |

In the alert each line names its row: "Header link 3: Enter a label."

**Reset to default** (`AlertDialog`, focus on Cancel): **Reset navigation to default?** / "The header
goes back to APIs and My apps, and your footer links are removed. Your pages don't change. This can't
be undone." / **Cancel**, **Reset to default** (destructive). Busy: **Resetting…**. Success closes it
with the toast "Navigation reset to default." Failure stays open: "The navigation wasn't reset. Nothing
changed; try again."

## Screen 9 — Header, mobile menu and footer

### Header, visitor and developer

```
≥1024px, or the default navigation at today's desktop width
[Brand]  Start here  APIs  Status  My apps  More ▾   [ Search… ]   Sign in  [Sign up]
```

- Only links move. Brand first; search, then Sign in and Sign up or the account menu, always last.
- **Default navigation**: the same markup, text, order and breakpoints as today.
- **Role rule**: `my-apps` only for signed-in developers. Session unknown: show what today shows for
  built-ins; page and external links always show, because the server already resolved them.
- Page links have `aria-current="page"` when the path equals their `href`. Built-ins keep their rule.
- **More than 4 links for this visitor**: the first 3, then **More** (`DropdownMenu`, `Chevron`) with
  the rest in order. The count is after the role rule, so server and client agree. **More** gets
  `aria-current="true"` when the current page is inside it.
- Inline page and external labels cut at 16ch with an ellipsis and `title`. In menus and the footer
  they wrap.
- **Between today's desktop breakpoint and 1024px**: 2 links or fewer keep today's layout; 3 or more
  use the mobile header (icon search, menu button).

### Header, admin

- Default navigation, or any path under `/admin`: exactly today's top bar.
- Saved navigation elsewhere, ≥1024px: the links sit between the brand and search in their own
  `<nav aria-label="Portal links">`, same More rule, without My apps. The search field shrinks first.
- Below 1024px an admin doesn't see header links: the drawer is spec 024's sidebar and isn't changed.
  Footer links still show.
- `/setup` keeps its brand-only header and no footer links, for everyone.

### Mobile menu

Today's dialog. The links come first in saved order, one per line, at least 44px tall, no More, then
Sign in and Sign up or the account entries as today.

### Footer

```
≥768px   Terms   Support   Status                Powered by Developer Portal · Apache 2.0
375px    Terms
         Support
         Status
         Powered by Developer Portal · Apache 2.0
```

- No footer links for this visitor: today's footer markup, with no empty `<nav>`.
- With links: `<nav aria-label="Footer"><ul>`, `--portal-text-sm`, `--muted-foreground`, underlined on
  hover and focus, 24px between links, wrapping. 375px rows are 44px tall. "Powered by" always stays.
- Not shown under `/admin`.

| State | What shows |
| --- | --- |
| Navigation can't load (timeout, 5xx, bad JSON) | The default header and footer; no message |
| Demo build | Today's header and footer |
| Every header entry hidden | Brand, search, Sign in and Sign up only; the mobile menu still opens |

## Screen 10 — Search

A page result in the existing list (`SearchResultRow`):

```
[Page]  Getting started
        Sign up, get a key and make your first call.
```

- `Badge` "Page", the title, then the description when there is one, in the place an API shows
  "Version …". Cut at 2 lines. Links to `/pages/{slug}`.
- `/search` start text: "Search API names, paths like /orders/{id}, what an operation does, or page
  titles." Demo builds keep today's text. The "Search APIs and endpoints" label and placeholder, the
  counts, empty, loading and error states don't change.

## Accessibility (WCAG 2.2 AA)

- **Keyboard**: everything works with Tab, Shift+Tab, Enter, Space, Escape and arrow keys in radios,
  selects and menus. Nothing needs dragging (2.5.7). Tab leaves the body textarea.
- **Focus order, editor**: back link → (alert) → Title → Slug → Body → Markdown help → Description →
  Search engine title → Link preview image → visibility → buttons in the order above → Delete page.
  DOM order is the same at both widths.
- **Focus order, navigation**: Open the portal → header rows (up, down, label, target, Remove or Show)
  → Add buttons → footer the same → Save → Reset.
- **Moving a row**: focus stays on the pressed arrow. If that arrow becomes disabled, focus goes to
  the row's other arrow. Announce "{label} moved to position {n} of {total} in the header."
- **Removing a row**: focus goes to the next row's first enabled control, else the previous row's,
  else **Add external link**. Announce "{label} removed. Save to apply."
- Announcements use one `role="status"` region per editor.
- **Names**: each row is `role="group"` named "Header link 2: Start here". Arrows are "Move Start here
  up" / "down", Remove is "Remove Start here", the switch is "Show My apps". With no label, use
  "link 2". Arrow icons are `aria-hidden`.
- **Fields**: visible `Label`; hint and error joined with `aria-describedby`; errors set
  `aria-invalid`. Required fields have `required` and the word is in the error, not only an asterisk.
  Radios sit in a `fieldset` with a `legend`.
- **Scrolling regions** (code blocks, tables): `tabindex="0"`, `role="region"`, `aria-label` "Code" or
  "Table".
- **Headings**: one `h1` per page. Body headings start at `h2`. The admin cards are `h2`.
- **Contrast**: token pairs only, which meet 4.5:1 text and 3:1 controls in light and dark.
  `--muted-foreground` on `--muted` is 6.9:1 light, 5.7:1 dark.
- **Targets**: at least 24×24px; 44×44px below 768px. Reflows at 320px and 400% zoom.
- Status is never colour alone: Published, Draft, Hidden and Signed-in only are words.

## Responsive summary

| | 375px | 1280px |
| --- | --- | --- |
| Pages list | Cards | Table |
| Editor | One column, Publishing last | Fields + 320px sticky Publishing (from 1024px) |
| Navigation editor | Stacked rows, full-width buttons | One-line rows |
| Dialogs | 16px gutter, buttons stacked, Cancel last | 480px, buttons right |
| Public page | Full width, 16px gutter | 720px column |
| Header | Mobile menu | Inline links + More |
| Footer | Stacked | One wrapping row |

Admin screens use the built-in theme. Preview, public pages, header, footer and search use the
portal's theme through CSS variables only.

## Components

| Reused | Where |
| --- | --- |
| `PageHeader`, `Table`, `Badge`, `EmptyState`, `Card` | Admin screens |
| `Input`, `Textarea`, `SelectField`, `Label`, `Switch`, `Button` | Editors |
| `AlertDialog` | Unpublish, Delete, Reset |
| `DropdownMenu`, `Chevron`, `Dialog` | Header More, mobile menu |
| `toast`, `ProblemAlert`, `ServerUnavailable` | Results and errors |
| **New**: `MarkdownBody`, `NavigationList` | Above |
