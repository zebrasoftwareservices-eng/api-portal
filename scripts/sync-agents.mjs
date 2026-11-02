#!/usr/bin/env node
// Generates the agent-specific files from the shared sources, so Claude Code and Codex
// always run the same roles:
//
//   factory/roles/<role>.md          → .claude/agents/<role>.md   (Claude Code subagents)
//                                    → .codex/agents/<role>.toml  (Codex custom agents)
//   .agents/skills/factory/SKILL.md  → .claude/skills/factory/SKILL.md
//   factory/claude-settings.json     → .claude/settings.json
//
// Edit the sources, then run: node scripts/sync-agents.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => join(ROOT, ...p);
const SRC = at('factory', 'roles');
for (const d of [at('.claude', 'agents'), at('.codex', 'agents'), at('.claude', 'skills', 'factory')]) mkdirSync(d, { recursive: true });

const basic = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const multiline = (s) => `"""\n${s.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')}"""`;

for (const file of readdirSync(SRC).filter((f) => f.endsWith('.md')).sort()) {
  const text = readFileSync(join(SRC, file), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`factory/roles/${file}: missing YAML frontmatter`);
  const field = (k) => (m[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1]?.trim();
  const name = field('name');
  const description = field('description');
  if (!name || !description) throw new Error(`factory/roles/${file}: needs name and description`);
  const body = m[2].trim();

  // Claude Code subagent: same frontmatter, body plus a pointer to the source
  writeFileSync(
    at('.claude', 'agents', `${name}.md`),
    `---\n${m[1]}\n---\n<!-- Generated from factory/roles/${file} by scripts/sync-agents.mjs. Edit that file instead. -->\n\n${body}\n`,
  );

  // Codex custom agent
  writeFileSync(
    at('.codex', 'agents', `${name}.toml`),
    [
      `# Generated from factory/roles/${file} by scripts/sync-agents.mjs. Edit that file instead.`,
      `name = ${basic(name)}`,
      `description = ${basic(description)}`,
      `developer_instructions = ${multiline(`${body}\n`)}`,
      '',
    ].join('\n'),
  );
  console.log(`role ${name}: .claude/agents/${name}.md, .codex/agents/${name}.toml`);
}

copyFileSync(at('.agents', 'skills', 'factory', 'SKILL.md'), at('.claude', 'skills', 'factory', 'SKILL.md'));
console.log('skill factory: .claude/skills/factory/SKILL.md');
copyFileSync(at('factory', 'claude-settings.json'), at('.claude', 'settings.json'));
console.log('settings: .claude/settings.json');
