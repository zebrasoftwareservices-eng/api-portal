# 004 — Per-API access control on Kong: UX design

Spec: [004-per-api-access-control](../specs/004-per-api-access-control.md). Contract: `apps/server/openapi.yaml`.

This spec adds **no new screens**. It changes copy and states on three screens designed in
[001](001-kong-quickstart-slice.md): API reference (§3.2), Create app (§3.6) and Admin: APIs (§3.10).
Anything not mentioned here stays as 001 specifies. No new tokens or components.

## 0. Principles for this change
- **A refusal says what to do next.** Every refusal names the next step in words the developer
  already sees on screen, such as the **Get an API key** button.
- **Developers don't see access-control vocabulary.** They see "app", "key" and "API", never "ACL",
  "group" or "consumer". The admin screen can say "ACL plugin" and "key-auth", because the admin
  has to find those objects in Kong.
- **Warn before something changes, and record it after.** An admin learns the effect of publishing
  before submitting. Warnings that only the server can detect appear after publishing, and they stay
  on screen until the next import.

## 1. User flows

### Flow A — Developer: key refused in the try-it console (AC 2)
1. The developer opens `/apis/{slug}` and pastes a key from an app that doesn't include this API.
2. They choose an operation and select **Send**.
3. Kong answers 403. The server replaces the body with the `/problems/api-access-denied` problem.
4. Scalar's response panel shows `403` and the problem's `title` and `detail` (§2.1).
5. The developer selects **Get an API key** in the page header.
6. `/dashboard/apps/new?api={slug}` opens with this API ticked. Signed-out developers go through
   sign-up first, as in 001.
7. They create the app, save the key, return to `/apis/{slug}`, paste it and select **Send**.
8. **Success:** `200` and the upstream's body.

### Flow B — Admin: publish on a service with key-auth (AC 9)
1. The admin chooses a file or URL and a Kong service on `/admin/apis`.
2. The hint under **Kong service** says what publishing does to that service (§2.3).
3. The admin selects **Import and publish**.
4. **Success:** the success alert shows, plus one warning alert per `warnings[]` item. Existing keys
   now get 403 on this API, and keys from apps created for it later get 200.

### Flow C — Admin: publish on a service with no key-auth
1. The admin chooses the service, and a warning says the API will be public (§2.3).
2. The admin can still select **Import and publish**. Import stays allowed.
3. **Success:** the success alert shows, plus the `api-public` warning. The warning stays after the
   form resets.

### Flow D — Admin: import refused (AC 9)
1. The admin submits a service that has a foreign ACL or already has a published API.
2. The server answers 422. The form keeps its values.
3. The Kong service field shows the next step, and the alert above the submit button explains why,
   ending "Nothing was published."
4. Focus moves to the Kong service field. The admin chooses another service and resubmits.

### Flow E — Developer: gateway fails during the grant (AC 8)
No new UI. A failed grant uses the existing 503 and 502 states on Create app (001 §3.6): no key
dialog, values kept and **Try again** available. A retry succeeds with the same values.

## 2. Screens

### 2.1 API reference — `/apis/[slug]`
**Purpose (unchanged):** read the API and make a real call. **Primary action (unchanged):** **Get an API key**.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API                                                            │
│ Orders API  [v2.3.0]                                        [Get an API key] │
│ Base URL  http://localhost:8000/orders  [Copy]                               │
│ ⓘ To try a request, paste a key from an app that includes this API into the  │  changed
│   apikey field under Authentication, choose an operation and select Send.    │
│   If you get a 403, select Get an API key to create an app that includes it. │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌──────────────────────┐ ┌───────────────────────────────┐ │
│ │ Scalar sidebar│ │ GET /get  [Send]     │ │ Response            403       │ │
│ │               │ │                      │ │ {                             │ │
│ │               │ │                      │ │  "type": "…/api-access-denied"│ │
│ │               │ │                      │ │  "title": "This key doesn't…  │→│  long lines
│ │               │ │                      │ │  "status": 403,               │ │  scroll inside
│ │               │ │                      │ │  "detail": "This key's app…   │→│  the panel
│ │               │ │                      │ │ }                             │ │
│ └───────────────┘ └──────────────────────┘ └───────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
375px
┌───────────────────────────────────┐
│ APIs / Orders API                 │
│ Orders API  [v2.3.0]              │
│ Base URL                          │
│ http://localhost:8000/orders [⧉]  │
│ [      Get an API key       ]     │
│ ⓘ To try a request, paste a key   │  wraps to about 7 lines
│   from an app that includes this  │
│   API into the apikey field …     │
├───────────────────────────────────┤
│ Scalar (its own mobile layout)    │
│ Response  403                     │
│ { "title": "This key doesn't h →  │  scrolls inside its own box
└───────────────────────────────────┘
```

**Why the info line changes:** Scalar has no response hook, so the 403 message can only be JSON in
its response panel. That panel can't hold a link. From reading Scalar's source (`use-codemirror`
0.13.50 has no line wrapping), long strings scroll sideways instead of wrapping; this hasn't been
checked in a browser. So the page's own info line carries the next step too, where it always wraps.
Don't add custom CSS for Scalar's private class names, because an upgrade could silently break it.

| State | What the developer sees |
| --- | --- |
| Loading, not found, document failed to load | Unchanged (001 §3.2). |
| Success: key's app includes this API | Scalar shows `200` and the upstream's body. |
| **Kong refused the key's app (new, AC 2)** | Scalar shows `403` and the `/problems/api-access-denied` body (§4.1). Gateway headers pass through. |
| Refused, though the app should have access | Same message. This covers drift until the next reconcile (up to 5 minutes), an operator's own `allow` list, and a non-portal key. The message's last sentence covers it. |
| Upstream's own 403 | Unchanged: the upstream's status, headers and body. |
| Missing, unknown or revoked key | Unchanged: Kong's `401` as-is. |
| Public API (no key-auth) | Any request reaches the upstream. No new message. |
| Proxy problems (400, 413, 429, 503, 504) | Unchanged (001 §6). |
| Empty | n/a: Scalar always has a document here. |
| No permission | n/a: the page is public. Refusal is per key, as above. |

**Static demo mode:** no change. Its reference has its own read-only notice and sends no requests,
and its `/dashboard` and `/admin` routes don't serve these screens.

### 2.2 Create app — `/dashboard/apps/new`
**Purpose and primary action:** unchanged. One addition: a hint under the legend, because access now
depends on this choice and can't be changed later (spec, Out of scope).

```
1280px (form column, 640px)                375px
│ APIs this app uses                  │    │ APIs this app uses            │
│ This app's keys work only on the    │    │ This app's keys work only on  │
│ APIs you choose here. To use another│    │ the APIs you choose here. To  │
│ API later, create another app.      │    │ use another API later, create │
│ ☑ Orders API  v2.3.0                │    │ another app.                  │
│   http://localhost:8000/orders      │    │ ☑ Orders API  v2.3.0          │
│ ☐ Sample HTTP API  v1.0.0           │    │   http://localhost:8000/orders│
```

| State | UI |
| --- | --- |
| Loading, empty (no published APIs), API list failed, validation, `404`, `409` | Unchanged (001 §3.6). The hint renders while loading and isn't shown when `EmptyState` replaces the form. |
| Error: `503`, including Kong failing or timing out during the grant (AC 8) | Unchanged: title "Gateway unavailable", the problem's `detail`, **Try again**, focus on the alert, values kept, no key dialog. |
| Error: `502`, including Kong rejecting the grant | Unchanged: title "The gateway rejected the request", then "Nothing was created. Try again, and if it keeps happening, tell the portal admin." |
| Success | Unchanged: navigate to the app, then the key dialog. |
| No permission | Unchanged: signed out goes to sign-in and keeps `?api`. |

### 2.3 Admin: APIs — `/admin/apis`
**Purpose and primary action:** unchanged (**Import and publish**). Only the content under **Kong
service** and the responses to a submit change. There are no screens for viewing groups (spec, Out of scope).

```
1280px (form column, 640px)
│ Kong service                                                                 │
│ [ orders-svc — /orders — key-auth on                                     ▾ ] │
│ Publishing limits this service to apps that include this API. Other Kong     │  Field hint, key-auth on
│ consumers lose access until you add them to its group, and Kong stops        │
│ forwarding API keys to the upstream. See the upgrade notes.                  │
│ [Refresh list]                                                               │
├ the same field with a service that has no key-auth ──────────────────────────┤
│ ┌ ⚠ This API will be public. Key-auth isn't enabled on this service, so      │  warning alert (replaces
│ │   anyone can call it without a key. To require keys, enable the key-auth   │  the 001 copy)
│ │   plugin on the service in Kong, then select Refresh list.                 │
├ the same field with a service that already has a published API ──────────────┤
│ ┌ ⚠ This service already serves /apis/orders. A Kong service can serve only  │  warning alert (replaces
│ │   one published API, so this import will be refused. Choose another one.   │  the 001 info line)
├ after a refused submit ──────────────────────────────────────────────────────┤
│ [ orders-svc — /orders — key-auth on                                     ▾ ] │  aria-invalid
│ ⚠ This service has an ACL plugin the portal didn't create. Remove it in      │  field error
│   Kong and try again, or choose another service.                             │
│ …                                                                            │
│ ┌ ⚠ Another ACL plugin applies to this service ─────────────────────────┐    │  ProblemAlert, above
│ │ An ACL plugin this portal didn't create applies to the Kong service …  │    │  the submit button
│ │ Nothing was published.                                                 │    │
│ └────────────────────────────────────────────────────────────────────────┘    │
├ after a successful submit, above the reset form ─────────────────────────────┤
│ ┌ ✓ Published Orders API. It's now in the public catalog. View Orders API ┐   │  focused
│ ┌ ⚠ Key-auth is on only some of this service's routes. …                  ┐   │  one per warnings[] item
```
375px: same order in one column, all full width. Alert text and names wrap
(`overflow-wrap: anywhere`). 001's rules for the submit button and the Published APIs cards apply.

**Which note shows under the Kong service field.** Each is decided from the chosen `GatewayService`:

| Chosen service | Note |
| --- | --- |
| None chosen | None. |
| `linkedApiSlug` set | Already-linked warning only: the import will be refused, so the others don't matter. Submit stays enabled, because the list can be stale and the server decides. |
| `keyAuth` false | Public warning. |
| `keyAuth` true | Effects hint, passed as `Field`'s `hint` so it's linked to the select. |
| No route path | The existing warning from 001, shown as well as any note above. |

`keyAuth` is also true for route-only key-auth, so `partial-key-auth` can only be reported after publishing.

**Don't reload the service list** after the two new refusals. `useResource.reload()` disables the
select while it loads, which would drop the focus that `focusInvalid` just placed there. **Refresh list**
is right there.

**Clear stale errors:** when the Kong service selection changes, clear the `gatewayServiceId` error,
and clear the `ProblemAlert` if it's one of the two new refusals. Otherwise a refusal about the old
service sits next to the new one.

| State / response | UI |
| --- | --- |
| Loading, no services, services `503`, published list empty | Unchanged (001 §3.10). |
| `422 /problems/gateway-service-has-acl` (AC 9) | Field error and `ProblemAlert` (§4.2). Values kept. Focus on the Kong service select. |
| `422 /problems/gateway-service-already-linked` | Field error and `ProblemAlert` (§4.2). Values kept. Focus on the Kong service select. |
| Other import errors, including `502` and `503` | Unchanged (001 §3.10). |
| Success, no warnings | Unchanged: success alert, focused; form resets. |
| Success with `warnings` | Success alert, focused, then one warning alert per item with `message` verbatim. Render by array order, not by `code`, so a future code still shows. They stay until the next submit clears them with the success alert. |
| No permission | Unchanged: signed out goes to sign-in; signed-in non-admin gets the 404 page. |

## 3. Components
All exist already. Don't add any.

| Component | Use here |
| --- | --- |
| `Field` | Effects hint (`hint`), refusals (`error`) on Kong service. |
| `ProblemAlert` | Refusals. It already renders `problem.title`, and `importMessage()` already renders `detail` and "Nothing was published." |
| `.alert.warning` | Public warning, already-linked warning, post-publish warnings. Colours come from `--portal-warning` and `--portal-warning-subtle`; meaning also comes from the ⚠ icon and the words. |
| `.alert` (info) | API reference info line. |
| `.hint` | Create-app hint. |

## 4. Copy
Use these strings exactly. "Server" strings go in the problem or warning; "Portal" strings go in the
component. `{…}` is filled in at runtime.

### 4.1 Try-it refusal (server, JSO-263)
| Field | Value |
| --- | --- |
| `type` | `/problems/api-access-denied` |
| `title` | This key doesn't have access to this API |
| `status` | 403 |
| `detail` | This key's app doesn't have access to this API. Select Get an API key on this page, create an app that includes this API, and send the request with the new key. If this key's app should already have access, tell the portal admin. |

The string is fixed: it doesn't name the app or the API, because the proxy doesn't know the app and
the developer is already on the API's page. "Get an API key" matches the button's label exactly; if
that label changes, change this too.

### 4.2 Import refusals
| Problem | `title` (server) | `detail` (server) | Field error on Kong service (portal) |
| --- | --- | --- | --- |
| `gateway-service-has-acl` | Another ACL plugin applies to this service | An ACL plugin this portal didn't create applies to the Kong service {serviceName}, either on the service, on one of its routes or globally. The portal can't control access while it's there, so it hasn't changed this service's plugins. | This service has an ACL plugin the portal didn't create. Remove it in Kong and try again, or choose another service. |
| `gateway-service-already-linked` | This service already has a published API | This Kong service already serves /apis/{slug}. A Kong service can serve only one published API, because access is granted per service. | This service already serves a published API. Choose another service. |

The field error is static, because `linkedApiSlug` in the list may be stale. `ProblemAlert` adds
"Nothing was published." as its last line, so don't put that in `detail`.

### 4.3 Import warnings (server, JSO-262; `warnings[].message`)
| `code` | `message` |
| --- | --- |
| `api-public` | This API is public. Key-auth isn't enabled on this service, so anyone can call it without a key. To require keys, enable the key-auth plugin on the service in Kong. |
| `partial-key-auth` | Key-auth is on only some of this service's routes. Keys are checked on those routes, and the other routes stay open to anyone. To protect them, enable key-auth on the service in Kong. |

### 4.4 Portal copy
| Where | Replaces | Text |
| --- | --- | --- |
| API reference info line | "To try a request, paste your API key…" | ⓘ To try a request, paste a key from an app that includes this API into the apikey field under Authentication, choose an operation and select Send. If you get a 403, select Get an API key to create an app that includes it. |
| Create app, under the legend | New | This app's keys work only on the APIs you choose here. To use another API later, create another app. |
| Kong service hint, `keyAuth` true | New | Publishing limits this service to apps that include this API. Other Kong consumers lose access until you add them to its group, and Kong stops forwarding API keys to the upstream. See the upgrade notes. |
| Warning, `keyAuth` false | "Key-auth isn't enabled… Kong won't check them…" | ⚠ This API will be public. Key-auth isn't enabled on this service, so anyone can call it without a key. To require keys, enable the key-auth plugin on the service in Kong, then select Refresh list. |
| Warning, `linkedApiSlug` set | "This service already serves /apis/{slug}." | ⚠ This service already serves /apis/{linkedApiSlug}. A Kong service can serve only one published API, so this import will be refused. Choose another one. |

The hint doesn't print the `portal-svc-<serviceId>` group name: names are derived inside the Kong
adapter (ADR 0005, decision 9), and the frontend shouldn't derive them too. The upgrade notes
(JSO-265) explain how to add a consumer.

## 5. Accessibility (WCAG 2.2 AA)
- **Keyboard, Flow A:** breadcrumb → **Copy** → **Get an API key** → Scalar (auth input, **Send**). The
  response scroller in Scalar is focusable (`tabindex="0"`), so arrow keys reach the end of long
  lines, and it has its own copy button. Shift+Tab back to **Get an API key**, or reach it from the page top.
- **Keyboard, Flow D:** refused submit → focus on the Kong service select → choose another service →
  Tab through to **Import and publish**. The alert and field error are visible at the same time.
- **Focus order:** the `ProblemAlert`'s own focus runs first, then `focusInvalid` moves focus to the
  select. The alert keeps `role="alert"`, so it's still announced. Don't change this order.
- **Labels:** the select's `aria-describedby` points to the error if there is one, otherwise the hint.
  Give the Create-app hint an `id` and include it in the fieldset's `aria-describedby`, together with
  `api-error` when that shows. Pre-submit warning alerts sit directly after the field and aren't live
  regions, because they follow the admin's own selection.
- **Post-publish warnings:** give each warning alert an `id` and list them in the success alert's
  `aria-describedby`, so they're read when focus lands there. Don't add `role="alert"` to them, or
  they're announced twice.
- **Contrast:** no new colour pairs. Warning 6.8:1 and error 5.9:1 on their subtle backgrounds, as in
  `tokens.md`. No state depends on colour alone. Theming uses only the existing CSS variables.
- **Reflow:** at 320px nothing on the portal's own surfaces scrolls sideways. Scalar's response panel is
  the existing exception (001 §7), which is why §2.1 repeats the next step in the info line.
- **Plain language:** no message blames the developer. Developer messages use no Kong vocabulary.

## 6. Responsive behaviour
| Element | 375px | 1280px |
| --- | --- | --- |
| API reference info line | Full width, wraps | Full width in the page container, 2–3 lines |
| 403 in Scalar | Scalar's single column; long JSON lines scroll inside the panel | Scalar's request and response panels; long JSON lines scroll inside the panel |
| Create-app hint | Full width, wraps | In the 640px form column |
| Kong service hint and warnings | Full width, wrap; long names break with `overflow-wrap: anywhere` | In the 640px form column |
| Refusal `ProblemAlert` | Full width, above the full-width submit button | In the 640px form column, above the submit button |
| Post-publish alerts | Stacked, full width | Stacked, at the page content width |

## 7. Notes for frontend, backend and QA
- **Linear:** JSO-263 (try-it copy), JSO-262 (import problems and warnings), JSO-266 and JSO-267 (admin)
  cover most of this. **JSO-276** covers the three additions the spec's task list doesn't have: the
  API reference info line, the Create-app hint and the Kong service hint.
- **Tests:** existing tests don't assert the replaced strings, so nothing needs rewording. Use roles and
  accessible names, as in 001 §9.
- **AC 2 (JSO-269):** assert the proxy's response has status 403, the `api-access-denied` type and the
  exact `title` and `detail`, and that the `title` text is visible in Scalar's response panel. Check an
  upstream 403 stays unchanged.
- **User-tester (JSO-253):** run Flow A at 1280px and 375px and judge whether the message can really be
  read in Scalar's panel. If lines don't wrap as expected or the panel is awkward, file a bug. A
  browser hasn't checked this yet (§2.1).
- **Propagation:** straight after a publish, a brand-new key can get this 403 for a few seconds while
  Kong applies the plugin change (spec, Risks). Keep the QA polling from the spec's risk table.
- **New API versions:** the already-linked refusal doesn't mention versions, because nothing can be
  promised until spec 012. An admin who wants a second version under a new slug needs a second Kong
  service for now.
