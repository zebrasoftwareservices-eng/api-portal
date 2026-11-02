# Team charter — the software factory

Elango is the only human: product owner, final approver and merger. Every other role is an AI
agent, run by Orca on Claude Code (Claude Pro) or Codex (ChatGPT Pro). In this repo each role
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
| `UAT:` | user-tester | Claude Code | The real user's experience | Browser walkthroughs in Orca, screenshots, User testing report, bug list | Edits code or tests |

A **coordinator** (Claude Code, `factory` skill) runs the pipeline in Orca. It starts each role
as a supervised worker and never does a role's work itself.

## Workflow
Each feature is one spec file and one Orca worktree (`feat/<linear-key>-<id>-<slug>`). Its `status` moves:

`draft` → **Elango approves** → `ready` → tech-lead → `designed` → ui-designer → `building`
→ backend + frontend → `testing` → qa-tester → `uat` → user-tester → `review` → tech-lead
→ `approved` → **Elango merges** → `done` → Vercel deploys

- Bugs from QA or user testing, or blocking review findings, send it back to `building`; after 3 loops, stop and ask Elango.
- Code is reviewed by a different model from the one that wrote it.
- Linear project **API Portal** is the system of record: no work without an issue. Every agent is a
  Linear team member that moves its own stage and task issues, files bugs, findings and follow-ups,
  and closes what it verified.
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
- Agents commit in their worktree but never create, switch, merge or push branches.
- Every commit ends with `Refs <feature key>`. Only Elango moves the Requirements and Release issues.
- Open source in public: write specs, ADRs and commits as if contributors will read them.
