#!/bin/sh
# One-time setup on your Mac: sh scripts/setup.sh
# Generates the Claude Code and Codex files, creates the git repo, registers it in Orca.
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "1/4 Generating Claude Code and Codex role files"
node scripts/sync-agents.mjs

echo "2/4 Creating the git repo"
[ -d .git ] || git init -b main
git add -A
if git diff --cached --quiet; then
  echo "    nothing new to commit"
else
  git commit -s -q \
    -m "chore: set up API portal software factory" \
    -m "Roles, factory runner, Orca config, spec 001 and ADR 0001." \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GH8q96ARYkjNSUyDAqxFcX"
  echo "    committed on $(git branch --show-current)"
fi

echo "3/4 Registering the project in Orca"
if command -v orca >/dev/null 2>&1; then
  if orca repo list 2>/dev/null | grep -q "$ROOT\$"; then
    echo "    already registered"
  elif orca repo add --path "$ROOT"; then
    # No GitHub remote yet, so new worktrees branch from local main
    git remote get-url origin >/dev/null 2>&1 || orca repo set-base-ref --repo "path:$ROOT" --ref main || true
  else
    echo "    Could not reach Orca. Open the Orca app and run: orca repo add --path \"$ROOT\""
  fi
else
  echo "    Orca CLI not found. In Orca, add this folder as a project: $ROOT"
fi

echo "4/4 Checking tools"
command -v claude >/dev/null 2>&1 || echo "    Claude Code not found: https://code.claude.com"
command -v codex >/dev/null 2>&1 || echo "    Codex CLI not found: npm install -g @openai/codex"
command -v pnpm >/dev/null 2>&1 || echo "    pnpm not installed (worktrees fall back to npx): npm install -g pnpm"
docker info >/dev/null 2>&1 || echo "    Docker isn't running: open Docker Desktop before spec 001's quickstart"

echo
echo "Done. Next:"
echo "  node scripts/factory.mjs status"
echo "  node scripts/factory.mjs start 001"
