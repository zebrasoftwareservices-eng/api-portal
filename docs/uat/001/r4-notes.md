# UAT round 4 notes: spec 001 (JSO-126), 2026-11-04

Stack: Compose project `portal-jso186`, images built from `b6cf61a`, existing database with QA data.
Browser: Orca built-in browser at 865×812, 1280×800 and 390×844 (mobile emulation, touch on).

## Loop-5 focus

### Third-party requests (JSO-171, JSO-186)
Browser network capture ran before the first reference load and through every journey below.

- Final log: **736 requests, all to `localhost:3000`, not truncated.**
- It covers the reference at all three widths, an imported API's reference, try-it 401 and 200,
  sign-up, sign-in, create app, revoke, admin import, document failure and server outage recovery.
- Try-it goes to `/api/v1/try-it?scalar_url=…` on the portal origin (401 without a key, 200 with one).
- Opening Scalar's Share and Deploy menus sent no third-party requests. I did not click **Upload
  Document**, which offers to upload the document so it can be shared (JSO-172).
- No font stylesheet links to a third party; `document.fonts.size` is 0 on the reference.

Limit: this is what the browser requested, on `localhost` only. A real hostname wasn't tested.

### Ask AI box (JSO-164, JSO-186)
No "Ask AI" or agent text in the reference or try-it client at 865, 1280 and 390 px.

### Reference document failure and retry
| Scenario | Result | Evidence |
| --- | --- | --- |
| Document request aborted in the browser (no connection) | "The API reference didn't load." with **Try again**, plus the toast "Can't reach the portal server…". Header strip still works. | `r4-09` |
| **Try again** while still failing | Alert stays, new toast | `r4-10` |
| **Try again** after the document is reachable | Reference renders on the same page; alert gone | `r4-11` |
| Same at 390 px | Same | `r4-33`, `r4-34` |
| Same by keyboard: Tab 9 times, Enter | Same. Focus falls to `<body>`, but the next Tab goes to the reference's "Open Menu", so nobody is lost. | `r4-41` |
| **Server really stopped**, page reloaded, server restarted, **Try again** | **Doesn't recover: JSO-189.** Full-page "Something went wrong"; button sends no request. Reload or **Go to APIs** recover. | `r4-12`, `r4-13`, `r4-14`, `r4-15` |

The document failure was injected with a browser network route (abort). QA covers the 503 variant.
The old toast stays for up to about 3 s after recovery, then clears; I didn't file that.

## User stories

| Story / AC | Evidence | Notes |
| --- | --- | --- |
| AC 1 | `r4-01` | Reused the running stack. Not re-timed this round. QA: 226.6 s with cached base layers. |
| AC 2 | `r4-01`, `r4-43` | Sample reference loads. The catalog holds QA data on this stack. |
| AC 3 | `r4-26`, `r4-27`, `r4-28` | Uploaded `uat-r4-orders.yaml`, linked `portal-sample`; published at `/apis/uat-r4-orders-api`. Catalog 7 → 8. |
| AC 4 | `r4-25` | No `info`: "Invalid OpenAPI document: must have required property 'info' at /" and "Nothing was published." Catalog stayed at 7. |
| AC 5 | `r4-04`, `r4-05`, `r4-23`, `r4-24`, `r4-35-mobile-sign-up` | Empty form errors; sign-up keeps `next`; wrong password message; sign-in. |
| AC 6 | `r4-06`, `r4-07`, `r4-17`, `r4-36` | Clipboard held the exact key. Escape doesn't close. Key gone after dismissal and after reload. One Kong consumer per app (max 1 across 15 apps). |
| AC 7 | `r4-03`, `r4-08`, `r4-32`, `r4-46`, `r4-48`, `r4-53` | 401 without a key; 200 with one. |
| AC 8 | `r4-20`, `r4-21` | Kong stopped: "Gateway unavailable… Nothing was created", countdown, form kept, app list unchanged. Kong back: **Try again** created the app and showed a key. |
| AC 9 | `r4-19`, `r4-39`, `r4-40` | Kong direct: 200 before revoke, 401 after. Desktop and mobile. |
| Non-admin on `/admin/apis` | `r4-22` | "Page not found". |

Mobile (390×844): no horizontal scroll on the pages measured (catalog, reference, key dialog).
Sign-up, create app, key dialog, try-it 401, try-it 200 and revoke all pass. This closes the gap from
round 3, where the try-it 200 wasn't repeated at this size.

Keyboard: sign in, open app, create key, reach **I've saved it** (Tab scrolls it into view), revoke
dialog, and the reference to try-it with Tab and Enter only: 37 Tabs to the first Test Request, 3
more to Send, Escape closes the client. JSO-161 still reproduces (focus goes to `<body>` after
Escape on the revoke dialog).

Health: the only console errors are React #441 from the outage error page (JSO-189). Failed requests
were all intended: 401s, 422, 404 and 503s. Scanned `server` and `portal` logs for full `pk_` keys and
the test passwords, and `server` for the admin password: 0 matches.

## New bugs (all minor)
- JSO-189 **Try again** on the error page never recovers after the server comes back.
- JSO-190 Dashboard shows a bare unstyled text page during a server outage.
- JSO-191 Signed-in developer sees Sign in and Sign up during a server outage.
- JSO-192 **I've saved it** is hidden below the fold in the key dialog at 1280×800.

Added detail to existing bugs: JSO-172 (Share offers **Upload Document**), JSO-183 (error page has an
empty title).

## Evidence caveats
- `r4-38-tryit-200-desktop-width-…` is at desktop width because the in-app link reset the emulated
  viewport. `r4-48-mobile-tryit-200.png` is the real 390 px run (`innerWidth` 390).
- Some 390 px screenshots show the page repeated from about y=540. This is a capture artifact: the DOM
  has one portal header and the element at that point is ordinary page content. Not filed.
- Sign-out was used through the account menu once. Other sign-outs and the final key revocation
  went through same-origin API calls to save time.

## Not tested this round
Quickstart timing or a cold image build, import by URL, try-it on the imported API, a real phone, a
real hostname, and JSO-166 (local and UTC dates matched). The other open minor bugs weren't re-checked
one by one; JSO-161, JSO-163 and JSO-172 were seen still present.

## Test data
Accounts `uat-r4-dev@example.com` and `uat-r4-mobile@example.com`; API `uat-r4-orders-api`; apps
`uat-r4-weather-app`, `uat-r4-outage-app` and `uat-r4-mobile-app`. All keys, including those visible
in screenshots, are revoked; three were re-checked against Kong and return 401.
