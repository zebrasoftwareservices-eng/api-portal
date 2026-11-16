# User testing — 022 Server robustness and authored path order

- Date: 2026-11-16
- Commit: `4b1d534f1a4c233bef42ca70d34bc4487a3ac808`
- Retest: only the compensation row. The other rows are the earlier walk.
- Portal: http://localhost:3005
- Viewport: desktop 1280×900, then mobile 390×844
- Signed in as the seeded admin. Created app "UAT sample reader" for the API at slug `sample`.

## User stories

| User story | Result | What I saw |
| --- | --- | --- |
| App and key creation stays usable while Kong is slow | pass | "Create an app" accepted the name "UAT sample reader" with Sample HTTP API at `http://localhost:18005/sample`. The dialog heading was "Your API key" and said "Works with: Sample HTTP API". The app page then showed "● Active" on a key ending in 0jU0. No error was on screen. Whether a database transaction stayed open is not on screen. |
| Reconcile stops reporting drift once a key is consistent | pass | Admin, Gateways showed "Kong", "● Connected", and "3.9.4". Admin, APIs and Gateways did not contain the word drift. A failed revoke was not on screen. |
| Failed compensation is logged with its error and no key value | pass | The server log says `Gateway compensation failed; reconcile will retry`, with err.message `The API gateway is unavailable` and err.cause `fetch failed` (nested cause `getaddrinfo ENOTFOUND kong`), plus appId, credentialId, gatewayId, and gatewayObject. No log line matches `pk_[A-Za-z0-9_-]{8,}`. Admin APIs, Gateways ("● Connected"), and Insights do not show that log. |
| An API at slug `sample` survives a restart | pass | Admin, APIs listed "Sample HTTP API", slug "sample", version "1.0.0", base URL "http://localhost:18005/sample". The catalog card said "A small HTTP API for trying your portal API key." A restart was not part of this walk, so the boot skip line was not on screen. |
| The portal boots and an admin can sign in | pass | Sign-in left the heading "Sign in" and opened "My apps". The app page said "You're an Admin". The setup wizard was not shown. |
| The catalog stays fast to browse | pass | The catalog heading was "APIs", with the line "Read the reference, get a key and try a call from your browser." Opening `/apis/sample` showed "Sample HTTP API" and "Loading API reference…" and then the reference. Which columns the server read is not on screen. |
| The reference keeps the authored path order | pass | Sidebar order under "Sidebar for Sample HTTP API": Introduction, Inspect a GET request (GET), Inspect a POST request (POST), Return an HTTP status (GET), Generate a UUID (GET), Inspect request headers (GET). The page buttons were "Test Request (get /get)", "Test Request (post /post)", "Test Request (get /status/{code})", "Test Request (get /uuid)", and "Test Request (get /headers)". |

## Also walked

Download spec started a file named `sample-1.0.0 (2).json`. The same URL returned `application/json` for "Sample HTTP API" 1.0.0, and the path keys were `/get`, `/post`, `/status/{code}`, `/uuid`, `/headers`.

Try-it: pasted the new app key into Value, opened "Test Request (get /get)", and selected Send. The client showed "Status: 200 OK", "Duration: 81ms", and "Size: 1.21 kB". The body was a GET echo with `"Via": "1.1 kong/3.9.4"` and `"X-Forwarded-Path": "/sample/get"`.

Mobile, 390×844: from the catalog card "Sample HTTP API v1.0.0" and base URL `http://localhost:18005/sample`, opened the reference and the reference menu. The menu listed the same five operations in the same order. Shot: `success-mobile.png`.

Keyboard, Tab, Enter, and Escape only: Tab from "Skip to content" landed on the link `/apis/sample` ("Sample HTTP API v1.0.0"). Enter opened "Sample HTTP API". Further Tabs reached the sidebar in the same order, and Enter on "Inspect request headers" set the address to `#get-2f-68-65-61-64-65-72-73` (`/headers`).

Desktop shot of that sidebar: `success-desktop.png`.

## Console

`orca console --limit 50` on Admin, Insights returned no entries, so there is no console error line to quote.

## Bugs

- The minor "Compensation error log has no `err.cause`" is closed. This retest saw `err.cause` in the server log and no `pk_` value. No blocker or major.
