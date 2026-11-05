# Version badge re-test (JSO-221)

Tested 2026-11-05 at `24005c0` in Orca's built-in browser.

**This round was limited to the version badge**, by agreement between Elango and the coordinator.
It is not a full UAT. `git diff 521abd0..HEAD` confirms that the only application change since the
last full round is one CSS line, `width: fit-content` on `.badge` in `packages/ui/src/styles.css`.

## Builds
- **Demo:** local production build with `PORTAL_DEMO_MODE=on` and no `SERVER_URL`, on port 3200.
  The build was a Turbo cache hit. The page showed the demo notice, so it was the demo build.
- **Quickstart:** `docker compose -f deploy/docker-compose.yml up -d --wait --build`, on port 3000.
  It took 197s, with some layers cached, so this is not a cold-start measurement.

## Results
Widths are CSS pixels, read in the browser. Each badge's width is exactly its text plus padding and
border (no slack), and the page has no sideways scroll at either width.

| Page | Width | Demo badge | Quickstart badge | Screenshots |
| --- | --- | --- | --- | --- |
| Catalog card | 1280px | 48.6px | 48.6px | `49`, `53` |
| `/apis/sample` | 1280px | 48.6px | 48.6px | `50`, `54` |
| Catalog card | 375px | 48.6px | 48.6px | `51`, `55` |
| `/apis/sample` | 375px | 48.6px | 48.6px | `52`, `56` |

Scalar's own `v1.0.0` (48.9px) and `OAS 3.1.0` (72px) badges in the reference are compact too.

The last 100 console and network entries after each page showed no errors, warnings or failed
requests.

## Notes
- **Screenshots are cropped.** With a viewport larger than the Orca pane, the capture tiles the page.
  Both `screenshot` and `full-screenshot` did this. The images are cropped to the first tile: 1108px
  wide on desktop and 478px tall at 375px. The layout was still 1280px or 375px wide. The cut-off
  at the crop edge is not a page problem. The screenshots were retaken once after a bad first crop,
  on the same demo build and quickstart images (restarted without `--build`), and the badge
  measurements came out the same. The console and network check is from the first pass.
- **Known issue seen, not re-filed:** on the catalog card, the base URL runs into "View reference →"
  at both widths and on both builds. This is JSO-162 (minor, Backlog).
- **New bugs:** none.

## Not covered
The user stories and acceptance criteria were not re-walked; the last full round was at `521abd0`.
Other `.badge` uses outside these two pages, such as the dashboard and admin, were not checked.
JSO-213 (Vercel preview and signed-out quickstart link) is still open.
