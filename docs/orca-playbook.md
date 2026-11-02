# Orca playbook — running the software factory

Orca runs the factory. One **coordinator** agent per spec starts each role as a supervised
Orca **worker**, in that spec's own worktree, on the agent `factory.config.json` names:

| Role | Agent | Subscription it uses |
| --- | --- | --- |
| Coordinator, product-manager, tech-lead, ui-designer | Claude Code | Claude Pro |
| backend-developer, frontend-developer, qa-tester | Codex | ChatGPT Pro |

Claude does the thinking and reviewing; Codex does the high-volume building and testing.
Code is always reviewed by a different model from the one that wrote it.
Change any role's agent in `factory.config.json` (`"claude"` or `"codex"`), for example
when one subscription hits its usage limit. Add `"model"` and `"effort"` to a role to pin them.

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
5. Optional: create a public GitHub repo and push `main`
   (`gh repo create <org>/api-portal --public --source . --push`). Orca then uses
   `origin/main` as the base for new worktrees.

## Run a spec
```bash
cd ~/Documents/ZSS/api-portal
node scripts/factory.mjs status          # every spec and what's next
node scripts/factory.mjs start 001       # new worktree feat/001-… + Claude coordinator
```
`start` runs `orca worktree create … --agent claude --prompt "…factory skill…"`. In the new
worktree the coordinator plans the next stage, starts the workers, waits, and moves on. You
watch the workers in Orca's panes and can type into any of them.

New feature from an idea:
```bash
node scripts/factory.mjs start --idea "AWS API Gateway REST adapter"
```

Resume after a stop (gate, limit, restart): open the spec's worktree in Orca, start Claude
Code and type `/factory 001` (Codex: `$factory 001`).

## Your two gates
1. **Spec approval.** The coordinator stops at `draft`. Read the spec, answer its open
   questions, change `status: draft` to `status: ready`, commit, and run `/factory 001` again.
2. **Merge.** The coordinator stops at `approved`. Review the diff in Orca, push, open the PR
   (`gh pr create --fill --base main`), merge, and set `status: done`.

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
| testing | qa-tester | Codex | status: review (or back to building) |
| review | tech-lead: code review | Claude | status: approved (or back to building) |
| approved | **Elango merges** | — | status: done |

After three trips back to `building`, the coordinator stops and asks you.

## Keeping the roles in step
Role instructions live in `factory/roles/*.md`. After editing one, run
`node scripts/sync-agents.mjs` to regenerate `.claude/agents/` and `.codex/agents/`.

## Files Orca and the agents read
- `orca.yaml` — setup script for each new worktree (`pnpm install` once `package.json` exists)
- `.worktreeinclude` — gitignored files (`.env`) copied into new worktrees
- `AGENTS.md` — shared instructions (Codex reads it; `CLAUDE.md` imports it)
- `factory/roles/` — the six roles (source); `.claude/agents/`, `.codex/agents/` are generated
- `.agents/skills/factory/` — the coordinator skill (copied to `.claude/skills/factory/`)
- `factory/claude-settings.json` — Claude Code permissions (copied to `.claude/settings.json`)
- `factory.config.json` — which agent plays which role
