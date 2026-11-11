# Roadmap — sprint plan

Last updated: 2026-11-08 · Owner: Elango · Linear project: **API Portal** (one milestone per sprint)

## What this plan rests on

- **Single-tenant, self-hosted.** Each company installs the portal on its own servers. No multi-tenant hosting.
- **No billing.** No paid plans, payment providers or invoices. Plans are free access tiers: rate limits, quotas, approval.
- **Open source (Apache 2.0).** Success is adoption: stars, real installs, contributors.
- Feature list drawn from a walkthrough of a commercial portal (Apiable) and a review of an AI-generated
  architecture summary, minus billing and multi-tenancy.

## How a sprint runs

- One week, Monday to Friday. Two features per sprint; each feature is one spec and one pull request.
  If a feature won't fit one pull request, the product manager splits it and the second half moves to the next sprint.
- **Monday:** start each feature from the main repo. The product manager writes the spec from the Linear issue,
  using the spec number reserved below.
  ```bash
  cd ~/Documents/ZSS/api-portal && git pull
  node scripts/factory.mjs start JSO-233
  ```
- **During the week:** Elango approves each spec (`node scripts/factory.mjs set-status <id> ready`), the factory
  designs, builds, tests and reviews it, and Elango merges the pull request. Vercel deploys `main`.
- **Parallel or serial:** `node scripts/factory.mjs start` refuses a second feature while another
  spec is in `ready`, `designed`, or `review`. Start the second when the first reaches `building`,
  `testing`, or `uat` (Codex does those). Pass `--allow-parallel-claude` only when you mean to
  spend two Claude stages at once.
- **Friday:** sprint review. Run the sprint's demo script, tag the release (`git tag vX.Y`), close the milestone.
- If a coordinator stops: `node scripts/factory.mjs resume <spec id>`.

## Reserved spec numbers

The factory reads this table: `start <Linear key>` names the worktree and branch after the reserved spec, the
product manager writes `docs/specs/<spec>-<slug>.md`, and `next` uses **Needs** (specs that must be done first, or
something Elango has to do) to list what is ready to start:

```bash
node scripts/factory.mjs next
```

| Sprint | Spec | Slug                                 | Linear  | Needs                                  | Feature                                                                          |
| ------ | ---- | ------------------------------------ | ------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 1      | 003  | backlog-fixes-001-002                | JSO-232 | —                                      | Fix the open bugs and review findings from specs 001 and 002                     |
| 1      | 004  | per-api-access-control               | JSO-233 | —                                      | Per-API access control on Kong: ACL groups and hidden credentials                |
| 1      | 019  | unified-portal-developer-journey     | JSO-316 | 003 at testing                         | Unified portal: navigation, API-page access action and responsive My apps        |
| 2      | 005  | setup-wizard-and-gateway-connections | JSO-234 | 004                                    | First-run setup and gateway connections in the admin UI                          |
| 2      | 022  | server-robustness                    | pending | 004                                    | Server robustness (JSO-188) and authored path order (JSO-225), with a migration |
| 2      | 006  | hosted-live-demo                     | JSO-127 | Elango: choose hosting and set secrets | Hosted live demo behind the Vercel portal                                        |
| 3      | 007  | email-and-account-security           | JSO-235 | —                                      | Email delivery, verification, password reset and account deletion                |
| 3      | 008  | teams-and-roles                      | JSO-236 | 007                                    | Teams own apps and keys: invites and roles                                       |
| 4      | 009  | api-products-and-plans               | JSO-237 | 004, 008                               | API products and free plans with rate limits                                     |
| 4      | 010  | access-requests-and-visibility       | JSO-238 | 009                                    | Access requests with admin approval, and catalog visibility levels               |
| 5      | 011  | usage-and-insights                   | JSO-239 | 009                                    | Usage meter per app and admin insights                                           |
| 5      | 012  | docs-versions-search-agents          | JSO-240 | —                                      | API versions and changelog, and spec linting                                     |
| 5      | 020  | api-search                           | pending | —                                      | Search across APIs and endpoints                                                 |
| 5      | 021  | agent-ready-docs                     | pending | 012                                    | Agent-ready docs: Markdown pages, llms.txt, spec downloads and code samples      |
| 6      | 013  | theme-editor                         | JSO-241 | —                                      | Theme editor: logo, colours, fonts and custom CSS                                |
| 6      | 014  | pages-articles-navigation            | JSO-242 | —                                      | Pages, articles and navigation managed in the admin UI                           |
| 7      | 015  | portal-governance                    | JSO-243 | 009                                    | Portal governance: staff roles, registration approval, private portal, audit log |
| 7      | 016  | production-install-helm              | JSO-244 | —                                      | Production install: hardened compose, Helm chart, backups and upgrades           |
| 8      | 017  | aws-api-gateway-adapter              | JSO-245 | 005, 009                               | AWS API Gateway adapter: API keys and usage plans                                |
| 8      | 018  | oauth-client-credentials             | JSO-246 | 009                                    | OAuth 2.0 client credentials through an external identity provider               |

Specs 020 and 021 were split out of 012 on 2026-11-08. Their Linear feature issues are pending (the Linear workspace
is at its free issue limit); put the key in the Linear column once each issue exists, and `start` works as usual.

Already shipped: **v0.1** — spec 001 (Kong quickstart) and spec 002 (static demo mode on Vercel).

---

## Sprint 1 · v0.2 — Safe to connect a real Kong · 9–13 Nov

**Goal:** clear the backlog from 001 and 002, and make sure a portal key can only reach the APIs it was given.
**Features:** 003 (JSO-232) · 004 (JSO-233, urgent: today any portal key works on every key-auth route in Kong).
**Extra feature:** 019 (JSO-316), started when 003 reaches testing, because 003's frontend fixes may touch the same screens.

**Demo on Friday**

1. Every bug and review finding from 001 and 002 is closed or moved with a reason.
2. A key for API A gets 200 on A and 403 on API B and on a key-auth route the portal doesn't manage.
3. The upstream never receives the key. Keys issued before the upgrade still work on their own API.
4. A developer whose app already has access to an API is sent to that app instead of being told to create another.

| Role                     | 003 Backlog fixes                                   | 004 Per-API access control                           |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| Product manager (Claude) | Bundle the 34 linked issues into criteria by screen | Write the access rules and failure cases             |
| Tech lead (Claude)       | Triage, review                                      | Adapter contract change + ADR                        |
| UI designer (Claude)     | Copy, focus order, accessibility fixes              | Error copy                                           |
| Backend (Codex)          | Server-side fixes                                   | ACL groups, hidden credentials, migration, reconcile |
| Frontend (Codex)         | Most fixes                                          | —                                                    |
| QA (Codex)               | A regression test per fixed issue                   | Access tests against a real Kong                     |
| User-tester (Codex)     | Re-walk every affected screen                       | Try-it with the right and the wrong API              |
| Elango                   | Approve spec, merge                                 | Approve spec, merge                                  |

## Sprint 2 · v0.3 — Live demo, connect your own Kong · 16–20 Nov

**Goal:** the public demo works for real, and a fresh install connects its own Kong from the admin screens.
**Features:** 005 (JSO-234) · 006 (JSO-127).

**Demo on Friday**

1. On the public URL: sign up → create an app → get a key → 200 from the sample API.
2. A fresh install with no gateway settings shows the setup wizard, creates the first admin, connects a Kong
   with a working Test button, imports an API.
3. A wrong Kong URL or token fails the Test with a clear message and saves nothing.

| Role                     | 005 Setup + gateway connections      | 006 Hosted live demo                                         |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------ |
| Product manager (Claude) | Wizard and gateway flows             | Demo rules: sign-ups, reset schedule, abuse limits           |
| Tech lead (Claude)       | Config model, secret storage, health | Hosting ADR, environments                                    |
| UI designer (Claude)     | Wizard, Gateways screens             | Demo banner                                                  |
| Backend (Codex)          | Setup API, gateway CRUD, discovery   | Production config, trusted proxy, reset job                  |
| Frontend (Codex)         | Wizard, admin pages                  | Demo copy                                                    |
| QA (Codex)               | Fresh-install e2e                    | Smoke test on the deployed preview                           |
| User-tester (Codex)     | First-run walkthrough                | Public sign-up → call walkthrough                            |
| Elango                   | Approve, merge                       | **Pick hosts, create accounts, set secrets**, approve, merge |

## Sprint 3 · v0.4 — Accounts and teams · 23–27 Nov

**Goal:** real accounts (email, verification, password reset, deletion) and teams that own apps and keys.
**Features:** 007 (JSO-235) then 008 (JSO-236) — invites need email, so 007 goes first.

**Demo on Friday**

1. Sign up, verification email arrives (Mailpit locally), password reset works, admin SMTP test email sends.
2. Invite a teammate by email; they accept and use the team's app; a Read-only member can't touch keys.
3. Deleting an account or removing a member never breaks the team's keys.

| Role                     | 007 Email + account security                         | 008 Teams and roles            |
| ------------------------ | ---------------------------------------------------- | ------------------------------ |
| Product manager (Claude) | Account lifecycle flows                              | Team, invite, role flows       |
| Tech lead (Claude)       | Auth plugins, mail transport                         | Ownership model + migration    |
| UI designer (Claude)     | Auth screens, profile, emails                        | Team pages, switcher, invite   |
| Backend (Codex)          | SMTP, verification, account deletion                 | Teams API, invites, migration  |
| Frontend (Codex)         | Profile, mail settings, reset                        | Team pages and switcher        |
| QA (Codex)               | e2e through Mailpit                                  | Role and ownership tests       |
| User-tester (Codex)     | Full account lifecycle                               | Two-browser invite walkthrough |
| Elango                   | Approve, merge; choose an SMTP provider for the demo | Approve, merge                 |

## Sprint 4 · v0.5 — Products, plans and approvals · 30 Nov–4 Dec

**Goal:** APIs bundled into products with free plans enforced by the gateway, plus approval and visibility.
**Features:** 009 (JSO-237) then 010 (JSO-238).

**Demo on Friday**

1. Subscribe to a free plan (5 requests/second): the sixth request in a second gets 429 from Kong.
2. Change plan raises the limit; cancel removes access; regenerate key kills the old key.
3. Request a partner plan → admin approves → key works. A Hidden product disappears when signed out.

| Role                     | 009 Products and plans                      | 010 Approvals and visibility                |
| ------------------------ | ------------------------------------------- | ------------------------------------------- |
| Product manager (Claude) | Product, plan, subscribe flows              | Request, approval, visibility flows         |
| Tech lead (Claude)       | Plan → Kong mapping ADR (ACL + rate limits) | Request state machine, visibility rules     |
| UI designer (Claude)     | Product page, plan table, dialogs           | Request dialog, approval queue              |
| Backend (Codex)          | Products, plans, subscriptions, rate limits | Requests, approvals, notifications, filters |
| Frontend (Codex)         | Catalog, product page, dialogs              | Dialog, queue, catalog filtering            |
| QA (Codex)               | Rate-limit tests against Kong               | Approval and visibility tests               |
| User-tester (Codex)     | Subscribe, hit the limit, change plan       | Developer and admin side by side            |
| Elango                   | Approve, merge                              | Approve, merge                              |

## Sprint 5 · v0.6 — Developer experience and insights · 7–11 Dec

**Goal:** developers see their usage; docs gain versions, changelog, linting, search and agent-ready pages.
**Features:** 011 (JSO-239) · 012 (JSO-240).
**Extra features:** 020 (search, no dependencies) and 021 (agent-ready docs, after 012 because of per-version spec
downloads), split out of 012. Start them when 011 and 012 reach testing; whatever doesn't fit moves to sprint 6.

**Demo on Friday**

1. After 20 calls, the app's usage bar shows 20 of its quota; the admin sees time to first API call.
2. Import v2 of an API: version switcher and changelog appear; a spec with a lint error is refused with its location.
3. Search finds an endpoint by path (020); `/llms.txt` lists every API with Markdown and spec links (021).

| Role                     | 011 Usage and insights          | 012 Versions, changelog, linting     |
| ------------------------ | ------------------------------- | ------------------------------------ |
| Product manager (Claude) | Usage and insight views         | Version, changelog, lint flows       |
| Tech lead (Claude)       | Usage collection ADR            | Version model, lint ruleset          |
| UI designer (Claude)     | Usage bar, insights page        | Switcher, changelog, lint results    |
| Backend (Codex)          | Ingestion, aggregation          | Versions, changelog diff, Spectral   |
| Frontend (Codex)         | Usage and insights screens      | Switcher, changelog, lint report     |
| QA (Codex)               | Usage accuracy through Kong     | Import, version and lint tests       |
| User-tester (Codex)     | Call in try-it, watch the meter | Browse a new version as a developer  |
| Elango                   | Approve, merge                  | Approve, merge                       |

## Sprint 6 · v0.7 — Branding and content · 14–18 Dec

**Goal:** a company makes the portal its own without code.
**Features:** 013 (JSO-241) · 014 (JSO-242).

**Demo on Friday**

1. Change logo, colours and font: the live portal updates without a rebuild; broken CSS can't lock out admins.
2. Publish a landing page, a guide and an article; reorder the navigation.
3. A signed-in-only page is hidden from visitors and from search.

| Role                     | 013 Theme editor           | 014 Pages, articles, navigation       |
| ------------------------ | -------------------------- | ------------------------------------- |
| Product manager (Claude) | Theme settings             | Content flows and visibility          |
| Tech lead (Claude)       | Theme model, safe mode     | Content model, Markdown sanitising    |
| UI designer (Claude)     | Editor and preview         | Editors, landing sections, nav editor |
| Backend (Codex)          | Theme API, export/import   | Content API, SEO metadata             |
| Frontend (Codex)         | Editor, token injection    | Editors, public rendering             |
| QA (Codex)               | Visual and contrast checks | Visibility and sanitising tests       |
| User-tester (Codex)     | Rebrand end to end         | Build pages as admin, read as visitor |
| Elango                   | Approve, merge             | Approve, merge                        |

## Sprint 7 · v0.8 — Ready for company servers · 21–25 Dec

**Goal:** companies can govern the portal and run it in production.
**Features:** 015 (JSO-243) · 016 (JSO-244).

**Demo on Friday**

1. A product owner edits only their products; with approval on, sign-ups wait; the audit log shows key revokes.
2. Install on a clean Linux VM from the guide in under 30 minutes; upgrade from v0.7 keeps data.
3. Helm chart passes the CI smoke test.

| Role                     | 015 Portal governance                 | 016 Production install                      |
| ------------------------ | ------------------------------------- | ------------------------------------------- |
| Product manager (Claude) | Governance flows                      | Install and upgrade journeys                |
| Tech lead (Claude)       | Role model, audit events              | Install paths ADR                           |
| UI designer (Claude)     | Staff, approvals, audit screens       | —                                           |
| Backend (Codex)          | Roles, approvals, private mode, audit | Compose profile, Helm, backups, release CI  |
| Frontend (Codex)         | Admin screens                         | —                                           |
| QA (Codex)               | Permission matrix tests               | Install and upgrade tests in CI             |
| User-tester (Codex)     | Admin, owner, sign-up walkthroughs    | Follow the install guide on a fresh machine |
| Elango                   | Approve, merge                        | Decide the support matrix, approve, merge   |

## Sprint 8 · v0.9 — Second gateway and OAuth · 28 Dec–1 Jan

**Goal:** prove the multi-gateway design and offer OAuth credentials.
**Features:** 017 (JSO-245) · 018 (JSO-246).

**Demo on Friday**

1. One catalog shows a Kong API and an AWS API; a key works on the AWS API with its plan's throttle.
2. A developer gets OAuth client credentials; try-it fetches a token and calls the API through Kong.
3. Revoking the key or the client stops access.

| Role                     | 017 AWS API Gateway adapter      | 018 OAuth client credentials                 |
| ------------------------ | -------------------------------- | -------------------------------------------- |
| Product manager (Claude) | AWS connection flow              | OAuth plan and credential flows              |
| Tech lead (Claude)       | AWS mapping, capabilities        | Identity-provider ADR, Kong JWT              |
| UI designer (Claude)     | AWS option on Gateways           | Credential display, rotate, revoke           |
| Backend (Codex)          | AWS adapter (SDK v3), LocalStack | Keycloak, OIDC client registration, Kong JWT |
| Frontend (Codex)         | Gateways screen                  | Credentials UI, try-it token flow            |
| QA (Codex)               | Conformance suite on LocalStack  | Token and revoke tests                       |
| User-tester (Codex)     | Mixed catalog walkthrough        | Get credentials, call from try-it            |
| Elango                   | AWS test account, approve, merge | Approve, merge                               |

---

## After v0.9

Release hardening and launch (v1.0), then: two-factor login with recovery codes (moved out of 007; lost factor recovers by email); Kong Konnect, APISIX, Envoy Gateway, Azure APIM and Apigee adapters;
an MCP server per API product; AI search over docs; widget SDK and page builder; free marketplace listings.

## Not doing

Billing and paid plans · multi-tenant hosting · a hosted SaaS · a built-in forum (link GitHub Discussions instead).

## Feature coverage

| Flow (from the Apiable study)                                        | Where          |
| -------------------------------------------------------------------- | -------------- |
| Catalog, API reference, try-it, sign-up, one-time key, revoke        | v0.1 (shipped) |
| Gateway connection from the admin UI, working public demo            | Sprint 2       |
| Email verification, password reset, profile, delete account          | Sprint 3       |
| Two-factor login and recovery codes                                  | Backlog        |
| Teams owning keys, invites, roles                                    | Sprint 3       |
| Products, plan tiers, subscribe, change plan, cancel, regenerate key | Sprint 4       |
| Approval of access requests, catalog visibility levels               | Sprint 4       |
| Usage meter, admin insights, time to first API call                  | Sprint 5       |
| Versions, changelog, code samples, search, llms.txt                  | Sprint 5       |
| Theme, custom CSS, pages, articles, navigation                       | Sprint 6       |
| Staff roles, registration approval, private portal, audit log        | Sprint 7       |
| Several gateways in one catalog, OAuth 2.0 credentials               | Sprint 8       |
