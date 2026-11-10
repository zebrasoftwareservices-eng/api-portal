# 008 — Teams and roles: UX design

Spec: [008-teams-and-roles](../specs/008-teams-and-roles.md).
Contract: `apps/server/openapi.yaml` (tag `teams`). ADR: [0008](../adr/0008-teams-own-apps.md).

This spec adds a team switcher, three pages (create team, team page, accept invitation), three
dialogs (change role, remove member, leave team), one email, and role-aware controls on My apps,
Create app and the App page. It also changes the delete-account dialog from 007 §3.7. The global
layout, shared states, voice and focus rules from [001](001-kong-quickstart-slice.md) §2, §5 and
§7, the header and My apps designs from [019](019-unified-portal-developer-journey.md) §3.1–§3.5,
and the profile from [007](007-email-and-account-security.md) §3.6–§3.7 still apply. Anything not
mentioned here stays as those designs say. **No new tokens.**

## 0. Principles for this change
- **Working alone looks the same as today.** A developer who never creates a team sees one extra
  control, the switcher showing "Personal", and nothing else changes.
- **Always say which team you're in.** Every My apps page shows the current team above the `h1`.
  The App page names the app's team. A key is never created without the team in view.
- **Hide what you can't do; don't disable it.** Controls a role can't use are left out, with one
  line saying who can. The server still refuses (403) if a control is reached another way.
- **Say what keeps working.** Removing a member, leaving a team and changing a role all say that
  existing keys keep working. Every refusal says what didn't change.
- **Never leak a team.** A team or app you're not in is "We can't find this…", never "You don't
  have access", matching the server's 404.

Role names are written **Admin**, **Member** and **Read-only** everywhere (capitalised, as in the
spec's role table). The API values `admin`, `member` and `read-only` are never shown.

## 1. User flows

### Flow A — Developer works alone (AC 1)
1. They sign up (001 §3.3). The server creates their personal team and makes it current.
2. `/dashboard` (My apps) opens. The switcher above the `h1` reads **Team: Personal**.
3. Everything else is as today: create an app, get a key. **Success:** the app belongs to Personal.
   Existing developers after the upgrade land in the same state, with all their apps listed.

### Flow B — Developer creates a team and switches (AC 2)
1. On My apps they open the switcher and choose **Create team**.
2. `/dashboard/teams/new` opens with focus in **Team name**. They type "Payments" and select
   **Create team**.
3. The team page `/dashboard/teams/{id}` opens, toast "Payments is created. You're its Admin." The
   switcher now reads **Team: Payments** (the server made it current).
4. They select **My apps** in the header. My apps shows the empty state for Payments.
5. They create an app. **Success:** it is listed under Payments. Switching to **Personal** shows only
   the personal team's apps.

### Flow C — Admin invites a colleague (AC 3)
1. On the Payments team page, in **Invite people**, they type `dev2@example.com`, keep **Member**,
   and select **Send invitation**.
2. Toast "Invitation sent to dev2@example.com." The address appears under **Pending invitations**
   with its role and expiry. Focus returns to the empty **Email** field for the next invite.

### Flow D — Colleague accepts (AC 3, 6)
1. dev2 opens the link in the email: `/invitations/accept?token=…`.
2. The page shows who invited them, to which team, with which role, and when it expires.
3. Signed out: they select **Create an account** (or **Sign in** if they have one). The sign-up
   form opens with the invited email filled in, and returns to this page afterwards (`next`).
4. Signed in with the invited address: they select **Accept invitation**.
5. **Success:** My apps opens with Payments current, toast "You joined Payments as Member." They open
   the team's app and create a key as usual.
6. **Can't accept** (wrong account, cancelled, expired, used): the page says why and what to do.
   Nothing is joined. No team apps are shown.

### Flow E — Read-only member looks at an app (AC 4)
1. They switch to the team. My apps lists its apps with no **Create app** button and the line
   "You have Read-only access to Payments."
2. They open an app. They see its APIs and the key list (name, prefix, created, status), with no
   **New key** or **Revoke** buttons, and the line "You have Read-only access. Ask a team Admin to
   create or revoke keys."

### Flow F — Admin changes a role or removes a member (AC 7, 9)
1. On the team page, in the member's row, they open **Actions for {name}**.
2. **Change role…** opens a dialog with the three roles. They pick **Read-only** and select **Save
   role**. Toast "{name} is now Read-only." The member's controls go on their next page load.
3. **Remove from team…** opens a confirmation that says their keys keep working. They select
   **Remove member**. Toast "{name} was removed from Payments." The row goes.

### Flow G — Member leaves a team (AC 9)
1. On the team page they select **Leave team…** and confirm with **Leave team**.
2. **Success:** My apps opens with their next team current, toast "You left Payments."
3. The only Admin sees "Payments needs another Admin before you can leave" instead of a
   confirmation, and nothing changes.

### Flow H — Delete account with teams (AC 8, 007)
1. On `/profile` they select **Delete account…**. The dialog lists what's deleted (their personal
   apps, and any team where they're the only member) and what stays (teams they share).
2. If they're the only Admin of a shared team, the server refuses. The dialog names the teams with
   links to each team page. **Success** is unchanged from 007.

## 2. Components

All from shadcn/ui unless marked new. Every colour is a token from [tokens.md](tokens.md).

| Component | Used for |
| --- | --- |
| `DropdownMenu` + `DropdownMenuRadioGroup` | Team switcher, member row actions |
| `Card`, `Table`, `Badge`, `Button`, `Input`, `Label`, `Select` | Team page, forms |
| `RadioGroup` | Change role dialog (the invite form uses `Select` at every width) |
| `Dialog` | Change role |
| `AlertDialog` | Remove member, leave team, delete account (007) |
| `Alert`, `ProblemAlert` (001), `EmptyState` (001), `Skeleton`, toast (`Sonner`, 001) | States |

### 2.1 `TeamSwitcher` (new, `apps/portal`)
Props: `teams: TeamSummary[]`, `currentTeamId: string`, `onSwitched(teamId)`.
- Trigger: `Button` variant `outline`, text "Team: **{name}**" and a chevron icon. Accessible name
  "Team: {name}. Switch team". Width fits content up to 320px; long names truncate with an ellipsis
  and keep the full name in `title`. Below 768px the trigger is full width and 44px high.
- Menu: a `DropdownMenuLabel` "Your teams", then a `DropdownMenuRadioGroup` with one item per team,
  in the API's order (Personal first, then by name). Each item: name, and in muted text
  `--portal-text-sm` the role ("Admin", "Member", "Read-only"). The current team is checked.
  Then a separator, **Team settings** (→ `/dashboard/teams/{currentTeamId}`) and **Create team**
  (→ `/dashboard/teams/new`).
- Selecting another team calls `PUT /v1/me/current-team { teamId }`. While pending the trigger
  shows "Switching…" and is disabled. On 204 see §3.1 for where it goes.

### 2.2 `RoleBadge` (new)
`Badge` with the role word, never colour alone.

| Role | Background | Text |
| --- | --- | --- |
| Admin | `--accent` | `--accent-foreground` (9.5:1) |
| Member | `--secondary` | `--secondary-foreground` (16.3:1) |
| Read-only | `--muted` | `--muted-foreground` (6.9:1) |

### 2.3 `RoleHelp` (new)
The three roles with one line each, used in the invite form and the change role dialog
(§5.1 "Role descriptions"). Rendered as each radio's description, or under the role `Select` as
the description for the selected role (`aria-describedby`).

## 3. Screens

### 3.1 Dashboard team bar — all `/dashboard/*` pages (AC 1, 2)

**Purpose:** show and change the current team. **Primary action:** none.

```
1280px
┌──────────────────────────────────────────────────────────────────────────────┐
│ Developer Portal   APIs  My apps                              ana@ex.com ▸   │ site header (019)
├──────────────────────────────────────────────────────────────────────────────┤
│ [ Team: Payments ▾ ]                                                         │ team bar
│ My apps (h1)                                                  [ Create app ] │
└──────────────────────────────────────────────────────────────────────────────┘
                     ┌─────────────────────────────┐
  menu open          │ Your teams                  │
                     │   Personal          Admin   │
                     │ ● Payments          Admin   │ checked
                     │   Platform tools    Member  │
                     │─────────────────────────────│
                     │ Team settings               │
                     │ Create team                 │
                     └─────────────────────────────┘
375px
┌───────────────────────────────────┐
│ Developer Portal              [☰] │
├───────────────────────────────────┤
│ [ Team: Payments              ▾ ] │ full width, 44px
│ My apps (h1)                      │
```

- The bar sits inside the page container, above the breadcrumb or `h1`, on `/dashboard`,
  `/dashboard/apps/new`, `/dashboard/apps/{id}` and `/dashboard/teams/*`. It is the first focus
  stop after the site header. It is not in the site header, so the header stays the same on every
  page (019 §3.1).
- The data comes from `GET /v1/teams` on each page load (server component). `currentTeamId` in the
  response is the selected item.

| After a successful switch, from | Go to |
| --- | --- |
| `/dashboard` | Stay. Re-fetch `GET /v1/apps?teamId={new}`. Focus stays on the trigger. |
| `/dashboard/apps/new` | Stay. The form now creates in the new team (the bar is the reminder). |
| `/dashboard/apps/{id}` | `/dashboard`, because the app belongs to the old team. |
| `/dashboard/teams/{id}` | `/dashboard/teams/{new}`. |
| `/dashboard/teams/new` | Stay. |

Screen readers hear "Switched to {name}." from a polite live region (no visual toast).

| State | UI |
| --- | --- |
| Loading | Server-rendered with the page; no separate loading state. |
| One team (Personal only) | Same trigger. The menu lists Personal, **Team settings** and **Create team**. |
| Switch pending | Trigger "Switching…", disabled. |
| Switch 404 (removed meanwhile) | Toast "You're no longer a member of {name}." Re-fetch teams; the trigger shows the server's current team. |
| Switch other error | Toast "We couldn't switch teams. Try again." The current team is unchanged. |
| `GET /v1/teams` fails | Trigger reads "Team: unavailable", menu has only **Try again** (reloads). The page below still renders its own state. |
| No permission | Signed out: middleware sends to sign-in with `next` (001). |

### 3.2 My apps — `/dashboard` (changed, AC 2, 4)

Layout as 019 §3.3, with the team bar above the `h1`. Apps are fetched with
`GET /v1/apps?teamId={currentTeamId}`. The table caption is "Apps in {team name}" (visually hidden).

| State | UI |
| --- | --- |
| Success, Admin or Member | As 019 §3.3. |
| Success, Read-only | No **Create app** button. Under the `h1`, muted: "You have Read-only access to {team}. Ask a team Admin to create apps." |
| Empty, Admin or Member, Personal | Unchanged 001 `EmptyState` **Create your first app**. |
| Empty, Admin or Member, shared team | `EmptyState` heading "No apps in {team} yet", body "Apps you create here belong to the team, so they keep working when people leave.", button **Create app**. |
| Empty, Read-only | `EmptyState` heading "No apps in {team} yet", body "A team Admin or Member can create one.", no button. |
| Loading, error | Unchanged (019 §3.3). Loading text "Loading {team}'s apps…". |
| No permission | Signed out: unchanged. |

The role comes from the current team's `TeamSummary.role`.

### 3.3 Create app — `/dashboard/apps/new` (changed, AC 2, 4)

Unchanged form (019 §3.4), with the team bar above the breadcrumb and one line under the `h1`:
"This app will belong to **{team}**." `POST /v1/apps` sends `teamId: currentTeamId` explicitly, so
a switch in another tab can't move it.

| State | UI |
| --- | --- |
| Read-only (opened by URL) | No form. `h1` "Create an app", text "You have Read-only access to {team}, so you can't create apps here. Switch to another team or ask a team Admin." Button **Back to My apps**. |
| 403 `team-role-forbidden` (role changed meanwhile) | `ProblemAlert` above the form: title "You can't create apps in {team}", body "Your role in this team may have changed. Nothing was created." Button **Back to My apps**. |
| 409 `app-name-taken` | Existing field error, now "An app in {team} already has this name. Choose another name." |
| Everything else | Unchanged. |

### 3.4 App page — `/dashboard/apps/{id}` (changed, AC 4, 7, 9)

```
1280px
│ [ Team: Payments ▾ ]                                                         │
│ My apps / Fulfillment worker                                                 │
│ Fulfillment worker (h1)                                                      │
│ Team: Payments · You're a Read-only member                                   │ muted, new
│ ┌ ⓘ You have Read-only access. Ask a team Admin to create or revoke keys. ┐ │ Read-only only
│ APIs (h2) …  unchanged                                                       │
│ API keys (h2)                                       (no [ New key ])         │
│ Name          Prefix      Created       Status                               │ (no Revoke column)
│ ci-runner     kp_3f9a…    2 Nov 2026    ● Active                             │
```

- Under the `h1`: "Team: {team name} · " then "You're an Admin", "You're a Member" or "You're a
  Read-only member", from `app.role`. The team name links to `/dashboard/teams/{app.teamId}`. The
  team name comes from `GET /v1/teams` (match `app.teamId`).
- If `app.teamId` isn't the current team (opened from a link), the page still shows the app and
  adds nothing else: the team line already says where it is.
- Read-only: an info `Alert` (neutral, `--muted` background, info icon) above **APIs**. No **New
  key** button, no **Revoke** column or buttons. The **Try your key** card is unchanged: it shows
  only when the app has an active key and never shows a secret. Key metadata stays as 001.

| State | UI |
| --- | --- |
| Admin or Member | Unchanged controls. |
| Read-only | As above. |
| 403 `team-role-forbidden` on create or revoke (demoted meanwhile, AC 9) | Inline `ProblemAlert` above the key table, title "You can't change keys in {team}", body "Your role in this team may have changed. No key was created or revoked." Close any open dialog, re-fetch the app so the controls follow the new role. |
| 404 (not in the team, or removed, AC 7) | Existing not-found state with new body: "We can't find this app. It may have been deleted, or you may no longer be in its team." **Back to your apps**. |
| Loading, error, success | Unchanged (001 §3.8, 019 §3.5). |

### 3.5 Create team — `/dashboard/teams/new` (new, AC 2)

**Purpose:** make a shared team. **Primary action:** **Create team**.

```
1280px (form column, --portal-form-max-width)      375px
│ [ Team: Personal ▾ ]                  │         │ [ Team: Personal            ▾ ] │
│ My apps / New team                    │         │ My apps / New team              │
│ Create a team (h1)                    │         │ Create a team (h1)              │
│ Teams share apps and keys. Apps you   │         │ Teams share apps and keys. …    │
│ create in a team keep working when    │         │                                 │
│ people leave.                         │         │ Team name                       │
│ Team name                             │         │ [|                            ] │
│ [|                                  ] │         │ For example, Payments or Mobile │
│ For example, Payments or Mobile app.  │         │ [         Create team         ] │
│               [Cancel] [Create team]  │         │ [            Cancel           ] │
```

- `Input` `name="name"`, `maxlength` not set (so the error can explain), `autocomplete="off"`,
  focused on load. Hint is its description.
- `POST /v1/teams { name }` with the trimmed value. **Cancel** goes back to `/dashboard`.

| State | UI |
| --- | --- |
| Validation | Empty or spaces only: "Enter a team name." Over 80 characters: "Use 80 characters or fewer." Focus the field. |
| Pending | **Create team** → "Creating team…", disabled. |
| 201 | Navigate to `/dashboard/teams/{id}`, toast "{name} is created. You're its Admin." |
| 400 (server validation) | Field error from the problem's first `errors[].detail`, else "Enter a team name." |
| Other error | `ProblemAlert` "We couldn't create the team. Nothing was created. Try again." Values kept. |
| No permission | Signed out: sign-in with `next`. Every signed-in developer may create teams. |

### 3.6 Team page — `/dashboard/teams/{teamId}` (new, AC 3, 5, 7, 9)

**Purpose:** see who's in the team and manage them. **Primary action (Admin):** **Send invitation**.

Data: `GET /v1/teams/{teamId}`. `invitations` is `null` unless the caller is an Admin.

```
1280px — Admin of a shared team
┌──────────────────────────────────────────────────────────────────────────────┐
│ [ Team: Payments ▾ ]                                                         │
│ My apps / Payments                                                           │
│ Payments (h1)                                           [Admin]  RoleBadge   │
│ 3 members                                                                    │
│                                                                              │
│ ┌ Invite people (h2) ─────────────────────────────────────────────────────┐ │
│ │ Email                               Role                                │ │
│ │ [ name@example.com            ]     [ Member            ▾ ]             │ │
│ │                                     Creates apps and keys, and revokes  │ │
│ │                                     keys.                               │ │
│ │                                             [ Send invitation ]         │ │
│ │ They get an email with a link that works for 7 days.                    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Members (h2)                                                                 │
│ ┌───────────────────────────────────────────────────────────────────────┐   │
│ │ Name             Email               Role        Joined               │   │
│ ├───────────────────────────────────────────────────────────────────────┤   │
│ │ Ana Silva (you)  ana@ex.com          [Admin]     2 Nov 2026     [⋯]   │   │
│ │ Ben Okafor       ben@ex.com          [Member]    5 Nov 2026     [⋯]   │   │
│ │ Cara Lee         cara@audit.ex.com   [Read-only] 9 Nov 2026     [⋯]   │   │
│ └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│ Pending invitations (h2)                                                     │
│ ┌───────────────────────────────────────────────────────────────────────┐   │
│ │ Email              Role       Invited by    Expires                   │   │
│ ├───────────────────────────────────────────────────────────────────────┤   │
│ │ dev2@example.com   [Member]   Ana Silva     17 Nov 2026  [Cancel invitation] │
│ └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│ Leave team (h2)                                                              │
│ You lose access to Payments' apps. Keys you created keep working.            │
│ [ Leave team… ]                                       outline, destructive   │
└──────────────────────────────────────────────────────────────────────────────┘

375px — Admin
┌───────────────────────────────────┐
│ [ Team: Payments              ▾ ] │
│ My apps / Payments                │
│ Payments (h1)                     │
│ [Admin] · 3 members               │
│ ┌ Invite people (h2) ───────────┐ │
│ │ Email                         │ │
│ │ [                           ] │ │
│ │ Role                          │ │
│ │ [ Member                  ▾ ] │ │
│ │ Creates apps and keys, …      │ │
│ │ [      Send invitation      ] │ │
│ │ They get an email with a link │ │
│ │ that works for 7 days.        │ │
│ └───────────────────────────────┘ │
│ Members (h2)                      │
│ ┌───────────────────────────────┐ │
│ │ Ben Okafor (h3)          [⋯]  │ │
│ │ ben@ex.com                    │ │
│ │ [Member] · Joined 5 Nov 2026  │ │
│ └───────────────────────────────┘ │
│ Pending invitations (h2)          │
│ ┌───────────────────────────────┐ │
│ │ dev2@example.com (h3)         │ │
│ │ [Member] · Expires 17 Nov 2026│ │
│ │ Invited by Ana Silva          │ │
│ │ [     Cancel invitation     ] │ │
│ └───────────────────────────────┘ │
│ Leave team (h2) …                 │
│ [         Leave team…         ] │
└───────────────────────────────────┘
```

**Header.** `h1` is the team name. Beside it, the caller's `RoleBadge` with visually hidden prefix
"Your role:". Under it, "{n} member" / "{n} members" from `memberCount`.

**Invite people** (Admin of a shared team only).
- **Email**: `Input type="email"`, `autocomplete="off"`, `inputmode="email"`, `spellcheck="false"`.
- **Role**: `Select`, default **Member**, options Admin, Member, Read-only. `RoleHelp` for the
  selected role shows under it.
- **Send invitation**: `POST /v1/teams/{teamId}/invitations { email, role }` with the trimmed email.
- Hint under the button: "They get an email with a link that works for 7 days."

**Members.** Table from 768px, cards below. Order as the API (Admins first, then by name). The
caller's own row adds "(you)" after the name. Names and emails truncate with `title`. Emails are in
`--portal-font-sans` (they're not code). The `[⋯]` button is `DropdownMenu`, accessible name
"Actions for {name}", Admin only:
- **Change role…** → §3.7.
- **Remove from team…** → §3.8. On the caller's own row this item is **Leave team…** (§3.9).

**Pending invitations** (Admin only, `invitations` not `null`). Newest first. "Invited by" shows
`invitedBy.name`, or "A deleted account" when `null`. Expires shows the date of `expiresAt`, with
the full date and time in a `title`. **Cancel invitation** (`Button` variant `ghost`, accessible
name "Cancel invitation to {email}") calls `DELETE …/invitations/{id}` straight away, no
confirmation: it's undone by inviting again.

**Leave team** (any member of a shared team). Section at the bottom so it's never the first thing
reached. Opens §3.9.

#### Variants

| Who | What shows |
| --- | --- |
| Admin, shared team | Everything above. |
| Member or Read-only, shared team | Header, Members (no `[⋯]` column), Leave team. Under the Members heading, muted: "Only team Admins can invite people or change roles." No Invite people, no Pending invitations section (AC 5). |
| Personal team | Header with no member count. Instead of every section, a `Card`: heading "This is your personal team" (h2), body "Only you can use it, and its apps are deleted with your account. To share apps with colleagues, create a team." Button **Create team** (→ `/dashboard/teams/new`). No invite form, no leave (contract: personal teams take no invitations). |

#### States

| State | UI |
| --- | --- |
| Loading | `h1` skeleton, three skeleton rows, "Loading team…" for screen readers. Title "Team · Developer Portal". |
| Loaded | Title "{team name} · Developer Portal". Focus on `h1` after a client navigation. |
| No pending invitations (Admin) | Under the heading: "No pending invitations." |
| Only member (Admin alone in a shared team) | Members lists just them. Under it, muted: "Invite colleagues above. They'll see this team's apps once they accept." |
| Error loading | `ProblemAlert` "We couldn't load this team." **Try again**. |
| 404 (not a member, removed, or unknown ID) | Not-found state: `h1` "We can't find this team", body "It may not exist, or you may no longer be a member." Button **Back to My apps**. |
| No permission | Signed out: sign-in with `next`. Not-a-member is the 404 above. |

#### Invite states

| State | UI |
| --- | --- |
| Validation | Empty: "Enter an email address." Not an address: "Enter an email address like name@example.com." Focus the field. |
| Pending | **Send invitation** → "Sending…", disabled. |
| 201 | Toast "Invitation sent to {email}." Prepend the invitation to Pending invitations. Clear **Email**, keep **Role**, focus **Email**. |
| 409 `already-member` | Field error: "{email} is already in this team." |
| 409 `invitation-pending` | Field error: "{email} already has a pending invitation. Cancel it below to send a new one." |
| 409 `mail-not-configured` | `ProblemAlert` in the card: title "The portal can't send email yet", body "No invitation was sent. Ask the portal admin to set up mail." |
| 429 `rate-limited` | `ProblemAlert` in the card: "You've sent too many invitations in the last hour. Try again in {time}. No invitation was sent." `{time}` from `Retry-After` (007 §5.3). |
| 409 `personal-team` | Not reachable (the form is hidden). If it happens, `ProblemAlert` with the problem `detail` (§5.2). |
| 403 `team-role-forbidden` | `ProblemAlert`: "Only team Admins can invite people. Your role may have changed. No invitation was sent." Re-fetch the team, so the form goes. |
| 404 | Switch the page to the 404 state. |
| Other | `ProblemAlert` "We couldn't send the invitation. Try again." Values kept. |

#### Cancel invitation states

| State | UI |
| --- | --- |
| Pending | Button "Cancelling…", disabled. |
| 204 | Remove the row. Toast "Invitation to {email} cancelled." Focus moves to the next row's button, else the section heading. |
| 409 `invitation-used` | Toast "{email} already accepted this invitation." Re-fetch the team; they now appear in Members. |
| 403, 404 | As in Invite states. |
| Other | Toast "We couldn't cancel the invitation. Try again." Row stays. |

### 3.7 Change role dialog (new, AC 9)

`Dialog`, title "Change {name}'s role" (own row: "Change your role").

```
┌──────────────────────────────────────────┐
│ Change Ben Okafor's role                 │
│ ( ) Admin                                │
│     Manages members and invitations, and │
│     can create apps and keys.            │
│ (•) Member                               │
│     Creates apps and keys, and revokes   │
│     keys.                                │
│ ( ) Read-only                            │
│     Sees apps and key details. Can't     │
│     create or revoke keys.               │
│ Their existing keys keep working.        │
│                    [Cancel] [Save role]  │
└──────────────────────────────────────────┘
```

- `RadioGroup` with `legend` "Role" (visually hidden), current role checked and focused on open.
- `PATCH /v1/teams/{teamId}/members/{userId} { role }`. Saving the current role closes with no call.
- Only Admin (pre-check): if this is the caller's own row and they're the only Admin
  (count `role === 'admin'` in `members`), the dialog shows the radios disabled and, above them,
  an `Alert` (warning): "You're the only Admin of {team}. Make another member an Admin before you
  change your own role." **Save role** is hidden; the button reads **Close**.

| State | UI |
| --- | --- |
| Pending | **Save role** → "Saving…", both buttons disabled. |
| 200 | Close. Update the row from the response. Toast "{name} is now {Role}." (own: "You're now {Role}."). Own change away from Admin: re-fetch the page, so the Admin controls go. Focus returns to the row's `[⋯]` (or the `h1` if it's gone). |
| 409 `team-needs-admin` | `Alert` (destructive) in the dialog: §5.2 copy. Nothing changed. |
| 403, 404 | Close; handle as in §3.6 Invite states (re-fetch, or 404 state). A 404 for the member: toast "{name} is no longer in this team." and re-fetch. |
| Other | `ProblemAlert` in the dialog "We couldn't change the role. Nothing changed. Try again." |

### 3.8 Remove member dialog (new, AC 7)

`AlertDialog`.

```
┌──────────────────────────────────────────┐
│ Remove Ben Okafor from Payments?         │
│ They lose access to Payments' apps and   │
│ keys straight away. Keys they created    │
│ keep working. You can invite them again  │
│ later.                                   │
│                 [Cancel] [Remove member] │  destructive; Cancel gets initial focus
└──────────────────────────────────────────┘
```

- `DELETE /v1/teams/{teamId}/members/{userId}`. Can't close while pending.

| State | UI |
| --- | --- |
| Pending | "Removing…", both disabled. |
| 204 | Close, remove the row, update the count. Toast "{name} was removed from {team}." Focus to the next row's `[⋯]`, else the Members heading. |
| 409 `team-needs-admin` | Not reachable from another member's row (the caller is an Admin). If it happens, §5.2 copy in the dialog. |
| 404 | Close, toast "{name} is no longer in this team.", re-fetch. |
| 403 | As §3.6. |
| Other | `ProblemAlert` in the dialog "We couldn't remove {name}. Nothing changed. Try again." |

### 3.9 Leave team dialog (new, AC 9)

`AlertDialog`, from **Leave team…** (section or own row).

```
Can leave                                    Only Admin (pre-check, or 409)
┌──────────────────────────────────────────┐ ┌──────────────────────────────────────────┐
│ Leave Payments?                          │ │ Payments needs another Admin             │
│ You lose access to its apps straight     │ │ You're the only Admin, so you can't leave│
│ away. Keys you created keep working. To  │ │ yet. Make another member an Admin first, │
│ come back, an Admin has to invite you.   │ │ then leave.                              │
│                   [Cancel] [Leave team]  │ │                                 [Close]  │
└──────────────────────────────────────────┘ └──────────────────────────────────────────┘
```

- Pre-check: the caller is Admin and no other member is Admin. If they're also the only member,
  the body is "You're the only member of {team}. Invite someone and make them an Admin, then leave."
- `DELETE /v1/teams/{teamId}/members/{myUserId}`.

| State | UI |
| --- | --- |
| Pending | "Leaving…", both disabled; can't close. |
| 204 | Navigate to `/dashboard` (the server picks the next current team), toast "You left {team}." |
| 409 `team-needs-admin` | Swap to the "needs another Admin" view. |
| 404 | Navigate to `/dashboard`, toast "You're no longer a member of {team}." |
| Other | `ProblemAlert` in the dialog "We couldn't take you out of {team}. Nothing changed. Try again." |

### 3.10 Accept invitation — `/invitations/accept?token=…` (new, AC 3, 6)

**Purpose:** join a team from the email. **Primary action:** **Accept invitation**.

Public page (no middleware redirect), the 001 auth card layout: centred,
`--portal-auth-max-width`, no border below 768px. No team bar (they're not in the team yet).
On load: `POST /v1/invitations/preview { token }` and, if a session exists, `GET /v1/me` for the
email. Emails are compared trimmed and lowercased.

The page sends `Referrer-Policy: no-referrer` and the portal never logs the URL's query, so the
token doesn't leak to other sites.

```
Pending, signed out                          Pending, signed in with the invited address
┌───────────────────────────────────┐        ┌───────────────────────────────────┐
│ Join Payments (h1)                │        │ Join Payments (h1)                │
│ Ana Silva invited you to Payments │        │ Ana Silva invited you to Payments │
│ as a Member.                      │        │ as a Member.                      │
│ ┌───────────────────────────────┐ │        │ ┌───────────────────────────────┐ │
│ │ Invited address               │ │        │ │ Invited address               │ │
│ │ dev2@example.com              │ │        │ │ dev2@example.com              │ │
│ │ Role                          │ │        │ │ Role                          │ │
│ │ Member — Creates apps and     │ │        │ │ Member — Creates apps and …   │ │
│ │ keys, and revokes keys.       │ │        │ │ Expires                       │ │
│ │ Expires                       │ │        │ │ 17 Nov 2026                   │ │
│ │ 17 Nov 2026                   │ │        │ └───────────────────────────────┘ │
│ └───────────────────────────────┘ │        │ [     Accept invitation       ] │
│ To accept, sign in or create an   │        │ [         Not now             ] │ link → /dashboard
│ account with dev2@example.com.    │        └───────────────────────────────────┘
│ [     Create an account         ] │
│ [          Sign in              ] │
└───────────────────────────────────┘

Pending, signed in with another address      Can't be accepted (cancelled shown)
┌───────────────────────────────────┐        ┌───────────────────────────────────┐
│ Join Payments (h1)                │        │ This invitation was cancelled (h1)│
│ Ana Silva invited you to Payments │        │ An Admin of Payments cancelled it.│
│ as a Member.                      │        │ Ask them for a new invitation.    │
│ ┌ ⚠ ────────────────────────────┐ │        │ [        Go to My apps          ] │ signed in
│ │ This invitation is for        │ │        │ [          Sign in              ] │ signed out
│ │ dev2@example.com. You're      │ │        └───────────────────────────────────┘
│ │ signed in as ana@ex.com.      │ │
│ └───────────────────────────────┘ │
│ [ Sign out and use another account ] │
│ [         Go to My apps         ] │
└───────────────────────────────────┘
```

- **Create an account** → `/sign-up?email={invited}&next={this page's path and query}`.
  **Sign in** → `/sign-in?email={invited}&next=…`. Both pages read `email` to fill the Email
  field (new, portal-only query parameter; 001 §3.3/§3.4 otherwise unchanged). After sign-up the
  developer returns here signed in. If the admin requires verified email (007), accepting verifies
  it (contract), so no verification step comes first.
- **Sign out and use another account** signs out (Better Auth), then goes to
  `/sign-in?email={invited}&next=…`.
- "as a Member" / "as an Admin" / "as a Read-only member". If `invitedByName` is `null`: "You're
  invited to Payments as a Member."
- **Accept invitation** → `POST /v1/invitations/accept { token }`.

| State | UI |
| --- | --- |
| Loading | Card with skeleton lines, "Loading invitation…" for screen readers. Title "Invitation · Developer Portal". |
| No `token` or 404 | `h1` "This invitation link doesn't work". Body "The link may be incomplete. Open it again from the email, or ask the person who invited you to send a new one." Button **Go to the portal** (→ `/`). |
| `pending`, signed out | As drawn. Primary **Create an account**, secondary **Sign in**. |
| `pending`, signed in, same address | As drawn. Focus on `h1`. |
| `pending`, signed in, other address | As drawn. No accept button (AC 6). |
| `cancelled` | `h1` "This invitation was cancelled". Body "An Admin of {team} cancelled it. Ask them for a new invitation." |
| `expired` | `h1` "This invitation has expired". Body "Invitations work for 7 days. Ask an Admin of {team} to invite you again." |
| `accepted` | `h1` "This invitation has already been used". Body "If you accepted it, {team} is in your team list. Otherwise, ask an Admin of {team} for a new invitation." |
| Accept pending | **Accept invitation** → "Joining…", disabled. |
| Accept 200 | Navigate to `/dashboard` (the team is now current), toast "You joined {team} as {Role}." |
| Accept 409 `invitation-wrong-account` | Switch to the "other address" view. |
| Accept 409 `invitation-cancelled` / `-expired` / `-used` | Switch to that state's view. |
| Accept 401 | Session ended: go to sign-in with `email` and `next`. |
| Accept other | `ProblemAlert` "We couldn't accept the invitation. You haven't joined {team}. Try again." |
| Preview fails (5xx, network) | `ProblemAlert` "We couldn't load this invitation." **Try again**. |

Every non-pending view says nothing about the team beyond its name, and shows no apps (AC 6).

### 3.11 Delete account dialog (changed, AC 8; 007 §3.7)

The "This deletes" list now comes from `GET /v1/teams` and `GET /v1/apps?teamId=` for each team
with `memberCount === 1` (the personal team and any shared team they're alone in).

```
┌──────────────────────────────────────────┐
│ Delete your account? (title)             │
│ This deletes:                            │
│ • your account, ana@ex.com               │
│ • your 2 personal apps and their API keys│
│ • Side project, where you're the only    │
│   member, with its 1 app and its keys    │
│ You'll leave Payments and Platform tools.│  only when shared teams exist
│ Their apps and keys keep working.        │
│ Keys that are deleted stop working in    │
│ the gateway straight away. This can't be │
│ undone.                                  │
│ Password …  unchanged                    │
└──────────────────────────────────────────┘
```

- Lines with zero apps drop the app part ("• Side project, where you're the only member").
- If the app counts fail to load: "• your personal apps and their API keys" (as 007).

| State | UI |
| --- | --- |
| 409 `team-needs-admin` | `ProblemAlert` (destructive): title "Make someone else an Admin first". Body "You're the only Admin of " then the problem's `teams[]` as links to `/dashboard/teams/{id}`, joined "A, B and C". Then: ". Make another member an Admin in each, then delete your account. Your account was not deleted." The password field stays. |
| Everything else | Unchanged (007 §3.7). |

### 3.12 Invitation email (new, AC 3)

Rendered by the `team-invitation` template, in the 007 email layout (plain text and HTML, one
button, the link also as text).

| Part | Copy |
| --- | --- |
| Subject | "{inviter} invited you to {team} on {portal name}" (no inviter: "You're invited to {team} on {portal name}") |
| Heading | "Join {team}" |
| Body | "{inviter} invited you to the {team} team on {portal name} as {a Member / an Admin / a Read-only member}. Team members share apps and API keys." |
| Button | "Accept invitation" |
| Under button | "Or open this link: {link}" |
| Footer | "This invitation is for {email} and expires on {date, UTC}. If you weren't expecting it, you can ignore this email." |

## 4. Navigation

- The site header (019 §3.1) is unchanged. `/dashboard/teams/*` routes are under **My apps**, which
  has `aria-current="page"` there. `/invitations/accept` has no current link.
- Breadcrumbs: "My apps / New team", "My apps / {team name}".
- The team page is reached from the switcher's **Team settings**, from the team name on the App
  page, and after creating a team.

## 5. Copy

### 5.1 Labels and messages

| Where | Copy |
| --- | --- |
| Switcher trigger | "Team: {name}" |
| Switcher menu label | "Your teams" |
| Switcher items | "Team settings", "Create team" |
| Role descriptions | Admin: "Manages members and invitations, and can create apps and keys." · Member: "Creates apps and keys, and revokes keys." · Read-only: "Sees apps and key details. Can't create or revoke keys." |
| Read-only line, My apps | "You have Read-only access to {team}. Ask a team Admin to create apps." |
| Read-only alert, App page | "You have Read-only access. Ask a team Admin to create or revoke keys." |
| Non-Admin line, team page | "Only team Admins can invite people or change roles." |
| Buttons | "Create team", "Send invitation", "Cancel invitation", "Change role…", "Remove from team…", "Leave team…", "Save role", "Remove member", "Leave team", "Accept invitation", "Not now", "Create an account", "Sign in", "Sign out and use another account", "Go to My apps" |

### 5.2 Problem copy

Titles and details for the server's `security-problems.ts`-style table. The UI shows `detail`
where the screen says "the problem `detail`" and otherwise uses the screen's own copy.

| type | title | detail |
| --- | --- | --- |
| `team-role-forbidden` | Your team role doesn't allow this | Your role in this team doesn't allow this action. Nothing changed. |
| `team-needs-admin` (member actions) | This team needs an Admin | {team} needs at least one Admin. Make another member an Admin first. Nothing changed. |
| `team-needs-admin` (account deletion) | Make someone else an Admin first | You're the only Admin of a team that has other members. Make another member an Admin, then delete your account. Your account was not deleted. |
| `personal-team` | Personal teams can't have members | Only you can use your personal team. Create a team to invite people. |
| `already-member` | Already a member | This address belongs to someone already in the team. No invitation was sent. |
| `invitation-pending` | Invitation already pending | This address already has a pending invitation to this team. Cancel it to send a new one. |
| `invitation-wrong-account` | Signed in with a different address | This invitation is for a different email address. Sign in with that address to accept it. |
| `invitation-expired` | Invitation expired | This invitation has expired. Ask a team Admin to invite you again. |
| `invitation-cancelled` | Invitation cancelled | A team Admin cancelled this invitation. Ask them for a new one. |
| `invitation-used` | Invitation already used | This invitation has already been accepted. |

### 5.3 Text only screen readers get
- Switcher trigger: "Team: {name}. Switch team".
- After a switch: "Switched to {name}." (polite live region).
- Team page role badge: "Your role: {Role}".
- Members table caption: "Members of {team}"; invitations: "Pending invitations to {team}";
  My apps: "Apps in {team}".
- Row actions: "Actions for {name}"; "Cancel invitation to {email}".

## 6. Accessibility (WCAG 2.2 AA)

- **Keyboard path, My apps:** skip link → site header → team switcher → `h1` → Create app → list.
  The switcher opens with Enter, Space or ArrowDown; arrows move through teams; Enter selects;
  Escape closes and returns focus to the trigger (Radix default).
- **Keyboard path, team page (Admin):** switcher → breadcrumb → Email → Role → Send invitation →
  each member's `[⋯]` → each Cancel invitation → Leave team….
- **Focus after actions:** listed per state in §3. Dialogs trap focus; destructive dialogs give
  initial focus to **Cancel**; the change role dialog focuses the checked radio; closing returns
  focus to the control that opened it, or the next sensible target if that row is gone.
- **Labels:** every input has a visible `Label`. Field errors use `aria-invalid` and
  `aria-describedby`; the hint and the error are both described. The role `Select` is described by
  the `RoleHelp` text.
- **Announcements:** toasts use the 001 `Sonner` live region. Loading text is `aria-live="polite"`.
  A `ProblemAlert` takes focus when it appears after a submit.
- **Status not by colour:** `RoleBadge` always has the word. Read-only info and warnings have an icon
  and text.
- **Contrast:** every pair is from tokens.md (§2.2 for badges). Destructive outline buttons use
  `--destructive` text on `--background` (6.5:1) and a `--destructive` border (≥3:1).
- **Target size:** all controls are at least 24×24px (2.5.8); below 768px buttons and the switcher
  are 44px high, and the `[⋯]` button is 44×44px.
- **Headings:** one `h1` per page; sections are `h2`; member and invitation cards below 768px use
  `h3` for the name or email.
- **Reflow:** no horizontal scroll at 320px; tables become cards below 768px.

## 7. Responsive behaviour

| Element | 375px | 1280px |
| --- | --- | --- |
| Team switcher | Full width, 44px, above the breadcrumb/`h1`. Menu as wide as the trigger. | Content width up to 320px, left-aligned. Menu 280px min. |
| Team page | One column. Invite form stacks Email, Role, help, button (full width). Members and invitations as cards. | Content column `--portal-page-max-width`. Invite form: Email and Role side by side, button right-aligned. Tables. |
| Create team | Full-width form; buttons stacked, primary first. | `--portal-form-max-width` column; buttons right-aligned, Cancel first. |
| Dialogs | Full width with 16px margins; buttons stacked, primary first. | 480px wide; buttons right-aligned. |
| Accept page | Card, no border, full width. | Centred card `--portal-auth-max-width`. |
| App page team line | Wraps under the `h1`. | One line under the `h1`. |

## 8. Changes to earlier designs
- 019 §3.3 My apps, §3.4 Create app, §3.5 App page: team bar, Read-only variants (§3.2–§3.4 here).
- 001 §3.3/§3.4 sign-up and sign-in: read an optional `email` query parameter to fill the field.
- 007 §3.7 delete account: the "This deletes" list and the `team-needs-admin` state (§3.11 here).
  The 007 `last-admin` row (portal staff) is unchanged.

## 9. Notes for frontend, QA and the user-tester
- Hide controls from `app.role` (App page) and the current `TeamSummary.role` (My apps, Create app);
  `GET /v1/teams/{id}` → caller's role on the team page. Re-read on every page load so a role change
  shows on the next load (AC 9). Never cache roles across navigations.
- Always send `teamId` on `GET /v1/apps` and `POST /v1/apps`.
- The only-Admin pre-checks (§3.7, §3.9) are a courtesy; the server's 409 is the real guard, and both
  show the same message.
- QA: check every refusal view on the accept page (wrong account, cancelled, expired, used, unknown
  token) and that no team name other than the invitation's, and no app, is ever shown there.
- User-tester: invite a second address through Mailpit in the quickstart, accept in a private window,
  create a key as the invitee, then remove them and confirm the key still works.
