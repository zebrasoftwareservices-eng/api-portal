# 013 — Theme editor: UX design

Spec: [013-theme-editor](../specs/013-theme-editor.md) · Tokens: [tokens.md](tokens.md) ·
ADR: [0016](../adr/0016-theme-stored-in-postgres-served-as-runtime-css.md)

One admin screen, **Admin → Theme** (`/admin/theme`), with a form on one side and a live preview
of the public portal on the other. Nothing reaches the live portal until **Save theme**. The
editor itself always uses the built-in look, so a bad theme can never hide the controls that fix it.

Uses only the contract in the spec: `GET/PUT/DELETE /v1/admin/theme`,
`GET /v1/admin/theme/export`, `POST /v1/admin/theme/import`, and the `ThemeValues` fields
(`colors.light|dark.{background, foreground, muted, mutedForeground, primary, primaryForeground,
accent, accentForeground, border}`, `font`, `radius`, `defaultMode`, `customCss`) plus
`logo`/`favicon`.

## User flow

**Brand the portal (AC 1, 2, 3, 8)**
1. Admin opens **Admin** → **Theme** tab (full page load, `<a>`). The editor loads the saved
   theme (`GET /v1/admin/theme`) and the preview loads the home page in an iframe.
2. Admin uploads a logo and a favicon. The client checks type and size, then the preview header
   shows the new logo.
3. Admin edits colours on the **Light** tab, then the **Dark** tab. The preview follows the tab
   being edited. A contrast warning appears under any pair below 4.5:1.
4. Admin picks a font and a corner radius, and chooses the default mode. The preview updates
   as they type (debounced 150 ms).
5. Optional: admin writes custom CSS. The preview applies it; the live portal does not.
6. The action bar says **Unsaved changes**. Admin selects **Save theme**.
7. Success: status "Theme saved. Visitors see it on their next page load." The badge changes
   from **Default theme** to **Custom theme**.

**Recover (AC 4, 5)**
1. Custom CSS broke the public site. Admin opens `/admin` — it looks normal (no custom CSS there).
2. Admin opens **Theme**, clears or fixes **Custom CSS**, saves. Or selects **Reset to default**
   → confirms → everything returns to the shipped theme.

**Move a theme between installs (AC 6, 7)**
1. On install A: **Export** → browser downloads `portal-theme.json` (the saved theme).
2. On install B: **Import** → picks the file → confirm dialog → **Import and apply**.
3. Success: the form reloads with the imported values and the status says "Theme imported and
   applied." On error, nothing changes and the error names the problem.

## Screen: Admin → Theme (`/admin/theme`)

**Purpose:** change the portal's brand safely and see it before it goes live.
**Primary action:** **Save theme**.

### Layout at 1280px

```
┌ Portal header (built-in logo) ──────────────────────────────────────────────────────────┐
│ Admin                                                                                    │
│ APIs  Products  Requests  Insights  Gateways  Mail  Accounts  [Theme]                    │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Theme  (Custom theme)                              [Import]  [Export]  [Reset to default] │
│ Brand the public portal and developer pages. The admin area always uses the built-in look.│
├───────────────────────────────────────┬──────────────────────────────────────────────────┤
│ ┌ Logo and favicon ─────────────────┐ │ Preview  · not live until you save               │
│ │ Logo     [img 40px]  acme.svg 12 KB│ │ Mode: (Light) (Dark)              [↻ Reload]    │
│ │          [Upload logo] [Remove]    │ │ ┌──────────────────────────────────────────────┐ │
│ │ PNG, SVG or WebP, up to 512 KB.    │ │ │  iframe  /?themePreview=1                    │ │
│ │ Favicon  [img 16px]  default       │ │ │  (public home page with the draft theme)     │ │
│ │          [Upload favicon]          │ │ │                                              │ │
│ │ PNG, SVG or ICO, up to 128 KB.     │ │ │                                              │ │
│ └────────────────────────────────────┘ │ │                                              │ │
│ ┌ Colours ───────────────────────────┐ │ │                                              │ │
│ │ [Light] [Dark]        Reset colours │ │ └──────────────────────────────────────────────┘ │
│ │ Background        [■] [#ffffff   ] │ │  (sticky: top 16px, height calc(100vh − 160px)) │
│ │ Text              [■] [#0f172a   ] │ │                                                  │
│ │ Muted background  [■] [#f1f5f9   ] │ │                                                  │
│ │ Muted text        [■] [#475569   ] │ │                                                  │
│ │  ⚠ Low contrast on Muted background│ │                                                  │
│ │    3.9:1 — text needs 4.5:1.       │ │                                                  │
│ │ Primary           [■] [#1d4ed8   ] │ │                                                  │
│ │ Text on primary   [■] [#ffffff   ] │ │                                                  │
│ │ Accent            [■] [#eff6ff   ] │ │                                                  │
│ │ Text on accent    [■] [#1e3a8a   ] │ │                                                  │
│ │ Border            [■] [#e2e8f0   ] │ │                                                  │
│ └────────────────────────────────────┘ │                                                  │
│ ┌ Font and shape ────────────────────┐ │                                                  │
│ │ Font   [ Inter               ▾ ]   │ │                                                  │
│ │        Sample: Get your API key…   │ │                                                  │
│ │ Corner radius  ──●────── [ 8 ] px  │ │                                                  │
│ │ Default mode  (•) Follow system    │ │                                                  │
│ │               ( ) Always light     │ │                                                  │
│ │               ( ) Always dark      │ │                                                  │
│ └────────────────────────────────────┘ │                                                  │
│ ┌ Custom CSS ────────────────────────┐ │                                                  │
│ │ ┌──────────────────────────────────┐│ │                                                  │
│ │ │ .portal-hero { … }   (monospace) ││ │                                                  │
│ │ └──────────────────────────────────┘│ │                                                  │
│ │ 1,204 / 65,536 characters          │ │                                                  │
│ └────────────────────────────────────┘ │                                                  │
├───────────────────────────────────────┴──────────────────────────────────────────────────┤
│ ● Unsaved changes · 1 contrast warning          [Discard changes]  [Save theme]          │ ← sticky bottom bar
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Container: `--portal-page-max-width`, gutters `--portal-page-gutter`.
- From 1024px: two columns, form `minmax(360px, 480px)`, preview `1fr`, gap 32px. The preview
  column is `position: sticky` so it stays in view while the form scrolls.
- Form sections are shadcn `Card`s, 24px gap between them.
- The action bar is sticky at the bottom of the viewport (`--card` background, top `--border`,
  `--portal-shadow-overlay`). It is always visible so Save is never off-screen.

### Layout at 375px

```
┌ header ────────────────────────┐
│ Admin   [ Theme            ▾ ] │  ← existing admin select
│ Theme (Default theme)          │
│ Brand the public portal…       │
│ [Import] [Export] [Reset…]     │  ← wrap, full-width row of outline buttons
│ ┌ [ Edit ] [ Preview ] ──────┐ │  ← Tabs, only below 1024px
│ └────────────────────────────┘ │
│ ┌ Logo and favicon ──────────┐ │
│ │ Logo  [img]                │ │
│ │ [Upload logo]   [Remove]   │ │
│ │ PNG, SVG or WebP, ≤512 KB  │ │
│ └────────────────────────────┘ │
│ ┌ Colours ───────────────────┐ │
│ │ [Light] [Dark]             │ │
│ │ Background                 │ │
│ │ [■] [#ffffff            ]  │ │  ← label above, swatch + hex input full width
│ │ …                          │ │
│ └────────────────────────────┘ │
│ … Font and shape, Custom CSS   │
├────────────────────────────────┤
│ ● Unsaved changes              │
│ [Discard]      [Save theme]    │  ← sticky, two buttons fill the row
└────────────────────────────────┘
```

- Below 1024px the preview moves into a **Preview** tab (shadcn `Tabs`: **Edit** | **Preview**).
  The iframe keeps the draft when switching tabs (it stays mounted, hidden with `hidden`).
  On the Preview tab the iframe is full width and `height: calc(100dvh − 220px)`, min 420px.
- Header buttons wrap onto their own row; each is at least 44px tall.
- Colour fields stack label above input. Hex inputs use 16px text (no iOS zoom).
- No horizontal scroll at 375px. The iframe renders the portal at the iframe's own width, so the
  mobile preview shows the mobile portal.

### Sections and content

**Page header**
- `h1` "Theme", followed by a `Badge`: **Default theme** (`secondary`) when `isDefault`, otherwise
  **Custom theme** (`outline`). Below the heading, when `updatedAt` is set: "Last saved 16 Nov 2026, 14:02"
  (`--portal-text-sm`, `--muted-foreground`, local time, `<time datetime>` in UTC).
- Description: "Brand the public portal and developer pages. The admin area always uses the
  built-in look, so you can fix a theme here whatever it does."
- Buttons (`variant="outline"`): **Import**, **Export**, **Reset to default**. Reset is disabled
  with the tooltip-free hint text "Already the default theme" (as `aria-describedby`) when
  `isDefault` and there are no unsaved changes.

**Logo and favicon** (`Card`, title "Logo and favicon")
- Each row: label, a thumbnail on a `--muted` checkerboard tile (logo: 40px tall, max 160px wide;
  favicon: 32×32), file name or "Built-in" and size ("12 KB"), then **Upload logo** /
  **Replace logo** and **Remove** (`variant="ghost"`, shown only when a custom asset is set or
  pending).
- Hint under each: "PNG, SVG or WebP, up to 512 KB. Shown in the header at up to 40px tall." /
  "PNG, SVG or ICO, up to 128 KB. Square works best."
- The file input is visually hidden; the button triggers it. `accept` is
  `image/png,image/svg+xml,image/webp` (logo) and `image/png,image/svg+xml,image/x-icon,.ico` (favicon).
- After picking a valid file the row shows the new thumbnail and "Not saved yet" in
  `--muted-foreground`. Remove shows "Built-in · Not saved yet". Thumbnails use `<img>` with an
  object URL, `alt=""` (the visible file name is the label).

**Colours** (`Card`, title "Colours")
- `Tabs` **Light** | **Dark** edit `colors.light` and `colors.dark`. Switching the tab also switches
  the preview mode (the preview's own Light/Dark toggle stays in sync both ways).
- Nine `ColorField`s, in this order and with these labels (token in the hint, mono, `--portal-text-sm`):

  | Label | Field | Hint |
  | --- | --- | --- |
  | Background | `background` | Page background · `--background` |
  | Text | `foreground` | Body text and headings · `--foreground` |
  | Muted background | `muted` | Code blocks, table headers · `--muted` |
  | Muted text | `mutedForeground` | Hints and metadata · `--muted-foreground` |
  | Primary | `primary` | Buttons, links, focus ring · `--primary` |
  | Text on primary | `primaryForeground` | Button labels · `--primary-foreground` |
  | Accent | `accent` | Hover and selected rows · `--accent` |
  | Text on accent | `accentForeground` | Text on hover rows · `--accent-foreground` |
  | Border | `border` | Dividers and card edges · `--border` |

- **Reset colours** (link-style `Button variant="link"`, right of the tabs) sets only the current
  tab's nine values back to `defaults` in the draft. Not saved until **Save theme**.
- Contrast warnings: see [Contrast warnings](#contrast-warnings).

**Font and shape** (`Card`, title "Font and shape")
- **Font**: shadcn `Select` with all six `ThemeFont` values, labels: "System default", "Inter",
  "IBM Plex Sans", "Source Sans 3", "Noto Sans", "Atkinson Hyperlegible". Under it a sample line
  set in the chosen family: "Get your API key and make your first call in minutes." Hint:
  "Fonts are served by your portal. Visitors' browsers make no third-party requests."
- **Corner radius**: shadcn `Slider` (0–24, step 1) paired with a number `Input` (width 72px,
  suffix "px"). Either control updates the other. Next to it, a 48×32 sample box with that radius
  and a `--input` border. Values outside 0–24 typed in the number input are clamped on blur.
- **Default mode**: `RadioGroup` legend "Default mode": **Follow visitor's system setting**
  (`system`), **Always light** (`light`), **Always dark** (`dark`). Hint: "Both palettes are saved
  either way."

**Custom CSS** (`Card`, title "Custom CSS")
- Plain `Textarea`, `--portal-font-mono`, 14px, 12 rows, `spellcheck="false"`,
  `autocapitalize="off"`, `wrap="off"` with horizontal scroll inside the field only.
  Placeholder: `/* Applied after the theme on public and developer pages */`.
- Hint (`aria-describedby`): "Applies to public and developer pages, never to the admin area.
  `@import` isn't allowed; use `url()` to load a web font."
- Counter under the field, right-aligned: "1,204 / 65,536 characters". At ≥ 90% the counter uses
  `--portal-warning`; above the limit it uses `--destructive` and shows the field error.
- The textarea's `maxLength` is not set (pasting over the limit should show an error, not silently
  truncate).

**Preview** (right column, or the **Preview** tab)
- Heading row: "Preview" (`h2`, `--portal-text-lg`) and "Not live until you save"
  (`--muted-foreground`). Controls: `ToggleGroup` **Light** | **Dark** (`aria-label="Preview mode"`)
  and **Reload preview** (`Button variant="ghost" size="icon"`, `aria-label="Reload preview"`).
- Frame: `<iframe src="/?themePreview=1" title="Preview of the public portal with your unsaved theme">`,
  1px `--border`, `--radius` corners, `--background` behind it.
- The iframe is a real page, so links inside it work. Only a URL with `themePreview=1` shows the
  draft. On every iframe `load` the editor re-sends the draft; if the frame's URL no longer has
  `themePreview=1` (same-origin, so the editor can read it), a bar above the frame says
  "This page shows the live theme. Reload preview to see your changes." **Reload preview**
  always returns to `/?themePreview=1`.
- The preview shows the logo through the posted object URL, and the draft favicon is not
  previewable (browsers show the admin tab's favicon); the favicon row's thumbnail is the preview.

**Action bar** (sticky bottom)
- Left: status region (`role="status"`, `aria-live="polite"`):
  - clean: "All changes saved" (or nothing on first load of the default theme)
  - dirty: "● Unsaved changes" — the dot is `--portal-warning`, the word carries the meaning
  - dirty + warnings: "● Unsaved changes · 2 contrast warnings" — "2 contrast warnings" is a
    link-style button that moves focus to the first warning (switching the colour tab if needed)
  - saving: spinner + "Saving…"
  - saved: check icon (`--portal-success`) + "Theme saved. Visitors see it on their next page load."
- Right: **Discard changes** (`variant="ghost"`, only when dirty) and **Save theme** (primary;
  disabled when clean or while saving, and while a client-side field error exists).

### Dialogs

**Reset to default** (`AlertDialog`)
- Title: "Reset the theme to the default?"
- Body: "This removes your logo, favicon, colours, font, radius and custom CSS from the live portal
  right away. Export the theme first if you might want it back."
- Buttons: **Cancel** (focused first) · **Export first** (`outline`, downloads, dialog stays open)
  · **Reset to default** (`destructive`).
- In progress: the destructive button shows a spinner and "Resetting…"; all buttons disabled.
- Success: dialog closes, form reloads from the `DELETE` response, status "Theme reset to the
  default." Unsaved changes are discarded too.

**Import a theme** (`AlertDialog`, opens after the file is picked and parsed client-side)
- Title: "Import portal-theme.json?" (the actual file name)
- Body: "This replaces the live theme right away, including the logo and favicon." If the form is
  dirty, add: "Your unsaved changes here will be lost."
- If the parsed file has `exportedAt`, show "Exported 12 Nov 2026" in `--muted-foreground`.
- Buttons: **Cancel** (focused first) · **Import and apply** (primary).
- In progress: "Importing…". Success: dialog closes, form reloads from the response, status
  "Theme imported and applied."
- Errors keep the dialog open and show an `Alert variant="destructive"` inside it (copy below).

**Leave with unsaved changes**
- Navigating away from a dirty form (admin nav link, browser back, closing the tab) uses the
  browser's `beforeunload` prompt. Admin nav entries are full page loads (`<a>`), so the browser's
  own dialog covers all cases; no custom dialog.

## Contrast warnings

Pairs checked with `contrastRatio` from `@portal/theme`, for the colour tab being edited. The
backend's `CONTRAST_PAIRS` must hold exactly these (text-on-surface, all at 4.5:1):

| Text | On | Warning shown under |
| --- | --- | --- |
| `foreground` | `background` | Text |
| `mutedForeground` | `background` | Muted text |
| `mutedForeground` | `muted` | Muted text |
| `primary` | `background` | Primary (links are primary text) |
| `primaryForeground` | `primary` | Text on primary |
| `accentForeground` | `accent` | Text on accent |

`border` is decorative and not checked.

- Warning is an inline `Alert` (warning style: `--portal-warning-subtle` background,
  `--portal-warning` icon and text, `AlertTriangle` icon) directly under the field, linked with
  `aria-describedby`:
  "Low contrast: **3.9:1** between Muted text and Muted background. Text needs at least 4.5:1."
- The Light/Dark tab label gets a count when the *other* tab has warnings: "Dark (1 warning)".
- Warnings never block **Save theme** (AC 8). They update as the value changes, debounced 150 ms,
  and are announced only through the action bar's polite status, not on every keystroke.

## Components

Reused shadcn/ui: `Card`, `Button`, `Badge`, `Tabs`, `Input`, `Label`, `Select`, `Slider`,
`RadioGroup`, `Textarea`, `ToggleGroup`, `Alert`, `AlertDialog`, `Skeleton`.

**New: `ColorField`** (in `apps/portal`, admin only)
- Props: `id`, `label`, `hint`, `value: string` (`#rrggbb`), `onChange(value)`, `error?: string`,
  `warning?: ReactNode`.
- Layout: `Label` → row of a 40×40 swatch button and a hex `Input` (mono, `maxlength=7`). The swatch
  is a native `<input type="color">` styled as a square (`--radius`, `--input` border), with
  `aria-label="{label} colour picker"`. The hex input is the source of truth; the picker writes
  into it.
- Accepts `#abc` and `abc` while typing; on blur it normalises to lower-case `#rrggbb` (3-digit
  values expand). Anything else on blur shows the error "Enter a six-digit hex colour, like
  #1d4ed8." and the draft keeps the last valid value for the preview.
- States: default, focus (ring), invalid (`aria-invalid`, `--destructive` border and message),
  with warning (alert below).

**New: `AssetField`** (admin only)
- Props: `kind: 'logo' | 'favicon'`, `current: ThemeAssetInfo | null`, `pending: File | null | 'remove'`,
  `onPick(file)`, `onRemove()`, `error?`.
- Client checks before accepting the file (same limits as the server): type by MIME and extension,
  size ≤ 512 KB (logo) / 128 KB (favicon). The server still sniffs magic bytes and checks SVG.

## Every state

| State | What the admin sees |
| --- | --- |
| **Loading** | Header with the h1 and badge skeleton; four `Skeleton` cards in the form column; preview frame area as a `--muted` block with "Loading preview…" centred. Action bar shows nothing on the left and a disabled **Save theme**. |
| **Load error** (`GET /v1/admin/theme` fails, not 401/403) | `Alert variant="destructive"` in place of the form: title "Couldn't load the theme", body "The portal server didn't respond. The live portal keeps its current theme." Button **Try again**. No preview, no action bar. |
| **Empty / default** (`isDefault: true`) | Normal form filled with `defaults`. Badge **Default theme**. Logo and favicon rows say "Built-in". Custom CSS empty with placeholder. Reset to default disabled. |
| **Editing (dirty)** | "● Unsaved changes" in the action bar, **Discard changes** shown, **Save theme** enabled. Changed sections are not marked individually. |
| **Saving** | **Save theme** shows a spinner and "Saving…", form fields `disabled`, preview unchanged. |
| **Saved** | Success status in the action bar (stays until the next edit). Badge updates. Pending asset rows lose "Not saved yet". Focus stays on **Save theme**. |
| **Save 400 (validation)** | A destructive `Alert` at the top of the form column: title "The theme wasn't saved", then one line per `errors[]` item, each a link that focuses its field. The field shows the server `detail` as its error (`aria-invalid`). Pointer mapping: `/values/colors/{mode}/{field}` → that `ColorField` (switch the colour tab first); `/logo/*`, `/favicon/*` → that `AssetField`; `/values/customCss` → the textarea; `/values/font`, `/values/radius`, `/values/defaultMode` → that control. Unknown pointer → listed in the alert only. Focus moves to the alert's title. The live theme is unchanged and the draft is kept. |
| **Save 413** | Same alert, single line: "The theme is too large to save (over 2 MB). Use smaller logo and favicon files." |
| **Save network/5xx error** | Same alert: "The theme wasn't saved because the portal server didn't respond. Your changes are still here; try again." |
| **Client field errors** | Shown on blur/pick, block Save (Save disabled, and the action bar says "Fix 1 field to save" as a link to it). |
| **Preview loading** | `--muted` block with "Loading preview…" until the iframe `load` event and the first draft post. |
| **Preview unavailable** (iframe `load` doesn't fire within 10 s or errors) | In the frame area: "Preview isn't available right now. You can still save; check the result on the public portal." + **Reload preview**. |
| **Reset in progress / done / failed** | See dialog. Failure: alert inside the dialog, "The theme wasn't reset because the portal server didn't respond. Try again." |
| **Import errors** | Inside the dialog (or, for a file that won't parse, an alert at the top of the form with no dialog). Copy below. |
| **Export** | **Export** shows "Exporting…" briefly; the browser downloads `portal-theme.json`. When the form is dirty, a hint appears under the header buttons: "Export downloads the saved theme. Save first to include your changes." Failure: alert "The theme couldn't be exported. Try again." |
| **No permission — signed out** | Existing admin guard: redirect to sign-in with return to `/admin/theme`. |
| **No permission — signed in, not admin** | Existing admin guard page. The **Theme** nav entry is shown only to `role === 'admin'` (like Insights). If a non-admin reaches the page and the API answers 403: "Only portal admins can change the theme." with a link "Back to the portal". No form, no preview. |
| **Session expired mid-edit** (save answers 401) | Alert: "Your session ended. Sign in again in a new tab, then select Save theme. Your changes are still here." with **Sign in** opening `/sign-in` in a new tab, so the draft isn't lost. |
| **Demo mode** | Unchanged: `/admin/*` is already rewritten. |

## Copy

| Where | Text |
| --- | --- |
| Nav entry | Theme |
| h1 | Theme |
| Badges | Default theme · Custom theme |
| Description | Brand the public portal and developer pages. The admin area always uses the built-in look, so you can fix a theme here whatever it does. |
| Buttons | Upload logo · Replace logo · Upload favicon · Replace favicon · Remove · Reset colours · Save theme · Saving… · Discard changes · Import · Export · Reset to default · Reload preview |
| Saved | Theme saved. Visitors see it on their next page load. |
| Reset done | Theme reset to the default. |
| Import done | Theme imported and applied. |
| Logo wrong type | The logo must be a PNG, SVG or WebP image. |
| Favicon wrong type | The favicon must be a PNG, SVG or ICO image. |
| Logo too big | The logo is 740 KB; the limit is 512 KB. |
| Favicon too big | The favicon is 200 KB; the limit is 128 KB. |
| Bad hex | Enter a six-digit hex colour, like #1d4ed8. |
| Custom CSS too long | Custom CSS is 70,120 characters; the limit is 65,536. |
| Custom CSS `@import` (client check, same as server) | Custom CSS can't use @import. Use url() inside @font-face to load a font. |
| Import: not JSON (client parse) | portal-theme.json isn't a valid JSON file. Choose a file exported from a portal's Theme page. |
| Import: wrong format/version | This file isn't a portal theme export (or it's from a newer version). Choose a file exported from a portal's Theme page. |
| Import: server 400 | The theme wasn't imported. *(then one line per `errors[].detail`, e.g. "Text on primary (dark) must be a six-digit hex colour.")* Nothing changed. |
| Import: file over 2 MB (client, matches the server's body limit) | The file is too large to import (over 2 MB). |
| Contrast | Low contrast: 3.9:1 between Muted text and Muted background. Text needs at least 4.5:1. |
| Unsaved | Unsaved changes |
| Not saved asset | Not saved yet |

Server `detail` text is shown as returned; field labels above are what the frontend uses when it
builds its own messages. Errors never say "invalid" alone and never blame the admin.

## Accessibility (WCAG 2.2 AA)

- **Keyboard path / focus order:** admin nav → h1 area → Import → Export → Reset to default →
  (below 1024px: Edit/Preview tabs) → Logo upload → Remove → Favicon upload → Remove →
  Light/Dark tabs → Reset colours → each colour field (picker, then hex input) → Font → Radius
  slider → radius number → Default mode radios → Custom CSS → preview mode toggle → Reload preview
  → iframe → action bar (status link, Discard changes, Save theme). DOM order matches; the sticky
  bar is last in the DOM but always visible.
- The sticky action bar must not cover the focused element (2.4.11): the form column gets
  `scroll-padding-bottom` equal to the bar height plus 16px.
- **Tab in Custom CSS** moves focus out (no tab capture), so keyboard users are never trapped.
- **Labels:** every input has a visible `Label`; hints and errors are tied with
  `aria-describedby`; invalid fields set `aria-invalid="true"`. Colour pickers have their own
  `aria-label`. Radio group uses `fieldset`/`legend`. Slider and number input share the label
  "Corner radius" (`aria-labelledby`), slider has `aria-valuetext="8 pixels"`.
- **Status and errors:** the action bar status is `role="status"` (polite). The save-error alert is
  `role="alert"` and receives focus. Contrast warnings are not live regions (avoid chatter); the
  count is in the status.
- **Colour is never the only signal:** warnings have an icon and text; the unsaved dot has the
  words; the badge has words.
- **Contrast of the editor itself:** the editor uses the built-in tokens only, which meet AA
  (see tokens.md). Swatches are surrounded by a `--input` border (≥3:1) so white or near-background
  colours stay visible.
- **Dialogs:** `AlertDialog` traps focus, focuses **Cancel** first, Escape cancels, focus returns
  to the button that opened it.
- **Iframe:** has a `title`; it is a normal tab stop. The editor never moves focus into it.
- **Target size:** all buttons ≥ 44×44 at 375px, ≥ 24×24 at 1280px (2.5.8); colour swatch 40×40.
- **Reduced motion:** spinners keep rotating (essential), skeletons don't pulse
  (`--portal-duration: 0ms`).
- **Zoom:** at 200% zoom on a 1280px screen the layout drops to the single-column + Preview tab
  layout (the 1024px breakpoint is in CSS px).

## Responsive behaviour

| | 375px | 1280px |
| --- | --- | --- |
| Admin nav | Existing select | Existing tabs, **Theme** last |
| Header buttons | Own row, wrap | Right of the h1 |
| Form / preview | One column; **Edit** / **Preview** tabs | Two columns, sticky preview |
| Colour fields | Label above swatch + full-width hex | Label left (160px), swatch + 140px hex right |
| Custom CSS | Full width, 10 rows | 12 rows |
| Action bar | Status on line 1, two buttons fill line 2 | One line |
| Preview size | Full width, `calc(100dvh − 220px)`, min 420px | Column width, `calc(100vh − 160px)`, min 560px |

## Tokens

No new tokens. The editor uses existing tokens; the theme writes the existing names. This spec
adds the **dark default palette** to [tokens.md](tokens.md#dark-mode-defaults) (spec 013) so
`packages/ui/src/styles.css` and `DEFAULT_THEME.colors.dark` share one source.

## Notes for the frontend developer

- Keep draft state as one `ThemeValues` object plus pending assets; dirty = deep-not-equal to the
  last loaded `values` or any pending asset.
- Post the draft to the iframe on every change (debounced 150 ms) and on every iframe `load`.
  Revoke old object URLs when an asset is replaced or the page unmounts.
- Import: read the file client-side, `JSON.parse`, check `format === "portal-theme"` and
  `version === 1` for the friendly messages, then open the confirm dialog and `POST` the parsed
  object as-is. The server re-validates everything.
- Export: fetch the export route and save the blob as `portal-theme.json` (or an `<a download>` to
  the route; the session cookie is same-origin).
