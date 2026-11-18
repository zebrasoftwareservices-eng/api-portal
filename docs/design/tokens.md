# Design tokens

Owned by the ui-designer. `packages/ui` turns this file into CSS variables and a Tailwind
preset. Components use these variables only — never a literal colour, font, radius or
shadow — so a customer theme is a stylesheet that overrides `:root` variables and nothing else.

Names follow the shadcn/ui convention (`--background`, `--primary`, …) so shadcn components
work unchanged and people who already theme shadcn know the names. Portal-specific tokens
use the `--portal-` prefix.

Spec 001 shipped one light theme. Spec 013 adds the dark defaults below and runtime themes:
admins override these variables from **Admin → Theme**, and the server serves the result as
`/v1/theme.css`. The admin area always uses these built-in values.

## Colour

Values are hex for readability; `packages/ui` may store them in whatever format its Tailwind
version expects (HSL channels or OKLCH), as long as the rendered colour is the same.
Contrast ratios are against the background the token is meant to sit on.

| Token | Value | Used for | Contrast |
| --- | --- | --- | --- |
| `--background` | `#ffffff` | Page background | — |
| `--foreground` | `#0f172a` | Body text, headings | 17.9:1 on background |
| `--card` | `#ffffff` | Card, dialog, table surfaces | — |
| `--card-foreground` | `#0f172a` | Text on cards | 17.9:1 |
| `--popover` | `#ffffff` | Menus, select lists | — |
| `--popover-foreground` | `#0f172a` | Text in menus | 17.9:1 |
| `--muted` | `#f1f5f9` | Subtle fills: table header, skeletons, code blocks | — |
| `--muted-foreground` | `#475569` | Secondary text, hints, metadata | 7.6:1 on background, 6.9:1 on muted |
| `--primary` | `#1d4ed8` | Primary buttons, links, selected states | 6.7:1 on background |
| `--primary-foreground` | `#ffffff` | Text on primary | 6.7:1 on primary |
| `--secondary` | `#f1f5f9` | Secondary buttons | — |
| `--secondary-foreground` | `#0f172a` | Text on secondary | 16.3:1 |
| `--accent` | `#eff6ff` | Hover and highlighted rows | — |
| `--accent-foreground` | `#1e3a8a` | Text on accent | 9.5:1 (`--primary` on accent 6.2:1) |
| `--destructive` | `#b91c1c` | Revoke buttons, error text and icons | 6.5:1 on background |
| `--destructive-foreground` | `#ffffff` | Text on destructive | 6.5:1 |
| `--portal-destructive-subtle` | `#fef2f2` | Error alert background | `--destructive` text 5.9:1 on it |
| `--portal-success` | `#15803d` | Active badge, success icon and text | 5.0:1 on background |
| `--portal-success-subtle` | `#f0fdf4` | Success alert / Active badge background | `--portal-success` 4.8:1 on it |
| `--portal-warning` | `#92400e` | Warning text and icon | 7.1:1 on background |
| `--portal-warning-subtle` | `#fffbeb` | Warning alert background ("shown once" notice) | `--portal-warning` 6.8:1 on it |
| `--border` | `#e2e8f0` | Decorative dividers, card and table borders | decorative only |
| `--input` | `#64748b` | Borders of inputs, selects, checkboxes, radios | 4.8:1 on background (≥3:1, WCAG 1.4.11) |
| `--ring` | `#1d4ed8` | Focus ring | 6.7:1 on background |

Rules:
- Text never uses `--border`. Form-control boundaries use `--input`, which meets 3:1.
- Status is never shown by colour alone; every badge and alert also has a word and an icon.
- A theme that overrides a colour pair must keep the listed contrast (4.5:1 text, 3:1 UI).

## Dark mode defaults

Spec 013. Applied under `@media (prefers-color-scheme: dark)` on `:root:not([data-theme=light])`
and on `:root[data-theme=dark]`. `DEFAULT_THEME.colors.dark` in `@portal/theme` must match the
first nine rows (the editable `ThemeColors`). Tokens not listed keep their `var()` derivation
(`--card` → `--background`, `--secondary` → `--muted`, `--ring` → `--primary`, …).

| Token | Value | Contrast |
| --- | --- | --- |
| `--background` | `#0f172a` | — |
| `--foreground` | `#f1f5f9` | 16.3:1 on background |
| `--muted` | `#1e293b` | — |
| `--muted-foreground` | `#94a3b8` | 7.0:1 on background, 5.7:1 on muted |
| `--primary` | `#60a5fa` | 7.0:1 on background |
| `--primary-foreground` | `#0f172a` | 7.0:1 on primary |
| `--accent` | `#172554` | — |
| `--accent-foreground` | `#bfdbfe` | 10.3:1 (`--primary` on accent 5.8:1) |
| `--border` | `#334155` | decorative only |
| `--input` | `#64748b` | 3.8:1 on background (≥3:1) |
| `--destructive` | `#f87171` | 6.5:1 on background |
| `--destructive-foreground` | `#0f172a` | 6.5:1 |
| `--portal-destructive-subtle` | `#450a0a` | `--destructive` 5.8:1 on it |
| `--portal-success` | `#4ade80` | 10.2:1 on background |
| `--portal-success-subtle` | `#052e16` | `--portal-success` 8.6:1 on it |
| `--portal-warning` | `#fbbf24` | 10.7:1 on background |
| `--portal-warning-subtle` | `#451a03` | `--portal-warning` 9.0:1 on it |

Shadows and `--portal-overlay` keep their light values. Scalar follows the portal's mode instead
of being forced to light.

## Typography

| Token | Value |
| --- | --- |
| `--portal-font-sans` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--portal-font-mono` | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` |

System fonts by default: no web-font download, nothing to slow the first paint of the quickstart.
A theme may switch `--portal-font-sans` to one of the self-hosted fonts in spec 013 (Inter,
IBM Plex Sans, Source Sans 3, Noto Sans, Atkinson Hyperlegible), followed by the system stack.

| Step | Size / line height | Weight | Used for |
| --- | --- | --- | --- |
| `--portal-text-xs` | 12px / 16px | 500 | Badges only |
| `--portal-text-sm` | 14px / 20px | 400 | Hints, table cells, metadata |
| `--portal-text-base` | 16px / 24px | 400 | Body, inputs (16px stops iOS zoom on focus) |
| `--portal-text-lg` | 18px / 28px | 600 | Card titles, section headings (h2) |
| `--portal-text-2xl` | 24px / 32px | 700 | Page heading (h1) at 375px |
| `--portal-text-3xl` | 30px / 36px | 700 | Page heading (h1) at ≥768px |

API keys, URLs, header names, slugs and paths are always set in `--portal-font-mono`.

## Spacing

4px base. Tailwind's default spacing scale is used as-is (`1` = 4px). Layout tokens:

| Token | Value | Used for |
| --- | --- | --- |
| `--portal-page-max-width` | `1200px` | Content container |
| `--portal-page-gutter` | `16px` below 768px, `32px` from 768px | Left/right page padding |
| `--portal-header-height` | `56px` below 768px, `64px` from 768px | Site header |
| `--portal-form-max-width` | `640px` | Create-app and import forms |
| `--portal-auth-max-width` | `400px` | Sign-up and sign-in cards |
| `--portal-sidebar-width` | `240px` | Admin sidebar at ≥1024px (spec 024); the drawer below 1024px is 280px, max 85vw |

## Radius, shadow, motion

| Token | Value | Used for |
| --- | --- | --- |
| `--radius` | `8px` | Base radius (shadcn derives `sm`/`md`/`lg` from it) |
| `--portal-shadow-card` | `0 1px 2px rgb(15 23 42 / 0.06)` | Cards |
| `--portal-shadow-overlay` | `0 10px 30px rgb(15 23 42 / 0.18)` | Dialogs, menus |
| `--portal-overlay` | `rgb(15 23 42 / 0.5)` | Dialog backdrop |
| `--portal-duration` | `150ms` | Hover, focus and dialog transitions |

Under `prefers-reduced-motion: reduce`, `--portal-duration` is `0ms` and skeletons don't pulse.

## Focus

All interactive elements: `outline: 2px solid var(--ring); outline-offset: 2px` on
`:focus-visible`. Never remove the outline without this replacement.

## Mapping to Scalar

`@scalar/api-reference-react` is themed with its own variables. `packages/ui` sets them
from ours (custom theme, `hideDarkModeToggle: true`; since spec 013 the dark state follows the portal's mode) so a
customer theme flows into the reference automatically:

| Scalar variable | Portal token |
| --- | --- |
| `--scalar-font` | `--portal-font-sans` |
| `--scalar-font-code` | `--portal-font-mono` |
| `--scalar-background-1` | `--background` |
| `--scalar-background-2` | `--muted` |
| `--scalar-background-3` | `--secondary` |
| `--scalar-color-1` | `--foreground` |
| `--scalar-color-2` | `--muted-foreground` |
| `--scalar-color-3` | `--muted-foreground` |
| `--scalar-color-accent` | `--primary` |
| `--scalar-background-accent` | `--accent` |
| `--scalar-border-color` | `--border` |
| `--scalar-color-red` | `--destructive` |
| `--scalar-color-green` | `--portal-success` |
| `--scalar-color-orange` | `--portal-warning` |
| `--scalar-radius` | `--radius` |
