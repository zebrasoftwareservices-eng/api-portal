# Spec 023 user acceptance report

Date: 2026-11-15 (America/Los_Angeles). Commit: `a70fc7e36ed6d1e903f8be0193cdaf980c385251`.
Portal: http://localhost:3007. Reused QA's healthy isolated stack without restarting it.
Browser: Orca built-in browser. Desktop visual check: 1280 × 900; mobile: 390 × 844, mobile mode with scale 1, reapplied after navigation. Navigation resets viewport emulation, so the desktop success capture was explicitly reset to 1280 × 900 after navigation.

Used a fresh disposable developer and the coordinator-authorized QA test admin. No application code, automated tests, old screenshots, or earlier UAT rounds were read. The supplied spec Test report was used for URL and API-only coverage.

| User story / criterion | Result | What I saw |
| --- | --- | --- |
| Discover products first — AC1 | Pass | “Products” precedes “Or create an app for APIs that aren't in a product”; Payments has “Subscribe”, with no product checkbox or plan picker. Subscribe opens its product page and “Plans” table. |
| Product APIs stay governed — AC2 | Pass | Payments lists “Includes: create-b3f6a838-6e30-4c8d-9ebb-202ad1647371”; that API is absent from the loose-API checkboxes. Other listed product APIs likewise appear under products rather than as checkbox choices. |
| Explicit API choice — AC3 | Pass | Seeded “Sample HTTP API … http://localhost:18007/sample” starts unchecked, as do all other loose APIs in QA's populated catalog. Explicitly checking it permits creation. |
| Empty selection — AC4 | Pass | With app name entered and no API selected, submit stays on the form and shows “Choose at least one API, or subscribe to a product above.” No app or key dialog appears. |
| Loose API key — AC5 | Pass | “UAT 023 desktop” gets “Your API key” and “Copy this key now. We won't show it again.” After dismissal only a masked suffix remains, with one active key and “This app was made for APIs that are in no product.” GET /sample/get through Kong with that key returned HTTP 200 and upstream method GET, URL http://httpbin:8080/get. |
| Direct endpoint refusals — AC6 | QA evidence; outside browser UAT | This is an API-only criterion. The current spec Test report records 409/400 problem+json and unchanged app/Kong/key snapshots; I did not repeat backend calls or inspect code. |
| No-plan developer and admin guidance — AC7 | Pass | Developer sees “Not available yet” and “This product has no plans yet. Check back later.” without Subscribe. The QA test admin sees “Needs a plan”; “Add a plan” opens the matching /admin/products/coming-soon-… screen with “No plans yet” and “Add plan”. |
| Visibility — AC8 | Pass | The fresh developer's form omits Internal and unassigned Manual products and their APIs from checkbox choices. Hidden products are visible when signed in; after sign-out the catalog omits Hidden, Internal and Manual products, and their APIs are not loose catalog entries. |
| Product subscription beside loose apps — AC9 | Pass | Payments → “Subscribe to Free” → “Subscribe and get key” creates “UAT 023 Payments”; its detail shows “Free” and 10,000 monthly calls. My apps lists it with “Free · Payments …” and one active key beside “UAT 023 desktop” with Unlimited and one active key. |
| Mobile main journey | Pass | At 390 × 844, explicitly selected the seeded sample and created “UAT 023 mobile”; the one-time key dialog appeared. My apps shows its Sample HTTP API, Unlimited and one active key; the success screenshot has readable cards and reachable controls. |
| Keyboard main journey | Pass | Tab/Enter reached My apps → Create app → Payments Subscribe → Free plan → subscription submit → key dialog, then Tab/Enter dismissed it. Blank subscription name correctly shows “Enter a name for this subscription.” Required name was populated as test-data setup; navigation/activation used Tab/Enter only. Escape closes the navigation menu and restores its trigger; Enter reopens it. |

Console check: `orca console --limit 50 --json` after the main journeys and again after admin/visibility checks returned `"entries": []` and `"truncated": false`. There is no console error line to quote; none was observed. No browser or network logs were saved.

Open findings: none. There were no open bugs at intake; the existing QA selector finding was already checked off and was not reopened. No new Linear bug was needed.

Evidence files are in this flat folder: `success-desktop.png` (products-first main screen) and `success-mobile.png` (created app in My apps). Both are local, ignored PNGs; neither contains a password or full API key. There are two images, no round/retest directory, and no failure images.

Result: user-visible acceptance passes; spec moves to **review**, not approval. Stack shutdown is recorded in the stage log. Documentation-only changes require no package typecheck or test run.
