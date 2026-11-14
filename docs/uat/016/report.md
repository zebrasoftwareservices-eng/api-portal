# UAT report — production install

- Date: 2026-11-14
- Tested commit: `628ad45`
- Production URL: `https://localhost` (Caddy local certificate)
- Browser walk URL: `http://localhost:3100` (the same production portal container, used because Orca's embedded browser rejected the local Caddy CA)
- Viewports: 1280×800 desktop; 390×844 mobile

This retest covers the previously unrun production-install row only. It does not claim the timed clean-Ubuntu 30-minute release-gate walk, which remains with Elango.

| User story / check | Result | Evidence |
| --- | --- | --- |
| Production Compose install through Caddy HTTPS (AC 1, local user-visible portion) | Pass | `https://localhost/` and `https://localhost/healthz` each returned HTTP 200. The production portal showed “APIs,” “How it works,” and “No APIs yet,” confirming that no sample API was seeded. Docker showed the production server and Postgres with no published host ports and the existing Kong as a separate container. The setup-token claim and Kong connection had already been completed on the QA-provided stack, so this retest did not attempt to reclaim it. |
| Mobile pass of the production portal | Pass | At 390×844 the page exposed “Open menu”; the dialog showed “Mobile navigation,” and “Sign in” opened the responsive sign-in form. |
| Keyboard-only pass of the production portal | Pass | Tab and Enter activated “Skip to content,” traversed the primary navigation, and opened the “Sign in” page without pointer input. |

## Console

After the main journey, Orca returned no console entries on either the HTTPS interstitial page or the production portal page: `entries: []`. There was therefore no console error line to quote; no error was invented.

## Findings

No blocker, major, or minor product finding is open. Orca's embedded browser did not trust the local Caddy CA, so browser interactions used the production portal container's loopback-only port while HTTPS reachability was verified separately with certificate verification disabled; this is a local test-harness limitation, not a portal defect.
