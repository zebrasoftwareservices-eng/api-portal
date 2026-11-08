---
id: NNN
title: <short feature name>
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: YYYY-MM-DD
linear:            # the one feature issue, e.g. JSO-117 — filled by `node scripts/factory.mjs linear-init NNN`
---

# NNN — <Feature name>

## Summary
One sentence: what ships and who it's for.

## Problem
Who has the problem, what it costs them today, how we'll know it's solved.

## Users
Which audience: API consumer (developer), portal admin, platform engineer, AI agent.

## User stories
- As a <user>, I want <capability>, so that <outcome>.

## Acceptance criteria
1. **Given** <context> **When** <action> **Then** <observable result>.
2. … (include at least one failure path)

## Out of scope
- What this spec deliberately does not do.

## Open questions
- [ ] Question — who answers it

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/NNN-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
| Criterion | Test file | Result |
| --- | --- | --- |

### Bugs
<!-- Track every finding here. Add a JSO key only for a durable blocker/major, cross-owner/release item, or work that remains after this spec. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Screenshot |
| --- | --- | --- |

## Review  _(tech-lead)_

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
