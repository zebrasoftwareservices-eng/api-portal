---
id: 027
title: Trace inside Try it
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-22
linear:            # the one feature issue, e.g. JSO-117 — filled by `node scripts/factory.mjs linear-init 027`
---

# 027 — Trace inside Try it

## Summary
When a signed-in developer or admin clicks **Try it** in the API reference, the portal shows the
Kong trace waterfall for that exact call under the response. Each person sees only the traces of
calls they made themselves. Builds on spec 026.

## Problem
Spec 026 gives portal admins a waterfall of the latest traced call per API, on an admin page.
A developer whose Try it call is slow or fails sees only the status and body. They cannot tell
whether the gateway (an auth or rate-limit plugin) or the upstream used the time, so they open a
support request, and the admin has to find the call again on the trace page. An admin testing an
API from the reference has to leave it and open the trace page, where another traced call may
already have replaced the one they made.

Kong can tie a trace to one call. The [OpenTelemetry plugin](https://docs.konghq.com/hub/kong-inc/opentelemetry/)
supports W3C trace context propagation, and Kong's own example reads the incoming `traceparent`
header, which carries the trace id and parent span id
([Kong cookbook, voice AI observability](https://developer.konghq.com/cookbooks/voice-ai-observability/)).
If Try it sends a `traceparent` with a trace id the portal chose, the spans Kong exports carry
that id, and the portal can show exactly that call's trace to the person who made it.
Zuplo shows one trace row per request with no collector to run
([Zuplo OpenTelemetry docs](https://zuplo.com/docs/articles/opentelemetry)); spec 026's
[research brief](../research/show-opentelemetry-traces-for-one-api-re.md) has the Kong span names,
node settings and redaction rules this spec reuses. No research brief exists for this idea.

Solved when, on the quickstart with tracing on for the sample API, a developer clicks Try it and,
within 30 seconds and without leaving the reference, names the slowest span of their own call,
and cannot see anyone else's.

## Users
- **API consumer (developer)** (primary): tries an operation from the reference and wants to know
  why that call was slow or failed.
- **Portal admin**: tries an API from the reference while diagnosing it and wants the trace of
  that call, not whichever call came last.

## User stories
- As a developer, I want to see the trace of my own Try it call under its response, so that I
  know whether the gateway or the upstream used the time.
- As a developer, I want to be sure nobody else can see my calls' traces and I can't see theirs,
  so that I can trust the portal with my traffic.
- As a portal admin, I want the Try it trace to show the plugin names, so that I can tell which
  plugin is slow without opening the admin trace page.
- As a developer or admin, I want Try it to tell me plainly when there is no trace (tracing off,
  still waiting, nothing arrived, call never reached Kong), so that I don't wait for nothing.

## Acceptance criteria
Criteria marked *(proposed)* use the PM's proposed answer to an open question below and change
if Elango decides otherwise.

1. **Given** the quickstart, tracing on for the sample API (spec 026), and a signed-in developer
   with a key for it **When** they click Try it on an operation and the call returns **Then**
   within 30 seconds a trace panel under the response shows that call's method, path without the
   query string, status code, total duration in milliseconds, and the waterfall labelled as in
   spec 026 criterion 6 (request, router, plugin, upstream, slowest marked); and the trace id the
   panel shows equals the trace id in the `traceparent` header the Try it request sent to Kong.
2. **Given** two signed-in developers, X and Y, who each click Try it on the same traced API within
   the same second **When** both trace panels fill **Then** each panel shows only the spans of its
   own call (the trace ids differ and match each one's `traceparent`), and neither panel shows
   the other's call.
3. **Given** developer Y knows the trace id of developer X's Try it call **When** Y, or an
   anonymous visitor, asks the API for that trace **Then** the API answers 404 problem+json to Y
   and 401 problem+json to the visitor, and returns no span. Spec 026's admin endpoints (tracing
   settings, selections, Test, per-API latest trace) still answer 403 to a developer.
4. **Given** a developer's Try it call that passed through Kong plugins, sent with a query string
   (`?token=abc123`), custom headers and a body **When** the developer's trace panel shows it and
   the developer fetches it through the API **Then** plugin spans are labelled `plugin` without the
   plugin's name *(proposed)*, timings are shown, and `abc123`, the client IP, the upstream address,
   headers, bodies and every attribute outside spec 026 criterion 7's allowlist appear in neither.
5. **Given** a portal admin who clicks Try it on the same traced API **When** the trace panel
   fills **Then** it shows each plugin span with its plugin name (for example `key-auth`)
   *(proposed)*; **and** spec 026's admin trace page for that API now shows this call as its latest
   trace, so the 026 page works as before.
6. **Given** the same developer makes a second Try it call **When** its trace panel fills **Then**
   the first call's trace can no longer be fetched through the API (404); the portal keeps at most
   one Try it trace per user, and keeps no list or history of them.
7. **Given** tracing is off for the API, and neither the developer's account nor their team is in a
   tracing selection *(proposed: Try it calls are traced only when tracing is on for them)* **When**
   they click Try it **Then** the response shows as usual and the trace panel says straight away
   that tracing is off for this API, with no waiting spinner; for a portal admin the message links
   to the API's tracing settings.
8. **Given** tracing is on for the API but no spans for the call reach the portal (for example the
   Kong node has `tracing_instrumentations` off, or the trace endpoint is unreachable from Kong)
   **When** the user clicks Try it **Then** the response shows as usual, the panel shows "waiting
   for trace" for up to 30 seconds, then a "no trace arrived for this call" message, and never
   another person's trace. The developer's message names no Kong setting; the admin's message names
   `tracing_instrumentations` and links to the Test in the tracing dialog.
9. **Given** Kong does not answer the Try it call (gateway down or unreachable) **When** the user
   clicks Try it **Then** Try it shows the call error as it does today, and the trace panel says the
   call did not reach the gateway, without waiting 30 seconds and without showing a waterfall.

## Out of scope
- **Changing spec 026's admin trace page, selection, dialog or Test.** They stay as they are; this
  spec only adds a Try it panel and a per-user Try it trace.
- **Traces of calls not made from Try it** (a developer's own code, curl, an SDK), and a developer
  trace page outside the reference. Try it only.
- **A developer turning tracing on.** The admin's selection decides what is traced (026 Decision 5),
  unless Elango answers the first open question otherwise.
- **Trace history, a list of past Try it traces, search, filters, sharing a trace link.** One trace
  per user, replaced by their next Try it call (026 Decision 3).
- **Upstream host or address in any view.** Spec 026 never stores it, so no role can see it.
- **Logs, and jumping from a log line to a trace** (026 Decision 1).
- **Traces in the static Vercel demo** (spec 002). It has no gateway or Try it calls through Kong.
- **AWS API Gateway and other adapters.** The spans and propagation are Kong's.
- **Changing `tracing_instrumentations` or `tracing_sampling_rate` on the Kong node.**

## Decisions
Elango, 2026-11-22.
1. **Whoever makes the Try it call sees the trace of their own call,** developers and admins alike.
   A developer sees only traces of calls they made. This reverses spec 026 Decision 2 (portal admins
   only) for Try it calls; the admin trace page from 026 stays as is.

## Open questions
- [ ] Are Try it calls traced always, or only when tracing is on for that API, developer account or
  team? Proposed: only when on (criterion 7). It needs no new Kong plugins and keeps 026 Decision 5
  ("calls outside the selection produce no trace"). "Always" means a tracing plugin on every
  published API, which then also traces non-Try-it traffic unless the plugin only keeps calls that
  carry a portal `traceparent`. — Elango
- [ ] Which span details may a developer see versus an admin? Proposed: both see labels and timings;
  only admins see plugin names (criteria 4 and 5), because the plugin list is the operator's
  configuration (026 brief). Nobody sees the upstream host, which is never stored. — Elango
- [ ] How is the trace tied to one call? Proposed: the portal gives Try it a fresh trace id bound to
  the signed-in user, Try it sends it as a W3C `traceparent`, and the server keeps that call's spans
  for that user only. Open for the design: whether the browser calls Kong directly (then Kong's CORS
  must allow `traceparent`) or through the server; whether the OpenTelemetry plugin's propagation
  must be set to extract W3C; and whether Kong honours the `sampled` flag of an incoming
  `traceparent` or applies `tracing_sampling_rate` anyway (not confirmed in Kong's docs). — tech-lead
- [ ] What does Try it show when the Kong node settings are missing or the trace has not arrived?
  Proposed: criteria 7–9 (off straight away; wait up to 30 s, then "no trace arrived"; gateway down
  straight away), with Kong setting names shown to admins only. Is 30 seconds the right wait? — Elango
- [ ] Does a Try it trace also replace the API's latest trace on the 026 admin page? Proposed: yes
  (criterion 5), since 026 already counts Try it calls. — Elango
- [ ] A developer who uses Try it signed out with a pasted key: no trace (proposed), since the trace
  is tied to a user. — Elango

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/027-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/027.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/027.md`. The full report is `docs/uat/027/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/027.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
