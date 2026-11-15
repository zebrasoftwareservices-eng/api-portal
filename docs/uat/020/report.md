# Spec 020 user acceptance report

Date: 2026-11-15. Source HEAD: `aa059f97f57022c1494064c99e43796c926f57d4`; QA-tested application commit: `9e5913f2c28634e49a78fbe77776def97cd7406a`.
Portal: http://localhost:3006. Reused healthy Compose project `portal-020-api-search-b455` without restarting it.
Browser: Orca built-in browser; desktop 1440 × 900 and mobile 390 × 844, scale 1.

The journeys passed with one minor visual finding. UAT coverage is incomplete for AC 3 and the unpublish clause of AC 5; these are coverage gaps, not observed product failures. No blocker or major was observed; spec status is review, with the gaps explicitly handed back to the coordinator.

| User story / criterion | Result | What I saw |
| --- | --- | --- |
| Find endpoint by path (AC 1) | Pass | Header search for `orders/{id}` showed `GET /orders/{id} Orders QA`; opening the result reached `Version 2.0.0, latest` and the `/orders/{id}` reference. |
| Find API by title (AC 2) | Pass | Published a test version through Add a version; `ORDERS API` returned `API Orders API Version 3.0.0` with the reference-page link. |
| Find endpoint by summary (AC 2) | Pass | `CANCEL ORDER` returned `DELETE /orders/{id} Cancel an order · Orders API`, confirming case-insensitive matching and separate-word matching of “Cancel an order.” |
| Exclude unpublished API (AC 3) | Not verified | The retained Search product showed `1 APIs` but an empty API list. Its fixture identifier search returned no results as a developer; that alone does not prove a search of its actual API title/path. The UI did not expose a usable unpublished API title/path or an unpublish action, so this row is not claimed as passed. QA's automated AC 3 result remains the available evidence. |
| Match catalog visibility (AC 4) | Pass for Hidden | Changed the existing `access-0b7c258f…` product from Manual to Hidden through Save access. Its catalog card and `API access-0b7c258f… Version 1.0.0` result appeared signed in (also verified as a newly registered ordinary developer); anonymous search showed `Nothing matched “access-0b7c258f”`, and the anonymous catalog omitted its product card. Other visibility combinations remain QA coverage. |
| Remove stale operations on new version (AC 5) | Pass | Version 3.0.0 included `GET /orders List UAT orders · Orders API`; publishing 4.0.0 without that operation changed the `GET /orders` result count from four to three, immediately removing that exact API/operation row. Other APIs' matching rows remained. |
| Remove unpublished API (AC 5) | Not verified | No unpublish control was available in the API/version UI. This clause needs a prepared unpublished fixture or a supported fixture-change procedure; QA's automated result is not represented as a manual pass. |
| Recover from no match (AC 6) | Pass | `uat-no-match-020` showed `Nothing matched “uat-no-match-020”` and `Browse all APIs`; activating the link returned to the catalog. |
| Validate query (AC 7) | Pass | Same-origin browser calls to `/api/v1/search` returned 400 `application/problem+json` with `Enter a search term.` for empty and `Search terms can be at most 100 characters.` for 101 characters; `{}/*%` returned 200 with empty items. The search page showed the overlength field error, the empty starting hint, and a normal special-character empty state. |
| Mobile main journey | Pass with minor | At 390 × 844: catalog Search icon → Search form → `cancel order` → DELETE result → latest reference. “Cancel an order” heading arrived at y=101–129 within the viewport. Result method, path, summary and API remained readable; see local `success-mobile.png`. |
| Keyboard main journey | Pass | With the existing query, Tab reached the input, Enter submitted, Tab reached Search then the operation result, and Enter opened the operation reference. Escape caused no navigation or keyboard trap. Only Tab/Enter/Escape were used for this pass's interaction. |

## Minor finding: search icon overlaps query text

At both desktop and mobile sizes, the magnifying-glass icon in the results-page input overlaps the first characters of the entered query. Reproduce by searching `CANCEL ORDER` and looking at the start of the input on `/search?q=CANCEL%20ORDER`; expected icon and text have separate space, actual icon occupies the same area as the initial letters. Search submission and result navigation still work. Local failure image: `search-input-fail.png` (1440 × 900); no Linear issue or Fix task for this minor.

## Console

`orca console --limit 50 --json` returned no error-level entries after the journeys and again after the validation checks, so there is no console error to quote. An actual returned line was `loadDocument: 11 ms` (info); no error is invented and no console/network dump is saved.

## Scope and cleanup

No open bug existed at intake; the quickstart build blocker was already checked closed. Only the new minor is open; no durable Bug issue was needed. Application code, tests and earlier UAT rounds were not read or changed.

Created synthetic developer `uat-search-020@example.com` and test versions 3.0.0/4.0.0 on QA's `versions-5439f323…` API through the browser UI. Restored its original 2.0.0 latest version and restored the access product to Manual; the synthetic developer and historical test versions remain test data. Two local PNGs in one flat folder, neither staged or committed; no browser logs saved. The Compose stack was stopped at the end.
