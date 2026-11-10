# Teams and roles — user acceptance report

Date: 2026-11-10 · Commit: `6168c836057353cfe07922cec70713fccf34dc01` · Feature: JSO-236
Portal: http://localhost:3013 · Reused QA's healthy Compose stack without rebuilding.
Browser: Orca built-in browser. Desktop rendered viewport 806 × 812 (the pane constrained the requested 1440 × 1000); mobile 390 × 844, scale 1.

| Story / criterion | Result | What I saw |
| --- | --- | --- |
| Personal team on signup — AC 1 | Pass (UI) | A fresh UAT Admin account landed on “My apps”, “Team: Personal”; its switcher listed “Personal Admin”. No extra setup was needed. Upgrade/backfill and pre-upgrade key preservation are covered by QA's Test report, not repeated in UAT. |
| Create/switch teams and isolate apps — AC 2 | Pass | Created “Payments”; “Payments is created. You're its Admin.” The empty list said “No apps in Payments yet”. The create-app form said “This app will belong to Payments.” Created Payments UAT using Sample HTTP API; its page said “Team: Payments · You're an Admin”. Switching to Personal showed “Create your first app”; switching back restored the shared app. |
| Invite, join and use shared app/key — AC 3 | Pass | Mailpit received “Join Payments on localhost:3013” for the synthetic invited address; pending invitations showed Member. The email link preserved its return path through signup and prefilled the invited email. Acceptance said “You joined Payments as Member.” The Member saw Payments UAT, created a new key, and a request through Kong to `/sample/get` returned HTTP 200. No secret is included in this report or screenshots. |
| Read-only app access — AC 4 | Pass (UI) | After the Admin changed the Member to Read-only, the next app load said “You're a Read-only member” and “Ask a team Admin to create or revoke keys.” Sample HTTP API and both active key hints/dates remained visible; Create key and Revoke were absent. Direct endpoint authorization and unchanged gateway credentials remain QA evidence. |
| Non-Admin team management — AC 5 | Pass (UI) | Both Member and Read-only team pages showed “Only team Admins can invite people or change roles.” No invite, cancel, role or remove controls appeared. Direct API refusals remain QA evidence. |
| Invitation refusal states — AC 6 | Pass | Wrong-account view named both invited and current addresses, with “Sign out and use another account”. A used link showed “This invitation has already been used”. A newly cancelled invitation showed “This invitation was cancelled”. An expired email fixture left by QA showed “This invitation has expired” and explained the seven-day limit. None offered Accept. |
| Remove member; preserve key — AC 7 | Pass (UI + live key) | Admin removed UAT Removal: “UAT Removal was removed from Payments.” Signing back in as that user showed only Personal in the switcher; opening the shared app URL showed “App not found” and “We can't find this app.” Their Member-created key still returned HTTP 200 through Kong after removal. API 404 checks remain QA evidence. |
| Delete account; preserve shared assets — AC 8 | Pass (shared-team journey) | Deletion confirmation said “You'll leave Payments. Their apps and keys keep working.” Deleted the synthetic Member account and returned to the public catalogue. Admin still saw Payments with one member and its shared app; the deleted Member's shared key still returned HTTP 200. That user's personal team was empty; personal-app deletion is covered by QA's Test report. |
| Last Admin and refreshed role — AC 9 | Pass | Leave showed “Payments needs another Admin”; self role-change showed “Make another member an Admin before you change your own role”, with role choices disabled. Self-management offers Leave rather than Remove. Admin changed another member to Read-only (“UAT Member is now Read-only”); subsequent app load removed create/revoke controls. |
| Mobile main journey | Pass | At 390 × 844 switched Personal → Payments, saw the shared app card with two active keys, opened it, and read the Read-only explanation. Main content fit the viewport; no horizontal clipping in the captured view. Reapplied mobile viewport after navigation. Local evidence: `success-mobile.png`. |
| Keyboard main journey | Pass | Used Tab and Enter from the shared app heading to its Payments link, then Tab and Enter to open “Leave Payments?”; Escape dismissed the dialog and returned to the page. No pointer action was used during this pass. |

Console: checked after the main journey and again after removed-user refusal; Orca returned `"entries": []` both times. There was no console error line to quote; no error was invented and no browser/console/network dump was saved.

No blocker, major or minor product finding was observed. There were no open bugs at intake, so no bug checkbox or Linear bug issue needed updating. The two local success PNGs are the only images in this flat folder and are not committed; desktop evidence is `success-desktop.png`.

Scope: this report distinguishes browser observations and the live key checks above from QA's automated migration, endpoint authorization and database/gateway invariance evidence. UAT does not rerun those automated tests. Test accounts used only synthetic example.com addresses.

Outcome: ready for tech-lead review; no approval or release gate passed. Compose stack stopped at the end of UAT.
