# 010 — Access requests and catalog visibility: UX design

Spec: [010](../specs/010-access-requests-and-visibility.md) · Contract: `apps/server/openapi.yaml`
(spec 010 sections) · Tokens: [tokens.md](tokens.md) (no new tokens).

Two audiences. **Developers** need to know, at a glance, whether a plan gives a key now or needs a
request, and where their request stands. **Admins** need one queue to clear and an Access panel
that never tightens access by surprise.

Principles for this spec:
- An invisible product is never hinted at. No "locked" cards, no "request visibility" link. The
  standard not-found page is the whole experience.
- The word on the button says what happens: **Subscribe** gives a key now; **Request access**
  sends a request. Never one label for both.
- Status is a badge with a word and an icon, never colour alone (tokens rule).
- No key ever appears on an admin screen.

---

## 1. User flows

### Flow A — developer requests an approval plan (AC 1, 2)
1. Developer opens a product page they can see. The plan table shows "Requires approval" on
   the Partner plan and a **Request access** button.
2. Clicks **Request access** → Request dialog opens with the team picker (if they belong to more
   than one team where they are Admin or Member), subscription name and reason.
3. Fills name + reason, clicks **Send request**.
4. Success: dialog closes, toast "Request sent. We'll email you when an admin decides." and the
   page shows an inline note on the plan row: "Your team has a pending request · View requests".
5. Team dashboard → **Requests** lists it as **Pending**. No key, no Reveal button.

### Flow B — admin decides (AC 3, 4, 6)
1. Admin opens **Admin → Requests** (`/admin/requests`); the nav item shows the pending count.
2. Each row shows product, plan, team, requester, reason, submitted time, and the kind
   (new subscription or plan change).
3. **Approve** → Approve dialog with the optional field "Note to the requester (included in the
   email)" → **Approve request**. Row leaves the Pending list; toast "Approved. {team} can now
   reveal their key."
4. **Reject** → Reject dialog with a required note → **Reject request**. Row leaves the list;
   toast "Rejected. We emailed {requester}."
5. Gateway down on approve: the dialog stays open with the error alert; the request stays Pending.

### Flow C — developer gets the key after approval (AC 3, 11)
1. Email "Your access to {product} · {plan} was approved" with the note (if any) and a link to
   the subscription page.
2. Subscription page shows **Active** and a "Your key is ready" card with **Reveal key**.
3. **Reveal key** → existing one-time key dialog (spec 001/009). After closing, the card is
   replaced by the normal keys section.
   Same path for a subscription an admin created on a Manual product (email "You've been given
   access to {product}").

### Flow D — plan change into an approval plan (AC 7, 8)
1. On the subscription page, **Change plan** (spec 009 dialog). Choosing an approval plan adds a
   "Reason" field and changes the button to **Request plan change**.
2. Submit (202) → dialog shows a success state; the subscription page gets a Pending banner:
   "Plan change to Partner is waiting for an admin. Your key keeps working on Basic."
3. Approved: banner gone, plan reads Partner, same key. Rejected: banner becomes a dismissible
   note with the admin's note and "Request again".
4. Changing from an approval plan to a self-service plan behaves as spec 009 (applies at once).

### Flow E — admin restricts a product (AC 9, 10, 12, 13)
1. Admin → product → **Access** panel. Picks a visibility. For Internal, picks named teams.
2. **Save access**. If no active subscription is affected → saved, toast "Access saved."
3. If the server answers `409 /problems/confirmation-required` → confirmation dialog naming the
   count of teams, with **Keep them working** (default) or **Revoke them**.
4. Confirm → saved. With revoke failures, the panel shows a warning "Revoking N subscriptions is
   still pending. We're retrying automatically." and the affected rows show **Revoke pending**.
5. Same confirmation for turning on "Requires approval" on a plan.

### Flow F — admin assigns a Manual product (AC 11)
1. Product with visibility Manual → Access panel shows **Assign to a team**.
2. Dialog: team picker, plan, subscription name → **Create subscription**.
3. Success: toast "Subscription created. We emailed {team}'s Admins and Members." The
   assigned list gains a row. No key anywhere on the admin screen.

---

## 2. Screens

### 2.1 Catalog and product page — visibility (AC 9–11)

No visible change for Open products. A product the viewer can't see is absent from the catalog;
its product page and API reference pages render the existing not-found page (`notFound()`,
HTTP 404). No "private" or "restricted" badge is shown to developers — the catalog shows only
what they can use.

Admins (who see everything) get a small visibility badge on catalog cards for non-Open products
so they can tell what a developer sees: `Hidden`, `Internal`, `Manual` — `Badge variant="outline"`
with an `EyeOff` (Hidden), `Users` (Internal) or `UserCheck` (Manual) icon. Uses
`ProductSummary.visibility`; shown only when the session is an admin.

### 2.2 Product page — plan table (AC 1, 10, 11)

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ Payments API                                                                 │
│ Plans                                                                        │
│ ┌────────────┬──────────────────────┬────────────────────┬─────────────────┐ │
│ │ Plan       │ Limits               │ Access             │                 │ │
│ ├────────────┼──────────────────────┼────────────────────┼─────────────────┤ │
│ │ Basic      │ 60 req/min           │ ✓ Instant key      │ [ Subscribe ]   │ │
│ │ Partner    │ 1,000 req/min        │ ⧗ Requires approval│ [Request access]│ │
│ │            │ ⓘ Your team has a pending request · View requests            │ │
│ └────────────┴──────────────────────┴────────────────────┴─────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Access** column: `Plan.requiresApproval` false → "Instant key" with `Zap` icon;
  true → "Requires approval" with `Clock` icon, `--muted-foreground` text.
- Button: `Subscribe` (primary, existing spec 009 flow) or `Request access` (`variant="outline"`,
  so the instant path stays the visual primary).
- `ProductDetail.selfService` false (Manual): no button column; under the table, muted text
  "Access to this product is set up by your portal admin." (Only teams that already have access
  can see a Manual product, so this explains why there's no Subscribe for further plans.)
- Pending request on that plan for one of the viewer's teams: inline row below the plan,
  `Info` icon, "Your team has a pending request · View requests" (link to team Requests). The
  **Request access** button stays enabled when the viewer has another eligible team; otherwise
  it is replaced by the text "Request pending".
- Signed out on an Open product with an approval plan: **Request access** goes to sign-in with
  return to this page (same as Subscribe today).
- Read-only team member (only role on every team): buttons disabled with tooltip and visible
  hint "Ask a team Admin or Member to request access." (Server would 403; we don't invite it.)

375px: the table becomes stacked plan cards (spec 009 pattern): name, limits, access line,
full-width button.

### 2.3 Request access dialog (AC 1, 2)

shadcn `Dialog`, max width 560px; full-screen sheet at 375px.

```
┌ Request access to Partner ─────────────────────────── ✕ ┐
│ Payments API · An admin reviews every request.          │
│                                                         │
│ Team                                                    │
│ [ Acme Integrations                              ▾ ]    │
│                                                         │
│ Subscription name                                       │
│ [ acme-checkout                                    ]    │
│ Letters, numbers and dashes. Shown to your team.        │
│                                                         │
│ Why does your team need this plan?                      │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│ The admin sees this, along with your name and team.   0/1000 │
│                                                         │
│ Description (optional)                                  │
│ [                                                  ]    │
│                                                         │
│                         [ Cancel ]  [ Send request ]    │
└─────────────────────────────────────────────────────────┘
```

- Fields map to `createAccessRequest`: `teamId`, `name`, `reason`, `description`; `planId` from
  the row. Team `Select` lists only teams where the viewer is Admin or Member; hidden if exactly
  one (then "For team **{name}**" shows as text).
- Reason `Textarea`, 4 rows, `maxLength` not set on the element (so paste isn't silently cut);
  counter `{n}/1000` in `--muted-foreground`, turns `--destructive` with text "{n}/1000 — too
  long" above 1000. Trimmed before checking (tech design).
- Client checks (same rules as the server, server is source of truth): reason empty →
  "Tell the admin why your team needs this plan."; over 1000 → "Keep the reason to 1000
  characters or fewer."; name empty → "Give the subscription a name."
- Submit button shows a spinner and "Sending…", disabled while pending.
- Server errors (shown in an `Alert variant="destructive"` at the top of the dialog, focus moves
  to it; field-level errors also attach to the field with `aria-describedby`):

| Response | Copy |
| --- | --- |
| 400 reason | "Tell the admin why your team needs this plan, in 1000 characters or fewer." (on the reason field) |
| 409 `request-pending` | "Your team already has a pending request for this plan. You'll get an email when an admin decides." + link "View requests" |
| 409 `app-name-taken` | "Your team already has a subscription called {name}. Choose another name." (on the name field) |
| 409 `approval-not-required` | "This plan no longer needs approval. Close this and choose Subscribe." |
| 403 (role / unverified) | "Only a team Admin or Member with a verified email can request access." |
| 403 `admin-assigned-only` | "Access to this product is set up by your portal admin." |
| 404 | "This plan is no longer available." |
| Network / 5xx | "We couldn't send your request. Check your connection and try again." |

- Success: dialog closes, `Toast` "Request sent. We'll email you when an admin decides.", focus
  returns to the plan row's inline "pending request" link.

### 2.4 Team dashboard — Requests (AC 1, 3, 4, 7, 8)

A **Requests** section on the team dashboard, below Subscriptions. Data: `GET
/v1/access-requests` for the team, newest first.

```
1280px
Requests
┌──────────────────────┬──────────────┬───────────────┬─────────────┬────────────────┐
│ Product · Plan       │ Type         │ Submitted     │ Status      │                │
├──────────────────────┼──────────────┼───────────────┼─────────────┼────────────────┤
│ Payments · Partner   │ New          │ 14 Nov, 09:12 │ ⧗ Pending   │                │
│ Orders · Gold        │ Plan change  │ 12 Nov, 16:40 │ ✓ Approved  │ View subscription│
│ Ledger · Partner     │ New          │ 10 Nov, 11:03 │ ✕ Rejected  │ Request again  │
│   Note from admin: "Partner access is for signed contracts. Ask your account manager first." │
└──────────────────────┴──────────────┴───────────────┴─────────────┴────────────────┘
```

- Status badges: **Pending** (`Clock`, `--muted` fill, `--foreground` text), **Approved**
  (`CheckCircle`, `--portal-success-subtle` / `--portal-success`), **Rejected** (`XCircle`,
  `--portal-destructive-subtle` / `--destructive`).
- Decision note shown under the row as "Note from admin:" (quoted, escaped plain text,
  `white-space: pre-wrap`). A system decision (no `decided_by`) is labelled "Note:" — e.g.
  "This product is no longer available to your team."
- Row action: Approved → "View subscription" (link to the app page); Rejected → "Request again"
  (opens the request dialog prefilled with name, reason empty; hidden if the product is no longer
  visible or the viewer is Read-only); Pending → none. Reason shown by expanding the row
  (`Collapsible`, trigger "Show reason").
- **Empty**: section hidden when the team has never made a request (no dead UI for teams that
  only use self-service plans).
- **Loading**: 3 skeleton rows.
- **Error**: inline `Alert`: "We couldn't load your team's requests. Try again." + **Retry**.
- 375px: each request is a card: product · plan (bold), type and submitted in muted text,
  status badge top-right, note, action link full width.

### 2.5 Subscription (app) page — states (AC 3, 7, 8, 11, 12, 13)

Additions to the spec 009 app page. Status badge next to the title, from `App.status`:

| Status | Badge | Page behaviour |
| --- | --- | --- |
| `active` | none (unchanged) | as today |
| `revoke-pending` | **Revoke pending** (`Loader`, warning colours) | Alert: "Access to this product was removed. We're deleting this key from the gateway." Keys, Change plan and Cancel disabled. |
| `revoked` | **Revoked** (`Ban`, destructive colours) | Alert: "An admin removed access to {product}. This key no longer works." Only action: **Delete subscription** (spec 009 delete, no Kong call). |

**Key not yet revealed** (`keyIssued` false, status `active`):

```
┌ ✓ Your key is ready ─────────────────────────────────────┐
│ An admin approved access to Partner. Reveal the key once │
│ and store it somewhere safe — you won't see it again.    │
│                                        [ Reveal key ]    │
└──────────────────────────────────────────────────────────┘
```
- `Card` with `--portal-success-subtle` background and `CheckCircle`. For `origin: admin` the
  first line is "Your admin gave your team access to {plan}."
- **Reveal key** calls `createCredential` and opens the existing one-time key dialog. Spinner
  "Revealing…" while pending. Errors: 409 `app-revoked` → reload into the Revoked state; 502/503 →
  "The gateway is unavailable, so we couldn't create your key. Try again in a minute."
- Read-only members: card shows "A team Admin or Member can reveal the key." and no button.
- Origin line under the title (muted, small): "Approved request" or "Set up by your admin" for
  `origin` `request` / `admin`; nothing for `self`.

**Pending plan change** (`pendingRequest` present):
```
┌ ⧗ Plan change requested ─────────────────────────────────┐
│ Change to Partner is waiting for an admin. Your key keeps │
│ working on Basic until then.                              │
└───────────────────────────────────────────────────────────┘
```
`Alert` (default variant, `Clock` icon). **Change plan** is disabled with hint "You already have
a plan change waiting." After rejection, the latest rejected plan-change shows a dismissible
`Alert`: "Your request to move to Partner was rejected. Note from admin: "{note}"" with a
**Request again** button.

### 2.6 Change plan dialog — approval target (AC 7, 8)

Spec 009 dialog plus:
- Approval plans in the plan list carry "Requires approval" (with `Clock`) after the name.
- Choosing one reveals the same Reason textarea + counter as 2.3 and helper text "Your key keeps
  working on {current plan} while an admin reviews this." Button: **Request plan change**.
- 202 → dialog body swaps to a success state: `CheckCircle` heading "Request sent", text "We'll
  email you when an admin decides. Nothing changes until then.", button **Done**.
- 409 `request-pending` → "This subscription already has a plan change waiting."
  409 `app-revoked` → "This subscription was revoked, so its plan can't change."
  403 `admin-assigned-only` → "Plans for this product are set by your portal admin."
- Self-service target: unchanged spec 009 behaviour and button label **Change plan**.

### 2.7 Admin — Requests queue `/admin/requests` (AC 1, 3, 4, 6)

New admin nav item **Requests** with a count badge of pending requests (hidden at 0; the count
is also in the accessible name: "Requests, 3 pending").

```
1280px
Access requests                                    [ Pending ▾ ]
Oldest first. Approving gives the team a key they reveal in the portal.
┌──────────────────────────────────────────────────────────────────────────┐
│ Payments API · Partner                         New subscription           │
│ Acme Integrations · requested by Dana Lee (dana@acme.test) · 2 hours ago  │
│ "We're moving checkout traffic to the partner tier for Black Friday."     │
│ Subscription name: acme-checkout                                          │
│                                            [ Reject ]  [ Approve… ]       │
├──────────────────────────────────────────────────────────────────────────┤
│ Orders API · Gold                         Plan change from Silver         │
│ …                                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

- A list of `Card` rows (not a table — the reason is free text and needs width). Each card is
  an `<article>` with heading "Product · Plan". Submitted time is relative with the absolute UTC
  time in `<time datetime>` and a `title`.
- Kind label: "New subscription" or "Plan change from {fromPlan}".
- Status filter `Select`: Pending (default), Approved, Rejected, All. Non-pending rows show the
  badge, decided-by and decided time and the note instead of buttons.
- **Approve…** (primary) opens the Approve dialog; **Reject** (`variant="outline"`, destructive
  text) opens the Reject dialog.
- **Empty (Pending)**: `Inbox` icon, "No pending requests", "When a developer requests a plan
  that requires approval, it shows up here."
- **Empty (other filters)**: "No {approved|rejected} requests yet."
- **Loading**: 3 skeleton cards. **Error**: `Alert` "We couldn't load requests. Try again." +
  **Retry**.
- **No permission**: non-admins never see the nav item; direct URL → existing admin 403 screen.

**Approve dialog**
```
┌ Approve Partner for Acme Integrations? ───────────── ✕ ┐
│ The team gets a subscription on Partner and can reveal  │
│ its key. Kong limits apply right away.                  │   (plan change: "Their
│                                                         │    subscription moves from
│ Note to the requester (included in the email)          │    Silver to Partner and keeps
│ ┌─────────────────────────────────────────────────────┐ │    the same key.")
│ └─────────────────────────────────────────────────────┘ │
│ Optional.                                    0/1000      │
│                         [ Cancel ]  [ Approve request ] │
└─────────────────────────────────────────────────────────┘
```

**Reject dialog**: title "Reject Partner for Acme Integrations?", text "The requester gets an
email with your note. They can request again.", field label "Reason for rejecting (included in
the email)", required, counter, button **Reject request** (`variant="destructive"`). Empty submit
→ field error "Add a note so the requester knows why." (client and 400 from the server).

Dialog errors (alert inside the dialog; dialog stays open, note kept):

| Response | Copy |
| --- | --- |
| 502 / 503 (approve) | "The gateway is unavailable, so the request wasn't approved. It's still pending — try again once the gateway is back." |
| 409 `request-decided` | "Someone already decided this request." → dialog closes on **OK**, queue refreshes |
| 409 `app-name-taken` | "{team} already has a subscription called {name}. Ask them to rename it or reject with a note." |
| 400 note too long | "Keep the note to 1000 characters or fewer." |

Success: dialog closes, card removed from the Pending list, toast "Approved. {team} can now
reveal their key." / "Rejected. We emailed {requester}." Focus moves to the next card's heading,
or the empty state heading.

375px: card buttons stack full width (Approve first). Dialogs become full-screen sheets.

### 2.8 Admin product — Access panel (AC 9–13)

A new **Access** `Card` on the admin product page, above Plans.

```
1280px
Access
Who can find this product and how teams get it.
( ) Open       Listed for everyone, even signed out.
(•) Hidden     Listed only for signed-in developers.
( ) Internal   Listed only for the teams you name. They subscribe themselves.
( ) Manual     Listed for no one. You set up each team's subscription.

[Internal only]
Teams with access
[ Search teams…                    ]   ← Command popover (GET /v1/admin/teams?q=)
[ Acme Integrations ✕ ] [ Personal: dana@acme.test ✕ ]

                                                   [ Save access ]
```

- `RadioGroup` with label + description per option (description is part of the accessible
  name via `aria-describedby`). Default selected = current `visibility`.
- Team picker: shadcn `Command` in a `Popover` (combobox), debounced 250ms search; selected
  teams as removable `Badge`s with a labelled remove button "Remove {team}". Personal teams show
  "Personal: {ownerEmail}". Saving Internal with no teams → field error "Name at least one team,
  or choose Hidden." (client only; prevents an Internal product nobody can see — if that's
  intentional the admin should choose Manual).
- **Save access** disabled until something changes. Spinner "Saving…".
- **Manual** selected and saved: panel adds an **Assigned teams** list (team, plan, subscription
  name, status badge, created) and a **Assign to a team** button (2.10).
- **Revocation notice** (from `ProductAccess.revocation.pending > 0`):
  `Alert` warning: "Revoking {n} subscriptions is still pending. We're retrying automatically —
  the keys stop working once the gateway confirms." Below, a list of the pending subscriptions:
  team · subscription name · **Revoke pending** badge. Clears on next load once `pending` is 0.
- Success toast: "Access saved." With revoke: "Access saved. {revoked} subscriptions revoked."
- Errors: 403 → existing admin 403 screen; other → `Alert` "We couldn't save access. Try again."
- Loading: skeleton radio group.

### 2.9 Confirmation dialog — Keep or Revoke (AC 12, 13)

Shown when the PUT (access or plan) answers `409 /problems/confirmation-required`. Uses
`affectedTeams` and `affectedSubscriptions` from the problem body. `AlertDialog`.

```
┌ 3 teams have active subscriptions ──────────────────────┐
│ They no longer meet the new access setting. What should │
│ happen to their existing keys?                          │
│                                                         │
│ (•) Keep them working                                   │
│     Their keys keep working. New teams can't subscribe. │
│ ( ) Revoke them                                         │
│     Delete their keys from the gateway now. We email    │
│     each team's Admins and Members.                     │
│                                                         │
│                     [ Cancel ]  [ Save and keep keys ]  │
└─────────────────────────────────────────────────────────┘
```

- Title uses the team count: "1 team has an active subscription" / "{n} teams have active
  subscriptions". When `affectedSubscriptions` > teams: body adds "({m} subscriptions)".
- Plan variant (turning on Requires approval): body "These teams subscribed before Partner
  required approval." Same options.
- Primary button label follows the choice: **Save and keep keys** (primary) or **Save and
  revoke keys** (`variant="destructive"`). Re-submits the PUT with `existingSubscriptions`.
- Focus starts on the selected radio ("Keep them working"), not the destructive action.
- Cancel → nothing saved; the panel keeps the admin's unsaved selection.
- A change that affects nobody never shows this dialog (server doesn't 409).

### 2.10 Assign to a team dialog (AC 11)

```
┌ Give a team access to Payments API ──────────────── ✕ ┐
│ Team             [ Search teams…               ▾ ]   │
│ Plan             [ Partner                     ▾ ]   │
│ Subscription name[ acme-payments                  ]   │
│ The team's Admins and Members get an email and reveal │
│ the key themselves. You never see it.                 │
│                        [ Cancel ] [ Create subscription ] │
└───────────────────────────────────────────────────────┘
```
- `POST /v1/admin/subscriptions` with `planId`, `teamId`, `name`. Name prefilled
  `{team-slug}-{product-slug}`, editable.
- Errors: 409 `app-name-taken` → "{team} already has a subscription called {name}. Choose another
  name."; 502/503 → "The gateway is unavailable, so the subscription wasn't created. Try again
  once it's back."; other → "We couldn't create the subscription. Try again."
- Success: toast "Subscription created. We emailed {team}'s Admins and Members." Response shows
  no key and the UI never renders one.

### 2.11 Plan form — Requires approval (AC 1, 12)

In the admin plan create/edit form, a `Switch` labelled **Requires approval** with description
"Developers send a request with a reason. You approve or reject it in Requests." On save, the
same confirmation dialog (2.9, plan variant) when the server returns
`confirmation-required`. Plan rows in the admin plan list show a "Requires approval" badge
(`Clock`).

Turning it off shows, if the plan has pending requests, a hint under the switch: "Pending
requests for this plan stay in Requests for you to decide." (Provisional behaviour from the
technical design.)

---

## 3. Emails (copy for `mail/templates.ts`)

Plain, short, one link. Notes rendered escaped and quoted.

| Template | Subject | Body (key lines) | Button |
| --- | --- | --- | --- |
| `access-approved` | "Approved: {product} · {plan}" | "An admin approved {team}'s request for {plan}." + if note: "Note from the admin: {note}" + "Reveal your key once in the portal and store it safely." (plan change: "Your subscription {name} is now on {plan}. Your key hasn't changed.") | Open subscription |
| `access-rejected` | "Not approved: {product} · {plan}" | "An admin didn't approve {team}'s request for {plan}." + "Note from the admin: {note}" + "You can send a new request from the product page." | View request |
| `subscription-assigned` | "You have access to {product}" | "Your portal admin gave {team} access to {product} on the {plan} plan. A team Admin or Member can reveal the key once in the portal." | Open subscription |
| `subscription-revoked` | "Access removed: {product}" | "Access to {product} changed, so {team}'s subscription {name} was revoked. Its key no longer works." | View subscriptions |

---

## 4. Components

Reused shadcn/ui: `Dialog`, `AlertDialog`, `Sheet` (dialogs at 375px), `Card`, `Table`,
`Badge`, `Button`, `RadioGroup`, `Switch`, `Select`, `Command` + `Popover` (team combobox),
`Textarea`, `Input`, `Label`, `Alert`, `Toast`/`Sonner`, `Skeleton`, `Collapsible`, `Tooltip`.
Icons: lucide (`Clock`, `Zap`, `CheckCircle`, `XCircle`, `Ban`, `Loader`, `Info`, `Inbox`,
`EyeOff`, `Users`, `UserCheck`).

New (in `packages/ui` or the portal's components folder):

- **`StatusBadge`** — `Badge` + icon + word. Props: `status: 'pending' | 'approved' | 'rejected' |
  'revoke-pending' | 'revoked'`. Colours: pending `--muted`/`--foreground`; approved
  `--portal-success-subtle`/`--portal-success`; rejected and revoked
  `--portal-destructive-subtle`/`--destructive`; revoke-pending
  `--portal-warning-subtle`/`--portal-warning`. Icon `aria-hidden`; the word is the label.
  Spinner icon in revoke-pending doesn't animate under reduced motion.
- **`CountedTextarea`** — `Textarea` + live counter. Props: `max` (1000), `required`,
  `label`, `hint`, `error`. Counter in a `<span aria-live="polite">` that announces only at
  900, 1000 and when over ("{n} of 1000 characters"), not on every keystroke. Counts trimmed
  length.
- **`VisibilityBadge`** (admin only) — Props: `visibility: 'hidden' | 'internal' | 'manual'`;
  renders nothing for `open`.
- **`TeamCombobox`** — `Command` in `Popover`, `multiple?: boolean`, `value: TeamRef[]`,
  `onChange`; loads `listAdminTeams({ q, limit: 20 })`. States: loading "Searching…", empty
  "No teams match "{q}"", error "Couldn't load teams. Try again."

No new tokens.

---

## 5. Every state — summary

| Screen | Empty | Loading | Error | Success | No permission |
| --- | --- | --- | --- | --- | --- |
| Catalog / product / API ref | invisible product = not-found 404 page | existing | existing | listed | not-found (never 403) |
| Plan table | no approval plans → unchanged | existing | existing | inline "pending request" note | Read-only: disabled + hint; Manual: "set up by your portal admin" |
| Request dialog | — | "Sending…" | table 2.3 | toast + inline note | 403 copy |
| Team Requests | section hidden | skeletons | alert + Retry | badges + notes | Read-only sees list, no actions |
| App page | — | existing | reveal 502/503 copy | key dialog | Read-only: no Reveal |
| Change plan | — | spinner | 409/403 copy | "Request sent" state | spec 009 |
| Admin Requests | "No pending requests" | skeleton cards | alert + Retry; dialog errors | toast, card removed | nav hidden; 403 screen |
| Access panel | Internal with no teams → error | skeleton | alert | toast; revoke-pending notice | 403 screen |
| Confirmation | not shown when 0 affected | spinner on button | alert in dialog | toast | — |
| Assign dialog | team picker empty state | spinner | 409/502 copy | toast | 403 screen |

---

## 6. Accessibility (WCAG 2.2 AA)

- **Keyboard path, developer**: product page → Tab to plan row → **Request access** (Enter) →
  focus lands on the first field (team select, or name) → name → reason → description →
  Cancel → Send request. Esc closes, focus returns to the trigger. On success focus goes to the
  inline pending note link.
- **Keyboard path, admin queue**: skip link → filter select → each card's heading (cards are
  `<article>`s with `h2`) → Reject → Approve…. Dialogs trap focus; initial focus on the note
  field (approve) or the required note field (reject). After decision, focus moves to the next
  card heading (or the empty-state heading); a polite live region announces the toast.
- **Confirmation dialog**: `AlertDialog` (`role="alertdialog"`), initial focus on "Keep them
  working"; radios are arrow-key navigable; destructive action is never the default focus.
- **Labels**: every field has a visible `<Label>`; hints and counters via `aria-describedby`;
  errors via `aria-invalid` + `aria-describedby`, and an error summary alert at the top of the
  dialog that receives focus on submit failure.
- **Status**: never colour alone (`StatusBadge` word + icon). Relative times use
  `<time datetime>` with the absolute time available.
- **Nav count**: "Requests" badge count is in the link's accessible name.
- **Contrast**: only existing token pairs, all ≥ 4.5:1 for text and ≥ 3:1 for UI boundaries
  (tokens.md). Outline buttons use `--input` borders.
- **Target size**: all buttons ≥ 24×24 CSS px (WCAG 2.5.8); on 375px primary actions are 44px
  tall and full width.
- **Not-found for invisible products**: the standard 404 page with its `h1` "Page not found";
  no different wording that would reveal existence.
- **Reduced motion**: skeleton pulse and the revoke-pending spinner stop.

---

## 7. Responsive behaviour

| | 375px | 1280px |
| --- | --- | --- |
| Plan table | stacked plan cards, full-width button | table, button column right |
| Request / approve / reject / assign dialogs | full-screen `Sheet` from bottom, sticky footer with buttons stacked (primary on top) | centred `Dialog`, 560px max |
| Team Requests | cards, status badge top-right, action link full width | table with expandable reason |
| Admin queue | cards, buttons stacked full width | cards, buttons right-aligned |
| Access panel | radios full width; team badges wrap; Save full width | card in the content column (max 640px form width) |
| Confirmation | `AlertDialog` at near full width (16px gutter), buttons stacked | 480px dialog |
| App page banners | full width, button below text | text left, button right |

Long product/plan/team names wrap (`overflow-wrap: anywhere`); subscription names and emails
use `--portal-font-mono` where they are identifiers (subscription name), sans for emails.
