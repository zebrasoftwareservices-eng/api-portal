# Spec 019 — user testing notes

2026-11-07, user-tester (JSO-359). Local quickstart (`docker compose -f deploy/docker-compose.yml up -d --build --wait`):
all services healthy in 111 s. Orca built-in browser at 1280 px, about 805 px (the pane's own width), 390 px and
375 px mobile. Test accounts only (`uat-019-*@example.com`) and the seeded admin.

The database volume kept the APIs from earlier QA runs, so the catalog lists 27 APIs, five of them titled "Sample
HTTP API". I used the seeded `/apis/sample` throughout.

## Journeys

| # | Journey | Result | Evidence |
| - | ------- | ------ | -------- |
| 1 | Visitor at `/`: nav APIs, Sign in, Sign up; APIs is current; no "Dashboard" | Pass | 01 |
| 2 | Visitor on Sample HTTP API: **Get an API key**, signed-out 403 sentence | Pass | 02 |
| 3 | Get an API key → sign-up (`next` kept) → create app with Sample checked, focus in App name | Pass | 03, 04 |
| 4 | Create app → key shown once → app page; **Try this API** → `/apis/sample` | Pass | 06 (05 was removed because it showed the key) |
| 5 | API page with one app: **Open in UAT Weather App** → app page; one-app 403 sentence | Pass | 07 |
| 6 | Paste key into Authentication Value → Send → **200 OK** through Kong | Pass | 08 |
| 7 | My apps: heading and title "My apps", breadcrumbs start with My apps, columns Name/APIs/Active keys/Created | Pass | 09, 18 |
| 8 | Several apps: **View your apps** → `/dashboard?api=sample`; both apps labelled "● Has access to Sample HTTP API", third not; no filter; plain `/dashboard` and an unknown `?api=` show no label and no error | Pass | 10, 11 |
| 9 | 390 px My apps: cards with name, APIs, keys, created, **Open app**; scroll width = viewport | Pass | 13 |
| 10 | 390 px menu by keyboard: focus starts on **Close menu**, Tab cycles inside, Escape and Close return focus to **Open menu**; selecting My apps loads with the menu closed | Pass | 14, 15 |
| 11 | 375 px API page with an 80-character app name: action wraps, no sideways scroll | Pass | 16 |
| 12 | App whose only key is revoked: API page still shows **Open in …**, no "Get an API key" | Pass | 17 |
| 13 | App with 10 APIs: every row has **Try this API** linking to its API | Pass | 18 |
| 14 | Signed in, no access: **Get an API key** → create app with that API checked, focus in App name | Pass | 19 |
| 15 | `/api/v1/apps` blocked (network abort): title, base URL and reference render; "Access status couldn't be confirmed" with **Try again**; no action; check-failed 403 sentence; a failed retry keeps the message and focus | Pass | 20 |
| 16 | Block removed → **Try again**: **View your apps** replaces the message and takes focus; value typed in Authentication Value kept; no reload | Pass | 21 |
| 17 | Existing account: Get an API key → sign-up → **Sign in** → wrong password ("Email or password is incorrect.") → correct password → back on `/apis/sample` with **View your apps** | Pass | 22, 23 |
| 18 | Sign-up with an existing email: "An account with this email already exists." + **Sign in instead** (`next=/apis/sample`); **Create an account** → new account → create app with Sample checked | Pass | 24, 25 |
| 19 | Create app with an empty name: "Give your app a name." | Pass | 12 |
| 20 | Refresh on create app keeps the selection and focus; Back from create app goes to My apps | Pass | — |
| 21 | Admin at 1280 px: APIs, My apps, Admin; current link correct on `/`, `/apis/sample`, `/dashboard`, `/admin/apis` | Pass | 26 |

Health: no console errors or warnings. The only failed request was the deliberate duplicate sign-up (422).

## Not walked in the browser

- AC5 5-second delay, and 500/503 or 10-second timeout failures: Orca's browser route can only abort a request,
  which is the network-error case (walked above). QA covers delay, status codes and timeout in `journey AC5,6,7`.
- AC5 401 mid-session: QA browser test `AC5,6,7: access 401`.
- AC10 static demo: no demo build or preview URL was in scope for this run. QA covers it with `deploy/e2e-demo`.
- 640 px (200% zoom) width: QA `journey AC4,7,8`. I checked 805 px, 390 px and 375 px by hand.

## Observations

- Catalog cards: a long base URL runs straight into **View reference →** with no space (01, 14). This comes from
  spec 001 and is outside 019. It's already tracked as **JSO-162** (Backlog). I created JSO-409 before I saw it,
  then cancelled it as a duplicate.
- The leftover QA APIs make the create-app list long. The preselected API can sit far below the fold, though
  focus in App name and the checked box are both correct. That's test data, not product behaviour
  (repeat-run isolation is JSO-408).
- Screenshots taken with a mobile viewport sometimes repeat the top of the page in the lower half (13, 14, 16).
  That's an artefact of the capture tool; the page itself rendered once.
