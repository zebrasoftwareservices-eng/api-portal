# 005 — First-run setup and gateway connections: UX design

- Spec: [005-setup-wizard-and-gateway-connections](../specs/005-setup-wizard-and-gateway-connections.md)
- Contract: `apps/server/openapi.yaml`. This design uses only fields in that contract.
- Tokens: [`tokens.md`](tokens.md). **No new tokens.**
- Shared states, focus rules and form conventions: [001](001-kong-quickstart-slice.md) §2, §7 and §8. Anything not mentioned here follows 001 and [004](004-per-api-access-control.md).
- Owner: ui-designer · 2026-11-07

## 0. Principles for this change
1. **A test is not a save.** A passed Test says "Nothing has been saved yet." The screen never leaves anyone thinking they're connected when they aren't.
2. **Every refusal names the field, says what didn't change and gives the next step.** The words come from a fixed list (§5), so no message can carry a token or a response body.
3. **Say what happens to their Kong before it happens.** The notice is always visible next to **Save connection**, never behind a disclosure.
4. **No dead controls.** An environment-managed gateway shows no Edit, Disable or Remove buttons. It shows one sentence on why and how to change it. A connected portal shows no Add button.
5. **Quickstart first.** On the default install the engineer presses **Test connection** and **Save connection** without typing a URL.

**Three decisions a reader might otherwise question:**
- **The wizard has no "Step 1 of 2".** `SetupStatus` doesn't say whether a gateway exists, so `/setup` can't know whether a second step follows (AC 8, Kong variables only). A count would sometimes be false. The headings carry the sequence.
- **The first-admin form asks only for email and password.** `name` is optional in the contract and defaults to Administrator, and AC 2 asks for no more.
- **Save is never disabled until Test passes.** AC 4 says skipping Test is allowed, because the server runs the same checks. GitOps-minded engineers will skip it.

---

## 1. User flows

### Flow A — Fresh install to a working key (AC 1, 2, 3, 6)
1. The engineer runs `docker compose -f deploy/docker-compose.yml up` and opens `http://localhost:3000/`.
2. Middleware redirects every page to `/setup`.
3. They enter an email and password and select **Create admin account**. They're signed in.
4. `/setup/gateway` opens with the bundled Kong's values already filled in.
5. They select **Test connection**. A success alert shows the Kong version and says nothing has been saved.
6. They read **What saving changes in this Kong** and select **Save connection**.
7. The form is replaced by **Kong is connected** and the sample choice.
8. They select **Publish the sample API**, and then **View Sample HTTP API**. Or they select **Continue without it** and go to `/admin/apis`, with an empty catalog.
9. **Success:** a developer signs up, creates an app and gets a key that returns 200 (001 Flow A).

Branches:
- **3a, production:** the form also asks for a setup token (§3.1).
- **3b, someone else got there first:** the form is replaced by "This portal already has an admin", with a link to sign in.
- **4a, skip:** they select **Skip for now** and go to `/admin/apis`, which points to Admin → Gateways. Until a gateway exists, signing in with no `next` target lands on `/setup/gateway` again, and the skip link is there again.
- **5a, Test fails:** Flow C.
- **7a, any other Kong:** no sample choice is offered. They see **Import an API** instead.

### Flow B — Connect their own Kong (AC 3)
1. On `/setup/gateway` or `/admin/gateways`, they enter the Admin API URL, optional token and both proxy URLs.
2. **Test connection** → version shown. **Save connection** → saved, with no restart.
3. They continue to `/admin/apis`.

### Flow C — A check fails (AC 4)
1. They select **Test connection** or **Save connection**.
2. The server answers 400 or 422. An error alert sits above the actions, and the field at fault shows its own short error (§5.2).
3. Focus runs to the alert, then to the invalid field. The alert is still announced. All values stay, including a typed token.
4. They fix the field and try again. Editing any field clears the alert and the field error.

### Flow D — Import from Kong's services (AC 5)
1. They open `/admin/apis`. The form waits for `GET /v1/admin/gateway/services`.
2. They choose a file or URL and a Kong service, then select **Import and publish** (unchanged from 001 and 004).
3. **Kong down:** the alert has **Try again**, and nothing they entered is lost.
4. **No gateway or disabled:** no form. A panel links to Admin → Gateways.

### Flow E — Edit a connection (AC 7(a), 7(e))
1. On `/admin/gateways` they select **Edit**. The card becomes the form, with URLs filled in and the token blank.
2. **Same URL, blank token:** the stored token is kept.
3. **Changed URL, token stored:** the token hint changes straight away. Test and Save are refused until they enter a token or choose **This Kong needs no token**. The stored token is never sent to the new address.
4. **This Kong needs no token:** the checks run with no token, and saving removes the stored one.
5. **Missing consumers:** Test shows the warning under the success alert. **Save connection** opens a dialog (§3.5). **Save anyway** saves. **Keep current connection** closes it, saves nothing, and leaves the form as it was.

### Flow F — Disable and re-enable (AC 7(b))
1. **Disable** → the dialog lists what stops and what carries on → **Disable gateway**. This works when Kong is down.
2. New apps, new keys, imports and the sample are refused. Existing keys, docs, revoke and reconcile carry on.
3. **Enable** runs the checks. **Pass:** the badge changes and a toast confirms. **Fail:** the alert shows that case's message, adds "The gateway stays disabled." and offers **Edit connection**.

### Flow G — Remove (AC 7(c), 7(d))
1. **Remove** → the dialog says what is deleted and what stays in Kong → **Remove gateway**.
2. **Something depends on it:** the dialog stays open and names the counts. Nothing is removed.
3. **Nothing depends on it:** the page returns to the add form, with a success alert linking to the cleanup steps.

### Flow H — Environment-managed (AC 8)
There's no wizard for whatever the environment set. After sign-in, `/admin/gateways` shows the card with no actions and an explanation.

| Environment | `/setup` | `/setup/gateway` |
| --- | --- | --- |
| Admin and Kong set | Never: redirects to `/` | Redirects to `/admin/gateways` |
| Admin only | Never | Shown on sign-in until a gateway exists or they skip |
| Kong only | Shown | Not offered: after `/setup` they go to `/admin/apis` |
| v0.2 upgrade (admin and gateway in the database) | Never | Redirects to `/admin/gateways`. The gateway is editable |

---

## 2. Global changes

### Header on `/setup`
`Header` shows the brand only on `/setup`. APIs, Sign in and Sign up would all redirect straight back, so they'd be dead links. `/setup/gateway` has the normal signed-in header.

### Admin section navigation — new `AdminNav`
`/admin/*` gets a second line of navigation, so Gateways can be found. The header's **Admin** link stays pointed at `/admin/apis`.

```
1280px                                                     375px
│ ◆ Developer Portal   APIs  Dashboard  Admin  [ana@… ▾] │ │ ◆ Developer Portal      [≡] │
├─────────────────────────────────────────────────────────┤ ├─────────────────────────────┤
│ APIs   Gateways                                         │ │ APIs   Gateways             │
│ ‾‾‾‾                                                    │ │ ‾‾‾‾                        │
│ APIs (h1)                                               │ │ APIs (h1)                   │
```

### Middleware and landing
| Situation | Result |
| --- | --- |
| No admin, any page | `/setup` (including `/setup/gateway`, `/sign-in`, `/sign-up`) |
| Admin exists, `/setup` | `/` |
| Signed out, `/setup/gateway` | `/sign-in?next=%2Fsetup%2Fgateway` |
| Developer, `/setup/gateway` | 404 page, the same as `/admin/*` |
| Admin signs in with no `next`, and `GET /v1/admin/gateways` has no items | `/setup/gateway` |
| Admin signs in with no `next`, gateway exists | `/dashboard` (unchanged) |
| Server down, public page | Renders as today |
| Server down, protected page | 503 text as today |

Static demo mode: no change. Middleware exits first, and `/setup` and `/admin/*` aren't served there.

### Catalog
No change. On a fresh install with no sample, an admin already sees "No APIs yet" and **Import an API** (001 §3.1).

---

## 3. Screens

### 3.1 First admin — `/setup` (AC 1, 2)
**Purpose:** claim this install. **Primary action:** **Create admin account**.

```
1280px (card centred, --portal-auth-max-width)     375px (full width, no card border)
┌ ◆ Developer Portal ─────────────────────────┐    ┌ ◆ Developer Portal ─────────────┐
        ┌──────────────────────────────────┐       │ Set up your portal (h1)         │
        │ Set up your portal (h1)          │       │ Create the first admin account. │
        │ Create the first admin account.  │       │ It runs this portal, and it can │
        │ It runs this portal, and it can  │       │ only be created once.           │
        │ only be created once.            │       │                                 │
        │                                  │       │ Setup token          (only when │
        │ Setup token   (only when required)│      │ [_____________________________] │ required)
        │ [______________________________] │       │ Find it in the portal server's  │
        │ Find it in the portal server's   │       │ logs, on the line starting      │
        │ logs, on the line starting       │       │ "Setup token". It changes each  │
        │ "Setup token". It changes each   │       │ time the server starts.         │
        │ time the server starts.          │       │ Email                           │
        │ Email                            │       │ [_____________________________] │
        │ [______________________________] │       │ Password                        │
        │ Password                         │       │ [_______________________][Show] │
        │ [__________________________][Show]│      │ At least 8 characters. Keep it  │
        │ At least 8 characters. Keep it   │       │ safe: the portal can't reset    │
        │ safe: the portal can't reset     │       │ passwords yet.                  │
        │ passwords yet.                   │       │ [     Create admin account    ] │
        │ [      Create admin account    ] │       └─────────────────────────────────┘
        └──────────────────────────────────┘
```

**Data:** `GET /v1/setup` for `setupTokenRequired`. Submit `POST /v1/setup/admin` with `{ email, password, setupToken? }`. Trim `setupToken` (it's often pasted with a newline). Leave out `name`.

| Label | Control | Attributes | Client validation |
| --- | --- | --- | --- |
| Setup token | `Input`, mono | Only when `setupTokenRequired`; first field; `autocomplete="off"`, `spellcheck="false"`, `autocapitalize="off"` | Empty → "Enter the setup token from the server's logs." |
| Email | `Input type="email"` | `autocomplete="email"`, `inputmode="email"` | "Enter an email address, like name@example.com." |
| Password | `Input` + **Show**/**Hide** | `autocomplete="new-password"` | "Use at least 8 characters." / "Use 128 characters or fewer." |

| State / response | UI |
| --- | --- |
| Loading (`GET /v1/setup`) | The card with a `Skeleton` in place of the form and `role="status"` "Checking this portal's setup…". |
| Status failed: the server isn't up yet | `ProblemAlert` title "The portal server isn't ready", body "It may still be starting. Try again in a moment.", **Try again**. No form. |
| Default, no token | As wireframe without the token field. |
| Default, token required | As wireframe. |
| Field errors | Inline, focus on the first invalid field. |
| Pending | **Creating admin…**, disabled, `aria-busy`, fields `readOnly`. |
| `403 setup-token-invalid` | Field error on Setup token (§5.1). Email and password stay. Focus on Setup token. |
| `400 validation` | `errors[].pointer` maps to its field, with `message` verbatim. |
| `409 setup-complete` | The form is replaced by `ProblemAlert` (§5.1) and a **Sign in** link. Focus on the alert. The form can't succeed now, so it isn't left on screen. |
| `429` | Form-level alert: "Too many attempts. Wait a minute and try again." |
| Network failure | Form-level alert: "Can't reach the portal server. Check your connection and try again." Values stay. |
| Success (`201`, session set) | Check `GET /v1/admin/gateways`. No items → `/setup/gateway`. Otherwise → `/admin/apis`. No toast. |
| Success, no session (sign-in step failed) | `/sign-in?next=%2Fsetup%2Fgateway`. It already shows "Sign in to continue." |
| Empty | n/a: the form is the only content. |
| No permission | n/a: public until an admin exists, then it redirects to `/`. |
| Sign-up refused before an admin exists | Only reachable if `/sign-up` opened while the server was down. Existing "We couldn't create your account. Try again." The next page load goes to `/setup`. Better Auth owns this error, so there's no problem type to branch on. |

### 3.2 Gateway form — `GatewayForm`, used by §3.3 and §3.4 (AC 3, 4, 7(a))
**Purpose:** enter, check and save connection values. **Primary action:** **Save connection**. **Secondary:** **Test connection**.

```
1280px (form column, --portal-form-max-width)            375px
│ ⓘ These are the bundled Kong's values from your    │   │ ⓘ These are the bundled Kong's  │  add, only
│   compose file. Keep them, or enter your own Kong's.│  │   values from your compose file.│  when bundled
│ Need a safe way to reach the Admin API?            │   │   Keep them, or enter your own  │
│ Read Reaching the Kong Admin API.                  │   │   Kong's.                       │
│                                                    │   │ Need a safe way to reach the    │
│ Admin API URL                                      │   │ Admin API? Read Reaching the    │
│ [ http://kong:8001                               ] │   │ Kong Admin API.                 │
│ The address the portal server uses to reach Kong's │   │ Admin API URL                   │
│ Admin API, like http://kong:8001. It's resolved    │   │ [ http://kong:8001            ] │
│ from the server, not your machine.                 │   │ The address the portal server … │
│                                                    │   │ Admin API token (optional)      │
│ Admin API token (optional)                         │   │ [______________________][Show]  │
│ [__________________________________________][Show] │   │ Sent as the Kong-Admin-Token …  │
│ Sent as the Kong-Admin-Token header and stored     │   │ Internal proxy URL              │
│ encrypted. Leave blank if the Admin API has none.  │   │ [ http://kong:8000            ] │
│ ☐ This Kong needs no token       (edit, token stored)│ │ …                               │
│                                                    │   │ Public proxy URL                │
│ Internal proxy URL                                 │   │ [ http://localhost:8000       ] │
│ [ http://kong:8000                               ] │   │ …                               │
│ Where the portal server reaches Kong's proxy. Test │   │                                 │
│ checks this one.                                   │   │ What saving changes in this Kong│
│                                                    │   │ • Consumers and keys: …         │
│ Public proxy URL                                   │   │ • Services you publish: …       │
│ [ http://localhost:8000                          ] │   │ • Other services with key-auth… │
│ The address developers call, shown in the catalog. │   │ • Routes with no auth plugin …  │
│ The server can't check it, so make sure it's right.│   │ …                               │
│                                                    │   │ ┌ ✓ Connected to Kong 3.9.4 … ┐ │
│ What saving changes in this Kong (h3)              │   │ [      Save connection        ] │
│ The portal starts writing to this Kong as soon as  │   │ [      Test connection        ] │
│ you save. Test changes nothing.                    │   │ [        Cancel / Skip        ] │
│ • Consumers and keys: …                            │   │
│ • Services you publish: …                          │
│ • Other services with key-auth: …                  │
│ • Routes with no auth plugin: …                    │
│ Everything it creates carries the tag              │
│ portal-instance-<id>, and stays if you remove …    │
│                                                    │
│ ┌ ✓ Connected to Kong 3.9.4. The Admin API and   ┐ │  result region, directly above
│ │   internal proxy answered. Nothing has been     │ │  the actions
│ │   saved yet. …                                  │ │
│ └─────────────────────────────────────────────────┘ │
│ [Save connection] [Test connection]   Cancel / Skip │
```

**Fields**

| Label | Control | Attributes | Client validation |
| --- | --- | --- | --- |
| Admin API URL | `Input type="url"`, mono | Required, `spellcheck="false"`, `autocapitalize="off"` | Empty or not http(s) → "Enter a URL that starts with http:// or https://." |
| Admin API token (optional) | `Input type="password"`, mono, + **Show**/**Hide** | `autocomplete="new-password"`, `spellcheck="false"`, trim on send | None. Over 1024 → "Use 1024 characters or fewer." |
| This Kong needs no token | `Checkbox` | Only in edit with `hasAdminToken` true. Ticking it disables and clears the token field | None |
| Internal proxy URL | `Input type="url"`, mono | Required | As Admin API URL |
| Public proxy URL | `Input type="url"`, mono | Required | As Admin API URL |

Trim URLs before validating and sending. Client validation runs on **Test** and **Save**. It catches only empties and schemes; the server decides everything else.

**Token hint, by state**

| State | Hint |
| --- | --- |
| Add, or edit with no stored token | Sent as the Kong-Admin-Token header and stored encrypted. Leave blank if the Admin API has none. |
| Edit, stored token, URL unchanged | A token is stored. Leave this blank to keep it, or enter a new one. |
| Edit, stored token, URL changed | You changed the Admin API URL, so the stored token won't be sent to it. Enter the token for this Kong, or choose This Kong needs no token. |
| Box ticked | Saving removes the stored token, and the portal connects with no token. |

Decide "URL changed" as the server does (`origin + pathname`, trailing slash removed, after `new URL()`). This only chooses the hint. The server still decides, and answers `gateway-token-required`.

**What each button sends**

| | Add | Edit |
| --- | --- | --- |
| Test | `POST …/test` with the three URLs and `adminToken` only when typed | The same, plus `gatewayId`. Ticked box → `adminToken: null` |
| Save | `POST /v1/admin/gateways`. Leave `adminToken` out when blank, because the schema has `minLength: 1` and no null | `PATCH …/{id}` with **only the changed fields**. Typed → string. Ticked → `null`. Otherwise leave it out |

**Edit with no changes:** **Save connection** sends nothing (`PATCH` requires at least one property), returns to the card and shows the toast "No changes to save." **Test connection** still works.

**States**

| State / response | UI |
| --- | --- |
| Default | No result region. Both buttons enabled. |
| Testing | **Testing…**, `aria-busy`; **Save connection** disabled; the form's `fieldset` is disabled, as on the import form; `role="status"` "Checking Kong. This can take a few seconds." |
| Saving | **Checking and saving…**; same locks and status text. A save can wait for a running reconcile, so don't time it out in the UI. |
| Test `200`, no warnings | Success alert (§5.3), focused. |
| Test `200`, warnings | Success alert, focused, then one warning alert per `warnings[]`, with `message` verbatim. Link them with `aria-describedby`, as in 004. |
| Any field edited after a result | Clear the result and errors. An old pass mustn't vouch for new values. |
| `400` | Field errors from `errors[].pointer` (`/adminUrl`, `/adminToken`, `/proxyInternalUrl`, `/proxyPublicUrl`), `message` verbatim. Focus on the first. No alert is needed. |
| `422` checks | `ProblemAlert` with `title` and `detail`, plus the field error (§5.2). On **Save**, add the closing line (§5.2). Keep every value, including the token. |
| `409 gateway-exists` (a stale tab) | `ProblemAlert` (§5.2). Reload the list, so the page shows the existing connection. Discard the form. |
| `409 gateway-keys-missing` (edit) | Dialog, §3.5. |
| `409 gateway-env-managed` (a stale tab) | `ProblemAlert` (§5.2). Reload the list, so the card shows the read-only state. |
| `404` on edit (removed elsewhere) | Toast "This gateway connection no longer exists." Reload the list, so the add form shows. |
| `429` | `ProblemAlert` title "Too many tests" (Test) or "Too many attempts" (Save), body "Wait a moment and try again. Your values are still here.", **Try again** with the `Retry-After` countdown. A toast is too easy to miss on a form this long. |
| Any other status, including `503`, or network failure | `ProblemAlert` with the problem's title and detail (or 001's network message), and **Try again**. Values stay. |
| Session ended (`401`) | 001 shared state: sign in again. Values are lost. |
| No permission (`403`) | 404 page, as 001. |

**The token stays in React state only.** It's never in a URL, `localStorage`, a log or a query key. Clear it on save and on cancel.

### 3.3 Connect your Kong — `/setup/gateway` (AC 2, 3, 6)
**Purpose:** connect a Kong straight after creating the admin. **Primary action:** **Save connection**, then the sample choice or **Import an API**.

```
1280px                                                 375px
│ Connect your Kong (h1)                         │     │ Connect your Kong (h1)          │
│ The portal reads services from Kong and creates│     │ The portal reads services from  │
│ consumers and keys there. Test the connection  │     │ Kong and creates consumers and  │
│ before you save it.                            │     │ keys there. Test the connection │
│                                                │     │ before you save it.             │
│ [ GatewayForm, §3.2 ]                          │     │ [ GatewayForm, §3.2 ]           │
│ [Save connection] [Test connection]            │     │ [      Save connection        ] │
│ Skip for now. You can connect a Kong later in  │     │ [      Test connection        ] │
│ Admin → Gateways.                              │     │ Skip for now. You can connect a │
├ after saving, bundled Kong ────────────────────┤     │ Kong later in Admin → Gateways. │
│ ┌ ✓ Kong is connected. The portal is using it │ │    ├ after saving, bundled Kong ─────┤
│ │   now, with no restart.                     │ │    │ ┌ ✓ Kong is connected. …      ┐ │
│ Add the sample API? (h2)                       │     │ Add the sample API? (h2)        │
│ It adds a sample service and route to the      │     │ It adds a sample service and    │
│ bundled Kong and publishes Sample HTTP API in  │     │ route to the bundled Kong and … │
│ the catalog, so you can try a key straight     │     │ [  Publish the sample API     ] │
│ away. Skip it if this isn't a trial.           │     │ [   Continue without it       ] │
│ [Publish the sample API] [Continue without it] │     │                                 │
├ after saving, any other Kong ──────────────────┤     ├ after saving, any other Kong ───┤
│ ┌ ✓ Kong is connected. …                      │ │    │ ┌ ✓ Kong is connected. …      ┐ │
│ Next, publish your first API.                  │     │ Next, publish your first API.   │
│ [Import an API]                                │     │ [        Import an API        ] │
```

The sample choice shows only when the saved `Gateway.sampleAvailable` is true.

| State / response | UI |
| --- | --- |
| Loading (`GET /v1/admin/gateways`) | h1 and form skeleton, `role="status"` "Loading…". |
| List failed | `ProblemAlert` with **Try again**. No form. |
| Empty, `bundled` set | Form filled from `bundled`, with the info line. |
| Empty, `bundled` null | Blank form, no info line. |
| Gateway exists, `managedBy: admin`, `sampleAvailable` true (for example after a reload) | The "after saving, bundled Kong" panel, so a reload doesn't lose the choice. |
| Gateway exists, anything else | Redirect to `/admin/gateways`. A second add isn't offered. |
| Save succeeded | Replace the form with the panel. Focus the success alert. Clear the token. |
| **Publish the sample API** pending | **Publishing…**; **Continue without it** disabled. |
| Sample `201` | Success alert "Published Sample HTTP API. It's now in the public catalog." Actions **View Sample HTTP API** (→ `/apis/{slug}`) and **Go to Admin** (→ `/admin/apis`). Focus the alert. |
| Sample `409 gateway-disabled` | `ProblemAlert` (§5.4). **Go to Gateways**. No retry. Nothing was published. |
| Sample `409 sample-not-available` | `ProblemAlert` (§5.4), then **Continue without it** stays. |
| Sample `503` | `ProblemAlert` "Can't reach Kong's Admin API. Nothing was published." **Try again**, with the countdown. |
| Sample `502` | `ProblemAlert` "Kong rejected the request. Nothing was published." with **Try again**. |
| **Continue without it** / **Skip for now** | `/admin/apis`. Nothing is written. |
| No permission | Signed out → sign-in. Developer → 404 page. |

### 3.4 Admin: Gateways — `/admin/gateways` (AC 3, 7, 8)
**Purpose:** see and manage the one connection. **Primary action:** depends on state, as below.

```
1280px, connected and admin-managed
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs   Gateways                                                              │
│ Gateways (h1)                                                                │
│ A portal connects to one gateway.                                            │
│                                                                              │
│ ┌ Kong (h2)          ● Connected   Kong 3.9.4 ──────── --portal-form-max-width┐ │
│ │ Admin API URL       http://kong:8001                                       │ │
│ │ Admin API token     Stored                                                 │ │
│ │ Internal proxy URL  http://kong:8000                                       │ │
│ │ Public proxy URL    http://localhost:8000                                  │ │
│ │ Last changed        7 Nov 2026                                             │ │
│ │                                                                            │ │
│ │ [Edit]  [Disable]  [Remove]                                                │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
├ not responding ──────────────────────────────────────────────────────────────┤
│ ┌ Kong   ⚠ Not responding ───────────────────────────────────────────────────┐ │
│ │ ⚠ Kong's Admin API isn't responding. Imports, new apps and new keys will   │ │
│ │   fail until it's back. If the server's PORTAL_ENCRYPTION_KEY changed, the │ │
│ │   stored token can't be read: select Edit and enter it again.              │ │
├ disabled ────────────────────────────────────────────────────────────────────┤
│ ┌ Kong   ○ Disabled ─────────────────────────────────────────────────────────┐ │
│ │ ⚠ New apps, new keys and API imports are off. Existing keys keep working   │ │
│ │   and docs stay published.                                                 │ │
│ │ [Enable]  [Edit]  [Remove]                                                 │ │
├ set by environment ──────────────────────────────────────────────────────────┤
│ ┌ Kong   ● Connected   Kong 3.9.4   Set by environment ──────────────────────┐ │
│ │ ⓘ KONG_ADMIN_URL set this connection, so it can't be changed here. Change  │ │
│ │   the server's environment and restart it. To manage it here instead,      │ │
│ │   unset KONG_ADMIN_URL and restart the server.                             │ │
│ │ (no action buttons)                                                        │ │
└──────────────────────────────────────────────────────────────────────────────┘

375px: one column. The h2 and badges wrap. Value rows stack as label above value, and URLs wrap
with overflow-wrap: anywhere. Action buttons are full width and stacked, with Remove last.
```

**Data:** `GET /v1/admin/gateways`; `GET /v1/health` for the status badge and version. The API doesn't expose a connection name, so the card's h2 is "Kong", from `kind`.

**Status badge** (`GatewayStatusBadge`, §4). `enabled` decides first, then health:

| `enabled` | `health.gateway` | Badge | Next to it |
| --- | --- | --- | --- |
| false | any | ○ Disabled | — |
| true | `reachable: true` | ● Connected | Kong {version}, when present |
| true | `reachable: false` | ⚠ Not responding | Warning alert in the card |
| true | Loading | `Skeleton` | — |
| true | null, or the health call failed | ● Enabled | — |

Admin API token row: `hasAdminToken` true → "Stored". False → "None". Never the value, and never a mask suggesting one.

| State / response | UI |
| --- | --- |
| Loading | h1, card skeleton in the card's shape. |
| List failed | `ProblemAlert` with **Try again**. |
| Empty: no gateway | h2 "Connect a Kong", then `GatewayForm` in add mode, with the bundled values if `bundled` is set. Actions **Save connection**, **Test connection**. No cancel. |
| Connected, `managedBy: admin`, enabled | Card with **Edit**, **Disable**, **Remove**. |
| Connected, disabled | Card with the notice and **Enable** (primary), **Edit**, **Remove**. |
| Connected, `managedBy: env` | Card with **Set by environment** badge and the info line. No action buttons. |
| Edit | Card replaced by `GatewayForm` in edit mode. Focus the h2 "Edit connection". **Cancel** returns to the card and focuses **Edit**. On a disabled gateway the checks still run, and the gateway stays disabled after saving. |
| Edit saved | Card, toast "Gateway connection saved." On a disabled gateway: "Gateway connection saved. It's still disabled." Focus **Edit**. |
| Add saved | Card, success alert "Kong is connected. The portal is using it now, with no restart." + link **Import an API**. Focus the alert. |
| **Enable** pending | **Checking Kong…**, other actions disabled. |
| Enable `200` | Toast "Gateway enabled." Focus **Disable**. |
| Enable `422` | `ProblemAlert` in the card with `title` and `detail`, then "The gateway stays disabled." and an **Edit connection** button. Focus the alert. Badge stays ○ Disabled. There are no fields here, so the `detail` names what to fix (§5.2). |
| Enable `429`, `404`, `409 gateway-env-managed` | As §3.2. |
| Removed | Add form, with success alert above it: "Gateway removed. Its stored token is deleted, and the portal's objects stay in Kong. To remove them, follow the cleanup steps." + link. Focus the alert. |
| No permission | Signed out → sign-in. Developer → 404 page. |

### 3.5 Dialogs (AC 7(b), 7(c), 7(d), 7(e))
All follow the Revoke key dialog (001 §3.9): initial focus on the safe button, `Escape` means the safe button, and `Escape` is ignored while pending. At 375px the buttons stack full width with the action on top.

```
┌ Some keys won't work on this Kong (h2) ───────┐  ┌ Disable this gateway? (h2) ───────────────┐
│ 3 active keys have no consumer on this Kong,  │  │ New apps, new keys and API imports stop   │
│ so they won't work there. The portal stores   │  │ until you enable it again.                │
│ only each key's last four characters, so it   │  │ Existing keys keep working through Kong,  │
│ can't recreate them. Developers will need new │  │ and docs stay published. Revoking keys    │
│ keys.                                         │  │ and repairing Kong keep running.          │
│ Those keys keep working on your current Kong  │  │ Enabling runs the connection checks       │
│ until you remove them there. Once you save,   │  │ again, so Kong must be answering.         │
│ the portal can't reach that Kong, so revoking │  │                                           │
│ a key here won't stop it there.               │  │       [Cancel]  [Disable gateway]         │
│ [Keep current connection]  [Save anyway]      │  └───────────────────────────────────────────┘
└───────────────────────────────────────────────┘
┌ Remove this gateway? (h2) ────────────────────┐  after 409 gateway-in-use, same dialog:
│ This deletes the connection and its stored    │  ┌ ⚠ This gateway is still in use ───────────┐
│ token. The portal's objects stay in Kong,     │  │ 2 published APIs and 3 active keys depend │
│ including its consumers, keys and ACLs, so    │  │ on it. Nothing was removed.               │
│ traffic through Kong doesn't change. To       │  │ The portal can't unpublish an API yet. To │
│ remove them, follow the cleanup steps.        │  │ use a different Kong, edit this           │
│       [Cancel]  [Remove gateway]              │  │ connection. To stop new apps and keys,    │
└───────────────────────────────────────────────┘  │ disable it.                               │
                                                   └───────────────────────────────────────────┘
                                                                              [Close]
```

| Dialog | Safe button (initial focus) | Action | Pending | Result |
| --- | --- | --- | --- | --- |
| Missing keys | **Keep current connection** | **Save anyway** (destructive) | **Saving…** | Action sends the same `PATCH` plus `confirmMissingKeys: true`. `200` → card. `422` → close and show §3.2's check failure. Safe button → close, nothing sent, form unchanged, focus **Save connection**. |
| Disable | **Cancel** | **Disable gateway** (destructive) | **Disabling…** | `PATCH { enabled: false }`. `200` → toast "Gateway disabled." Focus **Enable**. |
| Remove | **Cancel** | **Remove gateway** (destructive) | **Removing…** | `DELETE`. `204` → add form and §3.4's alert. `409 gateway-in-use` → alert inside, action hidden, **Cancel** becomes **Close**. |

`{n}` comes from `problem.affectedKeys`, and the in-use counts from `problem.apis` and `problem.activeKeys`. Leave out a zero count and pluralise each one (§5.2).

### 3.6 Admin: APIs — `/admin/apis` (AC 5, 7(b))
Unchanged except as below (001 §3.10, 004 §2.3). Today the form renders at once. Now it waits for the services response on the first load, so a disabled gateway never flashes a form.

```
1280px (form column 640px)                              375px: same, one column, full-width links
│ APIs (h1)                                          │
├ first load ────────────────────────────────────────┤
│ Import an API (h2)                                 │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  "Loading Kong services…"        │
├ gateway-not-connected ─────────────────────────────┤
│ ┌ Connect a Kong to import APIs (h2) ────────────┐ │
│ │ No gateway is connected, so there are no        │ │
│ │ services to choose from.                        │ │
│ │ [Go to Gateways]                                │ │
├ gateway-disabled ──────────────────────────────────┤
│ ┌ ⚠ Imports are off (h2) ────────────────────────┐ │
│ │ This gateway is disabled, so the portal doesn't │ │
│ │ offer its services. Enable it to import an API. │ │
│ │ [Go to Gateways]                                │ │
├ gateway-unavailable, form stays ───────────────────┤
│ Kong service                                       │
│ [ Choose a Kong service                        ▾ ] │
│ ┌ ⚠ Gateway unavailable ─────────────────────────┐ │
│ │ Can't reach Kong's Admin API, so the service    │ │
│ │ list is empty. Check that Kong is running.      │ │
│ │ Nothing you entered is lost.                    │ │
│ │ [Try again]                                     │ │
├ a service chosen ──────────────────────────────────┤
│ [ orders-svc — /orders, /v2/orders — key-auth on▾ ]│
│ Routes: /orders, /v2/orders, /v3/orders            │  every path, new hint
│ Publishing limits this service to … (004)          │
├ always, below ─────────────────────────────────────┤
│ Published APIs (h2) …                              │  stays in every state
```

| Services response | UI |
| --- | --- |
| First load | Form skeleton with `role="status"`. Published APIs load independently. |
| `200` with items | The form. **AC 5 adds to the option label:** up to two paths, then "+{n} more" (`orders-svc — /orders, /v2/orders +1 more — key-auth on`). Once a service is chosen, a hint lists every path. The label today shows only the first path. |
| `200`, none | Unchanged (001). |
| `409 gateway-not-connected` | Panel, as wireframe. No form, no health banner. |
| `409 gateway-disabled` | Panel, as wireframe. No form, no service list, no health banner. |
| `503` | Form stays, with the alert as wireframe and **Try again** (calls `services.reload()`). Not focused automatically. Submit stays disabled, because there are no services. |
| Other errors or network | Form stays, with `ProblemAlert` using the problem's own title and detail, and **Try again**. Today's single message claims Kong is down whatever went wrong. |

**Keep what was entered.** Once the form has shown, a reload must not swap it for the skeleton, because `useResource.reload()` clears `error` and sets `loading`. Show the skeleton only before the first response. State lives in `AdminApis`, so a later switch to a panel loses nothing either.

| Submit response | UI |
| --- | --- |
| `409 gateway-disabled` | `ProblemAlert` above the submit button (§5.4), with the **Go to Gateways** link. Values stay. Focus on the alert. **Don't reload services**, or the panel would replace the form the spec says to keep. |
| `409 gateway-not-connected` | The same, with its own copy (§5.4). |
| Everything else | Unchanged. |

**Health:** read `health.data?.gateway?.reachable`, because `gateway` may be null. Show the "isn't responding" banner only while the form is showing. Its "until it's back" is wrong for a disabled or absent gateway.

### 3.7 Create app and New key (AC 7(b))
Layout unchanged. **Today both screens treat every 409 as one case:** Create app says the name is taken, and New key says the app has 5 keys. Branch on `type`, or a disabled gateway shows the wrong message.

| Screen | `type` | UI |
| --- | --- | --- |
| Create app | `app-name-taken` | Unchanged field error. |
| Create app | `gateway-disabled` | `ProblemAlert` (§5.5), focused. No **Try again**, because retrying won't help until an admin acts. Values stay. No field error. |
| App detail, **Create key** | `credential-limit` | Unchanged. |
| App detail, **Create key** | `gateway-disabled`, `gateway-not-connected` | `ProblemAlert` (§5.5), focused. Key list unchanged. |

Revoke is unchanged. It still works on a disabled gateway, and 001 §3.9's `503` and `502` messages cover a Kong that can't be reached.

---

## 4. Components

**Existing:** `Button`, `Input`, `Card`, `Badge`, `PageHeader`, `AlertDialog`, `Field`, `focusInvalid`, `ProblemAlert`, `useResource`, `.alert`, `.alert.warning`, `.alert.success`, `.hint`, `toast`, plus `Checkbox` and `Skeleton` as 001 names them. `.auth` holds the `/setup` card.

**`Field` limits:** `hint` is a plain string and is replaced in `aria-describedby` by an error. Keep links out of hints, as the wireframes do.

**New, all in `apps/portal/components`:**

| Component | Props | Notes |
| --- | --- | --- |
| `SetupForm` | `setupTokenRequired: boolean` | §3.1. Follows `AuthForm`, including the guard against submitting before hydration. |
| `GatewayForm` | `mode: 'add' \| 'edit'`, `gateway?: Gateway`, `bundled: GatewayUrls \| null`, `onSaved(gateway: Gateway)`, `cancel?: ReactNode` | §3.2. `cancel` holds **Cancel** or the skip line. |
| `GatewayChanges` | `urlChanged?: boolean` | The notice (§5.3). Static content, always visible. |
| `GatewayCard` | `gateway: Gateway`, `onChanged()` | §3.4 and its dialogs. |
| `GatewayStatusBadge` | `enabled: boolean`, `health: Health['gateway'] \| undefined`, `loading: boolean` | Variants: `connected` (uses `.badge.active`), `not-responding` (`.badge.warning`), `disabled` and `enabled` (`.badge`). Always a glyph and a word. |
| `AdminNav` | none | `<nav aria-label="Admin">`, `aria-current="page"`. Rendered from `app/admin/layout.tsx`. |

**One new style:** `.badge.warning` in `packages/ui/src/styles.css`: `background: var(--portal-warning-subtle); color: var(--portal-warning);`. It uses existing tokens, at 6.8:1.

---

## 5. Copy
Use these strings exactly. "Server" strings are the problem's `title` and `detail`, fixed in the server and containing nothing Kong sent. "Portal" strings live in the component.

### 5.1 Setup
| Where | Text |
| --- | --- |
| `<title>` | Set up your portal · Developer Portal |
| h1 / subtitle | Set up your portal / Create the first admin account. It runs this portal, and it can only be created once. |
| Setup token hint | Find it in the portal server's logs, on the line starting "Setup token". It changes each time the server starts. |
| Password hint | At least 8 characters. Keep it safe: the portal can't reset passwords yet. |
| Button / pending | Create admin account / Creating admin… |
| Status failed | Title: The portal server isn't ready. Body: It may still be starting. Try again in a moment. |
| **Server log line** | `Setup token for the first admin: <token>` |

| Problem | `title` (server) | `detail` (server) | Portal |
| --- | --- | --- | --- |
| `setup-token-invalid` | Setup token not accepted | The setup token is missing or wrong. No admin was created. | Field error: That token didn't match. Copy it again from the server's logs. It changes each time the server starts. |
| `setup-complete` | This portal already has an admin | The first admin has already been created. A portal has only one first admin, so this one wasn't created. | Link: Sign in |
| `validation` on `/email`, email already used | Check the highlighted fields and try again | — | `errors[0].message` (server): An account with this email already exists. Use a different email. |

### 5.2 Gateway refusals
**Field error** goes on the named field, and **Closing line** is added by the portal to the alert.

| Problem | `title` (server) | `detail` (server) | Field | Field error (portal) |
| --- | --- | --- | --- | --- |
| `gateway-unreachable` | The portal couldn't reach that address | The portal couldn't reach that address. Check the Admin API URL and that Kong is running. | Admin API URL | Check this address. |
| same, for `localhost`, `127.0.0.1`, `::1` | same | The portal couldn't reach that address. It's resolved from the portal server, not your machine, so localhost means the server itself. If Kong runs in the same compose network, use its service name, like http://kong:8001. | Admin API URL | Use an address the portal server can reach. |
| `gateway-token-refused` | Kong refused the token | Kong refused the request because the Admin API token is wrong or missing. Check the token and try again. | Admin API token | Kong refused this token. |
| `gateway-not-kong` | That address isn't a Kong Admin API | Something answered at that address, but it isn't a Kong Admin API. Check the Admin API URL's host and port. Kong's proxy port doesn't serve the Admin API. | Admin API URL | This isn't a Kong Admin API. |
| `gateway-read-only` | This Kong can't be written to | This Kong runs in DB-less mode or as a data plane node. The portal can't work with it, because it needs to write consumers and keys. Change the Admin API URL to a Kong with a database, or to its control plane. | Admin API URL | This Kong is read-only. |
| `gateway-proxy-unreachable` | The portal can't reach Kong's proxy | The Admin API passed, but the portal can't reach the proxy. Check the internal proxy URL. | Internal proxy URL | Check this address. |
| `gateway-token-required` | Enter the token again | You changed the Admin API URL, so the portal won't send the stored token to it. Enter the token for this Kong, or choose This Kong needs no token. | Admin API token | Enter the token for this Kong, or choose This Kong needs no token. |

| `400 validation` case | `errors[].message` (server), on the named field |
| --- | --- |
| Malformed, or not http(s) | Enter a URL that starts with http:// or https://. |
| Carries a username, password, query or fragment | Remove the username, password, query or fragment from this URL. |
| Resolves to a link-local or cloud metadata address | The portal doesn't connect to link-local or cloud metadata addresses. Enter a different address. |

| When | Closing line (portal) |
| --- | --- |
| Save, add mode | Nothing was saved. |
| Save, edit mode | Nothing was saved. The existing connection keeps working. |
| Enable | The gateway stays disabled. |
| Test | None. Test never saves. |

| Other refusal | `title` (server) | `detail` (server) | Portal |
| --- | --- | --- | --- |
| `gateway-exists` | This portal already has a gateway | A portal connects to one gateway, so this one wasn't added. The existing connection is unchanged. | — |
| `gateway-env-managed` | This gateway is set by environment variables | KONG_ADMIN_URL sets this connection, so it can't be changed here. Change the server's environment and restart it. | — |
| `gateway-in-use` | This gateway is still in use | Published APIs or active keys depend on this gateway, so it wasn't removed. | Dialog body, built from the counts: "{apis} published API(s) and {activeKeys} active key(s) depend on it. Nothing was removed." Then, if `apis` > 0: "The portal can't unpublish an API yet. To use a different Kong, edit this connection. To stop new apps and keys, disable it." If only keys: "Developers can revoke their keys in their dashboards. To use a different Kong, edit this connection. To stop new apps and keys, disable it." |
| `gateway-keys-missing` | Some keys won't work on this Kong | Active keys have no consumer on this Kong. Nothing was saved. Confirm to save anyway. | Dialog, §3.5. |

### 5.3 Gateway form and page
| Where | Text |
| --- | --- |
| `<title>` | Connect your Kong · Developer Portal / Gateways · Developer Portal |
| h1, setup | Connect your Kong |
| Subtitle, setup | The portal reads services from Kong and creates consumers and keys there. Test the connection before you save it. |
| h1 / description, admin | Gateways / A portal connects to one gateway. |
| Bundled info line | ⓘ These are the bundled Kong's values from your compose file. Keep them, or enter your own Kong's. |
| Docs line | Need a safe way to reach the Admin API? Read **Reaching the Kong Admin API**. |
| Admin API URL hint | The address the portal server uses to reach Kong's Admin API, like http://kong:8001. It's resolved from the server, not your machine. |
| Internal proxy URL hint | Where the portal server reaches Kong's proxy. Test checks this one. |
| Public proxy URL hint | The address developers call, shown in the catalog. The server can't check it, so make sure it's right. |
| Buttons / pending | Save connection / Checking and saving… · Test connection / Testing… |
| Pending status | Checking Kong. This can take a few seconds. |
| Test passed | ✓ Connected to Kong {version}. The Admin API and internal proxy answered. Nothing has been saved yet. Check the public proxy URL yourself, because the server can't test it. |
| `active-keys-missing` (`warnings[].message`, server) | ⚠ {affectedKeys} active keys have no consumer on this Kong, so they won't work there. Saving asks you to confirm. |
| Skip | **Skip for now.** You can connect a Kong later in Admin → Gateways. |
| Saved | ✓ Kong is connected. The portal is using it now, with no restart. |

**`GatewayChanges` notice** (h3 "What saving changes in this Kong"):

> The portal starts writing to this Kong as soon as you save. Test changes nothing.
>
> - **Consumers and keys:** it creates a consumer for each developer app, with its keys and group memberships.
> - **Services you publish:** it adds an ACL plugin, so only apps that include that API can call it. Other Kong consumers lose access until you add them to its group, and Kong stops forwarding API keys to the upstream.
> - **Other services with key-auth:** it adds a `deny` ACL plugin, so portal keys get 403 there. Your own consumers' keys keep working.
> - **Routes with no auth plugin:** it leaves them alone.
>
> Everything it creates carries the tag `portal-instance-<id>`, and it stays in Kong if you remove this connection.

When `urlChanged`, add a last paragraph: "APIs already published stay linked to the services on the current Kong. Read what changing Kong does and doesn't move." with a link to the docs page. It's a neutral note, not a warning, because 7(e) allows no key warning when there are no active keys, and this isn't about keys.

| Card and dialog text | |
| --- | --- |
| Row labels | Admin API URL · Admin API token · Internal proxy URL · Public proxy URL · Last changed |
| Token row | Stored · None |
| Badges | ● Connected · ⚠ Not responding · ○ Disabled · ● Enabled · Set by environment |
| Not responding | ⚠ Kong's Admin API isn't responding. Imports, new apps and new keys will fail until it's back. If the server's PORTAL_ENCRYPTION_KEY changed, the stored token can't be read: select Edit and enter it again. |
| Disabled notice | ⚠ New apps, new keys and API imports are off. Existing keys keep working and docs stay published. |
| Environment | ⓘ KONG_ADMIN_URL set this connection, so it can't be changed here. Change the server's environment and restart it. To manage it here instead, unset KONG_ADMIN_URL and restart the server. |
| Actions | Edit · Disable · Enable / Checking Kong… · Remove · Cancel |
| Dialogs | As §3.5, word for word. |
| Removed | ✓ Gateway removed. Its stored token is deleted, and the portal's objects stay in Kong. To remove them, follow the **cleanup steps**. |
| Toasts | Gateway connection saved. · Gateway connection saved. It's still disabled. · Gateway disabled. · Gateway enabled. · No changes to save. · This gateway connection no longer exists. |

### 5.4 Admin: import and sample
| Where | Text |
| --- | --- |
| Not connected panel | h2: Connect a Kong to import APIs. Body: No gateway is connected, so there are no services to choose from. Button: Go to Gateways |
| Disabled panel | h2: Imports are off. Body: This gateway is disabled, so the portal doesn't offer its services. Enable it to import an API. Button: Go to Gateways |
| Unavailable alert | Title: Gateway unavailable. Body: Can't reach Kong's Admin API, so the service list is empty. Check that Kong is running. Nothing you entered is lost. Button: Try again |
| Submit, `gateway-disabled` | Title: This gateway is disabled. Body: Enable it in Admin → Gateways, then import again. Nothing was published, and your entries are still here. Link: Go to Gateways |
| Submit, `gateway-not-connected` | Title: No gateway is connected. Body: Connect a Kong in Admin → Gateways, then import again. Nothing was published, and your entries are still here. Link: Go to Gateways |
| Routes hint | Routes: {every path, comma separated}. No path at all → existing "no route path" warning (001). |
| Sample heading / body | Add the sample API? / It adds a sample service and route to the bundled Kong and publishes Sample HTTP API in the catalog, so you can try a key straight away. Skip it if this isn't a trial. |
| Sample buttons / pending | Publish the sample API / Publishing… · Continue without it |
| Sample published | ✓ Published Sample HTTP API. It's now in the public catalog. Actions: View Sample HTTP API · Go to Admin |
| Sample, `gateway-disabled` | Title: This gateway is disabled. Body: Enable it in Admin → Gateways to publish the sample. Nothing was published. |
| Sample, `sample-not-available` | Title: The sample isn't available here. Body: The sample only works on the bundled Kong, and only if no API already uses the slug sample. Nothing was published. |
| Next step, other Kong | Next, publish your first API. Button: Import an API |

Server `title` and `detail` for both 409s, used by API clients and as a fallback:

| Problem | `title` | `detail` |
| --- | --- | --- |
| `gateway-disabled` | Gateway disabled | The gateway connection is disabled, so this can't be done right now. Nothing was created. |
| `gateway-not-connected` | No gateway connected | No gateway is connected. An admin can connect one in Admin → Gateways. Nothing was created. |

### 5.5 Developer screens
No Kong vocabulary here (004 §0). These replace the problem's text through `ProblemAlert`'s `title` and `message`.

| Where | Title | Message |
| --- | --- | --- |
| Create app, `gateway-disabled` | New apps and keys are paused | The portal admin has turned off new apps and keys for now. Keys you already have keep working. Nothing was created. |
| Create key, `gateway-disabled` | New apps and keys are paused | The portal admin has turned off new apps and keys for now. Keys you already have keep working. No key was created. |
| Create key, `gateway-not-connected` | No API gateway is connected | This portal isn't connected to an API gateway right now. No key was created. Tell the portal admin. |

---

## 6. Accessibility (WCAG 2.2 AA)
- **Keyboard, `/setup`:** Skip to content → Setup token (if shown) → Email → Password → Show → **Create admin account**. Enter submits from any field. The brand link is the only header stop.
- **Keyboard, `/setup/gateway`:** Skip to content → header → docs link → Admin API URL → token → Show → (no-token box) → Internal proxy URL → Public proxy URL → **Save connection** → **Test connection** → **Skip for now**. Enter in a field activates **Save connection**, the form's submit. Test is `type="button"`.
- **Keyboard, `/admin/gateways`:** Skip to content → header → `AdminNav` → card actions in visual order.
- **DOM order is visual order.** At 375px, **Save connection** stays first, so the order doesn't change with width.
- **Focus on arrival:** navigating into `/setup/gateway` moves focus to the h1 (`tabIndex=-1`), as 001 §7 does for form-flow pages.
- **Focus on a result:** `ProblemAlert` takes focus and then `focusInvalid` moves to the field, as 004 §5. The alert keeps `role="alert"`, so it's still read. A passed Test and a saved connection focus their alert (`role="status"`). When a request ends, re-enable the fields before moving focus.
- **Focus when content is replaced:** every state that removes the focused control names where focus goes (§3.3–§3.5). After Remove, focus lands on the success alert. After Disable, on **Enable**. After Enable, on **Disable**.
- **Dialogs:** focus is trapped, starts on the safe button and returns to the trigger. Each dialog has an `AlertDialog.Title` and `AlertDialog.Description`. The in-use alert inside the dialog is `role="alert"`.
- **Labels:** every control has a visible label. "(optional)" appears on the token label. The token field's `aria-describedby` follows its current hint, and the hint swap on a URL change sits in a `aria-live="polite"` span, since it changes without focus moving there.
- **The no-token box:** when ticked, the token field is `disabled` and its label stays visible. The hint explains what saving does.
- **Pending:** `aria-busy` on the pressed button. The "Checking Kong" text is `role="status"`.
- **Secrets:** the token and setup token fields set `spellcheck="false"`, so browser spell-check services don't receive them. **Show** is a toggle with `aria-pressed`.
- **Status:** always a glyph and a word. Contrast is 4.8:1 (success), 6.8:1 (warning) and 6.9:1 (muted). All pairs are already in `tokens.md`.
- **Lists and headings:** `GatewayChanges` is a real `<ul>` under an `h3`. The card's rows are a `<dl>`. Each page has one `h1`.
- **Reflow:** nothing scrolls sideways at 320px. URLs, tags and setup token values break with `overflow-wrap: anywhere`.
- **Targets:** buttons are 40px, and 44px on mobile forms. The no-token box and its label are one target.
- **Nothing times out on the user.** The `Retry-After` countdown only delays a button.
- **Theming:** CSS variables only. No hard-coded colours.

---

## 7. Responsive behaviour
| Element | 375px | 1280px |
| --- | --- | --- |
| `/setup` | Full width, no card border or shadow | 400px card, centred |
| `/setup/gateway`, `GatewayForm` | Full width. Buttons stacked and full width at 44px: **Save**, **Test**, then Cancel or skip | 640px column. Buttons inline and left-aligned |
| `GatewayChanges` | Full width, wraps, stays expanded | In the 640px column |
| Test result and alerts | Full width, directly above the buttons | In the 640px column, directly above the buttons |
| `AdminNav` | One row under the header | One row under the header |
| Gateway card | Full width. Rows stack label over value. Actions stacked and full width, **Remove** last | 640px wide. Rows side by side. Actions inline |
| Badges | Wrap under the h2 | On the h2's line |
| Dialogs | Viewport − 32px, buttons stacked with the action on top, max-height 90vh with body scroll, since the missing-keys text is long | 440px, buttons right-aligned |
| Import panels | Full width, full-width link button | In the 640px column |
| Service option label | Native select truncates long labels, so the Routes hint carries the full list | Same hint |

---

## 8. Notes for backend, frontend and QA
- **Server strings:** §5.1, §5.2 and §5.4 give every `title` and `detail` for JSO-317, JSO-322 and JSO-324. §5.1 gives the setup token's log line for JSO-323. `active-keys-missing` is pluralised by the server.
- **Docs page name:** both links point at one constant beside `QUICKSTART_URL`, aimed at `docs/reaching-the-kong-admin-api.md` on GitHub. "Cleanup steps" and "what changing Kong does and doesn't move" are anchors in it. JSO-326 should use that file name, or tell the frontend what it chose.
- **`adminToken` differs between schemas:** `CreateGatewayRequest` rejects `""` and `null`. `TestGatewayRequest` and `UpdateGatewayRequest` accept both. §3.2's table covers it.
- **Stored token can't be decrypted:** the contract has no answer for Test or `PATCH` with a blank token in this case. The form falls back to showing the problem's own text. Tracked in JSO-366.
- **Additions the spec's task list doesn't name:** tracked in JSO-365 (409 branching, all routes in the import picker, `AdminNav`, the health banner, the `/setup` header and `.badge.warning`).
- **Tests:** use roles and accessible names from this doc, with no `data-testid`, as 001 §9.
- **QA, AC 4:** each case's alert and field error appear together, and focus ends on the named field. A typed token stays after a failure and isn't in the DOM after a success.
- **QA, AC 7(b):** the import panel shows with no flash of the form (throttle the network). A submit refused in a stale tab keeps its values. Create app shows "New apps and keys are paused", not a name error.
- **QA, AC 7(e):** decline leaves the form unchanged and sends no second `PATCH`. With no active keys, no dialog appears.
- **User-tester, Flow A:** time it at 1280px and 375px. Judge whether the `GatewayChanges` notice gets read or skipped, and whether a passed Test is ever mistaken for a save.
