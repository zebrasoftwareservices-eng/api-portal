import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canCreate,
  durableTarget,
  readModel,
  recordCreated,
  recordFollowUp,
  recordRejected,
  shouldMoveKey,
  tick,
} from './linear-model.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SPEC = `---
id: 999
title: Widget
status: building
linear: JSO-1
---

## Summary
The secret prose must not appear in the read model.

## Technical design

### Tasks
- [ ] [backend] Add the widget
- [ ] [frontend] Add the widget tray
- [x] [qa] Cover the widget
- [ ] [backend] JSO-1 Do not move the feature
- [ ] [backend] Fix JSO-140: widget snaps
- [ ] [backend] Fix JSO-150 and JSO-151: two keys
- [ ] …

### Bugs
- [ ] JSO-140 widget snaps (major)
- [ ] copy is awkward (minor)
- [x] JSO-141 already fixed (major)
- [ ] …

## User testing
This section is not a bug.
`;

test('read model is checkboxes only', () => {
  const model = readModel({ id: '999', status: 'building', title: 'Widget', linear: 'JSO-1', text: SPEC });
  const encoded = JSON.stringify(model);
  assert.equal(encoded.includes('secret prose'), false);
  assert.equal(encoded.includes('not a bug'), false);
  assert.equal(model.tasks.open.length, 5);
  assert.equal(model.tasks.done.length, 1);
  assert.deepEqual(model.bugs.open.map((bug) => bug.key), ['JSO-140', null]);
  assert.equal(model.bugs.done[0].key, 'JSO-141');
  assert.equal(model.tasks.open.some((task) => task.keys.length === 2), true);
});

test('an exact task match beats a longer line that contains it', () => {
  const result = tick(SPEC, 'task', 'Add the widget', true);
  assert.equal(result.ok, true);
  assert.equal(result.key, null);
  assert.match(result.line, /\[x\] \[backend\] Add the widget$/);
  assert.equal(result.text.includes('[ ] [frontend] Add the widget tray'), true);
});

test('a short match that hits two lines is refused', () => {
  const result = tick(SPEC, 'task', 'widget', true);
  assert.equal(result.ok, false);
  assert.match(result.error, /matches \d+ task lines/);
});

test('task and bug commands stay in their own sections', () => {
  const task = tick(SPEC, 'task', 'JSO-140', true);
  const bug = tick(SPEC, 'bug', 'JSO-140', true);
  assert.equal(task.key, 'JSO-140');
  assert.match(task.line, /\[x\] \[backend\] Fix JSO-140/);
  assert.equal(task.text.includes('[ ] JSO-140 widget snaps'), true);
  assert.match(bug.line, /\[x\] JSO-140 widget snaps/);
  assert.equal(bug.text.includes('[ ] [backend] Fix JSO-140'), true);
});

test('a line with two keys is not changed', () => {
  const result = tick(SPEC, 'task', 'two keys', true);
  assert.equal(result.ok, false);
  assert.match(result.error, /JSO-150/);
});

test('open restores the checkbox', () => {
  const result = tick(SPEC, 'bug', 'JSO-141', false);
  assert.equal(result.ok, true);
  assert.match(result.line, /\[ \] JSO-141/);
  assert.equal(result.changed, true);
});

test('create rules keep minor findings and follow-ups out of Linear', () => {
  assert.equal(canCreate({ kind: 'bug', severity: 'minor' }).ok, false);
  assert.equal(canCreate({ kind: 'review', severity: 'major' }).label, 'Code Review');
  assert.equal(canCreate({ kind: 'bug', severity: 'blocker' }).priority, 'urgent');
  assert.equal(canCreate({ kind: 'follow-up' }).recordOnly, true);
  assert.equal(canCreate({ kind: 'follow-up', createFollowUp: true }).recordOnly, false);
  assert.equal(canCreate({ kind: 'follow-up', createFollowUp: true }).parent, false);
  assert.equal(durableTarget('task', 'done'), 'review');
  assert.equal(durableTarget('task', 'open'), 'started');
  assert.equal(durableTarget('bug', 'done'), 'done');
  assert.equal(durableTarget('bug', 'open'), 'started');
  assert.equal(shouldMoveKey('JSO-140', 'JSO-1'), true);
  assert.equal(shouldMoveKey('jso-1', 'JSO-1'), false);
  assert.equal(shouldMoveKey(null, 'JSO-1'), false);
});

test('a rejected create stays in the spec and a later create adds the key', () => {
  const rejected = recordRejected(SPEC, {
    kind: 'bug',
    title: 'Widget breaks',
    severity: 'major',
    owner: 'backend',
    parent: 'JSO-1',
    priority: 'high',
    label: 'Bug',
    body: 'step one\nstep two',
    linearTitle: 'Bug: Widget breaks',
  });
  assert.match(rejected, /- \[ \] Widget breaks \(major\)/);
  assert.match(rejected, /- \[ \] \[backend\] Fix: Widget breaks/);
  assert.match(rejected, /### Deferred Linear/);
  assert.match(rejected, /step one step two/);
  const created = recordCreated(rejected, {
    kind: 'bug',
    key: 'JSO-222',
    title: 'Widget breaks',
    severity: 'major',
    owner: 'backend',
  });
  assert.match(created, /- \[ \] JSO-222 Widget breaks \(major\)/);
  assert.equal(created.includes('- [ ] Widget breaks (major)'), false);
  assert.match(created, /- \[ \] \[backend\] Fix JSO-222: Widget breaks/);
  assert.equal(created.includes('Fix: Widget breaks'), false);
});

test('a follow-up without --create is spec text only', () => {
  const text = recordFollowUp(SPEC, 'Export later', 'not this release');
  assert.match(text, /### Follow-ups\n- Export later\n {2}not this release/);
  assert.equal(text.includes('JSO-'), true);
  assert.equal(text.slice(text.indexOf('### Follow-ups')).includes('JSO-'), false);
});

function stage() {
  const dir = mkdtempSync(join(tmpdir(), 'linear-model-'));
  const file = join(dir, 'spec.md');
  writeFileSync(file, SPEC);
  const bin = join(dir, 'bin');
  const log = join(dir, 'orca.log');
  mkdirSync(bin);
  const script = join(bin, 'orca');
  writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\necho '{"ok":false,"error":{"message":"offline"}}'\n`);
  chmodSync(script, 0o755);
  return { dir, file, bin, log };
}

function orcaLog(log) {
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
}

function run(dir, bin, args, input = '') {
  return spawnSync(process.execPath, [join(ROOT, 'scripts/factory.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
}

test('linear read --issue keeps the description and drops comments', () => {
  const dir = mkdtempSync(join(tmpdir(), 'linear-read-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const script = join(bin, 'orca');
  writeFileSync(
    script,
    `#!/bin/sh
echo '{"ok":true,"result":{"issue":{"identifier":"JSO-9","title":"Search","description":"Find APIs","state":{"name":"Todo"},"comments":[{"body":"secret thread"}]}}}'
`,
  );
  chmodSync(script, 0o755);
  try {
    const result = run(dir, bin, ['linear', 'read', '--issue', 'JSO-9', '--json']);
    assert.equal(result.status, 0, result.stderr);
    const view = JSON.parse(result.stdout);
    assert.deepEqual(view, { identifier: 'JSO-9', title: 'Search', state: 'Todo', description: 'Find APIs' });
    assert.equal(JSON.stringify(view).includes('secret thread'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('factory linear commands update the spec and do not call Linear for spec-only work', () => {
  const { dir, file, bin, log } = stage();
  try {
    const read = run(dir, bin, ['linear', 'read', file, '--json']);
    assert.equal(read.status, 0, read.stderr);
    const model = JSON.parse(read.stdout);
    assert.equal(model.tasks.open.length, 5);
    assert.equal(JSON.stringify(model).includes('secret prose'), false);

    const ticked = run(dir, bin, ['linear', 'task', file, 'done', 'Add the widget']);
    assert.equal(ticked.status, 0, ticked.stderr);
    assert.match(ticked.stdout, /no durable issue/);
    assert.match(readFileSync(file, 'utf8'), /\[x\] \[backend\] Add the widget\n/);
    assert.equal(orcaLog(log), '');

    const ambiguous = run(dir, bin, ['linear', 'task', file, 'done', 'widget']);
    assert.equal(ambiguous.status, 1);
    assert.match(ambiguous.stderr, /matches/);

    const minor = run(dir, bin, ['linear', 'issue', file, 'bug', '--severity', 'minor', '--title', 'Awkward copy']);
    assert.equal(minor.status, 1);
    assert.match(minor.stderr, /minor findings stay in the spec/);
    assert.equal(orcaLog(log), '');

    const follow = run(dir, bin, ['linear', 'issue', file, 'follow-up', '--title', 'Export later'], 'not this release');
    assert.equal(follow.status, 0, follow.stderr);
    assert.match(follow.stdout, /no Linear issue created/);
    assert.match(readFileSync(file, 'utf8'), /### Follow-ups\n- Export later/);
    assert.equal(orcaLog(log), '');

    const feature = run(dir, bin, ['linear', 'task', file, 'done', 'Do not move the feature']);
    assert.equal(feature.status, 0, feature.stderr);
    assert.match(feature.stderr, /feature issue/);
    assert.equal(orcaLog(log), '');

    const bug = run(dir, bin, ['linear', 'bug', file, 'done', 'JSO-140']);
    assert.equal(bug.status, 0, bug.stderr);
    assert.match(bug.stderr, /offline/);
    assert.match(orcaLog(log), /status set JSO-140/);
    assert.match(orcaLog(log), /Done/);
    assert.match(readFileSync(file, 'utf8'), /\[x\] JSO-140 widget snaps/);
    assert.match(readFileSync(file, 'utf8'), /\[ \] \[backend\] Fix JSO-140/);

    writeFileSync(log, '');
    const created = run(
      dir,
      bin,
      ['linear', 'issue', file, 'bug', '--severity', 'major', '--title', 'Widget breaks', '--owner', 'backend'],
      'step one\nstep two',
    );
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /create the Linear issue when the limit allows/);
    const body = readFileSync(file, 'utf8');
    assert.match(body, /- \[ \] Widget breaks \(major\)/);
    assert.match(body, /- \[ \] \[backend\] Fix: Widget breaks/);
    assert.match(body, /### Deferred Linear/);
    assert.match(body, /step one step two/);
    const called = orcaLog(log);
    assert.match(called, /create/);
    assert.match(called, /Bug: Widget breaks/);
    assert.match(called, /--parent JSO-1/);
    assert.match(called, /--label Bug/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
