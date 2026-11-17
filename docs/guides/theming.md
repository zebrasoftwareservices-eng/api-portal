# Theming the portal

An admin changes the public portal from **Admin → Theme**. The theme covers the logo, favicon, light and dark colours, font, corner radius, default colour mode, and an optional custom CSS file. Saving publishes it on the next page load. There is no rebuild and no extra service.

The admin area does not load the theme. It keeps the built-in logo, colours, and fonts, so a broken rule cannot lock admins out. Open Theme with a full page load (the Admin link and the Theme nav item are normal links).

## Limits

| Piece | Limit |
| --- | --- |
| Logo | PNG, SVG, or WebP, up to 512 KB |
| Favicon | PNG, SVG, or ICO, up to 128 KB. WebP is not a favicon. |
| Custom CSS | 65,536 characters. `@import` is rejected, including when it sits outside a comment. Load a font with `url()` inside `@font-face`. |
| Corner radius | A whole number from 0 to 24 |
| Import file | 2 MB |

Colours are six-digit hex values. The editor warns when a text and surface pair is below 4.5:1. The warning does not block Save. The server checks the same limits and returns a 400 with a field pointer when a value is rejected. An oversized request returns 413.

## Fonts

The named fonts are self-hosted with the portal: Inter, IBM Plex Sans, Source Sans 3, Noto Sans, and Atkinson Hyperlegible, plus the visitor's system font. Choosing one does not make the browser call a third-party font host. The font files ship in the portal image.

## Export and import

**Export** downloads the saved theme as `portal-theme.json` (`format` is `portal-theme`, `version` is `1`). Unsaved edits are not in that file. **Import** reads a file of that shape and replaces the live theme after you confirm.

Use the same file for another install. `GET /v1/admin/theme/export` returns it, and `POST /v1/admin/theme/import` applies it. A deploy can export from one portal and import into another after the database is up, instead of editing the database by hand. A file that fails validation changes nothing.

Reset removes the saved theme and serves the built-in default. Export first if you want the current theme back.
