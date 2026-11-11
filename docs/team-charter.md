# Team charter — the software factory

Elango is the only human: product owner, final approver and merger. Every other role is an AI
agent, run by Orca on Claude Code (Claude Pro), Codex (ChatGPT Pro) or Antigravity (Google account). In this repo each role
is a file in `factory/roles/`, generated into `.claude/agents/` and `.codex/agents/`. In the Claude Project
"api portal", call a role by starting your message with its tag.

## Roles

| Tag in chat | Role | Default agent | Owns | Produces | Never does |
| --- | --- | --- | --- | --- | --- |
| `PM:` | product-manager | Claude Code | What and why | Specs in `docs/specs/`: stories, Given/When/Then criteria, scope, open questions | Writes code; approves its own spec |
| `Lead:` | tech-lead | Claude Code | How, and quality | Technical design, OpenAPI contract, task list, ADRs, code review | Writes feature code |
| `Design:` | ui-designer | Claude Code | Look and feel | Flows, ASCII wireframes, states, copy, tokens in `docs/design/` | Invents API fields; writes code |
| `Backend:` | backend-developer | Codex | Server, data, adapters | Fastify handlers, Drizzle migrations, gateway adapters, tests | Touches UI code; changes the contract silently |
| `Frontend:` | frontend-developer | Codex | Portal UI | Next.js pages and components using tokens and the generated client | Touches server or adapter code |
| `QA:` | qa-tester | Codex | Proof it works | Integration + e2e tests, test report, bug list | Fixes app code itself |
| `UAT:` | user-tester | Codex | The real user's experience | Browser walkthrough, User testing report, a failure screenshot only when the screen is the bug | Edits code or tests |

A **coordinator** (Claude Code, `factory` skill) runs the pipeline in Orca. It starts each role
as a supervised worker and never does a role's work itself.

## Workflow
Each feature is one spec file and one Orca worktree (`feat/<linear-key>-<id>-<slug>`). Its `status` moves:

`draft` → **Elango approves** → `ready` → tech-lead → `designed` → ui-designer → `building`
→ backend + frontend → `testing` → qa-tester → `uat` → user-tester → `review` → tech-lead
→ `approved` → **Elango merges** → `done` → Vercel deploys

- Blocker or major bugs, and blocking review findings, send it back to `building`. A minor finding or a review suggestion does not. After 3 loops, stop and ask Elango.
- The coordinator starts workers and ends its turn. Orca wakes it. One spec at a time is in design or review.
- Each role reads only the spec sections named in its role file. Long notes go in `docs/specs/log/<id>.md`. The coordinator posts the stage summary to Linear.
- Code is reviewed by a different model from the one that wrote it. A usage limit pauses that role. Review stays on Claude, and build, QA, and user testing stay on Codex.
- Linear project **API Portal** is the system of record: no work without an issue. The feature
  issue authorizes the whole spec; stage and task detail stays in the spec. Every agent comments
  its stage result on the feature and keeps durable bugs, findings and follow-ups current.
- Start with `node scripts/factory.mjs start <id>`; details in `docs/orca-playbook.md`.

## Definition of Done
- Every acceptance criterion has a passing automated test
- lint, typecheck, unit, integration and e2e green in CI
- Quickstart (`docker compose up`) still works
- API contract, README and docs updated
- Tech-lead review has no blocking findings
- Elango merged the PR

## Working agreements
- Small specs: one spec, one pull request.
- Unknowns are written as open questions, never guessed.
- Decisions that last get an ADR.
- Agents commit inside their worktree and may push their own feature branch and open its PR,
  but never create or switch branches, force-push, push to `main` or merge. Only Elango merges.
- Every commit ends with `Refs <feature key>`. Only Elango passes approval and merge gates.
- Open source in public: write specs, ADRs and commits as if contributors will read them.
