# 007 — Email and account security: UX design

Spec: [007-email-and-account-security](../specs/007-email-and-account-security.md).
Contract: `apps/server/openapi.yaml`. ADR: [0007](../adr/0007-account-email-and-security.md).

This spec adds six pages, one dialog, a verification banner and four emails, and it changes the
sign-in page, the header account menu, Create app and App detail. The global layout, shared
states, voice and focus rules from [001](001-kong-quickstart-slice.md) §2, §5 and §7 and the header
from [019](019-unified-portal-developer-journey.md) §3.1 still apply. Anything not mentioned here
stays as those designs say. **No new tokens.**

## 0. Principles for this change
- **Never reveal whether an address has an account.** The forgot-password page shows the same
  confirmation after a 200 and after a 429. An address that's taken and an address that's already
  yours get the same "can't be used" message.
- **Say what still works.** Every refusal says what didn't change ("Your account was not deleted",
  "Your password is unchanged") and what to do next.
- **Show secrets once, then never.** The SMTP password field is write-only. After saving, the page
  says only "A password is saved."
- **Verification is quiet until it matters.** If the admin doesn't require it, an unverified
  developer sees it only on their profile. If the admin requires it, a banner shows on My apps
  pages, because that's where it blocks them.
- **Destructive actions are confirmed with the password.** Deleting an account names what goes
  with it (apps and keys) before the developer confirms.

## 1. User flows

### Flow A — Developer: sign up and verify (AC 1)
1. The developer signs up on `/sign-up` (unchanged form).
2. They land on `next` or `/dashboard`, with the toast "Check {email} for a link to verify your
   address."
3. Within 30 seconds the "Verify your email" email arrives (§6.1).
4. They select **Verify email address**. Better Auth verifies them, signs them in on that device and
   redirects to `/profile?verified=1`.
5. **Success:** the profile page shows the alert "Your email address is verified." and the
   **Verified** badge next to the email.

Expired or used link: Better Auth redirects to `/profile?verified=1&error=invalid_token`. The
profile shows "That verification link has expired or was already used." and a **Send a new link**
button (§3.6). Signed out, the middleware sends them to sign-in first and keeps `next` (§3.1).

### Flow B — Developer: forgot password (AC 4, 5)
1. On `/sign-in` they select **Forgot password?**
2. `/forgot-password` opens, with the email already filled in if they had typed it on sign-in.
3. They select **Send reset link**. The page always shows "Check your email" (§3.2).
4. The "Reset your password" email arrives (§6.2). They select **Reset password**.
5. `/reset-password?token=…` opens. They enter a new password and select **Change password**.
6. **Success:** `/sign-in?reset=1` opens with the alert "Your password is changed. Sign in with your
   new password." Other sessions are already signed out.

Used or expired link (at step 5, or when they submit): the expired state with **Send a new link**
(§3.3). The password is unchanged.

### Flow C — Developer: change password while signed in (AC 6)
1. Header account menu → **Profile**.
2. In **Password**, they enter the current password and a new one, then select **Change password**.
3. **Success:** the alert "Password changed. You've been signed out everywhere else." The fields
   clear. Wrong current password: field error, password unchanged.

### Flow D — Developer: change name or email (AC 7)
1. On `/profile`, they edit **Name** and select **Save name**. **Success:** toast "Name saved." and
   the header shows the new name at once.
2. In **Email**, they select **Change email**, type the new address and select **Send confirmation
   link**.
3. **Pending:** the section shows "Waiting for you to confirm {new}. Until then, sign in with
   {current}." The "Confirm your new email address" email goes to the new address (§6.3).
4. They open the link. `/confirm-email?token=…` asks them to select **Confirm new email** (a click,
   so mail scanners that open links don't use the token).
5. **Success:** "Your email is now {new}. Use it the next time you sign in." The old address no
   longer signs in.

### Flow E — Developer: delete account (AC 9)
1. On `/profile`, in **Delete account**, they select **Delete account…**
2. A dialog names what's deleted (their apps and keys) and asks for their password.
3. They select **Delete account**.
4. **Success:** they're signed out and land on `/` with the toast "Your account is deleted."
5. Refused (wrong password, last admin, Kong unreachable): the dialog stays open with the reason,
   and nothing is deleted.

### Flow F — Developer blocked by "Require a verified email" (AC 3)
1. The developer opens `/dashboard/apps/new`. A banner says "Verify your email address to create
   apps and keys," with **Send verification email**. The submit button is disabled, and the reason
   is shown under it.
2. They select **Send verification email**. Status: "Sent. Check {email}."
3. They open the link and land on `/profile?verified=1`, then go back to **Create app**.
4. **Success:** the form submits as usual.

If the admin turned the setting on after the page loaded, submitting returns 403
`email-not-verified`. A `ProblemAlert` with the same resend button replaces the usual failure
(§3.7).

### Flow G — Admin: set up mail (AC 1, 2)
1. **Admin** → **Mail** (`/admin/settings/mail`).
2. A banner says which settings are in use. On the quickstart it says "Portal email uses the
   server's environment settings" and lists them read-only.
3. The admin fills in the form and selects **Save mail settings**. The banner changes to "Portal
   email uses the settings saved here."
4. In **Send a test email**, the admin keeps or changes the address and selects **Send test email**.
5. **Success:** "Test email sent to {to}. Check that inbox." Failure within 15 seconds: the host
   can't be reached, the sign-in failed, or the server refused the message. No password is shown.

### Flow H — Admin: require verification and set limits (AC 3, 8)
1. **Admin** → **Accounts** (`/admin/settings/accounts`).
2. They turn on **Require a verified email**. With no mail configured, the switch is disabled and
   links to Mail.
3. They adjust any of the three limits and select **Save account settings**.
4. **Success:** toast "Account settings saved." The settings apply to the next request.

## 2. Navigation changes

### 2.1 Header account menu
```
1280px                                         375px menu (019 §3.1), signed in
            [ ana@ex.com ▾ ]                   │ APIs                              │
            ┌───────────────────┐              │ My apps                           │
            │ Ana Silva         │ name, muted  │ Admin*                            │
            │ ana@ex.com        │ muted        │ Profile                           │  new
            │───────────────────│              │ Sign out                          │
            │ Profile           │ new          │ Ana Silva · ana@ex.com (muted)    │
            │ Sign out          │              └───────────────────────────────────┘
            └───────────────────┘
```
- Add **Profile** (→ `/profile`) above **Sign out**. Show the user's `name` above the email, so a
  name change is visible at once (AC 7). Long names and emails truncate with an ellipsis and keep
  the full value in `title`.
- On `/profile`, **Profile** has `aria-current="page"`. No top-level link is current there.

### 2.2 Admin section navigation
Admin pages get the `AdminNav` from the north star ([jso-316](jso-316-unified-api-portal.md) §3.2),
with only the routes that exist:

```
1280px: tabs under the header, before the h1         375px: labelled native select
APIs   Mail   Accounts                                Admin section
────   ────   ────────                                [ Mail                       ▾ ]
       ━━━━ (current: 2px --primary underline)
```

| Item | Route |
| --- | --- |
| APIs | `/admin/apis` |
| Mail | `/admin/settings/mail` |
| Accounts | `/admin/settings/accounts` |

The header's **Admin** link still goes to `/admin/apis`, and is current on all three routes.

## 3. Screens

All auth pages (§3.1–§3.5) use the 001 sign-up card: centred, `--portal-auth-max-width`, no border
below 768px. Password inputs have the 001 **Show**/**Hide** toggle and the same rules: at least 8
and at most 128 characters, hint "At least 8 characters."

### 3.1 Sign in — `/sign-in` (changed)
**Purpose and primary action:** unchanged (**Sign in**).

```
1280px / 375px (same card)
┌──────────────────────────────────┐
│ ┌ ✓ Your password is changed.   ┐ │  only with ?reset=1 (success Alert)
│ │   Sign in with your new one.  │ │
│ Sign in (h1)                     │
│ Email                            │
│ [______________________________] │
│ Password                         │
│ [__________________________][Show]│
│               Forgot password?   │  new: link, right-aligned, after the field
│ [            Sign in           ] │
│ New here? Create an account      │
└──────────────────────────────────┘
```
- **Forgot password?** links to `/forgot-password`, adding `?email=` with what's typed in Email if it
  looks like an address. It comes after the Show button in the tab order.
- 001's note "No Forgot password link" is replaced by this.

| State | Content |
| --- | --- |
| Default, field errors, wrong credentials, other failure, success, already signed in | Unchanged (001 §3.4). |
| `?reset=1` | Success `Alert` above the h1: "Your password is changed. Sign in with your new password." |
| `next` contains `error=invalid_token` (verification link opened while signed out) | Info line instead of the subtitle: "That verification link has expired or was already used. Sign in to send a new one." |
| Rate limited (429 `rate-limited`, AC 8) | Form-level `Alert` (destructive): "Too many sign-in attempts for this address. Try again in {time}." `{time}` comes from `Retry-After` (§5.3). **Sign in** stays enabled. The password field is cleared. |
| Loading, empty, no permission | n/a (static public form). |

### 3.2 Forgot password — `/forgot-password` (new, AC 4, 8)
**Purpose:** send a reset link without revealing whether the address has an account.
**Primary action:** **Send reset link**.

```
1280px / 375px                              after submit (same card)
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ Reset your password (h1)         │        │ ✉ Check your email (h1)          │  focused
│ Enter the email you sign in      │        │ If an account uses               │
│ with and we'll send you a link   │        │ ana@ex.com, we've sent it a link │
│ to choose a new password.        │        │ to reset the password. The link  │
│ Email                            │        │ works for 1 hour.                │
│ [______________________________] │        │ No email? Check spam, or wait a  │
│ [       Send reset link        ] │        │ few minutes and try again.       │
│ Back to sign in                  │        │ [      Back to sign in         ] │
└──────────────────────────────────┘        │ Use a different email            │
                                            └──────────────────────────────────┘
```
Calls Better Auth `request-password-reset` with `{ email, redirectTo: "/reset-password" }`.

| State | Content |
| --- | --- |
| Default | As wireframe. `?email=` pre-fills the field. |
| Field error | Empty or invalid: "Enter an email address, like name@example.com." Focus the field. |
| Pending | "Sending link…", disabled, field `readOnly`. |
| Success: 200 **or 429** | The "Check your email" view replaces the form. The h1 receives focus. **Use a different email** shows the form again with the field empty. Never show a rate-limit message here (spec Decisions). |
| Network failure or 5xx | Form-level `Alert`: "We couldn't send the link. Try again." Values kept. (Same for every address, so it reveals nothing.) |
| Signed in | Still works; no redirect. Signed-in people may want a reset link too. |
| Loading, empty, no permission | n/a. |

`<title>`: Reset your password · Developer Portal.

### 3.3 Choose a new password — `/reset-password` (new, AC 4, 5)
**Purpose:** set a new password from the emailed link. **Primary action:** **Change password**.

```
valid token                                 expired or used link
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ Choose a new password (h1)       │        │ This link has expired (h1)       │
│ New password                     │        │ Reset links work once, for 1     │
│ [__________________________][Show]│        │ hour. Your password hasn't       │
│ At least 8 characters.           │        │ changed. Send yourself a new     │
│ [        Change password       ] │        │ link to try again.               │
│ You'll be signed out on your     │        │ [       Send a new link        ] │ → /forgot-password
│ other devices.                   │        │ Back to sign in                  │
└──────────────────────────────────┘        └──────────────────────────────────┘
```
- One password field, not two: **Show** lets people check what they typed.
  `autocomplete="new-password"`.
- POST Better Auth `reset-password` with `{ newPassword, token }`.

| State | Content |
| --- | --- |
| `?token=` present | Form. |
| `?error=INVALID_TOKEN`, no token, or POST answers 400 `INVALID_TOKEN` (AC 5) | Expired view. The h1 receives focus if it replaced the form after submitting. |
| Field errors | Under 8: "Use at least 8 characters." Over 128: "Use 128 characters or fewer." Empty: "Enter a new password." |
| Pending | "Changing password…" |
| Success | Navigate to `/sign-in?reset=1` (§3.1). If a session exists on this device it's revoked too, so sign-in is always next. |
| 429 or other failure | Form-level `Alert`: "We couldn't change your password. Try again." The password is unchanged. |
| Loading, empty, no permission | n/a. The token is the permission. |

Strip `token` from the address bar (`history.replaceState`) once it's read, so it isn't kept in
history or sent as a `Referer`. Keep it in memory for the POST. `<title>`: Choose a new password ·
Developer Portal.

### 3.4 Confirm new email — `/confirm-email` (new, AC 7)
**Purpose:** finish an email change from the emailed link, signed in or not.
**Primary action:** **Confirm new email**.

```
default                                     success
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ Confirm your new email (h1)      │        │ ✓ Email changed (h1)             │  focused
│ Select the button to make this   │        │ Your email is now                │
│ the address you sign in with.    │        │ ana@new.example. Use it the next │
│ [      Confirm new email       ] │        │ time you sign in.                │
└──────────────────────────────────┘        │ [         Go to profile        ] │  or Sign in
                                            └──────────────────────────────────┘
```
POST `/v1/me/email/confirm` with `{ token }`. The page doesn't know the new address until the
response (the `User`), so it doesn't show it before.

| State | Content |
| --- | --- |
| Default | As wireframe. The token is read and stripped from the address bar as in §3.3. |
| No token | The expired view below. |
| Pending | "Confirming…" |
| Success 200 | "Email changed" view with `{response.email}`. Button **Go to profile** if a session exists (`GET /v1/me` 200), otherwise **Sign in** (→ `/sign-in`). |
| 400 `link-expired` | h1 "This link has expired". Body: "Email change links work once, for 24 hours, and a newer request replaces them. Your email hasn't changed. Go to your profile to send a new link." Button **Go to profile** (→ `/profile`, through sign-in if signed out). |
| 409 `email-unavailable` | h1 "This address can't be used". Body: "Your email hasn't changed. Go to your profile to choose another address." Button **Go to profile**. |
| Network failure or 5xx | Form-level `Alert`: "We couldn't confirm your email. Try again." Button stays. |
| Loading, empty, no permission | n/a. |

`<title>`: Confirm new email · Developer Portal.

### 3.5 Verify-email result
There's no separate page. The verification link goes to Better Auth, which redirects to
`/profile?verified=1` (with `&error=invalid_token` if the link is bad). §3.6 shows both results. Once
an alert is shown, remove `verified` and `error` from the URL (`replaceState`), so a reload doesn't
show it again.

### 3.6 Profile — `/profile` (new, AC 1, 6, 7, 9)
**Purpose:** see and change your own account. **Primary action:** none page-wide. Each section has
its own form and button, so changing one thing never submits another.

```
1280px (form column, --portal-form-max-width, left-aligned under PageHeader)
┌──────────────────────────────────────────────────────────────────────────────┐
│ Profile (h1)                                                                 │
│ Your name, sign-in email and password.                                       │
│ ┌ ✓ Your email address is verified. ─────────────────────────────────┐       │  only ?verified=1
│                                                                              │
│ ┌ Name (h2) ─────────────────────────────────────────────────────────┐       │
│ │ Name                                                               │       │
│ │ [ Ana Silva                                            ]           │       │
│ │ Shown in the portal header.                                        │       │
│ │ [Save name]                                                        │       │
│ └────────────────────────────────────────────────────────────────────┘       │
│ ┌ Email (h2) ────────────────────────────────────────────────────────┐       │
│ │ ana@ex.com   [✓ Verified]                          [Change email]  │       │
│ └────────────────────────────────────────────────────────────────────┘       │
│ ┌ Password (h2) ─────────────────────────────────────────────────────┐       │
│ │ Current password                                                   │       │
│ │ [__________________________________________][Show]                 │       │
│ │ New password                                                       │       │
│ │ [__________________________________________][Show]                 │       │
│ │ At least 8 characters. You'll be signed out on your other devices. │       │
│ │ [Change password]                                                  │       │
│ └────────────────────────────────────────────────────────────────────┘       │
│ ┌ Delete account (h2) ───────────────────────────── --destructive border ┐   │
│ │ Deletes your account, your apps and their API keys. Keys stop      │       │
│ │ working straight away. This can't be undone.                       │       │
│ │ [Delete account…]  (destructive variant)                           │       │
│ └────────────────────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Each section is a `Card` with an h2. Data: `GET /v1/me` (`email`, `name`, `emailVerified`,
`pendingEmail`, `verificationRequired`).

#### Email section variants
```
unverified                                                  
│ ana@ex.com   [⚠ Not verified]                          [Change email]  │
│ ┌ ⚠ Verify your email address. We sent a link to ana@ex.com when  ┐  │  warning Alert
│ │   you signed up. Creating apps and keys needs a verified address.│  │  2nd sentence only if
│ │   [Send verification email]                                     │  │  verificationRequired
│ └─────────────────────────────────────────────────────────────────┘  │

editing (after Change email)
│ ana@ex.com   [✓ Verified]                                          │
│ New email                                                          │
│ [______________________________________________]                   │
│ We'll send a confirmation link to this address. Until you open it, │
│ you sign in with ana@ex.com.                                       │
│ [Send confirmation link]  [Cancel]                                 │

pending change (pendingEmail set)
│ ana@ex.com   [✓ Verified]                          [Change email]  │
│ ⓘ Waiting for you to confirm ana@new.example. We sent it a link    │  info line
│   that works for 24 hours. Until then, sign in with ana@ex.com.    │
│   [Send the link again]                                            │
```
- Badges: `Verified` = `--portal-success` on `--portal-success-subtle`, `CircleCheck` icon. `Not
  verified` = `--portal-warning` on `--portal-warning-subtle`, `TriangleAlert` icon. Word and icon
  always, never colour alone.
- **Send the link again** re-POSTs `/v1/me/email` with `pendingEmail`. **Change email** while pending
  starts a new request, which replaces the old link (say so in the hint: "This replaces the link we
  sent to ana@new.example.").
- There's no cancel for a pending change (no endpoint). It expires on its own after 24 hours.

#### States
| State | UI |
| --- | --- |
| Loading | `PageHeader`, then four card skeletons in the layout's shape. |
| Signed out | Middleware → `/sign-in?next=/profile…` (keeps the query). |
| `GET /v1/me` fails | 001 `error.tsx`. |
| `?verified=1` | Success `Alert` under the header: "Your email address is verified." Focus it. |
| `?verified=1&error=invalid_token` | Warning `Alert`: "That verification link has expired or was already used." with **Send a new link** (resend, as below). If the account is already verified, show only "Your email address is already verified." |
| Empty | n/a: a signed-in user always has a profile. |
| No permission | n/a: every signed-in user has this page. |

**Name**
| State | UI |
| --- | --- |
| Validation | Empty after trimming: "Enter your name." Over 100: "Use 100 characters or fewer." |
| Pending | "Saving…" |
| Success | Toast "Name saved." Re-read the session so the header updates. |
| Unchanged value | **Save name** stays enabled; submitting shows the toast without a call. |
| Failure | Inline `ProblemAlert` in the card: "We couldn't save your name. Try again." |

**Resend verification** (`send-verification-email`, `{ email, callbackURL: "/profile?verified=1" }`)
| State | UI |
| --- | --- |
| Pending | "Sending…" |
| 200 | The button is replaced by status text (polite live region): "Sent. Check ana@ex.com. The link works for 24 hours." |
| 429 (AC 8) | Text in `--destructive`: "You've asked for several emails in a short time. Try again in {time}." The button is disabled for `Retry-After`, showing "Try again in {time}". |
| Other failure | "We couldn't send the email. Try again." |

**Change email** (`POST /v1/me/email`)
| State | UI |
| --- | --- |
| Validation | Empty or invalid: "Enter an email address, like name@example.com." |
| Pending | "Sending link…" |
| 202 | Section shows the pending variant from the response `User`. Toast: "Confirmation link sent to {new}." Focus the info line. |
| 409 `email-unavailable` | Field error: "This address can't be used. Choose another one." Never more than that. |
| 429 | Field-level `ProblemAlert`: "You've asked for several emails in a short time. Try again in {time}." |
| **Cancel** | Back to the read view, focus returns to **Change email**. |

**Change password** (Better Auth `change-password`, `{ currentPassword, newPassword }`; the server
forces `revokeOtherSessions`)
| State | UI |
| --- | --- |
| Validation | Current empty: "Enter your current password." New: as §3.3. |
| Pending | "Changing password…" |
| Success | Success `Alert` in the card: "Password changed. You've been signed out everywhere else." Both fields clear. Focus the alert. |
| 400 `INVALID_PASSWORD` (AC 6) | Field error under Current password: "This password is incorrect. Your password is unchanged." Clear and focus that field only. |
| 429 | `Alert` in the card: "Too many incorrect passwords. Try again in {time}. Your password is unchanged." |
| Other failure | "We couldn't change your password. Try again. Your password is unchanged." |

### 3.7 Delete account dialog (new, AC 9)
`AlertDialog`, opened from **Delete account…** on `/profile`.

```
1280px (dialog 480px wide)                   375px (dialog full width, 16px margins)
┌──────────────────────────────────────────┐
│ Delete your account? (title)             │
│ This deletes:                            │
│ • your account, ana@ex.com               │
│ • your 2 apps and all their API keys     │  from GET /v1/apps; "all your apps" if it fails
│ Keys stop working in the gateway straight│
│ away. This can't be undone.              │
│ Password                                 │
│ [________________________________][Show] │
│ Enter your password to confirm.          │
│ ┌ ⚠ (error ProblemAlert, when any) ────┐ │
│               [Cancel] [Delete account]  │  destructive; Cancel gets initial focus
└──────────────────────────────────────────┘
```
- With no apps: "• your account, ana@ex.com" only, no apps line.
- `DELETE /v1/me` `{ password }`. `autocomplete="current-password"`.
- The dialog can't be closed (Escape, overlay or Cancel) while the request is pending.

| State | UI |
| --- | --- |
| Validation | Empty password: "Enter your password." |
| Pending | **Delete account** → "Deleting account…", both buttons disabled. |
| 204 | Close, clear client state, navigate to `/`, toast "Your account is deleted." |
| 403 `invalid-password` | Field error: "This password is incorrect. Your account was not deleted." Clear and focus the field. |
| 409 `last-admin` | `ProblemAlert`: title "You're the only admin", body the `detail` (§5.2). The password field stays. |
| 503 `gateway-unavailable` | `ProblemAlert`: title "Gateway unavailable", body the `detail`. **Try again** with the `Retry-After` countdown, resubmitting the same password. |
| 502 `gateway-rejected` | `ProblemAlert`: title "The gateway rejected the request", body "Your account was not deleted. Some of your apps may already be removed. Try again, and if it keeps happening, tell the portal admin." |
| 429 | `ProblemAlert`: "Too many incorrect passwords. Try again in {time}. Your account was not deleted." |
| 401 (session ended) | 001 shared state: sign-in with `next=/profile`. |

A 503 or 502 may come after some apps were removed (spec Technical design, step 4). When the dialog
closes after one, re-fetch `/v1/apps` so the profile's app count is current.

### 3.8 Verification banner — My apps pages (new, AC 3)
Shown on `/dashboard`, `/dashboard/apps/new` and `/dashboard/apps/{id}` **only when**
`verificationRequired && !emailVerified`. It's a warning `Alert` at the top of `<main>`, under the
header and above `PageHeader`. It can't be dismissed.

```
1280px
┌ ⚠ Verify your email address to create apps and keys ────────────────────────┐
│ We sent a link to ana@ex.com. Keys you already have keep working.            │
│ [Send verification email]   Wrong address? Change it in your profile.        │
└──────────────────────────────────────────────────────────────────────────────┘
375px: same content, button full width below the text.
```
The resend states are the same as on the profile (§3.6). **Change it in your profile** links to
`/profile`.

### 3.9 Create app and New key (changed, AC 3)
**Create app** (`/dashboard/apps/new`), when `verificationRequired && !emailVerified`:
- The form stays visible, so people can see what they'll get.
- **Create app and get key** is `aria-disabled="true"` (focusable, not `disabled`), with this text
  under it, linked through `aria-describedby`: "Verify your email address first. Use the button at
  the top of the page." Activating it moves focus to the banner.

**New key** on App detail (`/dashboard/apps/{id}`): the same treatment for **Create key**, with the
same text.

A 403 `email-not-verified` from either call (setting turned on after the page loaded):
| Where | UI |
| --- | --- |
| Create app | `ProblemAlert` above the form. Title "Verify your email address", body the `detail` (§5.2), and **Send verification email** as the alert's action (resend states as §3.6). Values kept. Focus the alert. Re-read `/v1/me`, so the banner and the disabled state appear. |
| Create key | The same `ProblemAlert`, inline above the keys table. |

### 3.10 Admin: Mail — `/admin/settings/mail` (new, AC 1, 2)
**Purpose:** choose how the portal sends email and prove it works. **Primary action:** **Save mail
settings**. Second action: **Send test email**.

```
1280px (form column 640px)
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs   Mail   Accounts                                                       │
│ Mail (h1)                                                                    │
│ How the portal sends verification and password reset emails.                 │
│                                                                              │
│ ┌ ⓘ Portal email uses the server's environment settings ───────────────┐     │  source banner
│ │ These come from the SMTP_* variables. Save settings below to use      │     │  (variants below)
│ │ them instead.                                                         │     │
│ │ Host       mailpit                 Security  None                     │     │  read-only <dl>,
│ │ Port       1025                    Username  Not set                  │     │  mono values
│ │ Sender     API Portal <portal@example.com>   Password  Not set        │     │
│ └───────────────────────────────────────────────────────────────────────┘     │
│ ┌ SMTP settings (h2) ───────────────────────────────────────────────────┐    │
│ │ Host                              Port                                │    │
│ │ [ smtp.example.com            ]   [ 587  ]                            │    │
│ │ Security                                                              │    │
│ │ (•) STARTTLS — usually port 587                                       │    │
│ │ ( ) TLS — usually port 465                                            │    │
│ │ ( ) None — only for a local test server                               │    │
│ │ Username (optional)                                                   │    │
│ │ [ portal@example.com                                     ]            │    │
│ │ Password (optional)                                                   │    │
│ │ [____________________________________________][Show]                  │    │
│ │ Stored encrypted. It's never shown again after you save.              │    │
│ │ Sender name                       Sender address                      │    │
│ │ [ Acme Developer Portal       ]   [ portal@acme.com              ]    │    │
│ │ [Save mail settings]                                                  │    │
│ └───────────────────────────────────────────────────────────────────────┘    │
│ ┌ Send a test email (h2) ───────────────────────────────────────────────┐    │
│ │ Sends with the settings in use now. Save your changes first.          │    │
│ │ Send to                                                               │    │
│ │ [ ana@ex.com                                    ] [Send test email]   │    │
│ │ (result line)                                                         │    │
│ └───────────────────────────────────────────────────────────────────────┘    │
│ Remove saved settings  (link-style destructive button, only when saved)      │
└──────────────────────────────────────────────────────────────────────────────┘
375px: one column. Host/Port and Sender name/address stack. The banner's <dl> is one column.
Send test email goes full width under the field.
```

**Source banner** (from `MailSettings.source`):
| `source` | Banner |
| --- | --- |
| `environment` | Info `Alert`, as wireframe. The `<dl>` shows `environment`: Host, Port, Security (STARTTLS/TLS/None), Username (or "Not set"), Password ("Set" or "Not set", from `hasPassword`), Sender ("{senderName} <{senderAddress}>"). |
| `saved` | Success `Alert`: "Portal email uses the settings saved here." and "Last saved {relative time}." from `updatedAt` (`<time>` with the exact UTC value in `title`). If `environment` isn't null, also: "The server's environment settings are ignored while these are saved." |
| `none` | Warning `Alert`: title "Portal email is off", body "Nobody gets verification or password reset emails. Save SMTP settings below to turn it on." |

**Form fields** (`SaveMailSettingsRequest`):
| Label | Input | Default / prefill | Validation message |
| --- | --- | --- | --- |
| Host | text, mono, `autocomplete="off"`, `spellcheck="false"` | `saved.host`, else empty | Empty: "Enter the SMTP server's host name." |
| Port | `inputmode="numeric"`, width 8ch | `saved.port`, else 587 | Not 1–65535: "Enter a port from 1 to 65535." |
| Security | `RadioGroup`, three options as wireframe | `saved.security`, else STARTTLS | — |
| Username (optional) | text, `autocomplete="off"` | `saved.username` | Over 254: "Use 254 characters or fewer." |
| Password (optional) | `SecretReplacementField` (§4) | — | Over 1024: "Use 1024 characters or fewer." |
| Sender name | text | `saved.senderName`, else empty | Empty: "Enter the name emails come from." |
| Sender address | email | `saved.senderAddress`, else empty | "Enter an email address, like portal@example.com." |

Choosing a security option doesn't change the port, because people might use a non-standard one.
The option text gives the usual port.

Password in the request: omit when unchanged, a string when replaced, `null` when **Remove
password** was chosen.

| State | UI |
| --- | --- |
| Loading | Admin nav, header, banner skeleton, form skeleton. |
| Not an admin | 001: the 404 page. Signed out: sign-in with `next`. |
| `GET` fails | `ProblemAlert` in place of the form: "We couldn't load the mail settings." **Try again**. |
| Save pending | "Saving…", fields `readOnly`. |
| Save 200 | Toast "Mail settings saved." Banner updates to `saved`. The password field goes back to "A password is saved." (or empty). Focus stays on the button. |
| Save 400 | Field errors from `errors[].pointer`, focus the first. |
| Empty | n/a: the form always shows. |

**Send a test email** (`POST /v1/admin/settings/mail/test`, `{ to }`):
- **Send to** is pre-filled with the admin's own email.
- While the form has unsaved changes, **Send test email** is `aria-disabled` and the hint becomes
  "Save your changes first. The test uses the settings in use now." This stops people testing
  settings they haven't saved.
- Pending: "Sending…", and the line "This can take up to 15 seconds." (polite live region).

| Response | Result line (under the field; `role="status"` for success, `ProblemAlert` for errors) |
| --- | --- |
| 200 | ✓ "Test email sent to {to} using the {saved \| environment} settings. Check that inbox." |
| 409 `mail-not-configured` | "There are no mail settings to test. Save SMTP settings first." |
| 422 `smtp-unreachable` | Title "Can't reach the mail server". Body: the `detail` (§5.2). |
| 422 `smtp-auth-failed` | Title "The mail server rejected the sign-in". Body: the `detail`. |
| 422 `smtp-rejected` | Title "The mail server refused the message". Body: the `detail`. |
| 400 | Field error: "Enter an email address, like name@example.com." |

None of these messages contain the password, the username or the server's reply (AC 2).

**Remove saved settings** (`DELETE`): an `AlertDialog`.
- Title "Remove the saved mail settings?"
- Body: if `environment` is set, "The portal goes back to the server's environment settings
  ({environment.host})."; otherwise, "Portal email will be off. Nobody will get verification or
  password reset emails."
- Buttons **Cancel** · **Remove settings** (destructive).
- 200: toast "Saved mail settings removed." Banner and form update.
- 409 `mail-required`: `ProblemAlert` in the dialog, title "Mail is required", body the `detail`
  (§5.2), with the link **Go to account settings**.

### 3.11 Admin: Accounts — `/admin/settings/accounts` (new, AC 3, 8)
**Purpose:** decide whether verification is required and how strict the limits are.
**Primary action:** **Save account settings** (one form, sent whole, as the contract requires).

```
1280px (form column 640px)
┌──────────────────────────────────────────────────────────────────────────────┐
│ APIs   Mail   Accounts                                                       │
│ Accounts (h1)                                                                │
│ Email verification and limits that protect sign-in and inboxes.              │
│ ┌ Email verification (h2) ──────────────────────────────────────────────┐    │
│ │ [○──] Require a verified email                                        │    │  Switch, off
│ │ Developers who haven't verified their address can't create apps or    │    │
│ │ keys until they do. Keys they already have keep working. Accounts     │    │
│ │ from before this setting existed count as verified.                   │    │
│ │ ⚠ Set up mail first. Without it, nobody can get a verification email.│    │  only if !mailConfigured
│ │   Go to mail settings                                                 │    │
│ └───────────────────────────────────────────────────────────────────────┘    │
│ ┌ Rate limits (h2) ─────────────────────────────────────────────────────┐    │
│ │ Over a limit, people wait before trying again.                        │    │
│ │ Failed sign-ins, per email address                     (fieldset)     │    │
│ │ [ 10 ] attempts in [ 15 ] minutes                                     │    │
│ │ Password reset emails, per email address                              │    │
│ │ [  3 ] emails in   [ 60 ] minutes                                     │    │
│ │ Verification emails, per account                                      │    │
│ │ [  3 ] emails in   [ 60 ] minutes                                     │    │
│ │ Counts resends and email changes, not the email sent at sign-up.      │    │
│ └───────────────────────────────────────────────────────────────────────┘    │
│ [Save account settings]                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
375px: same order. Each limit row stays on one line ([ 10 ] attempts in [ 15 ] minutes) — the
inputs are 6ch wide, so it fits in 343px; it may wrap after "in" on larger text sizes.
```
- Each limit is a `<fieldset>` whose `<legend>` is the bold line. Each input has a visually hidden
  label: "Failed sign-ins: maximum attempts", "Failed sign-ins: window in minutes", and so on.
- **Switch disabled** when `mailConfigured` is false **and** the setting is off. If it's on while mail
  isn't configured (environment removed later), it stays enabled so the admin can turn it off, and
  the warning shows.

| State | UI |
| --- | --- |
| Loading | Skeletons in the layout's shape. |
| Not an admin / signed out | As §3.10. |
| `GET` fails | `ProblemAlert`: "We couldn't load the account settings." **Try again**. |
| Validation | Max not 1–1000: "Enter a number from 1 to 1000." Window not 1–1440: "Enter minutes from 1 to 1440 (24 hours)." Shown under the fieldset; focus the first invalid input. |
| Pending | "Saving…" |
| 200 | Toast "Account settings saved." |
| 409 `mail-not-configured` | `ProblemAlert` above the button: title "Set up mail first", body the `detail` (§5.2), link **Go to mail settings**. The switch goes back to off. Nothing was saved. |
| Empty | n/a. |

## 4. Components

**Reused without change:** `PageHeader`, `Card`, `Button`, `Input`, `Label`, `Field`, `Alert`,
`AlertDialog`, `Badge`, `RadioGroup`, `Skeleton`, `ProblemAlert`, toast (Sonner).

**shadcn/ui to add to `packages/ui`:** `Switch` (Radix). Track `--input` when off, `--primary` when
on; thumb `--background`. Its label is a real `<label>`, and its hint is linked through
`aria-describedby`.

**New (in `apps/portal` unless noted):**

| Component | Props | Notes |
| --- | --- | --- |
| `PasswordInput` (`packages/ui`) | `Input` props, plus `showLabel?` (default "Show"), `hideLabel?` | The 001 Show/Hide pattern as one component, so all five password fields match. The toggle is a `button type="button"` with `aria-pressed` and `aria-controls`. |
| `VerifiedBadge` | `verified: boolean` | "Verified" or "Not verified", with an icon (§3.6). |
| `ResendVerification` | `email: string`, `variant: 'button' \| 'alert-action'` | Owns the resend call and its four states, including the `Retry-After` countdown. Used by the profile, the banner and the 403 alert. |
| `VerificationBanner` | `user: User` | Renders nothing unless `verificationRequired && !emailVerified` (§3.8). |
| `SecretReplacementField` | `label`, `hasSecret: boolean`, `onChange(value: string \| null \| undefined)` | From jso-316 §11.2. With no stored secret: a `PasswordInput`. With one: the text "A password is saved." and **Replace password** / **Remove password**. Replace shows an empty `PasswordInput` and **Keep saved password**. Remove shows "The saved password will be removed when you save." and **Undo**. It never renders the stored value or a fake mask like `••••`. |
| `AdminNav` | `current: 'apis' \| 'mail' \| 'accounts'` | From jso-316 §3.2: tabs (`nav` with links, `aria-current="page"`) from 768px, a labelled native `select` below. |
| `ResultPanel` (auth card variant) | `icon`, `title`, `children`, `actions` | The "Check your email", "Email changed" and expired views. The h1 receives focus when it replaces a form. |

## 5. Copy

Voice from 001 §5: plain, short, second person, sentence case, no blame, no exclamation marks.

### 5.1 Page titles
| Route | `<title>` |
| --- | --- |
| `/forgot-password` | Reset your password · Developer Portal |
| `/reset-password` | Choose a new password · Developer Portal |
| `/confirm-email` | Confirm new email · Developer Portal |
| `/profile` | Profile · Developer Portal |
| `/admin/settings/mail` | Mail settings · Developer Portal |
| `/admin/settings/accounts` | Account settings · Developer Portal |

### 5.2 Problem titles and `detail` strings (for `problem.ts`)
The server sends these exact strings. The UI shows `detail` as the alert body unless a screen above
overrides it.

| `type` | `title` | `detail` |
| --- | --- | --- |
| `/problems/email-not-verified` | Verify your email address | The portal admin requires a verified email address before you create apps or keys. Select Send verification email, then open the link we send you. Nothing was created. |
| `/problems/invalid-password` | Incorrect password | This password is incorrect. Nothing was changed. |
| `/problems/last-admin` | You're the only admin | You're the only admin of this portal, so your account can't be deleted. Make another account an admin first. Your account was not deleted. |
| `/problems/gateway-unavailable` (on `DELETE /v1/me`) | Gateway unavailable | The API gateway didn't respond, so your keys can't be removed yet. Your account was not deleted. Try again in a moment. |
| `/problems/email-unavailable` | Email address can't be used | This address can't be used. Choose another one. |
| `/problems/link-expired` | Link expired | This link has expired or was already used. Nothing was changed. Request a new link. |
| `/problems/mail-required` | Mail is required | "Require a verified email" is on and the server has no environment mail settings, so removing these would stop all portal email. Turn off "Require a verified email" first, or set the SMTP_* environment variables. |
| `/problems/mail-not-configured` | Set up mail first | There are no mail settings, so nobody could receive a verification email. Save SMTP settings on the Mail page, then try again. |
| `/problems/smtp-unreachable` | Can't reach the mail server | The portal couldn't connect to the mail server. Check the host, port and security setting, and that the server allows connections from the portal. |
| `/problems/smtp-auth-failed` | The mail server rejected the sign-in | The mail server didn't accept the username and password. Check them and save again. |
| `/problems/smtp-rejected` | The mail server refused the message | The portal signed in, but the mail server refused the sender or recipient. Check that the sender address is allowed to send from this account. |
| `/problems/rate-limited` (auth routes) | Too many requests | Too many attempts in a short time. Try again later. |

The `rate-limited` `detail` is generic on purpose. The UI builds its own message from
`Retry-After` (§5.3), so the server never writes an address or a count into a response.

### 5.3 Waiting times
`{time}` comes from `Retry-After` in seconds: under 60 → "{n} seconds" ("1 second"); under 3600 →
"{m} minutes", rounded up ("1 minute"); otherwise "{h} hours", rounded up. Missing header → "a few
minutes". Countdown buttons tick every second below 60 seconds and every minute above.

### 5.4 Buttons and links (exact labels)
Forgot password? · Send reset link · Back to sign in · Use a different email · Change password ·
Send a new link · Confirm new email · Go to profile · Profile · Save name · Change email ·
Send confirmation link · Send the link again · Send verification email · Delete account… (opens
the dialog) · Delete account (in the dialog) · Save mail settings · Send test email · Replace
password · Keep saved password · Remove password · Undo · Remove saved settings · Remove settings ·
Go to mail settings · Go to account settings · Save account settings · Cancel · Try again ·
Try again in {time}

Pending: Sending link… · Changing password… · Confirming… · Saving… · Sending… · Deleting account…

### 5.5 Toasts
| Event | Text |
| --- | --- |
| Signed up | Check {email} for a link to verify your address. |
| Name saved | Name saved. |
| Email change requested | Confirmation link sent to {new}. |
| Account deleted | Your account is deleted. |
| Mail settings saved | Mail settings saved. |
| Saved settings removed | Saved mail settings removed. |
| Account settings saved | Account settings saved. |

## 6. Emails

Fixed templates (`apps/server/src/mail/templates.ts`), each with a text and an HTML part.
- **From:** the effective sender: `{senderName} <{senderAddress}>`.
- `{portalUrl}` is `PORTAL_PUBLIC_URL`. `{portalHost}` is its host, for example `localhost:3000`.
- **HTML:** one column, 560px max, system font stack, no remote images, no tracking. The button is a
  link styled as a button, and the raw link is repeated as text under it. Email clients don't support
  CSS variables, so colours are the default token values inlined at build time from `tokens.md`
  (`--primary`, `--primary-foreground`, `--foreground`, `--muted-foreground`, `--border`). Making
  emails follow a customer theme belongs with the theme editor (spec 013).
- **Text part:** the same words, with the link on its own line.
- Never put the recipient's password, the token on its own, or any SMTP detail in an email. The link
  is the only secret.

### 6.1 Verify your email (`verify`)
- **Subject:** Verify your email for {portalHost}
- **Body:**
  > Hi {name},
  >
  > Confirm that {email} is your address for the developer portal at {portalHost}.
  >
  > **[Verify email address]** ({link})
  >
  > The link works for 24 hours. If you didn't create an account, you can ignore this email.

### 6.2 Reset your password (`reset-password`)
- **Subject:** Reset your password for {portalHost}
- **Body:**
  > Someone asked to reset the password for {email} on the developer portal at {portalHost}.
  >
  > **[Reset password]** ({link})
  >
  > The link works once, for 1 hour. If you didn't ask for this, ignore this email. Your password
  > stays the same.

### 6.3 Confirm your new email address (`confirm-email`)
- **To:** the new address.
- **Subject:** Confirm your new email for {portalHost}
- **Body:**
  > Hi {name},
  >
  > Confirm that you want to sign in to the developer portal at {portalHost} with {newEmail}.
  >
  > **[Confirm new email]** ({link})
  >
  > The link works for 24 hours. Until you open it, you sign in with your current address. If you
  > didn't ask for this, ignore this email and nothing changes.

The old address gets no email in this spec. A security notice to the old address belongs with
notification emails (spec Out of scope).

### 6.4 Test email (`test`)
- **Subject:** Test email from {portalHost}
- **Body:**
  > This is a test email from the developer portal at {portalHost}. If you can read it, the portal
  > can send email with the {saved | environment} mail settings.
  >
  > Sent by {adminEmail} from the Mail settings page.

## 7. Accessibility (WCAG 2.2 AA)

### Keyboard paths
- **Forgot password:** sign-in Email → Password → Show → **Forgot password?** (Enter) → Email
  (pre-filled, focused on load) → **Send reset link** → focus lands on the "Check your email" h1.
- **Reset:** New password (focused on load) → Show → **Change password**.
- **Delete account:** **Delete account…** (Enter) → the dialog opens with focus on **Cancel**, so
  Enter alone never deletes → Shift+Tab to Password → Tab to **Delete account**. Escape closes the
  dialog unless a request is pending. Focus returns to **Delete account…**.
- **Admin mail:** AdminNav → banner (not focusable) → Host → Port → Security radios (arrow keys) →
  Username → Password (or Replace/Remove) → Sender name → Sender address → **Save mail settings** →
  Send to → **Send test email** → **Remove saved settings**.

### Focus rules (in addition to 001 §7)
- A result view that replaces a form (§3.2, §3.3, §3.4) moves focus to its h1 (`tabIndex=-1`).
- A success alert after an action within a page (password changed, `?verified=1`) gets focus. A
  toast alone never carries a result that the person must read.
- Field errors focus the first invalid field. Error alerts (`ProblemAlert`) get focus (001).
- A disabled-for-a-reason button uses `aria-disabled="true"`, stays focusable, and its reason is
  visible text linked with `aria-describedby` (Create app, Create key, Send test email). Disabled
  countdown buttons (`Try again in {time}`) use `aria-disabled` too.

### Labels and semantics
- Every input has a visible `<label>`, except the rate-limit numbers, which sit inside a
  `<fieldset>` with a visible legend and have visually hidden labels (§3.11).
- `autocomplete`: `email`, `current-password` (sign-in, current password, delete dialog),
  `new-password` (reset, new password), `name` (profile name), `off` for SMTP host, username and
  password, so the browser doesn't fill in the admin's own portal password.
- Live regions: resend status and test-email "Sending…" are `role="status"` (polite). Countdown text
  isn't announced every tick: announce only the start ("Try again in 5 minutes") and when it's
  enabled again ("You can try again now").
- Badges and banners always have a word and an icon (`aria-hidden` on the icon).
- The Switch has `role="switch"` with `aria-checked`, and its disabled reason is in its
  `aria-describedby`.
- Tokens are never in the page title or anywhere else people can see (stripped from the URL, §3.3).

### Contrast, size, motion
All colours are existing token pairs, which meet 4.5:1 for text and 3:1 for UI (tokens.md). The
destructive card border on Delete account uses `--destructive` (6.5:1). Touch targets are at least
44×44px below 768px (001). No new motion.

## 8. Responsive behaviour

| Screen | 375px | 1280px |
| --- | --- | --- |
| Sign in, Forgot, Reset, Confirm email | Card fills the width with 16px gutters and no border. Buttons full width, 44px. | Card centred, `--portal-auth-max-width`. |
| Profile | One column. Card buttons full width. **Change email** moves under the address. Long addresses wrap (`overflow-wrap: anywhere`). | Form column `--portal-form-max-width`, left-aligned. Buttons are their natural width. |
| Delete dialog | Full width minus 16px margins. Buttons stack: **Delete account** on top, **Cancel** below, both full width. | 480px, buttons right-aligned on one row. |
| Verification banner | Button full width under the text. | Button and link inline. |
| AdminNav | Native select labelled "Admin section". | Tabs. |
| Admin Mail | Paired fields stack. The environment `<dl>` is one column. Test button full width under the field. | Host/Port and Sender name/address in two columns (3:1 and 1:1). |
| Admin Accounts | Limit rows stay inline (6ch inputs). | Same. |

At 200% zoom and 320 CSS px, nothing scrolls sideways. Mono values (host, addresses) wrap.

## 9. Notes for frontend, QA and the user-tester
- **Spec 019 is changing the header at the same time.** Add **Profile** and the name to whichever
  header is on `main` when you build. The rest of these pages are new routes.
- **Middleware:** add `/profile` to the protected routes. `/forgot-password`, `/reset-password` and
  `/confirm-email` are public, and not redirected when signed in.
- **QA, AC 4 and 8:** the forgot-password page must look identical for a known address, an unknown
  address and a 429. Compare screenshots or the DOM.
- **QA, AC 2:** check the test-email error text for the password and username you entered.
- **User-tester:** read every email in Mailpit (`http://127.0.0.1:8025`). Check that the link works
  from a second browser profile (verify and confirm-email links can be opened signed out).
- **Static demo mode:** the static demo has no server, so it must not serve these pages. Its header
  has no account menu. Treat `/profile`, `/forgot-password`, `/reset-password`, `/confirm-email` and
  the admin settings routes the way the demo already treats `/dashboard` and `/admin`.
