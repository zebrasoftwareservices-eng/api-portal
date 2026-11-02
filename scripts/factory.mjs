#!/usr/bin/env node
// Factory runner for the API Developer Portal software factory.
//
//   node scripts/factory.mjs status [--json]            every spec, its status, what's next
//   node scripts/factory.mjs plan <id> [--json]         the next stage of one spec (used by the coordinator)
//   node scripts/factory.mjs plan --idea "<text>" [--json]
//   node scripts/factory.mjs prompt <role> <id>         one role's task prompt, to paste into any agent
//   node scripts/factory.mjs set-status <id> <status>   move a spec (coordinator only)
//   node scripts/factory.mjs start <id> [--dry-run]     new Orca worktree + coordinator agent for a spec
//   node scripts/factory.mjs start --idea "<text>" [--dry-run]
//
// No dependencies; needs Node 18+.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = join(ROOT, 'docs', 'specs');
const config = JSON.parse(readFileSync(join(ROOT, 'factory.config.json'), 'utf8'));
const STATUSES = ['draft', 'ready', 'designed', 'building', 'testing', 'review', 'approved', 'done'];
const ROLES = Object.keys(config.roles);

const OWNERSHIP = {
  'product-manager': 'docs/specs/ and docs/roadmap.md only.',
  'tech-lead': "the spec's Technical design and Review sections, apps/server/openapi.yaml (contract only) and docs/adr/. No application code.",
  'ui-designer': "docs/design/ and the spec's UX section. No application code.",
  'backend-developer': 'apps/server, packages/db, packages/adapter-*, packages/sdk, deploy/ and root workspace config (package.json, pnpm-workspace.yaml, turbo.json). Do not edit apps/portal or packages/ui.',
  'frontend-developer': 'apps/portal and packages/ui. Do not edit apps/server, packages/db or adapters.',
  'qa-tester': "test files (**/*.test.ts, apps/portal/e2e/, tests/) and the spec's Test report and Bugs sections. Do not fix application code.",
};

// ---------- helpers ----------
const rel = (p) => relative(ROOT, p);
function die(msg) {
  console.error(`factory: ${msg}`);
  process.exit(1);
}
function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, v === undefined || v.startsWith('--') ? 1 : 2);
  return v === undefined || v.startsWith('--') ? true : v;
}
const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'idea';

function specFiles() {
  return existsSync(SPECS) ? readdirSync(SPECS).filter((f) => /^\d{3}-.+\.md$/.test(f)).sort() : [];
}
function nextFreeId() {
  const ids = specFiles().map((f) => Number(f.slice(0, 3)));
  return String((ids.length ? Math.max(...ids) : 0) + 1).padStart(3, '0');
}
function loadSpec(path) {
  const text = readFileSync(path, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) die(`${rel(path)} has no frontmatter`);
  const get = (k) => (fm[1].match(new RegExp(`^${k}:[ \\t]*(.*?)[ \\t]*(#.*)?$`, 'm')) || [])[1];
  const status = get('status');
  if (!STATUSES.includes(status)) die(`${rel(path)} has unknown status "${status}"`);
  const tasks = [...text.matchAll(/^\s*- \[([ xX])\] \[(backend|frontend|qa)\][ \t]*(.*)$/gm)]
    .filter((m) => m[3].trim() && !['…', '...'].includes(m[3].trim()))
    .map((m) => ({ done: m[1] !== ' ', owner: m[2], text: m[3].trim() }));
  const bugsSection = (text.match(/^### Bugs[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m) || [])[1] || '';
  const openBugs = [...bugsSection.matchAll(/^\s*- \[ \][ \t]*(.*)$/gm)].map((m) => m[1].trim()).filter((t) => t && !['…', '...'].includes(t));
  const file = path.split('/').pop();
  return { path, rel: rel(path), id: get('id') || file.slice(0, 3), slug: file.slice(4, -3), title: get('title'), status, tasks, openBugs, text };
}
function findSpec(arg) {
  if (!arg || arg === true) die('give a spec id, e.g. 001');
  if (String(arg).endsWith('.md')) {
    const p = resolve(ROOT, arg);
    if (!existsSync(p)) die(`no spec at ${arg}`);
    return loadSpec(p);
  }
  const id = String(arg).padStart(3, '0');
  const f = specFiles().find((x) => x.startsWith(`${id}-`));
  if (!f) die(`no spec with id ${id} in docs/specs/`);
  return loadSpec(join(SPECS, f));
}

// ---------- role jobs ----------
function jobFor(role, spec, opts = {}) {
  switch (role) {
    case 'product-manager':
      if (opts.idea)
        return {
          target: `a new spec docs/specs/${nextFreeId()}-<slug>.md, from docs/specs/_TEMPLATE.md`,
          change: `Write a spec for this idea: "${opts.idea}". Fill Summary, Problem, Users, User stories, Acceptance criteria, Out of scope and Open questions.`,
          acceptance: 'The new spec exists with status: draft and 4–10 testable Given/When/Then criteria, including a failure path. Report its path and open questions.',
        };
      return {
        change: 'Review and tighten the spec: make every acceptance criterion testable, cut anything that will not fit one pull request, and list open questions.',
        acceptance: 'Status stays draft. Report the one-line summary and the open questions for Elango.',
      };
    case 'tech-lead':
      if (opts.mode === 'review' || (!opts.mode && spec?.status === 'review'))
        return {
          change: 'Review this branch against the spec (mode 2 in your role file): run git diff main...HEAD, pnpm lint, pnpm typecheck and pnpm test, then write blocking and suggestion findings with file:line in the Review section, and add a `- [ ] [backend] Fix: …` or `- [ ] [frontend] Fix: …` task for each blocking finding. Set status: approved if nothing is blocking, otherwise status: building.',
          acceptance: 'The Review section is filled and status is approved or building.',
        };
      return {
        change: 'Write the Technical design section (components, API contract, data model, adapter calls, risks) and the task list tagged [backend], [frontend] and [qa]. Update apps/server/openapi.yaml and add an ADR if the design makes a lasting choice. Then set status: designed.',
        acceptance: 'Technical design and tasks are filled in and status is designed.',
      };
    case 'ui-designer':
      return {
        change: `Write docs/design/${spec?.id ?? 'NNN'}-${spec?.slug ?? '<slug>'}.md (flow, screens, every state, copy, accessibility, responsive behaviour) and fill the spec's UX section with a summary and link. Then set status: building.`,
        acceptance: 'The design file exists, the UX section links it, and status is building.',
      };
    case 'backend-developer':
    case 'frontend-developer': {
      const owner = role.split('-')[0];
      return {
        target: `every unchecked [${owner}] task`,
        change: 'Implement those tasks with tests, tick each task as it is done (for a Fix: task, also tick the matching item under Bugs), and add a Build notes entry.',
        constraints: "Match the API contract in the spec's Technical design. Do not change the spec status; the coordinator moves it.",
        acceptance: `pnpm lint, pnpm typecheck and pnpm test pass, and every [${owner}] task is ticked.`,
      };
    }
    case 'qa-tester':
      return {
        change: 'Map every acceptance criterion to an automated test, add failure-path tests, run the full suite and the docker compose quickstart, and fill the Test report and Bugs sections. For each blocker or major bug add a `- [ ] [backend] Fix: …` or `- [ ] [frontend] Fix: …` task. Set status: review if there are no blocker or major bugs, otherwise status: building.',
        acceptance: 'The Test report covers every acceptance criterion and status is review or building.',
      };
    default:
      die(`unknown role "${role}". Roles: ${ROLES.join(', ')}`);
  }
}

function workerSpec(role, spec, job) {
  return [
    `Role: ${role}, in the API Developer Portal software factory.`,
    `Instructions: follow factory/roles/${role}.md (skip its YAML header) and AGENTS.md.`,
    `Target: ${spec ? spec.rel : 'docs/specs/'}${job.target ? ` — ${job.target}` : ''}.`,
    `Change: ${job.change}`,
    `Constraints: work only in this worktree; never create, switch, merge or push branches; never pass Elango's approval gates.${job.constraints ? ` ${job.constraints}` : ''}`,
    `Ownership: you may edit ${OWNERSHIP[role]}`,
    `Observable acceptance: ${job.acceptance}`,
  ].join('\n');
}

function worker(role, spec, stage, opts) {
  const r = config.roles[role] || {};
  const w = { role, agent: r.agent || 'claude', title: `${spec ? spec.id : 'new'} ${role}: ${stage}`, spec: workerSpec(role, spec, jobFor(role, spec, opts)) };
  if (r.model) w.model = r.model;
  if (r.effort) w.effort = r.effort;
  return w;
}

// ---------- plan ----------
function plan(spec, idea) {
  const out = { spec: null, stage: null, gate: null, action: null, workers: [], parallel: false, expectStatus: [], maxBuildLoops: config.maxBuildLoops ?? 3, note: null };
  if (idea) {
    out.stage = 'new-spec';
    out.workers.push(worker('product-manager', null, 'new spec', { idea }));
    out.expectStatus = ['draft'];
    out.note = 'After this worker, run `node scripts/factory.mjs status --json` to find the new spec id; its next stage is Elango\'s approval gate.';
    return out;
  }
  out.spec = { id: spec.id, path: spec.rel, title: spec.title, status: spec.status };
  const open = (o) => spec.tasks.filter((t) => t.owner === o && !t.done);
  const hasUI = spec.tasks.some((t) => t.owner === 'frontend');
  switch (spec.status) {
    case 'draft':
      out.stage = 'spec-approval';
      out.gate = { kind: 'approve-spec', message: `Elango: review ${spec.rel}, answer its open questions, and set status: ready. To have the product manager tighten it first, run: node scripts/factory.mjs prompt product-manager ${spec.id}` };
      break;
    case 'ready':
      out.stage = 'design';
      out.workers.push(worker('tech-lead', spec, 'technical design', { mode: 'design' }));
      out.expectStatus = ['designed'];
      break;
    case 'designed':
      out.stage = 'ux';
      if (hasUI) {
        out.workers.push(worker('ui-designer', spec, 'UX design'));
        out.expectStatus = ['building'];
      } else {
        out.action = { setStatus: 'building', reason: 'No [frontend] tasks, so the UX stage is skipped.' };
      }
      break;
    case 'building': {
      out.stage = 'build';
      if (!spec.tasks.some((t) => t.owner === 'backend' || t.owner === 'frontend')) {
        out.gate = { kind: 'blocked', message: `${spec.rel} has no [backend] or [frontend] tasks. Run the tech-lead to write the task list (set status: ready), or add the tasks by hand.` };
        break;
      }
      const be = open('backend');
      const fe = open('frontend');
      if (!be.length && !fe.length) {
        if (spec.openBugs.length) {
          out.gate = { kind: 'blocked', message: `${spec.rel} has ${spec.openBugs.length} open bug(s) but no unticked Fix tasks. Add \`- [ ] [backend] Fix: …\` or \`- [ ] [frontend] Fix: …\` tasks, or tick the bugs that are fixed.` };
          break;
        }
        out.action = { setStatus: 'testing', reason: 'All build tasks are ticked and no bugs are open.' };
        break;
      }
      const scaffolded = existsSync(join(ROOT, 'package.json'));
      out.parallel = Boolean(config.parallelBuild && scaffolded && be.length && fe.length);
      if (be.length) out.workers.push(worker('backend-developer', spec, 'build'));
      if (fe.length && (out.parallel || !be.length)) out.workers.push(worker('frontend-developer', spec, 'build'));
      if (be.length && fe.length && !out.parallel)
        out.note = 'Frontend waits for backend because the monorepo is not scaffolded yet (or parallelBuild is off). Re-plan after the backend worker finishes.';
      out.expectStatus = ['building'];
      break;
    }
    case 'testing':
      out.stage = 'test';
      out.workers.push(worker('qa-tester', spec, 'test'));
      out.expectStatus = ['review', 'building'];
      break;
    case 'review':
      out.stage = 'review';
      out.workers.push(worker('tech-lead', spec, 'code review', { mode: 'review' }));
      out.expectStatus = ['approved', 'building'];
      break;
    case 'approved':
      out.stage = 'merge';
      out.gate = { kind: 'merge', message: `Elango: push the branch and open the PR (gh pr create --fill --base main), merge it, then set status: done in ${spec.rel}.` };
      break;
    case 'done':
      out.stage = 'done';
      out.note = 'Shipped. Nothing left to do on this spec.';
      break;
  }
  return out;
}

function nextLabel(p) {
  if (p.gate) return `gate: ${p.gate.kind}`;
  if (p.action) return `set ${p.action.setStatus}`;
  if (p.workers.length) return p.workers.map((w) => `${w.role} (${w.agent})`).join(' + ');
  return p.stage;
}

// ---------- set-status ----------
function setStatus(spec, status) {
  if (!STATUSES.includes(status)) die(`status must be one of: ${STATUSES.join(', ')}`);
  const updated = spec.text.replace(/^(---\n[\s\S]*?^status:[ \t]*)[a-z]+/m, `$1${status}`);
  writeFileSync(spec.path, updated);
  console.log(`${spec.rel}: ${spec.status} → ${status}`);
}

// ---------- start (Orca) ----------
function mainRepoRoot() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? dirname(r.stdout.trim()) : ROOT;
}
function coordinatorPrompt(target) {
  return `You are the factory coordinator. Read .agents/skills/factory/SKILL.md and follow it for ${target}. Stop at Elango's gates and tell him what to do.`;
}
function start(args) {
  const dry = Boolean(flag(args, '--dry-run'));
  const idea = flag(args, '--idea');
  const agent = config.coordinator?.agent || 'claude';
  let name, branch, target;
  if (idea && idea !== true) {
    const slug = slugify(idea);
    name = `idea-${slug}`;
    branch = `feat/idea-${slug}`;
    target = `this new idea: "${idea}"`;
  } else {
    const spec = findSpec(args[0]);
    name = `${spec.id}-${spec.slug}`;
    branch = `feat/${spec.id}-${spec.slug}`;
    target = `spec ${spec.id} (${spec.rel})`;
  }
  const argv = ['worktree', 'create', '--repo', `path:${mainRepoRoot()}`, '--name', name, '--branch', branch, '--agent', agent, '--prompt', coordinatorPrompt(target), '--activate'];
  if (dry) {
    console.log(['orca', ...argv.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a))].join(' '));
    return;
  }
  const r = spawnSync('orca', argv, { stdio: 'inherit' });
  if (r.error) die(`could not run orca (${r.error.message}). Is the Orca CLI installed and Orca open?`);
  process.exit(r.status ?? 1);
}

// ---------- main ----------
const [cmd, ...args] = process.argv.slice(2);
const json = Boolean(flag(args, '--json'));

switch (cmd) {
  case 'status': {
    const rows = specFiles().map((f) => {
      const s = loadSpec(join(SPECS, f));
      return { id: s.id, status: s.status, title: s.title, next: nextLabel(plan(s)) };
    });
    if (json) console.log(JSON.stringify(rows, null, 2));
    else if (!rows.length) console.log('No specs yet. Start one with: node scripts/factory.mjs start --idea "<feature>"');
    else for (const r of rows) console.log(`${r.id}  ${r.status.padEnd(9)}  ${r.title}\n     next: ${r.next}`);
    break;
  }
  case 'plan': {
    const idea = flag(args, '--idea');
    const p = idea && idea !== true ? plan(null, idea) : plan(findSpec(args[0]));
    if (json) console.log(JSON.stringify(p, null, 2));
    else {
      console.log(`stage: ${p.stage}${p.spec ? `   spec: ${p.spec.id} (${p.spec.status})` : ''}`);
      if (p.gate) console.log(`GATE (${p.gate.kind}): ${p.gate.message}`);
      if (p.action) console.log(`action: set status ${p.action.setStatus} — ${p.action.reason}`);
      for (const w of p.workers) console.log(`\n--- worker: ${w.role} on ${w.agent} ---\n${w.spec}`);
      if (p.note) console.log(`\nnote: ${p.note}`);
    }
    break;
  }
  case 'prompt': {
    const [role, id] = args;
    if (!ROLES.includes(role)) die(`unknown role "${role}". Roles: ${ROLES.join(', ')}`);
    const idea = flag(args, '--idea');
    const spec = idea && idea !== true ? null : findSpec(id);
    console.log(workerSpec(role, spec, jobFor(role, spec, idea && idea !== true ? { idea } : {})));
    break;
  }
  case 'set-status': {
    const [id, status] = args;
    setStatus(findSpec(id), status);
    break;
  }
  case 'start':
    start(args);
    break;
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(cmd ? 1 : 0);
}
