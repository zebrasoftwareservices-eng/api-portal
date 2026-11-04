# UAT round 3 notes: spec 001 (JSO-126, 2026-11-04)

Text evidence that screenshots can't show. All accounts, keys and data came from a throwaway
stack (`portal-uat-r3`) whose volume has been removed, so the keys in screenshots no longer exist.

## Quickstart
`docker compose -p portal-uat-r3 -f deploy/docker-compose.yml up -d --wait` on a fresh database
volume with images already built: healthy in 20 s, home page 200, one seeded API (`sample`).

## Network (JSO-171)
Requests on each load of `/apis/sample`, with no interaction and no sign-in:

    https://proxy.scalar.com/?scalar_url=https%3A%2F%2Fapi.scalar.com%2Fvector%2Fregistry%2Fcurated
    https://proxy.scalar.com/?scalar_url=https%3A%2F%2Fapi.scalar.com%2Fvector%2Fregistry%2Fsearch%3Fquery%3D

Try-it requests stayed on `http://localhost:3000/api/v1/try-it?scalar_url=…`.

## Operation-level security
Text of the top section on `/apis/uat-orders-api`: "Authentication / Select / Auth Type / No
authentication selected". The served document has `security: null` at the top level and
`[{key: []}]` on `GET /get`. The Test Request client still shows the field and sends the request.

## Keyboard focus order
Catalog: Skip to content → Developer Portal → APIs → Sign in → Sign up → first API card.
Reference: … → Get an API key. Sign-up: Name → Email → Password → Show → Create account.
Key dialog (trapped): Copy → Copy header line → I've saved it → Copy.
After I've saved it, focus is on the key's row (`…5XJo`). Tab moves forward; the Open reference
button is behind it. Coming from the top of the page after a reload, Tab reaches it normally.

## Titles
`/` → `APIs`. `/admin/apis` as a developer → `Developer Portal`. Unknown app →
`Your app · Developer Portal`. All other pages checked match the design.

## Logs
Server and portal logs for the whole run (3,848 lines): 0 matches for a full `pk_` key, 0 for any
test password. Two `[Better Auth]: Invalid password` lines from the intended wrong-password tests.

## Measurement notes
- An early touch check using Resource Timing looked as if repeated Send taps did nothing. The
  network log showed they do fire (count 6 → 7). Not a bug.
- One 401 after typing a key into the client and resending, in the run right after a page reload
  and keyboard navigation. It didn't recur in five retries, including the same API, keyboard
  send and the Flow A link. Not filed; worth watching.
- The mobile screenshots repeat below about 540 px. This is a capture artifact: the DOM measured
  390 px wide with no overflow on every page.
