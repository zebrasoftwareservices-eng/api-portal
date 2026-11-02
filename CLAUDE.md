@AGENTS.md

## Claude Code notes
- Role subagents in `.claude/agents/` are generated from `factory/roles/` by
  `node scripts/sync-agents.mjs`. Run `/agents` to see them.
- `/factory <spec-id | "idea">` runs the factory. Inside an Orca terminal it starts each role
  as an Orca worker (so Codex can take the build roles); outside Orca it uses the subagents.
- Edit roles in `factory/roles/`, never in `.claude/agents/`; then run
  `node scripts/sync-agents.mjs` and restart Claude Code to reload the subagents.
