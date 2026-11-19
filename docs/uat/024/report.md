# UAT report — Spec 024 admin sidebar shell

- Date: 2026-11-19
- Commit: `48e2cc5`
- Portal: `http://localhost:3004`
- Viewports: desktop 1440 × 900; mobile 390 × 844 (device scale 1)
- Keyboard pass: Tab, Enter, and Escape only

| User story | Result | What I saw |
| --- | --- | --- |
| One admin sidebar and Admin group | Pass | The sidebar showed “APIs”, “Products”, “Apps”, “Requests”, “Insights”, then “Admin”; `/admin` landed on “Gateways”, and the account menu contained only “Profile” and “Sign out”. |
| Separate published APIs and Products pages | Pass | “Published APIs and their reference documentation.” showed “Sample HTTP API”; Products separately showed “UAT Sample Product”. |
| Admin sees every team's apps | Pass | “Every app in every team” listed Personal, Survives deletion, and Payments rows with owner, plan, active key hints, status, and View. |
| Admin app detail is read-only | Pass | “Surviving shared app” showed “● Active”, two last-four key hints, and “Only the team can see or change a key”; no reveal, regenerate, create-key, or cancel control appeared. |
| Admin developer actions are hidden/refused | Pass | Across APIs, Products, Apps, the app detail, and the account menu, no My apps, Teams, Create app, Subscribe, or Request access action appeared. |
| Accounts limits are unambiguous and validated | Pass | The form read “10 attempts in 15 minutes”; 0, -1, and an empty non-number entry produced inline errors, and reload restored 10, 15, and 3. |
| Developer journey remains available | Pass | A new developer saw “My apps”, “Team: Personal”, and “Create app”; `/admin` showed “Page not found”, and subscribing to “UAT Free” created “UAT 024 subscription” with one active key. |
| One consistent chevron behavior | Pass | The Admin disclosure changed from collapsed/right to expanded/down, while the account menu opened with Enter and closed with Escape; the mobile drawer preserved the same Admin disclosure. |

## Responsive and keyboard passes

At 390 × 844, “Open menu” opened a modal “Admin menu”, and the Apps table became labeled cards with Team, App, Owner, Plan, Keys, Status, and a full-width View action. The keyboard-only pass opened and dismissed the account menu, opened Admin, landed on Gateways, and reached Accounts using only Tab, Enter, and Escape.

## Findings

- Minor — At the desktop width, the Apps table gives Plan, Keys, and View columns too little room, so short values wrap character-by-character. The View link still works; see `apps-table-columns-fail.png`. This does not block the journey and does not return the spec to building.
- Minor — Visiting `/admin` as a developer correctly showed “Page not found”, but the navigation emitted: `Uncaught Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.` The rendered refusal remained usable.

The final `orca console --limit 50` check after returning to My apps was empty; the quoted error above was captured directly from the `/admin` navigation result. No blocker or major product bug was found.

## Evidence

- `success-desktop.png` — expanded Admin group and Accounts units/layout
- `success-mobile.png` — stacked Apps cards at 390 × 844
- `apps-table-columns-fail.png` — minor desktop column wrapping
