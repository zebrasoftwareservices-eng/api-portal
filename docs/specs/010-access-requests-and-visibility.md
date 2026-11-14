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
Admins can mark a plan as needing approval and limit who sees a product, so developers request
access with a reason and get a key only once an admin approves it.

## Problem
Since spec 009, every plan is self-service and every product is listed for everyone. A platform
team can't offer a partner or internal tier through the portal: anyone who finds the product gets
a key straight away, and anyone, even signed out, can see that the product exists. Today they keep
those APIs out of the portal and hand out keys by hand, which is the work the portal is meant to
remove.

It is solved when an admin can put a plan behind approval and a product behind sign-in or behind
team assignment, and Kong only ever holds a credential for an approved request (Sprint 4 demo
step 3 in `docs/roadmap.md`: request a partner plan → admin approves → key works; a Hidden
product disappears when signed out).

## Users
- **API consumer (developer)**: requests access to an approval plan for their team and follows
  the request to a key or a reason for rejection.
- **Portal admin**: sets which plans need approval and who can see each product, and works the
  queue of pending requests.

## User stories
- As a portal admin, I want to mark a plan as "requires approval", so that I decide who gets a
  key for that tier.
- As a developer, I want to request access to an approval plan with a reason, so that the admin
  knows why my team needs it.
- As a portal admin, I want one queue of pending requests where I approve or reject each with a
  note, so that I can answer requests without leaving the portal.
- As a developer, I want an email and a visible status when my request is decided, so that I get
  my key, or know why not, without asking anyone.
- As a portal admin, I want to set a product's visibility to Open, Hidden or Manual, so that
  unreleased or partner-only products aren't shown to people who shouldn't see them.
- As a developer on a team a Manual product is assigned to, I want to see and use that product
  like any other, so that private access doesn't need a separate process.

## Acceptance criteria
1. **Given** an admin and a plan "Partner" marked "requires approval", and a signed-in team Admin
   or Member (spec 008) on the product page **When** they choose "Partner", name the
   subscription, enter a reason and submit **Then** the request is listed under their team as
   Pending, no key is shown, the server creates no Kong credential for it, and it appears in the
   admin's request queue with product, plan, team, requester, reason and submitted time.
2. **Given** a developer requesting an approval plan **When** the reason is empty or longer than
   the maximum the tech lead sets, or their team already has a Pending request for that plan
   **Then** the server returns `400` (bad reason) or `409` (duplicate) problem+json, the dialog
   shows the message, and no request is created.
3. **Given** a Pending request **When** an admin approves it, with or without a note **Then** the
   request becomes Approved, the requester receives an email (spec 007 mail transport), the key
   is shown once to a member of that team on the portal, and a call through Kong with that key to
   each API in the plan returns the upstream's response within the plan's limits.
4. **Given** a Pending request **When** an admin rejects it with a note **Then** the request
   becomes Rejected, no key exists and Kong holds no credential for it, the requester receives an
   email containing the note, the team sees the request as Rejected with the note on the portal,
   and they can submit a new request for the same plan.
5. **Given** an admin rejecting a request **When** the note is empty **Then** the server returns
   `400` problem+json, the form shows the message, and the request stays Pending.
6. **Given** a developer who is not a portal admin, or a Read-only team member **When** they call
   the approve or reject endpoint, or a Read-only member tries to submit a request **Then** the
   server returns `403` problem+json, and the request, the portal and Kong are unchanged.
7. **Given** Kong is unreachable **When** an admin approves a request **Then** the portal shows an
   error that says the gateway is unavailable, the server returns problem+json, the request stays
   Pending, no email is sent and no key exists; approving again once Kong is back succeeds.
8. **Given** a product with visibility Hidden **When** a signed-out visitor opens the catalog, the
   product's URL or one of its API pages **Then** the product is absent from the catalog and the
   URLs return the same not-found page and `404` as a product that doesn't exist; **and when** a
   signed-in developer opens the catalog **Then** the product is listed and usable.
9. **Given** a product with visibility Manual assigned by an admin to team A **When** a member of
   team A, a member of team B and a signed-out visitor each open the catalog and the product's URL
   **Then** only team A's member sees and can subscribe or request access; for the others it is
   absent from the catalog, its URLs return `404`, and the subscribe and request endpoints return
   `404` problem+json.
10. **Given** a product with visibility Open (the default, and the value every product from spec
    009 keeps after upgrade) **When** a signed-out visitor opens the catalog **Then** the product
    is listed exactly as before this spec.

## Out of scope
- **A sandbox key straight away, then production access after approval** (optional per plan in
  JSO-238). Cut so this stays one pull request: it needs two keys per subscription and a way to
  tell sandbox from production traffic in Kong. Follow-up spec, built after this one.
- **Internal visibility** (listed only for named teams) until the open question below is answered.
  Criteria cover Open, Hidden and Manual, the three JSO-238's "done when" names.
- **Approval steps with several approvers, automatic approval rules, and request expiry.**
  One admin decision proves the value.
- **Withdrawing a pending request, and reopening a rejected one.** The team submits a new request.
- **Emails to admins when a request arrives.** Admins see the queue; notifying them is a follow-up.
- **Approval for plan changes and per-API visibility.** A plan change into an approval plan is an
  open question; visibility is per product, not per API.
- **Portal staff roles** (which admins may approve). Every portal admin may approve until spec 015.
- **Audit log of approvals and visibility changes** (spec 015).
- **Plans and visibility on AWS API Gateway** (spec 017).

## Open questions
- [ ] Internal vs Manual: JSO-238 lists Internal (named teams only) and Manual (not listed,
  assigned by an admin), but its "done when" describes Manual as visible to its assigned team.
  Is Internal "listed and self-service for named teams" and Manual "the admin creates the
  subscription for the team", or are they one level? — Elango
- [ ] When an admin changes a product from Open to Hidden or Manual, or turns on "requires
  approval" for a plan, do existing subscriptions and keys keep working? Proposed: yes, the
  change applies to new subscriptions only. — Elango
- [ ] Can a team change an active subscription (spec 009) into an approval plan, and if so, does
  that create a request while the old plan keeps working? — Elango, then tech lead
- [ ] Should an admin's approval note be shown to the developer like the rejection note, or stay
  internal? — Elango
- [ ] Does a Hidden or Manual product's API reference appear in search (spec 020) and
  `/llms.txt` (spec 021)? Proposed: they reuse this spec's visibility check, so `/llms.txt`
  (always anonymous) lists Open products only. — tech lead

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
