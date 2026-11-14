---
id: 010
title: Access requests and catalog visibility
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-14
linear: JSO-238
---

# 010 — Access requests and catalog visibility

## Summary
Admins can put a plan behind approval and give each product one of four visibility levels (Open,
Hidden, Internal, Manual), so developers request access with a reason and Kong only holds a
credential for access an admin allowed.

## Problem
Since spec 009, every plan is self-service and every product is listed for everyone. A platform
team can't offer a partner or internal tier through the portal: anyone who finds the product gets
a key straight away, and anyone, even signed out, can see that the product exists. Today they keep
those APIs out of the portal and hand out keys by hand, which is the work the portal is meant to
remove.

It is solved when an admin can put a plan behind approval and a product behind sign-in, behind a
list of named teams, or behind admin-only assignment, and Kong only ever holds a credential for
access the admin allowed (Sprint 4 demo step 3 in `docs/roadmap.md`: request a partner plan →
admin approves → key works; a Hidden product disappears when signed out).

## Users
- **API consumer (developer)**: requests access to an approval plan for their team, follows the
  request to a key or a reason, and reveals keys for products an admin assigned to the team.
- **Portal admin**: sets which plans need approval and who can see each product, works the queue
  of pending requests, assigns Manual products to teams, and decides what happens to existing
  subscriptions when access gets stricter.

## User stories
- As a portal admin, I want to mark a plan as "requires approval", so that I decide who gets a
  key for that tier.
- As a developer, I want to request access to an approval plan with a reason, so that the admin
  knows why my team needs it.
- As a portal admin, I want one queue of pending requests where I approve with an optional note
  or reject with a required note, so that I can answer requests without leaving the portal.
- As a developer, I want an email and a visible status, with the admin's note, when my request is
  decided, so that I get my key, or know why not, without asking anyone.
- As a developer, I want to move my team's subscription to an approval plan without losing the
  key that works today, so that our traffic keeps flowing while the admin decides.
- As a portal admin, I want to set a product's visibility to Open, Hidden, Internal or Manual, so
  that unreleased, internal or partner-only products aren't shown to people who shouldn't see them.
- As a portal admin, I want to give a team access to a Manual product without ever seeing its
  key, so that I can onboard a partner without handling their secret.
- As a developer on a team with access to an Internal or Manual product, I want to see and use it
  like any other product, so that private access doesn't need a separate process.
- As a portal admin, I want to choose, when I restrict a product or a plan, whether existing
  subscriptions keep working or are revoked, so that tightening access never breaks or keeps
  traffic by surprise.

## Acceptance criteria
Visibility levels used below: **Open** (listed for everyone, even signed out), **Hidden** (listed
for signed-in developers), **Internal** (listed and self-service only for teams the admin names),
**Manual** (listed to no one; the admin creates the subscription for a team). A product a viewer
can't see behaves, for that viewer, exactly like a product that doesn't exist: absent from the
catalog, its product and API reference pages return the not-found page with `404`, and its
subscribe, request and plan endpoints return `404` problem+json.

1. **Given** a plan "Partner" marked "requires approval" on a product the viewer can see, and a
   signed-in team Admin or Member (spec 008) **When** they choose "Partner", name the
   subscription, enter a reason and submit **Then** the request is listed under their team as
   Pending, no key is shown, Kong holds no credential for it, and it appears in the admin's
   request queue with product, plan, team, requester, reason and submitted time.
2. **Given** a developer requesting an approval plan **When** the reason is empty or longer than
   the maximum the tech lead sets, or their team already has a Pending request for that plan
   **Then** the server returns `400` (bad reason) or `409` (duplicate) problem+json, the dialog
   shows the message, and no request is created.
3. **Given** a Pending request **When** an admin approves it, with or without text in the field
   labelled "Note to the requester (included in the email)" **Then** the request becomes
   Approved, the requester receives an approval email (spec 007 mail transport) that contains the
   note when one was given, the note shows on the request in the portal, a team Admin or Member
   can reveal the key once, and a call through Kong with that key to each API in the plan returns
   the upstream's response within the plan's limits.
4. **Given** a Pending request **When** an admin rejects it with a note **Then** the request
   becomes Rejected, Kong holds no credential for it, the requester receives an email containing
   the note, the team sees the request as Rejected with the note, and they can submit a new
   request for the same plan; **and when** the admin rejects with an empty note **Then** the
   server returns `400` problem+json, the form shows the message, and the request stays Pending.
5. **Given** a signed-in developer who is not a portal admin **When** they call the approve,
   reject, product-visibility, team-assignment or Manual-subscription endpoints **Then** the
   server returns `403` problem+json and nothing changes in the portal or Kong; **and given** a
   Read-only team member **When** they submit a request or try to reveal a key **Then** the
   server returns `403` problem+json.
6. **Given** Kong is unreachable **When** an admin approves a request **Then** the portal shows an
   error that says the gateway is unavailable, the server returns problem+json, the request stays
   Pending, no email is sent and no key exists; approving again once Kong is back succeeds.
7. **Given** a team with an active subscription on self-service plan "Basic" **When** a team Admin
   or Member changes it (spec 009 plan change) to approval plan "Partner" with a reason **Then** a
   Pending request tied to that subscription appears in the admin queue, the subscription stays on
   "Basic" and its key keeps working at Basic's limits; a second plan-change request for the same
   subscription while one is Pending returns `409` problem+json.
8. **Given** the Pending plan-change request from criterion 7 **When** an admin approves it
   **Then** the subscription moves to "Partner" with the same key, and a call through Kong with
   that key is held to Partner's limits; **when** an admin rejects it instead **Then** the
   subscription stays on "Basic" with the same working key, the team sees the note, and they can
   request "Partner" again. **And given** a subscription on "Partner" **When** the team changes it
   to self-service "Basic" **Then** the change applies at once with no request.
9. **Given** a product with visibility Open (the default, and the value every product from spec
   009 keeps after upgrade) **When** a signed-out visitor opens the catalog **Then** it is listed
   exactly as before this spec; **and given** a product with visibility Hidden **When** a
   signed-out visitor opens the catalog, the product's page or one of its API reference pages
   **Then** it behaves as not existing (see above), while a signed-in developer sees it listed and
   can subscribe.
10. **Given** an Internal product whose admin named team A, with a self-service plan and a
    "requires approval" plan **When** a member of team A, a member of team B and a signed-out
    visitor each open the catalog and the product's URL **Then** team A's member sees it, can
    subscribe to the self-service plan and request the approval plan as in criterion 1, and for
    the other two it behaves as not existing.
11. **Given** a Manual product **When** an admin creates a subscription on one of its plans for
    team A **Then** the admin's screen and the server's response contain no key, team A's Admins
    and Members receive an email, a team A Admin or Member can reveal the key once in the portal
    and a call through Kong with it succeeds, team A now sees the product and its API reference,
    and for team B and a signed-out visitor it still behaves as not existing.
12. **Given** a product with active subscriptions held by 3 teams **When** an admin makes it more
    restricted (Open→Hidden/Internal/Manual, Hidden→Internal/Manual, or removes a team from
    Internal) or turns on "requires approval" for a plan with active subscriptions **Then** a
    confirmation names how many teams have active subscriptions and offers "Keep them working"
    (selected by default) or "Revoke them"; with Keep, every existing key still gets the upstream's
    response; with Revoke, Kong no longer holds those credentials (calls with them return `401`),
    the subscriptions show as revoked, and each affected team's Admins and Members receive an
    email. A change that affects no active subscription shows no confirmation.
13. **Given** Kong is unreachable, or fails for some credentials **When** an admin confirms
    "Revoke them" **Then** the new visibility or approval setting is saved, the admin sees which
    revocations are still pending and that they are being retried, those subscriptions show
    "Revoke pending" in the admin view, and no revocation email is sent for them yet; once Kong is
    reachable the retry deletes the remaining credentials (calls with them return `401`), sends
    the emails, and the pending notice clears. Repeating the retry never creates or deletes
    anything twice.

The criteria count is 13, above the usual 10, because four visibility levels, plan-change
approvals and revoke-on-restrict were all decided into this spec.

## Out of scope
- **A sandbox key straight away, then production access after approval** (optional per plan in
  JSO-238). Cut so this stays one pull request: it needs two keys per subscription and a way to
  tell sandbox from production traffic in Kong. Follow-up spec, built after this one.
- **A global or per-product setting for what happens to existing subscriptions.** The admin
  decides each time, in the confirmation (criterion 12).
- **Approval steps with several approvers, automatic approval rules, and request expiry.**
  One admin decision proves the value.
- **Withdrawing a pending request, and reopening a rejected one.** The team submits a new request.
- **Emails to admins when a request arrives.** Admins see the queue; notifying them is a follow-up.
- **Per-API visibility.** Visibility is per product, not per API.
- **Search results and `/llms.txt` themselves.** Specs 020 and 021 apply this spec's visibility
  check (see Constraints); this spec builds no search or `/llms.txt` output.
- **Portal staff roles** (which admins may approve). Every portal admin may approve until spec 015.
- **Audit log of approvals, assignments, visibility changes and revocations** (spec 015).
- **Plans and visibility on AWS API Gateway** (spec 017).

## Constraints for the technical design
- Visibility is one shared server-side check, "can this viewer see this product?", used by the
  catalog, product and API reference pages, and every subscribe, request and plan endpoint. Specs
  020 (search) and 021 (`/llms.txt`) reuse it rather than writing their own rules.
- `/llms.txt` is anonymous, so it lists Open products only.
- Revocation uses the same idempotent, retried and reconciled approach as other gateway calls;
  its pending state is stored and shown, never only logged.

## Open questions
- [x] Internal vs Manual — Elango: four levels, all in this spec. Open (everyone, even signed
  out), Hidden (signed-in developers), Internal (listed and self-service only for named teams),
  Manual (listed to no one; the admin creates the subscription for a team, never sees the key; the
  team is emailed and an Admin or Member reveals the key once; once assigned, the team sees the
  product and its docs). Internal and Manual products may still have approval plans.
- [x] Existing subscriptions when access gets stricter — Elango: decided at the moment of change,
  with no global or per-product setting. The confirmation names the number of teams with active
  subscriptions and offers "Keep them working" (default) or "Revoke them"; revoke is retried,
  emails each team, and partial failure is visible (criteria 12–13).
- [x] Plan change into an approval plan — Elango: creates a request tied to the subscription; the
  old plan and same key keep working while Pending; approved moves the subscription with the same
  key; rejected stays put with the note and may ask again; one Pending request per subscription
  (`409`); moving off an approval plan needs no approval (criteria 7–8).
- [x] Approval note — Elango: shown to the developer in the approval email and on the request;
  the field is labelled "Note to the requester (included in the email)" (criterion 3).
- [x] Search (020) and `/llms.txt` (021) — Elango accepted the proposal: one shared visibility
  check, `/llms.txt` lists Open products only (Constraints).
- [ ] Once a Manual product is assigned to team A, can team A create more subscriptions on it
  themselves, or does every subscription come from the admin? The criteria assume neither. — Elango
- [ ] What happens to a Pending request when the admin turns off "requires approval" for its
  plan, or the product becomes invisible to the requesting team? Proposed: turning approval off
  leaves Pending requests for the admin to decide; losing visibility rejects them with an
  automatic note. — Elango
- [ ] Does cancelling an admin-created Manual subscription (spec 009 cancel) count as revoking it,
  with the same email? — Elango
- [ ] Maximum length of a request reason and a decision note. — tech lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/010-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/010.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/010.md`. The full report is `docs/uat/010/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/010.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
