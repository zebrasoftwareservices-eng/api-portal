# 023 — Create an app shows products first

Spec: [`docs/specs/023-create-app-products-first.md`](../specs/023-create-app-products-first.md).
Screen: `/dashboard/apps/new` (`apps/portal/components/create-app.tsx`). Tokens: [`tokens.md`](tokens.md),
no new tokens.

The form answers one question before anything else: **"Is what I want offered as a product?"**
If yes, the developer follows the product's link to its plans (spec 009). If no, they pick the
loose APIs their app calls. A product's API is never a checkbox here.

## Data the screen uses

No new fields. Everything comes from calls the form already makes or can make.

| Need | Source |
| --- | --- |
| Product rows | `GET /v1/products` → `items[]`: `name`, `slug`, `description`, `planCount`, `allPlansRequireApproval`, `selfService` |
| APIs listed under each product | `GET /v1/apis` → items whose `products[]` contains that product's `id`; show `title` |
| Loose API checkboxes | `GET /v1/apis` → items with `products.length === 0` |
| Admin copy | `GET /v1/me` → `user.role === 'admin'` |
| Stale-page refusal | `POST /v1/apps` → 409 `/problems/api-in-product`, `detail`, `errors[]`, `products[]` |

Products are listed in the order the server returns them. A product with no visible API in
`GET /v1/apis` still shows its row; its API line is then omitted.

## User flow

**A. Subscribe to a product (spec 009 path)**
1. Developer opens **My apps** → **Create an app** (or arrives from an API page).
2. The **Products** section is first. They read a product's name, its one-line description and
   the APIs it includes.
3. They choose **Subscribe** (or **Request access**). The link opens `/products/{slug}`, the plan
   table. The Create an app form is left; nothing is created here.
4. On the product page they pick a plan; spec 009 creates a new app with one key and one plan,
   which appears in My apps (AC 9).

**B. Create an app for loose APIs (spec 004 path)**
1. Same entry. Below the products, the **APIs not in a product** section lists loose APIs, all
   unchecked (unless `?api=<slug>` names a loose API, which is pre-checked).
2. They enter **App name** (and optionally a description) and check one or more APIs.
3. They choose **Create app and get key**. On success the existing key-shown-once screen appears
   (unchanged from spec 004).
4. If they submit with nothing checked, nothing is created; the message appears beside the APIs
   section and focus moves to it (AC 4).

**C. Portal admin**
1. Admin opens the same form. A product with no plans shows **Needs a plan** and a link
   **Add a plan** to `/admin/products/{slug}` (AC 7).

## Screen: Create an app

Purpose: send the developer to the right path — product plan or loose API key — in one glance.
Max width `--portal-form-max-width` (640px). Order is fixed: header → team line → alert (if any)
→ Products → app form (name, description, APIs) → actions.

### 1280px

```
 My apps / New app
 Create an app                                                   (h1, text-3xl)
 Subscribe to a product to get a key on a plan, or create an app for
 an API that isn't in a product.                                 (muted)
 This app will belong to Acme Platform.

 ┌ Products ───────────────────────────────────────────────── (h2) ┐
 │ Products bundle APIs with a plan: rate limit, quota and, for      │
 │ some, approval. Subscribing creates an app with its own key.      │
 │                                                                   │
 │ ┌───────────────────────────────────────────────────────────────┐ │
 │ │ Payments                                        [ Subscribe → ]│ │
 │ │ Take card payments and issue refunds.                          │ │
 │ │ Includes: Payments API, Refunds API                            │ │
 │ ├───────────────────────────────────────────────────────────────┤ │
 │ │ Partner Data                               [ Request access → ]│ │
 │ │ Bulk exports for partners.                                     │ │
 │ │ Includes: Exports API                                          │ │
 │ │ ⓘ Every plan needs approval from the API owner.               │ │
 │ ├───────────────────────────────────────────────────────────────┤ │
 │ │ Ledger                                       [ View product → ]│ │
 │ │ Includes: Ledger API                                           │ │
 │ │ ⓘ An admin assigns this product's plans to your team.         │ │
 │ ├───────────────────────────────────────────────────────────────┤ │
 │ │ Shipping                              ◷ Not available yet      │ │
 │ │ Includes: Rates API                                            │ │
 │ │ This product has no plans yet. Check back later.               │ │
 │ └───────────────────────────────────────────────────────────────┘ │
 └───────────────────────────────────────────────────────────────────┘

 Or create an app for APIs that aren't in a product            (h2)

 App name
 [______________________________________________]
 Up to 80 characters. Only your team can see it.

 Description (optional)
 [______________________________________________]

 ┌ APIs not in a product (fieldset legend) ─────────────────────────┐
 │ This app's keys work only on the APIs you choose here.           │
 │ ☐ Sample HTTP API  v1                                            │
 │   https://gateway.example.com/sample                  (mono)     │
 └──────────────────────────────────────────────────────────────────┘

 [ Create app and get key ]   Cancel
```

Admin view of the no-plan row:

```
 │ Shipping                                   ⚠ Needs a plan        │
 │ Includes: Rates API                                              │
 │ Developers can't subscribe until it has a plan.  Add a plan →    │
```

### 375px

Same order, one column, gutter 16px. Product row action moves under the text, full width.

```
 Create an app                 (text-2xl)
 Subscribe to a product…       (muted)

 Products                      (h2)
 Products bundle APIs…
 ┌───────────────────────────┐
 │ Payments                  │
 │ Take card payments and…   │
 │ Includes: Payments API,   │
 │ Refunds API               │
 │ [      Subscribe →      ] │
 ├───────────────────────────┤
 │ Shipping                  │
 │ ◷ Not available yet       │
 │ Includes: Rates API       │
 │ This product has no plans │
 │ yet. Check back later.    │
 └───────────────────────────┘

 Or create an app for APIs
 that aren't in a product      (h2)
 App name  [______________]
 ...
 ☐ Sample HTTP API  v1
 [ Create app and get key ]    (full width)
 Cancel
```

### Content rules
- **Product row:** name (`text-lg`, 600) is plain text, not a link — the action is the one link,
  so each row has a single tab stop. Description: first line of the markdown rendered as plain
  text, clamped to 2 lines (`text-sm`, `--muted-foreground`); omitted when empty.
  "Includes:" lists API titles, comma-separated, `text-sm`.
- **Row action** (from the tech-design table; first matching row wins):

  | Condition | Developer | Portal admin |
  | --- | --- | --- |
  | `planCount == 0` | Badge **◷ Not available yet** + "This product has no plans yet. Check back later." No link. | Badge **⚠ Needs a plan** + "Developers can't subscribe until it has a plan." + link **Add a plan** → `/admin/products/{slug}` |
  | `selfService == false` | Link **View product** → `/products/{slug}` + note "An admin assigns this product's plans to your team." | same |
  | `allPlansRequireApproval` | Link **Request access** → `/products/{slug}` + note "Every plan needs approval from the API owner." | same |
  | otherwise | Link **Subscribe** → `/products/{slug}` | same |

  Links are styled as secondary buttons (`--secondary` / `--secondary-foreground`, border `--input`)
  with a trailing → icon (`aria-hidden`). They are `<a>` elements, not buttons, because they navigate.
  The primary-button style stays reserved for **Create app and get key**.
- **Badges:** `--portal-text-xs`. Not available yet: `--muted` fill, `--muted-foreground` text,
  clock icon. Needs a plan: `--portal-warning-subtle` fill, `--portal-warning` text, warning icon.
  Word + icon, never colour alone.
- **Loose APIs:** unchanged row (checkbox, title, version badge, mono gateway URL), all unchecked.
  The 10-API cap and its hint stay.

## States

| State | What shows |
| --- | --- |
| **Loading** | Both sections render their headings. Products: 2 skeleton rows (`--muted`, no pulse under reduced motion) with `role="status"` text "Loading products…" (visually hidden). APIs: existing "Loading APIs…". Create button disabled. |
| **Products, no loose APIs** (every API is in a product) | Products section as normal. The app form (name, description, APIs fieldset, **Create app and get key**) is replaced by one line under the products: "Every API here is offered as a product. Subscribe to one above to get a key." plus **Cancel** → `/dashboard` as a text link. |
| **Loose APIs, no products** | Products section is not rendered (no empty card). The second heading becomes **APIs this app uses** (no "Or…") and the page description reads "You'll get an API key as soon as it's created." — today's form. |
| **Nothing at all** (no products, no APIs) | Existing EmptyState: "No APIs to use yet" / "An app needs at least one API, and none have been published. Check back soon." / "Back to your apps". |
| **Products failed to load** | Inside the Products section: ProblemAlert "We couldn't load the products." with **Try again**. The loose-API form stays usable only if `GET /v1/apis` succeeded — the API list alone already tells loose from product APIs. |
| **APIs failed to load** | Existing ProblemAlert "We couldn't load the APIs." with **Try again**; Create disabled. Product rows still render, without "Includes:" lines. |
| **Empty submission** (AC 4) | Nothing sent. Under the APIs fieldset: "⚠ Choose at least one API, or subscribe to a product above." in `--destructive`, `id="api-error"`, linked by `aria-describedby`; checkboxes get `aria-invalid`. Focus moves to the first checkbox (the message is read through `aria-describedby`). If the name is also missing, focus goes to the first invalid field in DOM order (name) as today. The message clears when an API is checked. |
| **`?api=<slug>` names a product's API** | No pre-check. Note above the products: "{API title} is offered in a product. Subscribe to {product name} below." (`--muted-foreground`, info icon). If it names an API that isn't returned at all, the existing "The API you came from isn't available any more…" note shows. |
| **Submitting** | Existing: fieldset disabled, button "Creating app…", `aria-busy`. Product links stay enabled. |
| **Success** | Existing spec 004 key-shown-once screen. Unchanged. |
| **Stale page: 409 `api-in-product`** | ProblemAlert at the top (error variant), title "That API is now in a product", body = server `detail`, then one link per `products[]`: "Subscribe to {name}" → `/products/{slug}`. Last line: "Nothing was created. We've refreshed the lists." Both lists are refetched; the refused API leaves the checkbox list and appears under its product; its selection is dropped. Focus moves to the alert heading. |
| **400 validation** | Existing field-error mapping. A plan field can't come from this form; if a pointer has no field on screen, show the server `detail` in the top alert. |
| **Read-only team member** (no permission) | Existing message ("You have Read-only access to {team}…"). Products section still shows above it, since following a product link is a separate decision on the product page (spec 009 enforces there). |
| **Email not verified / gateway paused / 502 / 503** | Existing alerts, unchanged. |

## Copy

| Element | Text |
| --- | --- |
| Page description (products exist) | Subscribe to a product to get a key on a plan, or create an app for an API that isn't in a product. |
| Products heading | Products |
| Products intro | Products bundle APIs with a plan: rate limit, quota and, for some, approval. Subscribing creates an app with its own key. |
| API line | Includes: {title}, {title} |
| Links | Subscribe · Request access · View product · Add a plan |
| Notes | Every plan needs approval from the API owner. · An admin assigns this product's plans to your team. |
| No-plan, developer | Not available yet · This product has no plans yet. Check back later. |
| No-plan, admin | Needs a plan · Developers can't subscribe until it has a plan. |
| Second heading | Or create an app for APIs that aren't in a product |
| Fieldset legend | APIs not in a product |
| Fieldset hint | This app's keys work only on the APIs you choose here. |
| Empty submission | Choose at least one API, or subscribe to a product above. |
| No loose APIs | Every API here is offered as a product. Subscribe to one above to get a key. |
| Product API via `?api=` | {API title} is offered in a product. Subscribe to {product name} below. |
| 409 title / footer | That API is now in a product · Nothing was created. We've refreshed the lists. |
| Products load error | We couldn't load the products. |

Accessible names of the links include the product, so a screen-reader link list is unambiguous:
`aria-label="Subscribe to Payments"`, "Request access to Partner Data", "View product Ledger",
"Add a plan to Shipping".

## Components

Reused (shadcn/ui via `@portal/ui`): `PageHeader`, `Card`, `Badge`, `Button` (for submit only),
`Input`, `Textarea`, `Skeleton`, `EmptyState`, `ProblemAlert`, existing `Field`.

New, local to the portal (not in `packages/ui` unless reused later):

**`ProductRow`**
- Props: `product: ProductSummary`, `apiTitles: string[]`, `isAdmin: boolean`.
- Variants (derived, not passed): `subscribe` | `request` | `view` | `no-plan`.
- Renders `<li>` with name (`<h3>`), description, "Includes:" line, action link or badge, note.
- Layout: grid `1fr auto` at ≥768px (action right, top-aligned); single column below, action
  full width last.

**`ProductList`** — `<section aria-labelledby="products-heading">` with heading, intro and
`<ul>` of `ProductRow`s inside one `Card` with `--border` dividers. Handles loading and error.

## Accessibility (WCAG 2.2 AA)

- **Structure:** h1 Create an app → h2 Products → h3 per product → h2 "Or create an app…".
  Products is a `<section>` with a `<ul>`; the loose APIs stay a `<fieldset>` with `<legend>`.
- **Keyboard / focus order:** breadcrumb → (alert, if any) → one link per product row (or
  **Add a plan** for admins; no stop for a developer's no-plan row) → App name → Description →
  each API checkbox → Create app and get key → Cancel. No positive `tabindex`.
- **Focus management:** empty submit → first invalid field; 409 → alert heading (`tabindex="-1"`);
  after a list refetch focus is not moved otherwise.
- **Announcements:** loading text in `role="status"`; validation message via `aria-describedby`
  and `aria-invalid`; alerts use `role="alert"`.
- **Contrast:** secondary-button link text `--secondary-foreground` on `--secondary` 16.3:1;
  link border `--input` 4.8:1; warning badge 6.8:1; muted badge 6.9:1; all focus rings `--ring`.
  Status is word + icon, never colour alone. Icons are `aria-hidden`.
- **Targets:** links and checkboxes at least 24×24px (2.5.8); links are 40px tall.
- **Reflow:** no horizontal scroll at 320px; long API titles and URLs wrap (`overflow-wrap: anywhere`).

## Responsive

| | 375px | 1280px |
| --- | --- | --- |
| Container | full width, 16px gutter | `--portal-form-max-width` 640px, left-aligned in the content column |
| h1 | `--portal-text-2xl` | `--portal-text-3xl` |
| Product row | stacked; action full width at the bottom | two columns; action top-right, `auto` width |
| Description clamp | 3 lines | 2 lines |
| Submit / Cancel | Create full width, Cancel below | inline row |

## Theming

Only existing tokens are used; no literal colours. A customer theme that overrides `:root`
changes the product rows with the rest of the portal.
