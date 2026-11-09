# Orca playbook — running the software factory

Orca runs the factory. One **coordinator** agent per spec starts each role as a supervised
Orca **worker**, in that spec's own worktree, on the agent `factory.config.json` names:

| Role | Agent | Subscription it uses |
| --- | --- | --- |
| Coordinator, product-manager, tech-lead, ui-designer | Claude Code | Claude Pro |
| backend-developer, frontend-developer, qa-tester, user-tester | Codex | ChatGPT Pro |

Claude does the thinking and reviewing; Codex does the high-volume building and testing,
including real-user testing in the browser, which keeps those long sessions off the
Claude allowance.
Code is always reviewed by a different model from the one that wrote it.
Change any role's agent in `factory.config.json` (`"claude"`, `"codex"` or `"antigravity"`), for example
when one subscription hits its usage limit. Add `"model"` and `"effort"` to a role to pin them.
The Codex roles are pinned to `gpt-6.1-sol`, the Codex coding model on ChatGPT Pro
(see *When a worker fails*). Antigravity (`"antigravity"`) is still supported if you set it for a role;
run `agy models` to see the models your Google account offers.

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
6. In Orca, open Settings → Agents and set **Permissions** to **Auto**. Agents work in Orca's
   copy of the repo (`~/orca/workspaces/api-portal/<spec>`), and Auto lets them edit files
   there freely; anything else goes to the agent's own safety reviewer instead of you
   (Claude's auto mode, Codex's "Approve for me"). **Ask** runs Codex read-only and makes every
   worker wait for you; **Each agent's own settings** still asks before commits, network calls
   and Docker. Avoid **Full access**: it lets agents change files anywhere on the Mac.

## Run a spec
Planned features and their reserved spec numbers live in `docs/roadmap.md` (one-week sprints, one
Linear milestone per sprint). Start a planned feature from its Linear issue:
```bash
cd ~/Documents/ZSS/api-portal && git pull
node scripts/factory.mjs next            # planned features: in progress, ready to start, blocked
node scripts/factory.mjs status          # every spec, its Linear issue, and what's next
node scripts/factory.mjs start JSO-233   # planned feature: worktree 004-per-api-access-control, PM writes spec 004
node scripts/factory.mjs start 001       # existing spec: new worktree feat/jso-117-001-… + Claude coordinator
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
`node scripts/factory.mjs linear-init <id>` to create the spec's single feature issue. You can also
write a spec by hand and run `linear-init` yourself.

## Tracking in Linear
Project **API Portal** holds one feature issue per spec. The spec file is the task board.
Agents do not call `orca linear` themselves.

| What | Where it lives | Command |
| --- | --- | --- |
| Feature issue (label Feature) | Linear. Status follows the spec, forward only | `node scripts/factory.mjs track 001 sync` or `set-status` |
| Tasks | Spec checkboxes. No issue per task | `node scripts/factory.mjs linear task 001 done\|open "<text>"` |
| Bugs and durable review findings | Spec checkboxes, plus a child issue for a blocker or major | `linear bug 001 done\|open "<text>"` and `linear issue 001 bug\|review` |
| Follow-ups | Spec, under Follow-ups | `linear issue 001 follow-up --title "…"` |
| Stage summary | One comment on the feature issue | Coordinator: `track 001 note <stage>` |

Feature status: Backlog = draft · Todo = ready · In Progress = design, build, test ·
In Review = review or waiting to merge · Done = merged.

How an agent reads and updates status:
```bash
node scripts/factory.mjs linear read 001 --json          # open and done tasks and bugs; no comments
node scripts/factory.mjs linear read 001 --live          # same, plus the feature issue's state name
node scripts/factory.mjs linear read --issue JSO-117 --json
                                                         # intake: title, description, state
node scripts/factory.mjs linear task 001 done "Add the widget"
                                                         # tick the task; a keyed line moves to In Review
node scripts/factory.mjs linear task 001 open "JSO-140"  # untick; keyed line moves to In Progress
node scripts/factory.mjs linear bug 001 done "JSO-140"   # QA verified; keyed issue moves to Done
node scripts/factory.mjs linear bug 001 open "JSO-140"   # still broken; keyed issue moves to In Progress
printf '%s\n' "steps" | node scripts/factory.mjs linear issue 001 bug \
  --severity major --title "Widget snaps" --owner backend
printf '%s\n' "not this release" | node scripts/factory.mjs linear issue 001 follow-up \
  --title "Export later"
```
The match must hit one checkbox line. An exact line or key wins over a shorter substring.
`linear task done` moves a keyed durable issue to **In Review**. `linear bug done` moves it to
**Done**. Neither command moves the feature issue. A minor is refused. A follow-up is written
into the spec and does not create a Linear issue unless you pass `--create`.

If Linear rejects a required create, the command writes the finding under **Deferred Linear**
and exits 0. The factory keeps going. `track sync` never moves the feature issue backwards.
Legacy stage and task issues stay as history and are not created for new specs.

**Commits and PRs in Linear** need the repo on GitHub plus Linear's GitHub integration
(Linear → Settings → Integrations → GitHub). The branch name contains the feature key, every
commit says `Refs JSO-117`, and the PR says `Fixes JSO-117`, so Linear links all of them to the
feature and closes it on merge.

Resume after a stop (gate, limit, restart): open the spec's worktree in Orca, start Claude
Code and type `/factory 001` (Codex: `$factory 001`).

## Real-user testing in the browser
After QA's one full test pass, the **user-tester** (Codex) reuses the stack QA left up. It
walks each user-visible acceptance criterion once, then one mobile pass and one keyboard pass
of the main journey. On a retest it walks only the failed rows. Screenshots go in
`docs/uat/<spec-id>/`. Minor findings stay in the spec. A blocker or major is filed with
`node scripts/factory.mjs linear issue <id> bug`. You can watch its browser tab in Orca.

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
1. **Spec approval.** The coordinator stops at `draft`. The feature issue stays in Backlog until
   you move the spec. Read the spec, answer its open questions, run
   `node scripts/factory.mjs set-status 001 ready`, commit, and run `/factory 001` again.
2. **Merge.** The coordinator stops at `approved`. The feature issue is In Review.
   Review the diff in Orca, push, open the PR with `Fixes JSO-117` in the description
   (the coordinator prints the exact `gh pr create` command), merge, then run
   `node scripts/factory.mjs set-status 001 done`.

## Grok beside the factory
Grok researches once before a spec exists, and reviews the board when you ask. Claude still
designs and reviews. Codex still builds and tests. The coordinator does not launch Grok.

```bash
node scripts/factory.mjs prompt researcher --idea "AWS API Gateway REST adapter"
node scripts/factory.mjs prompt researcher --linear JSO-130
node scripts/factory.mjs prompt researcher --board
```

Paste the prompt into Grok. The brief lands in `docs/research/` (see `docs/research/README.md`).
Start the factory after the brief exists. The product manager reads it and writes the spec.
A board review is one page. Follow-ups stay in the spec. Run it when you ask, or once on a
weekday while a Grok session is open.

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
| uat | user-tester: real-user testing in Orca's browser | Codex | status: review (or back to building) |
| review | tech-lead: code review | Claude | status: approved (or back to building) |
| approved | **Elango merges** | — | status: done |

After three trips back to `building`, the coordinator stops and asks you. A minor finding or a
review suggestion does not send the spec back.

## The coordinator ends its turn
The coordinator starts the workers for a stage and ends its turn. The tab stays open so Orca
can wake it when a worker finishes or asks a question. It does not poll, so Claude is not
spent while Codex builds or tests. Closing that tab is different: use `resume` below.
Workers write a short summary in `docs/specs/log/<id>.md`. The coordinator posts it to Linear
when it wakes.

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
- **Antigravity stops with `RESOURCE_EXHAUSTED`, a 429 or a quota message** — the Google
  account's Antigravity quota is used up (the Starter quota resets weekly). Set the user-tester
  back to `"agent": "claude"` and delete its `"model"` line in `factory.config.json`, commit on
  `main`, and tell the coordinator the same.
- **Tab says "Action Required" or "Would you like to make the following edits?"** — the worker
  is waiting for your approval because it was started in Ask mode. Approve it (press `y`), then
  type `/permissions` in that tab and pick **Approve for me**; it applies from the agent's next
  turn. Set Orca's Permissions to Auto (one-time setup, step 6) so new workers don't ask.

## Cleaning up finished workers
A worker with a green check is done: its work is committed in the worktree and its summary is
in `docs/specs/log/`. Close that one tab with its ✕. Leave the coordinator's tab open while a
spec is in progress, even after it has ended its turn. Closing it, or closing a worker that is
still running, stops the wake.

## If the coordinator tab was closed
Ending a turn while workers run is expected. Resume only if the tab was closed, Orca restarted,
or the tab shows a plain shell prompt instead of Claude:
```bash
cd ~/Documents/ZSS/api-portal && node scripts/factory.mjs resume 001
```
It opens a new coordinator tab in the spec's workspace. The coordinator picks up the existing
Orca run, cleans up stopped workers, keeps any uncommitted work, and carries on from where
the spec is. Close any idle Codex or Claude tabs Orca reopened for old workers first; the
coordinator starts fresh ones.

## Keeping the roles in step
Role instructions live in `factory/roles/*.md`. After editing one, run
`node scripts/sync-agents.mjs` to regenerate `.claude/agents/` and `.codex/agents/`.

## Files Orca and the agents read
- `orca.yaml` — setup script for each new worktree (`pnpm install` once `package.json` exists)
- `.worktreeinclude` — gitignored files (`.env`) copied into new worktrees
- `AGENTS.md` — shared instructions (Codex and Antigravity read it; `CLAUDE.md` imports it)
- `factory/roles/` — the seven roles (source); `.claude/agents/`, `.codex/agents/` are generated
- `.agents/skills/factory/` — the coordinator skill (copied to `.claude/skills/factory/`)
- `factory/claude-settings.json` — Claude Code permissions (copied to `.claude/settings.json`)
- `factory.config.json` — which agent plays which role, and the Linear workspace, team, project and states
