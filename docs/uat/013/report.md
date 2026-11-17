# User testing — 013 Theme editor

- Date: 2026-11-17
- Commit: `d005f8f73b77a7f32525be7561b403a4b17893ed`
- Portal: http://localhost:3004
- Viewport: desktop 1280×900, then mobile 390×844 (`--mobile`, device scale 1)
- Signed in as the seeded admin. A later check used a new developer account, `uat-013@example.com`.

## User stories

| User story | Result | What I saw |
| --- | --- | --- |
| Logo and brand colours reach the live portal after save | pass | Light primary `#c2410c` and logo `logo.png` ("1 KB", "Not saved yet"). Status "✓ Theme saved. Visitors see it on their next page load." A reload of My apps showed the orange square logo and a "Create app" button at `rgb(194, 65, 12)` with white text. The public page before that save still had no logo. Shot: `success-desktop.png`. |
| Font, radius, and both colour modes show in the preview, then on the live portal | pass | Before save, the preview used primary `#c2410c` in light (`rgb(194, 65, 12)` on links) and `#f59e0b` in dark (`rgb(245, 158, 11)`), font "Inter Variable", radius 24px. The live public page was still primary `#60a5fa`, radius 8px, and the system font. After save, a dark reload used `#f59e0b`, radius 24px, and Inter. "Always light" then saved, and a reload used background `#ffffff`, primary `#c2410c`, and radius 24px. |
| Custom CSS appears in the preview first, then on public and developer pages | pass | CSS `h1 { outline: 4px solid #15803d; }` (34 / 65,536). The preview heading "APIs" had that green outline. My apps, reloaded before save, had outline none. After "✓ Theme saved. Visitors see it on their next page load." the public heading "APIs" and the dashboard heading "My apps" had the 4px outline. The admin heading "Theme" had outline none. |
| Broken custom CSS leaves the admin area usable | pass | Saved `body { display: none }`. The public dashboard reload was an empty page. A direct load of `/admin/apis` showed "Manage APIs" and "Import an OpenAPI document, link it to a Kong service and publish it." The admin page used primary `#1d4ed8`, the system font, and no header image. Clearing the CSS (0 characters) and saving brought the catalog back. |
| Reset returns the shipped default | pass | The dialog said "Reset the theme to the default?" and "This removes your logo, favicon, colours, font, radius and custom CSS from the live portal right away. Export the theme first if you might want it back." After confirm: "✓ Theme reset to the default.", "Default theme", "Already the default theme", Logo and Favicon "Built-in", light primary `#1d4ed8`, font System default, radius 8, "Follow visitor's system setting". A public reload had no header image, brand text "Developer Portal", primary `#60a5fa`, radius 8px, the system font, and favicon `/icon.svg`. |
| Export includes logo and favicon, and import applies that file | pass | The second download, `portal-theme (1).json`, held the logo and favicon (each a PNG, data length 228), font Inter, radius 24, light primary `#c2410c`, dark primary `#f59e0b`. After the reset above, import of that file said "Import theme-full.json?", "This replaces the live theme right away, including the logo and favicon.", "Exported Nov 17, 2026, 01:10 AM", then "✓ Theme imported and applied." The editor showed Custom theme, logo "logo" 1 KB, favicon "favicon" 1 KB, primary `#c2410c`, Inter, radius 24, Always light. A public reload showed the logo and favicon at `/api/v1/theme/assets/…?v=05494e4ff8ce22ba`, primary `#c2410c`, radius 24px, and "Inter Variable". Import ran on this portal after reset. A second install was not started. |
| Bad logo files and bad JSON name the problem and leave the theme | pass | "⚠ The logo is 2,134 KB; the limit is 512 KB." The saved logo stayed "logo" "1 KB". A text file said "⚠ The logo must be a PNG, SVG or WebP image." `malformed.json` said "malformed.json isn't a valid JSON file. Choose a file exported from a portal's Theme page." A file with primary `not-a-colour` said "The theme wasn't imported.", "Enter a six-digit hex colour, like #1d4ed8.", and "Nothing changed." `POST /api/v1/admin/theme/import` returned 400 `application/problem+json`. Primary stayed `#c2410c`. |
| Low contrast warns before save | pass | Light text `#d6d3d1` showed "⚠ Low contrast: 1.5:1 between Text and Background. Text needs at least 4.5:1." Save theme stayed enabled. Text was put back to `#0f172a` and the warning went away. That pair was not saved. |
| Visitors and developers do not get the theme editor | pass | Signed out, the public home still showed the logo and links at `rgb(194, 65, 12)`. Opening `/admin/theme` landed on heading "Sign in" (`/sign-in?next=%2Fadmin%2Ftheme`). `PUT /api/v1/admin/theme` and `POST /api/v1/admin/theme/import` returned 401 `application/problem+json` with detail "Sign in to continue." After creating `uat-013@example.com`, `/admin/theme` showed heading "Page not found" and "We can't find that page." The document response was 404. The same write and import calls returned 403 `application/problem+json` with detail "Administrator access is required." Public theme stayed `isDefault: false`, font `inter`, mode `light`, logo `/api/v1/theme/assets/logo?v=05494e4ff8ce22ba`. |
| A fresh portal shows the shipped default | pass | Before any edit, the public heading was "APIs", the tagline was "Read the reference, get a key and try a call from your browser.", there was no header image, and the system dark theme used links `rgb(96, 165, 250)`, radius 8px, the system font, and brand text "Developer Portal". `GET /api/v1/theme` was `isDefault: true`. QA timed a fresh compose at 122.62s. This pass reused that stack and did not time it again. Reset, above, returned the same default. |

## Mobile

390×844, `--mobile`, device scale 1. The public catalog showed the orange logo at 40×40 and the heading "APIs". Shot: `success-mobile.png`. Open menu listed APIs, My apps, and Admin. Admin opened "Manage APIs" with no custom logo in the header. Theme in the admin section opened heading "Theme", "Custom theme", "Last saved Nov 17, 2026, 01:10 AM", Edit and Preview tabs, primary `#c2410c`, and "Save theme" (disabled, status "All changes saved"). The admin chrome used primary `#1d4ed8`, the system font, and no header image. After that navigation the page's `innerWidth` read 430 while the viewport command still reported 390×844.

## Keyboard

Desktop 1280×900. Tab only, from the page start: Skip to content, Developer Portal, APIs, My apps, Admin, search, then the admin links through Theme, then Import, Export, and Reset to default. Enter on Reset to default opened "Reset the theme to the default?" with focus on Cancel. Escape closed the dialog. Primary stayed `#c2410c`, corner radius stayed 24, and the status was "All changes saved".

## Console

`orca console --limit 50` on both tabs returned no entries, so there is no console error line to quote.

## Findings

No blocker or major. These notes did not stop the journey.

- At 1280×900 the preview Light and Dark buttons sat under the sticky header (button top 16px, header bottom 65px). A click landed on the account button. The Light and Dark colour tabs still switched the preview, and both palettes were checked that way.
- The logo helper says "Shown in the header at up to 40px tall." The desktop header image was 48px tall. The mobile logo was 40×40.
- On My apps, with radius 24px, the "Create app" button's computed border radius was 22px. Cards used 24px.
- After the rejected colour import, the import dialog stayed open until Cancel. The error text was on the page with the dialog.
- After the rejected text-file logo, "⚠ The logo must be a PNG, SVG or WebP image." stayed on the page. Save theme stayed disabled ("Fix 1 field to save") until the logo was replaced with a valid PNG.
