# User testing — 027 Trace inside Try it

- Date: 2026-11-22
- Commit walked: `e949d59` (the stack QA left up; portal images were already running)
- Portal: http://localhost:3009
- Desktop viewport: 1249×822 for the main trace, then 1280×800 for the keyboard pass
- Mobile viewport: 390×844, mobile, no device scale
- Accounts: test developer X (`uat-trace-x-027@example.com`), test developer Y (`uat-trace-y-027@example.com`), seeded admin. No keys are recorded here.

Try it is Scalar's **Send** / **Test Request**. The trace card is under the response.

| Story | Result | What was on the screen |
| --- | --- | --- |
| 1. Own trace under the response | Pass | Developer X, POST `/post` with a query, a custom header, and a body. Response 200. Panel: "Trace ready: POST /sample/post, 200, 25.772544 milliseconds. Slowest: Upstream try, 12.194816 milliseconds." Path has no query. Status 200 OK, 25.8 ms total. Trace ID `c9ff4555…995c9ae` matches the `traceparent` sent to Kong (`c9ff45553934fccbdb6f21f15995c9ae`). Rows: Request, Router, Plugin plugin (no plugin names), Upstream marked slowest. "Your call only." |
| 2. Two people, each sees only their call | Pass | Y's GET showed "Trace ready: GET /sample/get, 200, 41.73952 milliseconds" and trace id `3d111ae45b13caf4ae3c78c8e1e8849a`. The panel did not show X's id or `/sample/post`. Plugin rows say plugin. One browser cannot hold two sessions, so the two Sends were one after another, not the same second. |
| 3. Nobody else can fetch the trace | Pass | Signed in as Y, GET of X's trace id returned 404 problem+json, title "not found", detail "The requested resource was not found." No spans. Y's own id returned 200. `GET /api/v1/admin/tracing` returned 403 "forbidden". `GET /api/v1/admin/tracing/latest?api=sample` returned 403 "Administrator access is required." After "You're signed out.", X's id returned 401 problem+json, detail "Sign in to continue." |
| 4. Secrets stay out of the trace | Pass | The call used `token=abc123`, header `X-Uat-Note`, and a JSON body. Those values were in the Try it response body. They were absent from the trace panel and from the owner's `GET /api/v1/try-it/traces/{id}` JSON. Span names were only request, router, plugin, and upstream. No client address and no upstream address. |
| 5. Admin sees plugin names; 026 page shows the call | Pass | Admin Send of GET `/get` with a developer key. Panel: "Trace ready: GET /sample/get, 200, 32.228352 milliseconds." Plugin rows include "Plugin key-auth". Link "Open tracing page" goes to `/admin/tracing`. That page's "Latest traced call", filtered to Sample HTTP API, showed the same trace id `4b9ad3bc4f33c7f16b3570d1834d1214`, GET `/sample/get`, 200 OK. |
| 6. The next call replaces the first | Pass | X's second Send: "Trace ready: GET /sample/get, 200, 13.808384 milliseconds." Trace id `77ca55d1…5812cb0`. The first id then returned 404 "not found". "Your call only" stayed on the panel. |
| 7. Tracing off | Pass | After "Stop tracing sample", the next Send showed the panel at once: "Tracing is off for this API" and "Calls to this API aren't in a tracing selection." Admin link "Open tracing settings" goes to `/admin/tracing`. No "Waiting" and no spinner. Developer X: "Your call worked as usual. Calls to this API aren't traced for your account." No settings link and no `tracing_instrumentations`. The response was 200. |
| 8. Tracing on, no spans | Pass | With the trace endpoint pointed at an unreachable address and sampling "1 (every call)", the panel showed "Waiting for the trace from Kong… 2 s", then at about 32 seconds "No trace arrived for this call" and "Check again". It did not show another person's trace. Developer copy: "Your call worked, but Kong didn't send its trace within 30 seconds." It names no Kong setting. Admin copy: "Kong didn't send spans within 30 seconds. Check that tracing_instrumentations is set on the Kong node, then run Test in the tracing settings." The link "Open tracing page" goes to `/admin/tracing` and does not open the settings dialog. |
| 9. Kong does not answer | Pass | With tracing on for Sample HTTP API, Kong stopped, Send returned 503 "gateway unavailable", detail "The API gateway didn't respond. Try again in a moment." The panel said at once "The call didn't reach the gateway" and "Kong didn't answer, so there's no trace for this call. Try again in a moment." No waterfall and no 30 second wait. |
| Mobile | Pass | 390×844. Admin GET became "Trace ready" with middle-truncated id `f3ab0a35…ce228b5`, "10.3 ms total", and the waterfall stacked under the summary. Shot: `success-mobile.png`. |
| Keyboard | Pass | Tab moved through the API client and the trace card, including "Your call only", "Copy trace ID", and "Open tracing page". Tab landed on "Send get request to http://localhost:18009/sample/get". Enter sent a new call: "Trace ready: GET /sample/get, 200, 58.939136 milliseconds", id `2252994f…d198ce3`. Escape left the client open. |

## Open bug retest

Sampling rate shown as "0.01 (about 1% of calls)", Applied to Kong, endpoint restored to `http://server:4000/api/v1/internal/traces/kong`. Five keyed GET Sends each showed "Trace ready" by the time the panel was read, about 4 seconds after Send. Durations differed (57.8 ms, 14.6 ms, 12.8 ms, 20.2 ms, 25.1 ms), so they were five calls. The old result, 0 of 5 spans within 4 seconds, did not recur. The bug line is ticked. Setting the rate to "0 (no calls)" earlier in the same session still produced a ready waterfall on the next Send, which matches Try it forcing the sampled flag when Kong honors it.

## Minor

When tracing is off and Kong is stopped, a developer Send still returns 503 "The API gateway didn't respond", but the panel stays on "Tracing is off for this API" and "Your call worked as usual." It does not say the call did not reach the gateway. The same outage with tracing on does say that, at once. An admin in the off+down state also stays on the off copy ("Calls to this API aren't in a tracing selection.") and does not claim the call worked. This does not block the main journey. No Fix task.

## Console

`orca console --limit 50` after the keyboard Send returned 50 info lines and no error. One line: `addDocument: 31 ms`.

## Shots

`success-desktop.png` is the developer POST waterfall (no key on screen). `success-mobile.png` is the mobile trace card. No failure shot. The folder has those two images and this report.
