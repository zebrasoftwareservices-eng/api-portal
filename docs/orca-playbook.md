# Orca playbook — running the software factory

Orca runs the factory. One **coordinator** agent per spec starts each role as a supervised
Orca **worker**, in that spec's own worktree, on the agent `factory.config.json` names:

| Role | Agent | Subscription it uses |
| --- | --- | --- |
| Coordinator, product-manager, tech-lead, ui-designer, user-tester | Claude Code | Claude Pro |
| backend-developer, frontend-developer, qa-tester | Codex | ChatGPT Pro |

Claude does the thinking and reviewing; Codex does the high-volume building and testing.
Code is always reviewed by a different model from the one that wrote it.
Change any role's agent in `factory.config.json` (`"claude"` or `"codex"`), for example
when one subscription hits its usage limit. Add `"model"` and `"effort"` to a role to pin them.
The Codex roles are pinned to `gpt-5.6-terra`, a model the ChatGPT account signed in to Codex
offers (see *When a worker fails*).

## One-time setup
1. Open Orca, then in a terminal run:
   ```bash
   cd ~/Documents/ZSS/api-portal && sh scripts/setup.sh
   ```
   It generates the Claude Code and Codex role files, creates the git repo with a first
   commit, and registers the project in Orca as **api-portal**.
2. Make sure both agents are signed in: run `claude` and `codex` once in a terminal, or
   check Orca's account switcher.
3. Install pnpm (`npm install -g pnpm`). Without it the worktree setup falls back to `npx pnpm`.
4. Keep Docker Desktop running; Kong, Postgres and the tests need it.
5. The private GitHub repo `zebrasoftwareservices-eng/api-portal` is `origin`; Orca uses
   `origin/main` as the base for new worktrees.

## Run a spec
```bash
cd ~/Documents/ZSS/api-portal
node scripts/factory.mjs status          # every spec, its Linear issue, and what's next
node scripts/factory.mjs start 001       # new worktree feat/jso-117-001-… + Claude coordinator
```
`start` runs `orca worktree create … --agent claude --linear-issue JSO-117 --prompt "…factory skill…"`.
In the new worktree the coordinator plans the next stage, starts the workers, waits, updates
Linear, and moves on. You watch the workers in Orca's panes and can type into any of them.

New feature — three ways in:
```bash
node scripts/factory.mjs start JSO-130                          # from a Linear issue you wrote
node scripts/factory.mjs start --idea "AWS API Gateway REST adapter"
```
Either way the product manager writes the spec and the coordinator runs
`node scripts/factory.mjs linear-init <id>` to create the feature's stage issues. You can also
write a spec by hand and run `linear-init` yourself.

## Tracking in Linear
Project **API Portal** in Linear holds the whole SDLC:

| Linear | What it is | Who moves it |
| --- | --- | --- |
| Feature issue (label Feature) | One per spec, in a release milestone (v0.1, v0.2, v0.3) | Coordinator, from the spec status |
| Stage sub-issues | Requirements → Technical design → UX design → Backend → Frontend → Testing → User testing → Code review → Release | The agent doing the stage: In Progress at start, summary comment, Done at the end. Requirements and Release are yours |
| Task sub-issues | One per task in the spec, under its stage issue | The developer: In Progress → Done with the commit |
| Bug sub-issues (label Bug) | Every bug QA or the user-tester finds, priority by severity | Tester creates and closes; developer moves to In Review when fixed |
| Review sub-issues (label Code Review) | Every blocking review finding | Tech lead creates and closes |
| Follow-ups (Backlog) | Out-of-scope work any agent spots | Whoever found it creates it; you prioritize |

Every agent works in Linear like a team member, so Linear updates as the work happens. The
coordinator only reconciles: `track sync` fills in anything an agent missed and never moves an
issue backwards.

Feature status: Backlog = spec draft · Todo = approved · In Progress = design, build, test ·
In Review = code review or waiting to merge · Done = merged.

Useful commands:
```bash
node scripts/factory.mjs track 001 sync     # re-sync Linear with the spec (safe any time)
orca linear issue JSO-117 --children        # the feature and its stages from the terminal
```
Linear problems never stop the factory: the coordinator logs a warning and you can re-sync later.

**Commits and PRs in Linear** need the repo on GitHub plus Linear's GitHub integration
(Linear → Settings → Integrations → GitHub). The branch name contains the feature key, every
commit says `Refs JSO-117`, and the PR says `Fixes JSO-117`, so Linear links all of them to the
feature and closes it on merge.

Resume after a stop (gate, limit, restart): open the spec's worktree in Orca, start Claude
Code and type `/factory 001` (Codex: `$factory 001`).

## Real-user testing in the browser
After QA's automated tests pass, the **user-tester** (Claude Code) starts the quickstart and uses
the portal in Orca's built-in browser like a real developer: sign up, read the docs, create an
app, copy the key, try a call, revoke it. It also checks mobile size, keyboard use, error states
and console errors, saves screenshots in `docs/uat/<spec-id>/`, and files every problem as a
Linear bug. You can watch its browser tab in the spec's Orca workspace.

## Deploys (GitHub + Vercel)
- Repo: private `github.com/zebrasoftwareservices-eng/api-portal`. Orca branches new
  workspaces from `origin/main`.
- Vercel project **api-portal** (team ZSS) builds `apps/portal`. Every merge to `main` deploys
  to production; every pull request gets a preview URL. The first real deploy happens when
  spec 001 merges, because `apps/portal` doesn't exist on `main` before that. Until then every
  push to `main` shows a failed deployment ("Root Directory apps/portal does not exist"); that is expected.
- The portal needs `SERVER_URL` pointing at a running API server. Vercel hosts only the Next.js
  portal; the API server, Postgres and Kong need their own hosting before the live site works.
- Vercel deployments are protected by Vercel login (your team default). Turn that off in the
  project's Deployment Protection settings when you want the site public.

## Your two gates
1. **Spec approval** (Linear: the Requirements issue, assigned to you). The coordinator stops
   at `draft`. Read the spec, answer its open questions, run
   `node scripts/factory.mjs set-status 001 ready`, commit, and run `/factory 001` again.
2. **Merge** (Linear: the Release issue, assigned to you). The coordinator stops at `approved`.
   Review the diff in Orca, push, open the PR with `Fixes JSO-117` in the description
   (the coordinator prints the exact `gh pr create` command), merge, then run
   `node scripts/factory.mjs set-status 001 done`.

## Play one role by hand
```bash
node scripts/factory.mjs prompt qa-tester 001     # prints a self-contained task prompt
```
Paste it into any agent tab in that worktree (Orca: new tab → Claude Code or Codex).

## How a spec flows
| Status | Next | Agent | Done when |
| --- | --- | --- | --- |
| draft | **Elango approves** | — | status: ready |
| ready | tech-lead: technical design | Claude | status: designed |
| designed | ui-designer: UX (skipped if no UI tasks) | Claude | status: building |
| building | backend + frontend in parallel once the monorepo exists | Codex | all build tasks ticked → testing |
| testing | qa-tester: automated tests | Codex | status: uat (or back to building) |
| uat | user-tester: real-user testing in Orca's browser | Claude | status: review (or back to building) |
| review | tech-lead: code review | Claude | status: approved (or back to building) |
| approved | **Elango merges** | — | status: done |

After three trips back to `building`, the coordinator stops and asks you.

## When a worker fails
Open the worker's terminal in Orca to read its error, or run
`orca orchestration worker-list --run <run id>` to see each worker's state and model.
- **"The '<model>' model is not supported when using Codex with a ChatGPT account"** — the
  ChatGPT plan Codex is signed in with doesn't offer that model. Run `codex`, then `/status` to
  see which account and plan are signed in and `/model` to see the models it offers. Put an
  offered model on the Codex roles in `factory.config.json`, commit it on `main`, then tell the
  coordinator: "Stop the failed worker, run `git merge main --no-edit`, and continue."
- **Usage limit reached** — switch that role's `agent` to the other subscription in
  `factory.config.json`, commit, and tell the coordinator the same.

## Keeping the roles in step
Role instructions live in `factory/roles/*.md`. After editing one, run
`node scripts/sync-agents.mjs` to regenerate `.claude/agents/` and `.codex/agents/`.

## Files Orca and the agents read
- `orca.yaml` — setup script for each new worktree (`pnpm install` once `package.json` exists)
- `.worktreeinclude` — gitignored files (`.env`) copied into new worktrees
- `AGENTS.md` — shared instructions (Codex reads it; `CLAUDE.md` imports it)
- `factory/roles/` — the seven roles (source); `.claude/agents/`, `.codex/agents/` are generated
- `.agents/skills/factory/` — the coordinator skill (copied to `.claude/skills/factory/`)
- `factory/claude-settings.json` — Claude Code permissions (copied to `.claude/settings.json`)
- `factory.config.json` — which agent plays which role, and the Linear workspace, team, project and states
