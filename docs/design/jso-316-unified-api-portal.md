# JSO-316 — Unified API portal UX specification

Issue: [JSO-316](https://linear.app/zebraprojects/issue/JSO-316/unified-api-portal-uiux-wireframes)

This is the implementation-ready north-star for the portal's developer and administrator
experiences. It consolidates the shipped 001/004 behavior and the planned gateway, access-request,
and synchronization work into one information architecture. A feature spec may implement only a
slice, but it must preserve the navigation, language, responsive rules, and state behavior here.

The interactive concept named in JSO-316 (`work/api-portal-wireframes.html`) is not present in this
worktree. Existing product, design, and implementation artifacts are therefore the source of truth:

- [001 Kong quickstart UX](001-kong-quickstart-slice.md)
- [004 per-API access-control UX](004-per-api-access-control.md)
- [design tokens](tokens.md)
- the current portal components and the product roadmap

Where this document differs from a shipped screen, the feature spec that introduces the change
must name the migration. Until then, the shipped 001/004 behavior remains authoritative.

## 1. Experience principles

1. **A developer reaches a successful request quickly.** The catalog, reference, access action,
   credential, and Try it console form one visible journey. No screen leaves the next step implicit.
2. **One object, one name.** Developers see APIs, apps, access, and credentials. Kong terms such as
   consumer, ACL, service, route, and plugin appear only in administrator diagnostics.
3. **Status includes cause and next action.** Every warning or failure says what is affected, what
   was or was not changed, and what the person can do next.
4. **Secrets are moments, not records.** Full credentials appear only at creation or rotation, in a
   blocking reveal dialog. Every later view uses a non-sensitive hint.
5. **The portal never implies gateway state it has not observed.** Last-successful-sync time and
   stale state are explicit. "Healthy" means a recent, successful check—not merely saved settings.
6. **Progressive disclosure keeps the common path short.** Advanced import options, gateway
   diagnostics, and review history are available without crowding the primary action.
7. **Responsive means reprioritized.** Mobile preserves every action and status, but converts wide
   tables to cards and moves secondary context below the primary task.

## 2. People, objects, and language

| Person       | Primary goal                                                  | Primary area        |
| ------------ | ------------------------------------------------------------- | ------------------- |
| Visitor      | Decide whether an API is useful                               | APIs, API reference |
| Developer    | Get access, create an app, make a request, manage credentials | APIs, My apps       |
| Portal admin | Connect gateways, publish APIs, review access, diagnose drift | Admin               |

| Portal object         | Developer wording    | Admin wording | Never expose to developers           |
| --------------------- | -------------------- | ------------- | ------------------------------------ |
| Published API         | API                  | API           | Kong service/route IDs               |
| Subscription or grant | Access               | Access grant  | ACL group/membership                 |
| App-owned secret      | Credential / API key | Credential    | Full secret after reveal             |
| Gateway connection    | n/a                  | Gateway       | Admin token, ciphertext, raw headers |
| Reconcile run         | n/a                  | Sync          | Queue/job implementation details     |

Use **My apps**, not Dashboard, in visible navigation. Existing `/dashboard` routes remain valid.
Use **API key** when the credential kind is known; use **credential** in mixed-kind lists that may
later include OAuth clients. A plan is a free access tier, never a paid subscription.

## 3. Information architecture

### 3.1 Global navigation

```
Desktop, signed out
┌────────────────────────────────────────────────────────────────────────────┐
│ ◆ Developer Portal       APIs                         Sign in   [Sign up]  │
└────────────────────────────────────────────────────────────────────────────┘

Desktop, developer
┌────────────────────────────────────────────────────────────────────────────┐
│ ◆ Developer Portal       APIs   My apps                    ana@ex.com ▾   │
└────────────────────────────────────────────────────────────────────────────┘

Desktop, admin
┌────────────────────────────────────────────────────────────────────────────┐
│ ◆ Developer Portal       APIs   My apps   Admin             ana@ex.com ▾  │
└────────────────────────────────────────────────────────────────────────────┘

Mobile
┌───────────────────────────────────┐
│ ◆ Developer Portal          [≡]  │
└───────────────────────────────────┘
```

- Header order is stable across roles. Role-dependent links are omitted, never disabled.
- Current top-level destination uses `aria-current="page"` and the existing primary underline.
- The mobile menu is a right-side sheet. Focus enters on its close button, is trapped inside, and
  returns to the menu button. Selecting a destination closes it before navigation.
- The account menu contains email, **Account settings**, and **Sign out**. Admin identity is not
  expressed only through this menu; **Admin** is a top-level destination.
- A **Skip to content** link is the first focusable element.

### 3.2 Admin navigation

Admin routes share a local navigation below the global header:

```
Admin
[Overview] [Gateways] [APIs] [Access requests]
```

At 768 px and wider this is a horizontal tab list. Below 768 px it is a labeled **Admin section**
select placed before the page heading. Native select change navigates immediately; the selected
option matches the current route. Do not use a horizontally scrolling tab row on mobile.

### 3.3 Route map

| Route                         | Page                         | Access                          | Primary action                    |
| ----------------------------- | ---------------------------- | ------------------------------- | --------------------------------- |
| `/`                           | API catalog                  | Public                          | Open an API                       |
| `/apis/{slug}`                | API reference and Try it     | Public or visibility-controlled | Get access / Get an API key       |
| `/sign-up`, `/sign-in`        | Authentication               | Signed out                      | Create account / Sign in          |
| `/dashboard`                  | My apps                      | Developer                       | Create app                        |
| `/dashboard/apps/new`         | Create app and choose access | Developer                       | Create app or Request access      |
| `/dashboard/apps/{id}`        | App, access, credentials     | Owner/team member               | Create credential                 |
| `/admin`                      | Admin overview               | Admin                           | Resolve the highest-priority item |
| `/admin/gateways`             | Gateway connections          | Admin                           | Connect gateway                   |
| `/admin/gateways/{id}`        | Gateway health and sync      | Admin                           | Test connection / Sync now        |
| `/admin/apis`                 | Published APIs and import    | Admin                           | Import API                        |
| `/admin/access-requests`      | Review queue                 | Admin/reviewer                  | Review a request                  |
| `/admin/access-requests/{id}` | Request decision             | Admin/reviewer                  | Approve or deny                   |

Protected-route and not-found behavior stays as 001 specifies: signed out goes through sign-in with
a same-origin `next`; a signed-in person without permission receives the generic 404 page.

## 4. Primary journeys

### 4.1 Browse to first successful request

1. A visitor opens the catalog and selects an API card.
2. The API page shows overview, access requirement, base URL, and the reference.
3. The visitor selects **Get an API key**. Sign-up/sign-in preserves the API destination.
4. **Create app** opens with the API selected. For immediate access, submission creates the app and
   opens the one-time key reveal. For approval access, it creates the app plus a pending request.
5. Immediate access returns to the app page. **Try this API** opens the reference.
6. The developer enters the key in Scalar's Authentication area and selects **Send**.
7. A successful response is visible in the response panel. The page-level instruction still tells
   the developer how to recover from 401, 403, and 429 because Scalar cannot host portal actions.

Success measure: the person can describe the next step at every screen without outside docs.

### 4.2 Request access that needs approval

1. The developer selects an approval-based access tier on the API page or Create app screen.
2. The request form shows the chosen API/tier, app, intended use, and any admin-defined questions.
3. Submission returns to the app with a **Pending review** status and expected next step.
4. An admin opens **Access requests**, filters or opens the oldest pending request, and reviews its
   app, requester, requested APIs/tier, answers, and risk context.
5. **Approve** grants access and records the reviewer. **Deny** requires a reason shown to the
   developer. Closing the dialog without confirming changes nothing.
6. The app page updates to **Active** or **Denied**. Denied access offers **Request again** only when
   policy allows it; the previous decision remains in history.

### 4.3 Create, rotate, and revoke a credential

1. From an app, the developer selects **Create credential** or **Rotate**.
2. A confirmation describes affected APIs and whether an old credential remains active.
3. The server completes the gateway mutation before the reveal opens.
4. The blocking reveal dialog shows the full secret once and defaults focus to **Copy**.
5. After **I've saved it**, memory is cleared and focus returns to the new credential row.
6. Revocation uses a destructive confirmation with **Cancel** as initial focus. On failure, the
   dialog remains open and explicitly says the credential is still active.

### 4.4 Diagnose and recover a gateway

1. Admin overview shows **Action needed** when a connection check or sync is failing/stale.
2. The admin opens the gateway detail page. Configuration values are masked; health, last check,
   last successful sync, affected APIs, and the safe error summary are visible.
3. **Test connection** performs a read-only check. **Sync now** starts reconciliation and is disabled
   while another sync is running.
4. Success updates the same status region without a full-page reload. Failure preserves all saved
   configuration and says what to check. Secrets are never re-rendered.

### 4.5 Review synchronization drift

1. A sync result groups differences into **Repaired**, **Needs attention**, and **Unchanged**.
2. Automatically safe, idempotent repairs are listed as completed actions.
3. Destructive or ownership-ambiguous differences are not repaired. Each row explains the portal
   object, gateway object, consequence, and next action.
4. Acknowledging a finding hides it from the default view but does not claim it is resolved.

## 5. Shared shell and state behavior

- Content width, gutters, type, colors, radius, shadow, and motion use `tokens.md`.
- Each page has one `h1`; each section uses `h2`; card headings do not skip levels.
- Page actions sit right of the heading at desktop and become full-width below the heading on mobile.
- Loading uses shape-matched skeletons. Preserve the heading and stable navigation so orientation is
  never replaced by a spinner.
- Refreshable region failures stay inside the region with **Try again**. Page-level failures use the
  existing error boundary. A successful retry replaces the error in place.
- Inline validation appears beside the field and a summary alert appears only when multiple fields
  fail or the server returns a non-field problem. Focus moves to the first invalid field.
- Success after a mutation uses a focused `role="status"` region at the top of the changed section.
  Toasts confirm secondary actions such as copying; they never carry essential instructions.
- `429` actions keep entered values and show a Retry-After countdown when present.
- Dates use the viewer's locale for display and retain an ISO value in `<time datetime>`.
- Status always has icon + text. Color is supplementary.

### 5.1 Complete screen-state matrix

The shared behavior above applies first. This matrix supplies the screen-specific content so an
implementation does not need to invent a missing empty, error, or stale state.

| Screen          | Loading                                                  | Empty                                                                         | Error or stale                                                                                                                   | Permission                                              |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Catalog         | Heading, controls when implemented, three card skeletons | "No APIs yet" variants from 001                                               | "We couldn't load the APIs." + **Try again**                                                                                     | Public; restricted APIs are omitted                     |
| API reference   | Metadata skeleton and reference rectangle                | Not applicable; missing slug uses API not found                               | Existing reference-load retry; stale access says "Access status couldn't be confirmed" without changing the last confirmed label | Public unless visibility policy hides it; hidden is 404 |
| My apps         | Heading and row/card skeletons                           | **Create your first app**                                                     | "We couldn't load your apps." + **Try again**                                                                                    | Signed out redirects; another owner's objects are 404   |
| Create app      | Stable heading and form skeleton; submit unavailable     | "No APIs to use yet" from 001                                                 | Field errors, 502/503, partial request failure as §6.4                                                                           | Signed out redirects                                    |
| App detail      | Breadcrumb, heading and section skeletons                | No access and no credentials are independent guidance states                  | "We couldn't load this app." + **Try again**; stale gateway observation keeps last confirmed statuses                            | Signed out redirects; non-owner is 404                  |
| Admin overview  | Three summary-card skeletons                             | **Connect your first gateway**                                                | Each failed summary retries independently; partial results remain                                                                | Non-admin is 404                                        |
| Gateways        | Heading and row/card skeletons                           | **Connect your first gateway**                                                | "We couldn't load the gateways." + **Try again**                                                                                 | Non-admin is 404                                        |
| Gateway detail  | Heading plus connection/sync panel skeletons             | No findings: "No sync findings."                                              | Load failure retries; unavailable and stale are explicit statuses, not a page error                                              | Non-admin is 404                                        |
| Admin APIs      | Import and list skeletons from 001                       | "Nothing published yet. Imported APIs appear here and in the public catalog." | Import problems stay in the form; list failure retries without clearing form values                                              | Non-admin is 404                                        |
| Access requests | Heading, filters, five row/card skeletons                | **You're all caught up** or filtered **No matching requests**                 | "We couldn't load access requests." + **Try again**; filters remain                                                              | Non-reviewer is 404                                     |
| Request detail  | Breadcrumb, identity and answer skeletons                | Missing/canceled-by-deletion is generic request not found                     | Decision failure keeps answers and status; concurrent decision refreshes to recorded outcome                                     | Non-reviewer is 404                                     |

Sign-in and sign-up retain all 001 validation, pending, transport-failure, duplicate-account, and
safe-return-path behavior; JSO-316 adds no unresolved authentication interaction.

## 6. Developer screens

### 6.1 API catalog — `/`

**Purpose:** find the right API and understand the access path. **Primary action:** open an API.

```
1280 px
┌────────────────────────────────────────────────────────────────────────────┐
│ APIs                                                        Search [____] │
│ Explore APIs, read the reference and make a request.                      │
│                                                                            │
│ [All] [Available now] [Approval required]                 8 APIs           │
│                                                                            │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────────┐ │
│ │ Orders API      v2.3 │ │ Customers API  v1.4 │ │ Events API     v3.0 │ │
│ │ Order lifecycle…     │ │ Customer profiles…  │ │ Webhook events…     │ │
│ │ ● Available now      │ │ ◷ Approval required │ │ ● Available now     │ │
│ │ View API →           │ │ View API →           │ │ View API →          │ │
│ └──────────────────────┘ └──────────────────────┘ └─────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘

375 px: heading, full-width search, filter select, result count, one card per row.
```

Each card is one link and contains title, compact version badge, plain-text description clamped to
three lines, and access label. Do not put a secondary button inside a linked card. Search covers API
title, description, tags, operation summary, and path when search is implemented; until then omit the
control entirely rather than render a non-working search.

| State             | UI and exact copy                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Loading           | Heading and filters remain; three card skeletons.                                                    |
| Empty portal      | Existing 001 visitor/admin variants.                                                                 |
| No search results | **No APIs match** — "Try a different search or clear the filters." **Clear filters**.                |
| Error             | "We couldn't load the APIs." **Try again**.                                                          |
| Restricted API    | Omitted when person lacks catalog visibility; never show a locked placeholder that reveals its name. |

### 6.2 API reference and Try it — `/apis/{slug}`

**Purpose:** evaluate the API, obtain access, and make a call. **Primary action:** access action.

```
1280 px
┌────────────────────────────────────────────────────────────────────────────┐
│ APIs / Orders API                                                         │
│ Orders API  [v2.3] [Approval required]       [Request access]             │
│ Order creation, status and fulfillment.                                   │
│ Base URL  https://api.example.com/orders                         [Copy]    │
│                                                                            │
│ [Overview] [API reference] [Access]                                       │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ ⓘ To try a request, open Authentication, paste a key from an app that │ │
│ │   has access to Orders API, choose an operation and select Send.       │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────┬────────────────────────┬────────────────────────────────┐ │
│ │ Operations   │ Request                │ Response                       │ │
│ │ GET /orders  │ Headers / body  [Send] │ 200                            │ │
│ └──────────────┴────────────────────────┴────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘

375 px: title and metadata, full-width action, tabs, instruction, then Scalar's mobile layout.
```

The tabs are page anchors or route-preserving tabs; activating one must not discard Scalar request
state. If Scalar cannot preserve state across unmount, keep it mounted and scroll to sections.

Access-action variants:

| Person/state                             | Action                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| Signed out                               | **Get an API key** → sign-up with same-origin return path       |
| Signed in, no app access, immediate tier | **Get an API key** → create app with API preselected            |
| Signed in, approval tier                 | **Request access** → choose/create app then request             |
| Has one eligible app                     | **Open in {app name}** → app detail                             |
| Has several eligible apps                | **View your apps** → app list filtered/highlighted for this API |
| Public API                               | No access CTA; show **No key required** status                  |

Error and document-load states stay as 001/004. A 401 instruction says "Check that the key is
active and pasted into the correct authentication field." A portal access-denied 403 ends with
"Get access for this API, then try again." A 429 says "This app has reached its current limit. Wait
and try again, or review its access tier." Upstream response bodies remain unchanged unless the
server contract identifies a portal-generated problem.

### 6.3 My apps — `/dashboard`

**Purpose:** resume work on an app and see which items need attention. **Primary action:** create app.

Desktop uses the existing table with columns **Name**, **Access**, **Credentials**, **Updated**.
Access summarizes `n active`, `n pending`, or **No API access**. Credentials summarizes active count
without exposing hints. A row is one destination; do not add credential mutations to this overview.

At mobile widths, each app is a card with name, access summary, credential summary, and **Open app**.
Pending or denied access appears as a text badge beside the access summary.

| State         | UI                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Empty         | Existing **Create your first app** empty state.                                                   |
| Results       | Newest updated first; the user may sort by name or updated date when more than 20 exist.          |
| Error         | "We couldn't load your apps." **Try again**.                                                      |
| Session ended | Preserve the current path through sign-in; do not reveal cached app names on the signed-out page. |

### 6.4 Create app and request access — `/dashboard/apps/new`

**Purpose:** create the durable app identity and establish API access. **Primary action:** create app.

```
┌──────────────────────────────────────────────────────────────────┐
│ My apps / Create app                                            │
│ Create app                                                      │
│ An app owns access and credentials for one integration.         │
│                                                                  │
│ App name [____________________________________________]          │
│ Description [__________________________________________]         │
│                                                                  │
│ APIs this app uses                                              │
│ Keys work only with APIs selected here.                         │
│ ☑ Orders API  [Available now]                                   │
│ ☐ Partners API [Approval required]                              │
│                                                                  │
│ Intended use (shown only when a selected tier requires it)      │
│ [______________________________________________________]         │
│                                                                  │
│ [Create app]                                                    │
└──────────────────────────────────────────────────────────────────┘
```

- Preserve `?api={slug}` preselection and focus the app-name field, not the preselected checkbox.
- When all selected APIs grant immediate access, submit label is **Create app** and success opens the
  key reveal dialog.
- When any selected API needs approval, label is **Create app and request access**. The confirmation
  above the button says which access is immediate and which remains pending. Create no credential
  until at least one selected API is active.
- If an existing app can request the API, the API page first offers that app; this screen does not
  duplicate app names silently. A duplicate name error retains every selection and answer.
- API choices remain semantic checkboxes grouped by `fieldset`/`legend`; status and base URL are
  descriptions. The entire option label is clickable.

All shipped validation, 502, 503, empty, and retry behavior remains as 001/004. If app creation
succeeds but an access request fails, show the created app and an inline **Request access again**
action; never retry app creation and risk a duplicate.

### 6.5 App detail, access, and credentials — `/dashboard/apps/{id}`

**Purpose:** manage an integration without exposing secrets. **Primary action:** context-dependent.

```
1280 px
┌────────────────────────────────────────────────────────────────────────────┐
│ My apps / Fulfillment worker                                              │
│ Fulfillment worker                                     [Create credential]│
│ Sends packed-order updates.                              Updated 7 Nov 2026 │
│                                                                            │
│ Access                                                                    │
│ ┌ Orders API ─ Active ─ Standard ──────────────── [Try this API]          │
│ ├ Partners API ─ Pending review ─ Submitted 7 Nov ───── [View request]    │
│ └ Returns API ─ Denied ─ "Use a service account…" ───── [Request again]  │
│                                                                            │
│ Credentials                                                              │
│ Keys are shown once, when they're created.                                │
│ ┌ …9fQa  API key  ● Active  Created 7 Nov       [Rotate] [Revoke]        │
│ └ …x7Lm  API key  ○ Revoked Revoked 6 Nov                                │
└────────────────────────────────────────────────────────────────────────────┘
```

Access statuses are **Active**, **Pending review**, **Denied**, **Suspended**, and **Expired**.
Suspended and expired states explain whether a new request is allowed. Decision reasons are plain
text, sanitized, and never interpreted as Markdown or instructions.

Credential rules:

- Lists show only type, non-sensitive hint, status, created date, expiry if any, and last-used time if
  available. Never show a copy control for a stored hint.
- **Create credential** is available only when at least one access grant can use it.
- **Rotate** explains whether the gateway supports overlap. If overlap is supported, default to a
  named grace period. If not, state "The current key will stop working as soon as the new key is
  created." Do not promise zero downtime when the adapter cannot provide it.
- Create/rotate success uses the existing blocking `KeyRevealDialog`. Full secrets never enter URLs,
  logs, analytics, browser storage, DOM attributes, toast text, error reports, or clipboard previews.
- Revoke confirmation lists the hint and affected APIs. Gateway failure leaves status **Active**.
- A stale gateway state adds **Status last confirmed {time}** and links to contact guidance; it does
  not relabel a credential as revoked or active based on guesswork.

On mobile, each access grant and credential is a card. Destructive actions follow non-destructive
actions in DOM order, but the destructive confirm button appears first in the stacked confirmation
footer so Cancel remains last and nearest the safe edge; initial focus is still **Cancel**.

## 7. Administrator screens

### 7.1 Admin overview — `/admin`

**Purpose:** show operational risk and route the admin to one useful action.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Admin overview                                                            │
│                                                                            │
│ ┌ Gateway health ─ Action needed ┐ ┌ Access requests ─ 4 pending         ┐│
│ │ Production Kong               │ │ Oldest waiting 2 days               ││
│ │ Last check failed 4 min ago   │ │ [Review requests]                   ││
│ │ [Open gateway]                │ └──────────────────────────────────────┘│
│ └───────────────────────────────┘ ┌ APIs ─ 12 published                  ┐│
│                                   │ 1 sync finding needs attention      ││
│                                   │ [Manage APIs]                       ││
│                                   └──────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

Cards are ordered by severity then stable object order: action needed, pending work, healthy. A
summary card links to its source page; it does not host a repair or approval mutation. If all systems
are healthy, the first card says **All gateways healthy** and includes the latest check time.

| State         | UI                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Loading       | Three summary-card skeletons.                                                                   |
| No gateway    | Setup empty state: **Connect your first gateway** and what becomes possible afterward.          |
| Partial data  | Render available cards; failed card says which summary could not load and offers **Try again**. |
| No permission | Generic 404 behavior.                                                                           |

### 7.2 Gateways — `/admin/gateways`

**Purpose:** understand connection status and add a gateway. **Primary action:** connect gateway.

Desktop table columns: **Name**, **Type**, **Status**, **Last checked**, **Last successful sync**,
**APIs**. Name links to detail. Status values:

- **Healthy** — last check succeeded inside the configured freshness window.
- **Checking** — a current read-only test is running.
- **Degraded** — reachable, but discovery or sync has findings that affect some operations.
- **Unavailable** — the latest connection check failed.
- **Not checked** — saved but no completed check exists.

Mobile renders one connection card per row. **Connect gateway** opens the gateway setup flow; a
feature spec decides whether it is a page or dialog, but the form order is Name → Type → Admin URL →
public proxy URL → credential. The credential field says **Admin token** only for an adapter that
uses one. Editing shows an empty replacement field: never prefill a saved secret or a mask that can
be submitted accidentally.

### 7.3 Gateway detail and synchronization — `/admin/gateways/{id}`

**Purpose:** test, monitor, and synchronize one connection without exposing admin credentials.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Gateways / Production Kong                                               │
│ Production Kong  [Unavailable]                   [Test connection] [Edit]│
│ Kong · https://kong-admin.internal                                       │
│                                                                            │
│ ┌ Connection ─────────────────┐ ┌ Synchronization ──────────────────────┐ │
│ │ Last checked 4 minutes ago  │ │ Last success 12 minutes ago          │ │
│ │ Couldn't connect within 5 s │ │ Next automatic sync in 3 minutes    │ │
│ │ Saved settings unchanged    │ │                         [Sync now]    │ │
│ └─────────────────────────────┘ └────────────────────────────────────────┘ │
│                                                                            │
│ Sync findings                                                             │
│ [Needs attention 1] [Repaired 2] [All 14]                                │
│ ⚠ orders-api · Portal ACL plugin missing · Access may fail   [Details]   │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Test connection** is read-only and reports capability discovery. It does not save form edits,
  publish APIs, create consumers, or reconcile drift.
- **Sync now** starts the adapter's idempotent reconcile. The button becomes **Syncing…** and the
  status is announced politely. Repeat activation cannot start a second run.
- A running sync survives navigation. Returning to the page resumes status polling.
- Result summary uses counts and an expandable list. Never stream raw gateway responses, tokens,
  stack traces, internal network topology beyond already-saved URLs, or headers into the page.
- **Edit** never displays the stored token. Saving an empty replacement retains the current secret;
  **Replace admin token** reveals the new-secret field and explains the effect.
- Destructive **Remove gateway** belongs in a Danger zone after all operational content. It is
  disabled while published APIs or active credentials depend on the gateway and links to the
  blocking objects. Do not offer a force-delete UI.

Connection failure copy: **Couldn't reach this gateway** — "The saved settings were not changed.
Check the admin URL, network access, and credential, then test again." Authentication failure copy:
**The gateway rejected the credential** — "Replace the admin credential or update its permissions,
then test again." Never echo a gateway response that may contain secrets.

### 7.4 Admin APIs — `/admin/apis`

The shipped import form and error behavior in 001/004 remain authoritative. The unified layout adds
a compact published-API toolbar and sync state without merging operational status into publication:

```
APIs                                                   [Import API]
[Search APIs________________] [Gateway: All ▾] [Sync status: All ▾]

Title        Gateway          Publication   Sync             Updated
Orders API   Production Kong  Published     ● In sync        7 Nov
Partners API Production Kong  Published     ⚠ Needs attention 6 Nov
```

Below 768 px, filters stack and rows become cards. Import may remain inline until a feature spec
moves it to `/admin/apis/new`; if moved, preserve all 001/004 field order, validation, focus, and
copy. **Published** describes portal visibility. **In sync** describes last observed gateway state.
Never collapse them into a single status.

Sync statuses: **In sync**, **Syncing**, **Needs attention**, **Unknown**. **Unknown** is used when no
successful sync exists or the observation is stale. An API row opens its management detail when that
screen exists; before then, **Needs attention** links to the gateway's filtered findings.

### 7.5 Access requests queue — `/admin/access-requests`

**Purpose:** find and review requests fairly and quickly. **Primary action:** open oldest pending.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Access requests                                      4 pending            │
│ [Status: Pending ▾] [API: All ▾] [Search requester or app________]        │
│                                                                            │
│ Requester       App                  Access                  Waiting       │
│ Ana Rivera      Fulfillment worker   Partners · Standard     2 days   →   │
│ Dev Team        Reporting            Orders · High volume    3 hours  →   │
└────────────────────────────────────────────────────────────────────────────┘
```

- Default is pending, oldest first. This reduces invisible queue starvation.
- Filters are reflected in the query string so refresh/back preserves work. Search is debounced and
  has an explicit label; placeholder text is not the label.
- Status filters: Pending, Approved, Denied, Canceled, All. Counts are text, not badges alone.
- Queue rows contain no approve/deny buttons; decisions require the full request context.
- Empty filtered result: **No matching requests** + **Clear filters**. Empty default queue:
  **You're all caught up** — "There are no access requests waiting for review."

### 7.6 Access request detail — `/admin/access-requests/{id}`

**Purpose:** make and record an informed decision. **Primary action:** approve or deny.

The page shows request status, requested time, requester identity, app name/description, APIs and
tier, intended-use answers, current app access, and decision history. It does not show credentials,
gateway consumer IDs, or unrelated account data.

**Approve** opens a confirmation summarizing the access that will be granted. **Approve access** is
the primary confirm. **Deny** opens a dialog with required **Reason for developer** textarea and
optional internal note only if the data model can enforce its visibility. The confirm is **Deny
request** and destructive. Initial focus is the reason field; closing changes nothing.

Concurrent decisions return a non-destructive stale-state alert: "This request was already decided
by {reviewer} on {date}." Refresh the visible state and disable both actions. Gateway failure on
approval says "Access was not granted. The request is still pending." Denial is a portal-only state
unless its feature contract says otherwise; never claim gateway changes without confirmation.

On success, focus moves to a status summary that names the decision and next destination. Actions
become history. **Review next pending request** is offered when one exists; otherwise **Back to
requests**.

## 8. Secret-safe interaction contract

These rules are acceptance criteria for every credential or gateway-admin implementation:

1. Full developer credentials are returned only by create/rotate responses and live only in the
   reveal component's in-memory state.
2. The reveal is an `alertdialog` with no backdrop or Escape dismissal. **I've saved it** is the only
   exit; reload/navigation may lose the secret and the warning says so.
3. Copy success announces "API key copied." Copy failure selects visible text and gives keyboard
   instructions. No secret appears in a toast or live-region string.
4. After dismissal, clear the secret value and focus the non-sensitive credential hint row.
5. Gateway credentials are write-only. Read responses expose a boolean such as
   `credentialConfigured`, never a secret, reversible mask, prefix, suffix, or ciphertext.
6. Errors shown to people use approved portal copy. Raw adapter bodies, request headers, URLs with
   query credentials, and stack traces stay out of the DOM and client logs.
7. Analytics record only action name, result category, adapter kind, and non-sensitive object ID if
   policy allows it. Never record form values from secret fields.

## 9. Responsive specification

| Width         | Navigation                         | Layout                                              | Data collections                               | Actions                            |
| ------------- | ---------------------------------- | --------------------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `<640 px`     | Mobile sheet; admin section select | One column, 16 px gutter                            | Cards; no horizontal page scroll               | Full-width; one per row in dialogs |
| `640–767 px`  | Mobile sheet                       | One or two columns where cards remain ≥280 px       | Cards or compact table only when all cells fit | May share a row when labels fit    |
| `768–1023 px` | Desktop global nav; admin tabs     | Two-column summaries; 32 px gutter                  | Tables may scroll inside labeled region only   | Page actions remain in heading     |
| `≥1024 px`    | Full navigation                    | Up to three catalog cards; split operational panels | Full tables                                    | Inline action groups               |

- Reflow at 200% zoom must not create horizontal page scrolling at a 1280 px viewport.
- Long API titles, app names, emails, URLs, reasons, and gateway error summaries wrap. Monospace
  values use `overflow-wrap:anywhere`.
- Table-to-card transforms preserve reading order: identity, status, metadata, actions.
- Scalar owns its internal responsive behavior. Portal CSS must not target undocumented Scalar class
  names. The portal header/action area remains usable independently of Scalar.
- Sticky elements may include the site header and Scalar's own navigation. Do not add a sticky action
  footer that obscures focused fields or mobile browser controls.

## 10. Accessibility specification

- Target WCAG 2.2 AA. Existing token contrast is the minimum; customer themes must preserve it.
- Keyboard order follows visible order: global navigation → local navigation → breadcrumb → heading
  actions → status/alerts → page content. Do not use positive `tabindex`.
- Page navigation focuses the `h1` (`tabIndex=-1`). Client-side region refreshes retain triggering
  focus unless an error or success rule explicitly moves it.
- Dialog focus is trapped and returns to the trigger or its stable replacement. Destructive dialogs
  focus the safe action, except denial dialogs where required reason input comes first.
- Alerts that appear after submit receive programmatic focus when they contain next-step information.
  Passive health changes use `role="status"` and must not steal focus.
- Every icon button has a visible tooltip on hover/focus and an accessible name. Core actions prefer
  visible text over icon-only controls.
- Status, selection, charts, and health never rely on color alone. Use icon, word, and when useful a
  short consequence.
- Skeletons are one `role="status"` region with "Loading {content}…"; individual shapes are hidden
  from assistive technology. Respect `prefers-reduced-motion`.
- Tables use captions (visually hidden when redundant), scoped headers, and real table markup. Card
  alternatives use headings and lists, not CSS-grid divs pretending to be rows.
- Filters have persistent labels. Result count changes are politely announced after the user pauses.
- Try it instructions name Scalar controls exactly as rendered: **Authentication**, **Value**,
  operation, and **Send**. Do not depend on position or color.

## 11. Components and tokens

### 11.1 Reuse without change

`PageHeader`, `Button`, `Card`, `Badge`, `Table`, `EmptyState`, `ProblemAlert`, `CopyButton`,
`KeyRevealDialog`, `AlertDialog`, `Dialog`, `Field`, `Input`, `Textarea`, `Skeleton`, and toast.

### 11.2 Components to add when their first feature ships

| Component                | Responsibility                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| `AdminNav`               | Role-safe local navigation and mobile section select                              |
| `StatusBadge` extension  | API/access/gateway/sync statuses with icon + text                                 |
| `FilterBar`              | Labeled responsive filters, result count, clear action, query-string state        |
| `ResponsiveCollection`   | Shared semantic table/card rendering contract, not a generic data-grid dependency |
| `GatewayStatusCard`      | Status, checked time, consequence, and destination; no mutation                   |
| `SyncRunSummary`         | Running state, counts, categorized findings, polling announcements                |
| `AccessGrantList`        | Developer-facing access states and next actions                                   |
| `RequestDecisionDialog`  | Approve/deny confirmation, required denial reason, stale-state handling           |
| `SecretReplacementField` | Explicit keep/replace behavior without rendering the saved value                  |
| `RelativeTime`           | Human display with exact accessible/tooltip value and `<time datetime>`           |

Components own semantics and focus behavior; pages own fetching and business decisions. Do not make a
component infer permissions from hidden fields.

### 11.3 Token additions

No new brand colors are required. Add only layout tokens when implementing the related shell:

| Token                       | Default | Use                                                                         |
| --------------------------- | ------- | --------------------------------------------------------------------------- |
| `--portal-admin-nav-gap`    | `8px`   | Admin local navigation spacing                                              |
| `--portal-content-narrow`   | `800px` | Review and gateway forms wider than standard forms but narrower than tables |
| `--portal-status-icon-size` | `16px`  | Consistent inline status icons                                              |

Map every new status to existing semantic colors: healthy/active/approved → success; degraded,
pending, stale, needs attention → warning; unavailable/denied/failed → destructive only when the
status is itself negative; unknown/inactive/canceled → muted. Selection continues to use primary.

## 12. Copy reference

| Context                  | Preferred copy                                        |
| ------------------------ | ----------------------------------------------------- |
| Developer navigation     | APIs · My apps                                        |
| Admin navigation         | Overview · Gateways · APIs · Access requests          |
| Immediate access CTA     | Get an API key                                        |
| Approval access CTA      | Request access                                        |
| Pending access           | Pending review                                        |
| Gateway check failure    | Couldn't reach this gateway                           |
| Failed approval mutation | Access was not granted. The request is still pending. |
| Empty review queue       | You're all caught up                                  |
| One-time warning         | Copy this key now. You won't be able to see it again. |
| Stale observation        | Status last confirmed {time}                          |

Avoid: "provision", "ACL", "consumer", "entitlement", "job", "sync successful" without a time,
"something went wrong" when the affected object is known, and "contact support" in a self-hosted
product. Prefer "tell the portal admin" for developer recovery and concrete operator checks for
admins.

## 13. Frontend task boundaries

The design resolves screen and interaction decisions. Feature specs still own API contracts,
authorization rules, data retention, notifications, and adapter capabilities.

| Deliverable                                     | Can be implemented independently after contract exists | Depends on                                             |
| ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Rename visible Dashboard nav to My apps         | Yes; route stays `/dashboard`                          | Navigation regression tests                            |
| Admin local navigation and overview shell       | Yes                                                    | Admin summary contract for live cards                  |
| Catalog search/filter presentation              | Yes                                                    | Search/filter contract; omit controls before it exists |
| API access action variants                      | Yes                                                    | Eligibility and access-tier fields                     |
| App access list and request states              | Yes                                                    | Access grant/request contracts                         |
| Gateway list/detail and secret replacement form | Yes                                                    | Gateway CRUD, health, capability contracts             |
| Sync run status and findings                    | Yes                                                    | Start/read sync-run contracts and freshness policy     |
| Access review queue/detail/dialogs              | Yes                                                    | Request state machine and decision contract            |
| Responsive table/card primitives                | Yes                                                    | Representative fixtures for long content               |

Each implementation task includes component tests for loading, empty, success, validation, denied,
stale/concurrent, server failure, and retry states that apply to it; keyboard focus assertions; and
Playwright coverage at 375, 768, 1280, 200% zoom, and reduced motion. Secret-related tests assert
that full values are absent after reveal dismissal and absent from URLs, storage, logs, and error UI.

## 14. Resolved UX decisions

- The developer area is named **My apps** while retaining `/dashboard` routes.
- API reference and Try it remain one page; the access action stays above Scalar.
- An app is the unit that owns access and credentials. Approval is requested for an app, not a bare
  user account.
- Admin overview summarizes and links; risky mutations happen on detail pages.
- Publication and synchronization are separate statuses.
- Gateway connection tests are read-only; synchronization is an explicit idempotent action.
- Access reviews are oldest-first and require detail context; no queue-row approvals.
- Gateway secrets are replace-only and never have a readable representation.
- Mobile admin navigation uses a select, while data tables become semantic cards.
- No new color palette or generic data-grid dependency is needed.

These decisions remove frontend ambiguity. If a future feature must change one, its product spec and
UX design must state the reason and update this document in the same change.
