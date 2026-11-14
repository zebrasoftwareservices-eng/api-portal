# UAT report — production install

- Date: 2026-11-13
- Commit: `c4333a0`
- Portal: `http://localhost:3005`
- Viewports: desktop 1280×800; mobile 390×844 at device scale 1
- Outcome: conditional pass; no blocker or major product bug found

## Results

| User story / journey | Result | What I saw |
| --- | --- | --- |
| Production Compose on a clean Ubuntu 26.04 LTS VM, HTTPS through Caddy, setup-token claim, and connection to an existing Kong (AC 1) | Not run — environment unavailable | This worktree exposed only Docker Desktop contexts; no clean Ubuntu VM or VM runner was available. The open `[qa]` task remains unticked, and the quickstart stack was not treated as production-install evidence. |
| Versioned private GHCR images with no moving `latest` tag (AC 3) | Not user-visible in this pass | Release publishing is workflow evidence rather than a portal-browser journey and was not repeated during UAT. |
| Upgrade, backup, restore, and rollback preserve operator data (AC 4–6) | Not user-visible in this pass | These destructive/runtime checks require the production install or CI smoke environment and were not repeated against the quickstart evaluation stack. |
| Helm default/external-database installs, readiness behavior, and shared setup token (AC 7–10) | Not user-visible in this pass | These are Kubernetes runtime criteria and were not repeated in the browser journey. |
| Schema-ahead rollback guard (AC 11) | Not user-visible in this pass | Startup/log behavior is not exposed in the portal UI and was not repeated during UAT. |
| Portal continuity through the changed container/proxy path | Pass | As a first-time developer I opened “Sample HTTP API,” created account `uat016-20261113@example.test`, created “UAT 016 App,” received a one-time key, and the authenticated GET returned “200 OK.” The same app → reference → authenticated GET journey returned “200 OK” at 390×844. |
| Keyboard-only main journey | Pass | Using Tab and Enter only, focus reached “My apps,” “UAT 016 App,” and “Open Sample HTTP API reference”; Enter opened each destination and the reference rendered “Inspect a GET request.” |

## Browser evidence

- Desktop success: `success-desktop.png` (local, not committed)
- Mobile success: `success-mobile.png` (local, not committed)
- Console: no error-level entries appeared in the last 50 entries, so there was no console error line to quote. The final console line was the informational entry `"addDocument: 34 ms"`.
- No failure screenshots or browser/network/console dumps were saved.

## Open acceptance gap

AC 1 still needs the clean Ubuntu 26.04 LTS production-Compose walkthrough described by the open `[qa]` task. This is an environment gap, not a reproduced blocker or major product bug, so no bug was added and the spec advances to review under the user-tester status rule.
